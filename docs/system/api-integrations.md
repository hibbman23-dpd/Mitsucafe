# API Integrations
> Split from CLAUDE.md §9. Index: ../../CLAUDE.md · Read when integrating Telegram / Zalo / VietQR / Google Docs / Print server.

## Telegram Bot
```
POST https://api.telegram.org/bot{TOKEN}/sendMessage
{ chat_id, text, parse_mode: "HTML" }
Used for: new order · STOCK_LOW · campaign start/end · system error
```

## Zalo OA
```
POST https://openapi.zalo.me/v2.0/oa/message
Header: access_token
Used for: status update · PDF invoice · stamp notify · campaign broadcast
Note: customer must follow OA before they can receive messages
```

## VietQR (Open API, no key required)
```
https://img.vietqr.io/image/{BANK}-{ACCT}-compact2.png
  ?amount={TOTAL}&addInfo={ORDER_ID}&accountName={NAME}
addInfo = order_id → automatic reconciliation (matches transfer description)
```

## Local Print Server
```
POST http://{LABEL_PRINTER_IP}:{PRINT_SERVER_PORT}/print
Content-Type: application/octet-stream
Body: ESC/POS raw bytes
Protocol: Flask server on Mac Mini/RPi → TCP 9100 → Xprinter
```

## Google Docs (PDF Invoice)
```
1. DriveApp.getFileById(TEMPLATE_ID).makeCopy(order_id)
2. replaceText placeholders: {{ORDER_ID}} {{DATE}} {{ITEMS}} {{TOTAL}} {{STAMPS}}
3. Drive.Files.export → PDF blob → DriveApp.createFile → URL
4. sendInvoiceViaZalo(url)
```
