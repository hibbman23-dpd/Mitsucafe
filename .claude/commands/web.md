---
description: Suggest sửa landing mitsu.html / index.html dựa metrics traffic + business event
---

Invoke skill `cafe-manager` với chế độ **website-ops**.

Workflow:
1. Skill load `references/website-ops.md` + `references/analytics.md`
2. Skill hỏi user mục đích sửa:
   - Update hero copy / tagline
   - Thêm/sửa menu card
   - Update promo banner copy (KHÔNG sửa HTML — qua PROMOTIONS sheet)
   - Đổi mascot/sticker
   - Update SEO meta (description, schema.org)
   - Fix performance issue
   - Khác (mô tả)
3. Pull analytics nếu liên quan (Cloudflare dashboard hoặc paste data)
4. Output:
   - Cite line cụ thể trong `web/mitsu.html` / `web/index.html`
   - Edit pattern (old → new), KHÔNG rewrite cả section
   - Validation checklist (NAP consistency, palette match, CSP impact)
   - Preview steps (preview_start mitsu-web + preview_inspect)

Mặc định:
- Sửa mitsu.html (landing) — index.html chỉ sửa khi user yêu cầu rõ
- KHÔNG đổi color palette / font / layout structure
- KHÔNG add script external mới không update CSP

Sau output → hỏi: "Apply edit + verify trên preview server không?"

User input optional: `$ARGUMENTS` mô tả nội dung sửa.
