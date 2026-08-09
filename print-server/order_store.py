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
  void_reason     TEXT,
  voided_by       TEXT,
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
            for col in ("void_reason", "voided_by"):
                try:
                    conn.execute(f"ALTER TABLE orders ADD COLUMN {col} TEXT")
                except Exception:
                    pass  # already present
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

    def list_orders(self, since_date=None):
        q = "SELECT * FROM orders"
        args = ()
        if since_date:
            q += " WHERE created_at LIKE ?"
            args = (since_date[:4] + "-" + since_date[4:6] + "-" + since_date[6:8] + "%",)
        q += " ORDER BY updated_at DESC"
        with self.lock:
            rows = self.conn.execute(q, args).fetchall()
        return [_row_to_dict(r) for r in rows]

    def changes_since(self, ts):
        with self.lock:
            rows = self.conn.execute(
                "SELECT * FROM orders WHERE updated_at > ? ORDER BY updated_at ASC",
                (ts,)).fetchall()
        return [_row_to_dict(r) for r in rows]

    def _bump(self, order_id, expected_version, set_sql, set_args):
        """Apply an optimistic-locked UPDATE that also bumps version + updated_at."""
        now = _now_iso()
        with self.lock:
            cur = self.conn.execute(
                f"UPDATE orders SET {set_sql}, version=version+1, updated_at=? "
                "WHERE order_id=? AND version=?",
                (*set_args, now, order_id, expected_version))
            if cur.rowcount == 0:
                self.conn.rollback()
                raise VersionConflict(f"{order_id} version != {expected_version}")
            self.conn.commit()
        return self.get(order_id)

    def set_status(self, order_id, status, expected_version):
        return self._bump(order_id, expected_version, "status=?", (status,))

    def set_paid(self, order_id, paid, expected_version):
        return self._bump(order_id, expected_version, "paid=?", (1 if paid else 0,))

    def set_items(self, order_id, items, expected_version):
        return self._bump(
            order_id, expected_version,
            "items_json=?, total=?",
            (json.dumps(items, ensure_ascii=False), compute_total(items)))

    def set_meta(self, order_id, customer_note, bill_meta, expected_version):
        return self._bump(
            order_id, expected_version,
            "customer_note=?, bill_meta_json=?",
            (customer_note or "", json.dumps(bill_meta or {}, ensure_ascii=False)))

    def split_atomic(self, order_id, suborders, expected_version):
        """Insert every sub-order and flip the origin to SPLIT in ONE transaction.
        Rejects (no writes) if the origin version is stale or any sub-order id
        already exists — prevents orphan sub-orders from a partial split."""
        now = _now_iso()
        with self.lock:
            row = self.conn.execute(
                "SELECT version FROM orders WHERE order_id=?", (order_id,)).fetchone()
            if row is None:
                raise KeyError(order_id)
            if row["version"] != expected_version:
                raise VersionConflict(f"{order_id} version != {expected_version}")
            for sub in suborders:
                if self.conn.execute("SELECT 1 FROM orders WHERE order_id=? LIMIT 1",
                                     (sub["order_id"],)).fetchone():
                    raise ValueError(f"sub-order id already exists: {sub['order_id']}")
            try:
                for sub in suborders:
                    items = sub.get("items", [])
                    self.conn.execute(
                        "INSERT INTO orders(order_id, parent_order_id, short_code, delivery_type, "
                        "table_id, status, paid, source, items_json, customer_note, bill_meta_json, "
                        "total, version, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)",
                        (sub["order_id"], sub.get("parent_order_id"), sub.get("short_code", ""),
                         sub.get("delivery_type", "dine_in"), sub.get("table_id", ""), "NEW", 0,
                         sub.get("source", "staff"), json.dumps(items, ensure_ascii=False),
                         sub.get("customer_note", ""),
                         json.dumps(sub.get("bill_meta", {}), ensure_ascii=False),
                         int(sub.get("total") or compute_total(items)), now, now))
                self.conn.execute(
                    "UPDATE orders SET status='SPLIT', version=version+1, updated_at=? WHERE order_id=?",
                    (now, order_id))
                self.conn.commit()
            except Exception:
                self.conn.rollback()
                raise
        return [self.get(s["order_id"]) for s in suborders]

    def set_bill_group(self, order_ids, group_id):
        """Tag whole orders with a shared bill_group_id (groups them for a combined bill).
        Atomic: any missing order_id rolls back the whole batch instead of leaving a
        partial (and silently under-billed) merge."""
        now = _now_iso()
        with self.lock:
            try:
                for oid in order_ids:
                    cur = self.conn.execute(
                        "UPDATE orders SET bill_group_id=?, version=version+1, updated_at=? "
                        "WHERE order_id=?", (group_id, now, oid))
                    if cur.rowcount == 0:
                        raise KeyError(oid)
                self.conn.commit()
            except Exception:
                self.conn.rollback()
                raise
        return [self.get(o) for o in order_ids]

    def get_bill_group(self, group_id):
        with self.lock:
            rows = self.conn.execute(
                "SELECT * FROM orders WHERE bill_group_id=? ORDER BY created_at ASC",
                (group_id,)).fetchall()
        return [_row_to_dict(r) for r in rows]

    def _apply(self, order_id, set_sql, set_args):
        """Version-LESS best-effort mirror of an authoritative KDS action.
        Bumps version + updated_at. No-op (returns None) if the order isn't here."""
        now = _now_iso()
        with self.lock:
            cur = self.conn.execute(
                f"UPDATE orders SET {set_sql}, version=version+1, updated_at=? WHERE order_id=?",
                (*set_args, now, order_id))
            self.conn.commit()
            if cur.rowcount == 0:
                return None
        return self.get(order_id)

    def apply_status(self, order_id, status):
        return self._apply(order_id, "status=?", (status,))

    def apply_paid(self, order_id, paid=True):
        return self._apply(order_id, "paid=?", (1 if paid else 0,))

    def void_order(self, order_id, reason, staff):
        return self._apply(order_id, "status='VOIDED', void_reason=?, voided_by=?", (reason, staff))

    def reject_order(self, order_id, reason, staff="kds"):
        """Từ chối đơn online. Dùng CANCELLED chứ KHÔNG dùng void_order():
        void_order set status='VOIDED', mà VOIDED nằm ngoài VALID_STATUS của GAS
        lẫn bộ lọc unsynced_finalized (paid=1 OR status='CANCELLED') — đơn sẽ kẹt
        lại local, không lên Sheets. Hai cột void_reason/voided_by thì tái dùng được."""
        return self._apply(order_id, "status='CANCELLED', void_reason=?, voided_by=?",
                           (reason, staff))

    def unsynced_finalized(self):
        """Return finalized-but-unsynced orders (paid=1 or CANCELLED, synced_at IS NULL),
        ordered by created_at ascending."""
        with self.lock:
            rows = self.conn.execute(
                "SELECT * FROM orders WHERE synced_at IS NULL AND (paid=1 OR status='CANCELLED') "
                "ORDER BY created_at ASC").fetchall()
        return [_row_to_dict(r) for r in rows]

    def mark_synced(self, order_id):
        """Mark an order as synced (sets synced_at to now)."""
        with self.lock:
            self.conn.execute("UPDATE orders SET synced_at=? WHERE order_id=?",
                              (_now_iso(), order_id))
            self.conn.commit()
