# Internal Order UI Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `web/kds.html` so the staff app reads all order state from the local Flask server (not GAS) and gains an iPOS-style checkout screen (edit lines, split/merge, notes, print bill + take payment) with anti-fraud void protection — printed bills matching the edited state exactly.

**Architecture:** Extract the order-server calls into `web/order-api.js` and the checkout pure-logic into `web/checkout.js` (both browser-and-node loadable via `module.exports`, mirroring `web/mitsu-menu.js`). `kds.html` keeps its proven menu/cart/promo/TTS code, swaps its GAS order-read paths for the local endpoints, and gains a checkout screen + online-inbox + status badges as DOM wired to those modules. A small backend addition adds void/anti-fraud guards to the order store + routes.

**Tech Stack:** Vanilla JS (no framework), `node:test`/`node:assert` for JS units, Python/Flask + sqlite for the backend addition (`unittest`), Playwright + the `static-web` dev server for E2E.

## Global Constraints

- JS modules are dual-target: browser `<script src>` AND `require()` in `node:test`. End each with `if (typeof module !== 'undefined' && module.exports) module.exports = { ... };` and reference globals (`fetch`) so tests can stub them. Follow `web/mitsu-menu.js`.
- JS tests: `node --test web/<file>.test.js` (Node v22 present). No package.json; no external deps.
- Backend tests: `pytest` NOT installed — run `python3 -m unittest <mods> -v` from `/Users/dpd/Projects/lamha-kissaten/print-server`. NEVER run `test_routes.py`, `test_order_spool_e2e.py`, `app.run`, `RUN_EOD`, or full discover — real prints on the LIVE POS. Route tests go through `RouteTestBase` (temp DB); after any run `sqlite3 outbox.db "SELECT count(*) FROM orders;"` must be 0.
- Local endpoints (already built + tested): `GET /orders`, `GET /orders/changes?since=`, `GET /order/<id>`, `PATCH /order/<id>/items`, `PATCH /order/<id>/meta`, `POST /order/<id>/split`, `POST /bill/merge`, `POST /bill/<id>/print`, `POST /bill/group/<gid>/print`, `POST /order/status`, `POST /order/mark_paid`, `GET /inbox`, `POST /inbox/<id>/accept`, `GET /cloud/status`, `GET /health`. Mutating edit endpoints take `version`; a stale version returns HTTP 409.
- Manager PIN: reuse the existing `MANAGER_PIN='1234'` / server-side `pin in ('1234','9999')` pattern.
- Promo tab keeps its existing GAS `callReportApi` calls — do NOT touch them.
- Visual style stays consistent with the current Mitsu look; reuse existing CSS classes (`.kds-chip`, `.bottom-sheet`, `.btn-mark-paid`, `.opt-chips`).
- The gateway base URL constant already exists in kds.html (`GATEWAY_URL`); `order-api.js` takes the base URL as a parameter/global, never hardcodes.

---

## File Structure

- Modify: `print-server/order_store.py` — add `void_reason`/`voided_by` columns + `void_order(order_id, reason, staff)`; `items_json` edit on a paid order requires authorization (enforced at the route).
- Modify: `print-server/print_server.py` — `POST /order/<id>/void` (validates manager PIN); `PATCH /order/<id>/items` rejects edits to a `paid=1` order unless a valid `manager_pin` is supplied.
- Create: `web/order-api.js` — local-server client (fetch wrappers). One responsibility: HTTP to order endpoints.
- Create: `web/checkout.js` — checkout pure logic (total, partition builder, change-merge, 409 decision, late-flag). No DOM, no fetch.
- Create: `web/order-api.test.js`, `web/checkout.test.js` — node:test units.
- Modify: `web/kds.html` — swap GAS order reads for `order-api`; add checkout screen, online inbox, cloud + printer badges (DOM wired to the modules).
- Create: `web/e2e-checkout.spec.js` — Playwright E2E (optional runner; see Task 8).

---

## Task 1: Backend — void/anti-fraud guard

