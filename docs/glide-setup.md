# Glide App Setup — Lâm Hà Kissaten
# Day 4 · Free plan · Mục tiêu: từ Sheets → app khách quét QR đặt đơn → webhook GAS

> Đọc song song với [CLAUDE.md](../CLAUDE.md) §2 (Event Schema) và `glide/webhook_body_template.txt`.

---

## 0. Trước khi bắt đầu

| Item | Trạng thái cần |
|---|---|
| Account Glide | Đã đăng ký tại https://www.glideapps.com (Free plan OK) |
| Google Sheets "Kissaten DB" | Đã có 7 tabs (Day 1–3) + sẽ thêm CART (chạy `initCartSheet()` ở Apps Script) |
| GAS Web App URL | `https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec` |
| Menu đã seed | 27 món ở MENU tab, `available = TRUE` |

**Bước chuẩn bị Sheets:**
```
Apps Script editor → mở file SeedSheets.gs → Run → initCartSheet()
→ Kiểm tra Sheets có tab CART với 9 columns: cart_id, user_id, sku, name, qty, price, modifiers_json, subtotal, added_at
```

---

## 1. Tạo Glide app từ Sheets (10 phút)

1. Vào https://go.glideapps.com/app/new
2. Chọn **Google Sheets** → chọn file "Kissaten DB" → cho phép quyền
3. App type: **App** (không phải Pages — App có Native feel, dùng cho mobile/QR)
4. Đặt tên: `Lâm Hà Kissaten Order`
5. Glide tự import 8 tabs → vào tab **Data** (icon database) kiểm tra:
   - MENU, CART, ORDERS, CUSTOMERS xuất hiện
   - Có thể "Hide" các tabs không dùng (INVENTORY, STAFF, PROMOTIONS, CONFIG) để gọn navigation

---

## 2. Cấu hình Data Tables

### 2.1 MENU table — chuẩn hoá kiểu dữ liệu

Vào **Data → MENU**, click từng cột header → "Edit column":

| Column | Type | Lý do |
|---|---|---|
| `price_m`, `price_l`, `cost_nl` | **Number** | Để tính total đúng |
| `available` | **Boolean** | Filter Yes/No |
| `customizations_json`, `allergens` | **Text** | Sẽ parse bằng JS column |
| `image_url` | **Image** | Hiển thị thumbnail |
| `sort_order` | **Number** | Sort menu |

**Thêm computed columns trên MENU:**

- **`price_display`** (Template column):
  - Template: `{m}.000đ`
  - Replacement: `{m}` → `price_m` (set "Divide by 1000" để hiển thị "27" thay vì "27000")
  - Hoặc đơn giản: dùng JS column `return (p1/1000).toLocaleString('vi-VN') + '.000đ';` với p1=price_m

- **`has_size_choice`** (If-Then-Else column):
  - If `price_l` is greater than 0 → TRUE, else FALSE

- **`customizations_obj`** (JavaScript column — optional, để hiện options):
  ```js
  try { return JSON.parse(p1 || '{}'); } catch (_) { return {}; }
  ```
  p1 = `customizations_json`. Output dùng để build option lists trong screen Item Detail.

### 2.2 CART table — bật user filtering

Cart là per-user. Free plan KHÔNG có Row Owners, nhưng dùng được filter:

1. Cột `user_id` = số điện thoại user nhập ở Checkout (ta sẽ lưu vào User Profile)
2. Filter screen Cart: `user_id is User Profile → Phone`

**Thêm computed columns trên CART:**

- **`subtotal`** (Math): `qty * price` (overwrite cột trống đã seed)
- **`modifier_summary`** (JavaScript column, để hiển thị "Đường 50% · Đá ít"):
  ```js
  try {
    const o = JSON.parse(p1 || '{}');
    return Object.entries(o).map(([k,v]) => `${k} ${v}`).join(' · ');
  } catch (_) { return ''; }
  ```

### 2.3 CUSTOMERS table — User Profile + Checkout helper

Glide Free cho phép 1 row per user qua **User Profiles**:

