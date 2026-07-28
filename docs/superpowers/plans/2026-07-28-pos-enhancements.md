# POS Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cashier mode, add-item-from-table, off-menu custom label print, batch-close-delivered, and a mobile staff ordering page to the internal POS.

**Architecture:** A/C/E are additions inside `web/kds.html` reusing existing helpers; D adds one backend label-print endpoint plus a small sheet; F is a new lightweight `web/order.html` phone-first ordering page reusing `menu-data.js` + `order-api.js`. No money-path changes — A settles through the existing checkout, E only advances status of already-paid orders, D creates no order.

**Tech Stack:** Vanilla JS, `node:test`, Python/Flask + `unittest`, existing `printlib`/`PrintSpool`/`order-api.js`.

## Global Constraints

- **Test runner:** `pytest` NOT installed — Python via `python3 -m unittest <mods> -v` from `print-server/`; JS via `node --test web/<file>.test.js`.
- **NEVER on this live-POS box:** do NOT run `test_routes.py`, `test_order_spool_e2e.py`, `app.run`, `RUN_EOD`, full discover, or start a server / browser tools during implementation — a live prod server runs on port 5001. Route/label tests go through `RouteTestBase` (temp DB) under `PRINT_ENGINE=noop`; after any run `sqlite3 outbox.db "SELECT count(*) FROM orders;"` must be 0. The controller does browser verification on a spare port.
- **"Owes money" rule (reused everywhere):** an order counts toward a table's unpaid total iff `!isCheckoutOrderPaid(o)` AND `o.status` not in `['CANCELLED','VOIDED','SPLIT','DELIVERED']`. `isCheckoutOrderPaid(o) = !!(o.paid || o.payment_status === 'PAID')` (already defined in kds.html).
- **Tables:** `const TABLE_COUNT = 20` (already in kds.html). Table ids may be `"3"` or `"TABLE_03"` — normalize with `String(x||'').replace(/\D/g,'')` and compare as integers where matching; pass the real order's `table_id` to `openCheckoutTable` so its exact-match works.
- **Print engine:** every print branch must honor `PRINT_ENGINE`: `noop` → no physical output; `spool` → enqueue; else (legacy) → synchronous print. Match the pattern in `order_create`.
- Mitsu visual style; reuse existing CSS classes (`.bottom-sheet`, `.filter-pill`, `.kds-chip`, `.table-tile`).

---

## File Structure

- Modify: `print-server/print_server.py` — add `POST /print/custom_label` route.
- Modify: `web/kds.html` — A cashier mode view; C floor-map ➕ add-item; D custom-label sheet; E batch-close button.
- Create: `web/order.html` — new phone-first staff ordering page.
- Tests: `print-server/test_routes_orderstore.py` (custom_label route), `web/pos-helpers.test.js` (new; pure filters if extracted).

---

## Task 1: Backend — `POST /print/custom_label`

**Files:**
- Modify: `print-server/print_server.py`
- Test: `print-server/test_routes_orderstore.py`

**Interfaces:**
- Produces: `POST /print/custom_label` body `{name, modifiers:{size,ice,sugar}, qty}` → `{ok, printed}`. Prints `qty` cup labels for a synthetic off-menu item. Creates NO order, writes NO order row. Honors `PRINT_ENGINE` (noop→printed:false, spool→enqueue, legacy→synchronous).

- [ ] **Step 1: Write the failing test**

```python
# append to print-server/test_routes_orderstore.py, TestEditRoutes (or a new class using RouteTestBase)
    def test_custom_label_prints_no_order(self):
        before = len(self.c.get("/orders").get_json()["orders"])
        r = self.c.post("/print/custom_label", json={
            "name": "Trà thử nghiệm", "modifiers": {"size": "L", "ice": "less", "sugar": "50"}, "qty": 2})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json()["ok"])
        # under PRINT_ENGINE=noop the route reports printed False and creates no order
        self.assertEqual(len(self.c.get("/orders").get_json()["orders"]), before)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m unittest test_routes_orderstore -v`
Expected: FAIL — `/print/custom_label` returns 404.

- [ ] **Step 3: Implement the route**

Add to `print_server.py` (near the other print routes; `build_order_labels_tspl`, `SPOOL`, `_print_label_bytes`, `_print_engine`, `log` already exist):

