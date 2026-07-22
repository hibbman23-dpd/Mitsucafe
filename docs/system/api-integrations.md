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

## Meta Graph API (FB/IG insights)
```
Base: https://graph.facebook.com/v21.0   (gas/Meta.gs)
CONFIG: META_SYSTEM_TOKEN · META_PAGE_ID=1170994919421423 · META_IG_USER_ID
Dùng cho: đọc post insights + IG media insights (READ-ONLY, không đăng bài → khỏi App Review)
```

### SOP lấy token vĩnh viễn (System User token — không hết hạn)
User token 60 ngày SẼ hết → phải dùng "Người dùng hệ thống" (System User), thời hạn = Không bao giờ.
Điều kiện: Trang + IG business thuộc tài sản trong Meta Business; IG là Business/Creator liên kết vào Trang; có 1 Ứng dụng (App) trong Business.

Các bước (giao diện tiếng Việt — business.facebook.com/settings):
1. **Cài đặt doanh nghiệp** → **Người dùng** → **Người dùng hệ thống** → **Thêm** → tên `mitsu-analytics`, vai trò **Quản trị viên** → **Tạo người dùng hệ thống**.
2. Chọn người dùng vừa tạo → **Thêm tài sản** (Add Assets):
   - **Trang** (Pages) → chọn Trang Mitsu → bật **Toàn quyền kiểm soát**.
   - **Tài khoản Instagram** → chọn IG Mitsu → bật quyền.
   - **Ứng dụng** (Apps) → chọn App của quán.
3. Bấm **Tạo token** (Generate new token):
   - Chọn **Ứng dụng** vừa gán.
   - **Thời hạn token** (Token expiration) → chọn **Không bao giờ** (Never) ← chỗ làm token vĩnh viễn.
   - Tick quyền (read, tên quyền để nguyên tiếng Anh trong danh sách):
     read_insights · pages_read_engagement · pages_show_list · instagram_basic · instagram_manage_insights · business_management
   - Bấm **Tạo token**.
4. Copy token (hiện 1 lần) → dán vào tab CONFIG, key META_SYSTEM_TOKEN. KHÔNG để trong code.

Verify (thay TOKEN):
```
curl -s "https://graph.facebook.com/debug_token?input_token=TOKEN&access_token=TOKEN"
  → "expires_at":0 = vĩnh viễn ✅ · is_valid:true · scopes đủ
curl -s "https://graph.facebook.com/v21.0/1170994919421423/insights?metric=page_impressions&access_token=TOKEN"
  → ra JSON số liệu = xong · ra error OAuth = thiếu quyền/asset
```
Token chết khi: reset App Secret · xóa system user khỏi Business · gỡ quyền Page. Giữ nguyên = chạy mãi.

## Google Docs (PDF Invoice)
```
1. DriveApp.getFileById(TEMPLATE_ID).makeCopy(order_id)
2. replaceText placeholders: {{ORDER_ID}} {{DATE}} {{ITEMS}} {{TOTAL}} {{STAMPS}}
3. Drive.Files.export → PDF blob → DriveApp.createFile → URL
4. sendInvoiceViaZalo(url)
```
