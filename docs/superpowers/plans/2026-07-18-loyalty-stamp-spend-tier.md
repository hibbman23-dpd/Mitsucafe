# Loyalty Stamp Spend-Tier — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển cơ chế tích tem từ "mỗi ly = 1 tem" sang "tem theo giá trị đơn net" (66k→1, 100k→2 cap, ≥490k→0 tem + tặng 1 ly free), siết định giá ly đổi về giá M sau promo, đồng bộ landing + docs.

**Architecture:** Tách logic tiền thành **hàm thuần** trong `gas/Orders.gs` (`_computeStampAward`, `_applyStampAward`, `_freeDrinkBaseMDiscount`) để unit-test sạch, rồi wire vào `_creditStampsForOrder` + `createOrder`. Client `web/order.js` dùng công thức đối xứng (khớp từng đồng). Ngưỡng đọc từ CONFIG với fallback hardcode.

**Tech Stack:** Google Apps Script (`.gs`, ES5-style), Node `node:test` + `vm` harness (`ops/test_logic.js`), vanilla JS frontend (`web/order.js`), static HTML (`web/mitsu.html`).

## Global Constraints

- Ngưỡng KHÔNG hardcode rải rác — đọc `getConfig(...)` với fallback: `STAMP_THRESHOLD_1=66000`, `STAMP_THRESHOLD_2=100000`, `STAMP_THRESHOLD_SPECIAL=490000`. (guardrail CLAUDE.md §4)
- Tem tính theo `order.total` **net** (sau giảm giá + sau trừ ly free), gồm **mọi món**.
- Client (`getCartDiscount`) và server (`_freeDrinkBaseMDiscount`) phải khớp **từng đồng** — bank reconcile gạch nợ theo số tiền (Orders.gs:82).
- Ly đổi = giá size **M sau promo** của ly nước đắt nhất trong giỏ (bỏ topping, bỏ chênh L); bỏ qua SKU `BK*` (bánh).
- ORDERS append-only; không update-in-place (CLAUDE.md §1).
- Run test: `node --test ops/test_logic.js`.
- Commit message theo Conventional Commits, kết bằng `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- KHÔNG cooldown chống tách đơn (đã loại ở spec §5).

## File Structure

- `gas/Orders.gs` — thêm 3 hàm thuần + sửa `createOrder` (total) + `_creditStampsForOrder` (award).
- `gas/Notify.gs` — `notifyStampUpdate` thêm nhánh `specialFreeDrink`.
- `gas/SeedSheets.gs` — CONFIG seed keys.
- `gas/Admin.gs` — danh sách CONFIG editable.
- `web/dashboard.html` — label map CONFIG (dòng ~216).
- `web/order.js` — `getCartDiscount` (mirror), preview tem theo net, `renderLoyaltySection` (luật).
- `web/mitsu.html` (+ `web/mitsu.css`) — xóa khối 3-ong, viết lại promo-box.
- `docs/system/loyalty-stamps.md` — viết lại.
- `CLAUDE.md` — guardrail §4.
- `ops/test_logic.js` — test 3 hàm thuần.

---

### Task 1: Hàm thuần `_computeStampAward(total)`

**Files:**
- Modify: `gas/Orders.gs` (thêm hàm mới, đặt ngay trước `_creditStampsForOrder` ~dòng 610)
- Test: `ops/test_logic.js`

**Interfaces:**
- Consumes: global `getConfig(key)` (Utils.gs) — trả string hoặc ''.
- Produces: `_computeStampAward(total) → { stampsEarned: number, specialFreeDrink: boolean }`

- [ ] **Step 1: Viết test fail** — thêm vào cuối `ops/test_logic.js`:

```javascript
test('_computeStampAward: bậc tem theo total net', () => {
  const cases = [
    [0, 0, false], [65999, 0, false], [66000, 1, false], [75000, 1, false],
    [99999, 1, false], [100000, 2, false], [150000, 2, false], [489999, 2, false],
    [490000, 0, true], [500000, 0, true],
  ];
  for (const [total, stampsEarned, specialFreeDrink] of cases) {
    const r = global._computeStampAward(total);
    assert.deepStrictEqual(r, { stampsEarned, specialFreeDrink }, `total=${total}`);
  }
});

