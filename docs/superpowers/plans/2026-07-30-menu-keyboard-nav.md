# Gọi món — điều hướng bằng bàn phím (category + món theo số) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the "➡️ Gọi món" screen in `web/kds.html`, let staff press `1`–`8` to jump straight to a menu category (7 real categories + a synthetic "Cacao" bucket), then press a second key (`1234567890-=`) to jump straight into that item's modifier sheet (or straight into the cart if it has no modifiers), with `Backspace` stepping back one level and any successful add landing back on "Tất cả".

**Architecture:** A new, parallel rendering path (`numNavBucket` state + `computeNumNavBuckets()`/`renderNumNavItems()`) that `renderMenuGrid()` short-circuits into when active — the existing touch-driven category pills and sectioned grid are completely untouched code paths, still reachable and unchanged whenever `numNavBucket` is `null`. Keyboard handling extends the existing single `document.addEventListener('keydown', ...)` listener in `web/kds.html` (the same one 2026-07-29's Task 4 added size-overlay shortcuts to) with one new top-level branch plus one added key inside the existing `#size-overlay` branch.

**Tech Stack:** Vanilla JS, no build step, no backend involvement (this is 100% `web/kds.html` client logic).

## Global Constraints

- Never run against the live prod server on port 5001. All browser verification uses a throwaway test backend: `PRINT_ENGINE=noop SERVER_PORT=5002 GATEWAY_DB=/tmp/<unique>.db GAS_WEBAPP_URL="" GATEWAY_SYNC=0 ONLINE_POLL=0`, run from `print-server/`.
- No automated test exists for `kds.html` (no JS test harness covers this file) — every step is browser-verified, matching how 2026-07-29's Task 4 (also a pure kds.html keyboard-shortcut feature) was verified.
- Line numbers below reflect the repo state at plan-writing time (`web/kds.html`, current `launch-hardening` HEAD). If a line has drifted by the time you edit, locate the edit by the exact code shown, not the raw number.
- Feature is scoped to `web/kds.html`'s main "➡️ Gọi món" screen (`activeView === 'menu'`) only — do not touch `checkoutOpenAddItem`/`selectSwapNewItem`'s pickers.
- 8 bucket key mapping (fixed, do not change): `1`=coffee, `2`=hot_drinks, `3`=latte, `4`=fruit_tea, `5`=milk_tea, `6`=yogurt, `7`=coldbrew, `8`=synthetic Cacao bucket (every available item whose name contains "CA CAO", pulled out of its home category for this bucket computation only).
- Item key sequence within a bucket (fixed, do not change): `['1','2','3','4','5','6','7','8','9','0','-','=']` (12 slots; current max bucket size is 11, confirmed against live menu data — see spec §3).

---

### Task 1: Bucket data + rendering + keyboard wiring

**Files:**
- Modify: `web/kds.html` — CSS (~line 218-298 area, near `.menu-cat-header`/`.cart-qty-badge`), state (~line 861, near `let activeView = 'orders';`), `switchView()` (~line 1289), `renderMenuGrid()` (~line 3016, one new early-return line), new functions near `renderMenuGrid()`/`renderCatPills()` (~line 2936-3016), `addToStaffCart()` (~line 3693), the keydown listener (~line 3279-3323) and the existing `#size-overlay` branch inside it (~line 3286-3297).

**Interfaces:**
- Consumes: `MENU_DATA`, `CATEGORIES` (globals from `menu-data.js`), `activeView`, `staffCart` (existing globals), `tapMenuItem(sku)`, `addToStaffCart(item, modifiers, price)`, `getShortNameInfo(name)`, `CAT_EMOJI`, `ROLE_BADGE`, `fmt(n)`, `esc()` — all pre-existing, unchanged signatures.
- Produces: `let numNavBucket = null;` (module-level state: `null` or `1`-`8`), `const NUM_NAV_KEYS = ['1','2','3','4','5','6','7','8','9','0','-','='];`, `computeNumNavBuckets()` (returns `{1: [...items], ..., 8: [...items]}`), `enterNumNavBucket(n)`, `exitNumNavBucket()`, `renderNumNavItems()` — used only within this task, no other task depends on them.

- [ ] **Step 1: Add the number-badge + bucket-header CSS**

Read `web/kds.html` around line 291-298 (the `.cart-qty-badge` rule) to confirm current content, then insert directly after it (before the `/* ── CART BAR ── */` comment at line 300):

```css
    .num-badge {
      position: absolute; top: 8px; left: 8px;
      background: linear-gradient(135deg, #d8a94a, #b8863a); color: #1b140b;
      font-size: 0.95rem; font-weight: 800;
      min-width: 26px; height: 26px; padding: 0 4px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 3px 8px rgba(216, 169, 74, 0.5);
      z-index: 2;
    }
    .numnav-strip {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 16px; margin-bottom: 12px;
      background: linear-gradient(90deg, rgba(216,169,74,0.25), rgba(20,30,33,0.8));
      border-left: 4px solid #d8a94a; border-radius: 0 10px 10px 0;
      font-size: 0.95rem; font-weight: 700; color: #fff;
    }
```

- [ ] **Step 2: Add the `numNavBucket` state + item key sequence**

Read `web/kds.html` around line 858-861 (the `// ─── STATE ───` block, `let allOrders = [];` / `let activeFilter = 'all';` / `let activeView = 'orders';`) to confirm current content, then insert directly after `let activeView   = 'orders';`:

```js
let numNavBucket = null;   // null = màn "Tất cả" bình thường; 1-8 = đang xem 1 bucket bàn phím
const NUM_NAV_KEYS = ['1','2','3','4','5','6','7','8','9','0','-','='];
```

- [ ] **Step 3: `switchView()` clears the bucket when leaving "Gọi món"**

Read `web/kds.html` around line 1289-1300 (`function switchView(v) { ... }`) to confirm current content, then replace:

```js
function switchView(v) {
  activeView = v;
```

with:

```js
function switchView(v) {
  if (activeView === 'menu' && v !== 'menu') numNavBucket = null;
  activeView = v;
```

(leave every other line in the function unchanged).

- [ ] **Step 4: Bucket computation + enter/exit + render functions**

Read `web/kds.html` around line 3016 (`function renderMenuGrid() {`) to confirm the exact current opening lines, then insert these five new functions directly **before** `function renderMenuGrid() {`:

```js
// ─── KEYBOARD NUMBER NAV (chỉ màn "Gọi món") ───────────────────────────────
// 8 bucket: 7 category thật (1-7) + 1 bucket ảo gom hết món có "CA CAO" (8) —
// tách cacao ra để không category nào vượt quá 12 món (đủ 12 phím 1234567890-=).
function computeNumNavBuckets() {
  const out = {};
  CATEGORIES.forEach((cat, i) => {
    out[i + 1] = MENU_DATA
      .filter(m => m.available && m.subcategory === cat.id && !m.name.toUpperCase().includes('CA CAO'))
      .sort((a, b) => a.sort_order - b.sort_order);
  });
  out[8] = MENU_DATA
    .filter(m => m.available && m.name.toUpperCase().includes('CA CAO'))
    .sort((a, b) => a.sort_order - b.sort_order);
  return out;
}

function enterNumNavBucket(n) {
  if (n < 1 || n > 8) return;
  numNavBucket = n;
  const pills = document.getElementById('cat-pills');
  if (pills) pills.classList.add('hidden');
  renderMenuGrid();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exitNumNavBucket() {
  numNavBucket = null;
  const pills = document.getElementById('cat-pills');
  if (pills) pills.classList.remove('hidden');
  renderMenuGrid();
}

function numNavBucketLabel(n) {
  if (n === 8) return { emoji: '🍫', label: 'Cacao' };
  const cat = CATEGORIES[n - 1];
  return cat ? { emoji: cat.emoji, label: cat.label } : { emoji: '🍶', label: '' };
}

function renderNumNavItems() {
  const items = computeNumNavBuckets()[numNavBucket] || [];
  const inCart = {};
  staffCart.forEach(c => { inCart[c.sku] = (inCart[c.sku] || 0) + c.qty; });
  const { emoji, label } = numNavBucketLabel(numNavBucket);

  const cardsHtml = items.map((item, idx) => {
    const key = NUM_NAV_KEYS[idx];
    const itemEmoji = CAT_EMOJI[item.subcategory] || '🍶';
    const badge = ROLE_BADGE[item.role];
    const qty = inCart[item.sku] || 0;
    const priceText = item.price_l
      ? `M: ${fmt(item.price_m)} · L: ${fmt(item.price_l)}`
      : fmt(item.price_m);
    const nameInfo = getShortNameInfo(item.name);

    return `
      <div class="menu-card${qty ? ' in-cart' : ''}" onclick="tapMenuItem('${item.sku}')">
        ${key ? `<div class="num-badge">${key}</div>` : ''}
        <div class="menu-card-top">
          <div class="menu-emoji-wrap">${itemEmoji}</div>
          ${badge ? `<div class="menu-badge ${badge.cls}">${badge.text}</div>` : ''}
        </div>
        <div>
          ${nameInfo.prefix ? `<div class="menu-family-tag">${nameInfo.prefix}</div>` : ''}
          <div class="menu-name">${nameInfo.shortName}</div>
          ${item.name_jp ? `<div class="menu-jp">${item.name_jp}</div>` : ''}
        </div>
        <div class="menu-price">${priceText}</div>
        ${qty ? `<div class="cart-qty-badge">${qty}</div>` : ''}
      </div>`;
  }).join('');

  document.getElementById('menu-grid').innerHTML = `
    <div class="numnav-strip">
      <div style="display:flex; align-items:center; gap:8px;">
        <span>${emoji}</span><span>${label}</span>
      </div>
      <span class="menu-cat-count">${items.length} món · Backspace để quay lại</span>
    </div>
    <div class="menu-grid">${cardsHtml || '<div class="empty-state" style="grid-column:1/-1; padding:50px 20px;"><div class="icon">🌿</div>Không có món trong mục này.</div>'}</div>`;
}

```

- [ ] **Step 5: `renderMenuGrid()` short-circuits into the bucket view**

Read `web/kds.html` around line 3016-3020 (the start of `function renderMenuGrid() {`) to confirm current content, then replace:

```js
function renderMenuGrid() {
  const inCart = {};
  staffCart.forEach(c => { inCart[c.sku] = (inCart[c.sku] || 0) + c.qty; });

  let totalVisibleItems = 0;
```

with:

```js
function renderMenuGrid() {
  if (numNavBucket) { renderNumNavItems(); return; }

  const inCart = {};
  staffCart.forEach(c => { inCart[c.sku] = (inCart[c.sku] || 0) + c.qty; });

  let totalVisibleItems = 0;
```

(everything below this in the function — the `fam_cacao`/`fam_matcha` branch and the normal sectioned-category branch — is untouched, still runs exactly as today whenever `numNavBucket` is falsy).

- [ ] **Step 6: `addToStaffCart()` returns to "Tất cả" after every add**

Read `web/kds.html` around line 3693-3700 (`function addToStaffCart(item, modifiers, price) { ... }`) to confirm current content, then replace:

```js
function addToStaffCart(item, modifiers, price) {
  const key = makeCartKey(item.sku, modifiers);
  const ex  = staffCart.find(c => c._key === key);
  if (ex) { ex.qty++; ex.subtotal = ex.qty * ex.price; }
  else     staffCart.push({ _key:key, sku:item.sku, name:item.name, qty:1, price, modifiers, subtotal:price });
  updateCartBar();
  renderMenuGrid();
}
```

with:

```js
function addToStaffCart(item, modifiers, price) {
  const key = makeCartKey(item.sku, modifiers);
  const ex  = staffCart.find(c => c._key === key);
  if (ex) { ex.qty++; ex.subtotal = ex.qty * ex.price; }
  else     staffCart.push({ _key:key, sku:item.sku, name:item.name, qty:1, price, modifiers, subtotal:price });
  updateCartBar();
  // Thêm giỏ xong (dù bấm số hay chạm tay) -> luôn về "Tất cả", đúng yêu cầu điều hướng bàn phím.
  if (numNavBucket) exitNumNavBucket();
  else renderMenuGrid();
}
```

(this uses `exitNumNavBucket()` instead of a bare `renderMenuGrid()` only when a bucket was active — when it wasn't, behavior is byte-for-byte identical to today).

- [ ] **Step 7: Keydown listener — digit/Backspace handling for the main menu grid**

Read `web/kds.html` around line 3316-3323 (the existing `// 3. Main POS Menu` branch, the last branch in the listener before its closing `});`) to confirm current content, then replace:

```js
  // 3. Main POS Menu (Cart Modal is NOT open, press M to open cart & review order)
  if (e.key && e.key.toLowerCase() === 'm' && !isInputFocused) {
    if (staffCart && staffCart.length > 0) {
      e.preventDefault();
      openCartSheet(); // Phím M = Mở giỏ hàng & Gửi đơn từ màn hình chính!
    }
  }
});
```

with:

```js
  // 3. Main POS Menu (Cart Modal is NOT open, press M to open cart & review order)
  if (e.key && e.key.toLowerCase() === 'm' && !isInputFocused) {
    if (staffCart && staffCart.length > 0) {
      e.preventDefault();
      openCartSheet(); // Phím M = Mở giỏ hàng & Gửi đơn từ màn hình chính!
    }
    return;
  }

  // 4. Gọi món — bàn phím số chọn category (1-8) rồi chọn món (1234567890-=)
  if (activeView === 'menu' && !isInputFocused) {
    if (e.key === 'Backspace') {
      if (numNavBucket) { e.preventDefault(); exitNumNavBucket(); }
      return;
    }
    if (/^[1-8]$/.test(e.key)) {
      e.preventDefault();
      enterNumNavBucket(Number(e.key));
      return;
    }
    if (numNavBucket) {
      const idx = NUM_NAV_KEYS.indexOf(e.key);
      if (idx >= 0) {
        const items = computeNumNavBuckets()[numNavBucket] || [];
        const item = items[idx];
        if (item) { e.preventDefault(); tapMenuItem(item.sku); }
      }
    }
  }
});
```

(note: `9`/`0`/`-`/`=` are consumed here only when `numNavBucket` is set — when it's `null`, they fall through as no-ops, exactly like today; `1`-`8` always enter a bucket when on the menu screen, matching the spec's "digits switch bucket directly, no need to back out first").

- [ ] **Step 8: `Backspace` inside the modifier sheet closes it (same as `Escape`)**

Read `web/kds.html` around line 3286-3297 (the existing `#size-overlay` branch, block 1 of the listener) to confirm current content, then replace:

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

with:

```js
  // 1. Option Picker Modal (Choose Size / Toppings / Note)
  if (sizeOverlay && !sizeOverlay.classList.contains('hidden')) {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmCustomOrder();
    } else if (e.key === 'Escape' || e.key === 'Backspace') {
      if (!isInputFocused) {
        e.preventDefault();
        closeSizeSheet();
      }
    } else if (!isInputFocused) {
      handleSizeOverlayShortcut(e);
    }
    return;
  }
```

(the `!isInputFocused` guard on `Backspace` specifically matters here — unlike `Escape`, `Backspace` is a normal editing key, so it must NOT close the sheet while the staff is deleting text in the "Ghi chú riêng món này" note field; `Escape`'s behavior is unchanged, still closes regardless of focus, matching today).

- [ ] **Step 9: Browser-verify the full flow on the test backend**

```bash
cd print-server && PRINT_ENGINE=noop SERVER_PORT=5002 GATEWAY_DB=/tmp/numnav_test.db GAS_WEBAPP_URL="" GATEWAY_SYNC=0 ONLINE_POLL=0 python3 print_server.py &
```

Open `http://localhost:5002/kds.html`, click the "➡️ Gọi món" tab. Then, using the browser tool's keyboard-input action (not clicks, except to first focus the page body away from any input):

1. Press `3` (latte). Expected: grid shows only Latte-subcategory items minus every "CA CAO"-named one (11 items per the spec's table), the `#cat-pills` row is hidden, a strip reads "🥛 Latte · 11 món · Backspace để quay lại", and item cards show number badges `1` through `9`, then `0`, then `-` for the 10th/11th card respectively (confirm via `read_page` — the badge text content — not just a screenshot guess).
2. Press `8` directly (no Backspace first). Expected: jumps straight to the Cacao bucket (10 items per the spec's table), strip updates to "🍫 Cacao".
3. Press `1` — position #1 in the Cacao bucket is `DR012 CA CAO SỮA` (has sugar/ice modifiers), sorted by `sort_order`. Expected: the modifier sheet (`#size-overlay`) opens with "CA CAO SỮA" in the title, same as tapping that card would.
4. Press `Backspace` while the sheet is open. Expected: sheet closes, back on the Cacao bucket grid (strip still reads "🍫 Cacao", not "Tất cả" — `numNavBucket` unchanged).
5. Press `Backspace` again (now on the bucket grid, no overlay open). Expected: back to the normal "Tất cả" sectioned view, `#cat-pills` row visible again.
6. Every current menu item has at least one modifier option (`sugar`/`ice` at minimum — confirmed by checking `web/menu-data.js`, no item has an empty `customizations`), so `tapMenuItem`'s no-options direct-add branch (`addToStaffCart(item, {}, item.price_m)` with no sheet) is not reachable through today's real data — test Step 6's actual code change directly instead: with a bucket active (press `2` first), open `javascript_tool` and run `addToStaffCart({sku:'TEST-NUMNAV', name:'Test'}, {}, 1000); numNavBucket;` — expected return value `null` (confirms the hook fires and resets state exactly like the real no-options path would), and the cart bar reflects one more item. Remove the synthetic line from `staffCart` afterward (`staffCart.pop()`) so it doesn't pollute the rest of the verification run.
7. Press `3` again, then press a number key for an item **with** modifiers, adjust a chip or two, press `Enter`. Expected: item added to cart, sheet closes, view lands on "Tất cả" (not back on Latte).
8. Click into the menu search box (`#menu-search-input`), type a digit (e.g. `3`). Expected: the digit appears in the search box as text; no bucket is entered (guarded by `isInputFocused`).
9. Open a modifier sheet for any item, click into the "Ghi chú riêng món này" textarea, press `Backspace` while it has text. Expected: normal text deletion in the field; the sheet does **not** close.
10. Switch to "📋 Đơn hôm nay" tab while a bucket is active (e.g. press `4` first, then click the orders tab), then switch back to "➡️ Gọi món". Expected: back on "Tất cả", not still showing the fruit_tea bucket (confirms the `switchView` reset from Step 3).

Check `read_console_messages` (`onlyErrors: true`) after the full run — zero errors expected throughout.

Kill the test server and delete the temp DB when done: `pkill -f "SERVER_PORT=5002"; rm -f /tmp/numnav_test.db /tmp/numnav_test.db-shm /tmp/numnav_test.db-wal`.

- [ ] **Step 10: Commit**

```bash
git add web/kds.html
git commit -m "feat(kds): Gọi món — bấm số 1-8 chọn category (8=Cacao gộp), bấm số chọn món, Backspace lùi lại, về Tất cả sau khi thêm giỏ"
```

---

## Self-Review Notes (already applied above)

- **Spec coverage:** §3 (Cacao bucket math) → Step 4's `computeNumNavBuckets()`; §4 architecture (state, functions, `renderMenuGrid` early-return, listener extension, `addToStaffCart` hook) → Steps 2, 4, 5, 6, 7; §5 interaction detail (enter/switch/back/search-guard) → Steps 7, 8; §6 visual (badge, strip, hidden pills) → Steps 1, 4; §7 edge cases (`switchView` reset, `Backspace` default-action prevention, empty bucket) → Steps 1 (empty-state markup), 3, 7. All spec sections have a corresponding step.
- **Type/name consistency checked:** `numNavBucket`/`NUM_NAV_KEYS`/`computeNumNavBuckets`/`enterNumNavBucket`/`exitNumNavBucket`/`renderNumNavItems`/`numNavBucketLabel` are the same names across every step that references them (Steps 2, 4, 5, 6, 7 all agree); `computeNumNavBuckets()`'s return shape (`{1: [...], ..., 8: [...]}`) matches how Step 7's listener indexes it (`computeNumNavBuckets()[numNavBucket]`) and how `renderNumNavItems()` indexes it (Step 4).
- **No placeholders:** every step has complete, copy-pasteable code — no TBD/TODO.
