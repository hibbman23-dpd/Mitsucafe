# CLAUDE.md — Kissaten Ordering System
# Master Workflow v2.1 · Drink & Pastry Shop · Lâm Hà
# v1.1: Tem dán ly · Offline failover · Campaign promo · Stamp loyalty

> **Đọc file này trước khi làm bất kỳ task nào.**
> Đây là nguồn sự thật duy nhất (single source of truth) cho toàn bộ hệ thống.

---

## 1. KIẾN TRÚC TỔNG QUAN

```
[8 Kênh đặt hàng]
  web | qr | zalo | phone | maps | facebook | instagram | tiktok
         ↓ webhook POST / UTM link
[Google Apps Script — EVENT BUS]
  doPost() → validate → route → printLabel → track → invoice → promo → log
         ↓
[Google Sheets — DATABASE]
  ORDERS | MENU | INVENTORY | CUSTOMERS | STAFF | PROMOTIONS | CONFIG
         ↓
[Output]
  Xprinter POS-58L / XP-365B → Tem dán ly (khi CONFIRMED)
  Telegram → Alert chủ quán
  Zalo OA  → Notify khách (status + stamp + invoice)
  KDS tab  → Màn hình bếp/bar
  Bill nhiệt / PDF → Khi DELIVERED
```

**Nguyên tắc kiến trúc:**
- GAS là event bus duy nhất. Không có logic nào ngoài GAS.
- Sheets là database duy nhất. Không dùng external DB.
- ORDERS append-only — không update-in-place, chỉ ghi thêm cột trạng thái.
- `order_id` là khóa chính xuyên suốt toàn hệ thống.
- `customer_id` = số điện thoại (chuẩn hóa: bỏ +84, giữ 0xxx).
- **In tem dán ly xảy ra ngay khi CONFIRMED** — trước khi nhân viên bắt đầu pha chế.

---

## 2. EVENT SCHEMA (Canonical v1.1)

```json
{
  "event_id":     "EVT-YYYYMMDD-XXXXXX",
  "event_type":   "ORDER_CREATED",
  "timestamp":    "ISO 8601 +07:00",
  "schema_ver":   "1.1",

  "order_id":     "ORD-YYYYMMDD-XXXX",
  "channel":      "web|qr|zalo|facebook|instagram|tiktok|phone",
  "utm_source":   "qr|web|zalo|fb|ig|tiktok|phone",
  "location_id":  "LH01",
  "table_id":     "TABLE_XX | null",
  "staff_id":     "SXXX | null",
  "customer_id":  "0xxxxxxxxx",

  "items": [{
    "sku":        "DRXXX | BKXXX",
    "name":       "Tên món",
    "qty":        1,
    "price":      35000,
    "on_promo":   false,
    "promo_price": null,
    "modifiers":  { "sugar": "50%", "ice": "full|less|none" },
    "recipe_id":  "RXXX"
  }],

  "status":        "NEW",
  "confirmed_at":  null,
  "making_at":     null,
  "ready_at":      null,
  "delivering_at": null,
  "delivered_at":  null,

  "payment": {
    "method":  "vietqr|momo|zalopay|cash",
    "total":   70000,
    "status":  "PENDING|PAID|FAILED"
  },

  "label_printed_at": null,
  "invoice_url":      null,
  "printed_at":       null,

  "metadata": {
    "delivery_type": "dine_in|pickup|delivery",
    "business_line": "kissaten|bakery|retail|catering",
    "category_type": "beverage|pastry|retail|subscription",
    "notes":         ""
  }
}
```

---

## 3. GOOGLE SHEETS SCHEMA

### Tab: ORDERS (append-only)
```
order_id | event_id | timestamp | channel | utm_source | location_id |
table_id | staff_id | customer_id | items_json | subtotal | total |
status | confirmed_at | making_at | ready_at | delivering_at | delivered_at |
payment_method | payment_status | label_printed_at | invoice_url | printed_at | notes
```