```python
@app.post("/print/custom_label")
def print_custom_label():
    """In tem dán ly cho MÓN LẠ ngoài menu — KHÔNG tạo đơn, KHÔNG đụng tiền."""
    p = request.get_json(force=True, silent=True) or {}
    name = (p.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "name required"}), 400
    qty = max(1, int(p.get("qty") or 1))
    item = {"name": name, "sku": "CUSTOM", "qty": 1, "modifiers": p.get("modifiers") or {}}
    cups = [item for _ in range(qty)]
    order = {"order_id": "CUSTOM", "short_code": "", "table_id": "",
             "metadata": {"short_code": "", "delivery_type": "custom", "notes": "TEM MÓN LẺ"},
             "items": cups}
    engine = _print_engine()
    if engine == "noop":
        return jsonify({"ok": True, "printed": False, "engine": "noop"}), 200
    try:
        if engine == "spool":
            SPOOL.enqueue_labels(order, cups)
        else:
            _print_label_bytes(build_order_labels_tspl(order, cups))
    except Exception as exc:
        log.error("custom_label print failed: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 502
    return jsonify({"ok": True, "printed": True}), 200
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m unittest test_routes_orderstore test_order_store test_bill_engine test_eod_sync -v`
Expected: PASS. Then `sqlite3 outbox.db "SELECT count(*) FROM orders;"` → 0.

- [ ] **Step 5: Commit**

```bash
git add print-server/print_server.py print-server/test_routes_orderstore.py
git commit -m "feat(print-server): POST /print/custom_label — off-menu cup label, no order created"
```

---

## Task 2: kds.html — Cashier mode (A) + Batch-close delivered (E)

**Files:**
- Modify: `web/kds.html`
- Verify: browser preview (controller)

**Interfaces:**
- Consumes: `allOrders`, `isCheckoutOrderPaid`, `openCheckoutTable`, `openCheckout`, `api().setStatus`, `fmt`, `switchView`, the existing `ordersViewMode` toggle (`setOrdersMode('list'|'map')`).
- Produces: `renderCashier()`, `batchCloseDelivered()`, and a third mode `'cashier'` on the `setOrdersMode` toggle.

- [ ] **Step 1: Add a "💰 Thu ngân" toggle button + container**

In the `.orders-mode-toggle` block (next to `mode-list`/`mode-map`), add:
```html
    <button class="filter-pill" id="mode-cashier" onclick="setOrdersMode('cashier')">💰 Thu ngân</button>
```
After `#floor-map`, add:
```html
  <div class="cashier-view hidden" id="cashier-view"></div>
```

- [ ] **Step 2: Extend `setOrdersMode` for the cashier mode**

Update `setOrdersMode(m)` so it also toggles the cashier view + button, and renders it:
```javascript
function setOrdersMode(m) {
  ordersViewMode = m;
  document.getElementById('mode-list').classList.toggle('active', m === 'list');
  document.getElementById('mode-map').classList.toggle('active', m === 'map');
  document.getElementById('mode-cashier').classList.toggle('active', m === 'cashier');
  document.getElementById('orders-list').classList.toggle('hidden', m !== 'list');
  document.getElementById('table-filter-bar').classList.toggle('hidden', m !== 'list');
  document.getElementById('floor-map').classList.toggle('hidden', m !== 'map');
  document.getElementById('cashier-view').classList.toggle('hidden', m !== 'cashier');
  if (m === 'map') renderFloorMap();
  if (m === 'cashier') renderCashier();
}
```
And at the end of `renderOrders()`, add `if (ordersViewMode === 'cashier') renderCashier();` next to the existing map refresh line.

- [ ] **Step 3: Implement `renderCashier()` + `batchCloseDelivered()`**

