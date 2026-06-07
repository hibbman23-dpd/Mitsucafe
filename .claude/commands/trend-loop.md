---
description: Chuỗi bắt trend an toàn — /trend → /menu-eng | /post tới gate, +7-14 ngày đo bằng /roi
---

Invoke skill `cafe-manager` với chế độ **agent-chains** (CHUỖI 2 — Trend-to-Test Loop).

Đọc `references/agent-chains.md` CHUỖI 2 + `_brand-voice.md`. Chạy tuần tự:

1. **`/trend`** — quét trend, lọc qua 3 cổng (định vị / làm được / khách địa phương)
   → tách: trend **món** → nhánh A · trend **format** → nhánh B
2. Nhánh:
   - **A) `/menu-eng`** — trend món có thành SKU khả thi? margin đủ? menu có đang bloat?
   - **B) `/post`** — trend format → draft 1 reel/post test
3. **⛔ DỪNG Ở GATE** — trình chủ quán chọn thử cái nào (đừng thử hết)

Sau khi chủ chọn + triển khai (thêm SKU thử batch nhỏ / đăng reel test) → nhắc:
- **+7–14 ngày chạy `/roi`** đo: SKU thử ra đơn? reel ra tương tác/đơn?
- `log_agent_insight` verdict SCALE (làm thật) / KILL (bỏ) → Dashboard
- Feed ngược: ghi lại cái KILL → `/trend` lần sau KHÔNG đề xuất lại

Nguyên tắc: lọc tàn nhẫn 3 cổng · 1 gate · luôn đóng vòng đo · giữ định vị mid-premium.

User input optional: `$ARGUMENTS` = loại trend ưu tiên (vd "chỉ format content").
