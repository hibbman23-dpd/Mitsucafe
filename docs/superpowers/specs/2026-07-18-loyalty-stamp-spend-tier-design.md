# Loyalty Stamp — Chuyển sang tích tem theo giá trị đơn (spend-tier)

> Spec · 2026-07-18 · thay cơ chế "mỗi ly = 1 tem" bằng "tem theo giá trị đơn".
> Index liên quan: `docs/system/loyalty-stamps.md`, `CLAUDE.md` §4.

## 1. Mục tiêu & vấn đề

Cơ chế cũ ("mỗi ly beverage = 1 tem, 10 tem = 1 ly free") có lỗ hổng biên: một người mua hộ 10 ly trong **một** giao dịch nhận ngay 10 tem = 1 ly free — phần thưởng vốn dành cho lòng trung thành bị "cày" bằng một đơn.

Cơ chế mới gắn tem vào **giá trị đơn**, tự động vá lỗ này (đơn to cỡ nào cũng cap 2 tem) và khuyến khích nâng giá trị đơn.

## 2. Luật mới (đã chốt)

**Tích tem** — theo `order.total` (giá trị **net**, sau mọi giảm giá/khuyến mãi/đổi ly free; gồm **mọi món** trong đơn, không chỉ beverage):

| Giá trị đơn (net) | Tem cộng | Thưởng thêm |
|---|---|---|
| < 66.000đ | 0 | — |
| ≥ 66.000đ và < 100.000đ | 1 | — |
| ≥ 100.000đ và < 490.000đ | 2 (cap) | — |
| ≥ 490.000đ | **0** | **+1 ly free** cộng thẳng `free_drinks_earned` (dùng đơn sau) |

**Đổi thưởng** — đủ **10 tem** = đổi **1 ly nước size M cơ bản** (chỉ nước, **không** topping, **không** tính chênh size L). Đổi 10 tem → `stamp_count -= 10`, `free_drinks_earned += 1`.

**Mốc đặc biệt ≥490k:** không tích tem, cộng thẳng 1 ly free. ⚠️ Ly free này credit **trước** guard "stampsEarned===0 return" (xem §4.1) — nếu không sẽ bị bỏ qua.

### Quyết định thiết kế đã chốt
- Mốc 100k–489k: **cap 2 tem/đơn**. ≥490k: bậc đặc biệt (0 tem + 1 ly free).
- Cơ sở tính: **tổng đơn mọi món** (đảo guardrail cũ "chỉ beverage").
- Gross/Net: **net** — giá khách thực trả sau giảm giá/đổi ly free.
- Ngưỡng để trong **CONFIG**, không hardcode (guardrail §4): `STAMP_THRESHOLD_1=66000`, `STAMP_THRESHOLD_2=100000`, `STAMP_THRESHOLD_SPECIAL=490000`.
- **KHÔNG cooldown chống tách đơn** (đã cân nhắc & loại — xem §5): phạt khách quay lại thật, lợi chặn exploit quá nhỏ.

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
t1 = Number(getConfig('STAMP_THRESHOLD_1'))       || 66000
t2 = Number(getConfig('STAMP_THRESHOLD_2'))       || 100000
tS = Number(getConfig('STAMP_THRESHOLD_SPECIAL')) || 490000
total = Number(order.total) || 0

specialFreeDrink = total >= tS           // bậc đặc biệt
stampsEarned = specialFreeDrink ? 0
             : total >= t2 ? 2
             : total >= t1 ? 1
             : 0