1. Settings (⚙️) → **Privacy** → User Profiles → Source: **CUSTOMERS** table
2. Email column: để trống (App không yêu cầu sign-in). Tạo cột mới `email` = trống hoặc dùng `phone` làm khoá identity.
3. **Quan trọng cho Free plan**: vì không sign-in, mỗi device sẽ có "anonymous user". Phone số nhập ở Checkout sẽ tạo/cập nhật row CUSTOMERS qua action "Set Column Values + Add Row if not exists".

**Computed columns trên CUSTOMERS (cho Checkout):**

- **Relation `my_cart`**: từ `phone` (CUSTOMERS) → `user_id` (CART), multiple matches
- **`cart_count`** = Rollup `my_cart` → Count
- **`cart_total`** = Rollup `my_cart` → Sum of `subtotal`
- **`cart_skus`** = Rollup `my_cart` → Joined list of `sku` (sep mặc định `, `)
- **`cart_names`** = Rollup `my_cart` → Joined list of `name`
- **`cart_qtys`** = Rollup `my_cart` → Joined list of `qty`
- **`cart_prices`** = Rollup `my_cart` → Joined list of `price`
- **`cart_modifiers`** = Rollup `my_cart` → Joined list of `modifiers_json`, sep `|||`
  - Nếu Glide không cho custom separator: tạo Template column trên CART trước: `replace modifiers_json with itself + "|||" `; rồi rollup template đó.
- **`items_json_string`** = JavaScript column (paste nội dung `glide/cart_to_items_json.js`):
  - Replacements: p1=cart_skus, p2=cart_names, p3=cart_qtys, p4=cart_prices, p5=cart_modifiers
- **`order_id`** = Text column (sẽ được webhook response ghi vào, dùng cho Success screen)

---

## 3. Screens

Tab bar (bottom navigation), 3 tabs:

### 3.1 Tab "Menu" (📋)

- Source: MENU table
- Filter: `available is checked`
- Style: **List** (compact) hoặc **Cards** (đẹp hơn nếu có ảnh)
- **Group by**: `subcategory` (hoặc `category` nếu muốn gom rộng hơn: beverage/pastry)
- **Sort**: `sort_order` ascending
- Title: `name`, Subtitle: `price_display`, Image: `image_url`
- Tap → mở **Item Detail screen**

### 3.2 Item Detail screen

- Hiện: ảnh, tên (vi + jp nếu có), `story_telling` (rich text), allergens
- **Form components** (không phải Form Screen — dùng "Choice" + User-Specific Columns trên MENU row để giữ state):
  - Tạo USC trên MENU: `_chosen_size` (text, default "M"), `_chosen_sugar` (text), `_chosen_ice` (text), `_chosen_qty` (number, default 1)
  - **Choice "Size"**: visible if `has_size_choice` is TRUE, options ["M", "L"], write to `_chosen_size`
  - **Choice "Đường"**: options từ `customizations_obj.sugar` (Glide hỗ trợ dynamic options qua relation → đơn giản nhất: hardcode ["0%","30%","50%","70%","100%"], thiếu thì user chọn "0%")
  - **Choice "Đá"**: ["full","less","none"]
  - **Number stepper "Số lượng"**: write `_chosen_qty`, min 1, max 10
- **Button "Thêm vào giỏ"** (primary, full-width):
  - Action **Compound**:
    1. Add Row → CART:
       - `cart_id` = `Unique Identifier` (Glide built-in)
       - `user_id` = `User Profile → Phone` (nếu phone trống → dùng `Device ID` placeholder, sẽ update khi Checkout)
       - `sku` = `sku` (this row)
       - `name` = `name` (this row)
       - `qty` = `_chosen_qty`
       - `price` = if `_chosen_size` == "L" then `price_l` else `price_m`
       - `modifiers_json` = Template `{"sugar":"X","ice":"Y","size":"Z"}` (replace X=_chosen_sugar etc.)
       - `added_at` = Current Date/Time
    2. Show Notification: "Đã thêm vào giỏ ✓"
    3. Go Back

### 3.3 Tab "Giỏ hàng" (🛒)