### Tab: MENU
```
sku | name | category (beverage|pastry|retail) | price | cost |
on_promo | promo_price | promo_start | promo_end |
available | recipe_id | image_url | sort_order
```

### Tab: INVENTORY
```
ingredient_id | name | unit | current_stock | min_stock |
cost_per_unit | supplier | last_updated
```

### Tab: CUSTOMERS
```
customer_id | name | phone | zalo_id | first_order | last_order |
total_orders | total_spent |
stamp_count | stamp_total_ever | free_drinks_earned | free_drinks_used |
notes
```
> `stamp_count` reset về 0 sau mỗi lần đổi free drink.
> `stamp_total_ever` không bao giờ reset — dùng để tính free_drinks_earned.
> `stamp_count` chỉ cộng khi category_type = "beverage".

### Tab: STAFF
```
staff_id | name | role | pin | active | hourly_rate | shift_start | shift_end
```

### Tab: PROMOTIONS (Campaign-based — không phải daily)
```
campaign_id | name | type (flash|discount|bogo|happy_hour) |
discount_value | discount_type (pct|fixed) |
schedule_type (one_time|weekly|daily) |
start_date | end_date |
start_time | end_time |
days_of_week (Mon,Fri,Sat hoặc * = mọi ngày) |
target_skus (null = tất cả beverage) |
currently_running | zalo_sent | telegram_sent | slides_updated | is_active
```

### Tab: CONFIG
```
TELEGRAM_BOT_TOKEN    | xxx
TELEGRAM_CHAT_ID      | xxx
ZALO_OA_TOKEN         | xxx
VIETQR_ACCOUNT        | xxx
VIETQR_BANK_CODE      | VCB|TCB|...
VIETQR_ACCT_NAME      | xxx
LOCATION_ID           | LH01
PROMO_SLIDES_ID       | xxx
INVOICE_TEMPLATE_ID   | xxx
LABEL_PRINTER_IP      | 192.168.1.xxx  (IP local của máy in)
LABEL_PRINTER_PORT    | 9100           (RAW TCP port)
LABEL_PRINTER_MODEL   | POS-58L        (POS-58L hoặc XP-365B)
PRINT_SERVER_PORT     | 5000           (Port Flask server trên Mac Mini)
STAMP_PER_CUP         | 1
STAMPS_FOR_FREE       | 10
```

---

## 4. HARDWARE & PRINT SERVER

### Mac Mini M4 (Hiện tại)
```
Role: Print server + GAS webhook proxy · 24/7
Bắt buộc setup:
  System Settings → Energy → Prevent sleep: ON
  System Settings → General → Login Items → print_server.py: ON
  System Settings → Software Update → Auto update: OFF (tránh reboot tự động)
  Wake for network access: ON
```

### Raspberry Pi 3+ (Tương lai)
```
Role: Thay Mac Mini · nhỏ gọn, < 5W, không bao giờ tự update
OS: Raspberry Pi OS (Debian)
Setup: pip install python-escpos flask
Boot < 15 giây · Giá ~1.2M
Ưu điểm: Không crash vì update · Headless · Tiêu thụ điện thấp
```

### Local Print Server (chạy trên Mac Mini hoặc RPi)
```python
# print_server.py — Flask server nhận lệnh in từ GAS
from flask import Flask, request
import socket

app = Flask(__name__)
PRINTER_IP   = "192.168.1.xxx"  # IP Xprinter trên LAN
PRINTER_PORT = 9100              # RAW TCP port

@app.route('/print', methods=['POST'])
def print_label():
    data = request.data
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect((PRINTER_IP, PRINTER_PORT))
    sock.send(data)
    sock.close()
    return 'OK', 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)

# Hoặc nếu POS-58L cắm USB trực tiếp:
# from escpos.printer import Usb
# printer = Usb(0x0FE6, 0x811E)
```

---

## 5. TEM DÁN LY — ORDER LABEL SYSTEM

