"""gateway.py — KDS local-first order intake: mint id/code, outbox, hi-lo blocks, sync state."""
import json
import logging
import random
import sqlite3
import ssl
import threading
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

log = logging.getLogger("gateway")

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

_MENU_MAP = None

def _load_menu_map():
    global _MENU_MAP
    if _MENU_MAP is not None:
        return _MENU_MAP
    _MENU_MAP = {
        "trà sữa oolong": "DR028",
        "cà phê muối": "DR005",
    }
    import os
    menu_file = os.path.join(os.path.dirname(__file__), "..", "seed", "menu_items.json")
    if os.path.exists(menu_file):
        try:
            with open(menu_file, "r", encoding="utf-8") as f:
                items = json.load(f)
                for it in items:
                    if it.get("sku") and it.get("name"):
                        _MENU_MAP[it["name"].strip().lower()] = it["sku"]
        except Exception:
            pass
    return _MENU_MAP

def normalize_order_payload(payload: dict) -> dict:
    if not isinstance(payload, dict):
        return payload
    p = dict(payload)
    if not p.get("channel"):
        p["channel"] = "pos"
    items = p.get("items") or []
    mmap = _load_menu_map()
    normalized_items = []
    for item in items:
        if not isinstance(item, dict):
            continue
        it = dict(item)
        if not it.get("sku") and it.get("name"):
            name_key = it["name"].strip().lower()
            resolved = mmap.get(name_key)
            if resolved:
                it["sku"] = resolved
            else:
                it["sku"] = "UNKNOWN"
                log.warning(
                    "unresolved sku for item name=%r order_id=%s idempotency_key=%s — booked as UNKNOWN, not silently mapped to a real SKU",
                    it.get("name"), p.get("order_id") or p.get("gateway_order_id"),
                    p.get("idempotency_key") or (p.get("metadata") or {}).get("idempotency_key"))
        if not it.get("qty"):
            it["qty"] = 1
        normalized_items.append(it)
    p["items"] = normalized_items
    return p

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
        payload = normalize_order_payload(payload)
        key = payload.get("idempotency_key") or (payload.get("metadata") or {}).get("idempotency_key") or ""
        with self._lock:
            if key:
                ex = self._get_by_key_locked(key)
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

    def _get_by_key_locked(self, idempotency_key):
        """Assumes self._lock is already held by the caller (e.g. mint_order)."""
        row = self._conn.execute(
            "SELECT order_id, short_code FROM outbox WHERE op='ingest_order' AND idempotency_key=?",
            (idempotency_key,)).fetchone()
        return dict(row) if row else None

    def get_by_key(self, idempotency_key):
        with self._lock:
            return self._get_by_key_locked(idempotency_key)

    def get_create_payload(self, order_id):
        with self._lock:
            row = self._conn.execute(
                "SELECT payload FROM outbox WHERE op='ingest_order' AND order_id=? LIMIT 1",
                (order_id,)).fetchone()
        return json.loads(row["payload"]) if row else None

    def unsynced(self):
        with self._lock:
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
        err_str = str(err)
        with self._lock:
            # Lấy số lần thử hiện tại
            row = self._conn.execute("SELECT attempts FROM outbox WHERE seq=?", (seq,)).fetchone()
            attempts = (row["attempts"] + 1) if row else 1

            is_fatal = ("Invalid transition" in err_str or
                        "Order not found" in err_str or
                        "unknown_action" in err_str or
                        "required" in err_str or
                        "validation" in err_str or
                        attempts >= 20)

            if is_fatal:
                self._conn.execute(
                    "UPDATE outbox SET attempts=?, last_error=?, synced_at=? WHERE seq=?",
                    (attempts, err_str[:400], "FAILED: " + err_str[:380], seq))
            else:
                self._conn.execute(
                    "UPDATE outbox SET attempts=?, last_error=? WHERE seq=?",
                    (attempts, err_str[:400], seq))
            self._conn.commit()

    def _post_to_gas(self, payload):
        if self._poster:
            return self._poster(payload)
        body = json.dumps({**payload, "token": self.token}).encode()
        req = urllib.request.Request(self.gas_url, data=body,
              headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=25, context=_ssl_ctx()) as r:
            return json.loads(r.read().decode())

    def purge_synced(self, days=7):
        """Xoá row outbox đã sync GAS thành công, cũ hơn `days` ngày. KHÔNG BAO GIỜ đụng
        synced_at IS NULL (chưa lên GAS) hay 'FAILED%' (lỗi vĩnh viễn, giữ để audit).
        Trả số row đã xoá."""
        cutoff = (datetime.now(_VN) - timedelta(days=days)).isoformat()
        with self._lock:
            cur = self._conn.execute(
                "DELETE FROM outbox WHERE synced_at IS NOT NULL AND synced_at NOT LIKE 'FAILED%' "
                "AND synced_at < ?", (cutoff,))
            self._conn.commit()
            return cur.rowcount

    def sync_once(self):
        n = 0
        for op in self.unsynced():
            # Đọc payload + tra action PHẢI nằm trong try. Trước 10/08/2026 hai dòng
            # này nằm ngoài: một dòng outbox hỏng là exception ném thẳng ra
            # _syncer_loop, và vì vòng lặp luôn đọc lại từ dòng cũ nhất, nó chết đi
            # chết lại mỗi 3 giây — TOÀN BỘ hàng đợi tắc, không đơn nào lên Sheets.
            # Đã xảy ra thật: outbox.db bị git tráo dưới chân server đang chạy, sinh
            # 3 dòng rác (op là số nguyên, vi phạm cả NOT NULL của order_id/payload).
            # Dòng hỏng không thể sửa bằng cách thử lại -> park FAILED (giữ để đối
            # soát, xem purge_synced) rồi ĐI TIẾP, không break: các dòng sau vẫn phải
            # được đẩy.
            try:
                payload = json.loads(op["payload"])
                if "action" not in payload:
                    payload["action"] = {"ingest_order": "ingest_order", "status": "update_status",
                                         "mark_paid": "mark_paid"}[op["op"]]
            except Exception as exc:
                self.mark_error(op["seq"],
                                "validation: outbox row hỏng, không dựng được request (%s)" % exc)
                continue
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