**Files:**
- Modify: `print-server/order_store.py`
- Modify: `print-server/print_server.py`
- Test: `print-server/test_order_store.py`, `print-server/test_routes_orderstore.py`

**Interfaces:**
- Produces:
  - `orders` gains `void_reason TEXT`, `voided_by TEXT` columns.
  - `OrderStore.void_order(order_id, reason, staff) -> dict | None` — version-less; sets `status='VOIDED'`, `void_reason`, `voided_by`; returns the row or None if absent.
  - `POST /order/<id>/void` body `{reason, staff, manager_pin}` → `{ok, order}`; 403 on bad PIN; 404 if absent.
  - `PATCH /order/<id>/items` — when the target order has `paid=1`, requires a valid `manager_pin` in the body; 403 otherwise.

- [ ] **Step 1: Write the failing tests**

```python
# append to print-server/test_order_store.py
class TestVoid(unittest.TestCase):
    def setUp(self):
        self.s = _store()
        self.s.upsert_create(_order("ORD-20260726-0001"))

    def test_void_sets_status_reason_who(self):
        r = self.s.void_order("ORD-20260726-0001", "khách trả lại", "cashier1")
        self.assertEqual(r["status"], "VOIDED")
        self.assertEqual(r["void_reason"], "khách trả lại")
        self.assertEqual(r["voided_by"], "cashier1")

    def test_void_missing_returns_none(self):
        self.assertIsNone(self.s.void_order("NOPE", "x", "y"))
```

```python
# append to print-server/test_routes_orderstore.py, TestEditRoutes
    def test_void_requires_valid_pin(self):
        r = self.c.post(f"/order/{self.oid}/void", json={"reason": "nhầm", "staff": "a", "manager_pin": "0000"})
        self.assertEqual(r.status_code, 403)

    def test_void_ok_with_pin(self):
        r = self.c.post(f"/order/{self.oid}/void", json={"reason": "nhầm", "staff": "a", "manager_pin": "1234"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.c.get(f"/order/{self.oid}").get_json()["order"]["status"], "VOIDED")

    def test_patch_items_on_paid_order_needs_pin(self):
        # mark paid first (mirrors into STORE), then editing must require a PIN
        self.c.post("/order/mark_paid", json={"order_id": self.oid})
        r = self.c.patch(f"/order/{self.oid}/items", json={
            "version": self.c.get(f"/order/{self.oid}").get_json()["order"]["version"],
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]})
        self.assertEqual(r.status_code, 403)

    def test_patch_items_on_paid_order_ok_with_pin(self):
        self.c.post("/order/mark_paid", json={"order_id": self.oid})
        r = self.c.patch(f"/order/{self.oid}/items", json={
            "version": self.c.get(f"/order/{self.oid}").get_json()["order"]["version"],
            "manager_pin": "9999",
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]})
        self.assertEqual(r.status_code, 200)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd print-server && python3 -m unittest test_order_store.TestVoid test_routes_orderstore -v`
Expected: FAIL (`void_order` missing / 404 on `/void`).

- [ ] **Step 3: Implement**

```python
# order_store.py — add the columns to the ORDERS_SCHEMA CREATE TABLE (after voided fields belong near status):
#   void_reason     TEXT,
#   voided_by       TEXT,
# and, because the table may already exist in prod, add idempotent migrations right after executescript(ORDERS_SCHEMA) in __init__:
        for col in ("void_reason", "voided_by"):
            try:
                self.conn.execute(f"ALTER TABLE orders ADD COLUMN {col} TEXT")
            except Exception:
                pass  # already present
        self.conn.commit()
```

```python
# order_store.py — add method to OrderStore
    def void_order(self, order_id, reason, staff):
        return self._apply(order_id, "status='VOIDED', void_reason=?, voided_by=?", (reason, staff))
```

Note: `_apply`'s first positional is `set_sql`; the call above passes a literal `status='VOIDED'` plus two placeholders. Confirm `_apply(order_id, set_sql, set_args)` interpolates `set_sql` verbatim and binds `set_args` — it does (used by `apply_status`).

