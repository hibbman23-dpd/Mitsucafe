# Loyalty Stamp — Chuyển sang tích tem theo giá trị đơn (spend-tier)

> Spec · 2026-07-18 · thay cơ chế "mỗi ly = 1 tem" bằng "tem theo giá trị đơn".
> Index liên quan: `docs/system/loyalty-stamps.md`, `CLAUDE.md` §4.

## 1. Mục tiêu & vấn đề

Cơ chế cũ ("mỗi ly beverage = 1 tem, 10 tem = 1 ly free") có lỗ hổng biên: một người mua hộ 10 ly trong **một** giao dịch nhận ngay 10 tem = 1 ly free — phần thưởng vốn dành cho lòng trung thành bị "cày" bằng một đơn.

Cơ chế mới gắn tem vào **giá trị đơn**, tự động vá lỗ này (đơn to cỡ nào cũng cap 2 tem) và khuyến khích nâng giá trị đơn.

## 2. Luật mới (đã chốt)

**Tích tem** — theo `order.total` (giá trị **net**, sau mọi giảm giá/khuyến mãi/đổi ly free; gồm **mọi món** trong đơn, không chỉ beverage):

| Giá trị đơn (net) | Tem cộng |
|---|---|
| < 66.000đ | 0 |
| ≥ 66.000đ và < 100.000đ | 1 |
| ≥ 100.000đ | 2 (cap — đơn to hơn vẫn 2) |

**Đổi thưởng** — đủ **10 tem** = đổi **1 ly nước size M cơ bản** (chỉ nước, **không** topping, **không** tính chênh size L). Đổi 10 tem → `stamp_count -= 10`, `free_drinks_earned += 1`.

### Quyết định thiết kế đã chốt
- Mốc trên 100k: **cap 2 tem/đơn** (không scale tiếp theo bội số).
- Cơ sở tính: **tổng đơn mọi món** (đảo guardrail cũ "chỉ beverage").
- Gross/Net: **net** — giá khách thực trả sau giảm giá.
- Ngưỡng để trong **CONFIG**, không hardcode (guardrail §4).

## 3. Trạng thái hệ thống hiện tại (đã khảo sát)

Khung tem **đã tồn tại và chạy**, chỉ công thức tính cần đổi:

- **CONFIG** (`SeedSheets.gs:147`): `STAMP_PER_CUP='1'`, `STAMPS_FOR_FREE='10'`.
- **CUSTOMERS** cột: `stamp_count`, `stamp_total_ever`, `free_drinks_earned`, `free_drinks_used`.
- **Backend cấp tem**: `gas/Orders.gs` → `_creditStampsForOrder(order)` (dòng 610–723), gọi tại dòng 425. Hiện đếm số ly beverage (bỏ SKU `BK*`) làm `stampsEarned` (dòng 619–627).
- **Redeem hiện tại**: `use_free_drink` trừ **ly đắt nhất trong giỏ (gồm topping + chênh L)** — server `Orders.gs:104–113`, client `web/order.js getCartDiscount()` (2771).
- **Notify**: `gas/Notify.gs notifyStampUpdate(customerId, stampsEarned, newCount, totalEver, freeDrinksBalance)` — ký hiệu đã nhận `stampsEarned` biến thiên, hợp mô hình mới.
- **Frontend thẻ tem**: `web/order.js` render `stamp_count/10`, toast delta (`checkStampAfterDelivery`, `STAMP_STICKERS`, `renderLoyaltySection`).
- **Landing** `web/mitsu.html`: khối A "Sưu tầm ba con ong" (341–368, collect-3 → quà) + khối B promo-box "Mua 10 ly, tặng 1 ly" (371–377).

> Ghi chú: comment `// addStamp() // Tier 2` tại `Orders.gs:320` là **stale** — hàm thật là `_creditStampsForOrder`. Không cần đụng comment đó ngoài việc dọn cho khỏi gây hiểu nhầm.

## 4. Thay đổi chi tiết

### 4.1 Lõi tính tem — `gas/Orders.gs` `_creditStampsForOrder` (619–627)
Thay khối đếm ly bằng bậc theo `order.total`:
```
t1 = Number(getConfig('STAMP_THRESHOLD_1')) || 66000
t2 = Number(getConfig('STAMP_THRESHOLD_2')) || 100000
total = Number(order.total) || 0
stampsEarned = total >= t2 ? 2 : (total >= t1 ? 1 : 0)
```
Giữ nguyên phần dưới (694–698): `stamp_count += stampsEarned`, nếu ≥10 → `free_drinks_earned += floor(count/10)`, `stamp_count %= 10`.

Lưu ý guard hiện tại dòng 629 (`if stampsEarned===0 && !use_free_drink → return`): giữ nguyên — đơn <66k không dùng free drink thì bỏ qua, đúng.

### 4.2 CONFIG — `gas/SeedSheets.gs`, `gas/Admin.gs`, `web/dashboard.html`
- `SeedSheets.gs:147`: thêm `'STAMP_THRESHOLD_1': '66000'`, `'STAMP_THRESHOLD_2': '100000'`; bỏ `'STAMP_PER_CUP'`.
- `Admin.gs:31`: cập nhật danh sách CONFIG keys editable — bỏ `STAMP_PER_CUP`, thêm 2 ngưỡng.
- `dashboard.html:216` label map: bỏ label `STAMP_PER_CUP`, thêm `STAMP_THRESHOLD_1:'Đơn tối thiểu tích 1 tem'`, `STAMP_THRESHOLD_2:'Đơn tối thiểu tích 2 tem'`.
- **Migration**: quán đang chạy → cần thêm 2 key vào CONFIG sheet thật (SeedSheets chỉ seed lần đầu). Code phải có fallback default (66000/100000) khi CONFIG thiếu key, để không vỡ nếu chưa set tay.

