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
