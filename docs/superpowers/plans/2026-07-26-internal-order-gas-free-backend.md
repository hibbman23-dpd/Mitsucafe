# Internal Order GAS-Free Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local Flask print-server the daytime source of truth for all order state (create, read, edit, split/merge, finalize) with a materialized `orders` table, so the internal ordering app no longer reads from Google Apps Script during business hours; GAS is demoted to online-order mailbox + end-of-day archive.

**Architecture:** Extend the existing Flask server (`print-server/`). Add a materialized `orders` table (current state per order) alongside the existing append-only `outbox` event log. New focused modules — `order_store.py`, `bill_engine.py`, `online_inbox.py`, `eod_sync.py` — expose functions that new Flask routes call. Every mutation updates the `orders` row (optimistic-locked by `version`) and appends an audit event to `outbox`. The proven print pipeline (`PrintSpool`, `printlib`) and cash-drawer code are reused unchanged.

**Tech Stack:** Python 3, Flask, sqlite3 (WAL mode), `unittest` (existing test convention), the existing `Gateway`/`PrintSpool`/`printlib` modules.

## Global Constraints

- Language of code/comments: match surrounding files (Vietnamese inline comments are normal here). Identifiers stay English/camelCase or snake_case per existing style.
- Time zone: Asia/Ho_Chi_Minh (`_VN = timezone(timedelta(hours=7))`), reuse the existing helper pattern.
- DB file: reuse the existing gateway SQLite DB (`outbox.db` in production) so create + materialize share one connection/transaction. The `orders` table lives in that same DB.
- Concurrency: every SQLite connection used by the order store runs `PRAGMA journal_mode=WAL;` and `PRAGMA busy_timeout=5000;`.
- Optimistic locking: every mutation of an existing order requires the caller's `expected_version`; a stale version raises `VersionConflict` → HTTP 409.
- order_id format: `ORD-YYYYMMDD-XXXX` (existing). Split sub-orders append `-A`, `-B`, … to the origin id.
- Append-only preserved downstream: local `orders` is daytime scratch; EOD pushes append-only into GAS/Sheets (unchanged legacy contract).
- Tests: `unittest`, one temp DB per test via `tempfile.mktemp(suffix=".db")`, torn down in `tearDown`. Run with `python3 -m pytest <file> -v` (pytest runs unittest classes).
- Reuse, don't duplicate: totals, receipt rendering, and print enqueue go through existing `printlib.build_receipt` and `PrintSpool.enqueue_receipt`.

---

## File Structure

- Create: `print-server/order_store.py` — `OrderStore` class: the materialized `orders` table + all state mutations, version locking, WAL. One responsibility: order state persistence.
- Create: `print-server/bill_engine.py` — pure(ish) helpers for editing line items, recomputing totals, deciding when a kitchen cancellation ticket is owed, and splitting/merging. Depends on `OrderStore`. No Flask.
- Create: `print-server/online_inbox.py` — poll the GAS mailbox for `source=online` orders, expose pending list + accept, catch-up on reconnect, connectivity status. No Flask.
- Create: `print-server/eod_sync.py` — select finalized-unsynced orders, push to GAS, mark synced; hourly DB snapshot helper.
- Modify: `print-server/print_server.py` — instantiate `OrderStore` next to `SPOOL`; call `store.upsert_create(...)` inside `order_create`; add routes: `GET /orders`, `GET /orders/changes`, `GET /order/<id>`, `PATCH /order/<id>/items`, `PATCH /order/<id>/meta`, `POST /order/<id>/split`, `POST /bill/merge`, `POST /bill/<id>/print`, `GET /inbox`, `POST /inbox/<id>/accept`, `GET /cloud/status`.
- Create tests: `print-server/test_order_store.py`, `print-server/test_bill_engine.py`, `print-server/test_online_inbox.py`, `print-server/test_eod_sync.py`, and extend route coverage in `print-server/test_routes_orderstore.py`.

---

## Phase 1 — order_store.py: materialized table + core CRUD

### Task 1: OrderStore schema, WAL, and create/get

**Files:**
- Create: `print-server/order_store.py`
- Test: `print-server/test_order_store.py`

**Interfaces:**
- Produces:
  - `class VersionConflict(Exception)`
  - `compute_total(items: list[dict]) -> int`
  - `class OrderStore(conn: sqlite3.Connection, lock: threading.Lock)`
  - `OrderStore.upsert_create(order: dict) -> dict` — inserts a new materialized row from an order dict shaped like `order_create`'s `order` (keys: `order_id`, `short_code`/`metadata.short_code`, `delivery_type`, `table_id`, `source`, `items`, `total`, `customer_note`, `bill_meta`). Returns the stored row as a dict. Idempotent on `order_id` (INSERT OR IGNORE).
  - `OrderStore.get(order_id: str) -> dict | None`

- [ ] **Step 1: Write the failing test**

```python
# print-server/test_order_store.py
import os, sqlite3, tempfile, threading, unittest
from order_store import OrderStore, compute_total, VersionConflict


def _store():
    conn = sqlite3.connect(tempfile.mktemp(suffix=".db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return OrderStore(conn, threading.Lock())


def _order(oid="ORD-20260726-0001", **over):
    o = {
        "order_id": oid,
        "short_code": "Q01",
        "delivery_type": "dine_in",
        "table_id": "B1",
        "source": "staff",
        "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 2, "price": 30000}],
        "customer_note": "",
        "bill_meta": {},
    }
    o.update(over)
    return o


class TestOrderStoreCreate(unittest.TestCase):
    def test_compute_total_uses_price_times_qty(self):
        items = [{"qty": 2, "price": 30000}, {"qty": 1, "price": 25000}]
        self.assertEqual(compute_total(items), 85000)

    def test_compute_total_prefers_explicit_subtotal(self):
        items = [{"qty": 2, "price": 30000, "subtotal": 55000}]
        self.assertEqual(compute_total(items), 55000)

    def test_upsert_create_persists_row(self):
        s = _store()
        row = s.upsert_create(_order())
        self.assertEqual(row["order_id"], "ORD-20260726-0001")
        self.assertEqual(row["status"], "NEW")
        self.assertEqual(row["version"], 1)
        self.assertEqual(row["total"], 60000)
        self.assertEqual(row["source"], "staff")

    def test_get_returns_none_for_missing(self):
        self.assertIsNone(_store().get("nope"))

    def test_upsert_create_is_idempotent(self):
        s = _store()
        s.upsert_create(_order())
        s.upsert_create(_order(short_code="Q99"))  # same id, ignored
        self.assertEqual(s.get("ORD-20260726-0001")["short_code"], "Q01")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m pytest test_order_store.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'order_store'`.

- [ ] **Step 3: Write minimal implementation**

```python
# print-server/order_store.py
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m pytest test_order_store.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add print-server/order_store.py print-server/test_order_store.py
git commit -m "feat(order-store): materialized orders table with create/get + WAL"
```

---

### Task 2: List, changes-feed, status/paid mutations

