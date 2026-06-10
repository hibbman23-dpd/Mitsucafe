# Roadmap — Module Tiers + Build Checklist
> Tách từ CLAUDE.md §8 + §14. Index: ../../CLAUDE.md · Đọc khi plan phase hoặc xác định module thuộc tier nào.

## Module Tiers

```
TIER 0 — NOW (Ngày 1–7)
  M01 Order Core       doPost · appendOrder · Telegram alert
  M02 Menu Manager     getActiveMenu · MENU tab
  M03 Payment          VietQR · checkPayment

TIER 1 — MONTH 1 (Ngày 8–28)
  M04 Inventory        recipe_id → auto-deduct → STOCK_LOW alert
  M05 Kitchen Display  ORDERS filter NEW → Chrome → TV
  M06 Staff Manager    staff_id → performance → payroll
  M07 Offline Mode     4 cấp failover (xem offline-failover.md)
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

## Build Checklist

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
```
