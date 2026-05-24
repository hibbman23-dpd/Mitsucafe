# Architecture — Lâm Hà Kissaten Ordering System

> Tài liệu này tóm tắt. Chi tiết đầy đủ: [../CLAUDE.md](../CLAUDE.md)

## Component map

```
┌─ INPUT LAYER (8 kênh) ─────────────────────────────────────┐
│  Web (Glide) · QR bàn · Zalo OA · Phone form · Maps        │
│  Facebook · Instagram · TikTok                              │
└───────────────────────────┬─────────────────────────────────┘
                            │ webhook POST (JSON) + UTM
                            ▼
┌─ EVENT BUS ────────────────────────────────────────────────┐
│  Google Apps Script · doPost() Web App                      │
│    validate → assign order_id → append → side effects       │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────┬───────┼───────┬───────────┬────────────┐
        ▼           ▼       ▼       ▼           ▼            ▼
   Sheets ORDERS  Telegram  Zalo   VietQR    Print Server   KDS
   (append-only)  alert    notify   QR       (Flask→TCP)    (tablet)
                                              │
                                              ▼
                                       Xprinter POS-58L
                                       (tem dán ly)
```

## State machine

```
NEW ──CONFIRMED──▶ MAKING ──READY──▶ DELIVERED        (dine_in / pickup)
                                  └─▶ DELIVERING ──▶ DELIVERED  (delivery)

Side effects:
  NEW         → sendTelegramAlert()
  CONFIRMED   → printOrderLabels()           ← TEM DÁN LY
  MAKING      → sendZaloNotify("Đang pha")
  READY       → sendZaloNotify("Mời ra lấy")
  DELIVERING  → sendZaloNotify("Shipper en route")
  DELIVERED   → printThermalReceipt()
                generatePDFInvoice() → Zalo
                addStamp() [beverage only]
```

## Data flow

1. Khách quét QR bàn → mở Glide app (URL có `?channel=qr&utm_source=qr&table_id=TABLE_03`)
2. Chọn món, modifier, submit → Glide gọi webhook GAS `doPost()`
3. GAS validate JSON → assign `order_id` → append vào ORDERS sheet (status=NEW)
4. GAS gửi Telegram alert tới chủ quán
5. Nhân viên đổi status NEW → CONFIRMED trong Sheets (hoặc qua KDS tablet)
6. GAS hook `updateOrderStatus()` → gọi `printOrderLabels()` → POS-58L in 1 tem / qty
7. Pha xong → READY → khách nhận Zalo notify
8. Giao → DELIVERED → bill nhiệt in + PDF gửi Zalo + tem loyalty +1

## Schema invariants

- ORDERS **append-only**. Update chỉ với cột trạng thái timestamp (`confirmed_at`, ...) — không thay đổi data đơn gốc.
- `order_id` = `ORD-YYYYMMDD-XXXX` — bất biến, là khóa chính xuyên toàn hệ thống.
- `customer_id` = SĐT chuẩn hoá (bỏ +84, giữ 0xxx) — primary key cho CUSTOMERS.
- `location_id`, `category_type`, `business_line` phải có từ ngày 1 dù chỉ 1 chi nhánh / 1 ngành.

## Failure modes & mitigation

| Failure | Tác động | Mitigation |
|---|---|---|
| Mất mạng < 5' (L1) | Glide cache offline | GAS auto-sync khi mạng về |
| Mất mạng > 5' (L2) | Đơn mới không sync | Chrome Form cache · in tem qua LAN · sync khi mạng về |
| Mac Mini crash (L3) | Không in tem | Tablet KDS → manual print (USB OTG) · Auto-restart Mac Mini |
| Cúp điện (L4) | Tất cả crash | Pin tablet · giấy A5 ép nhựa · nhập lại sau |
| Xprinter IP đổi | In thất bại | DHCP reservation trong router (static IP) |
| GAS rate limit | Trigger fail | Trigger ≥ 15 phút (hard limit Google) |

## Reference

- CLAUDE.md §2 — Event schema canonical
- CLAUDE.md §3 — Sheets schema
- CLAUDE.md §5 — Tem dán ly + ESC/POS code
- CLAUDE.md §7 — State machine
- CLAUDE.md §10 — Offline 4-tier
- CLAUDE.md §11 — Loyalty stamps
- CLAUDE.md §12 — Campaign promo
