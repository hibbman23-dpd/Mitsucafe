# POS fixes + shortcuts + operational alert banner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three confirmed bugs in the KDS checkout/cancel/add-item flows, add multi-item cancel + keyboard shortcuts for faster staff operation, and add an operational alert banner for missed prints (label out-of-stock / real print failures).

**Architecture:** All money-relevant edits route through the existing local-first backend (`PATCH /order/<id>/items`, `bill_engine`) instead of the legacy direct-to-GAS calls that caused the index-mismatch bug — no new write path, reuse of the proven one. The alert banner is a new lightweight sqlite table (`print_issues`, same connection/lock as the rest of `print-server`) plus two small routes and a polling banner in `kds.html`, hooked into the print worker's *already-existing* failure-alert callback. Frontend-only fixes (overlay stacking, cart-clear timing, keyboard shortcuts, sugar default) touch `web/kds.html` / `web/order.html` only.

**Tech Stack:** Flask + sqlite (print-server), vanilla JS (kds.html/order.html/order-api.js), Python `unittest`, Node `node:test`.

## Global Constraints

- Never run against the live prod server on port 5001. All browser verification uses a throwaway test backend: `PRINT_ENGINE=noop SERVER_PORT=5002 GATEWAY_DB=/tmp/<unique>.db GAS_WEBAPP_URL="" GATEWAY_SYNC=0 ONLINE_POLL=0 python3 print_server.py`, run from `print-server/`.
- Never run `test_routes.py` / `test_order_spool_e2e.py` / anything with `PRINT_ENGINE=spool` or `RUN_EOD=1` on this machine — it shares hardware with the live POS.
- Backend tests: `python3 -m unittest <module> -v` from `print-server/` (pytest is not installed).
- JS unit tests: `node --test web/*.test.js` from the repo root.
- Line numbers below reflect the repo state at plan-writing time. If a file has drifted since (e.g. an earlier task in this same plan already edited it), locate the edit by the exact code shown, not the raw number.
- Manager PIN is `1234` or `9999` (existing convention, unchanged).
- Every step that touches `web/kds.html` must be **browser-verified** on the `:5002` test backend before commit (per this repo's established practice — kds.html has no headless test harness of its own).

---

### Task 1: Hủy món — local-first + multi-select cancel

**Files:**
- Modify: `web/order-api.js:17-19` (`patchItems`)
- Modify: `web/order-api.test.js` (extend the `patchItems` test)
- Modify: `print-server/print_server.py:852-868` (`order_patch_items`)
- Modify: `web/kds.html:1700-1799` (`CANCEL_REASONS`, `pendingCancel`, `cancelItemPrompt`, `renderCancelStep1`, `selectCancelItem`, `renderCancelStep2`, `selectCancelReason`, `closeCancelOverlay`, `executeCancelItem`)

**Interfaces:**
- Consumes: `api()` (global in kds.html, `OrderApi(GATEWAY_URL)`), `checkout.isStale(status)`, `setLocalOverride(orderId, patch)`, `formatItemsSummary(items)`, `verifyManagerPin()`, `cupItemsOf(o)`, `esc()`, `fmt()`, `toast()` — all already defined elsewhere in `kds.html`.
- Produces: `pendingCancel = { orderId, selected: Set<number> }` (module-level, read by `renderCancelStep1/2`, `toggleCancelItem`, `executeCancelItem`).

**Root cause being fixed:** `cancelItemPrompt`/`executeCancelItem` currently call the legacy GAS action `cancel_order_item` (`gas/Orders.gs:960`), which reads the item array from the ORDERS Sheet row — written asynchronously by the realtime syncer, so its array can be out of step with the local `STORE` items the KDS card actually displays. Staff picks an item by on-screen position; that position sent to GAS doesn't match the Sheet's array → `Invalid itemIndex`. The fix moves this to `PATCH /order/<id>/items`, which mutates the *same* array the card renders — the mismatch class of bug can't recur.

- [ ] **Step 1: Extend `patchItems` in `order-api.js` to accept an optional `reason`**

Read `web/order-api.js` lines 17-19 first to confirm current content, then replace:

```js
    patchItems: (id, items, version, managerPin) =>
      call('/order/' + encodeURIComponent(id) + '/items', 'PATCH',
           managerPin ? { items, version, manager_pin: managerPin } : { items, version }),
```

with:

```js
    patchItems: (id, items, version, managerPin, reason) => {
      const body = { items, version };
      if (managerPin) body.manager_pin = managerPin;
      if (reason) body.reason = reason;
      return call('/order/' + encodeURIComponent(id) + '/items', 'PATCH', body);
    },
```

- [ ] **Step 2: Add a test for the `reason` field**

Append to `web/order-api.test.js` (after the existing `patchItems` test):

```js
test('patchItems includes reason only when provided', async () => {
  const rec = {};
  const api = OrderApi('http://x', fakeFetch(rec, { body: { ok: true } }));
  await api.patchItems('ORD-1', [{ sku: 'DR005', qty: 1 }], 3, '1234', 'Khách đổi ý');
  const sent = JSON.parse(rec.opts.body);
  assert.strictEqual(sent.manager_pin, '1234');
  assert.strictEqual(sent.reason, 'Khách đổi ý');

  const rec2 = {};
  const api2 = OrderApi('http://x', fakeFetch(rec2, { body: { ok: true } }));
  await api2.patchItems('ORD-1', [{ sku: 'DR005', qty: 1 }], 3);
  const sent2 = JSON.parse(rec2.opts.body);
  assert.strictEqual('manager_pin' in sent2, false);
  assert.strictEqual('reason' in sent2, false);
});
```

- [ ] **Step 3: Run the JS tests**

Run: `node --test web/order-api.test.js`
Expected: all tests pass, including the two new assertions.

- [ ] **Step 4: Log `reason` server-side in `order_patch_items`**

Read `print-server/print_server.py` lines 852-868 to confirm current content, then replace:

```python
@app.patch("/order/<order_id>/items")
def order_patch_items(order_id):
    p = request.get_json(force=True, silent=True) or {}
    cur = STORE.get(order_id)
    _locked = cur and (cur.get("paid") or cur.get("status") == "VOIDED")
    if _locked and str(p.get("manager_pin") or "") not in ("1234", "9999"):
        return jsonify({"ok": False, "error": "locked_order_needs_pin"}), 403
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
```

with:

```python
@app.patch("/order/<order_id>/items")
def order_patch_items(order_id):
    p = request.get_json(force=True, silent=True) or {}
    cur = STORE.get(order_id)
    _locked = cur and (cur.get("paid") or cur.get("status") == "VOIDED")
    if _locked and str(p.get("manager_pin") or "") not in ("1234", "9999"):
        return jsonify({"ok": False, "error": "locked_order_needs_pin"}), 403
    try:
        res = bill_engine.apply_items_edit(
            STORE, order_id, p.get("items", []), int(p.get("version", -1)))
    except VersionConflict:
        return jsonify({"ok": False, "error": "version_conflict"}), 409
    except KeyError:
        return jsonify({"ok": False, "error": "not found"}), 404
    reason = p.get("reason")
    if reason:
        log.info("order_patch_items order=%s reason=%s", order_id, str(reason)[:200])
    _enqueue_cancel_ticket(res["order"], res["cancelled_lines"])
    return jsonify({"ok": True, "order": res["order"],
                    "cancelled_lines": res["cancelled_lines"]}), 200
```

- [ ] **Step 5: Add a backend test for multi-line removal in one PATCH**

Open `print-server/test_routes_orderstore.py`. In `TestEditRoutes`, after `test_patch_items_recomputes_and_returns_cancelled`, add:

```python
    def test_patch_items_removes_two_lines_at_once(self):
        r = self.c.patch(f"/order/{self.oid}/items", json={
            "version": self._ver(),
            "items": [],
            "reason": "Khách đổi ý"})
        d = r.get_json()
        self.assertEqual(d["order"]["total"], 0)
        self.assertEqual(len(d["cancelled_lines"]), 2)
```

(`self.oid` in `TestEditRoutes.setUp` has exactly 2 line items — `DR005` qty 2 and `DR028` qty 1 — so removing both in one call must report 2 cancelled lines and a 0 total.)

- [ ] **Step 6: Run the backend tests**

Run: `cd print-server && python3 -m unittest test_routes_orderstore -v`
Expected: all tests pass, including `test_patch_items_removes_two_lines_at_once`.

- [ ] **Step 7: Rewrite the cancel flow in `kds.html` for local-first + multi-select**

Read `web/kds.html` lines 1700-1799 to confirm current content (the block starting `// ─── Hủy món ...` through the end of `executeCancelItem`), then replace that whole block with:

```js
// ─── Hủy món (tap-chọn NHIỀU món cùng lúc, lý do dạng chip, PIN xác nhận) ──
const CANCEL_REASONS = ['Khách đổi ý', 'Gọi nhầm món', 'Pha nhầm', 'Hết nguyên liệu', 'Khác'];
let pendingCancel = null;

function cancelItemPrompt(orderId) {
  const o = allOrders.find(x => x.order_id === orderId);
  if (!o) return;
  const itemsList = cupItemsOf(o);
  if (!itemsList.length) { alert('Đơn hàng không có món để hủy.'); return; }
  pendingCancel = { orderId, selected: new Set() };
  renderCancelStep1();
}
function renderCancelStep1() {
  const o = allOrders.find(x => x.order_id === pendingCancel.orderId);
  if (!o) { closeCancelOverlay(); return; }
  const itemsList = cupItemsOf(o);
  const n = pendingCancel.selected.size;
  const html = `
    <div class="overlay-bg" id="cancel-overlay" onclick="closeCancelOverlay(event)">
      <div class="bottom-sheet" style="max-width:480px; margin:auto; border-radius:16px;">
        <div class="sheet-head">
          <div class="sheet-title">❌ Hủy món — Đơn #${esc(o.short_code || o.order_id)}</div>
          <button class="btn-close" onclick="closeCancelOverlay()">✕</button>
        </div>
        <div style="padding:16px; display:flex; flex-direction:column; gap:8px;">
          ${itemsList.map((it, idx) => {
            const on = pendingCancel.selected.has(idx);
            return `
            <button class="btn-sm" style="padding:12px 14px; text-align:left; display:flex; align-items:center; justify-content:space-between; background:${on ? 'rgba(239,83,80,0.18)' : 'rgba(255,255,255,0.05)'}; border:1px solid ${on ? '#ef5350' : 'var(--border)'}; border-radius:10px;" onclick="toggleCancelItem(${idx})">
              <span>${on ? '☑' : '☐'} ${esc(it.name)}</span><span style="color:var(--muted);">${fmt(it.price)}</span>
            </button>`;
          }).join('')}
        </div>
        <div style="padding:0 16px 16px;">
          <button class="btn-submit-order" style="width:100%; background:#ef5350;" ${n === 0 ? 'disabled' : ''} onclick="renderCancelStep2()">❌ Hủy ${n} món đã chọn</button>
        </div>
      </div>
    </div>`;
  let el = document.getElementById('cancel-overlay-container');
  if (!el) { el = document.createElement('div'); el.id = 'cancel-overlay-container'; document.body.appendChild(el); }
  el.innerHTML = html;
}
function toggleCancelItem(idx) {
  if (pendingCancel.selected.has(idx)) pendingCancel.selected.delete(idx);
  else pendingCancel.selected.add(idx);
  renderCancelStep1();
}
function renderCancelStep2() {
  if (!pendingCancel.selected.size) return;
  const o = allOrders.find(x => x.order_id === pendingCancel.orderId);
  if (!o) { closeCancelOverlay(); return; }
  const itemsList = cupItemsOf(o);
  const names = Array.from(pendingCancel.selected).sort((a, b) => a - b)
    .map(i => itemsList[i] && itemsList[i].name).filter(Boolean);
  const html = `
    <div class="overlay-bg" id="cancel-overlay" onclick="closeCancelOverlay(event)">
      <div class="bottom-sheet" style="max-width:460px; margin:auto; border-radius:16px;">
        <div class="sheet-head">
          <div class="sheet-title">❌ Lý do hủy ${names.length} món</div>
          <button class="btn-close" onclick="closeCancelOverlay()">✕</button>
        </div>
        <div style="padding:16px; display:flex; flex-direction:column; gap:10px;">
          <div style="font-size:.8rem; color:var(--muted);">${names.map(esc).join(', ')}</div>
          <div class="opt-chips" style="padding:0;">
            ${CANCEL_REASONS.map(r => `<div class="kds-chip" onclick="selectCancelReason(this,'${esc(r)}')">${esc(r)}</div>`).join('')}
          </div>
          <input type="text" class="form-input" id="cancel-reason-input" placeholder="Lý do hủy...">
          <button class="btn-submit-order" style="background:#ef5350;" onclick="executeCancelItem(event)">❌ Xác nhận Hủy (cần PIN Quản lý)</button>
        </div>
      </div>
    </div>`;
  const el = document.getElementById('cancel-overlay-container');
  if (el) el.innerHTML = html;
}
function selectCancelReason(el, reason) {
  document.querySelectorAll('#cancel-overlay .kds-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const input = document.getElementById('cancel-reason-input');
  if (input) input.value = reason;
}
function closeCancelOverlay(e) {
  if (e && e.target && e.target.id !== 'cancel-overlay') return;
  const el = document.getElementById('cancel-overlay-container');
  if (el) el.innerHTML = '';
  pendingCancel = null;
}
async function executeCancelItem(e) {
  const btn = e && e.target;
  if (btn) btn.disabled = true;
  try {
    if (!pendingCancel || !pendingCancel.selected.size) return;
    const o = allOrders.find(x => x.order_id === pendingCancel.orderId);
    if (!o) { toast('Đơn không còn trong danh sách — đã tải lại'); await loadOrders(); return; }
    const reasonInput = document.getElementById('cancel-reason-input');
    const reason = (reasonInput ? reasonInput.value : '').trim();
    if (!reason) { alert('Vui lòng chọn hoặc nhập lý do hủy.'); return; }
    const pin = verifyManagerPin();
    if (!pin) return;
    const itemsList = cupItemsOf(o);
    const cancelledNames = Array.from(pendingCancel.selected)
      .map(i => itemsList[i] && itemsList[i].name).filter(Boolean);
    const newItems = itemsList.filter((_, i) => !pendingCancel.selected.has(i));
    const r = await api().patchItems(o.order_id, newItems, o.version, pin, reason);
    if (checkout.isStale(r.status)) {
      await loadOrders();
      toast('Đơn vừa đổi ở máy khác — đã tải lại');
      return;
    }
    if (r.status === 200 && r.body.ok) {
      Object.assign(o, r.body.order);
      o.items_summary = formatItemsSummary(o.items);
      setLocalOverride(o.order_id, { items: r.body.order.items, total: r.body.order.total, version: r.body.order.version });
      closeCancelOverlay();
      toast(`Đã hủy ${cancelledNames.length} món: ${cancelledNames.join(', ')}`);
      renderOrders();
    } else {
      alert('Lỗi hủy món: ' + ((r.body && r.body.error) || 'không rõ'));
    }
  } catch (err) {
    alert('Lỗi kết nối khi hủy món.');
  } finally {
    if (btn) btn.disabled = false;
  }
}
```

- [ ] **Step 8: Browser-verify on the test backend**

```bash
cd print-server && PRINT_ENGINE=noop SERVER_PORT=5002 GATEWAY_DB=/tmp/task1_store.db GAS_WEBAPP_URL="" GATEWAY_SYNC=0 ONLINE_POLL=0 python3 print_server.py &
curl -s -X POST http://localhost:5002/order -H "Content-Type: application/json" -d '{
  "table_id":"TABLE_01","total":75000,"metadata":{"delivery_type":"dine_in"},
  "items":[{"sku":"DR001","name":"CF MITSU","qty":1,"price":25000,"subtotal":25000,"modifiers":{}},
           {"sku":"DR020","name":"MATCHA LATTE","qty":1,"price":25000,"subtotal":25000,"modifiers":{}},
           {"sku":"DR002","name":"CF SỮA","qty":1,"price":25000,"subtotal":25000,"modifiers":{}}]}'
```

Open `http://localhost:5002/kds.html` in the Browser pane, open the order card, tap "❌ Hủy món", tick **two** of the three items, confirm the footer button reads "❌ Hủy 2 món đã chọn", tap it, pick a reason chip, confirm with PIN `1234`. Expected: overlay closes, toast shows "Đã hủy 2 món: ...", the card now shows only 1 line item and the total drops to 25.000đ, and `GET /orders` (via `curl http://localhost:5002/orders`) confirms only 1 item remains server-side. Check `read_console_messages` for zero errors.

Kill the test server and remove the temp DB when done: `pkill -f "SERVER_PORT=5002"; rm -f /tmp/task1_store.db`.

- [ ] **Step 9: Commit**

```bash
git add web/order-api.js web/order-api.test.js print-server/print_server.py print-server/test_routes_orderstore.py web/kds.html
git commit -m "fix(kds): hủy món qua backend local (hết lỗi invalid itemindex) + hủy nhiều món 1 lần"
```

---

### Task 2: Fix "Thêm món" / "Đổi món" size sheet hidden behind picker overlay

**Files:**
- Modify: `web/kds.html:2780-2801` (`checkoutSelectAddItem`)
- Modify: `web/kds.html:3351-3375` (`selectSwapNewItem`)

**Interfaces:**
- Consumes: `closeCheckoutAddOverlay()`, `closeSwapOverlay()` (both already defined, just clear an overlay container's `innerHTML`).
- Produces: nothing new — pure bugfix, no new functions.

**Root cause:** both functions open `#size-overlay` (`z-index:9999`) without closing the sheet they were called from (`#checkout-add-overlay` / `#swap-overlay`, also `z-index:9999`, but later in DOM order — so it paints on top and makes the now-open size sheet fully invisible and untappable). Confirmed live: `pendingCheckoutAdd` becomes `true` and `#size-overlay` loses its `hidden` class, but zero pixels of it are reachable.

- [ ] **Step 1: Close the picker overlay before opening the size sheet in `checkoutSelectAddItem`**

Read `web/kds.html` around line 2780-2801, then replace:

```js
function checkoutSelectAddItem(sku) {
  const item = MENU_DATA.find(m => m.sku === sku);
  if (!item) return;
  pendingItem = item;
  pendingOpts = {
    size: item.price_l ? 'M' : null,
    sugar: item.customizations?.sugar?.length ? item.customizations.sugar[Math.floor(item.customizations.sugar.length / 2)] : null,
    ice: item.customizations?.ice?.length ? item.customizations.ice[0] : null,
    toppings: [],
    note: ''
  };
  const c = item.customizations || {};
  const hasOpts = item.price_l || (c.sugar && c.sugar.length) || (c.ice && c.ice.length) || (c.toppings && c.toppings.length);
  if (hasOpts) {
    document.getElementById('size-item-name').textContent = '[Thêm vào đơn] ' + item.name;
    document.getElementById('size-overlay').classList.remove('hidden');
    renderCustomOptions();
    pendingCheckoutAdd = true;
  } else {
    confirmCheckoutAddItem(item, {}, item.price_m);
  }
}
```

with:

```js
function checkoutSelectAddItem(sku) {
  const item = MENU_DATA.find(m => m.sku === sku);
  if (!item) return;
  pendingItem = item;
  pendingOpts = {
    size: item.price_l ? 'M' : null,
    sugar: item.customizations?.sugar?.length ? item.customizations.sugar[Math.floor(item.customizations.sugar.length / 2)] : null,
    ice: item.customizations?.ice?.length ? item.customizations.ice[0] : null,
    toppings: [],
    note: ''
  };
  const c = item.customizations || {};
  const hasOpts = item.price_l || (c.sugar && c.sugar.length) || (c.ice && c.ice.length) || (c.toppings && c.toppings.length);
  if (hasOpts) {
    closeCheckoutAddOverlay(); // đóng sheet chọn món TRƯỚC — nếu không size-overlay mở "âm thầm" phía sau (cùng z-index, đè khuất)
    document.getElementById('size-item-name').textContent = '[Thêm vào đơn] ' + item.name;
    document.getElementById('size-overlay').classList.remove('hidden');
    renderCustomOptions();
    pendingCheckoutAdd = true;
  } else {
    confirmCheckoutAddItem(item, {}, item.price_m);
  }
}
```

- [ ] **Step 2: Same fix in `selectSwapNewItem`**

Read `web/kds.html` around line 3351-3375, then replace:

```js
function selectSwapNewItem(sku) {
  const item = MENU_DATA.find(m => m.sku === sku);
  if (!item) return;

  pendingItem = item;
  pendingOpts = {
    size: item.price_l ? 'M' : null,
    sugar: item.customizations?.sugar?.length ? item.customizations.sugar[Math.floor(item.customizations.sugar.length / 2)] : null,
    ice: item.customizations?.ice?.length ? item.customizations.ice[0] : null,
    toppings: [],
    note: ''
  };

  const c = item.customizations || {};
  const hasOpts = item.price_l || (c.sugar && c.sugar.length) || (c.ice && c.ice.length) || (c.toppings && c.toppings.length);

  if (hasOpts) {
    document.getElementById('size-item-name').textContent = `[Đổi món mới] ` + item.name;
    document.getElementById('size-overlay').classList.remove('hidden');
    renderCustomOptions();
    pendingSwap.isCustomizing = true;
  } else {
    confirmSwapNewItem(item, {}, item.price_m);
  }
}
```

with:

```js
function selectSwapNewItem(sku) {
  const item = MENU_DATA.find(m => m.sku === sku);
  if (!item) return;

  pendingItem = item;
  pendingOpts = {
    size: item.price_l ? 'M' : null,
    sugar: item.customizations?.sugar?.length ? item.customizations.sugar[Math.floor(item.customizations.sugar.length / 2)] : null,
    ice: item.customizations?.ice?.length ? item.customizations.ice[0] : null,
    toppings: [],
    note: ''
  };

  const c = item.customizations || {};
  const hasOpts = item.price_l || (c.sugar && c.sugar.length) || (c.ice && c.ice.length) || (c.toppings && c.toppings.length);

  if (hasOpts) {
    closeSwapOverlay(); // đóng sheet chọn món TRƯỚC — cùng lý do như checkoutSelectAddItem
    document.getElementById('size-item-name').textContent = `[Đổi món mới] ` + item.name;
    document.getElementById('size-overlay').classList.remove('hidden');
    renderCustomOptions();
    pendingSwap.isCustomizing = true;
  } else {
    confirmSwapNewItem(item, {}, item.price_m);
  }
}
```

- [ ] **Step 3: Browser-verify both flows on the test backend**

Reuse the server started in Task 1 Step 8 (or start a fresh one on `:5002`). Open checkout for an order, tap "➕ Thêm món", pick an item that has sugar/ice options (e.g. `CF SỮA`) — the size/sugar/ice picker sheet must now be visible and tappable, not obscured. Confirm the add completes (item appears in the order, overlay fully closes). Then test "🔀 Đổi món" the same way: pick step-1 old item → step-2 pick a new item **with modifiers** — the size sheet must be visible, tappable, and completing it must reach step 3 (diff/PIN confirm), not get stuck.

Use `read_console_messages` to confirm no errors, and `javascript_tool` to sanity-check the element is actually paintable if in doubt: `getComputedStyle(document.getElementById('size-overlay')).zIndex` vs `document.getElementById('checkout-add-overlay-container').innerHTML === ''` (should be empty after the fix, proving the picker really closed).

- [ ] **Step 4: Commit**

```bash
git add web/kds.html
git commit -m "fix(kds): Thêm món/Đổi món — đóng sheet chọn món trước khi mở size-overlay (hết bị đè khuất)"
```

---

### Task 3: Clear cart immediately after successful order submit

**Files:**
- Modify: `web/kds.html:3719-3748` (`submitStaffOrder`)

**Interfaces:**
- Consumes: `staffCart` (module-level array), `updateCartBar()` (already defined).
- Produces: nothing new.

**Root cause:** `resetStaffCart()` (which clears `staffCart`) currently only runs from the success panel's "Đóng" button. Any other dismissal (tap outside the sheet, switch tab) leaves `staffCart` holding the already-submitted items; the next submit re-sends them merged with new items → duplicate order.

- [ ] **Step 1: Clear the cart right after a successful submit, before showing the success panel**

Read `web/kds.html` around line 3719-3748 (inside `submitStaffOrder`), then replace:

```js
  try {
    const minted = await submitOrder(payload);
    if (quickPay) {
      minted.payment_status = 'PAID';
      payload.order_id = minted.order_id || payload.order_id;
      payload.payment_status = 'PAID';
      setLocalOverride(minted.order_id || payload.order_id, { payment_status: 'PAID' });
    }

    optimisticInsert(payload, minted);

    pendingStaffSubmit = null;
    if (btn) { btn.disabled = false; btn.textContent = 'Đặt đơn'; }
    if (btnQuick) { btnQuick.disabled = false; btnQuick.textContent = '💳 Gửi & Thanh toán ngay'; }
    document.getElementById('order-form').classList.add('hidden');
    document.getElementById('submit-success').classList.remove('hidden');
    document.getElementById('submit-success-msg').textContent =
      `Mã đơn: ${minted.short_code || shortCode}${tableId ? '  ·  Bàn ' + submittedTable : ''}  ·  ${fmt(total)} ${quickPay ? '(ĐÃ THANH TOÁN)' : ''}`;
  } catch(err) {
```

with:

```js
  try {
    const minted = await submitOrder(payload);
    if (quickPay) {
      minted.payment_status = 'PAID';
      payload.order_id = minted.order_id || payload.order_id;
      payload.payment_status = 'PAID';
      setLocalOverride(minted.order_id || payload.order_id, { payment_status: 'PAID' });
    }

    optimisticInsert(payload, minted);

    // Xoá giỏ NGAY khi gửi thành công — không chờ bấm "Đóng" nữa (nếu chờ, bấm ra
    // ngoài/đổi tab sẽ giữ nguyên giỏ cũ và gộp gửi trùng đơn ở lần gửi kế tiếp).
    staffCart = [];
    updateCartBar();

    pendingStaffSubmit = null;
    if (btn) { btn.disabled = false; btn.textContent = 'Đặt đơn'; }
    if (btnQuick) { btnQuick.disabled = false; btnQuick.textContent = '💳 Gửi & Thanh toán ngay'; }
    document.getElementById('order-form').classList.add('hidden');
    document.getElementById('submit-success').classList.remove('hidden');
    document.getElementById('submit-success-msg').textContent =
      `Mã đơn: ${minted.short_code || shortCode}${tableId ? '  ·  Bàn ' + submittedTable : ''}  ·  ${fmt(total)} ${quickPay ? '(ĐÃ THANH TOÁN)' : ''}`;
  } catch(err) {
```

Note: `resetStaffCart()` (called from the "Đóng" button) still runs its own `staffCart = []` — harmless no-op the second time — and still resets `selectedTable`/`orderMode`/the phone+notes inputs, which is correct: those should only reset once staff dismisses the success panel and is ready to type a new order, not the instant the order lands.

- [ ] **Step 2: Browser-verify on the test backend**

Reuse/start the `:5002` server. Open "➕ Gọi món", pick a table, add an item, submit (🚀 Đặt đơn). **Without tapping "Đóng"**, use `javascript_tool` to check `JSON.stringify(staffCart)` → must be `[]` immediately. Then tap the "📋 Đơn hôm nay" tab (not "Đóng") and back to "➕ Gọi món" — the cart bar at the bottom must be hidden/empty (no leftover count), and adding a new item must start a fresh cart, not append to the old one.

- [ ] **Step 3: Commit**

```bash
git add web/kds.html
git commit -m "fix(kds): xoá giỏ ngay khi gửi đơn thành công (không chờ bấm Đóng — hết nguy cơ gộp gửi trùng)"
```

---

### Task 4: Keyboard shortcuts for size/ice/sugar/topping picker

**Files:**
- Modify: `web/kds.html:3156-3198` (the global `keydown` listener)
- Modify: `web/kds.html` (add `handleSizeOverlayShortcut` near `renderCustomOptions`, e.g. directly above `confirmCustomOrder` at line ~3200)

**Interfaces:**
- Consumes: `pendingItem`, `pendingOpts` (module-level, already set by `tapMenuItem`/`checkoutSelectAddItem`/`selectSwapNewItem`), `selectPendingOpt(key, val)`, `togglePendingTopping(id, name, price)` (both already defined at lines ~3044-3057).
- Produces: `handleSizeOverlayShortcut(e)` — called only from the keydown listener, no other caller needed.

One shared sheet (`#size-overlay`) powers Gọi món (staff cart add), Thêm món (checkout add), and Đổi món (swap) — this single fix covers all three entry points.

- [ ] **Step 1: Add the shortcut handler function**

Read `web/kds.html` just above `function confirmCustomOrder() {` (around line 3200) to confirm the insertion point, then insert this new function immediately before it:

```js
// ─── Phím tắt chọn size/đá/đường/topping trong #size-overlay ──────────────
// L/M = size · ↑/↓ = nhiều/ít đá · 1-5 = mức đường theo thứ tự · 8,9,0 = topping 1/2/3.
// Chỉ hoạt động khi không có ô nhập text nào đang focus (guard ở nơi gọi).
function handleSizeOverlayShortcut(e) {
  if (!pendingItem) return;
  const item = pendingItem;
  const c = item.customizations || {};
  const key = e.key;
  const lower = key.toLowerCase();

  if (item.price_l && (lower === 'l' || lower === 'm')) {
    e.preventDefault();
    selectPendingOpt('size', lower === 'l' ? 'L' : 'M');
    return;
  }
  if (c.ice && c.ice.length && !c.ice.includes('blended') && (key === 'ArrowUp' || key === 'ArrowDown')) {
    e.preventDefault();
    const idx = c.ice.indexOf(pendingOpts.ice);
    const cur = idx >= 0 ? idx : 0;
    const next = key === 'ArrowUp' ? Math.max(0, cur - 1) : Math.min(c.ice.length - 1, cur + 1);
    selectPendingOpt('ice', c.ice[next]);
    return;
  }
  if (c.sugar && c.sugar.length && key >= '1' && key <= '5') {
    e.preventDefault();
    const idx = Number(key) - 1;
    if (idx < c.sugar.length) selectPendingOpt('sugar', c.sugar[idx]);
    return;
  }
  if (c.toppings && c.toppings.length && (key === '8' || key === '9' || key === '0')) {
    e.preventDefault();
    const idx = key === '8' ? 0 : key === '9' ? 1 : 2;
    const t = c.toppings[idx];
    if (t) togglePendingTopping(t.id, t.name, t.price);
  }
}
```

- [ ] **Step 2: Wire it into the existing keydown listener**

Read `web/kds.html` lines 3156-3198 to confirm current content, then replace only the first branch (`// 1. Option Picker Modal ...`):

```js
  // 1. Option Picker Modal (Choose Size / Toppings / Note)
  if (sizeOverlay && !sizeOverlay.classList.contains('hidden')) {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmCustomOrder();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSizeSheet();
    }
    return;
  }
```

with:

```js
  // 1. Option Picker Modal (Choose Size / Toppings / Note)
  if (sizeOverlay && !sizeOverlay.classList.contains('hidden')) {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmCustomOrder();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSizeSheet();
    } else if (!isInputFocused) {
      handleSizeOverlayShortcut(e);
    }
    return;
  }
```

(leave the rest of the listener — cart/checkout modal and main-menu `M` key branches — untouched.)

- [ ] **Step 3: Browser-verify each shortcut on the test backend**

Reuse/start the `:5002` server, open "➕ Gọi món", tap an item that has size L, sugar (5 levels), ice, and toppings (e.g. `CF K.DẺO B.MÊ` or similar — check `menu-data.js` for an item with all four; `CA CAO OREO KEM DẺO` has toppings). With the size sheet open, use `computer{action:"key"}` to send: `L` → size chip L becomes active; `ArrowDown` then `ArrowDown` → ice chip moves toward "Không đá"; `ArrowUp` → moves back one step; `3` → sugar chip "50%" becomes active; `8` → first topping chip toggles active; `8` again → toggles back off. Confirm via `read_page` that the corresponding `.kds-chip.active` matches at each step. Then click into the "Ghi chú riêng món này" text input and type the digit `3` — confirm the sugar selection does **not** change (guarded by `isInputFocused`). Finally press `Enter` (input not focused) — confirms/adds the item as before (unchanged pre-existing behavior).

- [ ] **Step 4: Commit**

```bash
git add web/kds.html
git commit -m "feat(kds): phím tắt chọn size/đá/đường/topping trong size-overlay (Gọi món/Thêm món/Đổi món dùng chung)"
```

---

### Task 5: `order.html` default sugar → closest to 50%

**Files:**
- Modify: `web/order.html:135-148` (`openItemSheet`)

**Interfaces:** none — self-contained one-line logic change.

- [ ] **Step 1: Change the default sugar selection**

Read `web/order.html` lines 135-148 to confirm current content, then replace:

```js
function openItemSheet(sku) {
  const m = MENU_DATA.find(x => x.sku === sku); if (!m) return;
  sheetItem = m;
  const cz = m.customizations || {};
  sheetSel = {
    size: 'M',
    ice: (cz.ice && cz.ice.length) ? '' : null,     // '' = default (full) when ice offered; null = not applicable
    sugar: (cz.sugar && cz.sugar.length) ? cz.sugar[0] : null,
    toppings: [],
    qty: 1,
  };
  renderItemSheet();
  document.getElementById('item-ov').classList.remove('hidden');
}
```

with:

```js
function openItemSheet(sku) {
  const m = MENU_DATA.find(x => x.sku === sku); if (!m) return;
  sheetItem = m;
  const cz = m.customizations || {};
  sheetSel = {
    size: 'M',
    ice: (cz.ice && cz.ice.length) ? '' : null,     // '' = default (full) when ice offered; null = not applicable
    // Mặc định 50% nếu món có mức đó; món chỉ có 1 mức cố định (vd chỉ '0%') thì giữ mức đó.
    sugar: (cz.sugar && cz.sugar.length) ? (cz.sugar.find(s => s.includes('50')) || cz.sugar[0]) : null,
    toppings: [],
    qty: 1,
  };
  renderItemSheet();
  document.getElementById('item-ov').classList.remove('hidden');
}
```

- [ ] **Step 2: Browser-verify on the test backend**

Reuse/start the `:5002` server, open `http://localhost:5002/order.html`, pick any table, tap a coffee item that offers all 5 sugar levels (e.g. `CF SỮA`). The modifier sheet's "Đường" chip row must open with **50%** already highlighted active, not 100%. Then tap an item with only one fixed sugar option if one exists in the menu (grep `menu-data.js` for `"sugar": \["0%"\]`-style single-entry arrays) and confirm it still defaults correctly to that single option (no crash, no wrong chip).

- [ ] **Step 3: Commit**

```bash
git add web/order.html
git commit -m "fix(order.html): mặc định mức đường 50% thay vì 100%"
```

---

### Task 6: `print_issues` backend — table, routes, auto-log hook

**Files:**
- Create: `print-server/print_issues.py`
- Modify: `print-server/print_server.py` (imports near line 143-146; instantiate near line 152; `_spool_alert` at line 235-241; 3 new routes after `/print/custom_label`, i.e. after line 988)
- Modify: `print-server/test_routes_orderstore.py` (rebind `PRINT_ISSUES` in `RouteTestBase`; new `TestPrintIssuesRoutes` class)

**Interfaces:**
- Produces: `PrintIssues(conn, lock)` with methods `log_auto_failed(order_id, kind, cup_index, note)`, `flag_manual(order_id, note)`, `list_open() -> list[dict]`, `resolve(issue_id)`. Module-level `PRINT_ISSUES` instance in `print_server.py`, same shape as the existing `SPOOL`/`STORE` singletons (shares `GATEWAY._conn`/`GATEWAY._lock`).
- Routes: `GET /print/issues` → `{ok, issues: [...]}`; `POST /print/issues/flag` body `{order_id, note}` → `{ok}` (400 if `order_id` missing); `POST /print/issues/<int:issue_id>/resolve` → `{ok}` (idempotent no-op if already resolved or unknown id).
- Each issue dict: `{id, order_id, kind ('label'|'receipt'), issue_type ('auto_failed'|'manual_flag'), cup_index (int|null), note, created_at, resolved_at}`.

- [ ] **Step 1: Create `print_issues.py`**

```python
# print-server/print_issues.py
"""print_issues.py — operational alert log: real print failures (auto) + staff-flagged
'tem không ra' reports (manual). Surfaced as a banner in kds.html so a manager can
reprint or dismiss. Same sqlite conn/lock as the rest of print-server (no new DB file)."""
from datetime import datetime, timedelta, timezone

_VN = timezone(timedelta(hours=7))


def _now_iso():
    return datetime.now(_VN).isoformat()


_SCHEMA = """
CREATE TABLE IF NOT EXISTS print_issues (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT NOT NULL,
  kind         TEXT NOT NULL,
  issue_type   TEXT NOT NULL,
  cup_index    INTEGER,
  note         TEXT,
  created_at   TEXT NOT NULL,
  resolved_at  TEXT
);
CREATE INDEX IF NOT EXISTS ix_print_issues_open ON print_issues(resolved_at, id);
"""


class PrintIssues:
    def __init__(self, conn, lock):
        self._conn = conn
        self._lock = lock
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    def log_auto_failed(self, order_id, kind, cup_index, note):
        with self._lock:
            self._conn.execute(
                "INSERT INTO print_issues(order_id,kind,issue_type,cup_index,note,created_at) "
                "VALUES(?,?,?,?,?,?)",
                (order_id, kind, "auto_failed", cup_index, str(note)[:400], _now_iso()))
            self._conn.commit()

    def flag_manual(self, order_id, note):
        with self._lock:
            self._conn.execute(
                "INSERT INTO print_issues(order_id,kind,issue_type,cup_index,note,created_at) "
                "VALUES(?,?,?,?,?,?)",
                (order_id, "label", "manual_flag", None, str(note or "")[:400], _now_iso()))
            self._conn.commit()

    def list_open(self):
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM print_issues WHERE resolved_at IS NULL ORDER BY id").fetchall()
            return [dict(r) for r in rows]

    def resolve(self, issue_id):
        with self._lock:
            self._conn.execute(
                "UPDATE print_issues SET resolved_at=? WHERE id=? AND resolved_at IS NULL",
                (_now_iso(), issue_id))
            self._conn.commit()
```

- [ ] **Step 2: Wire the import + singleton into `print_server.py`**

Read `print-server/print_server.py` line 152 to confirm current content (`SPOOL = PrintSpool(GATEWAY._conn, GATEWAY._lock)`), then insert directly after it:

```python
from print_issues import PrintIssues
PRINT_ISSUES = PrintIssues(GATEWAY._conn, GATEWAY._lock)
```

- [ ] **Step 3: Hook the existing failure-alert callback**

Read `print-server/print_server.py` lines 235-241 to confirm current content, then replace:

```python
def _spool_alert(job, err):
    text = f"⚠️ In hỏng: {job.get('idempotency_key')} — {str(err)[:200]}"
    log.error("[SPOOL FAILED] %s", text)
    try:
        _gas_post({"action": "notify_admin", "text": text})
    except Exception:
        pass
```

with:

```python
def _spool_alert(job, err):
    text = f"⚠️ In hỏng: {job.get('idempotency_key')} — {str(err)[:200]}"
    log.error("[SPOOL FAILED] %s", text)
    try:
        PRINT_ISSUES.log_auto_failed(job.get("order_id", ""), job.get("printer", ""),
                                      job.get("seq_in_order"), str(err))
    except Exception as exc:
        log.error("print_issues log failed: %s", exc)
    try:
        _gas_post({"action": "notify_admin", "text": text})
    except Exception:
        pass
```

- [ ] **Step 4: Add the 3 routes**

Read `print-server/print_server.py` around line 988 (the end of `print_custom_label`, right before `@app.post("/order/status")` at line 991) to confirm the insertion point, then insert between them:

```python
@app.get("/print/issues")
def print_issues_list():
    return jsonify({"ok": True, "issues": PRINT_ISSUES.list_open()}), 200


@app.post("/print/issues/flag")
def print_issues_flag():
    """Nhân viên báo 'tem không ra' cho 1 đơn — không cần PIN (chỉ là báo cáo, không đụng tiền)."""
    p = request.get_json(force=True, silent=True) or {}
    order_id = (p.get("order_id") or "").strip()
    if not order_id:
        return jsonify({"ok": False, "error": "order_id required"}), 400
    PRINT_ISSUES.flag_manual(order_id, p.get("note") or "")
    return jsonify({"ok": True}), 200


@app.post("/print/issues/<int:issue_id>/resolve")
def print_issues_resolve(issue_id):
    PRINT_ISSUES.resolve(issue_id)
    return jsonify({"ok": True}), 200
```

- [ ] **Step 5: Rebind `PRINT_ISSUES` in the test base + add route tests**

Read `print-server/test_routes_orderstore.py` lines 1-27 to confirm current content, then replace the import block and `RouteTestBase.setUp`:

```python
import os, tempfile, unittest
os.environ["PRINT_ENGINE"] = "noop"  # avoid real printer I/O; see Step 3 note
import print_server
from gateway import Gateway
from order_store import OrderStore
from online_inbox import OnlineInbox
from print_spool import PrintSpool
from print_issues import PrintIssues


def _fake_reserve(dtype, n):
    return {"letter": "Q", "date": "20260726", "from": 1, "to": n}


class RouteTestBase(unittest.TestCase):
    """Rebind GATEWAY/STORE/INBOX to a throwaway temp DB so route tests never
    touch the production outbox.db (module-level STORE/SPOOL bind at import time
    to the real DB — rebinding GATEWAY alone is not enough)."""
    def setUp(self):
        print_server.app.testing = True
        self.c = print_server.app.test_client()
        self._db = tempfile.mktemp(suffix=".db")
        print_server.GATEWAY = Gateway(self._db, "http://gas", "tok",
                                       reserve_fn=_fake_reserve, today="20260726")
        print_server.STORE = OrderStore(print_server.GATEWAY._conn, print_server.GATEWAY._lock)
        print_server.SPOOL = PrintSpool(print_server.GATEWAY._conn, print_server.GATEWAY._lock)
        print_server.PRINT_ISSUES = PrintIssues(print_server.GATEWAY._conn, print_server.GATEWAY._lock)
        print_server.INBOX = OnlineInbox(print_server.STORE, fetch_fn=lambda: [])

    def tearDown(self):
        if os.path.exists(self._db):
            os.remove(self._db)
```

Then append a new test class at the end of the file:

```python
class TestPrintIssuesRoutes(RouteTestBase):
    def test_flag_then_list_then_resolve(self):
        r = self.c.post("/print/issues/flag", json={"order_id": "ORD-1", "note": "tem không ra"})
        self.assertEqual(r.status_code, 200)
        listed = self.c.get("/print/issues").get_json()["issues"]
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["order_id"], "ORD-1")
        self.assertEqual(listed[0]["issue_type"], "manual_flag")
        issue_id = listed[0]["id"]
        r2 = self.c.post(f"/print/issues/{issue_id}/resolve")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(self.c.get("/print/issues").get_json()["issues"], [])

    def test_flag_missing_order_id_400(self):
        r = self.c.post("/print/issues/flag", json={})
        self.assertEqual(r.status_code, 400)

    def test_resolve_unknown_id_is_noop_200(self):
        r = self.c.post("/print/issues/999999/resolve")
        self.assertEqual(r.status_code, 200)

    def test_auto_log_via_spool_alert(self):
        print_server._spool_alert(
            {"order_id": "ORD-2", "idempotency_key": "k1", "printer": "label", "seq_in_order": 3},
            RuntimeError("usb gone"))
        listed = self.c.get("/print/issues").get_json()["issues"]
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["issue_type"], "auto_failed")
        self.assertEqual(listed[0]["kind"], "label")
        self.assertEqual(listed[0]["cup_index"], 3)
```

- [ ] **Step 6: Run the backend tests**

Run: `cd print-server && python3 -m unittest test_routes_orderstore -v`
Expected: all tests pass, including the 4 new `TestPrintIssuesRoutes` tests, and every pre-existing test in the file still passes (confirms the `RouteTestBase` change didn't break anything else that inherits from it).

- [ ] **Step 7: Commit**

```bash
git add print-server/print_issues.py print-server/print_server.py print-server/test_routes_orderstore.py
git commit -m "feat(print-server): print_issues log (auto print-failure + manual 'tem không ra' flag) + routes"
```

---

### Task 7: kds.html operational alert banner

**Files:**
- Modify: `web/order-api.js` (add `printIssues`/`flagPrintIssue`/`resolvePrintIssue`)
- Modify: `web/order-api.test.js` (tests for the 3 new methods)
- Modify: `web/kds.html` — CSS near line 100 (`.tts-banner` block), HTML near line 479-480 (`<div id="view-orders">`), the order-card action row near line 1861 (add the flag button next to "↻ In lại tem"), and JS near line 1188-1189 (the polling block, `pollCloud`/`pollPrinters`)

**Interfaces:**
- Consumes: `api()`, `esc()`, `fmt()`, `toast()`, `allOrders`, `cupItemsOf(o)`, `reprintCupLabelExecute(orderId, idx, btn)` (Task 1 territory, already exists and is `btn`-nullable), `reprintBill(orderId)` (already exists, `async function reprintBill(orderId)` at line 1551).
- Produces: `printIssuesOpen` (module-level array, last polled list), `pollPrintIssues()`, `renderIssueBanner()`, `toggleIssueBanner()`, `resolveIssueOnly(id)`, `reprintIssue(id, orderId, kind, cupIndex)`, `flagPrintIssuePrompt(orderId)`.

- [ ] **Step 1: Add the 3 API methods**

Read `web/order-api.js` around the `printCustomLabel` line (currently line 35) to confirm the insertion point, then insert right after it (before the closing `};`):

```js
    printIssues: () => call('/print/issues', 'GET'),
    flagPrintIssue: (orderId, note) => call('/print/issues/flag', 'POST', { order_id: orderId, note }),
    resolvePrintIssue: (issueId) => call('/print/issues/' + encodeURIComponent(issueId) + '/resolve', 'POST', {}),
```

- [ ] **Step 2: Add JS tests for the 3 new methods**

Append to `web/order-api.test.js`:

```js
test('printIssues GETs /print/issues', async () => {
  const rec = {};
  const api = OrderApi('http://x', fakeFetch(rec, { body: { ok: true, issues: [] } }));
  const r = await api.printIssues();
  assert.strictEqual(rec.url, 'http://x/print/issues');
  assert.deepStrictEqual(r.body.issues, []);
});

test('flagPrintIssue POSTs order_id + note', async () => {
  const rec = {};
  const api = OrderApi('http://x', fakeFetch(rec, { body: { ok: true } }));
  await api.flagPrintIssue('ORD-1', 'tem không ra');
  assert.strictEqual(rec.url, 'http://x/print/issues/flag');
  const sent = JSON.parse(rec.opts.body);
  assert.strictEqual(sent.order_id, 'ORD-1');
  assert.strictEqual(sent.note, 'tem không ra');
});

test('resolvePrintIssue POSTs to /print/issues/<id>/resolve', async () => {
  const rec = {};
  const api = OrderApi('http://x', fakeFetch(rec, { body: { ok: true } }));
  await api.resolvePrintIssue(7);
  assert.strictEqual(rec.url, 'http://x/print/issues/7/resolve');
  assert.strictEqual(rec.opts.method, 'POST');
});
```

- [ ] **Step 3: Run the JS tests**

Run: `node --test web/order-api.test.js`
Expected: all tests pass, including the 3 new ones.

- [ ] **Step 4: Add banner CSS**

Read `web/kds.html` lines 92-101 (the `.tts-banner` block) to confirm the insertion point, then insert directly after the `.btn-tts` rule (after line 101):

```css
    /* ── PRINT ISSUES BANNER ── */
    .issue-banner {
      background: rgba(239,83,80,.12); border: 1px solid rgba(239,83,80,.4);
      border-radius: var(--radius); margin: 10px 14px 0;
      padding: 9px 14px; cursor: pointer;
      font-size: .82rem; color: #ef5350; font-weight: 700;
    }
    .issue-banner.hidden { display: none; }
    .issue-list { margin: 0 14px 10px; display: flex; flex-direction: column; gap: 8px; }
    .issue-list.hidden { display: none; }
    .issue-row {
      background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
      padding: 10px 12px; display: flex; align-items: center; justify-content: space-between;
      gap: 10px; font-size: .8rem;
    }
```

- [ ] **Step 5: Add the banner HTML container**

Read `web/kds.html` around line 479-480 (`<div id="view-orders">` opening) to confirm current content, then replace:

```html
<!-- ════════ VIEW: ORDERS ════════ -->
<div id="view-orders">
  <div class="orders-mode-toggle" style="display:flex; gap:8px; margin-bottom:10px;">
```

with:

```html
<!-- ════════ VIEW: ORDERS ════════ -->
<div id="view-orders">
  <div class="issue-banner hidden" id="issue-banner" onclick="toggleIssueBanner()"></div>
  <div class="issue-list hidden" id="issue-list"></div>
  <div class="orders-mode-toggle" style="display:flex; gap:8px; margin-bottom:10px;">
```

- [ ] **Step 6: Add the "⚠️ Tem không ra" button on each order card**

Read `web/kds.html` around line 1861 (the "↻ In lại tem" button in the card action row) to confirm current content, then replace:

```html
            <button class="btn-sm" style="padding:3px 8px; font-size:0.72rem;" title="In lại tem ly" onclick="reprintCupLabelPrompt('${esc(o.order_id)}')">↻ In lại tem</button>
```

with:

```html
            <button class="btn-sm" style="padding:3px 8px; font-size:0.72rem;" title="In lại tem ly" onclick="reprintCupLabelPrompt('${esc(o.order_id)}')">↻ In lại tem</button>
            <button class="btn-sm" style="padding:3px 8px; font-size:0.72rem; color:#ef5350;" title="Báo tem không ra dù đã gửi lệnh in" onclick="flagPrintIssuePrompt('${esc(o.order_id)}')">⚠️ Tem không ra</button>
```

- [ ] **Step 7: Add the banner JS logic + polling**

Read `web/kds.html` around line 1188-1189 (`setInterval(pollCloud, 15000); setInterval(pollPrinters, 30000);`) to confirm current content, then insert directly after it:

```js

// ─── PRINT ISSUES BANNER (in hỏng thật + nhân viên báo tem không ra) ──────────
let printIssuesOpen = [];

async function pollPrintIssues() {
  let r;
  try { r = await api().printIssues(); } catch (_) { return; }
  if (r.status === 200 && r.body && r.body.ok) {
    printIssuesOpen = r.body.issues || [];
    renderIssueBanner();
  }
}

function renderIssueBanner() {
  const bEl = document.getElementById('issue-banner');
  const lEl = document.getElementById('issue-list');
  if (!bEl || !lEl) return;
  if (!printIssuesOpen.length) {
    bEl.classList.add('hidden');
    lEl.classList.add('hidden');
    lEl.innerHTML = '';
    return;
  }
  bEl.classList.remove('hidden');
  bEl.textContent = `⚠️ ${printIssuesOpen.length} vấn đề in cần xử lý — bấm để xem`;
  lEl.innerHTML = printIssuesOpen.map(is => `
    <div class="issue-row">
      <div>#${esc(is.order_id)} · ${is.kind === 'label' ? 'tem' : 'hoá đơn'}${is.issue_type === 'auto_failed' ? ' (lỗi in thật)' : ' (nhân viên báo)'} · ${esc(is.note || '')}</div>
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button class="btn-sm" onclick="reprintIssue(${is.id}, '${esc(is.order_id)}', '${is.kind}', ${is.cup_index == null ? 'null' : is.cup_index})">🏷️ In lại</button>
        <button class="btn-sm" onclick="resolveIssueOnly(${is.id})">✓ Đã xử lý</button>
      </div>
    </div>`).join('');
}

function toggleIssueBanner() {
  const lEl = document.getElementById('issue-list');
  if (lEl) lEl.classList.toggle('hidden');
}

async function resolveIssueOnly(id) {
  await api().resolvePrintIssue(id);
  pollPrintIssues();
}

async function reprintIssue(id, orderId, kind, cupIndex) {
  if (kind === 'receipt') {
    await reprintBill(orderId);
  } else {
    const o = allOrders.find(x => x.order_id === orderId);
    if (!o) { toast('Đơn không còn trong danh sách hôm nay — không thể in lại.'); return; }
    const itemsList = cupItemsOf(o);
    if (cupIndex != null && itemsList[cupIndex - 1]) {
      await reprintCupLabelExecute(orderId, cupIndex - 1, null);
    } else {
      for (let i = 0; i < itemsList.length; i++) await reprintCupLabelExecute(orderId, i, null);
    }
  }
  await api().resolvePrintIssue(id);
  pollPrintIssues();
}

function flagPrintIssuePrompt(orderId) {
  if (!confirm('Xác nhận: tem đơn này không ra dù đã gửi lệnh in?')) return;
  api().flagPrintIssue(orderId, 'Nhân viên báo tem không ra').then(() => {
    toast('Đã báo quản lý — sẽ hiện trên banner.');
    pollPrintIssues();
  });
}

setInterval(pollPrintIssues, 15000);
```

- [ ] **Step 8: Browser-verify the full loop on the test backend**

Reuse/start the `:5002` server (fresh temp DB). Open `kds.html`, create an order, then:

1. **Manual flag path:** tap "⚠️ Tem không ra" on the order card → confirm dialog → accept. Within 15s (or force it: `javascript_tool` → `pollPrintIssues()`), the red banner must appear reading "⚠️ 1 vấn đề in cần xử lý". Tap it → the issue row expands showing the order id, "(nhân viên báo)", and the note. Tap "🏷️ In lại" → confirms via `read_network_requests` that `/enqueue/single_label` fired once per item in the order, then `/print/issues/<id>/resolve` fired, and the banner disappears (0 open issues).
2. **Auto-detected path:** since `PRINT_ENGINE=noop` never produces a real failure, simulate it directly: `curl -s -X POST http://localhost:5002/print/issues/flag -H "Content-Type: application/json" -d '{"order_id":"ORD-FAKE","note":"test"}'` is the manual path already covered above — for the auto path, use `javascript_tool` to call `fetch('/print/issues', {method:'GET'})`... actually simplest: from a Python shell, `python3 -c "import print_server; print_server._spool_alert({'order_id':'ORD-X','idempotency_key':'k','printer':'label','seq_in_order':2}, RuntimeError('paper out'))"` against the running `:5002` process is not possible cross-process — instead just trust Task 6's backend test for the auto path (already covered there) and only re-verify the **UI rendering distinction** here by inserting a row directly via sqlite3 CLI against the test DB (`/tmp/<db>`) with `issue_type='auto_failed'`, reloading the banner, and confirming it reads "(lỗi in thật)" instead of "(nhân viên báo)".
3. Confirm `read_console_messages` shows zero errors throughout.

- [ ] **Step 9: Commit**

```bash
git add web/order-api.js web/order-api.test.js web/kds.html
git commit -m "feat(kds): banner cảnh báo vận hành — in lỗi thật + nhân viên báo tem không ra, in lại/đánh dấu đã xử lý"
```

---

## Self-Review Notes (already applied above)

- **Spec coverage:** A→Task 1, B→Task 2, C→Task 3, D→Task 1 (merged with A — same backend path, one deliverable), E→Task 4, F→Task 5, G→Tasks 6+7 (backend/frontend split, each independently testable). All 7 spec sections have a task.
- **Type/name consistency checked:** `pendingCancel.selected` (Set) used consistently across `cancelItemPrompt`/`renderCancelStep1`/`toggleCancelItem`/`renderCancelStep2`/`executeCancelItem` (Task 1); `PRINT_ISSUES` singleton name matches across `print_server.py` and its test rebind (Task 6/7); `printIssues`/`flagPrintIssue`/`resolvePrintIssue` names match between `order-api.js` and every call site in `kds.html` (Task 7); `reprintCupLabelExecute(orderId, idx, btn)` call signature in Task 7's `reprintIssue` matches the existing definition from before this plan (confirmed nullable `btn`).
- **No placeholders:** every step has complete, copy-pasteable code — no TBD/TODO, no "add error handling" without showing it.
