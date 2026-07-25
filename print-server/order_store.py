"""order_store.py — materialized `orders` table: daytime source of truth for order state.

Sits beside the append-only `outbox` event log. Every mutation updates a row here
(optimistic-locked by `version`) and the caller appends an audit event to `outbox`.
"""
import json
import threading
from datetime import datetime, timedelta, timezone

_VN = timezone(timedelta(hours=7))


def _now_iso():
    return datetime.now(_VN).isoformat()


class VersionConflict(Exception):
    """Raised when a mutation carries a stale `expected_version`."""


def compute_total(items):
    """Sum line subtotals. Prefer an explicit per-line `subtotal`, else qty*price."""
    total = 0
    for it in items or []:
        if it.get("subtotal") is not None:
            total += int(it["subtotal"])
        else:
            total += int(it.get("qty", 1)) * int(it.get("price", 0))
    return total


ORDERS_SCHEMA = """
CREATE TABLE IF NOT EXISTS orders (
  order_id        TEXT PRIMARY KEY,
  parent_order_id TEXT,
  short_code      TEXT,
  delivery_type   TEXT,
  table_id        TEXT,
  status          TEXT,
  paid            INTEGER DEFAULT 0,
  source          TEXT,
  items_json      TEXT,
  customer_note   TEXT,
  bill_meta_json  TEXT,
  total           INTEGER,
  bill_group_id   TEXT,
  version         INTEGER DEFAULT 1,
  created_at      TEXT,
  updated_at      TEXT,
  synced_at       TEXT
);
CREATE INDEX IF NOT EXISTS ix_orders_updated ON orders(updated_at);
CREATE INDEX IF NOT EXISTS ix_orders_sync ON orders(synced_at, status);
"""


def _row_to_dict(row):
    if row is None:
        return None
    d = dict(row)
    d["items"] = json.loads(d.pop("items_json") or "[]")
    d["bill_meta"] = json.loads(d.pop("bill_meta_json") or "{}")
    return d


class OrderStore:
    def __init__(self, conn, lock):
        self.conn = conn
        self.lock = lock
        with lock:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA busy_timeout=5000;")
            conn.executescript(ORDERS_SCHEMA)
            conn.commit()

    def upsert_create(self, order):
        oid = order["order_id"]
        items = order.get("items", [])
        short_code = order.get("short_code") or (order.get("metadata") or {}).get("short_code", "")
        now = _now_iso()
        with self.lock:
            self.conn.execute(
                "INSERT OR IGNORE INTO orders(order_id, short_code, delivery_type, table_id, "
                "status, paid, source, items_json, customer_note, bill_meta_json, total, "
                "version, created_at, updated_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?,?)",
                (oid, short_code, order.get("delivery_type", "dine_in"), order.get("table_id", ""),
                 "NEW", 1 if order.get("paid") else 0, order.get("source", "staff"),
                 json.dumps(items, ensure_ascii=False), order.get("customer_note", ""),
                 json.dumps(order.get("bill_meta", {}), ensure_ascii=False),
                 int(order.get("total") or compute_total(items)), now, now))
            self.conn.commit()
        return self.get(oid)

    def get(self, order_id):
        with self.lock:
            row = self.conn.execute(
                "SELECT * FROM orders WHERE order_id=?", (order_id,)).fetchone()
        return _row_to_dict(row)
