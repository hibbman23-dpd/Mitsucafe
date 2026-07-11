# CLAUDE.md — Kissaten Ordering System (Index)
# Master Workflow v2.2 · Drink & Pastry Shop · Lâm Hà

> **File này = bản đồ + luật cốt lõi (đọc trước mọi task).**
> Chi tiết đầy đủ nằm trong `docs/system/*`. Khi task chạm mảng nào, **ĐỌC đúng file đó** —
> đó là nguồn sự thật của mảng đó. Nội dung không mất, chỉ tách ra để tiết kiệm context.
> (v2.1→v2.2: tách §2–§6, §8–§12, §14–§15 vào docs/system/. Lõi giữ lại: kiến trúc, status flow, naming, KHÔNG LÀM.)

---

## 0. INDEX — đọc file nào khi nào

| Mảng | File | Đọc khi |
|------|------|---------|
| Event schema (payload chuẩn) | `docs/system/event-schema.md` | Sửa doPost / validate / payload webhook |
| Google Sheets schema (7 tab) | `docs/system/sheets-schema.md` | Đụng cột Sheets, CONFIG keys |
| Tem dán ly + phần cứng in | `docs/system/labels-print.md` | ESC/POS, Xprinter, Flask print server |
| GAS function map + subagent | `docs/system/gas-functions.md` | Tìm hàm nằm ở file .gs nào, giao task subagent |
| API integrations | `docs/system/api-integrations.md` | Telegram / Zalo / VietQR / Google Docs |
| Offline & failover 4 cấp | `docs/system/offline-failover.md` | SOP mất mạng / Mac crash / cúp điện |
| Loyalty stamps | `docs/system/loyalty-stamps.md` | addStamp, redeem, Zalo stamp template |
| Campaign promo | `docs/system/campaign-promo.md` | checkAndRunCampaigns, scheduling |
| Roadmap (module tiers + checklist) | `docs/system/roadmap.md` | Plan phase, module thuộc tier nào |

Docs khác: `docs/architecture.md` (kiến trúc chi tiết) · `docs/agent-map.md` (skill/agent vận hành quán) · `docs/TOKEN_EFFICIENCY.md` (cách làm việc tiết kiệm token).

---

## 1. KIẾN TRÚC (cốt lõi)

```
[8 Kênh] web|qr|zalo|phone|maps|facebook|instagram|tiktok
   ↓ webhook POST / UTM link
[Google Apps Script — EVENT BUS]
   doPost() → validate → route → printLabel → track → invoice → promo → log
   ↓
[Google Sheets — DATABASE]
   ORDERS | MENU | INVENTORY | CUSTOMERS | STAFF | PROMOTIONS | CONFIG
   ↓
[Output] Xprinter POS-58L/XP-365B (tem được Mac Mini poller in ngay khi đơn NEW) · Telegram (alert chủ)
         Zalo OA (status+stamp+invoice) · KDS tab · Bill nhiệt/PDF (khi DELIVERED)
```

**Nguyên tắc bất biến:**
- GAS = event bus duy nhất · Sheets = database duy nhất · **không** external DB.
- ORDERS **append-only** — không update-in-place, chỉ ghi thêm cột trạng thái.
- `order_id` = khóa chính xuyên suốt. `customer_id` = SĐT chuẩn hóa (bỏ +84, giữ 0xxx).
- In tem dán ly **ngay khi CONFIRMED** — trước khi pha chế.

---

## 2. ORDER STATUS FLOW (state machine — cốt lõi)

```
dine_in/pickup: NEW → CONFIRMED → MAKING → READY → DELIVERED
delivery:       NEW → CONFIRMED → MAKING → READY → DELIVERING → DELIVERED

Transitions hợp lệ: NEW→CONFIRMED · CONFIRMED→MAKING · MAKING→READY
                    READY→DELIVERED · READY→DELIVERING · DELIVERING→DELIVERED

Side effects theo state:
NEW        → sendTelegramAlert() + enqueue label  (Mac Mini poller in tem ngay)
CONFIRMED  → xác nhận đơn (tem đã được in trước khi pha)
MAKING     → sendZaloNotify("Đang pha chế ☕")
READY      → sendZaloNotify("Xong rồi! Mời ra lấy 🔔")
DELIVERING → sendZaloNotify("Shipper en route 🛵")
DELIVERED  → printThermalReceipt() · generatePDFInvoice() → sendInvoiceViaZalo()
             addStamp(customer_id) [beverage only] · notifyStampUpdate()
```

---

## 3. NAMING CONVENTIONS

```
GAS files:  Code.gs · Orders.gs · LabelPrint.gs · Invoice.gs · Payment.gs
            Promo.gs · Loyalty.gs · Inventory.gs · Notify.gs · Utils.gs
Sheets:     UPPERCASE (ORDERS, MENU, CUSTOMERS...)
Variables:  camelCase (orderId, stampCount)   Constants: UPPER_SNAKE (STAMPS_FOR_FREE)
Functions:  verbNoun (printLabel, addStamp, startCampaign)
order_id: ORD-YYYYMMDD-XXXX · event_id: EVT-YYYYMMDD-XXXXXX · campaign: promo-YYYYMMDD-XXX
SKU: DR001 (drink) · BK001 (bánh) · RT001 (retail)
```

---

## 4. KHÔNG LÀM (guardrails)

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

*CLAUDE.md v2.2 (index) · Kissaten Ordering System · chi tiết: docs/system/*