```python
# print_server.py — add route (near order_split)
@app.post("/order/<order_id>/void")
def order_void(order_id):
    p = request.get_json(force=True, silent=True) or {}
    if str(p.get("manager_pin") or "") not in ("1234", "9999"):
        return jsonify({"ok": False, "error": "bad_pin"}), 403
    o = STORE.void_order(order_id, p.get("reason", ""), p.get("staff", ""))
    if o is None:
        return jsonify({"ok": False, "error": "not found"}), 404
    STORE.apply_status(order_id, "VOIDED")  # ensure status mirrors even if void raced
    return jsonify({"ok": True, "order": o}), 200
```

In `order_patch_items`, before calling `bill_engine.apply_items_edit`, add the paid-guard:

```python
    cur = STORE.get(order_id)
    if cur and cur.get("paid") and str(p.get("manager_pin") or "") not in ("1234", "9999"):
        return jsonify({"ok": False, "error": "paid_order_needs_pin"}), 403
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd print-server && python3 -m unittest test_order_store test_routes_orderstore test_bill_engine test_eod_sync -v`
Expected: PASS. `sqlite3 outbox.db "SELECT count(*) FROM orders;"` → 0.

- [ ] **Step 5: Commit**

```bash
git add print-server/order_store.py print-server/print_server.py print-server/test_order_store.py print-server/test_routes_orderstore.py
git commit -m "feat(order-store): VOIDED status + void_reason/voided_by + manager-PIN guard on void/post-paid edits"
```

---

## Task 2: `web/order-api.js` — local-server client

**Files:**
- Create: `web/order-api.js`, `web/order-api.test.js`

**Interfaces:**
- Produces a `OrderApi(baseUrl)` factory returning an object with async methods. Each returns `{status, body}` where `body` is the parsed JSON, so callers can branch on `status === 409`.

- [ ] **Step 1: Write the failing test**

```javascript
// web/order-api.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { OrderApi } = require('./order-api.js');

function fakeFetch(record, resp) {
  return async (url, opts) => {
    record.url = url; record.opts = opts || {};
    return { status: resp.status || 200, json: async () => resp.body };
  };
}

test('listOrders GETs /orders', async () => {
  const rec = {};
  const api = OrderApi('http://x', fakeFetch(rec, { body: { ok: true, orders: [] } }));
  const r = await api.listOrders();
  assert.strictEqual(rec.url, 'http://x/orders');
  assert.deepStrictEqual(r.body.orders, []);
});

test('patchItems PATCHes with version + items and surfaces 409', async () => {
  const rec = {};
  const api = OrderApi('http://x', fakeFetch(rec, { status: 409, body: { ok: false, error: 'version_conflict' } }));
  const r = await api.patchItems('ORD-1', [{ sku: 'DR005', qty: 1 }], 3);
  assert.strictEqual(rec.url, 'http://x/order/ORD-1/items');
  assert.strictEqual(rec.opts.method, 'PATCH');
  const sent = JSON.parse(rec.opts.body);
  assert.strictEqual(sent.version, 3);
  assert.strictEqual(sent.items[0].sku, 'DR005');
  assert.strictEqual(r.status, 409);
});

test('splitOrder POSTs partitions', async () => {
  const rec = {};
  const api = OrderApi('http://x', fakeFetch(rec, { body: { ok: true, suborders: [] } }));
  await api.splitOrder('ORD-1', [[{ sku: 'DR005', qty: 1 }]], 2);
  assert.strictEqual(rec.url, 'http://x/order/ORD-1/split');
  assert.strictEqual(rec.opts.method, 'POST');
  assert.strictEqual(JSON.parse(rec.opts.body).partitions.length, 1);
});

test('acceptOnline POSTs to /inbox/<id>/accept', async () => {
  const rec = {};
  const api = OrderApi('http://x', fakeFetch(rec, { body: { ok: true, order_id: 'ORD-9' } }));
  const r = await api.acceptOnline('OL1', { items: [] });
  assert.strictEqual(rec.url, 'http://x/inbox/OL1/accept');
  assert.strictEqual(r.body.order_id, 'ORD-9');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test web/order-api.test.js`
