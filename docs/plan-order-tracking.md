# Plan hoàn chỉnh — In hoá đơn khi Thanh toán + Pop-up Theo dõi Đa đơn + Sửa Timeline Signage

> Phiên bản gộp (v2) — đã bổ sung các bug phát hiện khi rà soát code thực tế:
> `order_status` trả `undefined`, thiếu `payment_status`, timeline signage tắt vĩnh viễn,
> ong nhảy loạn mỗi 10s, `short_code` trùng, đơn treo vô hạn, dead code.
> Mục tiêu: một bản đủ rõ để Antigravity thực thi không cần đoán.

---

## Bối cảnh & nguyên nhân gốc (đọc trước khi sửa)

Khi rà soát, **endpoint dữ liệu cho 2 màn hình đi theo 2 đường khác nhau** — và một đường bị hỏng:

| Endpoint | Nguồn dữ liệu | Tình trạng |
|----------|---------------|-----------|
| `active_orders` (signage dùng) | `getTodayOrders()` → field **đúng** | OK về data, hỏng ở CSS |
| `order_status` (phone dùng) | `_rowToOrder()` → **thiếu field** | `short_code`/`delivery_type`/`payment_method` = `undefined`, **không có** `payment_status` |

Vì `_rowToOrder` ([gas/Orders.gs:264](file:///Users/dpd/Projects/lamha-kissaten/gas/Orders.gs)) nhét các giá trị vào `order.metadata.*` chứ không phải top-level, nên `order_status` ([gas/Code.gs:280](file:///Users/dpd/Projects/lamha-kissaten/gas/Code.gs)) đọc `order.short_code` → `undefined`.

**Quyết định kiến trúc:** Thống nhất pop-up phone **poll chung endpoint `active_orders`** (đã có field đúng) thay vì gọi `order_status` N lần. Chỉ cần mở rộng `active_orders` thêm `total`, `payment_status`, `table_id`. Vẫn vá `order_status` cho đường reload đơn lẻ (init).

---

## Proposed Changes

### 1. Google Apps Script — chuẩn hoá endpoint dữ liệu trạng thái

#### [MODIFY] [gas/Code.gs](file:///Users/dpd/Projects/lamha-kissaten/gas/Code.gs)

**1a. Mở rộng `active_orders`** (khoảng dòng 292–300) để phục vụ CHUNG cho cả phone popup lẫn signage. Thêm `total`, `payment_status`, `table_id`. **KHÔNG thêm** `customer_name`/`customer_id` (signage là màn hình công cộng — tránh lộ PII):

```js
if (action === 'active_orders') {
  var allOrders = getTodayOrders();
  var filtered = allOrders.filter(function(o) {
    return ['NEW', 'CONFIRMED', 'MAKING', 'READY'].indexOf(o.status) !== -1;
  }).map(function(o) {
    return {
      order_id:       o.order_id,
      status:         o.status,
      delivery_type:  o.delivery_type,
      short_code:     o.short_code,
      total:          o.total,            // ← THÊM (popup cần để dựng QR)
      payment_status: o.payment_status,   // ← THÊM (popup quyết định hiện QR hay ✅)
      table_id:       o.table_id          // ← THÊM (signage hiện số bàn thay short_code)
    };
  });
  return _jsonResponse({ ok: true, orders: filtered });
}
```
> `getTodayOrders()` ([gas/Orders.gs:388](file:///Users/dpd/Projects/lamha-kissaten/gas/Orders.gs)) đã trả sẵn `total` (row[11]), `payment_status` (row[19]), `table_id` (row[6]) — chỉ cần map ra.

**1b. Vá `order_status`** (dòng 275–290) cho đường reload đơn lẻ trong `init()`. Đọc trực tiếp từ row + metadata, và **thêm `payment_status`**:

```js
if (action === 'order_status') {
  var orderId = e.parameter.order_id;
  if (!orderId) return _jsonResponse({ ok: false, error: 'order_id required' });
  var row = _findOrderRow(orderId);
  if (!row) return _jsonResponse({ ok: false, error: 'not found' });
  var order = _rowToOrder(row.data);
  return _jsonResponse({
    ok: true,
    order_id:       orderId,
    status:         order.status,
    delivery_type:  order.metadata.delivery_type,  // ← sửa: lấy từ metadata
    short_code:     order.metadata.short_code,      // ← sửa: lấy từ metadata
    total:          order.total,
    payment_method: row.data[18],                   // ← col S payment_method
    payment_status: row.data[19]                    // ← col T payment_status (THÊM)
  });
}
```

**1c. (Tuỳ chọn, sạch hơn)** Có thể sửa `_rowToOrder` ([gas/Orders.gs:264](file:///Users/dpd/Projects/lamha-kissaten/gas/Orders.gs)) trả thêm top-level `short_code`, `delivery_type`, `payment_method`, `payment_status` để mọi nơi dùng được. Nếu làm 1c thì 1b chỉ cần đọc `order.short_code` như cũ. Chọn 1 trong 2, đừng làm cả hai lệch nhau.

> **Giữ guardrail CLAUDE.md:** ORDERS append-only — các thay đổi trên CHỈ đọc, không update-in-place. `markOrderPaid` đã đúng (chỉ set `payment_status=PAID`, giữ nguyên trạng thái bếp) — **không sửa**.

**1d. Deploy:** "Manage deployments → edit (bút chì) → **New version**" trên **đúng Deployment ID hiện tại** để URL không đổi. KHÔNG tạo "New deployment" mới (sẽ đổi URL, làm hỏng `order.js`/`kds.html`/`signage.js`/plist).

---

### 2. Print Poller — sửa lỗi 403 (in hoá đơn khi PAID)

#### [MODIFY] [com.lamha.kissaten.printpoller.plist](file:///Users/dpd/Library/LaunchAgents/com.lamha.kissaten.printpoller.plist)

**Lưu ý mâu thuẫn cần xác minh trước:** nếu mục 1d giữ nguyên Deployment ID thì **URL không đổi → không cần sửa plist**. Lỗi 403 khi đó KHÔNG phải do URL. Chẩn đoán theo thứ tự:

1. `launchctl list | grep printpoller` — kiểm tra tiến trình còn sống không (macOS auto-update reboot có thể giết launchd; CLAUDE.md cấm bật auto-update macOS).
2. Xem log poller: 403 đến từ GAS (token/deployment) hay từ Flask server (5001)?
3. Đối chiếu `REPORT_API_TOKEN` trong plist khớp `CONFIG.REPORT_API_TOKEN` bên GAS (`7vk8wCYekp_LYLdaNQMOM--hElFR8vDt`).
4. Xác nhận deployment để chế độ **Execute as: Me / Who has access: Anyone**.

Chỉ cập nhật `GAS_WEBAPP_URL` trong plist **nếu** xác định URL đã thật sự đổi. Sau khi sửa:
```bash
launchctl unload ~/Library/LaunchAgents/com.lamha.kissaten.printpoller.plist
launchctl load   ~/Library/LaunchAgents/com.lamha.kissaten.printpoller.plist
```

> Luồng in-on-paid **đã đúng** ở code: `_getPendingPrintOrders` ([gas/Code.gs:746](file:///Users/dpd/Projects/lamha-kissaten/gas/Code.gs)) lọc `status==='DELIVERED' || payment_status==='PAID'` + `printed_at` rỗng → đơn PAID in qua poller, idempotent (in xong set `printed_at`, không in lại). Không cần sửa logic in.

---

### 3. Frontend phone — Pop-up Theo dõi Đa đơn (Bottom Sheet)

#### [MODIFY] [web/order.js](file:///Users/dpd/Projects/lamha-kissaten/web/order.js)

**3a. Lưu trữ đa đơn — `localStorage['lhk_active_orders']`** (mảng), thay cho key đơn lẻ `active_order_id`.
- Mỗi phần tử: `{ order_id, short_code, total, delivery_type, payment_method, status, payment_status, completed_at }`.
- **Khoá quản lý mảng = `order_id`** (KHÔNG dùng `short_code` — nó per-device nên trùng giữa khách). `short_code` chỉ để hiển thị.
- Viết helper `loadActiveOrders()` / `saveActiveOrders()` an toàn try/catch.
- **Migration:** lúc load, nếu còn key cũ `active_order_id` thì chuyển thành 1 phần tử mảng rồi `removeItem('active_order_id')`.

**3b. `submitOrder`** ([order.js:2008](file:///Users/dpd/Projects/lamha-kissaten/web/order.js)):
- Sau khi nhận `data.order_id`: **push** vào `lhk_active_orders` với `status:'NEW'`, `payment_status: paymentMethod==='cash' ? 'PENDING':'PENDING'`, `completed_at: null`.
- KHÔNG chuyển `screen='tracking'` nữa. Đặt `screen='menu'`, `sheet='tracking'`, gọi `startTrackingPolling()` + `render()`.
- Bỏ 2 lần `render()` liên tiếp (dòng 2029–2030).

**3c. `init`** ([order.js:2626](file:///Users/dpd/Projects/lamha-kissaten/web/order.js)):
- Đọc `lhk_active_orders`. Nếu có đơn **chưa hoàn tất** (`completed_at===null`): giữ `screen='menu'` (KHÔNG ép sang tracking), chạy `startTrackingPolling()`. Badge nổi sẽ tự hiện.
- Áp **auto-expiry** ngay lúc load (xem 3d).

**3d. Viết lại `startTrackingPolling`** ([order.js:696](file:///Users/dpd/Projects/lamha-kissaten/web/order.js)) — **poll CHUNG `active_orders` 1 lần/nhịp**, không gọi `order_status` N lần:
1. Mỗi 10s: `GET ?action=active_orders&_cb=${Date.now()}` (cache-buster; **bỏ hẳn `${TQ}${DQ}`** — biến này không tồn tại trong order.js, là nguyên nhân ReferenceError làm đứng trạng thái. Endpoint `active_orders`/`order_status` công khai, không cần token).
2. Build map `liveById` từ response.
3. Với mỗi đơn local `completed_at===null`:
   - Nếu có trong `liveById`: cập nhật `status` + `payment_status` từ server.
   - Nếu **biến mất** khỏi `liveById` (đã rời NEW/CONFIRMED/MAKING/READY): đơn đã xong/huỷ → gọi **một** `order_status&order_id=...&_cb=` để biết chính xác `DELIVERED` vs `CANCELLED`, set `status` đó và `completed_at = Date.now()`.
4. Với đơn `completed_at!==null`: nếu `Date.now() - completed_at > 30000` → xoá khỏi mảng.
5. **Auto-expiry chống treo:** xoá đơn nếu `order_id` không chứa ngày hôm nay (format `ORD-YYYYMMDD-XXXX`) HOẶC đơn cũ > 3 giờ, kể cả khi chưa DELIVERED (khách bỏ đơn / quán quên bấm).
6. Re-render chỉ khi có thay đổi (so trạng thái cũ/mới) để tránh giật.
7. **`clearInterval` khi mảng rỗng** (mọi đơn đã xoá) để khỏi đốt pin. `startTrackingPolling` gọi lại khi có đơn mới.
8. Thêm listener `visibilitychange`: khi tab hiện lại, poll ngay 1 lần (tránh chờ 10s sau khi mở khoá màn hình).

**3e. Nút nổi Theo dõi (Floating Badge)** — hiện khi số đơn active > 0:
- `🐝 Theo dõi đơn hàng (X)`; bấm → `sheet='tracking'` + `render()`.
- Render trong `renderMenuScreen` (cạnh `cartBadge()`), CSS ở mục 4.

**3f. Pop-up Bottom Sheet — `renderTrackingSheet()` + `renderTrackingSheetInner()`:**
- Danh sách cuộn các đơn đang theo dõi. Mỗi thẻ:
  - Số hiệu `#${short_code}` + loại hình (`Tại chỗ`/`Mang đi`/`Giao hàng`) từ `delivery_type`.
  - **Đường ray timeline + sticker ong** — DÙNG ĐÚNG mapping của signage để đồng bộ: `1.png` (NEW/CONFIRMED), `8.png` (MAKING), `9.png` (READY trở đi). Tái dùng logic `currentOrderStatus`→`img` đang có ở [order.js:641](file:///Users/dpd/Projects/lamha-kissaten/web/order.js).
  - **Hộp thanh toán:** nếu `payment_status!=='PAID'` và `payment_method==='bank_transfer'` → nút "Xem QR Chuyển khoản" mở QR động `buildVietQRUrl(total, short_code)`. Nếu `PAID` → nhãn "✅ Đã thanh toán". (Nay chạy được vì `active_orders` đã trả `payment_status`.)
  - Nếu `completed_at!==null`: hiện trạng thái xong + đếm ngược 30s. Phân biệt `DELIVERED` ("✅ Hoàn tất, cảm ơn bạn!") vs `CANCELLED` ("❌ Đơn đã huỷ — vui lòng liên hệ quầy").
- `render()` ([order.js:788](file:///Users/dpd/Projects/lamha-kissaten/web/order.js)): thêm nhánh `sheet==='tracking'` mount sheet như item/cart/upsell (insertAdjacentHTML + `requestAnimationFrame` add `.open`).

#### [MODIFY] [web/style.css](file:///Users/dpd/Projects/lamha-kissaten/web/style.css)
- `.tracking-fab` — nút nổi cạnh phải, bo tròn bong bóng, tông vàng mật ong, không đè `.cart-fab`.
- `.tracking-order-card` — `padding-top: 55px` để ong bay không đè mã đơn/nút.
- Layout danh sách cuộn cho nhiều đơn (`max-height` + `overflow-y:auto`).

---

### 4. Signage — sửa timeline trạng thái đơn

#### [MODIFY] [web/signage.js](file:///Users/dpd/Projects/lamha-kissaten/web/signage.js)

**4a. 🔴 BUG chí mạng — timeline không bao giờ hiện.** CSS hiện overlay bằng class `.active` (`.timeline-overlay{opacity:0}` → `.timeline-overlay.active{opacity:1}`, [signage.html:210-214](file:///Users/dpd/Projects/lamha-kissaten/web/signage.html)), nhưng `renderTimeline` ([signage.js:316](file:///Users/dpd/Projects/lamha-kissaten/web/signage.js)) chỉ toggle `empty`, **không bao giờ thêm `active`** → overlay luôn `opacity:0`. Sửa:
```js
if (!orders || orders.length === 0) {
  tlOverlay.classList.add('empty');
  tlOverlay.classList.remove('active');   // ← THÊM
  tv.classList.remove('has-orders');
  return;
}
tlOverlay.classList.remove('empty');
tlOverlay.classList.add('active');        // ← THÊM (dòng quyết định)
tv.classList.add('has-orders');
```

**4b. Ong nhảy loạn mỗi 10s.** [signage.js:364-367](file:///Users/dpd/Projects/lamha-kissaten/web/signage.js) gán offset bằng `Math.random()` mỗi lần render (10s/lần) → ong teleport. Thay bằng offset **ổn định theo `order_id`** (hash đơn giản → số cố định), ví dụ:
```js
function stableOffset(id, range) {           // range vd 4 (vh)
  var h = 0; for (var i=0;i<id.length;i++) h = (h*31 + id.charCodeAt(i)) & 0xffff;
  return ((h % 1000)/1000 - 0.5) * range;    // cố định theo id
}
```
Lý tưởng: **chỉ re-render khi tập đơn/trạng thái đổi** (so sánh signature mảng cũ/mới) thay vì xoá-vẽ-lại toàn bộ mỗi nhịp.

**4c. Dọn dead code.** [signage.js:350](file:///Users/dpd/Projects/lamha-kissaten/web/signage.js) `pct = ... ? '90%' : '90%'` (ternary thừa) và [signage.js:352](file:///Users/dpd/Projects/lamha-kissaten/web/signage.js) nhánh `DELIVERED` (không bao giờ chạy vì `active_orders` lọc bỏ DELIVERED). Hoặc xoá, hoặc làm nó chạy thật bằng cách cho `active_orders` giữ đơn DELIVERED thêm ~30–60s (xem 4e).

**4d. Số bàn thay short_code cho dine_in.** Trên màn hình công cộng, hai khách cùng `#005` gây nhầm. Nếu `delivery_type!=='delivery'` và có `table_id` → hiện `Bàn 03`; ngược lại hiện `#short_code`. (`active_orders` đã trả `table_id` sau mục 1a.)

**4e. (Tuỳ chọn) Khoảnh khắc hoàn tất.** Cho `active_orders` giữ đơn `DELIVERED` trong ~45s (lọc theo `delivered_at`), để ong chạy nốt tới 100% + nhấp nháy "xong" rồi mới rơi khỏi màn hình, thay vì biến mất đột ngột.

**4f. Cap số ong khi cao điểm.** Giới hạn hiển thị (vd N đơn mới nhất mỗi track) để 15–20 ong không chồng lên track ngắn.

> Bump cache-buster `signage.js?v=...` trong [signage.html:308](file:///Users/dpd/Projects/lamha-kissaten/web/signage.html) sau khi sửa.

---

### 5. Tính năng nâng cấp (tier tuỳ chọn — làm sau khi 1–4 chạy ổn)

| # | Tính năng | Ghi chú triển khai |
|---|-----------|--------------------|
| 5.1 | **Thông báo + rung khi READY** | Đã có Service Worker đăng ký ([order.js:2622](file:///Users/dpd/Projects/lamha-kissaten/web/order.js)). Khi popup phát hiện đơn chuyển `READY` → `navigator.vibrate` + local Notification "Đơn #X xong rồi!". Killer feature kiểu Starbucks pickup. |
| 5.2 | **QR tự ẩn khi nhận tiền** | Đã có webhook `bank_notification` ([gas/Code.gs:183](file:///Users/dpd/Projects/lamha-kissaten/gas/Code.gs)). Khi popup poll thấy `payment_status='PAID'` → QR đổi thành ✅ tự động. Khép kín đối soát NH → khách. (Phụ thuộc mục 1.) |
| 5.3 | **Thời gian chờ / vị trí hàng đợi** | Từ `active_orders`: đếm số đơn `MAKING`/`CONFIRMED` phía trước → "Còn ~3 ly trước bạn". |

---

## Verification Plan

### A. Luồng in hoá đơn khi PAID
1. KDS bấm "Đã thanh toán" cho 1 đơn dine_in/mang đi.
2. Xem log `print_poller.py`: fetch được đơn `payment_status=PAID` (≤10s) và in thành công; không in lại ở nhịp sau (idempotent).
3. Nếu 403: chạy checklist mục 2 (launchctl → log → token → deployment access).

### B. Pop-up đa đơn trên phone
1. Đặt đơn #001 → popup theo dõi tự bật, ong ở mốc "Tiếp nhận" (`1.png`). Tắt popup → badge nổi `🐝 (1)` hiện.
2. Đặt tiếp #002 → mở popup thấy **cả 2 đơn**, timeline riêng biệt.
3. KDS chuyển #001 → "Đang pha": phone đổi ong #001 sang `8.png` trong ≤10s.
4. KDS chuyển #001 → "Đã giao": phone hiện "✅ Hoàn tất", đếm ngược 30s rồi tự xoá #001; #002 vẫn còn.
5. **Reload trang giữa chừng** (test 3c + migration): đơn active vẫn hiện lại đúng, không kẹt màn hình.
6. **Thanh toán:** đơn bank_transfer chưa trả → có nút QR; sau khi KDS bấm PAID → ≤10s đổi thành "✅ Đã thanh toán".
7. **Chống treo:** nhét tay 1 `order_id` ngày hôm qua vào `lhk_active_orders` → lần load sau bị auto-expiry xoá, badge không kẹt.
8. DevTools Console: **không còn** `ReferenceError: TQ is not defined`.

### C. Timeline signage
1. Tạo đơn active → **timeline hiện ra** (xác nhận 4a; trước đó luôn ẩn).
2. Để yên 30–60s không đổi trạng thái → ong **đứng yên**, không teleport mỗi 10s (xác nhận 4b).
3. Đơn dine_in có bàn → hiện `Bàn 0X` thay vì `#code` (4d).
4. Chuyển đơn qua MAKING/READY → ong dịch mốc đúng; (nếu làm 4e) đơn DELIVERED chạy nốt tới 100% rồi mới biến mất.
5. Không có đơn → timeline ẩn (`empty`), QR rail về vị trí thường.

### D. Hồi quy
1. Chạy test Node của signage (nếu có) — `normalizeConfig`/`buildQueue` không đổi hành vi.
2. Kiểm tra `kds.html` vẫn dùng `TQ/DQ` bình thường (chỉ phần phone bỏ, KDS giữ vì cần token).
3. Xác nhận không có chỗ nào còn đọc key cũ `active_order_id`.

---

## Tóm tắt thứ tự thực thi (ưu tiên)

1. **GAS mục 1** (1a + 1b + deploy 1d) — nền tảng dữ liệu, làm trước.
2. **Signage 4a** — fix 1 dòng, bật lại timeline đang chết.
3. **Phone mục 3** — popup đa đơn (phụ thuộc 1a).
4. **Poller mục 2** — chẩn đoán & sửa 403.
5. **Signage 4b–4d** — hết giật + số bàn.
6. **Tier 5** — nâng cấp tuỳ chọn.