**Trigger**: `updateOrderStatus(order_id, "CONFIRMED")` → tự gọi `printOrderLabels()`.
**Rule**: Mỗi item trong đơn = 1 tem riêng. qty=2 → in 2 tem giống nhau.

### Xprinter POS-58L (Primary)
```
Khổ: 58mm thermal sticker roll
Kết nối: USB hoặc Bluetooth vào Mac Mini/RPi
Use: In nhanh, queue nhiều đơn liên tiếp

Preview tem 58mm:
┌──────────────────────────┐
│ ORD-0089      Bàn 03     │
│ ────────────────────────  │
│ Bạc xỉu × 1              │
│  Đường: 50% · Đá: ít     │
│  ít ngọt                 │
│ 14:32 · S002             │
└──────────────────────────┘
```

### Xprinter XP-365B (Secondary)
```
Khổ: 20–80mm die-cut label (tối ưu: 40×30mm)
Kết nối: USB
Use: Đơn takeaway, nhiều modifier, cần QR code order_id

Preview tem 40×30mm:
┌───────────────────────────┐
│ [QR: ORD-0089]  14:32     │
│ Cappuccino × 2            │
│ Đường: 30% · Đá: none    │
│ TAKEAWAY · S002           │
└───────────────────────────┘
```

### GAS functions
```javascript
function printOrderLabels(order) {
  order.items.forEach(item => {
    for (let i = 0; i < item.qty; i++) {
      const esc = buildLabelEscPos(order, item);
      sendToPrinter(esc);
    }
  });
  updateField(order.order_id, 'label_printed_at', new Date().toISOString());
}

function buildLabelEscPos(order, item) {
  const ESC = '\x1B', GS = '\x1D';
  let d = ESC + '@';                        // Init
  d += ESC + 'a\x01';                      // Center
  d += `ORD-${order.order_id}  ${order.table_id || order.channel}\n`;
  d += ESC + 'a\x00';                      // Left
  d += ('─').repeat(28) + '\n';
  d += `${item.name} x1\n`;
  if (item.modifiers) {
    d += '  ' + Object.entries(item.modifiers)
      .map(([k,v]) => `${k}: ${v}`).join(' · ') + '\n';
  }
  if (order.metadata.notes) d += `  ${order.metadata.notes}\n`;
  d += `${formatTime(order.timestamp)} · ${order.staff_id || ''}\n`;
  d += GS + 'V\x42\x00';                  // Full cut
  return d;
}

function sendToPrinter(escposData) {
  const ip   = getConfig('LABEL_PRINTER_IP');
  const port = getConfig('PRINT_SERVER_PORT') || '5000';
  UrlFetchApp.fetch(`http://${ip}:${port}/print`, {
    method: 'POST',
    contentType: 'application/octet-stream',
    payload: Utilities.newBlob(escposData).getBytes(),
  });
}
```

---

## 6. GAS FUNCTION MAP

### Core — Orders.gs
```
doPost(e)                    Webhook entry point
validateOrderPayload(data)   Required fields + chuẩn hóa customer_id
appendOrderToSheet(order)    Append vào ORDERS tab
generateOrderId()            ORD-YYYYMMDD-XXXX
generateEventId()            EVT-YYYYMMDD-XXXXXX
```

### Label — LabelPrint.gs
```
printOrderLabels(order)      Tách items → in từng tem
buildLabelEscPos(order, item) ESC/POS string 58mm
sendToPrinter(escposData)    POST tới Flask server trên Mac Mini/RPi
```

### Tracking — Orders.gs
```
updateOrderStatus(order_id, newStatus)
  → CONFIRMED: gọi printOrderLabels()
  → DELIVERED: gọi printThermalReceipt() + addStamp() + generatePDFInvoice()
