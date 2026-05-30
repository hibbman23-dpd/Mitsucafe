---
description: Log hao hụt / hủy nguyên liệu cuối ngày — append WASTE_LOG + trừ INVENTORY
---

Invoke skill `cafe-manager` với chế độ **waste-log**.

Workflow:
1. Skill load `references/waste-log.md`
2. Skill hỏi: "Log waste qua mobile form, hay nhập trực tiếp ở đây?"
3. Nếu **mobile form** → output URL `https://script.google.com/.../exec?action=waste_form` (qua `Waste.gs:webAppWasteForm`)
4. Nếu **trực tiếp** → user paste danh sách format:
   ```
   - <tên nguyên liệu>, <qty><unit>, <reason>
   - ...
   ```
5. Skill parse → map ingredient_id từ INVENTORY → estimate cost từ cost_per_unit
6. Append WASTE_LOG + trừ INVENTORY (qua `logWaste()`)
7. Output summary:
   - Mỗi line: ingredient_name, qty, cost_estimate, new_stock
   - Tổng waste hôm nay (VND)
   - % so với revenue (nếu đã có DAILY_METRICS hôm nay)
   - Cảnh báo nếu >3% → "review recipe portion"
   - Critical nếu >5% → Telegram alert

Mặc định:
- Date = today
- Staff_id = 'owner' nếu chưa specify

Reason codes:
- `overproduction` — pha thừa
- `spillage` — đổ/rớt
- `expiry` — hết hạn
- `test` — pha thử
- `other` — khác
- `correction` — hiệu chỉnh kho (qty cộng vào stock)

User input optional: `$ARGUMENTS` có thể là raw list "trân châu 200g overproduction, sữa 500ml expiry"