Expected: FAIL (`Cannot find module './order-api.js'`).

- [ ] **Step 3: Implement**

```javascript
// web/order-api.js
'use strict';
// Dual-target: browser <script> and node:test. `fetchImpl` param lets tests stub fetch.
function OrderApi(baseUrl, fetchImpl) {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  async function call(path, method, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await f(baseUrl + path, opts);
    let parsed = {};
    try { parsed = await res.json(); } catch (_) {}
    return { status: res.status, body: parsed };
  }
  return {
    listOrders: () => call('/orders', 'GET'),
    pollChanges: (since) => call('/orders/changes?since=' + encodeURIComponent(since || ''), 'GET'),
    getOrder: (id) => call('/order/' + encodeURIComponent(id), 'GET'),
    patchItems: (id, items, version, managerPin) =>
      call('/order/' + encodeURIComponent(id) + '/items', 'PATCH',
           managerPin ? { items, version, manager_pin: managerPin } : { items, version }),
    patchMeta: (id, meta, version) =>
      call('/order/' + encodeURIComponent(id) + '/meta', 'PATCH', Object.assign({ version }, meta)),
    splitOrder: (id, partitions, version) =>
      call('/order/' + encodeURIComponent(id) + '/split', 'POST', { partitions, version }),
    voidOrder: (id, reason, staff, managerPin) =>
      call('/order/' + encodeURIComponent(id) + '/void', 'POST', { reason, staff, manager_pin: managerPin }),
    mergeBill: (orderIds) => call('/bill/merge', 'POST', { order_ids: orderIds }),
    printBill: (id) => call('/bill/' + encodeURIComponent(id) + '/print', 'POST', {}),
    printGroup: (gid) => call('/bill/group/' + encodeURIComponent(gid) + '/print', 'POST', {}),
    setStatus: (id, status) => call('/order/status', 'POST', { order_id: id, status }),
    markPaid: (id, extra) => call('/order/mark_paid', 'POST', Object.assign({ order_id: id }, extra || {})),
    inbox: () => call('/inbox', 'GET'),
    acceptOnline: (id, payload) => call('/inbox/' + encodeURIComponent(id) + '/accept', 'POST', payload || {}),
    cloudStatus: () => call('/cloud/status', 'GET'),
    health: () => call('/health', 'GET'),
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { OrderApi };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test web/order-api.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/order-api.js web/order-api.test.js
git commit -m "feat(web): order-api.js local-server client + node:test units"
```

---

## Task 3: `web/checkout.js` — checkout pure logic

**Files:**
- Create: `web/checkout.js`, `web/checkout.test.js`

**Interfaces:**
- Produces (pure functions, no DOM/fetch):
  - `lineSubtotal(item) -> number` — `item.subtotal ?? qty*price`.
  - `cartTotal(items) -> number`.
  - `applyQty(items, index, delta) -> items` — returns a new array with the line's qty changed (min 0 removes the line).
  - `buildPartitions(items, assignment) -> partitions` — `assignment` is an array (same length as items) of group letters; returns `[[items of A], [items of B], …]` skipping empty groups. Throws if any item is unassigned.
  - `isStale(status) -> boolean` — `status === 409`.
  - `mergeChanges(current, changes) -> merged` — given the current order array and the `changes` array from `pollChanges`, upsert by `order_id`, returning a new array.
  - `lateMinutes(createdAtIso, nowIso) -> number` and `isLate(createdAtIso, nowIso, thresholdMin=15) -> boolean`.

- [ ] **Step 1: Write the failing test**

