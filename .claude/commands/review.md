---
description: Review monitor — pull review pending, draft phản hồi theo brand voice, cảnh báo review xấu
---

Invoke skill `cafe-manager` với chế độ **reviews-reputation**.

Workflow:
1. Skill load `references/reviews-reputation.md` + `_brand-voice.md`
2. Lấy review pending: `GET {WEB_APP_URL}?action=pending_reviews`
   → trả các review đã log vào REVIEWS_LOG nhưng chưa phản hồi
3. Nếu `$ARGUMENTS` chứa review user paste tay (từ Maps/FB) → xử lý trực tiếp
   (Lưu ý: Google Maps JS-rendered, KHÔNG scrape được qua WebFetch → dựa GAS DB + paste tay)
4. Với mỗi review:
   - Phân loại sentiment (positive / neutral / critical)
   - Draft phản hồi theo brand voice — KHÔNG copy-paste generic, cá nhân hóa theo nội dung
   - Review xấu (≤2 sao / critical) → ưu tiên + gợi ý action khắc phục offline
5. Output:
   - TL;DR sentiment breakdown (X positive / Y neutral / Z critical)
   - Bảng review + draft phản hồi (paste-ready) cho từng cái
   - 🚨 Alert nếu có critical → Telegram chủ quán
6. Save snapshot `docs/review-monitor/YYYY-MM-DD-HHMM.md` (front-matter: checked_at, counts)
7. Reminder: sau khi paste response lên platform → chạy `markReviewResponded(id, responder)` trong GAS editor

Nguyên tắc:
- KHÔNG tự publish — chỉ draft, user copy-paste lên Maps/FB
- Phản hồi review xấu: nhận lỗi chân thành + giải pháp cụ thể, KHÔNG defensive
- Phản hồi review tốt: cảm ơn cá nhân hóa, mời quay lại, nhắc nhẹ stamp/món mới
- Mọi draft tuân brand voice (xem `_brand-voice.md`)

Nhịp khuyến nghị: mỗi 6h (đã có scheduled task `kaeru-reviews-monitor`). Lệnh này = chạy tay khi cần.

Compose: `small-business:handle-complaint` cho khiếu nại nặng; feed theme lặp lại sang `feedback-loop.md`.

User input optional: `$ARGUMENTS` = review text paste tay | rỗng (pull GAS DB).