### 4.3 Siết định giá ly đổi về "M cơ bản, không topping" — server + client
Ly free giờ chỉ trị giá **giá size M gốc** (`menuItem.price_m`, trước topping, trước promo? — xem dưới) của một ly nước trong đơn, không phải ly đắt nhất gồm mods.

- **Server** `Orders.gs:104–113`: thay `highestDrinkPrice` (dùng `it.price` gồm mods) bằng: với mỗi item không phải `BK*`, tra `getMenuItemBySku(it.sku).price_m` (giá M gốc); lấy **max** giá M gốc trong các ly; `total = max(0, subtotal - maxBaseM)`.
- **Client** `web/order.js getCartDiscount()` (2771): thay `highestDrink.price` bằng giá M gốc của ly. Cần giá M gốc ở cart item — tra từ MENU theo `sku` (client đã có MENU) thay vì `ci.price`. Trả `{amount: maxBaseM, sku}`.
- **Bất biến**: client và server phải khớp **từng đồng** (bank reconcile gạch nợ theo số tiền — xem chú thích Orders.gs:82). Test phải phủ điểm này.

Quyết định phụ cần khớp client/server (chốt trong plan, mặc định đề xuất):
- Giá M gốc lấy **trước** promo toàn quán (giá niêm yết `price_m`), hay **sau** promo? → Đề xuất: **sau promo** nếu promo đang active, để khớp cách `unit` được tính (Orders.gs:83–85). Plan phải chốt và test.

### 4.4 Notify — `gas/Notify.gs notifyStampUpdate`
Chỉnh chữ cho khớp luật mới (không đổi ký hiệu):
- Dòng mô tả: nêu "Đơn ≥66k +1 tem · ≥100k +2 tem".
- Khi `stampsEarned===0` mà vẫn gọi (trường hợp chỉ dùng free drink): đảm bảo thông báo không nói "+0 tem" kỳ cục — kiểm tra nhánh gọi tại 723 và guard 629.

### 4.5 Frontend hiển thị luật — `web/order.js renderLoyaltySection`
Thêm dòng nhỏ giải thích luật cho khách tại khu thẻ tem: "Đơn từ 66k tích 1 tem · từ 100k tích 2 tem · đủ 10 tem đổi 1 ly size M." Tăng động lực nâng giá trị đơn.

### 4.6 Landing — `web/mitsu.html`
- **Khối A "Sưu tầm ba con ong" (341–368): XÓA cả khối** (đã chốt). Kiểm CSS `.stamps-grid/.stamp-card/.loyalty-box` còn dùng chỗ khác không trước khi xóa; nếu chỉ dùng ở đây thì dọn luôn CSS chết trong `mitsu.css`.
- **Khối B promo-box (371–377): viết lại** tiêu đề + mô tả sang luật mới. Ví dụ: h3 "Tích tem đổi ly miễn phí" · mô tả "Đơn từ 66.000đ tích 1 tem, từ 100.000đ tích 2 tem. Đủ 10 tem đổi 1 ly nước size M." Giữ nút "Đặt ngay".

### 4.7 Docs + guardrail
- Viết lại `docs/system/loyalty-stamps.md` toàn bộ theo luật spend-tier (bảng ngưỡng, flow, template Zalo mới, định nghĩa ly đổi M cơ bản).
- `CLAUDE.md` §4: đổi dòng `❌ Cộng stamp cho pastry/retail — chỉ beverage` → phản ánh luật mới (tem theo tổng đơn mọi món). Không xóa cả dòng — thay bằng luật mới để tránh ai đó khôi phục logic cũ.

### 4.8 Test — `ops/test_logic.js`
Case tích tem (theo `total` net): 65999→0 · 66000→1 · 99999→1 · 100000→2 · 500000→2 · đơn dùng free drink khiến net<66k→0.
Case định giá ly đổi: giỏ có ly M + topping → discount = **giá M gốc**, không gồm topping; giỏ có ly L → discount = giá M gốc, không phải giá L; client `getCartDiscount` khớp server `total` từng đồng.

## 5. Không làm (YAGNI / ngoài phạm vi)
- Không đổi hạn tem (vẫn không hết hạn, review sau).
- Không đổi UI thẻ 10 ô / sticker s1–s10.
- Không migrate tem cũ của khách (stamp_count hiện tại giữ nguyên, luật mới áp từ đơn kế tiếp).
- Không thêm bậc >2 tem.

## 6. Rủi ro & lưu ý
- **Client/server lệch tiền** khi siết ly đổi → bank reconcile fail. Bắt buộc test khớp từng đồng (§4.3, §4.8).
- **CONFIG thiếu key** trên sheet prod → phải có fallback default trong code, và thêm key tay sau deploy.
- **Xóa khối A landing** có thể để lại CSS/asset mồ côi (sticker Kin/Ritsu/Sō) — chỉ dọn CSS nếu chắc không dùng nơi khác; asset ảnh giữ (dùng cho brand khác).