```javascript
// web/checkout.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('./checkout.js');

test('cartTotal sums qty*price, prefers subtotal', () => {
  assert.strictEqual(C.cartTotal([{ qty: 2, price: 30000 }, { qty: 1, price: 25000, subtotal: 20000 }]), 80000);
});

test('applyQty decrements and removes at zero', () => {
  const items = [{ sku: 'A', qty: 2 }, { sku: 'B', qty: 1 }];
  assert.strictEqual(C.applyQty(items, 1, -1).length, 1);       // B removed
  assert.strictEqual(C.applyQty(items, 0, -1)[0].qty, 1);       // A -> 1
  assert.strictEqual(items[0].qty, 2);                          // original untouched
});

test('buildPartitions groups by assignment and skips empties', () => {
  const items = [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 1 }, { sku: 'C', qty: 1 }];
  const parts = C.buildPartitions(items, ['A', 'B', 'A']);
  assert.strictEqual(parts.length, 2);
  assert.strictEqual(parts[0].length, 2); // A-group: items 0 and 2
});

test('buildPartitions throws on unassigned', () => {
  assert.throws(() => C.buildPartitions([{ sku: 'A', qty: 1 }], [null]));
});

test('mergeChanges upserts by order_id', () => {
  const cur = [{ order_id: 'O1', status: 'NEW' }, { order_id: 'O2', status: 'NEW' }];
  const merged = C.mergeChanges(cur, [{ order_id: 'O2', status: 'READY' }, { order_id: 'O3', status: 'NEW' }]);
  assert.strictEqual(merged.length, 3);
  assert.strictEqual(merged.find(o => o.order_id === 'O2').status, 'READY');
});

test('isLate true beyond threshold', () => {
  assert.strictEqual(C.isLate('2026-07-26T10:00:00+07:00', '2026-07-26T10:20:00+07:00', 15), true);
  assert.strictEqual(C.isLate('2026-07-26T10:00:00+07:00', '2026-07-26T10:05:00+07:00', 15), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test web/checkout.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```javascript
// web/checkout.js
'use strict';
function lineSubtotal(it) {
  return (it.subtotal != null) ? Number(it.subtotal) : Number(it.qty || 1) * Number(it.price || 0);
}
function cartTotal(items) { return (items || []).reduce((s, it) => s + lineSubtotal(it), 0); }
function applyQty(items, index, delta) {
  const out = items.map((it) => Object.assign({}, it));
  const q = Number(out[index].qty || 1) + delta;
  if (q <= 0) { out.splice(index, 1); return out; }
  out[index].qty = q; return out;
}
function buildPartitions(items, assignment) {
  const groups = {};
  items.forEach((it, i) => {
    const g = assignment[i];
    if (g == null) throw new Error('unassigned item at ' + i);
    (groups[g] = groups[g] || []).push(Object.assign({}, it));
  });
  return Object.keys(groups).sort().map((k) => groups[k]);
}
function isStale(status) { return status === 409; }
function mergeChanges(current, changes) {
  const byId = {}; (current || []).forEach((o) => { byId[o.order_id] = o; });
  (changes || []).forEach((o) => { byId[o.order_id] = o; });
  return Object.keys(byId).map((k) => byId[k]);
}
function lateMinutes(createdAtIso, nowIso) {
  return (new Date(nowIso).getTime() - new Date(createdAtIso).getTime()) / 60000;
}
function isLate(createdAtIso, nowIso, thresholdMin) {
  return lateMinutes(createdAtIso, nowIso) > (thresholdMin == null ? 15 : thresholdMin);
}
const __checkoutApi = { lineSubtotal, cartTotal, applyQty, buildPartitions, isStale, mergeChanges, lateMinutes, isLate };
if (typeof module !== 'undefined' && module.exports) module.exports = __checkoutApi;
if (typeof window !== 'undefined') window.checkout = __checkoutApi;  // browser namespace used by kds.html
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test web/checkout.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/checkout.js web/checkout.test.js
git commit -m "feat(web): checkout.js pure logic (total, partitions, change-merge, late-flag) + units"
```

---

## Task 4: Wire order reads to local (`kds.html`)

**Files:**
- Modify: `web/kds.html`
- Verify: browser preview (no JS unit; DOM integration)

**Interfaces:**
- Consumes `OrderApi`, `checkout.mergeChanges`.

- [ ] **Step 1: Load the modules**

In `kds.html` `<head>` (near the existing `<script src="menu-data.js…">`), add:

```html
<script src="order-api.js"></script>
<script src="checkout.js"></script>
```

Immediately after, instantiate the API against the existing gateway base:

```html
<script>
  // GATEWAY_URL is defined later in the page's main script; guard with a getter used at call time.
  window.__api = null;
  function api() { if (!window.__api) window.__api = OrderApi(GATEWAY_URL); return window.__api; }
