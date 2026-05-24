# Handoff — Day 4: Build Glide App
# Lâm Hà Kissaten · Cập nhật: 2026-05-19

## Trạng thái hiện tại

Day 1–3 đã hoàn thành và đã test end-to-end thành công.

| Hạng mục | Giá trị |
|---|---|
| GAS Web App URL | `https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec` |
| Script ID | `1nIdKqCQWD-BYGxin50Zf6L0aH41gu402nhM5SqkoaNvWvb4zV4wWhk4q` |
| Telegram Bot | KaeruKaphe · Token trong CONFIG sheet · Chat ID `8813631255` |
| Project dir | `~/Projects/lamha-kissaten/` |
| clasp | Đã login, push OK. Chạy: `cd ~/Projects/lamha-kissaten/gas && PATH="/opt/homebrew/bin:$PATH" clasp push` |

### Google Sheets "Kissaten DB"
- **7 tabs**: ORDERS, MENU (27 món), INVENTORY, CUSTOMERS, STAFF, PROMOTIONS, CONFIG
- Mở sheet: tìm trong Google Drive hoặc qua Apps Script editor
- MENU có cột: `sku, name, name_jp, category, subcategory, role, price_m, price_l, cost_nl, cost_packaging, cogs_percent, base_id, recipe_id, allergens, customizations, prep_time_sec, available, sort_order, story_telling`
- Lọc món hiển thị: `available = TRUE`

### Test order đã pass
```bash
GAS_URL="https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec"
REDIRECT=$(curl -s -X POST "$GAS_URL" \
  -H "Content-Type: application/json" \
  -d @seed/test_order_sample.json \
  -w "%{redirect_url}" -o /dev/null)
curl -s "$REDIRECT"
# → {"ok":true,"order_id":"ORD-20260519-XXXX"}
```

---

## Mục tiêu Day 4 — Glide App

Build Glide app để khách đặt hàng. Kết nối Google Sheets → UI → submit webhook.

### Yêu cầu chức năng
1. Danh mục → list món (filter available=TRUE, group by category)
2. Chọn món → customization (sugar %, ice level, size nếu có price_l)
3. Giỏ hàng → checkout: nhập tên + SĐT + (table_id tự động từ QR URL param)
4. Submit → POST JSON tới GAS Web App URL
5. Màn hình sau submit: hiện order_id + QR VietQR (nếu đã có bank info)

### JSON payload Glide phải gửi (schema GAS validateOrderPayload)
```json
{
  "channel": "web",
  "utm_source": "glide",
  "table_id": "TABLE_03",
  "customer_id": "0901234567",
  "items": [
    {
      "sku": "DR003",
      "name": "Bạc xỉu",
      "qty": 2,
      "price": 27000,
      "modifiers": { "sugar": "50%", "ice": "less" }
    }
  ],
  "total": 54000,
  "payment": { "method": "vietqr", "total": 54000, "status": "PENDING" },
  "notes": ""
}
```

### Lưu ý GAS validation
- `customer_id` bắt buộc (số điện thoại VN, GAS normalize về 0xxx)
- `items[]` bắt buộc, mỗi item cần: `sku, qty, price`
- `channel` bắt buộc
- `total` nên bằng sum(qty × price) các items

### Customization options per SKU (trong cột `customizations` của MENU)
```json
{
  "sugar": ["0%", "30%", "50%", "70%", "100%"],
  "ice":   ["full", "less", "none"]
}
```
Không phải món nào cũng có đủ options — đọc từ cột `customizations` của từng món.

### Table ID từ QR URL param
QR bàn sẽ có dạng: `https://glide.page/app/xxx?table_id=TABLE_01`
Glide đọc query param → tự điền `table_id` vào payload.

---

## GAS files hiện tại (tham khảo)

```
gas/
├── Code.gs         doPost entry · doGet health check
├── Orders.gs       validateOrderPayload · appendOrderToSheet · state machine
├── Notify.gs       sendTelegramAlert · buildTelegramOrderSummary · sendZaloNotify
├── Payment.gs      generateVietQR
├── Menu.gs         getActiveMenu
├── LabelPrint.gs   printOrderLabels (trigger khi CONFIRMED)
├── Utils.gs        getConfig · logError · formatCurrency
└── SeedSheets.gs   initAllSheets · seedMenuFromJson (đã chạy xong)
```

---

## Sau Day 4 — còn lại của MVP

| Day | Task | Phụ thuộc |
|---|---|---|
| Day 5 | Flask print server Mac Mini + Xprinter POS-58L | Cần IP máy in (set static DHCP) |
| Day 6 | VietQR trong Glide + state machine manual | Cần bank info: số TK, bank code, tên |
| Day 7 | QR sticker bàn (generate_qr.py) + smoke test 10 đơn | Cần số bàn |

---

## CONFIG sheet còn placeholder (cần điền)

| Key | Hiện tại | Cần |
|---|---|---|
| VIETQR_BANK_CODE | placeholder | VCB / TCB / MB... |
| VIETQR_ACCOUNT | placeholder | Số tài khoản |
| VIETQR_ACCT_NAME | placeholder | Tên chủ tài khoản |
| CAFE_NAME | placeholder | "Lâm Hà Kissaten" |
| CAFE_ADDRESS | placeholder | Địa chỉ thật |
| CAFE_PHONE | placeholder | SĐT quán |
| LABEL_PRINTER_IP | placeholder | IP Xprinter trên LAN (Day 5) |

---

## CLAUDE.md
Nguồn sự thật kiến trúc tại: `~/Projects/lamha-kissaten/CLAUDE.md`
Đọc trước khi build bất kỳ module nào.
