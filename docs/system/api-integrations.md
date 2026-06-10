# API Integrations
> Tách từ CLAUDE.md §9. Index: ../../CLAUDE.md · Đọc khi tích hợp Telegram / Zalo / VietQR / Google Docs / Print server.

## Telegram Bot
```
POST https://api.telegram.org/bot{TOKEN}/sendMessage
{ chat_id, text, parse_mode: "HTML" }
Dùng cho: Đơn mới · STOCK_LOW · Campaign start/end · System error
```

## Zalo OA
```
POST https://openapi.zalo.me/v2.0/oa/message
Header: access_token
Dùng cho: Status update · PDF invoice · Stamp notify · Campaign broadcast
Note: Khách phải follow OA trước khi nhận message
```

## VietQR (Open API, không cần key)
```
https://img.vietqr.io/image/{BANK}-{ACCT}-compact2.png
  ?amount={TOTAL}&addInfo={ORDER_ID}&accountName={NAME}
addInfo = order_id → đối soát tự động (match nội dung chuyển khoản)
```

## Local Print Server
```
POST http://{LABEL_PRINTER_IP}:{PRINT_SERVER_PORT}/print
Content-Type: application/octet-stream
Body: ESC/POS raw bytes
Protocol: Flask server trên Mac Mini/RPi → TCP 9100 → Xprinter
```

## Google Docs (PDF Invoice)
```
1. DriveApp.getFileById(TEMPLATE_ID).makeCopy(order_id)
2. replaceText placeholders: {{ORDER_ID}} {{DATE}} {{ITEMS}} {{TOTAL}} {{STAMPS}}
3. Drive.Files.export → PDF blob → DriveApp.createFile → URL
4. sendInvoiceViaZalo(url)
```