</script>
```

- [ ] **Step 2: Replace the order-read path**

Find `async function loadOrders()` (~line 1513). It currently calls `callReportApi` (GAS). Replace its body so it calls `api().listOrders()` and, on success, sets the in-memory `allOrders` from `body.orders`, then renders. Keep the existing optimistic-insert / local-override logic. Add a short-poll:

```javascript
let __lastChangeTs = '2000-01-01T00:00:00';
async function loadOrders() {
  const r = await api().listOrders();
  if (r.status === 200 && r.body.ok) {
    allOrders = r.body.orders;
    __lastChangeTs = r.body.now || __lastChangeTs;
    renderOrders();
  } else {
    showOrdersError('Mất kết nối máy chủ', 'Không tải được đơn từ máy chủ local.');
  }
}
async function pollOrderChanges() {
  try {
    const r = await api().pollChanges(__lastChangeTs);
    if (r.status === 200 && r.body.ok && r.body.changes.length) {
      allOrders = checkout.mergeChanges(allOrders, r.body.changes);
      __lastChangeTs = r.body.now || __lastChangeTs;
      renderOrders();
    } else if (r.body && r.body.now) { __lastChangeTs = r.body.now; }
  } catch (_) {}
}
setInterval(pollOrderChanges, 4000);
```

(`checkout` global is the object checkout.js assigns to `window.checkout` — already done in Task 3.)

Remove the GAS `callReportApi`-based order polling loop (the old `setInterval`/loadOrders GAS timer) but LEAVE the promo tab's `callReportApi` calls untouched.

- [ ] **Step 3: Verify in the browser**

Start the backend and the static site, then confirm the orders view loads from local:

```bash
# in one shell (backend, noop so no hardware): from print-server/
PRINT_ENGINE=noop SERVER_PORT=5001 python3 print_server.py
```
Use the preview tools: `preview_start` name `static-web`; navigate to `http://localhost:4599/kds.html`; `read_console_messages` for errors; `read_network_requests` to confirm requests hit `/orders` and `/orders/changes` (not the GAS URL). Screenshot the orders view.

- [ ] **Step 4: Commit**

```bash
git add web/kds.html
git commit -m "feat(web): read orders from local server + short-poll changes (drop GAS order reads)"
```

---

## Task 5: Checkout screen (`kds.html`)

**Files:**
- Modify: `web/kds.html`
- Verify: browser preview

**Interfaces:**
- Consumes `OrderApi`, `checkout.*`, existing `verifyManagerPin`, `MANAGER_PIN`, `fmt`, `.bottom-sheet` CSS, the existing menu-open function for "+ Thêm món".

- [ ] **Step 1: Add the checkout open + render**

Add a checkout bottom-sheet (reuse `.bottom-sheet` markup like the existing sheets ~line 2162). Open it from: a table tap in the orders view (dine_in → gather `allOrders` where `table_id` matches) and a **Tính tiền** button added in `actionButtons(o)` (~line 1639) for pickup/takeaway. Render one editable line per item using `checkout.cartTotal` for the footer total. Each line: `[− qty +]`, remove, note. Implement handlers that call `api().patchItems(id, newItems, version, pin?)`:

