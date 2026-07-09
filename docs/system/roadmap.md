# Roadmap — Module Tiers + Build Checklist
> Split from CLAUDE.md §8 + §14. Index: ../../CLAUDE.md · Read when planning a phase or determining which tier a module belongs to.

## Module Tiers

```
TIER 0 — NOW (Days 1–7)
  M01 Order Core       doPost · appendOrder · Telegram alert
  M02 Menu Manager     getActiveMenu · MENU tab
  M03 Payment          VietQR · checkPayment

TIER 1 — MONTH 1 (Days 8–28)
  M04 Inventory        recipe_id → auto-deduct → STOCK_LOW alert
  M05 Kitchen Display  ORDERS filter NEW → Chrome → TV
  M06 Staff Manager    staff_id → performance → payroll
  M07 Offline Mode     4-level failover (see offline-failover.md)
  M08 Tracking         State machine + Zalo notify
  M09 Invoice & Label  CONFIRMED → cup label · DELIVERED → thermal receipt + PDF
  M10 Campaign Promo   15-min trigger + isCampaignActiveNow()

TIER 2 — MONTH 2–3
  M11 Loyalty Stamps   1 drink = 1 stamp · 10 stamps = 1 free
  M12 Customer CRM     History · RFM score
  M13 Personalization  OpenClaw + Qwen3:8b → AI item recommendations

TIER 3 — MONTH 3–6
  M14 Analytics        Looker Studio + Hermes 7am digest
  M15 Menu Engineering Stars/Dogs matrix
  M16 Demand Forecast  90 days data → ingredient forecast

TIER 4 — FUTURE
  M17 Multi-location   location_id in place from day 1
  M18 New Biz Line     category_type + business_line in place from day 1
```

## Build Checklist

### Phase 1 — Foundation (Days 1–3)
- [ ] 7 Sheets tabs with correct columns (including stamp_count, label_printed_at)
- [ ] CONFIG tab with all keys (LABEL_PRINTER_IP, STAMPS_FOR_FREE=10)
- [ ] Telegram Bot setup
- [ ] Manual test: enter 1 order into ORDERS

### Phase 2 — App & Label (Days 4–7)
- [ ] GAS: doPost · validateOrderPayload · appendOrderToSheet
- [ ] GAS: sendTelegramAlert
- [ ] Deploy GAS as Web App
- [ ] Python Flask print server on Mac Mini
- [ ] Test Xprinter POS-58L: print 1 test cup label
- [ ] GAS: printOrderLabels · buildLabelEscPos · sendToPrinter
- [ ] Glide: menu → form → webhook → cup label prints on CONFIRMED
- [ ] Table QR codes with table_id + utm_source

### Phase 3 — Zalo & KDS (Days 8–14)
- [ ] Zalo OA access_token → CONFIG
- [ ] GAS: sendZaloNotify · buildZaloStatusMessage
- [ ] GAS: updateOrderStatus() — test CONFIRMED → auto-print cup label
- [ ] KDS: ORDERS filter NEW → Chrome → TV
- [ ] Chrome Form offline fallback
- [ ] Test offline L1: kill router → network returns → sync

### Phase 4 — Pay & Invoice (Days 15–21)
- [ ] GAS: generateVietQR · checkPaymentStatus
- [ ] GAS: updateOrderStatus() full state machine — 6 states
- [ ] GAS: printThermalReceipt (DELIVERED) — distinct from cup label (CONFIRMED)
- [ ] GAS: generatePDFInvoice · sendInvoiceViaZalo
- [ ] Test XP-365B if complex labels / takeaway needed

### Phase 5 — Campaign & Launch (Days 22–28)
- [ ] GAS: checkAndRunCampaigns · isCampaignActiveNow · startCampaign · endCampaign
- [ ] Time trigger: 15 min → checkAndRunCampaigns
- [ ] Create Happy Hour Fri-Sat 14–17h campaign, test end-to-end
- [ ] Order buttons: Google Maps, Facebook, Instagram, TikTok bio
- [ ] Test offline L2 + L3 (kill router > 5 min, kill Mac Mini)
- [ ] Print + laminate offline SOP (1 page A4)
- [ ] Train staff
- [ ] 3-day soft launch

### Phase 6 — Loyalty (Month 1)
- [ ] GAS: addStamp · checkAndRedeemFreedrink · notifyStampUpdate
- [ ] Test: 10 beverage orders → stamps full → notify → redeem free drink
- [ ] Decide: do stamps expire?
```
