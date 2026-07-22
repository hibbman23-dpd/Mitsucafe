"""gateway.py — KDS local-first order intake: mint id/code, outbox, hi-lo blocks, sync state."""
import json
import random
import sqlite3
import ssl
import threading
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

BLOCK_SIZE = 20
_VN = timezone(timedelta(hours=7))

def _today_str():
    return datetime.now(_VN).strftime("%Y%m%d")

def _now_iso():
    return datetime.now(_VN).isoformat()

def _letter_for(dtype):
    return "G" if dtype == "delivery" else ("Q" if dtype == "dine_in" else "M")

def _ssl_ctx():
    # macOS/miniconda Python thiếu CA root → ssl.create_default_context() trần ném
    # CERTIFICATE_VERIFY_FAILED khi gọi Google. Dùng certifi như print_poller._ssl_ctx.
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()

_SCHEMA = """
CREATE TABLE IF NOT EXISTS outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  op TEXT NOT NULL, order_id TEXT NOT NULL, idempotency_key TEXT,
  payload TEXT NOT NULL, short_code TEXT, printed_at TEXT,
  synced_at TEXT, attempts INTEGER DEFAULT 0, last_error TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_outbox_key ON outbox(op, idempotency_key);
CREATE TABLE IF NOT EXISTS code_blocks (
  date TEXT, letter TEXT, next_seq INTEGER, block_to INTEGER, emergency INTEGER DEFAULT 0,
  PRIMARY KEY (date, letter, emergency)
);
"""