```javascript
function cashierUnpaid() {
  const EX = ['CANCELLED', 'VOIDED', 'SPLIT', 'DELIVERED'];
  const owe = allOrders.filter(o => !EX.includes(o.status) && !isCheckoutOrderPaid(o));
  // gom theo bàn (dine_in) hoặc từng đơn (pickup)
  const groups = new Map();
  owe.forEach(o => {
    const dt = o.delivery_type || (o.table_id ? 'dine_in' : 'pickup');
    const key = (dt === 'dine_in' && o.table_id) ? 'T:' + String(o.table_id).trim() : 'O:' + o.order_id;
    if (!groups.has(key)) groups.set(key, { key, dt, tableId: o.table_id, orders: [] });
    groups.get(key).orders.push(o);
  });
  return [...groups.values()].map(g => ({
    ...g,
    total: g.orders.reduce((s, o) => s + (Number(o.total) || 0), 0),
    count: g.orders.length,
    firstAt: g.orders.reduce((m, o) => (o.created_at && (!m || o.created_at < m)) ? o.created_at : m, ''),
  })).sort((a, b) => (a.firstAt || '').localeCompare(b.firstAt || ''));
}

function renderCashier() {
  const el = document.getElementById('cashier-view');
  const rows = cashierUnpaid();
  const nDone = allOrders.filter(o => isCheckoutOrderPaid(o) &&
    !['DELIVERED', 'CANCELLED', 'VOIDED', 'SPLIT'].includes(o.status)).length;
  const closeBtn = `<button class="btn-mark-paid" style="background:#3f7d4a;color:#fff;padding:10px 16px;border-radius:10px;margin-bottom:12px;"
      onclick="batchCloseDelivered()">✅ Xong hết đơn đã giao${nDone ? ' (' + nDone + ')' : ''}</button>`;
  if (!rows.length) {
    el.innerHTML = closeBtn + '<div class="empty-state"><div class="icon">💰</div>Không có bàn/đơn nào còn nợ tiền.</div>';
    return;
  }
  el.innerHTML = closeBtn + rows.map(g => {
    const label = (g.dt === 'dine_in' && g.tableId)
      ? '🪑 Bàn ' + String(g.tableId).replace(/\D/g, '')
      : '🥡 ' + esc(g.orders[0].short_code || g.orders[0].order_id);
    const onclick = (g.dt === 'dine_in' && g.tableId)
      ? `openCheckoutTable('${esc(g.tableId)}')`
      : `openCheckout('${esc(g.orders[0].order_id)}')`;
    return `<div class="cashier-row" style="display:flex;align-items:center;justify-content:space-between;gap:12px;
        background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:8px;">
        <div><div style="font-weight:800;font-size:1.05rem;color:var(--cream);">${label}</div>
          <div style="color:var(--muted);font-size:.85rem;">${g.count} đơn</div></div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="font-weight:800;font-size:1.15rem;color:var(--cream);">${fmt(g.total)}</div>
          <button class="btn-mark-paid" style="background:#eb624a;color:#fff;padding:10px 18px;border-radius:10px;"
            onclick="${onclick}">💰 Thu tiền</button></div>
      </div>`;
  }).join('');
}

async function batchCloseDelivered() {
  const targets = allOrders.filter(o => isCheckoutOrderPaid(o) &&
    !['DELIVERED', 'CANCELLED', 'VOIDED', 'SPLIT'].includes(o.status));
  if (!targets.length) { alert('Không có đơn đã trả nào cần đóng.'); return; }
  if (!confirm('Đóng ' + targets.length + ' đơn đã trả tiền (đánh dấu đã giao)?')) return;
  let ok = 0, fail = 0;
  for (const o of targets) {
    const r = await api().setStatus(o.order_id, 'DELIVERED');
    if (r.status === 200 && r.body && r.body.ok) { o.status = 'DELIVERED'; ok++; } else fail++;
  }
  alert('Đã đóng ' + ok + ' đơn' + (fail ? ', ' + fail + ' lỗi — thử lại.' : '.'));
  await loadOrders();
}
```

- [ ] **Step 4: Sanity check + commit**

Extract the inline `<script>` and `node --check` it (no browser/server). Confirm `isCheckoutOrderPaid`, `openCheckoutTable`, `openCheckout`, `api`, `fmt`, `esc`, `loadOrders`, `allOrders`, `renderFloorMap` resolve.

```bash
git add web/kds.html
git commit -m "feat(web): cashier mode (unpaid tables + quick pay) + batch-close delivered orders"
```

---

## Task 3: kds.html — Add-item from floor tile (C) + Custom-label sheet (D)

**Files:**
- Modify: `web/kds.html`
- Verify: browser preview (controller)

**Interfaces:**
- Consumes: `renderFloorMap` (busy-tile markup), `switchView`, `selectedTable`, `renderTableGrid`, `api()` (add `printCustomLabel`), `ICE_LABEL`, `SUGAR_LABEL`.
- Produces: an `OrderApi` method `printCustomLabel`, a `➕` control on busy tiles, and a custom-label sheet (`openCustomLabelSheet()`, `printCustomLabelFromSheet()`).

- [ ] **Step 1: Add `printCustomLabel` to `web/order-api.js`**

In the returned object of `OrderApi`, add:
```javascript
    printCustomLabel: (name, modifiers, qty) => call('/print/custom_label', 'POST', { name, modifiers, qty }),
```
(No new test file needed — this mirrors the existing wrappers; `order-api.test.js` already covers the pattern.)

