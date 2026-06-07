---
description: Nhặt lệnh từ COMMAND_QUEUE (chat dashboard) → thực thi → ghi kết quả lại
---

Cầu nối Dashboard chat → Claude Code. Chạy tay khi muốn xử lý, hoặc đặt scheduled task định kỳ.

Workflow:
1. Lấy admin session token: POST `{WEB_APP_URL}` body `{"action":"admin_login","username":"admin","password":"<ADMIN_PASS>"}`
   → lưu token (hỏi user mật khẩu admin nếu chưa biết; KHÔNG hardcode).
2. GET `{WEB_APP_URL}?action=command_queue&token=<token>&status=pending`
   → danh sách lệnh chờ (mới→cũ).
3. Với MỖI lệnh (xử lý cũ→mới):
   - Parse `text`:
     - Bắt đầu bằng `/` → là slash command → route sang skill `cafe-manager` mode tương ứng (vd `/roi tuần`, `/promo ...`).
     - Văn bản tự do → hiểu ý định → route sang skill phù hợp (vd "tạo promo trà -15%" → campaign-promo).
   - Thực thi qua skill `cafe-manager` (tuân brand voice, nguyên tắc cafe-manager).
   - ⚠️ Lệnh có side-effect publish/gửi (Zalo/post/email) → CHỈ draft, KHÔNG tự gửi. Ghi result = "đã draft, cần duyệt".
   - POST `{WEB_APP_URL}` body `{"action":"command_update","token":"<token>","command_id":"<id>","status":"done","result":"<tóm tắt ≤300 ký tự + doc_link nếu có>"}`
     (lỗi → status `"error"`, result = thông báo lỗi)
4. Nếu lệnh sinh insight đáng lên dashboard → cũng POST `log_agent_insight`.

Nguyên tắc:
- KHÔNG tự publish/gửi/ghi tiền — chỉ draft + báo "cần duyệt".
- Mỗi lệnh phải được mark done/error (không để pending mãi).
- result viết tiếng Việt, ngắn gọn, có link file nếu tạo doc.
- Thứ tự: xử lý lệnh cũ trước.

Đặt tự động (tuỳ chọn): scheduled task mỗi 2-5 phút chạy `/inbox` (máy phải bật Claude Code).
Mặc định chạy tay: gõ `/inbox` khi muốn xử lý hàng đợi.