- Source: CART, filter `user_id is User Profile → Phone` (hoặc Device ID nếu chưa có phone)
- Style: List, Title=`name`, Subtitle=`modifier_summary`, Right text=`subtotal`
- Tap row → action: **Show Edit Screen** (cho phép sửa qty) hoặc Delete Row
- **Empty state**: "Giỏ trống · Mở Menu thêm món"
- **Footer (Action Bar)**:
  - Text: "Tổng: {cart_total}đ" (lấy từ User Profile rollup)
  - Button "Thanh toán" → Show Form Screen "Checkout"

### 3.4 Checkout Form Screen

Fields (mỗi cái = 1 component, write vào User Profile / CUSTOMERS row):
- **Text Entry "Tên"** → `name`
- **Text Entry "Số điện thoại"** (validate 10 số, prefix 0) → `phone` ⚠️ **REQUIRED**
- **Text Entry "Ghi chú"** (optional) → User-Specific column `_order_notes`
- **Read-only chip "Bàn"**: hiện `Table ID from URL Param` (xem §4 dưới). Nếu không có → hiển thị "Mang đi"

Submit button **"Gửi đơn"**:
- Action **Compound**:
  1. Set Column Values (nếu phone vừa nhập → update `user_id` trong tất cả CART rows hiện tại có user_id=Device ID. Có thể skip nếu user nhập phone từ đầu)
  2. **Trigger Webhook** → URL = GAS endpoint, Body = nội dung `glide/webhook_body_template.txt`
  3. **On Success** (Glide hỗ trợ qua "Wait for response" nếu được; Free plan có giới hạn):
     - Show Notification "Đơn đã gửi ✓"
     - Show Screen "Success"
     - Delete Rows: relation `my_cart` (xoá toàn bộ cart rows của user)
  4. **On Error**: Show Notification "Lỗi — thử lại"

### 3.5 Success screen

- Hiện `order_id` lớn ở giữa (nếu webhook response ghi vào — Glide Free có giới hạn, fallback: hiện "Đơn đã gửi, kiểm tra Telegram của chủ quán" + ETA)
- **Image** VietQR: URL build sẵn — `https://img.vietqr.io/image/{BANK}-{ACCT}-compact2.png?amount={cart_total}&addInfo={order_id}&accountName={CAFE_NAME}`
  - Dùng Template column để build URL (cần điền BANK, ACCT, NAME từ CONFIG sheet vào Glide — copy paste vì Glide không đọc dynamic CONFIG dễ dàng)
- Button "Đặt thêm" → quay về Tab Menu

---

## 4. Table ID từ URL Param (QR bàn)

Glide hỗ trợ **URL parameters** (chỉ web preview / shared links, không trong native app store apps — nhưng Day 4 ta dùng PWA link).

1. Settings → **General** → Sharing → bật "Share link"
2. URL pattern: `https://{your-app}.glide.page?table_id=TABLE_03`
3. Trong Data → tạo table **APP_STATE** (1 row, single value): cột `table_id` (text)
4. Hoặc dùng built-in: **User-Specific column** trên User Profile row tên `_table_id`, được set bởi action "Open Link → Parse URL Param" (Glide Free có thể không support; fallback: nhập tay khi không có).
5. **Workaround Free plan**: dùng **Glide URL Param** component (Beta) hoặc đơn giản hơn:
   - Mỗi bàn 1 QR riêng → QR encode link dạng `https://...glide.page/#TABLE_03`
   - Trong Glide: Settings → Advanced → "Default screen" nhận hash → set computed column.
   - **Đơn giản nhất cho launch**: in QR chứa link `https://glide.page/...?t=03`, Checkout hiện 1 input "Mã bàn" prefilled từ param `t` — nếu Glide không parse được, user nhập tay 2 chữ số (~5 giây, chấp nhận được).

QR design + generate sẽ làm ở **Day 7** (`qr/generate_qr.py`). Day 4 chỉ cần đảm bảo Glide có chỗ nhận và đẩy vào `table_id` trong payload.

---

## 5. Webhook Action — chi tiết

**Action editor trong Glide:**
- Type: **Trigger Webhook**
- URL: `https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec`
- Method: **POST**
- Body: dùng "Custom" → paste nội dung từ `glide/webhook_body_template.txt`, thay `{{...}}` bằng Glide column tokens.

