# GAS Function Map + Subagent Rules
> Tách từ CLAUDE.md §6 + §15. Index: ../../CLAUDE.md · Đọc khi cần biết hàm nằm ở file .gs nào, hoặc khi giao task subagent.

## Function Map

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

## Subagent Rules

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
