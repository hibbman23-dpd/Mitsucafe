# GAS Function Map + Subagent Rules
> Split from CLAUDE.md §6 + §15. Index: ../../CLAUDE.md · Read to find which .gs file a function lives in, or when assigning subagent tasks.

## Function Map

### Core — Orders.gs
```
doPost(e)                    Webhook entry point
validateOrderPayload(data)   Validate required fields + normalize customer_id
appendOrderToSheet(order)    Append to ORDERS tab
generateOrderId()            ORD-YYYYMMDD-XXXX
generateEventId()            EVT-YYYYMMDD-XXXXXX
```

### Label — LabelPrint.gs
```
printOrderLabels(order)      Split items → print one cup label each
buildLabelEscPos(order, item) ESC/POS string 58mm
sendToPrinter(escposData)    POST to Flask server on Mac Mini/RPi
```

### Tracking — Orders.gs
```
updateOrderStatus(order_id, newStatus)
  → CONFIRMED: calls printOrderLabels()
  → DELIVERED: calls printThermalReceipt() + addStamp() + generatePDFInvoice()
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
printThermalReceipt(order_id)      Thermal receipt 58mm on DELIVERED
generatePDFInvoice(order_id)       Google Docs → PDF → URL
sendInvoiceViaZalo(order_id)       PDF URL via Zalo
generateVATInvoice(order_id)       MISA/Viettel-S (optional)
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
checkAndRunCampaigns()         Time trigger every 15 minutes
getActiveCampaigns()
isCampaignActiveNow(c, now)    Check date + day_of_week + time range
startCampaign(campaign_id)     Enable prices + broadcast Zalo + update Slides
endCampaign(campaign_id)       Restore prices + Telegram report
broadcastZaloCampaign(campaign)
updatePromoSlides(campaign)
```

### Loyalty Stamps — Loyalty.gs
```
addStamp(customer_id)              +1 stamp (beverages only)
checkAndRedeemFreedrink(customer_id) At 10 → deduct 10, +1 free earned
redeemFreeDrink(customer_id)       Redeem 1 free drink
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
  Read Sheets schema / no code writing
  Boilerplate: getConfig, formatCurrency, logError
  Basic ESC/POS string 58mm
  Sheets formulas: FILTER, ARRAYFORMULA

SONNET (main session):
  doPost() routing logic
  updateOrderStatus() state machine + side effects
  printOrderLabels() · buildLabelEscPos()
  isCampaignActiveNow() scheduling logic
  Python Flask print server
  addStamp() loyalty logic
  VietQR reconciliation

/compact after each module is complete
Each GAS file = 1 separate subagent task
```