test('_computeStampAward: đọc ngưỡng từ CONFIG', () => {
  const orig = global.getConfig;
  global.getConfig = (k) => ({ STAMP_THRESHOLD_1: '50000', STAMP_THRESHOLD_2: '90000', STAMP_THRESHOLD_SPECIAL: '400000' }[k] || '');
  try {
    assert.deepStrictEqual(global._computeStampAward(50000), { stampsEarned: 1, specialFreeDrink: false });
    assert.deepStrictEqual(global._computeStampAward(400000), { stampsEarned: 0, specialFreeDrink: true });
  } finally { global.getConfig = orig; }
});
```

- [ ] **Step 2: Chạy test — verify FAIL**

Run: `node --test ops/test_logic.js`
Expected: FAIL — `_computeStampAward is not a function`.

- [ ] **Step 3: Viết hàm** — thêm vào `gas/Orders.gs` ngay trước `function _creditStampsForOrder`:

```javascript
/** Tính tem thưởng theo giá trị đơn net. Trả {stampsEarned, specialFreeDrink}. */
function _computeStampAward(total) {
  var t1 = Number(getConfig('STAMP_THRESHOLD_1')) || 66000;
  var t2 = Number(getConfig('STAMP_THRESHOLD_2')) || 100000;
  var tS = Number(getConfig('STAMP_THRESHOLD_SPECIAL')) || 490000;
  var amt = Number(total) || 0;
  if (amt >= tS) return { stampsEarned: 0, specialFreeDrink: true };
  if (amt >= t2) return { stampsEarned: 2, specialFreeDrink: false };
  if (amt >= t1) return { stampsEarned: 1, specialFreeDrink: false };
  return { stampsEarned: 0, specialFreeDrink: false };
}
```

- [ ] **Step 4: Chạy test — verify PASS**

Run: `node --test ops/test_logic.js`
Expected: PASS cả 2 test mới.

- [ ] **Step 5: Commit**

```bash
git add gas/Orders.gs ops/test_logic.js
git commit -m "feat(loyalty): _computeStampAward — tem theo giá trị đơn net

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Hàm thuần `_applyStampAward(cust, award)` + wire vào `_creditStampsForOrder`

**Files:**
- Modify: `gas/Orders.gs` (thêm `_applyStampAward`; sửa `_creditStampsForOrder` dòng ~619–698)
- Test: `ops/test_logic.js`

**Interfaces:**
- Consumes: `_computeStampAward` (Task 1); `award = { stampsEarned, specialFreeDrink }`.
- Produces: `_applyStampAward(cust, award) → cust` — mutate `stamp_count`, `stamp_total_ever`, `free_drinks_earned` (rollover 10 tem + cộng 1 ly nếu special).

- [ ] **Step 1: Viết test fail** — thêm vào `ops/test_logic.js`:

```javascript
test('_applyStampAward: cộng tem + rollover 10', () => {
  const cust = { stamp_count: 8, stamp_total_ever: 8, free_drinks_earned: 0 };
  global._applyStampAward(cust, { stampsEarned: 2, specialFreeDrink: false });
  assert.deepStrictEqual(
    { stamp_count: cust.stamp_count, stamp_total_ever: cust.stamp_total_ever, free_drinks_earned: cust.free_drinks_earned },
    { stamp_count: 0, stamp_total_ever: 10, free_drinks_earned: 1 });
});

test('_applyStampAward: bậc special cộng thẳng 1 ly, không đụng tem', () => {
  const cust = { stamp_count: 3, stamp_total_ever: 13, free_drinks_earned: 1 };
  global._applyStampAward(cust, { stampsEarned: 0, specialFreeDrink: true });
  assert.deepStrictEqual(
    { stamp_count: cust.stamp_count, stamp_total_ever: cust.stamp_total_ever, free_drinks_earned: cust.free_drinks_earned },
    { stamp_count: 3, stamp_total_ever: 13, free_drinks_earned: 2 });
});
```

- [ ] **Step 2: Chạy test — verify FAIL**