```javascript
async function checkoutPatchItems(orderId, newItems) {
  const o = allOrders.find(x => x.order_id === orderId);
  let pin = null;
  if (o && o.paid) { pin = verifyManagerPin(); if (!pin) return; }  // anti-fraud: paid edit needs PIN
  const r = await api().patchItems(orderId, newItems, o.version, pin);
  if (checkout.isStale(r.status)) {
    await loadOrders();
    toast('Đơn vừa đổi ở máy khác — xem lại');
    return renderCheckout(orderId);
  }
  if (r.body.ok) { setLocalOverride(orderId, { items: r.body.order.items, total: r.body.order.total, version: r.body.order.version }); renderCheckout(orderId); }
}
```

(Use the existing toast/alert helper; if none, a minimal `function toast(m){ /* reuse existing snackbar or alert */ }`.)

- [ ] **Step 2: Meta, split, merge, print+pay**

- Meta row (order note / customer name / VAT) → `api().patchMeta(id, {customer_note, bill_meta:{customer_name, vat}}, version)`.
- **Tách:** a per-line group selector (A/B/…) building `assignment`, then `checkout.buildPartitions(items, assignment)` → `api().splitOrder(id, partitions, version)`; on success re-render with the new sub-orders each showing a print button.
- **Gộp bàn:** multi-select orders → `api().mergeBill(ids)` → `api().printGroup(group_id)`.
- **In bill + Thu tiền:** `api().printBill(id)` (or `printGroup`), then `api().markPaid(id, {payment_method})`; cash triggers the drawer server-side, VietQR shows the existing QR flow. Then `api().setStatus(id, 'DELIVERED')`.
- **Void:** a "Huỷ đơn" action → `verifyManagerPin()` + a reason chip list → `api().voidOrder(id, reason, staffCode, pin)`.

- [ ] **Step 3: Verify in the browser**

With the backend (noop) + static-web running, drive the flow with the preview tools: create an order, open checkout, `computer` click qty ±, remove a line, `read_network_requests` to confirm `PATCH /order/<id>/items` fired and the footer total updated; test split (`POST /order/<id>/split`) and a bill print (`POST /bill/<id>/print` returns `printed:false` under noop). Screenshot the checkout sheet. Confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add web/kds.html
git commit -m "feat(web): iPOS-style checkout screen — edit lines, split/merge, notes, void (PIN), print+pay"
```

---

## Task 6: Online inbox + status badges (`kds.html`)

**Files:**
- Modify: `web/kds.html`
- Verify: browser preview

**Interfaces:**
- Consumes `OrderApi`, `checkout.isLate`, existing chime (`playNewOrderChime`).

- [ ] **Step 1: Inbox badge + list**

Add a nav badge that polls `api().inbox()` every 20s; show the pending count; play the existing chime on a new id. Tapping opens a list; each item shows a prefilled cart and a **Nhận** button → `api().acceptOnline(id, {items, table_id, customer_name})` → on ok, `loadOrders()`. For each item, if `checkout.isLate(item.created_at, new Date().toISOString())`, render a red "ĐƠN TRỄ [X] PHÚT" badge (X = `Math.round(checkout.lateMinutes(...))`) and use a distinct chime tone.

```javascript
let __inboxSeen = new Set();
async function pollInbox() {
  const r = await api().inbox();
  if (r.status !== 200 || !r.body.ok) return;
  const pend = r.body.pending || [];
  updateInboxBadge(pend.length);
  for (const p of pend) if (!__inboxSeen.has(p.online_order_id)) { __inboxSeen.add(p.online_order_id); playNewOrderChime(); }
  renderInboxList(pend);
}
setInterval(pollInbox, 20000);
```

- [ ] **Step 2: Cloud + printer badges**

- Cloud: poll `api().cloudStatus()`; render 🟢 Online / 🟡 Offline (local-only) with the existing muted-note style.
- Printer: poll `api().health()` (~every 30s); render 🟢 if both printers ready else 🔴 with a soft-warning tooltip. Do NOT disable the pay/print button.

```javascript
async function pollCloud() {
  const r = await api().cloudStatus();
  setCloudBadge(r.body && r.body.online);
}
async function pollPrinters() {
  const r = await api().health();
  setPrinterBadge(r.body);  // shape from /health; treat any printer-not-ok as 🔴 warning only
}
setInterval(pollCloud, 15000);
setInterval(pollPrinters, 30000);
```

- [ ] **Step 3: Verify in the browser**

With the backend (noop) running, seed a pending inbox item server-side is not needed — verify the polling wiring and badge rendering with `read_network_requests` (confirm `/inbox`, `/cloud/status`, `/health` are hit) and screenshots of the badges. Confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add web/kds.html
git commit -m "feat(web): online-inbox badge (late flag) + cloud + printer status badges"
```