isValidTransition(from, to)
getStatusTimestampColumn(status)
```

### Notification — Notify.gs
```
sendTelegramAlert(message)
sendZaloNotify(customer_id, msg)
buildTelegramOrderSummary(order)
buildZaloStatusMessage(order, status)
notifyStampUpdate(customer_id, newCount, total)
```

### Payment — Payment.gs
```
generateVietQR(order_id, amount)
buildVietQRUrl(bank, acct, name, amount, content)
checkPaymentStatus(order_id)
markOrderPaid(order_id)
```

### Invoice — Invoice.gs
```
printThermalReceipt(order_id)      Bill nhiệt 58mm khi DELIVERED
generatePDFInvoice(order_id)       Google Docs → PDF → URL
sendInvoiceViaZalo(order_id)       URL PDF qua Zalo
generateVATInvoice(order_id)       MISA/Viettel-S (tuỳ chọn)
```

### Menu — Menu.gs
```
getActiveMenu()
getMenuItemBySku(sku)
applyPromoPrice(sku, promo_price)
restoreOriginalPrice(sku)
```

### Campaign Promo — Promo.gs
```
checkAndRunCampaigns()         Time trigger mỗi 15 phút
getActiveCampaigns()
isCampaignActiveNow(c, now)    Check date + day_of_week + time range
startCampaign(campaign_id)     BẬT giá + broadcast Zalo + update Slides
endCampaign(campaign_id)       TẮT giá + Telegram report
broadcastZaloCampaign(campaign)
updatePromoSlides(campaign)
```

### Loyalty Stamps — Loyalty.gs
```
addStamp(customer_id)              +1 stamp (chỉ beverage)
checkAndRedeemFreedrink(customer_id) Đủ 10 → trừ 10, +1 free earned
redeemFreeDrink(customer_id)       Dùng 1 free drink
getStampBalance(customer_id)       {current, total, free_available}
notifyStampUpdate(customer_id, count) Zalo notify
```

### Inventory — Inventory.gs
```
deductInventoryForOrder(order)
checkStockLevel(ingredient_id)
alertLowStock(ingredient_id)
```

### Utility — Utils.gs
```
getConfig(key)
setConfig(key, value)
formatCurrency(amount)        70000 → "70.000đ"
formatTime(isoString)         → "14:32"
formatTimestamp(date)         → "14:32 06/05/2025"
updateField(order_id, col, val)
logError(context, error)      → ERROR_LOG tab + Telegram
```

---

## 7. ORDER STATUS FLOW

```
NEW → CONFIRMED → MAKING → READY → DELIVERED         (dine_in / pickup)
NEW → CONFIRMED → MAKING → READY → DELIVERING → DELIVERED  (delivery)

Transitions hợp lệ:
NEW        → CONFIRMED   nhân viên xác nhận
CONFIRMED  → MAKING      bắt đầu pha chế
MAKING     → READY       xong, gọi khách
READY      → DELIVERED   dine_in / pickup
READY      → DELIVERING  delivery orders
DELIVERING → DELIVERED   shipper giao xong

Side effects theo state:
NEW        → sendTelegramAlert() (alert chủ quán ngay)
CONFIRMED  → printOrderLabels() ← IN TEM DÁN LY
MAKING     → sendZaloNotify("Đang pha chế ☕")
READY      → sendZaloNotify("Xong rồi! Mời ra lấy 🔔")
DELIVERING → sendZaloNotify("Shipper en route 🛵")
DELIVERED  → printThermalReceipt()
             generatePDFInvoice() → sendInvoiceViaZalo()
             addStamp(customer_id) [beverage only]
             notifyStampUpdate()
```

---

## 8. MODULE TIERS

```
TIER 0 — NOW (Ngày 1–7)
  M01 Order Core       doPost · appendOrder · Telegram alert
  M02 Menu Manager     getActiveMenu · MENU tab
  M03 Payment          VietQR · checkPayment

TIER 1 — MONTH 1 (Ngày 8–28)
  M04 Inventory        recipe_id → auto-deduct → STOCK_LOW alert
  M05 Kitchen Display  ORDERS filter NEW → Chrome → TV
  M06 Staff Manager    staff_id → performance → payroll
  M07 Offline Mode     4 cấp failover (xem Section 10)
  M08 Tracking         State machine + Zalo notify
  M09 Invoice & Label  CONFIRMED → label · DELIVERED → bill + PDF
  M10 Campaign Promo   15-min trigger + isCampaignActiveNow()