Run: `node --test ops/test_logic.js`
Expected: FAIL — `_applyStampAward is not a function`.

- [ ] **Step 3: Viết hàm** — thêm vào `gas/Orders.gs` ngay sau `_computeStampAward`:

```javascript
/** Áp tem thưởng vào bản ghi khách. Mutate + trả cust. Rollover 10 tem = 1 ly. */
function _applyStampAward(cust, award) {
  cust.stamp_count += award.stampsEarned;
  cust.stamp_total_ever += award.stampsEarned;
  if (cust.stamp_count >= 10) {
    var newEarned = Math.floor(cust.stamp_count / 10);
    cust.free_drinks_earned += newEarned;
    cust.stamp_count = cust.stamp_count % 10;
  }
  if (award.specialFreeDrink) {
    cust.free_drinks_earned += 1;
  }
  return cust;
}
```

- [ ] **Step 4: Sửa `_creditStampsForOrder`** — thay khối tính `stampsEarned` (dòng ~619–632) bằng:

```javascript
  // 1. Tem theo giá trị đơn net (thay cho đếm ly)
  var award = _computeStampAward(order.total);
  var stampsEarned = award.stampsEarned;

  if (stampsEarned === 0 && !order.metadata.use_free_drink && !award.specialFreeDrink) {
    Logger.log('No stamp award for order ' + order.order_id);
    return;
  }
```

Rồi thay khối cập nhật tem (dòng ~691–698, đoạn `cust.stamp_count += stampsEarned; ... cust.stamp_count % 10;`) bằng một dòng:

```javascript
  _applyStampAward(cust, award);
```

Giữ nguyên khối `use_free_drink` decrement (dòng ~680–689) NGAY TRƯỚC dòng trên. Kết quả thứ tự trong hàm: load cust → xử lý use_free_drink → `_applyStampAward(cust, award)` → ghi row.

- [ ] **Step 5: Sửa call `notifyStampUpdate`** (dòng ~723) — truyền thêm `award.specialFreeDrink`:

```javascript
  notifyStampUpdate(normPhone, stampsEarned, cust.stamp_count, cust.stamp_total_ever, cust.free_drinks_earned - cust.free_drinks_used, award.specialFreeDrink);
```

- [ ] **Step 6: Chạy test — verify PASS**

Run: `node --test ops/test_logic.js`
Expected: PASS toàn bộ (2 test mới + các test cũ không vỡ).

- [ ] **Step 7: Commit**

