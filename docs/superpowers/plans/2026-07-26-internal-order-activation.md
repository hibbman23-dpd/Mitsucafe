# Internal Order GAS-Free — Activation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the GAS-free order backend actually function end-to-end: the materialized `orders` table reflects real PAID/CANCELLED state, the end-of-day sync credits loyalty stamps + revenue correctly, merged bills print as one combined receipt, and the spool print path is test-covered.

**Architecture:** Close the four activation gaps the final whole-branch review found on top of the completed backend primitives (`order_store.py`, `bill_engine.py`, `eod_sync.py`, routes in `print_server.py`). The daytime authority stays local Flask + SQLite; GAS stays the online mailbox + EOD archive. EOD now mirrors the proven two-op pattern (`ingest_order` then `mark_paid`/`update_status`) the live gateway already uses.

**Tech Stack:** Python 3, Flask, sqlite3 (WAL), `unittest` (pytest is NOT installed — run everything with `python3 -m unittest`).

## Global Constraints

- **Test runner:** `pytest` is not installed. Run `python3 -m unittest <modules> -v` from `/Users/dpd/Projects/lamha-kissaten/print-server`.
- **NEVER run hardware suites on this live POS Mac Mini:** do NOT run `test_routes.py`, `test_order_spool_e2e.py`, `app.run`, `RUN_EOD=1`, or a bare `python3 -m pytest`/discover — they fire real prints / cash-drawer kicks / real GAS posts. The hardware-safe suite is exactly: `test_order_store test_bill_engine test_online_inbox test_eod_sync test_routes_orderstore`.
- **Production DB safety:** the module-level `STORE`/`SPOOL` bind at import to the real `outbox.db`. Every route test MUST go through `RouteTestBase` (rebinds GATEWAY/STORE/INBOX — and, after Task 4, SPOOL — to a temp DB). After any route-test run, `sqlite3 outbox.db "SELECT count(*) FROM orders;"` must be 0. Do NOT modify `outbox.db`.
- **GAS contract (verified in `gas/Code.gs` + `gas/Orders.gs`):**
  - Action `ingest_order` → `ingestPreMintedOrder` — creates the sheet row with `status='CONFIRMED'`; does NOT credit stamps or revenue.
  - Action `mark_paid` → `markOrderPaid(order_id, {skipReceipt: !!p.receipt_printed_local})` — credits loyalty stamps + runs `computeDailyMetrics`; idempotent (returns `already_paid` if already PAID); requires the row to already exist. `receipt_printed_local:true` prevents a reprint.
  - Action `update_status` → `updateOrderStatus(order_id, status)`.
  - Therefore EOD must send TWO ops per finalized order: `ingest_order` first, then `mark_paid` (PAID) or `update_status` CANCELLED.
- **`paid` vs `status`:** `orders.status` holds the fulfillment state machine (NEW/CONFIRMED/MAKING/READY/DELIVERING/DELIVERED/CANCELLED). Payment is the separate `paid` integer flag. "Finalized" for EOD = `paid=1 OR status='CANCELLED'`. There is no `status='PAID'`.
- **Version semantics:** edit routes (`/order/*/items`, `/meta`, `/split`, merge) stay version-locked. The authoritative KDS status/pay actions (`/order/status`, `/order/mark_paid`) mirror into STORE **version-lessly** (best-effort, no 409) — they are the source of truth, not concurrent edits, and the order may not exist in STORE (remote/legacy orders) in which case the mirror is a silent no-op.
- Vietnamese inline comments are normal; identifiers snake_case English. TZ helper `_VN = timezone(timedelta(hours=7))`.

---

## File Structure

- Modify: `print-server/order_store.py` — add `apply_status`, `apply_paid` (version-less mirrors); fix `unsynced_finalized` predicate; add `get_bill_group`.
- Modify: `print-server/eod_sync.py` — add `build_mark_paid_payload`, `build_cancel_status_payload`; add `sync_finalized_2op` (or extend `sync_finalized`) for the two-op push.
- Modify: `print-server/print_server.py` — mirror status/paid into STORE in `/order/status` + `/order/mark_paid`; fix `bill_print` + `_enqueue_cancel_ticket` legacy branch; add `POST /bill/group/<group_id>/print`; update `run_eod_sync` to the two-op flow.
- Modify: `print-server/bill_engine.py` — add `build_group_bill` aggregator.
- Modify: tests `test_order_store.py`, `test_eod_sync.py`, `test_routes_orderstore.py`, `test_bill_engine.py`.

