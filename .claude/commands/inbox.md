---
description: Nhặt lệnh từ COMMAND_QUEUE (chat dashboard) → thực thi → ghi kết quả lại
---

Cầu nối Dashboard chat → Claude Code. Dùng **GET endpoint** (Apps Script chỉ cho curl GET, không POST).
Chạy tay khi muốn, hoặc qua loop `/loop 2m /inbox`.

WEB_APP_URL = `https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec`

Workflow:
0. (Tuỳ chọn) Đọc `report_api_token` từ `.claude/.dispatcher-auth.json` (gitignored). Mặc định rỗng = endpoint mở. Nếu user đã set REPORT_API_TOKEN trong CONFIG để bảo mật → đọc token này append `&token=<...>` vào mọi call.
1. **Pull + heartbeat (1 call):** `GET {WEB_APP_URL}?action=dispatch_pull[&token=...]`
   → tự ghi heartbeat (dashboard hiện 🟢) + trả `commands` (lệnh status=pending, mới→cũ).
2. Với MỖI lệnh (xử lý CŨ→MỚI, tức đảo ngược danh sách):
   - Parse `text`:
     - Bắt đầu `/` → slash command → route skill `cafe-manager` mode tương ứng (vd `/roi tuần`, `/promo ...`).
     - Văn bản tự do → hiểu ý định → route skill phù hợp (vd "tạo promo trà -15%" → campaign-promo).
   - Thực thi qua skill `cafe-manager` (tuân brand voice + nguyên tắc cafe-manager).
   - ⚠️ Lệnh side-effect (publish/gửi Zalo/post/email/ghi tiền) → CHỈ draft, KHÔNG tự làm. result = "đã draft, cần duyệt".
   - Ghi kết quả: `GET {WEB_APP_URL}?action=dispatch_done&id=<command_id>&status=done&result=<URL-encode, ≤300 ký tự>[&token=...]`
     (lỗi → `status=error`, result = thông báo lỗi)
3. Lệnh sinh insight đáng chú ý → cũng ghi lên dashboard (dùng dashboard mục Agent insights nếu cần — qua skill).
4. Nếu KHÔNG có lệnh pending → bước 1 vẫn đã ghi heartbeat → kết thúc (dashboard biết dispatcher còn sống).

Nguyên tắc:
- KHÔNG tự publish/gửi/ghi tiền — chỉ draft + báo "cần duyệt".
- Mỗi lệnh phải được mark done/error (không để pending mãi).
- result tiếng Việt, ngắn gọn, có link file nếu tạo doc.
- Chỉ dùng GET (curl không POST được tới Apps Script).

Bảo mật (tuỳ chọn): set `REPORT_API_TOKEN` trong CONFIG (Apps Script editor) + thêm vào `.claude/.dispatcher-auth.json` key `report_api_token` → endpoint dispatcher khoá lại, chỉ dispatcher gọi được.