```bash
git add gas/Orders.gs ops/test_logic.js
git commit -m "feat(loyalty): _applyStampAward + wire creditStamps, vá bẫy guard bậc 490k

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Hàm thuần `_freeDrinkBaseMDiscount` + wire vào `createOrder`

**Files:**
- Modify: `gas/Orders.gs` (thêm hàm; sửa `createOrder`/`_buildOrder` dòng ~103–114)
- Test: `ops/test_logic.js`

**Interfaces:**
- Consumes: global `getMenuItemBySku(sku)` → `{ price_m, price_l, ... }` hoặc null; `promoInfo = { active: boolean, percent: number }`.
- Produces: `_freeDrinkBaseMDiscount(items, promoInfo) → number` (max giá M-sau-promo của item non-`BK*`).

- [ ] **Step 1: Viết test fail** — thêm vào `ops/test_logic.js`:

```javascript
test('_freeDrinkBaseMDiscount: max giá M, bỏ topping/L, sau promo', () => {
  const orig = global.getMenuItemBySku;
  global.getMenuItemBySku = (sku) => ({
    DR001: { price_m: 30000, price_l: 40000 },
    DR002: { price_m: 45000, price_l: 55000 },
    BK001: { price_m: 20000 },
  }[sku] || null);
  try {
    const items = [
      { sku: 'DR001', qty: 1, modifiers: { size: 'L', toppings: 'trân châu' } },
      { sku: 'DR002', qty: 1 },
      { sku: 'BK001', qty: 1 },
    ];
    // Không promo: max base-M của DR001/DR002 = 45000 (bỏ bánh BK, bỏ L, bỏ topping)
    assert.strictEqual(global._freeDrinkBaseMDiscount(items, { active: false, percent: 0 }), 45000);
    // Promo -10%: 45000 -> round(40500) = 40500
    assert.strictEqual(global._freeDrinkBaseMDiscount(items, { active: true, percent: 10 }), 40500);
  } finally { global.getMenuItemBySku = orig; }
});
```

- [ ] **Step 2: Chạy test — verify FAIL**

Run: `node --test ops/test_logic.js`
Expected: FAIL — `_freeDrinkBaseMDiscount is not a function`.

- [ ] **Step 3: Viết hàm** — thêm vào `gas/Orders.gs` (gần các hàm helper, ví dụ ngay sau `_applyStampAward`):

```javascript
/** Giá trị giảm trừ ly đổi thưởng = giá size M (sau promo) đắt nhất trong giỏ, bỏ bánh (BK*). */
function _freeDrinkBaseMDiscount(items, promoInfo) {
  var maxBaseM = 0;
  (items || []).forEach(function (it) {
    var sku = String(it.sku || '').toUpperCase();
    if (sku.indexOf('BK') === 0) return; // bỏ bánh
    var menuItem = getMenuItemBySku(it.sku);
    if (!menuItem) return;
    var baseM = Number(menuItem.price_m) || 0;
    if (promoInfo && promoInfo.active && promoInfo.percent > 0) {
      baseM = Math.round(baseM * (1 - promoInfo.percent / 100));
    }
    if (baseM > maxBaseM) maxBaseM = baseM;
  });
  return maxBaseM;
}
```

- [ ] **Step 4: Wire vào `createOrder`** — thay khối tính `total` khi `useFreeDrink` (dòng ~103–114):

```javascript
  var total = subtotal;
  if (useFreeDrink) {
    // Đổi 1 ly nước size M cơ bản (sau promo, bỏ topping/L) — khớp client getCartDiscount().
    var freeDrinkDiscount = _freeDrinkBaseMDiscount(p.items, promoInfo);
    total = Math.max(0, subtotal - freeDrinkDiscount);
  }
```

- [ ] **Step 5: Chạy test — verify PASS**

Run: `node --test ops/test_logic.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add gas/Orders.gs ops/test_logic.js
git commit -m "feat(loyalty): siết ly đổi về giá M sau promo (bỏ topping/L)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: CONFIG keys mới (seed + admin + label)

**Files:**
- Modify: `gas/SeedSheets.gs:147`
- Modify: `gas/Admin.gs:31`
- Modify: `web/dashboard.html:216`

**Interfaces:**
- Produces: CONFIG keys `STAMP_THRESHOLD_1`, `STAMP_THRESHOLD_2`, `STAMP_THRESHOLD_SPECIAL` khả dụng qua `getConfig`.

- [ ] **Step 1: Sửa seed** — trong `gas/SeedSheets.gs` (khu CONFIG defaults ~dòng 147), bỏ dòng `'STAMP_PER_CUP': '1',` và thêm:

```javascript
    'STAMP_THRESHOLD_1': '66000',
    'STAMP_THRESHOLD_2': '100000',
    'STAMP_THRESHOLD_SPECIAL': '490000',
    'STAMPS_FOR_FREE': '10',
```

(Giữ `STAMPS_FOR_FREE` nếu đã có; chỉ đảm bảo `STAMP_PER_CUP` bị bỏ.)

- [ ] **Step 2: Sửa Admin editable list** — `gas/Admin.gs:31`, thay `'STAMP_PER_CUP','STAMPS_FOR_FREE',` bằng:

```javascript
  'STAMP_THRESHOLD_1','STAMP_THRESHOLD_2','STAMP_THRESHOLD_SPECIAL','STAMPS_FOR_FREE',
```

- [ ] **Step 3: Sửa label map dashboard** — `web/dashboard.html:216`, trong object `m`, bỏ `STAMP_PER_CUP:'Số tem tích lũy mỗi ly',` và thêm:

```javascript
STAMP_THRESHOLD_1:'Đơn tối thiểu tích 1 tem',STAMP_THRESHOLD_2:'Đơn tối thiểu tích 2 tem',STAMP_THRESHOLD_SPECIAL:'Đơn tối thiểu tặng thẳng 1 ly free',
```