- [ ] **Step 2: Add a ➕ control to the busy floor tile**

In `renderFloorMap`, the busy-tile template, add a corner button that stops propagation so it doesn't trigger the tile's checkout tap:
```javascript
      tiles.push(`
        <div class="table-tile busy" onclick="openCheckoutTable('${esc(orders[0].table_id)}')">
          <button class="tile-add" title="Gọi thêm món"
            onclick="event.stopPropagation(); addRoundToTable(${n});">＋</button>
          <div class="tnum">${numLabel}</div>
          <div class="tstate">● Đang phục vụ</div>
          <div class="tmeta">${orders.length} đơn · ${fmt(sum)}</div>
        </div>`);
```
Add the handler + CSS:
```javascript
function addRoundToTable(n) {
  switchView('menu');
  selectedTable = String(n).padStart(2, '0');
  renderTableGrid();
}
```
```css
.table-tile { position:relative; }
.tile-add { position:absolute; top:6px; right:6px; width:28px; height:28px; border-radius:8px;
  border:none; background:var(--coral); color:#fff; font-size:1.1rem; font-weight:800; cursor:pointer; line-height:1; }
```

- [ ] **Step 3: Add the custom-label sheet**

Add a header button (near the sound/label-print toggles in `.filter-bar`):
```html
    <button class="filter-pill" id="btn-custom-label" onclick="openCustomLabelSheet()">🏷️ Tem lẻ</button>
```
Add the sheet markup (reuse `.overlay-bg`/`.bottom-sheet`, place near the checkout sheet):
```html
<div class="overlay-bg hidden" id="custom-label-overlay" onclick="if(event.target.id==='custom-label-overlay')closeCustomLabelSheet()">
  <div class="bottom-sheet" style="max-width:460px;margin:auto;border-radius:16px;">
    <div class="sheet-head"><div class="sheet-title">🏷️ In tem món lẻ</div>
      <button class="btn-close" onclick="closeCustomLabelSheet()">✕</button></div>
    <div class="sheet-body" style="padding:14px 16px;">
      <input class="form-input" id="cl-name" placeholder="Tên món (gõ tự do)" style="width:100%;margin-bottom:10px;">
      <div class="opt-chips" id="cl-size"></div>
      <div class="opt-chips" id="cl-ice" style="margin-top:8px;"></div>
      <div class="opt-chips" id="cl-sugar" style="margin-top:8px;"></div>
      <div style="display:flex;align-items:center;gap:12px;margin:12px 0;">
        <span>Số lượng</span>
        <button class="btn-sm" onclick="clQty(-1)">－</button>
        <span id="cl-qty" style="font-weight:800;min-width:24px;text-align:center;">1</span>
        <button class="btn-sm" onclick="clQty(1)">＋</button>
      </div>
      <button class="btn-mark-paid" style="width:100%;background:#eb624a;color:#fff;padding:14px;border-radius:12px;"
        onclick="printCustomLabelFromSheet(this)">🖨 In tem</button>
    </div>
  </div>
</div>
```
Add the logic (reuse existing `ICE_LABEL`/`SUGAR_LABEL` maps; sizes are `S/M/L`):
```javascript
let clState = { size: 'M', ice: '', sugar: '', qty: 1 };
function openCustomLabelSheet() {
  clState = { size: 'M', ice: '', sugar: '', qty: 1 };
  document.getElementById('cl-name').value = '';
  document.getElementById('cl-qty').textContent = '1';
  renderClChips();
  document.getElementById('custom-label-overlay').classList.remove('hidden');
}
function closeCustomLabelSheet() { document.getElementById('custom-label-overlay').classList.add('hidden'); }
function clQty(d) { clState.qty = Math.max(1, clState.qty + d); document.getElementById('cl-qty').textContent = clState.qty; }
function renderClChips() {
  const chip = (val, cur, on) => `<button class="kds-chip${val === cur ? ' active' : ''}" onclick="${on}">${val || '—'}</button>`;
  document.getElementById('cl-size').innerHTML = 'Size: ' + ['S', 'M', 'L'].map(s => chip(s, clState.size, `clSet('size','${s}')`)).join('');
  document.getElementById('cl-ice').innerHTML = 'Đá: ' + ['', 'less', 'none'].map(v => chip(ICE_LABEL[v] || (v || 'BT'), ICE_LABEL[clState.ice] || (clState.ice || 'BT'), `clSet('ice','${v}')`)).join('');
  document.getElementById('cl-sugar').innerHTML = 'Đường: ' + ['', '50', '30'].map(v => chip(SUGAR_LABEL[v] || (v || 'BT'), SUGAR_LABEL[clState.sugar] || (clState.sugar || 'BT'), `clSet('sugar','${v}')`)).join('');
}
function clSet(k, v) { clState[k] = v; renderClChips(); }
async function printCustomLabelFromSheet(btn) {
  const name = document.getElementById('cl-name').value.trim();
  if (!name) { alert('Nhập tên món.'); return; }
  btn.disabled = true;
  const mods = { size: clState.size, ice: clState.ice, sugar: clState.sugar };
  const r = await api().printCustomLabel(name, mods, clState.qty);
  btn.disabled = false;
  if (r.body && r.body.ok) { toast(r.body.printed ? 'Đã in tem.' : 'Đã gửi (chế độ thử).'); closeCustomLabelSheet(); }
  else { alert('In tem lỗi — thử lại.'); }
}
```