TIER 2 — MONTH 2–3
  M11 Loyalty Stamps   1 ly = 1 tem · 10 tem = 1 free
  M12 Customer CRM     History · RFM score
  M13 Personalization  OpenClaw + Qwen3:8b → AI gợi ý món

TIER 3 — MONTH 3–6
  M14 Analytics        Looker Studio + Hermes 7am digest
  M15 Menu Engineering Stars/Dogs matrix
  M16 Demand Forecast  90 ngày data → dự báo nguyên liệu

TIER 4 — FUTURE
  M17 Multi-location   location_id đã có từ ngày 1
  M18 New Biz Line     category_type + business_line đã có
```

---

## 9. API INTEGRATIONS

### Telegram Bot
```
POST https://api.telegram.org/bot{TOKEN}/sendMessage
{ chat_id, text, parse_mode: "HTML" }
Dùng cho: Đơn mới · STOCK_LOW · Campaign start/end · System error
```

### Zalo OA
```
POST https://openapi.zalo.me/v2.0/oa/message
Header: access_token
Dùng cho: Status update · PDF invoice · Stamp notify · Campaign broadcast
Note: Khách phải follow OA trước khi nhận message
```

### VietQR (Open API, không cần key)
```
https://img.vietqr.io/image/{BANK}-{ACCT}-compact2.png
  ?amount={TOTAL}&addInfo={ORDER_ID}&accountName={NAME}
addInfo = order_id → đối soát tự động (match nội dung chuyển khoản)
```

### Local Print Server
```
POST http://{LABEL_PRINTER_IP}:{PRINT_SERVER_PORT}/print
Content-Type: application/octet-stream
Body: ESC/POS raw bytes
Protocol: Flask server trên Mac Mini/RPi → TCP 9100 → Xprinter
```

### Google Docs (PDF Invoice)
```
1. DriveApp.getFileById(TEMPLATE_ID).makeCopy(order_id)
2. replaceText placeholders: {{ORDER_ID}} {{DATE}} {{ITEMS}} {{TOTAL}} {{STAMPS}}
3. Drive.Files.export → PDF blob → DriveApp.createFile → URL
4. sendInvoiceViaZalo(url)
```

---

## 10. OFFLINE & FAILOVER

### L1 — Mất mạng < 5 phút
```
Trigger: Router reset, chập chờn
Action:  Glide cache offline · Mac Mini queue in local · GAS auto-sync khi về
Fix:     Tự động — không cần can thiệp
```

### L2 — Mất mạng > 5 phút
```
Trigger: Cúp mạng, ISP lỗi
Action:  Chrome Form cache nhận đơn nội bộ
         In tem qua LAN (internet down nhưng LAN vẫn OK)
         Ghi tay giấy A5 nếu cần
Fix:     Sync Chrome Form → Sheets khi mạng về (< 5 phút)
```

### L3 — Mac Mini crash
```
Trigger: macOS crash, quá nhiệt
Action:  Tablet KDS thành thiết bị chính tạm
         In tem từ máy in cắm trực tiếp tablet (USB OTG)
         GAS vẫn online nếu mạng ổn (GAS = Google Cloud)
Fix:     Mac Mini auto-restart < 2 phút
Phòng:   Tắt auto-update macOS · Bật auto-restart after power failure
Long:    RPi 3+ thay Mac Mini (không bao giờ tự update)
```

### L4 — Cúp điện
```
Trigger: Mất điện hoàn toàn
Action:  Pin dự phòng cho tablet · Form giấy A5 laminated
         Gọi điện báo khách delivery đang chờ