class Gateway:
    def __init__(self, db_path, gas_url, token, reserve_fn=None, today=None):
        self.db_path = db_path
        self.gas_url = gas_url
        self.token = token
        self._reserve_fn = reserve_fn or self._reserve_via_gas
        self._today_override = today
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._conn.commit()
        self._poster = None

    @property
    def today(self):
        return self._today_override or _today_str()
    @today.setter
    def today(self, v):
        self._today_override = v

    # ── minting ────────────────────────────────────────────────
    def _gen_order_id(self):
        """order_id duy nhất trong outbox (chống tự trùng). Cross-GAS collision hiếm
        do GAS ingest re-mint khi trùng order_id với idempotency_key khác."""
        for _ in range(50):
            oid = "ORD-%s-%04d" % (self.today, random.randint(1000, 9999))
            if not self._conn.execute(
                    "SELECT 1 FROM outbox WHERE order_id=? LIMIT 1", (oid,)).fetchone():
                return oid
        return "ORD-%s-%04d" % (self.today, random.randint(1000, 9999))

    def _reserve_via_gas(self, dtype, n):
        body = json.dumps({"action": "reserve_codes", "type": dtype, "n": n,
                           "token": self.token}).encode()
        req = urllib.request.Request(self.gas_url, data=body,
              headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=8, context=_ssl_ctx()) as r:
            d = json.loads(r.read().decode())
        if not d.get("ok"):
            raise RuntimeError("reserve failed: %s" % d)
        return d

    def _get_block(self, letter, dtype):
        """Trả (next_seq, block_to, emergency_bool). Xin block mới khi cạn/đổi ngày; offline band khi GAS ném."""
        cur = self._conn.execute(
            "SELECT next_seq, block_to, emergency FROM code_blocks WHERE date=? AND letter=? AND emergency=0",
            (self.today, letter)).fetchone()
        if cur and cur["next_seq"] <= cur["block_to"]:
            return cur["next_seq"], cur["block_to"], False
        try:
            blk = self._reserve_fn(dtype, BLOCK_SIZE)
            self._conn.execute(
                "INSERT OR REPLACE INTO code_blocks(date,letter,next_seq,block_to,emergency) VALUES(?,?,?,?,0)",
                (self.today, letter, blk["from"], blk["to"]))
            self._conn.commit()
            return blk["from"], blk["to"], False
        except Exception:
            row = self._conn.execute(
                "SELECT next_seq FROM code_blocks WHERE date=? AND letter=? AND emergency=1",
                (self.today, letter)).fetchone()
            nxt = (row["next_seq"] if row else 1)
            return nxt, 10**9, True

    def mint_order(self, payload):
        key = payload.get("idempotency_key") or (payload.get("metadata") or {}).get("idempotency_key") or ""
        with self._lock:
            if key:
                ex = self.get_by_key(key)
                if ex:
                    return {"order_id": ex["order_id"], "short_code": ex["short_code"],
                            "idempotency_key": key, "deduped": True}
            dtype = (payload.get("metadata") or {}).get("delivery_type", "dine_in")
            letter = _letter_for(dtype)
            seq, block_to, emergency = self._get_block(letter, dtype)
            if emergency:
                short_code = "%sX%d" % (letter, seq)
                self._conn.execute(
                    "INSERT OR REPLACE INTO code_blocks(date,letter,next_seq,block_to,emergency) VALUES(?,?,?,?,1)",
                    (self.today, letter, seq + 1, 10**9))
            else:
                short_code = "%s%02d" % (letter, seq) if seq < 100 else "%s%d" % (letter, seq)
                self._conn.execute(
                    "UPDATE code_blocks SET next_seq=? WHERE date=? AND letter=? AND emergency=0",
                    (seq + 1, self.today, letter))
            # Ghi outbox record NGAY dưới lock (trước khi in) → get_by_key/dedup atomic,
            # đóng cửa sổ race giữa mint và enqueue (🟠6). printed_at = mint time để poller
            # không in tem lần 2 kể cả khi sync trước lúc in vật lý xong.
            order_id = self._gen_order_id()
            printed_at = _now_iso()
            ing = dict(payload)
            ing["gateway_order_id"] = order_id
            ing["gateway_short_code"] = short_code
            ing["printed_at"] = printed_at
            eff_key = key or order_id
            self._conn.execute(
                "INSERT OR IGNORE INTO outbox(op,order_id,idempotency_key,payload,short_code,printed_at) "
                "VALUES('ingest_order',?,?,?,?,?)",
                (order_id, eff_key, json.dumps(ing), short_code, printed_at))
            self._conn.commit()
            return {"order_id": order_id, "short_code": short_code,
                    "idempotency_key": key, "deduped": False}

    # ── outbox ─────────────────────────────────────────────────
    def enqueue(self, op, order_id, idempotency_key, payload, short_code=None, printed_at=None):
        with self._lock:
            self._conn.execute(
                "INSERT OR IGNORE INTO outbox(op,order_id,idempotency_key,payload,short_code,printed_at) "
                "VALUES(?,?,?,?,?,?)",
                (op, order_id, idempotency_key, json.dumps(payload), short_code, printed_at))
            self._conn.commit()

    def get_by_key(self, idempotency_key):
        row = self._conn.execute(
            "SELECT order_id, short_code FROM outbox WHERE op='ingest_order' AND idempotency_key=?",
            (idempotency_key,)).fetchone()
        return dict(row) if row else None

    def unsynced(self):
        rows = [dict(r) for r in self._conn.execute(
            "SELECT * FROM outbox WHERE synced_at IS NULL ORDER BY seq ASC").fetchall()]
        # Chặn status/mark_paid CHỈ khi order đó có 1 create (ingest_order) CHƯA sync trong outbox.
        # Đơn remote/QR (không có create row ở đây) → không bị chặn, gửi bình thường (🟠7 starvation).
        pending_creates = set(r["order_id"] for r in rows if r["op"] == "ingest_order")
        out = []
        for r in rows:
            if r["op"] != "ingest_order" and r["order_id"] in pending_creates:
                continue  # chờ create của chính order này lên GAS trước
            out.append(r)
        return out

    def mark_synced(self, seq):
        with self._lock:
            self._conn.execute("UPDATE outbox SET synced_at=? WHERE seq=?", (_now_iso(), seq))
            self._conn.commit()

    def mark_error(self, seq, err):
        with self._lock:
            self._conn.execute(
                "UPDATE outbox SET attempts=attempts+1, last_error=? WHERE seq=?", (str(err)[:400], seq))
            self._conn.commit()

    def _post_to_gas(self, payload):
        if self._poster:
            return self._poster(payload)
        body = json.dumps({**payload, "token": self.token}).encode()
        req = urllib.request.Request(self.gas_url, data=body,
              headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=10, context=_ssl_ctx()) as r:
            return json.loads(r.read().decode())

    def sync_once(self):
        n = 0
        for op in self.unsynced():
            payload = json.loads(op["payload"])
            payload["action"] = {"ingest_order": "ingest_order", "status": "update_status",
                                 "mark_paid": "mark_paid"}[op["op"]]
            try:
                d = self._post_to_gas(payload)
                if d.get("ok"):
                    self.mark_synced(op["seq"])
                    n += 1
                else:
                    self.mark_error(op["seq"], d.get("error", "not ok"))
            except Exception as exc:
                self.mark_error(op["seq"], exc)
                break
        return n
