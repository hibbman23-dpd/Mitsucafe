---
description: Weekly Friday brief — tổng kết tuần + plan tuần sau
---

Invoke skill `cafe-manager` với chế độ **weekly-brief**.

Workflow:
1. Skill load `references/weekly-brief.md`
2. Skill hỏi: "Pull tuần này (ISO week hiện tại) hay tuần khác?"
3. Aggregate 7 ngày DAILY_METRICS + EXPENSES + WASTE_LOG + CASH_LOG + REVIEWS_LOG
4. So sánh week-over-week với tuần ISO ngay trước
5. Suggest content calendar 7 ngày tới (gọi `content-calendar.md` nếu cần)
6. Suggest 1 promo nếu doanh thu ↓ >10% vs T-1

Mặc định:
- Run Friday → tự động phân tích tuần này (T2-T6)
- Run thứ khác → hỏi user week ISO
- Output Markdown table — không HTML
- Nếu data tuần này thiếu nhiều → fallback hỏi user paste

User input optional: `$ARGUMENTS` có thể là ISO week (vd `2026-W22`) hoặc date range `DD/MM-DD/MM`.
