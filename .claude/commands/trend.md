---
description: Trend scout — quét trend đồ uống + format viral, lọc hợp quán, feed /post + /menu-eng
---

Invoke skill `cafe-manager` với chế độ **trend-scout**.

Workflow:
1. Skill load `references/trend-scout.md` + `_brand-voice.md`
2. Phân loại từ `$ARGUMENTS`:
   - **QUICK** ("trend gì hot cho trà sữa", "format reel nào ăn") → trả từ kiến thức + scan gần nhất
   - **DEEP** ("quét mới", "trend 2 tuần này") → **delegate subagent `cafe-research`** (WebSearch nhiều bước)
   - rỗng → mặc định DEEP quét mới
3. Mỗi trend bắt được PHẢI qua 3 cổng lọc trước khi đề xuất:
   - Hợp định vị mid-premium "coffee + trà Nhật"?
   - Làm được với INVENTORY + thiết bị hiện có?
   - Có khách địa phương Lâm Hà/Lâm Đồng (không chỉ hot ở TP lớn)?
4. Output theo format §4 reference → Save `docs/trend-scout/YYYY-MM-DD.md`
5. Kết bằng 3 actions: Thử ngay / Thử nghiệm nhỏ / Theo dõi — mỗi cái gắn skill (/post, /menu-eng, /promo)

Nguyên tắc:
- Đa số trend KHÔNG hợp quán — lọc tàn nhẫn qua 3 cổng, đừng chạy theo mọi trend
- Quán mid-premium ≠ quán bắt trend rẻ tiền → giữ bản sắc
- Mọi trend "thử" PHẢI đo lại bằng `/roi` 1-2 tuần sau → SCALE/KILL, ghi lại để không đề xuất lại cái đã fail
- KHÔNG thêm SKU trend mà không có kế hoạch đo/bỏ (tránh tích Dogs)
- Deep scan = việc nhiều bước → dùng `cafe-research`, không làm inline

Nhịp khuyến nghị: 2 tuần/lần (trend đồ uống đổi chậm, đừng quét hằng ngày).

Compose: `/doi-thu` (đối thủ chạy trend nào), `/menu-eng` (SKU candidate), `/post` (format), `/roi` (đo), `demand-forecast.md` (seasonal).

User input optional: `$ARGUMENTS` = `quét mới` | loại trend cụ thể | free-form.