**Cảnh báo cú pháp Glide:**
- Khi paste body, Glide hiển thị `{{Column Name}}` như chip. Đảm bảo:
  - `"customer_id":"{{User Phone}}"` ← có dấu nháy quanh
  - `"items":{{Items JSON String}}` ← KHÔNG có dấu nháy quanh (vì column trả về JSON array literal `[{...}]`)
  - `"total":{{Cart Total}}` ← KHÔNG nháy (number)

**Header:**
- Content-Type: `application/json`

**Validate cú pháp**: copy paste body cuối cùng vào https://jsonlint.com sau khi đã render 1 lần với data mẫu → phải pass.

---

## 6. Smoke test (15 phút)

1. Mở app trên điện thoại (Glide Preview → "Share" → mở link).
2. Mở Menu → tap "Bạc xỉu" → chọn Size M, Đường 50%, Đá ít, qty 2 → "Thêm vào giỏ".
3. Mở Menu → tap "Bánh croissant" → qty 1 → "Thêm vào giỏ".
4. Tab Giỏ hàng → kiểm tra hiển thị 2 dòng, total = 28000*2 + 28000 = 84000.
5. Tap "Thanh toán" → nhập Tên = "Test", Phone = "0901234567" → Gửi.
6. **Kết quả mong đợi:**
   - Telegram bot MitsuKaphe gửi alert "🆕 Đơn mới ORD-..."
   - Sheets ORDERS có row mới, items_json đúng schema
   - Glide hiện Success screen + QR (nếu CONFIG đã có bank info; nếu chưa → placeholder OK)
7. Mở ORDERS sheet → copy `order_id` → Apps Script editor → chạy:
   ```js
   updateOrderStatus("ORD-...","CONFIRMED")
   ```
   - Đáng lẽ phải in tem qua Flask (Day 5). Tạm thời sẽ log error "LABEL_PRINTER_IP placeholder" — OK.

---

## 7. Checklist hoàn thành Day 4

- [ ] Chạy `initCartSheet()` → CART tab xuất hiện
- [ ] Glide app linked Sheets, 8 tabs hiển thị
- [ ] MENU có price_display, has_size_choice, customizations_obj
- [ ] CART có subtotal, modifier_summary
- [ ] CUSTOMERS có relation my_cart + rollups + items_json_string
- [ ] 5 screens: Menu / Item Detail / Cart / Checkout / Success
- [ ] Add to Cart action (Add Row + notify + go back)
- [ ] Submit Order action (Trigger Webhook + delete cart on success)
- [ ] URL param table_id (workaround OK)
- [ ] Smoke test: 1 đơn end-to-end → Telegram alert đến → row ở ORDERS

---

## 8. Sang Day 5 — Flask print server

Khi smoke test xong, đã có thể chuyển sang **Day 5** (`docs/session-handoff-day5.md`):
- Mac Mini chạy `print-server/print_server.py` trên port 5000
- Test in 1 tem từ Apps Script: `updateOrderStatus("ORD-...", "CONFIRMED")` → tem ra giấy
- Cần: IP máy in trên LAN (set static), điền vào CONFIG `LABEL_PRINTER_IP`

---

## 9. Các điểm yếu đã biết của Free plan

| Vấn đề | Workaround | Khi nào cần upgrade |
|---|---|---|
| Không có Row Owners → cart của user A có thể bị user B thấy nếu cùng device | Filter user_id + clear cart sau submit | Khi > 5 user concurrent (Maker plan) |
| Webhook không đọc được response body vào column | Hiển thị "Đơn đã gửi, chờ xác nhận" thay vì show order_id | Glide Pro |
| URL Param parsing hạn chế | QR riêng cho mỗi bàn, hard-code link |  |
| 1000 row update/tháng (Free) | OK cho < 30 đơn/ngày = ~900/tháng | Maker khi > 30 đơn/ngày |

---

*Glide setup guide v1 · Day 4 · 2026-05-19*
*Câu hỏi: paste lại file này + screenshot Glide editor vào session sau.*