```
Giữ nguyên phần dưới (694–698): `stamp_count += stampsEarned`, nếu ≥10 → `free_drinks_earned += floor(count/10)`, `stamp_count %= 10`.

**⚠️ Bẫy guard dòng 629** (`if stampsEarned===0 && !use_free_drink → return`): với bậc ≥490k, `stampsEarned=0` sẽ **thoát sớm → mất ly free**. Phải xử lý:
- Cộng ly đặc biệt **trước** guard: `if (specialFreeDrink) { cust.free_drinks_earned += 1; }` — nhưng cust chưa load ở dòng 629. → Chuyển guard xuống **sau** khi load `cust` (sau 677) và **bỏ qua guard nếu `specialFreeDrink`**. Điều kiện return mới: `if (stampsEarned===0 && !use_free_drink && !specialFreeDrink) return;`
- Sau khi load cust: `if (specialFreeDrink) { cust.free_drinks_earned += 1; }` (cộng 1 lần, không nhân qty).
- Notify: khi `specialFreeDrink`, báo "Đơn ≥490k — tặng 1 ly nước miễn phí!" thay vì "+0 tem".

Guard `stampsEarned===0 && !use_free_drink && !specialFreeDrink` vẫn giữ để đơn <66k (không free, không special) thoát sớm — đúng.

### 4.2 CONFIG — `gas/SeedSheets.gs`, `gas/Admin.gs`, `web/dashboard.html`
- `SeedSheets.gs:147`: thêm `'STAMP_THRESHOLD_1': '66000'`, `'STAMP_THRESHOLD_2': '100000'`, `'STAMP_THRESHOLD_SPECIAL': '490000'`; bỏ `'STAMP_PER_CUP'`.
- `Admin.gs:31`: cập nhật danh sách CONFIG keys editable — bỏ `STAMP_PER_CUP`, thêm 3 ngưỡng.
- `dashboard.html:216` label map: bỏ label `STAMP_PER_CUP`, thêm `STAMP_THRESHOLD_1:'Đơn tối thiểu tích 1 tem'`, `STAMP_THRESHOLD_2:'Đơn tối thiểu tích 2 tem'`, `STAMP_THRESHOLD_SPECIAL:'Đơn tối thiểu tặng thẳng 1 ly free'`.
- **Migration**: quán đang chạy → cần thêm 3 key vào CONFIG sheet thật (SeedSheets chỉ seed lần đầu). Code phải có fallback default (66000/100000/490000) khi CONFIG thiếu key, để không vỡ nếu chưa set tay.

### 4.3 Siết định giá ly đổi về "M cơ bản, không topping" — server + client
Ly free trị giá **giá size M SAU promo toàn quán** của một ly nước trong đơn (bỏ topping, bỏ chênh L). **CHỐT: sau promo** — nếu trừ theo giá niêm yết gốc trong khi món đang bán giá promo thấp hơn, phần chênh dư sẽ trừ lấn sang món khác trong giỏ (bánh/ly khác) → sai. Ví dụ: trà sữa niêm yết 30k, promo −10% còn 27k, đơn có thêm bánh 20k. Trừ gốc 30k → đơn còn 17k (bánh bị giảm ké 3k, SAI). Trừ 27k → đơn còn 20k (bánh giữ nguyên, ĐÚNG).

- **Giá M sau promo** = `promoInfo.active ? Math.round(price_m × (1 − percent/100)) : price_m` — **cùng công thức** Orders.gs:83–85 dùng cho `unit`.
- **Server** `Orders.gs:104–113`: thay `highestDrinkPrice` (dùng `it.price` gồm mods) bằng: với mỗi item không phải `BK*`, tính giá M-sau-promo từ `getMenuItemBySku(it.sku).price_m`; lấy **max**; `total = max(0, subtotal − maxBaseM)`.
- **Client** `web/order.js getCartDiscount()` (2771): thay `highestDrink.price` bằng giá M-sau-promo tra từ MENU theo `sku` (client đã có MENU + `activePromo`), KHÔNG dùng `ci.price` (gồm mods). Trả `{amount: maxBaseM, sku}`.
- **Bất biến**: client và server phải khớp **từng đồng** (bank reconcile gạch nợ theo số tiền — chú thích Orders.gs:82). Test bắt buộc phủ (§4.8).

### 4.4 Notify — `gas/Notify.gs notifyStampUpdate`
Chỉnh chữ cho khớp luật mới (cân nhắc thêm 1 tham số `specialFreeDrink` vào ký hiệu):
- Dòng mô tả thường: "Đơn ≥66k +1 tem · ≥100k +2 tem".
- **Bậc ≥490k** (`stampsEarned=0`, specialFreeDrink=true): báo "🎁 Đơn ≥490k — tặng 1 ly nước miễn phí dùng lần sau!" thay vì "+0 tem".
- Trường hợp chỉ dùng free drink (stampsEarned=0, không special): không nói "+0 tem" kỳ cục — kiểm nhánh gọi 723.

### 4.5 Frontend hiển thị luật + tạm tính tem theo net — `web/order.js`
- `renderLoyaltySection`: thêm dòng luật "Đơn từ 66k tích 1 tem · từ 100k tích 2 tem · từ 490k tặng 1 ly free · đủ 10 tem đổi 1 ly size M."
- **Tạm tính tem theo NET** (feedback #4.3): preview số tem tích được phải tính trên tổng **sau** khi trừ ly free (nếu khách tick "dùng ly free"). Khi tick/bỏ tick free drink làm net tụt qua ngưỡng (vd 110k → còn 83k), preview tem cập nhật NGAY (2→1) để khách không thắc mắc lúc nhận đơn. Dùng chung ngưỡng 66k/100k/490k với backend (định nghĩa 1 chỗ hằng số client).

### 4.6 Landing — `web/mitsu.html`
- **Khối A "Sưu tầm ba con ong" (341–368): XÓA cả khối** (đã chốt). Kiểm CSS `.stamps-grid/.stamp-card/.loyalty-box` còn dùng chỗ khác không trước khi xóa; nếu chỉ dùng ở đây thì dọn luôn CSS chết trong `mitsu.css`.
- **Khối B promo-box (371–377): viết lại** tiêu đề + mô tả sang luật mới. Ví dụ: h3 "Tích tem đổi ly miễn phí" · mô tả "Đơn từ 66.000đ tích 1 tem, từ 100.000đ tích 2 tem. Đủ 10 tem đổi 1 ly nước size M." Giữ nút "Đặt ngay".

### 4.7 Docs + guardrail
- Viết lại `docs/system/loyalty-stamps.md` toàn bộ theo luật spend-tier (bảng ngưỡng, flow, template Zalo mới, định nghĩa ly đổi M cơ bản).
- `CLAUDE.md` §4: đổi dòng `❌ Cộng stamp cho pastry/retail — chỉ beverage` → phản ánh luật mới (tem theo tổng đơn mọi món). Không xóa cả dòng — thay bằng luật mới để tránh ai đó khôi phục logic cũ.

### 4.8 Test — `ops/test_logic.js`
**Tích tem theo `total` net:** 65999→0 · 66000→1 · 99999→1 · 100000→2 · 489999→2 · **490000→0 tem +1 free_drinks_earned** · 500000→0 tem +1 free · đơn dùng free drink khiến net<66k→0.
**Bậc đặc biệt không mất ly do guard:** đơn 500k, không use_free_drink → phải cộng `free_drinks_earned += 1` (không bị guard 629 nuốt).
**Định giá ly đổi (sau promo, không topping/L):**
- giỏ ly M + topping → discount = giá M (không gồm topping).
- giỏ ly L → discount = giá M (không phải giá L).
- promo −10% active: ly niêm yết 30k → discount = 27k, các món khác không bị trừ ké.
- client `getCartDiscount().amount` === server `subtotal − total` (khớp từng đồng).

## 5. Không làm (YAGNI / ngoài phạm vi)
- **KHÔNG cooldown chống tách đơn** (feedback #4.1 — đã cân nhắc & loại): phạt khách quay lại thật (ghé sáng+chiều mất tem lần 2), trong khi lỗ chặn được quá nhỏ (tách 210k→3×70k lời +1 tem ≈3.500đ, ma sát cao, hiếm). Cái giá thiện cảm > lợi ích. Chấp nhận rủi ro tách đơn.
- Không đổi hạn tem (vẫn không hết hạn, review sau).
- Không đổi UI thẻ 10 ô / sticker s1–s10.
- Không migrate tem cũ của khách (stamp_count hiện tại giữ nguyên, luật mới áp từ đơn kế tiếp).
- Không thêm bậc tem >2 (ngoài bậc đặc biệt ≥490k tặng ly free).

## 6. Rủi ro & lưu ý
- **Bẫy guard 629** (§4.1): bậc ≥490k có `stampsEarned=0`, guard cũ sẽ thoát sớm và **nuốt ly free**. Bắt buộc chuyển guard sau load cust + loại trừ `specialFreeDrink`. Có test riêng (§4.8).
- **Client/server lệch tiền** khi siết ly đổi → bank reconcile fail. Bắt buộc test khớp từng đồng (§4.3, §4.8).
- **CONFIG thiếu key** trên sheet prod → phải có fallback default trong code, và thêm 3 key tay sau deploy.
- **Xóa khối A landing** có thể để lại CSS/asset mồ côi (sticker Kin/Ritsu/Sō) — chỉ dọn CSS nếu chắc không dùng nơi khác; asset ảnh giữ (dùng cho brand khác).
- **Bậc 490k hoàn ~7%** (ly M ~35k / 490k): thưởng đơn nhóm/văn phòng. Chấp nhận được, nhưng theo dõi nếu đơn to bị lạm dụng.