---

## Task 1: C1 — mirror PAID/CANCELLED into the materialized store

**Files:**
- Modify: `print-server/order_store.py`
- Modify: `print-server/print_server.py`
- Test: `print-server/test_order_store.py`, `print-server/test_eod_sync.py`, `print-server/test_routes_orderstore.py`

**Interfaces:**
- Produces:
  - `OrderStore.apply_status(order_id, status) -> dict | None` — version-LESS best-effort UPDATE (bumps version + updated_at); returns the row, or `None` if the order isn't in the store (no raise).
  - `OrderStore.apply_paid(order_id, paid=True) -> dict | None` — same, sets `paid`.
  - `OrderStore.unsynced_finalized()` predicate changed to `synced_at IS NULL AND (paid=1 OR status='CANCELLED')`.

- [ ] **Step 1: Write the failing tests**

```python
# append to print-server/test_order_store.py
class TestApplyMirror(unittest.TestCase):
    def setUp(self):
        self.s = _store()
        self.s.upsert_create(_order("ORD-20260726-0001"))

    def test_apply_status_updates_and_bumps_version(self):
        r = self.s.apply_status("ORD-20260726-0001", "CANCELLED")
        self.assertEqual(r["status"], "CANCELLED")
        self.assertEqual(r["version"], 2)

    def test_apply_status_missing_is_noop_returns_none(self):
        self.assertIsNone(self.s.apply_status("ORD-NOPE", "MAKING"))

    def test_apply_paid_sets_flag(self):
        r = self.s.apply_paid("ORD-20260726-0001", True)
        self.assertEqual(r["paid"], 1)

    def test_unsynced_finalized_matches_paid_flag(self):
        self.s.apply_paid("ORD-20260726-0001", True)
        ids = [o["order_id"] for o in self.s.unsynced_finalized()]
        self.assertEqual(ids, ["ORD-20260726-0001"])

    def test_unsynced_finalized_matches_cancelled_status(self):
        self.s.upsert_create(_order("ORD-20260726-0002", short_code="Q02"))
        self.s.apply_status("ORD-20260726-0002", "CANCELLED")
        ids = [o["order_id"] for o in self.s.unsynced_finalized()]
        self.assertIn("ORD-20260726-0002", ids)

    def test_unsynced_finalized_excludes_plain_confirmed(self):
        self.s.apply_status("ORD-20260726-0001", "CONFIRMED")
        self.assertEqual(self.s.unsynced_finalized(), [])
```

Also FIX the existing Task-9 EOD test helper, which used the now-invalid `status='PAID'` convention. In `print-server/test_eod_sync.py`, change `_finalized` so PAID orders set the `paid` flag (CANCELLED still uses status):

```python
def _finalized(s, oid, status="PAID"):
    s.upsert_create({"order_id": oid, "short_code": "Q01", "delivery_type": "dine_in",
                     "table_id": "B1", "source": "staff",
                     "items": [{"sku": "DR005", "name": "X", "qty": 1, "price": 30000}]})
    if status == "PAID":
        s.apply_paid(oid, True)
    else:
        s.apply_status(oid, status)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd print-server && python3 -m unittest test_order_store.TestApplyMirror -v`
Expected: FAIL with `AttributeError: 'OrderStore' object has no attribute 'apply_status'`.

- [ ] **Step 3: Implement the store methods**

```python
# add to class OrderStore in order_store.py
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
```

Change `unsynced_finalized` (existing method) predicate:

```python
    def unsynced_finalized(self):
        with self.lock:
            rows = self.conn.execute(
                "SELECT * FROM orders WHERE synced_at IS NULL AND (paid=1 OR status='CANCELLED') "
                "ORDER BY created_at ASC").fetchall()
        return [_row_to_dict(r) for r in rows]
```

- [ ] **Step 4: Wire the mirror into the routes**

In `print_server.py`, `order_status` route — after the existing `GATEWAY.enqueue("status", ...)` line, mirror each id into STORE (handles the comma-separated batch form):

```python
    for _oid in (order_id.split(",") if is_batch else [order_id]):
        STORE.apply_status(_oid.strip(), status)
```

In `order_mark_paid` route — after the existing `GATEWAY.enqueue("mark_paid", ...)` line, mirror the paid flag:

```python
    STORE.apply_paid(order_id, True)
```

- [ ] **Step 5: Add a route-level test**

```python
# append to print-server/test_routes_orderstore.py, TestEditRoutes
    def test_mark_paid_mirrors_into_store(self):
        self.c.post("/order/mark_paid", json={"order_id": self.oid})
        self.assertEqual(self.c.get(f"/order/{self.oid}").get_json()["order"]["paid"], 1)

    def test_status_cancel_mirrors_into_store(self):
        self.c.post("/order/status", json={"order_id": self.oid, "status": "CANCELLED"})
        self.assertEqual(self.c.get(f"/order/{self.oid}").get_json()["order"]["status"], "CANCELLED")
```

- [ ] **Step 6: Run the safe suite**

Run: `cd print-server && python3 -m unittest test_order_store test_eod_sync test_routes_orderstore test_bill_engine test_online_inbox -v`
Expected: PASS. Then `sqlite3 outbox.db "SELECT count(*) FROM orders;"` → 0.

- [ ] **Step 7: Commit**

```bash
git add print-server/order_store.py print-server/print_server.py print-server/test_order_store.py print-server/test_eod_sync.py print-server/test_routes_orderstore.py
git commit -m "feat(order-store): mirror KDS status/paid into materialized store + finalized = paid|cancelled"
```

---

## Task 2: C2 — EOD two-op push credits loyalty + revenue

**Files:**
- Modify: `print-server/eod_sync.py`
- Modify: `print-server/print_server.py`
- Test: `print-server/test_eod_sync.py`

**Interfaces:**
- Consumes: `build_gas_payload` (existing), `OrderStore.unsynced_finalized`/`mark_synced`.
- Produces:
  - `eod_sync.build_mark_paid_payload(order) -> dict` = `{action:'mark_paid', order_id, receipt_printed_local:True}`.
  - `eod_sync.build_cancel_status_payload(order) -> dict` = `{action:'update_status', order_id, status:'CANCELLED'}`.
  - `eod_sync.sync_finalized_2op(store, post_fn) -> dict` — per order: post `ingest_order`; then if `order['paid']` post `mark_paid`, elif `status=='CANCELLED'` post `update_status`. Mark synced only if ALL required posts return `{ok:True}`. Returns `{pushed, failed}`.

- [ ] **Step 1: Write the failing test**

```python
# append to print-server/test_eod_sync.py
class TestTwoOpSync(unittest.TestCase):
    def test_paid_order_sends_ingest_then_mark_paid(self):
        s = _store(); _finalized(s, "ORD-1", "PAID")
        seen = []
        res = eod_sync.sync_finalized_2op(s, post_fn=lambda p: (seen.append(p["action"]) or {"ok": True}))
        self.assertEqual(seen, ["ingest_order", "mark_paid"])
        self.assertEqual(res["pushed"], 1)
        self.assertEqual(s.unsynced_finalized(), [])

    def test_cancelled_order_sends_ingest_then_update_status(self):
        s = _store(); _finalized(s, "ORD-2", "CANCELLED")
        seen = []
        eod_sync.sync_finalized_2op(s, post_fn=lambda p: (seen.append((p["action"], p.get("status"))) or {"ok": True}))
        self.assertEqual(seen, [("ingest_order", None), ("update_status", "CANCELLED")])

    def test_second_op_failure_leaves_unsynced(self):
        s = _store(); _finalized(s, "ORD-3", "PAID")
        def post(p):
            return {"ok": p["action"] == "ingest_order"}  # ingest ok, mark_paid fails
        res = eod_sync.sync_finalized_2op(s, post_fn=post)
        self.assertEqual(res["failed"], 1)
        self.assertEqual(len(s.unsynced_finalized()), 1)

    def test_mark_paid_payload_has_receipt_printed_local(self):
        p = eod_sync.build_mark_paid_payload({"order_id": "ORD-1"})
        self.assertEqual(p["action"], "mark_paid")
        self.assertTrue(p["receipt_printed_local"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m unittest test_eod_sync.TestTwoOpSync -v`
Expected: FAIL with `AttributeError: module 'eod_sync' has no attribute 'sync_finalized_2op'`.

- [ ] **Step 3: Implement**