Fix:     Nhập lại Sheets thủ công khi có điện
```

### SOP Offline (In laminated, dán tại quầy)
```
1. Mạng chết     → Chrome Form cache · In tem LAN
2. Không in được → Marker trên giấy A5 · Dán lên ly
3. Mạng về       → Sync Form → Sheets
4. Mac crash     → Tắt nguồn 10s → bật lại · Nhắn chủ qua Zalo
5. Tất cả crash  → Giấy A5 + bút · Gọi chủ ngay
```

---

## 11. LOYALTY STAMPS (v2)

```
Quy tắc:
  Mua 1 ly (beverage) = 1 tem
  Chỉ beverage — không áp dụng pastry/retail
  10 tem = 1 ly miễn phí (tier 2 trở xuống trong menu)
  Tem không hết hạn (review sau 12 tháng)

Flow khi DELIVERED:
  item.category_type === "beverage"?
    YES → addStamp(customer_id) × item.qty
          stamp_count >= 10?
            YES → stamp_count -= 10, free_drinks_earned += 1
                  Zalo: "🎉 Đủ 10 tem! Bạn được 1 ly miễn phí lần sau"
            NO  → Zalo: "🎟️ X/10 tem. Còn Y tem nữa là free!"
    NO  → bỏ qua

Zalo templates:
  Tích: "☕ Vừa tích 1 tem! [X]/10 🎟️ · Còn [Y] tem nữa là free!"
  Đủ:   "🎉 Đủ 10 tem rồi! Lần sau ghé nhắc nhân viên để lấy 1 ly free nhé!"
  Đổi:  "✅ 1 ly miễn phí đã dùng. Tem bắt đầu từ 0. Cảm ơn! ❤️"
```

---

## 12. CAMPAIGN PROMO (v2)

**Quan trọng**: Không còn trigger 8am mỗi ngày. Dùng 15-phút interval + `isCampaignActiveNow()`.

```
schedule_type values:
  one_time → Chạy 1 lần: start_date + start_time → end_time
  weekly   → Lặp theo thứ: days_of_week (Mon,Fri,Sat) + khung giờ
  daily    → Mỗi ngày trong date range + khung giờ

Ví dụ campaigns:
  Happy Hour T6-T7  | weekly | Fri,Sat | 14:00–17:00 | -15%
  Khai trương       | one_time | 2025-06-01 | 09:00–21:00 | -20%
  Combo sáng        | daily | * | 07:00–10:00 | BOGO croffle

GAS trigger: checkAndRunCampaigns() mỗi 15 phút
  → getActiveCampaigns() → filter is_active = TRUE
  → isCampaignActiveNow(c) → check date + day + time
  → shouldBeActive XOR currentlyRunning → startCampaign / endCampaign
```

---

## 13. NAMING CONVENTIONS

```
GAS files:  Code.gs · Orders.gs · LabelPrint.gs · Invoice.gs
            Payment.gs · Promo.gs · Loyalty.gs · Inventory.gs
            Notify.gs · Utils.gs