- [ ] **Step 4: Verify** — `node --test ops/test_logic.js` (Admin.gs load không lỗi cú pháp).
Expected: PASS. Ngoài ra grep xác nhận không còn tham chiếu `STAMP_PER_CUP`:

Run: `grep -rn "STAMP_PER_CUP" gas/ web/`
Expected: không kết quả.

- [ ] **Step 5: Commit**

```bash
git add gas/SeedSheets.gs gas/Admin.gs web/dashboard.html
git commit -m "feat(loyalty): CONFIG ngưỡng tem 66k/100k/490k, bỏ STAMP_PER_CUP

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> ⚠️ **Migration prod:** SeedSheets chỉ seed lần đầu. Sau deploy phải thêm tay 3 hàng CONFIG (`STAMP_THRESHOLD_1=66000`, `_2=100000`, `_SPECIAL=490000`) vào sheet CONFIG thật. Fallback trong code (Task 1) giữ hệ thống chạy đúng kể cả khi chưa thêm.

---

### Task 5: Notify — nhánh `specialFreeDrink`

**Files:**
- Modify: `gas/Notify.gs:114–145` (`notifyStampUpdate`)

**Interfaces:**
- Consumes: caller Orders.gs:723 truyền `specialFreeDrink` (Task 2 step 5).
- Produces: `notifyStampUpdate(customerId, stampsEarned, newCount, totalEver, freeDrinksBalance, specialFreeDrink)`.

- [ ] **Step 1: Sửa signature + nhánh** — `gas/Notify.gs`, sửa đầu hàm:

```javascript
function notifyStampUpdate(customerId, stampsEarned, newCount, totalEver, freeDrinksBalance, specialFreeDrink) {
  var remaining = 10 - newCount;
  var msg;
  if (specialFreeDrink) {
    msg = '🐝 [Mitsu Café] Cảm ơn đơn hàng lớn!\n' +
          '🎁 Đơn từ 490k — tặng ngay 1 ly nước miễn phí (dùng lần sau)!\n' +
          '• Số ly nước thưởng đang có: ' + freeDrinksBalance + ' 🎁';
  } else {
    msg = '🐝 [Mitsu Café] Tích điểm thành công!\n' +
          '• Đơn này tích lũy: ' + stampsEarned + ' tem\n' +
          '• Số tem hiện tại: ' + newCount + '/10 🎟️\n' +
          '• Số ly nước thưởng đang có: ' + freeDrinksBalance + ' 🎁\n';
    if (freeDrinksBalance > 0) {
      msg += '👉 Hãy chọn "Đổi ly nước miễn phí" trong lần đặt đơn tới nhé!';
    } else {
      msg += '👉 Còn ' + remaining + ' tem nữa để nhận 1 ly nước miễn phí! (Đơn ≥66k +1 tem · ≥100k +2 tem)';
    }
  }
  sendZaloNotify(customerId, msg);
```

Giữ nguyên khối Telegram phía dưới (không đổi).

- [ ] **Step 2: Verify cú pháp** — `node --test ops/test_logic.js`.
Expected: PASS (Notify.gs không nằm trong loadScript của harness nhưng đảm bảo không lỗi ở các file phụ thuộc; nếu harness không load Notify.gs, kiểm cú pháp bằng: `node -c gas/Notify.gs` — nếu `node -c` không hỗ trợ GAS syntax, bỏ qua và dựa vào review).

Run: `node --check gas/Notify.gs`
Expected: không lỗi (exit 0).

- [ ] **Step 3: Commit**

```bash
git add gas/Notify.gs
git commit -m "feat(loyalty): notify nhánh bậc đặc biệt 490k tặng ly free

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Client `web/order.js` — mirror discount + preview tem + luật

**Files:**
- Modify: `web/order.js:2771–2790` (`getCartDiscount`)
- Modify: `web/order.js` (`renderLoyaltySection` — thêm dòng luật + preview tem)

**Interfaces:**
- Consumes: `MENU_DATA` (đã promo-adjusted qua `applyPromoPercent`), `cart`, `checkoutFormState.useFreeDrink`, `customerLoyalty`.
- Produces: `getCartDiscount()` trả `{amount, sku}` = giá M-sau-promo đắt nhất non-BK — khớp server `_freeDrinkBaseMDiscount`.

- [ ] **Step 1: Thay `getCartDiscount`** (2771–2790):

```javascript
function getCartDiscount() {
  if (!checkoutFormState.useFreeDrink || !customerLoyalty) return { amount: 0, sku: null };
  const availableRewards = customerLoyalty.free_drinks_earned - customerLoyalty.free_drinks_used;
  if (availableRewards <= 0) return { amount: 0, sku: null };

  // Ly free = giá size M (đã sau promo — MENU_DATA.price_m được applyPromoPercent chỉnh sẵn),
  // bỏ topping, bỏ chênh L, bỏ bánh (BK*). Khớp server _freeDrinkBaseMDiscount từng đồng.
  let maxBaseM = 0, sku = null;
  cart.forEach(ci => {
    const s = (ci.sku || '').toUpperCase();
    if (s.indexOf('BK') === 0) return;
    const mi = MENU_DATA.find(m => m.sku === ci.sku);
    if (!mi) return;
    const baseM = Number(mi.price_m) || 0;
    if (baseM > maxBaseM) { maxBaseM = baseM; sku = ci.sku; }
  });
  return { amount: maxBaseM, sku };
}
```

- [ ] **Step 2: Thêm helper preview tem** — thêm ngay trên `getCartDiscount`:

```javascript
// Mirror server _computeStampAward — chỉ để hiển thị tạm tính cho khách.
const STAMP_TIERS = { t1: 66000, t2: 100000, tS: 490000 };
function previewStampAward(netTotal) {
  const amt = Number(netTotal) || 0;
  if (amt >= STAMP_TIERS.tS) return { stampsEarned: 0, specialFreeDrink: true };
  if (amt >= STAMP_TIERS.t2) return { stampsEarned: 2, specialFreeDrink: false };
  if (amt >= STAMP_TIERS.t1) return { stampsEarned: 1, specialFreeDrink: false };
  return { stampsEarned: 0, specialFreeDrink: false };
}
```

- [ ] **Step 3: Hiển thị luật + preview trong `renderLoyaltySection`** — thêm vào chuỗi HTML trả về của `renderLoyaltySection` (sau phần thẻ tem hiện có), tính net = tổng giỏ − discount:

```javascript
  const cartSubtotal = cart.reduce((s, ci) => s + ci.price * ci.qty, 0);
  const netTotal = cartSubtotal - getCartDiscount().amount;
  const pv = previewStampAward(netTotal);
  const previewLine = pv.specialFreeDrink
    ? `🎁 Đơn này ≥490k — tặng 1 ly nước miễn phí!`
    : `Đơn này sẽ tích <b>${pv.stampsEarned}</b> tem`;
  const ruleHtml = `
    <div class="loyalty-rule" style="font-size:0.72rem;color:var(--text-dim);margin-top:6px;line-height:1.5;">
      ${previewLine}<br>
      Đơn từ 66k tích 1 tem · từ 100k tích 2 tem · từ 490k tặng 1 ly free · đủ 10 tem đổi 1 ly size M.
    </div>`;
```

Chèn `${ruleHtml}` vào cuối khối HTML mà `renderLoyaltySection` trả về (trước thẻ đóng `</div>` ngoài cùng của section). Đảm bảo `renderLoyaltySection` được gọi lại khi toggle `useFreeDrink` (nếu chưa, gọi re-render trong handler tick "dùng ly free").

- [ ] **Step 4: Verify bằng preview** — khởi động preview tĩnh, nạp order.js, kiểm `getCartDiscount` khớp server.

```
preview_start {url: "http://localhost:8080/order.html"}   # hoặc cấu hình launch.json phục vụ web/
```

Trong `javascript_tool` chạy trên trang: dựng `cart=[{sku:'DR002',qty:1,price:55000}]`, `checkoutFormState.useFreeDrink=true`, `customerLoyalty={free_drinks_earned:1,free_drinks_used:0}`, `MENU_DATA` chứa DR002 price_m=45000 → `getCartDiscount().amount === 45000`. Preview tem: net = 55000−45000 = 10000 → `previewStampAward(10000).stampsEarned === 0`.
Expected: đúng như trên; không lỗi console.

- [ ] **Step 5: Commit**

```bash
git add web/order.js
git commit -m "feat(loyalty): client mirror ly đổi giá M + preview tem theo net

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Landing `web/mitsu.html` — xóa khối 3-ong, viết lại promo-box

**Files:**
- Modify: `web/mitsu.html:339–377`
- Modify: `web/mitsu.css` (dọn CSS chết nếu chỉ dùng ở khối bị xóa)

**Interfaces:** không có (thay đổi trình bày).

- [ ] **Step 1: Xóa khối A** — xóa toàn bộ `<div class="loyalty-box reveal d3"> ... </div>` (dòng ~339–368, khối "Sưu tầm ba con ong").

- [ ] **Step 2: Viết lại khối B promo-box** (dòng ~371–377) thành:

```html
      <!-- Fixed promo box -->
      <div class="promo-box reveal d4">
        <div>
          <h3>Tích tem đổi ly miễn phí</h3>
          <p>Đơn từ 66.000đ tích 1 tem, từ 100.000đ tích 2 tem. Đủ 10 tem đổi 1 ly nước size M. Đơn từ 490.000đ được tặng ngay 1 ly.</p>
        </div>
        <a href="index.html?utm_source=landing" class="btn-primary">Đặt ngay</a>
      </div>
```

- [ ] **Step 3: Kiểm CSS mồ côi** — xác định `.stamps-grid`, `.stamp-card`, `.seal-badge`, `.stamps-lbl`, `.reward-lbl`, `.loyalty-box`, `.loyalty-desc` còn dùng nơi khác không:

Run: `grep -rn "stamps-grid\|stamp-card\|seal-badge\|stamps-lbl\|reward-lbl\|loyalty-box\|loyalty-desc" web/*.html`
Nếu chỉ còn trong `mitsu.css` (không html nào dùng) → xóa các rule đó khỏi `web/mitsu.css`. Nếu còn html khác dùng → giữ.

- [ ] **Step 4: Verify bằng preview** — mở `web/mitsu.html`, cuộn tới khu loyalty:

```
preview_start {url: "http://localhost:8080/mitsu.html"}
```
`read_page` xác nhận: không còn "Sưu tầm ba con ong" / "gom đủ 3 tính cách"; có "Tích tem đổi ly miễn phí" + luật 66k/100k/490k. `read_console_messages` không lỗi. `computer screenshot` khu vực loyalty.
Expected: đúng nội dung mới, layout không vỡ.

- [ ] **Step 5: Commit**

```bash
git add web/mitsu.html web/mitsu.css
git commit -m "feat(loyalty): landing bỏ khối 3-ong, promo-box theo luật tem mới

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Docs + guardrail

**Files:**
- Rewrite: `docs/system/loyalty-stamps.md`
- Modify: `CLAUDE.md` §4 (dòng guardrail "chỉ beverage")

**Interfaces:** không có.

- [ ] **Step 1: Viết lại `docs/system/loyalty-stamps.md`** toàn bộ:

```markdown
# Loyalty Stamps (v3 — spend-tier)
> Tách từ CLAUDE.md §11. Index: ../../CLAUDE.md · Đọc khi đụng _computeStampAward / _creditStampsForOrder / _freeDrinkBaseMDiscount / redeem / Zalo stamp template.

## Quy tắc tích tem (theo giá trị đơn NET, gồm mọi món)
| Đơn net (order.total) | Tem | Thưởng thêm |
|---|---|---|
| < 66.000đ | 0 | — |
| ≥ 66.000đ, < 100.000đ | 1 | — |
| ≥ 100.000đ, < 490.000đ | 2 (cap) | — |
| ≥ 490.000đ | 0 | +1 ly free cộng thẳng free_drinks_earned (dùng đơn sau) |

- Ngưỡng ở CONFIG: STAMP_THRESHOLD_1=66000, STAMP_THRESHOLD_2=100000, STAMP_THRESHOLD_SPECIAL=490000 (fallback hardcode trong _computeStampAward).
- Net = sau giảm giá toàn quán + sau trừ ly đổi thưởng.
- Tem không hết hạn (review sau 12 tháng).

## Đổi thưởng
- 10 tem = 1 ly nước size M cơ bản (chỉ nước, KHÔNG topping, KHÔNG chênh size L).
- Giảm trừ = giá M SAU promo của ly đắt nhất trong giỏ (bỏ bánh BK*). Server _freeDrinkBaseMDiscount + client getCartDiscount phải khớp từng đồng (bank reconcile).
- Ly free tích được chỉ dùng cho ĐƠN SAU (free_drinks_earned − free_drinks_used − reserved).

## Flow khi DELIVERED (_creditStampsForOrder)
  award = _computeStampAward(order.total)
  guard: stampsEarned===0 && !use_free_drink && !specialFreeDrink → return
  load cust → xử lý use_free_drink (decrement) → _applyStampAward(cust, award) → ghi row
  notifyStampUpdate(..., specialFreeDrink)

## Zalo templates
  Tích:    "🐝 Tích [N] tem! [X]/10 🎟️ · Đơn ≥66k +1 · ≥100k +2"
  Special: "🎁 Đơn ≥490k — tặng ngay 1 ly nước miễn phí (dùng lần sau)!"
  Đủ ly:   "👉 Hãy chọn 'Đổi ly nước miễn phí' trong lần đặt đơn tới nhé!"

## KHÔNG làm
  ❌ cooldown chống tách đơn (phạt khách quay lại thật — đã loại)
  ❌ hardcode ngưỡng ngoài _computeStampAward fallback
  ❌ trừ ly free theo giá gốc niêm yết (trừ lấn món khác) — luôn dùng giá sau promo
```

- [ ] **Step 2: Sửa guardrail `CLAUDE.md` §4** — thay dòng `❌ Cộng stamp cho pastry/retail — chỉ beverage` bằng:

```
❌ Tính tem theo số ly / chỉ beverage — nay theo GIÁ TRỊ ĐƠN net gồm mọi món (xem docs/system/loyalty-stamps.md)
```

- [ ] **Step 3: Verify** — grep xác nhận không còn mô tả cũ "mỗi ly = 1 tem" trong docs system:

Run: `grep -rn "mỗi ly\|10 ly\|Mua 1 ly" docs/system/loyalty-stamps.md`
Expected: không còn (đã thay bằng luật spend-tier).

- [ ] **Step 4: Commit**

```bash
git add docs/system/loyalty-stamps.md CLAUDE.md
git commit -m "docs(loyalty): loyalty-stamps v3 spend-tier + guardrail CLAUDE.md

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Gate trước merge (4 lớp — theo global rule)

Sau Task 8, chạy tuần tự (model rẻ chạy, chief đọc báo cáo):

1. **Unit:** `node --test ops/test_logic.js` — toàn bộ PASS.
2. **Syntax:** `node --check gas/Orders.gs gas/Notify.gs` (từng file) — exit 0.
3. **Grep sạch:** không còn `STAMP_PER_CUP`; client/server free-drink cùng công thức.
4. **E2E browser:** preview `order.html` — flow đặt đơn có/không dùng ly free, đối chiếu `getCartDiscount` == server `subtotal − total`; preview `mitsu.html` — landing đúng nội dung.
5. **(Đề xuất) Fable audit diff** trước khi `gas_push.py --deploy` — review money-path.

## Deploy (sau khi gate xanh)

- GAS: `python3 ops/gas_push.py` (KHÔNG `--deploy` vẫn đụng HEAD cron; `/exec` chạy version pin — cân nhắc `--deploy` để retarget). Xem memory `project_gas_deploy_head_vs_version`.
- Web: deploy `web/*` theo pipeline hiện tại (CF Worker + GitHub Pages).
- **Thêm tay 3 CONFIG rows** trên sheet: STAMP_THRESHOLD_1=66000, _2=100000, _SPECIAL=490000.
```
