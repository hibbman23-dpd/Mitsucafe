---
description: Menu Engineering — phân loại SKU Stars/Plowhorses/Puzzles/Dogs + action keep/promote/remove
---

Invoke skill `cafe-manager` với chế độ **menu-engineering**.

Workflow:
1. Skill load `references/menu-engineering.md`
2. Xác định tháng từ `$ARGUMENTS` (format `YYYY-MM`); rỗng → mặc định tháng trước
3. Lấy data: `GET {WEB_APP_URL}?action=menu_engineering_data&month=YYYY-MM`
   → trả per-SKU: qty_sold, revenue, unit_cost, margin_amount, margin_pct
4. Tính median qty + median margin_pct → chia 2×2 matrix:
   - ⭐ Stars: qty ≥ median & margin ≥ median
   - 🐎 Plowhorses: qty ≥ median & margin < median
   - 🧩 Puzzles: qty < median & margin ≥ median
   - 🐕 Dogs: qty < median & margin < median
5. + Pareto 80/20 (top 20% SKU đóng góp bao nhiêu % revenue?)
6. Output theo format trong reference → Save `docs/menu-engineering/YYYY-MM.md`
7. Kết bằng **Top 3 action tháng tới** (mỗi action gắn skill: /promo, /web, /post hoặc reprice)

Nguyên tắc:
- KHÔNG đánh giá tháng có < 30 ngày data / SKU < 20 đơn → flag "data noisy, cần thêm"
- Tách riêng SKU theo mùa (đừng so trà đá mùa hè với mùa đông)
- Mỗi quadrant phải có action cụ thể — Dogs: remove HOẶC giữ nếu là "story SKU"
- KHÔNG remove dog mà không có SKU thay / chiến lược

Mặc định: tháng trước · save file · Telegram chủ quán top 3 action (nếu user muốn).

Compose: `small-business:margin-analyzer` cho deep pricing; feed gap sang `/doi-thu`.

User input optional: `$ARGUMENTS` = `YYYY-MM` hoặc rỗng.