**Files:**
- Modify: `print-server/order_store.py`
- Test: `print-server/test_order_store.py`

**Interfaces:**
- Consumes: `OrderStore` from Task 1.
- Produces:
  - `OrderStore.list_orders(since_date: str | None = None) -> list[dict]` — all rows (most-recent `updated_at` first). `since_date` (YYYYMMDD) filters by `created_at` prefix when given.
  - `OrderStore.changes_since(ts: str) -> list[dict]` — rows with `updated_at > ts`, ascending; for the LAN short-poll refresh.
  - `OrderStore.set_status(order_id, status, expected_version) -> dict` — bumps version, updates `updated_at`; raises `VersionConflict`.
  - `OrderStore.set_paid(order_id, paid, expected_version) -> dict`

- [ ] **Step 1: Write the failing test**

```python
# append to print-server/test_order_store.py
class TestOrderStoreListAndStatus(unittest.TestCase):
    def setUp(self):
        self.s = _store()
        self.s.upsert_create(_order("ORD-20260726-0001"))
        self.s.upsert_create(_order("ORD-20260726-0002", short_code="Q02"))

    def test_list_orders_returns_all(self):
        self.assertEqual(len(self.s.list_orders()), 2)

    def test_changes_since_returns_only_newer(self):
        row = self.s.get("ORD-20260726-0001")
        ts = row["updated_at"]
        # mutate the second order so its updated_at advances past ts
        import time; time.sleep(0.01)
        self.s.set_status("ORD-20260726-0002", "CONFIRMED", expected_version=1)
        changed = self.s.changes_since(ts)
        ids = [c["order_id"] for c in changed]
        self.assertIn("ORD-20260726-0002", ids)

    def test_set_status_bumps_version(self):
        r = self.s.set_status("ORD-20260726-0001", "CONFIRMED", expected_version=1)
        self.assertEqual(r["status"], "CONFIRMED")
        self.assertEqual(r["version"], 2)

    def test_set_status_stale_version_raises(self):
        with self.assertRaises(VersionConflict):
            self.s.set_status("ORD-20260726-0001", "CONFIRMED", expected_version=99)

    def test_set_paid(self):
        r = self.s.set_paid("ORD-20260726-0001", True, expected_version=1)
        self.assertEqual(r["paid"], 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m pytest test_order_store.py::TestOrderStoreListAndStatus -v`
Expected: FAIL with `AttributeError: 'OrderStore' object has no attribute 'list_orders'`.

- [ ] **Step 3: Write minimal implementation**

```python
# add these methods to class OrderStore in order_store.py

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m pytest test_order_store.py -v`
Expected: PASS (all tests, 10 total).

- [ ] **Step 5: Commit**

```bash
git add print-server/order_store.py print-server/test_order_store.py
git commit -m "feat(order-store): list, changes-feed, version-locked status/paid"
```

---

## Phase 2 — bill_engine.py: edit items + kitchen cancellation

### Task 3: patch_items with total recompute + cancellation detection

**Files:**
- Create: `print-server/bill_engine.py`
- Modify: `print-server/order_store.py` (add `set_items`, `set_meta`)
- Test: `print-server/test_bill_engine.py`, `print-server/test_order_store.py`

**Interfaces:**
- Consumes: `OrderStore`, `compute_total`, `VersionConflict`.
- Produces:
  - `OrderStore.set_items(order_id, items, expected_version) -> dict` — replaces `items_json`, recomputes `total`, version-locked.
  - `OrderStore.set_meta(order_id, customer_note, bill_meta, expected_version) -> dict`
  - `bill_engine.diff_removed_kitchen_lines(old_items, new_items) -> list[dict]` — line items whose quantity dropped (removed or reduced); each result dict has `name`, `sku`, `removed_qty`. Used to decide the cancellation ticket.
  - `bill_engine.apply_items_edit(store, order_id, new_items, expected_version) -> dict` with keys `order` (updated row) and `cancelled_lines` (list from `diff_removed_kitchen_lines`).

- [ ] **Step 1: Write the failing test**

```python
# print-server/test_bill_engine.py
import sqlite3, tempfile, threading, unittest
from order_store import OrderStore
import bill_engine


def _store():
    conn = sqlite3.connect(tempfile.mktemp(suffix=".db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return OrderStore(conn, threading.Lock())


def _seed(s):
    s.upsert_create({
        "order_id": "ORD-20260726-0001", "short_code": "Q01",
        "delivery_type": "dine_in", "table_id": "B1", "source": "staff",
        "items": [
            {"sku": "DR005", "name": "Cà phê muối", "qty": 2, "price": 30000},
            {"sku": "DR028", "name": "Trà sữa oolong", "qty": 1, "price": 25000},
        ],
    })


class TestBillEngine(unittest.TestCase):
    def test_diff_detects_removed_line(self):
        old = [{"sku": "DR005", "name": "Cà phê muối", "qty": 2}]
        new = []
        d = bill_engine.diff_removed_kitchen_lines(old, new)
        self.assertEqual(d[0]["sku"], "DR005")
        self.assertEqual(d[0]["removed_qty"], 2)

    def test_diff_detects_reduced_qty(self):
        old = [{"sku": "DR005", "name": "Cà phê muối", "qty": 2}]
        new = [{"sku": "DR005", "name": "Cà phê muối", "qty": 1}]
        d = bill_engine.diff_removed_kitchen_lines(old, new)
        self.assertEqual(d[0]["removed_qty"], 1)

    def test_diff_ignores_added_or_unchanged(self):
        old = [{"sku": "DR005", "name": "X", "qty": 1}]
        new = [{"sku": "DR005", "name": "X", "qty": 1}, {"sku": "DR028", "name": "Y", "qty": 3}]
        self.assertEqual(bill_engine.diff_removed_kitchen_lines(old, new), [])

    def test_apply_items_edit_recomputes_total_and_reports_cancels(self):
        s = _store(); _seed(s)
        res = bill_engine.apply_items_edit(
            s, "ORD-20260726-0001",
            new_items=[{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}],
            expected_version=1)
        self.assertEqual(res["order"]["total"], 30000)
        cancelled_skus = {c["sku"] for c in res["cancelled_lines"]}
        self.assertEqual(cancelled_skus, {"DR005", "DR028"})  # DR005 reduced, DR028 removed
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m pytest test_bill_engine.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'bill_engine'`.

- [ ] **Step 3: Write minimal implementation**

```python
# add to class OrderStore in order_store.py
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
```

