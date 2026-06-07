---
description: Đo lường ROI marketing — post/promo nào ra đơn, campaign nào lãi thật, SCALE/KILL gì
---

Invoke skill `cafe-manager` với chế độ **roi-measurement**.

Workflow:
1. Skill load `references/roi-measurement.md`
2. Xác định phạm vi từ `$ARGUMENTS`:
   - 1 campaign cụ thể (vd `matcha-flash-0620`) → ROI campaign đó
   - `tuần` / ISO week → ROI scorecard tuần
   - `tháng` / `MM/YYYY` → channel scorecard tháng
   - rỗng → hỏi: "ROI cho campaign nào, tuần này, hay tháng này?"
3. Lấy data — gọi 1 endpoint gộp:
   - `GET {WEB_APP_URL}?action=roi_data&from=YYYY-MM-DD&to=YYYY-MM-DD`
     → trả ORDERS + PROMOTIONS + MARKETING_LOG + MENU costs trong 1 JSON
     (mặc định from = 28 ngày trước để đủ baseline)
   - Nếu MARKETING_LOG rỗng → flag "cost=0, ROI lạc quan giả"
   - Web traffic: hỏi user paste Cloudflare nếu cần (xem analytics.md)
4. Tính theo §3: baseline → incremental revenue → trừ discount + COGS → ROI%
5. Output ROI Scorecard (format §5) → kết thúc bằng verdict SCALE/KEEP/FIX/KILL mỗi activity
6. Feed ngược: gợi ý gọi `/promo` (lặp cái SCALE) hoặc ngừng cái KILL

Nguyên tắc:
- KHÔNG bịa số — thiếu data thì nói rõ cần gì rồi dừng
- Luôn so baseline (cùng thứ trong tuần), quy về gross profit không phải revenue
- Organic post luôn ghi rõ "proxy 72h / tương quan, không phải nhân quả"
- Mỗi activity phải có 1 verdict — không để lửng lơ

Mặc định nếu user không nói:
- Phạm vi: tuần ISO hiện tại
- Baseline: 3-4 tuần ngày-tương-đương ngoài promo
- Margin giả định 65% nếu MENU.cost thiếu (+ flag)

Nếu MARKETING_LOG tab chưa tồn tại → ở cuối output, đề xuất tạo (schema trong §6.1) + UTM nâng cấp (§6.2), vì không có cost thì ROI chỉ là revenue trần.

User input optional: `$ARGUMENTS` = campaign_id | `tuần` | `tháng` | ISO week | `MM/YYYY` | free-form.