- [ ] **Step 4: Sanity check + commit**

Extract the inline `<script>` and `node --check`. Confirm `ICE_LABEL`, `SUGAR_LABEL`, `api`, `toast`, `switchView`, `selectedTable`, `renderTableGrid` resolve.

```bash
git add web/kds.html web/order-api.js
git commit -m "feat(web): add-round from floor tile + off-menu custom label sheet (🏷️ Tem lẻ)"
```

---

## Task 4: `web/order.html` — mobile staff ordering page

**Files:**
- Create: `web/order.html`
- Verify: browser preview (controller, mobile viewport)

**Interfaces:**
- Consumes: `menu-data.js` (`MENU_DATA`, `CATEGORIES`), `order-api.js` (`OrderApi`).
- Produces: a standalone page served at `/order.html` (route already exists in `print_server`).

- [ ] **Step 1: Create the page skeleton**

Create `web/order.html` — phone-first, single column, loads the shared data + client. Use `location.origin` for the gateway base like `kds.html`. Structure:
```html
<!doctype html>
<html lang="vi"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Gọi món — Mitsu 蜜</title>
<link rel="stylesheet" href="mitsu.css">
<style>
  body{margin:0;background:#17120e;color:#f2ead9;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding-bottom:96px}
  .oh{position:sticky;top:0;background:#1f1913;padding:12px 14px;border-bottom:1px solid #332a20;z-index:5}
  .tables{display:flex;gap:6px;overflow-x:auto;padding:8px 0;scrollbar-width:none}
  .tchip{flex:0 0 auto;padding:6px 12px;border-radius:20px;border:1px solid #332a20;background:#1f1913;color:#f2ead9;font-size:.85rem}
  .tchip.active{background:#eb624a;border-color:#eb624a;color:#fff;font-weight:700}
  .cat{font-weight:800;margin:16px 12px 8px;color:#d8a94a}
  .items{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 12px}
  .mi{background:#1f1913;border:1px solid #332a20;border-radius:12px;padding:12px;text-align:left}
  .mi .n{font-weight:700}.mi .p{color:#d8a94a;font-weight:800;margin-top:4px}
  .cartbar{position:fixed;left:0;right:0;bottom:0;background:#1f1913;border-top:1px solid #332a20;padding:12px 14px;display:flex;gap:10px;align-items:center}
  .send{flex:1;background:#eb624a;color:#fff;border:none;border-radius:12px;padding:14px;font-weight:800;font-size:1.05rem}
  .send:disabled{opacity:.5}
</style></head><body>
<div class="oh">
  <div style="font-weight:800">Gọi món · <span id="tbl-label">Chọn bàn</span></div>
  <div class="tables" id="tables"></div>
</div>
<div id="menu"></div>
<div class="cartbar"><div id="cart-sum">Giỏ: 0 món · 0đ</div>
  <button class="send" id="send" disabled onclick="sendOrder()">Gửi đơn</button></div>
<script src="menu-data.js"></script>
<script src="order-api.js"></script>
<script>/* Step 2 */</script>
</body></html>
```

- [ ] **Step 2: The page logic**