Sheets:     UPPERCASE (ORDERS, MENU, CUSTOMERS...)
Variables:  camelCase (orderId, stampCount, campaignId)
Constants:  UPPER_SNAKE (STAMPS_FOR_FREE, LABEL_PRINTER_IP)
Functions:  verbNoun (printLabel, addStamp, startCampaign)
order_id:   ORD-YYYYMMDD-XXXX
event_id:   EVT-YYYYMMDD-XXXXXX
campaign:   promo-YYYYMMDD-XXX
SKU:        DR001 (drink) · BK001 (bánh) · RT001 (retail)
```

---

## 14. BUILD CHECKLIST

### Phase 1 — Foundation (Ngày 1–3)
- [ ] 7 Sheets tabs với đúng columns (bao gồm stamp_count, label_printed_at)
- [ ] CONFIG tab đầy đủ keys (LABEL_PRINTER_IP, STAMPS_FOR_FREE=10)
- [ ] Telegram Bot setup
- [ ] Test thủ công: điền 1 đơn vào ORDERS

### Phase 2 — App & Label (Ngày 4–7)
- [ ] GAS: doPost · validateOrderPayload · appendOrderToSheet
- [ ] GAS: sendTelegramAlert
- [ ] Deploy GAS as Web App
- [ ] Python Flask print server trên Mac Mini
- [ ] Test Xprinter POS-58L: in 1 tem thử
- [ ] GAS: printOrderLabels · buildLabelEscPos · sendToPrinter
- [ ] Glide: menu → form → webhook → nhận tem ngay sau CONFIRMED
- [ ] QR bàn với table_id + utm_source

### Phase 3 — Zalo & KDS (Ngày 8–14)
- [ ] Zalo OA access_token → CONFIG
- [ ] GAS: sendZaloNotify · buildZaloStatusMessage
- [ ] GAS: updateOrderStatus() — test CONFIRMED → in tem tự động
- [ ] KDS: ORDERS filter NEW → Chrome → TV
- [ ] Chrome Form offline fallback
- [ ] Test offline L1: tắt router → mạng về → sync

### Phase 4 — Pay & Invoice (Ngày 15–21)
- [ ] GAS: generateVietQR · checkPaymentStatus
- [ ] GAS: updateOrderStatus() state machine đầy đủ 6 states
- [ ] GAS: printThermalReceipt (DELIVERED) — khác với label (CONFIRMED)
- [ ] GAS: generatePDFInvoice · sendInvoiceViaZalo
- [ ] Test XP-365B nếu cần label phức tạp / takeaway

### Phase 5 — Campaign & Launch (Ngày 22–28)
- [ ] GAS: checkAndRunCampaigns · isCampaignActiveNow · startCampaign · endCampaign
- [ ] Time trigger: 15 phút → checkAndRunCampaigns
- [ ] Tạo campaign Happy Hour T6-T7 14–17h, test end-to-end
- [ ] Order buttons: Google Maps, Facebook, Instagram, TikTok bio
- [ ] Test offline L2 + L3 (tắt router > 5 phút, tắt Mac Mini)
- [ ] In + ép nhựa SOP offline (1 trang A4)
- [ ] Train nhân viên
- [ ] Soft launch 3 ngày

### Phase 6 — Loyalty (Tháng 1)
- [ ] GAS: addStamp · checkAndRedeemFreedrink · notifyStampUpdate
- [ ] Test: 10 đơn beverage → đủ tem → notify → đổi free drink
- [ ] Quyết định: tem có hết hạn không?

---

## 15. SUBAGENT RULES

```
HAIKU (CLAUDE_CODE_SUBAGENT_MODEL=haiku):
  Đọc schema Sheets / không write code
  Boilerplate: getConfig, formatCurrency, logError
  ESC/POS string cơ bản 58mm
  Sheets formulas: FILTER, ARRAYFORMULA

SONNET (main session):
  doPost() routing logic
  updateOrderStatus() state machine + side effects
  printOrderLabels() · buildLabelEscPos()
  isCampaignActiveNow() scheduling logic
  Python Flask print server
  addStamp() loyalty logic
  VietQR reconciliation

/compact sau mỗi module hoàn thành
Mỗi GAS file = 1 subagent task riêng
```

---

## 16. KHÔNG LÀM

```
❌ External database — Sheets đủ
❌ Token/key trong code — luôn đọc từ CONFIG sheet
❌ GAS trigger < 15 phút — Google giới hạn
❌ Update in-place ORDERS — append only
❌ Hardcode location_id
❌ Bỏ qua logError()
❌ In tem sau MAKING — phải là CONFIRMED
❌ Points system — đã chuyển sang stamp card
❌ Trigger 8am cố định cho promo — dùng 15-phút interval
❌ Bật auto-update macOS — gây reboot không báo
❌ Cộng stamp cho pastry/retail — chỉ beverage
```

---

*CLAUDE.md v1.1 · Kissaten Ordering System*
*v1.0→v1.1: +Tem dán ly (POS-58L/XP-365B) · +Offline 4 cấp · +Campaign promo · +Stamp card loyalty · +Mac Mini/RPi setup*