```python
# add to eod_sync.py
def build_mark_paid_payload(order):
    return {"action": "mark_paid", "order_id": order["order_id"],
            "receipt_printed_local": True}


def build_cancel_status_payload(order):
    return {"action": "update_status", "order_id": order["order_id"], "status": "CANCELLED"}


def sync_finalized_2op(store, post_fn):
    """Archive each finalized order with the proven two-op GAS pattern:
    ingest_order (creates row) then mark_paid (credits stamps + revenue) for PAID,
    or update_status CANCELLED. Mark synced only when every required op succeeds."""
    pushed, failed = 0, 0
    for order in store.unsynced_finalized():
        ops = [build_gas_payload(order)]
        if order.get("paid"):
            ops.append(build_mark_paid_payload(order))
        elif order.get("status") == "CANCELLED":
            ops.append(build_cancel_status_payload(order))
        ok = True
        for op in ops:
            try:
                d = post_fn(op)
            except Exception as exc:
                log.error("EOD op %s failed for %s: %s", op.get("action"), order.get("order_id"), exc)
                d = {"ok": False}
            if not (d and d.get("ok")):
                ok = False
                break
        if ok:
            store.mark_synced(order["order_id"])
            pushed += 1
        else:
            failed += 1
    return {"pushed": pushed, "failed": failed}
```

