---
description: RFM customer segmentation snapshot + winback drafts + Champions thank-you
---

Invoke skill `cafe-manager` với chế độ **rfm-segmentation**.

Workflow:
1. Skill load `references/rfm-segmentation.md`
2. Call `RFM.gs:rfmSnapshot()` qua GAS doGet (cần expose action=rfm_snapshot trong Code.gs) OR ask user paste snapshot
3. Output dashboard 5 segments + delta vs T-7
4. Highlight Hibernating top 10 candidates (sort by historic monetary)
5. Highlight Champions top 5 (sort by total_orders)
6. Hỏi user: "Draft Zalo cho ai?"
   - "winback" → draft 10 Hibernating message
   - "thanks" → draft 5 Champions message
   - "all" → cả 2
7. Save `docs/winback-drafts/YYYY-MM-DD.md` + `docs/champions-thanks/YYYY-MM-DD.md`
8. KHÔNG tự gửi Zalo OA — user duyệt + paste

Validation:
- Skip auto-action nếu CUSTOMERS < 50 (data quá ít)
- Per khách: skip winback nếu last_winback_at <30 ngày
- Per khách: skip nếu winback_count >= 3 (đã thử 3 lần)
- Cap message length: 60 từ (Zalo OA best practice)

Modes (qua `$ARGUMENTS`):
- `snapshot` (default) → dashboard view
- `birthday` → check birthday hôm nay (Phase D `references/birthday-occasion.md`)
- `anniversary` → first_order = today-365d
- `feedback Q` → quarterly NPS + complaint synthesis (subagent dispatch)
- `<customer_id>` → single customer deep view

User input optional: `$ARGUMENTS` free-form vd "winback 20" để giới hạn 20 khách.