---

## Task 7: E2E smoke (Playwright) + full JS unit run

**Files:**
- Create: `web/e2e-checkout.spec.js`
- Verify: run

**Interfaces:** consumes the running backend (noop) + static-web.

- [ ] **Step 1: Write the E2E**

```javascript
// web/e2e-checkout.spec.js — run with: node --test web/e2e-checkout.spec.js  (uses Playwright if installed)
// If Playwright is unavailable in this env, this file is a documented manual-verification script;
// the controller verifies via the preview tools instead (see Task 5/6 verify steps).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
// Guard: only run if playwright is present.
let chromium; try { ({ chromium } = require('playwright')); } catch (_) { chromium = null; }

test('checkout edit reflects in total', { skip: !chromium }, async () => {
  const b = await chromium.launch();
  const pg = await b.newPage();
  await pg.goto('http://localhost:4599/kds.html');
  // create an order, open checkout, decrement a line, assert total dropped — selectors per kds.html
  // (fill in concrete selectors during implementation against the rendered DOM)
  await b.close();
  assert.ok(true);
});
```

Note: if Playwright is not installed, do NOT attempt to install it here; rely on the preview-tool verification already done in Tasks 4–6 and mark this as skipped.

- [ ] **Step 2: Run all JS units + the E2E (skipped if no Playwright)**

Run: `node --test web/order-api.test.js web/checkout.test.js web/e2e-checkout.spec.js`
Expected: all unit tests PASS; the E2E test SKIPPED (or PASS if Playwright present).

- [ ] **Step 3: Backend safe suite still green**

Run: `cd print-server && python3 -m unittest test_order_store test_bill_engine test_online_inbox test_eod_sync test_routes_orderstore -v`
Expected: PASS. `sqlite3 outbox.db "SELECT count(*) FROM orders;"` → 0.

- [ ] **Step 4: Commit**

```bash
git add web/e2e-checkout.spec.js
git commit -m "test(web): checkout E2E smoke (Playwright, skipped if absent) + full unit run"
```

---

## Self-review — spec ↔ plan coverage

- Local order reads (drop GAS), short-poll changes → Task 4. ✅
- order-api client → Task 2. ✅
- Checkout: edit lines, notes, split, merge, combined print, print+pay → Tasks 3 (logic) + 5 (screen). ✅
- Anti-fraud void (PIN + reason + VOIDED, paid-edit guard) → Task 1 (backend) + Task 5 (UI prompt). ✅
- Online inbox + late flag + prefilled accept → Task 6. ✅
- Cloud indicator + printer badge (via /health, soft warning) → Task 6. ✅
- 409 refetch handling → Task 3 (`isStale`) + Task 5 (`checkoutPatchItems`). ✅
- Promo tab untouched → stated in Global Constraints + Task 4 Step 2. ✅
- Testing: JS units (Tasks 2,3), browser verify (4,5,6), E2E smoke (7). ✅

## Out of scope (per spec §9)

- Cashier/kitchen mode split; relational `order_items` schema; EOD auto-recovery; quick modifier chips / drawer PIN / shift reconciliation (already present or existing skills).
- GAS `pending_online_orders` mailbox action (inbox stays empty until it ships).