```python
# print-server/bill_engine.py
"""bill_engine.py — order-line editing, kitchen-cancellation detection, split/merge.

Pure helpers over OrderStore. No Flask. The print server's routes call these and
then drive PrintSpool for any tickets/bills that result.
"""


def _line_key(it):
    return it.get("sku") or it.get("name") or ""


def diff_removed_kitchen_lines(old_items, new_items):
    """Lines whose quantity dropped between old and new (removed or reduced).

    Returns [{name, sku, removed_qty}] — the basis for a kitchen cancellation ticket.
    Added lines and quantity increases are ignored.
    """
    new_qty = {}
    for it in new_items or []:
        new_qty[_line_key(it)] = new_qty.get(_line_key(it), 0) + int(it.get("qty", 1))
    removed = []
    seen_old = {}
    for it in old_items or []:
        seen_old[_line_key(it)] = seen_old.get(_line_key(it), 0) + int(it.get("qty", 1))
    for key, oldq in seen_old.items():
        drop = oldq - new_qty.get(key, 0)
        if drop > 0:
            sample = next((i for i in old_items if _line_key(i) == key), {})
            removed.append({"name": sample.get("name", ""), "sku": sample.get("sku", ""),
                            "removed_qty": drop})
    return removed


def apply_items_edit(store, order_id, new_items, expected_version):
    """Persist edited line items and report which kitchen lines were cancelled/reduced."""
    current = store.get(order_id)
    if current is None:
        raise KeyError(order_id)
    cancelled = diff_removed_kitchen_lines(current["items"], new_items)
    updated = store.set_items(order_id, new_items, expected_version)
    return {"order": updated, "cancelled_lines": cancelled}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m pytest test_bill_engine.py test_order_store.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add print-server/bill_engine.py print-server/order_store.py print-server/test_bill_engine.py print-server/test_order_store.py
git commit -m "feat(bill-engine): edit items with total recompute + kitchen-cancel detection"
```

---

## Phase 3 — split (fork) + merge

### Task 4: split_order (forking) and merge_bill

**Files:**
- Modify: `print-server/bill_engine.py`, `print-server/order_store.py`
- Test: `print-server/test_bill_engine.py`

**Interfaces:**
- Consumes: `OrderStore`, Task 3 helpers.
- Produces:
  - `OrderStore.insert_suborder(sub: dict) -> dict` — inserts a forked sub-order row (fields like `upsert_create` plus `parent_order_id`; status starts `NEW`, `version` 1).
  - `bill_engine.split_order(store, order_id, partitions, expected_version) -> list[dict]` — `partitions` is a list of item-lists. Creates `<order_id>-A`, `<order_id>-B`, … sub-orders (one per partition, carrying `parent_order_id`), sets the origin order's status to `SPLIT` (version-locked). Returns the sub-order rows. Guards: partitions non-empty; every origin line accounted for (sum of partition quantities per line == origin quantities) else `ValueError`.
  - `OrderStore.set_bill_group(order_ids: list[str], group_id: str) -> list[dict]` — tags whole orders with a shared `bill_group_id` (each version-locked read-modify not required for merge; use a direct grouped update that also bumps version).
  - `bill_engine.merge_bill(store, order_ids) -> dict` — assigns a new `bill_group_id` (`BG-<origin>`), returns `{group_id, orders}`.

- [ ] **Step 1: Write the failing test**

```python
# append to print-server/test_bill_engine.py
class TestSplitMerge(unittest.TestCase):
    def setUp(self):
        self.s = _store(); _seed(self.s)  # ORD-...0001: DR005 x2, DR028 x1

    def test_split_forks_into_suborders(self):
        subs = bill_engine.split_order(
            self.s, "ORD-20260726-0001",
            partitions=[
                [{"sku": "DR005", "name": "Cà phê muối", "qty": 2, "price": 30000}],
                [{"sku": "DR028", "name": "Trà sữa oolong", "qty": 1, "price": 25000}],
            ],
            expected_version=1)
        ids = sorted(x["order_id"] for x in subs)
        self.assertEqual(ids, ["ORD-20260726-0001-A", "ORD-20260726-0001-B"])
        self.assertEqual(self.s.get("ORD-20260726-0001")["status"], "SPLIT")
        self.assertEqual(self.s.get("ORD-20260726-0001-A")["parent_order_id"], "ORD-20260726-0001")
        self.assertEqual(self.s.get("ORD-20260726-0001-A")["total"], 60000)
        self.assertEqual(self.s.get("ORD-20260726-0001-B")["total"], 25000)

    def test_split_rejects_incomplete_partition(self):
        with self.assertRaises(ValueError):
            bill_engine.split_order(
                self.s, "ORD-20260726-0001",
                partitions=[[{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]],
                expected_version=1)  # leaves DR005 x1 + DR028 x1 unaccounted

    def test_merge_tags_shared_group(self):
        self.s.upsert_create({
            "order_id": "ORD-20260726-0002", "short_code": "Q02",
            "delivery_type": "dine_in", "table_id": "B1", "source": "staff",
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]})
        res = bill_engine.merge_bill(self.s, ["ORD-20260726-0001", "ORD-20260726-0002"])
        g = res["group_id"]
        self.assertEqual(self.s.get("ORD-20260726-0001")["bill_group_id"], g)
        self.assertEqual(self.s.get("ORD-20260726-0002")["bill_group_id"], g)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m pytest test_bill_engine.py::TestSplitMerge -v`
Expected: FAIL with `AttributeError: module 'bill_engine' has no attribute 'split_order'`.

- [ ] **Step 3: Write minimal implementation**

```python
# add to class OrderStore in order_store.py
    def insert_suborder(self, sub):
        oid = sub["order_id"]
        items = sub.get("items", [])
        now = _now_iso()
        with self.lock:
            self.conn.execute(
                "INSERT OR IGNORE INTO orders(order_id, parent_order_id, short_code, "
                "delivery_type, table_id, status, paid, source, items_json, customer_note, "
                "bill_meta_json, total, version, created_at, updated_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)",
                (oid, sub.get("parent_order_id"), sub.get("short_code", ""),
                 sub.get("delivery_type", "dine_in"), sub.get("table_id", ""), "NEW", 0,
                 sub.get("source", "staff"), json.dumps(items, ensure_ascii=False),
                 sub.get("customer_note", ""), json.dumps(sub.get("bill_meta", {}), ensure_ascii=False),
                 int(sub.get("total") or compute_total(items)), now, now))
            self.conn.commit()
        return self.get(oid)

    def set_bill_group(self, order_ids, group_id):
        now = _now_iso()
        with self.lock:
            for oid in order_ids:
                self.conn.execute(
                    "UPDATE orders SET bill_group_id=?, version=version+1, updated_at=? "
                    "WHERE order_id=?", (group_id, now, oid))
            self.conn.commit()
        return [self.get(o) for o in order_ids]
```

