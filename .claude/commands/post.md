---
description: Draft 1 social post — hỏi platform + topic + tự áp brand voice + sinh Canva/Higgsfield prompt
---

Invoke skill `cafe-manager` với chế độ **social-content**.

Workflow:
1. Skill load `references/_brand-voice.md` + `references/social-content.md`
2. Skill hỏi (nếu thiếu trong `$ARGUMENTS`):
   - Platform: FB / IG / TikTok / Threads / Zalo / multi
   - Topic: SKU/launch/story/UGC/promo/dịp lễ
   - Mục đích: awareness/launch/sale/engagement/retention
   - Ngày dự kiến post
3. Áp template platform tương ứng (xem `social-content.md` §Template)
4. Output bao gồm:
   - CAPTION đầy đủ
   - HASHTAGS phân loại
   - ALT TEXT (bắt buộc nếu IG)
   - CTA
   - VISUAL BRIEF (prompt 50-100 từ cho Canva/Higgsfield)
   - PUBLISHING NOTE

KHÔNG tự call MCP để generate visual — chỉ draft prompt string.

Mặc định nếu user không nói:
- Platform: IG (hub của brand)
- Topic: 1 bestseller SKU
- Post time: slot gần nhất từ giờ hiện tại

Sau khi draft xong → hỏi: "Có muốn adapt sang platform khác (cross-post matrix) không?"

User input optional: `$ARGUMENTS` có thể là free-form vd "IG launch hojicha 2026-06-20".
