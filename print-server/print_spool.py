# print-server/print_spool.py
"""print_spool.py — durable per-output print queue (one job = one label or one receipt)."""
import json
from datetime import datetime, timedelta, timezone

_VN = timezone(timedelta(hours=7))

def _now_iso():
    return datetime.now(_VN).isoformat()

_SCHEMA = """
CREATE TABLE IF NOT EXISTS print_spool (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT UNIQUE NOT NULL,
  order_id        TEXT NOT NULL,
  printer         TEXT NOT NULL,
  kind            TEXT NOT NULL,
  seq_in_order    INTEGER NOT NULL,
  total_in_order  INTEGER NOT NULL,
  payload_json    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  gas_marked      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  claimed_at      TEXT,
  last_error      TEXT
);
CREATE INDEX IF NOT EXISTS ix_spool_ready ON print_spool(printer, status, id);
"""

class PrintSpool:
    def __init__(self, conn, lock):
        self._conn = conn
        self._lock = lock
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    def _insert(self, key, order_id, printer, kind, seq, total, payload):
        now = _now_iso()
        cur = self._conn.execute(
            "INSERT OR IGNORE INTO print_spool"
            "(idempotency_key,order_id,printer,kind,seq_in_order,total_in_order,payload_json,"
            " status,created_at,updated_at) VALUES(?,?,?,?,?,?,?, 'pending',?,?)",
            (key, order_id, printer, kind, seq, total, json.dumps(payload), now, now))
        return cur.rowcount

    def enqueue_labels(self, order, cups):
        order_id = order.get("order_id", "")
        total = len(cups)
        order_meta = {k: v for k, v in order.items() if k != "items"}
        inserted = 0
        with self._lock:
            for i, item in enumerate(cups, start=1):
                key = f"{order_id}:label:{i}"
                payload = {"order": order_meta, "item": item, "is_cash": False}
                inserted += self._insert(key, order_id, "label", "label", i, total, payload)
            self._conn.commit()
        return inserted

    def enqueue_receipt(self, order, is_cash):
        order_id = order.get("order_id", "")
        with self._lock:
            key = f"{order_id}:receipt:0"
            payload = {"order": order, "is_cash": bool(is_cash)}
            n = self._insert(key, order_id, "receipt", "receipt", 0, 1, payload)
            self._conn.commit()
        return n

    def claim_next(self, printer):
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM print_spool WHERE printer=? AND status='pending' "
                "ORDER BY id LIMIT 1", (printer,)).fetchone()
            if not row:
                return None
            now = _now_iso()
            self._conn.execute(
                "UPDATE print_spool SET status='printing', claimed_at=?, updated_at=? WHERE id=?",
                (now, now, row["id"]))
            self._conn.commit()
            return dict(self._conn.execute("SELECT * FROM print_spool WHERE id=?", (row["id"],)).fetchone())

    def mark_printed(self, job_id):
        with self._lock:
            self._conn.execute("UPDATE print_spool SET status='printed', updated_at=? WHERE id=?",
                               (_now_iso(), job_id))
            self._conn.commit()

    def mark_failed(self, job_id, err):
        with self._lock:
            self._conn.execute("UPDATE print_spool SET status='failed', last_error=?, updated_at=? WHERE id=?",
                               (str(err)[:400], _now_iso(), job_id))
            self._conn.commit()

    def requeue(self, job_id, err):
        with self._lock:
            row = self._conn.execute("SELECT attempts, max_attempts FROM print_spool WHERE id=?",
                                     (job_id,)).fetchone()
            if row is None:
                return
            attempts = (row["attempts"] or 0) + 1
            now = _now_iso()
            if attempts >= (row["max_attempts"] or 5):
                self._conn.execute(
                    "UPDATE print_spool SET status='failed', attempts=?, last_error=?, updated_at=? WHERE id=?",
                    (attempts, str(err)[:400], now, job_id))
            else:
                self._conn.execute(
                    "UPDATE print_spool SET status='pending', attempts=?, last_error=?, claimed_at=NULL, updated_at=? WHERE id=?",
                    (attempts, str(err)[:400], now, job_id))
            self._conn.commit()

    def recover_orphans(self, printer, older_than_s=30):
        cutoff = (datetime.now(_VN) - timedelta(seconds=older_than_s)).isoformat()
        with self._lock:
            cur = self._conn.execute(
                "UPDATE print_spool SET status='pending', claimed_at=NULL, updated_at=? "
                "WHERE printer=? AND status='printing' AND claimed_at IS NOT NULL AND claimed_at < ?",
                (_now_iso(), printer, cutoff))
            self._conn.commit()
            return cur.rowcount

    def order_kind_all_printed(self, order_id, kind):
        with self._lock:
            rows = self._conn.execute(
                "SELECT status, COUNT(*) c FROM print_spool WHERE order_id=? AND kind=? GROUP BY status",
                (order_id, kind)).fetchall()
        by = {r["status"]: r["c"] for r in rows}
        if not by:
            return False
        if by.get("pending", 0) or by.get("printing", 0):
            return False
        return by.get("printed", 0) > 0

    def set_gas_marked(self, order_id, kind):
        with self._lock:
            self._conn.execute(
                "UPDATE print_spool SET gas_marked=1, updated_at=? "
                "WHERE order_id=? AND kind=? AND status='printed'",
                (_now_iso(), order_id, kind))
            self._conn.commit()

    def pending_gas_marks(self):
        with self._lock:
            rows = self._conn.execute(
                "SELECT DISTINCT order_id, kind FROM print_spool "
                "WHERE status='printed' AND gas_marked=0 ORDER BY order_id, kind").fetchall()
            candidates = [(r["order_id"], r["kind"]) for r in rows]
        out = []
        for order_id, kind in candidates:
            if self.order_kind_all_printed(order_id, kind):
                out.append({"order_id": order_id, "kind": kind})
        return out

    def stats(self, printer):
        with self._lock:
            rows = self._conn.execute(
                "SELECT status, COUNT(*) c FROM print_spool WHERE printer=? "
                "AND status IN ('pending','printing','failed') GROUP BY status", (printer,)).fetchall()
        out = {"pending": 0, "printing": 0, "failed": 0}
        for r in rows:
            out[r["status"]] = r["c"]
        return out