```python
# add to bill_engine.py
_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _qty_map(items):
    m = {}
    for it in items or []:
        m[_line_key(it)] = m.get(_line_key(it), 0) + int(it.get("qty", 1))
    return m


def split_order(store, order_id, partitions, expected_version):
    """Fork an order's line items into sub-orders <id>-A, <id>-B, ...

    Every origin line quantity must be fully accounted for across partitions.
    The origin order becomes status SPLIT (version-locked).
    """
    if not partitions:
        raise ValueError("partitions required")
    origin = store.get(order_id)
    if origin is None:
        raise KeyError(order_id)
    origin_qty = _qty_map(origin["items"])
    part_qty = {}
    for part in partitions:
        for key, q in _qty_map(part).items():
            part_qty[key] = part_qty.get(key, 0) + q
    if part_qty != origin_qty:
        raise ValueError(f"partitions do not sum to origin: {part_qty} != {origin_qty}")
    subs = []
    for i, part in enumerate(partitions):
        subs.append(store.insert_suborder({
            "order_id": f"{order_id}-{_LETTERS[i]}",
            "parent_order_id": order_id,
            "short_code": f"{origin.get('short_code','')}{_LETTERS[i]}",
            "delivery_type": origin.get("delivery_type", "dine_in"),
            "table_id": origin.get("table_id", ""),
            "source": origin.get("source", "staff"),
            "items": part,
        }))
    store.set_status(order_id, "SPLIT", expected_version)
    return subs


def merge_bill(store, order_ids):
    """Tag whole orders with one shared bill_group_id for a single combined bill."""
    if len(order_ids) < 2:
        raise ValueError("merge needs >= 2 orders")
    group_id = "BG-" + order_ids[0]
    orders = store.set_bill_group(order_ids, group_id)
    return {"group_id": group_id, "orders": orders}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m pytest test_bill_engine.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add print-server/bill_engine.py print-server/order_store.py print-server/test_bill_engine.py
git commit -m "feat(bill-engine): split via order forking + merge via shared bill group"
```

---

## Phase 4 — Flask routes wiring

### Task 5: wire order_create → store + read routes (list/get/changes)

**Files:**
- Modify: `print-server/print_server.py`
- Test: `print-server/test_routes_orderstore.py`