(Ensure `log = logging.getLogger("eod_sync")` exists at module top — it was added in the backend plan's Task 11; if missing, add it.)

- [ ] **Step 4: Point `run_eod_sync` at the two-op flow + drop the stale NOTE**

In `print_server.py`, change `run_eod_sync` to use `sync_finalized_2op`, and REMOVE the multi-line `# NOTE (known gap...)` comment above it (the gap is now closed):

```python
def run_eod_sync():
    """Callable by launchd/cron at ~23:00 and again next morning; idempotent.
    Two-op archive: ingest_order then mark_paid (PAID) / update_status (CANCELLED),
    so GAS credits loyalty stamps + revenue."""
    def post(op):
        return GATEWAY._post_to_gas(op)
    return eod_sync.sync_finalized_2op(STORE, post_fn=post)
```

- [ ] **Step 5: Run the safe suite**

Run: `cd print-server && python3 -m unittest test_eod_sync test_order_store test_routes_orderstore -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add print-server/eod_sync.py print-server/print_server.py print-server/test_eod_sync.py
git commit -m "feat(eod-sync): two-op archive (ingest + mark_paid/update_status) so GAS credits loyalty + revenue"
```

---

## Task 3: I2 + I1 — combined merged-bill print + legacy-engine print branch

**Files:**
- Modify: `print-server/order_store.py`, `print-server/bill_engine.py`, `print-server/print_server.py`
- Test: `print-server/test_bill_engine.py`, `print-server/test_routes_orderstore.py`

**Interfaces:**
- Produces:
  - `OrderStore.get_bill_group(group_id) -> list[dict]` — orders whose `bill_group_id == group_id`, created_at ASC.
  - `bill_engine.build_group_bill(store, group_id) -> dict` — `{group_id, items, total, order_ids}` aggregating every member order's items and summing totals; raises `KeyError` if the group has no members.
  - Route `POST /bill/group/<group_id>/print` → renders the combined bill (noop-guarded). `{ok, printed, order_ids}`.
  - `bill_print` and `_enqueue_cancel_ticket` gain a legacy-engine branch that prints synchronously (mirroring `order_mark_paid`), instead of silently no-opping.

- [ ] **Step 1: Write the failing tests**

```python
# append to print-server/test_bill_engine.py
class TestGroupBill(unittest.TestCase):
    def setUp(self):
        self.s = _store()
        self.s.upsert_create({"order_id": "ORD-A", "short_code": "Q01", "delivery_type": "dine_in",
                              "table_id": "B1", "source": "staff",
                              "items": [{"sku": "DR005", "name": "X", "qty": 1, "price": 30000}]})
        self.s.upsert_create({"order_id": "ORD-B", "short_code": "Q02", "delivery_type": "dine_in",
                              "table_id": "B1", "source": "staff",
                              "items": [{"sku": "DR028", "name": "Y", "qty": 2, "price": 25000}]})
        bill_engine.merge_bill(self.s, ["ORD-A", "ORD-B"])

    def test_build_group_bill_aggregates_items_and_total(self):
        g = "BG-ORD-A"
        bill = bill_engine.build_group_bill(self.s, g)
        self.assertEqual(sorted(bill["order_ids"]), ["ORD-A", "ORD-B"])
        self.assertEqual(len(bill["items"]), 3)  # 1 + 2 line-items
        self.assertEqual(bill["total"], 30000 + 50000)

    def test_build_group_bill_unknown_group_raises(self):
        with self.assertRaises(KeyError):
            bill_engine.build_group_bill(self.s, "BG-NONE")
```

```python
# append to print-server/test_routes_orderstore.py, TestEditRoutes
    def test_group_print_noop(self):
        # merge this order with a second one, then print the group
        oid2 = self.c.post("/order", json={
            "idempotency_key": "g2", "metadata": {"delivery_type": "dine_in"}, "table_id": "B2",
            "items": [{"sku": "DR028", "name": "Y", "qty": 1, "price": 25000}]}).get_json()["order_id"]
        g = self.c.post("/bill/merge", json={"order_ids": [self.oid, oid2]}).get_json()["group_id"]
        r = self.c.post(f"/bill/group/{g}/print")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(sorted(r.get_json()["order_ids"]), sorted([self.oid, oid2]))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd print-server && python3 -m unittest test_bill_engine.TestGroupBill -v`
Expected: FAIL with `AttributeError: module 'bill_engine' has no attribute 'build_group_bill'`.

- [ ] **Step 3: Implement store + aggregator**

```python
# add to class OrderStore in order_store.py
    def get_bill_group(self, group_id):
        with self.lock:
            rows = self.conn.execute(
                "SELECT * FROM orders WHERE bill_group_id=? ORDER BY created_at ASC",
                (group_id,)).fetchall()
        return [_row_to_dict(r) for r in rows]
```

```python
# add to bill_engine.py
def build_group_bill(store, group_id):
    """Aggregate every order in a merged bill_group into one combined bill."""
    members = store.get_bill_group(group_id)
    if not members:
        raise KeyError(group_id)
    items, total, order_ids = [], 0, []
    for o in members:
        items.extend(o["items"])
        total += int(o["total"] or 0)
        order_ids.append(o["order_id"])
    return {"group_id": group_id, "items": items, "total": total, "order_ids": order_ids}
```

- [ ] **Step 4: Add the group-print route + fix the legacy branches**

In `print_server.py`, add the route (near `bill_print`):

```python
@app.post("/bill/group/<group_id>/print")
def bill_group_print(group_id):
    try:
        bill = bill_engine.build_group_bill(STORE, group_id)
    except KeyError:
        return jsonify({"ok": False, "error": "group not found"}), 404
    if _print_engine() == "noop":
        return jsonify({"ok": True, "printed": False, "order_ids": bill["order_ids"]}), 200
    recp = {"order_id": group_id, "items": bill["items"], "total": bill["total"],
            "metadata": {"short_code": group_id, "notes": ""}}
    if _print_engine() == "spool":
        SPOOL.enqueue_receipt(recp, is_cash=False, tag="bill")
    else:  # legacy
        try:
            _print_receipt_bytes(build_receipt(recp, show_total=True), open_drawer=False)
        except Exception as exc:
            log.error("group bill print failed %s: %s", group_id, exc)
    return jsonify({"ok": True, "printed": True, "order_ids": bill["order_ids"]}), 200
```

Fix `bill_print`: replace its noop/spool-only body's tail so the legacy engine prints synchronously instead of returning `printed:True` with nothing enqueued. After the `spool` branch add:

```python
    else:  # legacy
        try:
            _print_receipt_bytes(build_receipt(recp, show_total=True), open_drawer=False)
        except Exception as exc:
            log.error("bill print failed %s: %s", order_id, exc)
```

Fix `_enqueue_cancel_ticket`: it currently returns early when engine is not spool. Add a legacy branch so the cancel ticket still prints:

```python
    if _print_engine() == "spool":
        SPOOL.enqueue_receipt(cancel_order, is_cash=False, tag="cancel")
    elif _print_engine() != "noop":  # legacy
        try:
            _print_receipt_bytes(build_receipt(cancel_order), open_drawer=False)
        except Exception as exc:
            log.error("cancel ticket print failed: %s", exc)
```

- [ ] **Step 5: Run the safe suite**

Run: `cd print-server && python3 -m unittest test_bill_engine test_routes_orderstore test_order_store test_eod_sync -v`
Expected: PASS. `sqlite3 outbox.db "SELECT count(*) FROM orders;"` → 0.

- [ ] **Step 6: Commit**

```bash
git add print-server/order_store.py print-server/bill_engine.py print-server/print_server.py print-server/test_bill_engine.py print-server/test_routes_orderstore.py
git commit -m "feat(bill): combined merged-bill print + legacy-engine print fallback for bill/cancel tickets"
```

---

## Task 4: I5 — rebind SPOOL in tests + cover the spool print path

**Files:**
- Modify: `print-server/test_routes_orderstore.py`
- Test: same file

**Interfaces:**
- Consumes: `RouteTestBase`, `PrintSpool`, `SPOOL`.
- Produces: `RouteTestBase` also rebinds `print_server.SPOOL` to a temp-DB-backed `PrintSpool`; a new test exercises the spool branch of a bill print against the temp DB (asserting a spool row is written, and NEVER touching prod `outbox.db`).

- [ ] **Step 1: Write the failing test**

```python
# append to print-server/test_routes_orderstore.py
class TestSpoolPath(RouteTestBase):
    def setUp(self):
        super().setUp()
        self.oid = self.c.post("/order", json={
            "idempotency_key": "sp1", "metadata": {"delivery_type": "dine_in"}, "table_id": "B9",
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]}).get_json()["order_id"]

    def test_bill_print_spool_writes_to_temp_spool_not_prod(self):
        import os as _os
        prev = _os.environ.get("PRINT_ENGINE")
        _os.environ["PRINT_ENGINE"] = "spool"
        try:
            before = print_server.SPOOL._conn.execute("SELECT count(*) FROM print_spool").fetchone()[0]
            r = self.c.post(f"/bill/{self.oid}/print")
            self.assertTrue(r.get_json()["printed"])
            after = print_server.SPOOL._conn.execute("SELECT count(*) FROM print_spool").fetchone()[0]
            self.assertEqual(after, before + 1)  # enqueued into the TEMP spool
        finally:
            if prev is None:
                _os.environ.pop("PRINT_ENGINE", None)
            else:
                _os.environ["PRINT_ENGINE"] = prev
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m unittest test_routes_orderstore.TestSpoolPath -v`
Expected: FAIL — `print_server.SPOOL` still points at the real `outbox.db` (its `_conn` is not the temp DB), so either the assertion mismatches or it writes to prod. (This proves the gap.)

- [ ] **Step 3: Rebind SPOOL in RouteTestBase**

In `test_routes_orderstore.py`, add the `PrintSpool` import and rebind SPOOL to the temp connection inside `RouteTestBase.setUp` (right after the STORE rebind):

```python
from print_spool import PrintSpool
```
```python
        print_server.SPOOL = PrintSpool(print_server.GATEWAY._conn, print_server.GATEWAY._lock)
```

- [ ] **Step 4: Run the test + confirm no prod pollution**

Run: `cd print-server && python3 -m unittest test_routes_orderstore -v`
Expected: PASS. Then:
`sqlite3 outbox.db "SELECT count(*) FROM orders;"` → 0 AND `sqlite3 outbox.db "SELECT count(*) FROM print_spool;"` unchanged from before the run (the spool row went into the temp DB, not prod).

- [ ] **Step 5: Commit**

```bash
git add print-server/test_routes_orderstore.py
git commit -m "test(routes): rebind SPOOL to temp DB + cover bill-print spool path (no prod pollution)"
```

---

## Spec ↔ Plan coverage (final-review findings)

- C1 — status/paid never mirrored; `orders.status` frozen; finalized predicate wrong → Task 1. ✅
- C2 — EOD `ingest_order` doesn't credit loyalty/revenue → Task 2 (two-op). ✅
- I2 — merge produced no combined bill → Task 3 (`build_group_bill` + group print route). ✅
- I1 — `bill_print`/`_enqueue_cancel_ticket` no-op under legacy engine → Task 3 (legacy branch). ✅
- I5 — SPOOL not rebound; spool path untested → Task 4. ✅

## Out of scope (still deferred / separate)

- Minors carried to their own cleanup: `compute_total` falsy-0, `customer_note` dropped from EOD payload, `_accepted` unbounded, split completeness price check, `_row_to_dict` row_factory assumption.
- GAS `pending_online_orders` mailbox action + `mitsu.cafe` post target (needed before `ONLINE_POLL=1` does anything).
- UI rebuild (`web/kds.html`, iPOS-style) — the separate "Plan 2" that consumes these endpoints.
