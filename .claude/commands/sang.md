---
description: Daily brief sáng — KPI hôm qua + top 3 priority hôm nay + checklist mở quán remind
---

Invoke skill `cafe-manager` với chế độ **daily-brief**.

Workflow:
1. Skill load `references/daily-brief.md` + `references/opening-closing-checklist.md`
2. Skill hỏi user: "Tôi pull data hôm qua qua GAS, hay bạn paste sẵn metrics?"
3. Output theo format chuẩn trong `daily-brief.md`
4. Cuối brief: hỏi "Push tóm tắt qua Telegram chủ quán không?" (chỉ output text, không tự gọi sendTelegramAlert)

Mặc định:
- Nếu hôm nay là T2/Mon → thêm reminder weekly deep clean
- Nếu có review pending >24h → highlight critical
- Nếu maintenance overdue >3 ngày → critical
- Nếu hôm qua cash variance > 50.000đ → flag critical kèm link camera review (text-only)

User input optional: `$ARGUMENTS` có thể là date YYYY-MM-DD để xem brief ngày khác.