**Interfaces:**
- Consumes: `OrderStore` (Task 1-2), existing `GATEWAY`, Flask `app`.
- Produces (HTTP):
  - `order_create` also calls `STORE.upsert_create(order_with_source)` after minting.
  - `GET /orders` → `{ok, orders: [...]}` (today's orders).
  - `GET /order/<order_id>` → `{ok, order}` or 404.
  - `GET /orders/changes?since=<iso>` → `{ok, changes: [...], now: <iso>}`.

- [ ] **Step 1: Write the failing test**

```python
# print-server/test_routes_orderstore.py
import os, tempfile, unittest
os.environ["PRINT_ENGINE"] = "noop"  # avoid real printer I/O; see Step 3 note
import print_server


class TestOrderRoutes(unittest.TestCase):
    def setUp(self):
        print_server.app.testing = True
        self.c = print_server.app.test_client()

    def _create(self, idem="r1", table="B1"):
        return self.c.post("/order", json={
            "idempotency_key": idem,
            "metadata": {"delivery_type": "dine_in"},
            "table_id": table,
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 2, "price": 30000}],
        })

    def test_create_then_list_includes_order(self):
        self._create("r1")
        r = self.c.get("/orders")
        self.assertTrue(r.get_json()["ok"])
        ids = [o["order_id"] for o in r.get_json()["orders"]]
        self.assertTrue(any(i for i in ids))

    def test_get_single_order(self):
        oid = self._create("r2").get_json()["order_id"]
        r = self.c.get(f"/order/{oid}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["order"]["order_id"], oid)

    def test_get_missing_order_404(self):
        self.assertEqual(self.c.get("/order/NOPE").status_code, 404)

    def test_changes_since_empty_ts_returns_all(self):
        self._create("r3")
        r = self.c.get("/orders/changes?since=2000-01-01T00:00:00")
        self.assertTrue(len(r.get_json()["changes"]) >= 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m pytest test_routes_orderstore.py -v`
Expected: FAIL — routes `/orders`, `/order/<id>`, `/orders/changes` return 404 (not yet defined).

- [ ] **Step 3: Write minimal implementation**

Note: `print_server.py` selects a print engine via `_print_engine()`. Add a `"noop"` short-circuit so route tests never touch hardware. Find `def _print_engine():` (line ~149) and ensure it honors `PRINT_ENGINE=noop`:

```python
# in print_server.py, adjust _print_engine to support a test noop
def _print_engine():
    eng = os.getenv("PRINT_ENGINE")
    if eng:
        return eng
    # ... existing logic unchanged ...
```

Then in `order_create`, where `is_paid`/spool logic runs, guard printing when engine is `"noop"`:

```python
    if _print_engine() == "noop":
        pass  # tests: skip physical enqueue
    elif _print_engine() == "spool":
        # ... existing spool block ...
```

Instantiate the store next to `SPOOL` (after line ~147 `SPOOL = PrintSpool(...)`):

```python
from order_store import OrderStore, VersionConflict
STORE = OrderStore(GATEWAY._conn, GATEWAY._lock)
```

Populate the store inside `order_create`, right after `order = {...}` is built and before the print block:

```python
    STORE.upsert_create({
        "order_id": order_id,
        "short_code": short_code,
        "delivery_type": order["metadata"]["delivery_type"],
        "table_id": order["table_id"],
        "source": (payload.get("metadata") or {}).get("source", "staff"),
        "items": order["items"],
        "total": order.get("total", 0),
        "paid": is_paid,
        "customer_note": order["metadata"].get("notes", ""),
        "bill_meta": {},
    })
```

Add the read routes (place after `order_lookup`):

```python
@app.get("/orders")
def orders_list():
    from gateway import _today_str
    return jsonify({"ok": True, "orders": STORE.list_orders(since_date=_today_str())}), 200


@app.get("/order/<order_id>")
def order_get(order_id):
    o = STORE.get(order_id)
    if not o:
        return jsonify({"ok": False, "error": "not found"}), 404
    return jsonify({"ok": True, "order": o}), 200


@app.get("/orders/changes")
def orders_changes():
    since = request.args.get("since", "")
    return jsonify({"ok": True, "changes": STORE.changes_since(since),
                    "now": _now_iso_server()}), 200
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m pytest test_routes_orderstore.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add print-server/print_server.py print-server/test_routes_orderstore.py
git commit -m "feat(routes): materialize orders on create + list/get/changes read routes"
```

---

### Task 6: edit/split/merge/print-bill routes with 409 on version conflict

**Files:**
- Modify: `print-server/print_server.py`
- Test: `print-server/test_routes_orderstore.py`

**Interfaces:**
- Consumes: `STORE`, `bill_engine`, `SPOOL`, `printlib.build_receipt`, `VersionConflict`.
- Produces (HTTP):
  - `PATCH /order/<id>/items` body `{items, version}` → `{ok, order, cancelled_lines}`; 409 on stale version. Enqueues a kitchen cancellation ticket when `cancelled_lines` non-empty and engine != noop.
  - `PATCH /order/<id>/meta` body `{customer_note, bill_meta, version}` → `{ok, order}`; 409 on stale.
  - `POST /order/<id>/split` body `{partitions, version}` → `{ok, suborders}`; 400 on bad partition.
  - `POST /bill/merge` body `{order_ids}` → `{ok, group_id, orders}`.
  - `POST /bill/<id>/print` → renders + enqueues the bill for a standalone order, split sub-order, or the printed order's current state; `{ok, printed}`.

- [ ] **Step 1: Write the failing test**

```python
# append to print-server/test_routes_orderstore.py
class TestEditRoutes(unittest.TestCase):
    def setUp(self):
        print_server.app.testing = True
        self.c = print_server.app.test_client()
        self.oid = self.c.post("/order", json={
            "idempotency_key": "e1", "metadata": {"delivery_type": "dine_in"},
            "table_id": "B2",
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 2, "price": 30000},
                      {"sku": "DR028", "name": "Trà sữa oolong", "qty": 1, "price": 25000}],
        }).get_json()["order_id"]

    def _ver(self):
        return self.c.get(f"/order/{self.oid}").get_json()["order"]["version"]

    def test_patch_items_recomputes_and_returns_cancelled(self):
        r = self.c.patch(f"/order/{self.oid}/items", json={
            "version": self._ver(),
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]})
        d = r.get_json()
        self.assertEqual(d["order"]["total"], 30000)
        self.assertTrue(len(d["cancelled_lines"]) >= 1)

    def test_patch_items_stale_version_409(self):
        r = self.c.patch(f"/order/{self.oid}/items", json={
            "version": 999, "items": []})
        self.assertEqual(r.status_code, 409)

    def test_split_route(self):
        r = self.c.post(f"/order/{self.oid}/split", json={
            "version": self._ver(),
            "partitions": [
                [{"sku": "DR005", "name": "Cà phê muối", "qty": 2, "price": 30000}],
                [{"sku": "DR028", "name": "Trà sữa oolong", "qty": 1, "price": 25000}]]})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.get_json()["suborders"]), 2)

    def test_split_bad_partition_400(self):
        r = self.c.post(f"/order/{self.oid}/split", json={
            "version": self._ver(),
            "partitions": [[{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]]})
        self.assertEqual(r.status_code, 400)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m pytest test_routes_orderstore.py::TestEditRoutes -v`
Expected: FAIL — routes return 404/405.

- [ ] **Step 3: Write minimal implementation**

```python
# add to print_server.py (after the read routes)
import bill_engine


def _enqueue_cancel_ticket(order, cancelled_lines):
    """Print a PHIẾU HỦY/ĐIỀU CHỈNH to the bar so staff stop making voided drinks."""
    if not cancelled_lines or _print_engine() == "noop":
        return
    cancel_order = dict(order)
    cancel_order["items"] = [{"name": c["name"], "sku": c["sku"], "qty": c["removed_qty"]}
                             for c in cancelled_lines]
    cancel_order.setdefault("metadata", {})["notes"] = "PHIẾU HỦY/ĐIỀU CHỈNH"
    if _print_engine() == "spool":
        SPOOL.enqueue_receipt(cancel_order, is_cash=False, tag="cancel")


@app.patch("/order/<order_id>/items")
def order_patch_items(order_id):
    p = request.get_json(force=True, silent=True) or {}
    try:
        res = bill_engine.apply_items_edit(
            STORE, order_id, p.get("items", []), int(p.get("version", -1)))
    except VersionConflict:
        return jsonify({"ok": False, "error": "version_conflict"}), 409
    except KeyError:
        return jsonify({"ok": False, "error": "not found"}), 404
    _enqueue_cancel_ticket(res["order"], res["cancelled_lines"])
    return jsonify({"ok": True, "order": res["order"],
                    "cancelled_lines": res["cancelled_lines"]}), 200


@app.patch("/order/<order_id>/meta")
def order_patch_meta(order_id):
    p = request.get_json(force=True, silent=True) or {}
    try:
        o = STORE.set_meta(order_id, p.get("customer_note", ""),
                           p.get("bill_meta", {}), int(p.get("version", -1)))
    except VersionConflict:
        return jsonify({"ok": False, "error": "version_conflict"}), 409
    return jsonify({"ok": True, "order": o}), 200


@app.post("/order/<order_id>/split")
def order_split(order_id):
    p = request.get_json(force=True, silent=True) or {}
    try:
        subs = bill_engine.split_order(
            STORE, order_id, p.get("partitions", []), int(p.get("version", -1)))
    except VersionConflict:
        return jsonify({"ok": False, "error": "version_conflict"}), 409
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except KeyError:
        return jsonify({"ok": False, "error": "not found"}), 404
    return jsonify({"ok": True, "suborders": subs}), 200


@app.post("/bill/merge")
def bill_merge():
    p = request.get_json(force=True, silent=True) or {}
    try:
        res = bill_engine.merge_bill(STORE, p.get("order_ids", []))
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    return jsonify({"ok": True, **res}), 200


@app.post("/bill/<order_id>/print")
def bill_print(order_id):
    o = STORE.get(order_id)
    if not o:
        return jsonify({"ok": False, "error": "not found"}), 404
    if _print_engine() == "noop":
        return jsonify({"ok": True, "printed": False, "engine": "noop"}), 200
    recp = {"order_id": o["order_id"], "items": o["items"], "total": o["total"],
            "metadata": {"short_code": o["short_code"], "notes": o["customer_note"]},
            "table_id": o["table_id"], "bill_meta": o["bill_meta"]}
    if _print_engine() == "spool":
        SPOOL.enqueue_receipt(recp, is_cash=False, tag="bill")
    return jsonify({"ok": True, "printed": True}), 200
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m pytest test_routes_orderstore.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add print-server/print_server.py print-server/test_routes_orderstore.py
git commit -m "feat(routes): edit/split/merge/print-bill with version-conflict 409 + cancel ticket"
```

---

## Phase 5 — online_inbox.py: mitsu.cafe intake

### Task 7: inbox poll, pending list, accept, connectivity

**Files:**
- Create: `print-server/online_inbox.py`
- Test: `print-server/test_online_inbox.py`

**Interfaces:**
- Consumes: `OrderStore`.
- Produces:
  - `class OnlineInbox(store, fetch_fn)` — `fetch_fn() -> list[dict]` returns online-order payloads from the GAS mailbox (injected for tests; production wraps a GAS POST). Each payload has `online_order_id`, `items`, optional `customer_name`, `note`.
  - `OnlineInbox.poll() -> dict` — calls `fetch_fn`; on success stores new payloads in an in-memory pending map keyed by `online_order_id` (dedupe), sets `online=True`; on exception sets `online=False` and leaves pending untouched (catch-up next cycle). Returns `{online, pending_count}`.
  - `OnlineInbox.pending() -> list[dict]`
  - `OnlineInbox.accept(online_order_id, order_dict) -> dict` — removes from pending (idempotent: accepting an unknown/already-accepted id is a no-op returning `{accepted: False}`), returns `{accepted: True}` on first accept.
  - `OnlineInbox.status() -> {online: bool, pending_count: int}`

- [ ] **Step 1: Write the failing test**

```python
# print-server/test_online_inbox.py
import sqlite3, tempfile, threading, unittest
from order_store import OrderStore
from online_inbox import OnlineInbox


def _store():
    conn = sqlite3.connect(tempfile.mktemp(suffix=".db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return OrderStore(conn, threading.Lock())


class TestOnlineInbox(unittest.TestCase):
    def test_poll_populates_pending_and_dedupes(self):
        feed = [[{"online_order_id": "OL1", "items": [{"sku": "DR005", "qty": 1}]}]]
        inbox = OnlineInbox(_store(), fetch_fn=lambda: feed[0])
        self.assertEqual(inbox.poll()["pending_count"], 1)
        self.assertEqual(inbox.poll()["pending_count"], 1)  # same id, no dup
        self.assertTrue(inbox.status()["online"])

    def test_poll_offline_on_exception_keeps_pending(self):
        inbox = OnlineInbox(_store(), fetch_fn=lambda: [{"online_order_id": "OL1", "items": []}])
        inbox.poll()

        def boom():
            raise ConnectionError("no internet")
        inbox.fetch_fn = boom
        st = inbox.poll()
        self.assertFalse(st["online"])
        self.assertEqual(st["pending_count"], 1)  # catch-up: pending retained

    def test_accept_is_idempotent(self):
        inbox = OnlineInbox(_store(), fetch_fn=lambda: [{"online_order_id": "OL1", "items": []}])
        inbox.poll()
        self.assertTrue(inbox.accept("OL1", {})["accepted"])
        self.assertFalse(inbox.accept("OL1", {})["accepted"])  # already accepted
        self.assertEqual(inbox.status()["pending_count"], 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m pytest test_online_inbox.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'online_inbox'`.

- [ ] **Step 3: Write minimal implementation**

```python
# print-server/online_inbox.py
"""online_inbox.py — pull mitsu.cafe orders from the GAS mailbox, hold them for
staff to accept. Internet-outage tolerant: on fetch failure it flags offline and
keeps pending items so the next successful poll catches up. Dedupe by online_order_id.
"""
import threading


class OnlineInbox:
    def __init__(self, store, fetch_fn):
        self.store = store
        self.fetch_fn = fetch_fn
        self._pending = {}          # online_order_id -> payload
        self._accepted = set()      # online_order_ids already accepted (idempotency)
        self._online = False
        self._lock = threading.Lock()

    def poll(self):
        try:
            payloads = self.fetch_fn() or []
            with self._lock:
                self._online = True
                for p in payloads:
                    oid = p.get("online_order_id")
                    if oid and oid not in self._accepted:
                        self._pending.setdefault(oid, p)
        except Exception:
            with self._lock:
                self._online = False
        return self.status()

    def pending(self):
        with self._lock:
            return list(self._pending.values())

    def accept(self, online_order_id, order_dict):
        with self._lock:
            if online_order_id in self._accepted or online_order_id not in self._pending:
                self._accepted.add(online_order_id)
                self._pending.pop(online_order_id, None)
                return {"accepted": False}
            self._pending.pop(online_order_id, None)
            self._accepted.add(online_order_id)
        return {"accepted": True}

    def status(self):
        with self._lock:
            return {"online": self._online, "pending_count": len(self._pending)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m pytest test_online_inbox.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add print-server/online_inbox.py print-server/test_online_inbox.py
git commit -m "feat(online-inbox): poll GAS mailbox, dedupe, offline catch-up, idempotent accept"
```

---

### Task 8: inbox routes + accept-creates-order wiring

**Files:**
- Modify: `print-server/print_server.py`
- Test: `print-server/test_routes_orderstore.py`

**Interfaces:**
- Consumes: `OnlineInbox`, `STORE`, `GATEWAY.mint_order`.
- Produces (HTTP):
  - `GET /inbox` → `{ok, pending: [...], status: {online, pending_count}}`.
  - `POST /inbox/<online_order_id>/accept` body `{items, table_id, customer_name}` → mints a real order (`source=online`), materializes it, marks the inbox entry accepted; returns `{ok, order_id, short_code, accepted}`.
  - `GET /cloud/status` → `{ok, online, pending_count}`.
  - A background poll thread (guarded by `PRINT_ENGINE != noop` and an env flag `ONLINE_POLL=1`) calls `INBOX.poll()` every ~20s. In tests the thread stays off; `INBOX` is constructed with a stub `fetch_fn` returning `[]`.

- [ ] **Step 1: Write the failing test**

```python
# append to print-server/test_routes_orderstore.py
class TestInboxRoutes(unittest.TestCase):
    def setUp(self):
        print_server.app.testing = True
        self.c = print_server.app.test_client()
        # seed one pending online order directly into the shared INBOX
        print_server.INBOX._pending["OLX"] = {"online_order_id": "OLX",
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]}

    def test_inbox_lists_pending(self):
        r = self.c.get("/inbox")
        ids = [p["online_order_id"] for p in r.get_json()["pending"]]
        self.assertIn("OLX", ids)

    def test_accept_creates_order(self):
        r = self.c.post("/inbox/OLX/accept", json={
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}],
            "table_id": "TAKE", "customer_name": "Anh A"})
        d = r.get_json()
        self.assertTrue(d["ok"])
        self.assertTrue(d["order_id"].startswith("ORD-"))
        self.assertEqual(STORE_source_of(d["order_id"]), "online")

    def test_cloud_status(self):
        self.assertIn("online", self.c.get("/cloud/status").get_json())


def STORE_source_of(order_id):
    return print_server.STORE.get(order_id)["source"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m pytest test_routes_orderstore.py::TestInboxRoutes -v`
Expected: FAIL — `AttributeError: module 'print_server' has no attribute 'INBOX'`.

- [ ] **Step 3: Write minimal implementation**

```python
# in print_server.py, after STORE is created
from online_inbox import OnlineInbox


def _gas_fetch_online():
    """Pull pending online orders from GAS mailbox. Returns [] on any failure so the
    inbox flags offline rather than raising into the poll loop's status."""
    d = GATEWAY._post_to_gas({"action": "pending_online_orders"})
    return d.get("orders", []) if isinstance(d, dict) else []


INBOX = OnlineInbox(STORE, fetch_fn=(lambda: []) if os.getenv("PRINT_ENGINE") == "noop"
                    else _gas_fetch_online)


@app.get("/inbox")
def inbox_list():
    return jsonify({"ok": True, "pending": INBOX.pending(), "status": INBOX.status()}), 200


@app.post("/inbox/<online_order_id>/accept")
def inbox_accept(online_order_id):
    p = request.get_json(force=True, silent=True) or {}
    minted = GATEWAY.mint_order({
        "idempotency_key": "online:" + online_order_id,
        "metadata": {"delivery_type": "pickup", "source": "online"},
        "table_id": p.get("table_id", ""),
        "customer_name": p.get("customer_name", ""),
        "items": p.get("items", []),
    })
    order_id, short_code = minted["order_id"], minted["short_code"]
    STORE.upsert_create({
        "order_id": order_id, "short_code": short_code, "delivery_type": "pickup",
        "table_id": p.get("table_id", ""), "source": "online",
        "items": p.get("items", []),
        "bill_meta": {"customer_name": p.get("customer_name", "")},
    })
    res = INBOX.accept(online_order_id, p)
    return jsonify({"ok": True, "order_id": order_id, "short_code": short_code,
                    "accepted": res["accepted"]}), 200


@app.get("/cloud/status")
def cloud_status():
    st = INBOX.status()
    return jsonify({"ok": True, **st}), 200
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m pytest test_routes_orderstore.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add print-server/print_server.py print-server/test_routes_orderstore.py
git commit -m "feat(routes): online-order inbox list/accept + cloud status"
```

---

## Phase 6 — eod_sync.py: finalized archive + snapshot

### Task 9: EOD selection, sync, mark, hourly snapshot

**Files:**
- Create: `print-server/eod_sync.py`
- Modify: `print-server/order_store.py` (add `unsynced_finalized`, `mark_synced`)
- Test: `print-server/test_eod_sync.py`, `print-server/test_order_store.py`

**Interfaces:**
- Consumes: `OrderStore`.
- Produces:
  - `OrderStore.unsynced_finalized() -> list[dict]` — `WHERE synced_at IS NULL AND status IN ('PAID','CANCELLED')`.
  - `OrderStore.mark_synced(order_id) -> None` — sets `synced_at = now`.
  - `eod_sync.sync_finalized(store, post_fn) -> dict` — for each finalized-unsynced order, call `post_fn(order) -> {ok: bool}`; on ok mark synced. Returns `{pushed, failed}`. Time-independent and re-runnable (already-synced rows are excluded).
  - `eod_sync.snapshot_db(db_path, backup_dir) -> str` — copies the SQLite file to `backup_dir/store-YYYYMMDD-HHMM.db`, returns the path.

- [ ] **Step 1: Write the failing test**

```python
# print-server/test_eod_sync.py
import os, sqlite3, tempfile, threading, unittest
from order_store import OrderStore
import eod_sync


def _store():
    conn = sqlite3.connect(tempfile.mktemp(suffix=".db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return OrderStore(conn, threading.Lock())


def _finalized(s, oid, status="PAID"):
    s.upsert_create({"order_id": oid, "short_code": "Q01", "delivery_type": "dine_in",
                     "table_id": "B1", "source": "staff",
                     "items": [{"sku": "DR005", "name": "X", "qty": 1, "price": 30000}]})
    s.set_status(oid, status, expected_version=1)


class TestEodSync(unittest.TestCase):
    def test_unsynced_finalized_excludes_open_orders(self):
        s = _store()
        _finalized(s, "ORD-1", "PAID")
        s.upsert_create({"order_id": "ORD-2", "short_code": "Q02", "delivery_type": "dine_in",
                         "table_id": "B1", "source": "staff", "items": []})  # stays NEW
        ids = [o["order_id"] for o in s.unsynced_finalized()]
        self.assertEqual(ids, ["ORD-1"])

    def test_sync_pushes_and_marks(self):
        s = _store(); _finalized(s, "ORD-1", "PAID")
        pushed = []
        res = eod_sync.sync_finalized(s, post_fn=lambda o: (pushed.append(o["order_id"]) or {"ok": True}))
        self.assertEqual(res["pushed"], 1)
        self.assertEqual(s.unsynced_finalized(), [])  # nothing left
        # re-run is safe: no double push
        res2 = eod_sync.sync_finalized(s, post_fn=lambda o: {"ok": True})
        self.assertEqual(res2["pushed"], 0)

    def test_sync_failure_leaves_unsynced(self):
        s = _store(); _finalized(s, "ORD-1", "PAID")
        res = eod_sync.sync_finalized(s, post_fn=lambda o: {"ok": False})
        self.assertEqual(res["failed"], 1)
        self.assertEqual(len(s.unsynced_finalized()), 1)

    def test_snapshot_copies_file(self):
        s = _store(); _finalized(s, "ORD-1")
        db_path = s.conn.execute("PRAGMA database_list").fetchone()[2]
        outdir = tempfile.mkdtemp()
        path = eod_sync.snapshot_db(db_path, outdir)
        self.assertTrue(os.path.exists(path))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m pytest test_eod_sync.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'eod_sync'`.

- [ ] **Step 3: Write minimal implementation**

```python
# add to class OrderStore in order_store.py
    def unsynced_finalized(self):
        with self.lock:
            rows = self.conn.execute(
                "SELECT * FROM orders WHERE synced_at IS NULL AND status IN ('PAID','CANCELLED') "
                "ORDER BY created_at ASC").fetchall()
        return [_row_to_dict(r) for r in rows]

    def mark_synced(self, order_id):
        with self.lock:
            self.conn.execute("UPDATE orders SET synced_at=? WHERE order_id=?",
                              (_now_iso(), order_id))
            self.conn.commit()
```

```python
# print-server/eod_sync.py
"""eod_sync.py — push finalized (PAID/CANCELLED) orders to GAS for archival, once
finalized. Time-independent: any run picks up all unsynced-finalized rows, so a late
run, an outage, or a crash simply catches up next time. Re-runnable (synced_at gate).
"""
import shutil
from datetime import datetime, timedelta, timezone

_VN = timezone(timedelta(hours=7))


def sync_finalized(store, post_fn):
    pushed, failed = 0, 0
    for order in store.unsynced_finalized():
        try:
            d = post_fn(order)
        except Exception:
            d = {"ok": False}
        if d and d.get("ok"):
            store.mark_synced(order["order_id"])
            pushed += 1
        else:
            failed += 1
    return {"pushed": pushed, "failed": failed}


def snapshot_db(db_path, backup_dir):
    stamp = datetime.now(_VN).strftime("%Y%m%d-%H%M")
    dest = f"{backup_dir.rstrip('/')}/store-{stamp}.db"
    shutil.copy2(db_path, dest)
    return dest
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m pytest test_eod_sync.py test_order_store.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add print-server/eod_sync.py print-server/order_store.py print-server/test_eod_sync.py print-server/test_order_store.py
git commit -m "feat(eod-sync): finalized-order archive push + hourly DB snapshot"
```

---

### Task 10: EOD payload builder (loyalty + Sheets contract) + full-suite green

**Files:**
- Modify: `print-server/eod_sync.py`
- Test: `print-server/test_eod_sync.py`

**Interfaces:**
- Consumes: existing GAS `ingest_order`/`mark_paid` contract (see `gateway.sync_once`).
- Produces:
  - `eod_sync.build_gas_payload(order: dict) -> dict` — maps a materialized order row to the GAS `doPost` action `ingest_order` with `receipt_printed_local=True` (so GAS does not reprint) and `payment_status` reflecting `paid`. Includes `items`, `total`, `short_code`, `table_id`, `customer` fields so GAS credits loyalty stamps by net order value at ingest. Split sub-orders push independently (each its own row).

- [ ] **Step 1: Write the failing test**

```python
# append to print-server/test_eod_sync.py
class TestEodPayload(unittest.TestCase):
    def test_build_gas_payload_shape(self):
        order = {"order_id": "ORD-1", "short_code": "Q01", "table_id": "B1",
                 "items": [{"sku": "DR005", "name": "X", "qty": 1, "price": 30000}],
                 "total": 30000, "paid": 1, "bill_meta": {"customer_name": "A"},
                 "delivery_type": "dine_in"}
        p = eod_sync.build_gas_payload(order)
        self.assertEqual(p["action"], "ingest_order")
        self.assertEqual(p["order_id"], "ORD-1")
        self.assertTrue(p["receipt_printed_local"])
        self.assertEqual(p["payment_status"], "PAID")
        self.assertEqual(p["total"], 30000)
        self.assertEqual(len(p["items"]), 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m pytest test_eod_sync.py::TestEodPayload -v`
Expected: FAIL with `AttributeError: module 'eod_sync' has no attribute 'build_gas_payload'`.

- [ ] **Step 3: Write minimal implementation**

```python
# add to eod_sync.py
def build_gas_payload(order):
    """Map a materialized order row to the GAS ingest_order contract for EOD archive."""
    return {
        "action": "ingest_order",
        "order_id": order["order_id"],
        "gateway_order_id": order["order_id"],
        "gateway_short_code": order.get("short_code", ""),
        "metadata": {"short_code": order.get("short_code", ""),
                     "delivery_type": order.get("delivery_type", "dine_in"),
                     "source": order.get("source", "staff")},
        "table_id": order.get("table_id", ""),
        "customer_name": (order.get("bill_meta") or {}).get("customer_name", ""),
        "items": order.get("items", []),
        "total": order.get("total", 0),
        "payment_status": "PAID" if order.get("paid") else "UNPAID",
        "receipt_printed_local": True,
    }
```

- [ ] **Step 4: Run the full suite**

Run: `cd print-server && python3 -m pytest -q`
Expected: PASS — the pre-existing 81 tests plus all new tests green.

- [ ] **Step 5: Commit**

```bash
git add print-server/eod_sync.py print-server/test_eod_sync.py
git commit -m "feat(eod-sync): GAS ingest payload builder (loyalty credit + no-reprint)"
```

---

## Phase 7 — Operational wiring (non-test, guarded)

### Task 11: background poll + snapshot threads + launchd EOD

**Files:**
- Modify: `print-server/print_server.py`
- Create: `print-server/com.lamha.kissaten.eodsync.plist`

**Interfaces:**
- Consumes: `INBOX.poll`, `eod_sync.snapshot_db`, `eod_sync.sync_finalized`, `eod_sync.build_gas_payload`.

- [ ] **Step 1: Add guarded background threads to print_server.py**

Only start when not in test/noop and explicitly enabled, so the test client never spawns them:

```python
def _start_background_workers():
    if os.getenv("PRINT_ENGINE") == "noop":
        return
    def _poll_loop():
        while True:
            try:
                if os.getenv("ONLINE_POLL", "1") == "1":
                    INBOX.poll()
            except Exception as e:
                log.error("inbox poll error: %s", e)
            time.sleep(int(os.getenv("ONLINE_POLL_SEC", "20")))
    def _snapshot_loop():
        db_path = GATEWAY.db_path
        outdir = os.getenv("BACKUP_DIR", os.path.join(os.path.dirname(__file__), "backups"))
        os.makedirs(outdir, exist_ok=True)
        while True:
            time.sleep(3600)
            try:
                eod_sync.snapshot_db(db_path, outdir)
            except Exception as e:
                log.error("snapshot error: %s", e)
    threading.Thread(target=_poll_loop, daemon=True).start()
    threading.Thread(target=_snapshot_loop, daemon=True).start()
```

Call `_start_background_workers()` at the bottom of the file, inside the same `__main__`/startup path where the server begins listening (before `app.run(...)`).

- [ ] **Step 2: Add an EOD sync entrypoint**

```python
# add near the bottom of print_server.py
def run_eod_sync():
    """Callable by launchd/cron at ~23:00 and again next morning; idempotent."""
    def post(order):
        return GATEWAY._post_to_gas(eod_sync.build_gas_payload(order))
    return eod_sync.sync_finalized(STORE, post_fn=post)


if __name__ == "__main__" and os.getenv("RUN_EOD") == "1":
    import sys
    print(run_eod_sync())
    sys.exit(0)
```

- [ ] **Step 3: Create the launchd plist**

```xml
<!-- print-server/com.lamha.kissaten.eodsync.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.lamha.kissaten.eodsync</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>/Users/dpd/Projects/lamha-kissaten/print-server/print_server.py</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>RUN_EOD</key><string>1</string></dict>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>23</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>30</integer></dict>
  </array>
  <key>StandardOutPath</key><string>/tmp/kissaten-eodsync.log</string>
  <key>StandardErrorPath</key><string>/tmp/kissaten-eodsync.err</string>
</dict>
</plist>
```

The two calendar intervals (23:00 and 07:30) give the "run again next morning" safety: whatever failed at night is retried at open, and the `synced_at` gate makes the retry a no-op for already-archived orders.

- [ ] **Step 4: Verify server still boots and suite is green**

Run: `cd print-server && PRINT_ENGINE=noop python3 -c "import print_server; print('import ok')" && python3 -m pytest -q`
Expected: `import ok` then all tests PASS. (The background threads do not start under `PRINT_ENGINE=noop`.)

- [ ] **Step 5: Commit**

```bash
git add print-server/print_server.py print-server/com.lamha.kissaten.eodsync.plist
git commit -m "feat(ops): guarded inbox-poll + hourly-snapshot threads + launchd EOD entrypoint"
```

---

## Out of scope for this plan (follow-up plans)

- **UI rebuild (`web/kds.html`, iPOS-style):** remove realtime `callReportApi` GAS reads, point reads at `GET /orders` + `GET /orders/changes` short-poll, build the checkout screen (edit/split/merge/notes), online-order inbox surface, and the Cloud Online/Offline indicator. Its own plan once these endpoints are proven in production.
- **GAS-side `pending_online_orders` action + mitsu.cafe post target:** the mailbox endpoint on the GAS side (customer order → mailbox). Small GAS change; separate task.
- **Dynamic VietQR at payment** (deferred per spec §8b).

## Spec ↔ Plan coverage

- Materialized order store, WAL, version locking → Tasks 1-2. ✅
- Edit qty/remove/add + total recompute + kitchen cancel ticket → Tasks 3, 6. ✅
- Split via forking, merge via bill group → Tasks 4, 6. ✅
- Local read path (list/get/changes) replacing GAS reads → Task 5. ✅
- Online inbox: poll, dedupe, catch-up, offline indicator, prefill accept → Tasks 7-8. ✅
- EOD finalized-only, time-independent, loyalty credit, snapshot → Tasks 9-11. ✅
- Reuse print pipeline/drawer unchanged → Tasks 5-6 route through `SPOOL`/`build_receipt`. ✅