Fill the last `<script>`:
```javascript
const GW = (location.origin && location.origin.startsWith('http')) ? location.origin : 'http://localhost:5001';
const api = OrderApi(GW);
const TABLE_COUNT = 20;
let table = '', cart = [];
const fmt = n => Number(n).toLocaleString('vi-VN') + 'đ';

function renderTables() {
  const els = ['<button class="tchip' + (table === 'pickup' ? ' active' : '') + '" onclick="pickTable(\'pickup\')">🥡 Mang đi</button>'];
  for (let i = 1; i <= TABLE_COUNT; i++) {
    const n = String(i).padStart(2, '0');
    els.push('<button class="tchip' + (table === n ? ' active' : '') + '" onclick="pickTable(\'' + n + '\')">Bàn ' + n + '</button>');
  }
  document.getElementById('tables').innerHTML = els.join('');
}
function pickTable(t) { table = t; document.getElementById('tbl-label').textContent = t === 'pickup' ? 'Mang đi' : ('Bàn ' + t); renderTables(); updateCart(); }
function renderMenu() {
  const byCat = {};
  MENU_DATA.filter(m => m.available).forEach(m => { (byCat[m.subcategory] = byCat[m.subcategory] || []).push(m); });
  const html = (typeof CATEGORIES !== 'undefined' ? CATEGORIES : []).map(c => {
    const items = byCat[c.id] || [];
    if (!items.length) return '';
    return '<div class="cat">' + (c.emoji || '') + ' ' + c.label + '</div><div class="items">' +
      items.map(m => '<button class="mi" onclick="addItem(\'' + m.sku + '\')"><div class="n">' + m.name + '</div><div class="p">' + fmt(m.price) + '</div></button>').join('') + '</div>';
  }).join('');
  document.getElementById('menu').innerHTML = html;
}
function addItem(sku) {
  const m = MENU_DATA.find(x => x.sku === sku); if (!m) return;
  const ex = cart.find(c => c.sku === sku);
  if (ex) ex.qty++; else cart.push({ sku: m.sku, name: m.name, price: m.price, qty: 1, subtotal: m.price, modifiers: {} });
  updateCart();
}
function updateCart() {
  const n = cart.reduce((s, c) => s + c.qty, 0), t = cart.reduce((s, c) => s + c.price * c.qty, 0);
  document.getElementById('cart-sum').textContent = 'Giỏ: ' + n + ' món · ' + fmt(t);
  document.getElementById('send').disabled = !(n && table);
}
async function sendOrder() {
  if (!cart.length || !table) return;
  const btn = document.getElementById('send'); btn.disabled = true; btn.textContent = 'Đang gửi...';
  const dt = table === 'pickup' ? 'pickup' : 'dine_in';
  const items = cart.map(c => ({ sku: c.sku, name: c.name, qty: c.qty, price: c.price, subtotal: c.price * c.qty, modifiers: c.modifiers }));
  const payload = { idempotency_key: 'm-' + Date.now() + '-' + Math.random().toString(16).slice(2),
    metadata: { delivery_type: dt }, table_id: dt === 'dine_in' ? table : '', items,
    total: items.reduce((s, i) => s + i.subtotal, 0) };
  try {
    const res = await fetch(GW + '/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await res.json();
    if (d.ok) { cart = []; updateCart(); btn.textContent = 'Đã gửi ✓ ' + (d.short_code || ''); setTimeout(() => { btn.textContent = 'Gửi đơn'; }, 1500); }
    else throw new Error(d.error || 'lỗi');
  } catch (e) { alert('Gửi đơn lỗi — thử lại.'); btn.textContent = 'Gửi đơn'; btn.disabled = false; }
}
renderTables(); renderMenu(); updateCart();
```

- [ ] **Step 3: Sanity check + commit**

Extract the page `<script>` and `node --check` it (it references `MENU_DATA`/`CATEGORIES`/`OrderApi` as globals loaded by the prior `<script>` tags — for `node --check` that's fine, it's syntax-only). Confirm brace balance.

```bash
git add web/order.html
git commit -m "feat(web): mobile staff ordering page (order.html) — table picker + menu grid + cart"
```

---

## Self-review — spec ↔ plan coverage

- A cashier mode (unpaid tables + quick pay) → Task 2. ✅
- C add-item from floor tile → Task 3 (➕ + addRoundToTable). ✅
- D off-menu custom label (endpoint + sheet) → Task 1 (backend) + Task 3 (sheet). ✅
- E batch-close delivered (paid-only) → Task 2 (`batchCloseDelivered`). ✅
- F mobile order page → Task 4 (`web/order.html`). ✅
- B web-order intake → deferred (not in this plan). ✅

## Out of scope

- B (mitsu.cafe → GAS mailbox → inbox) — its own later spec.
