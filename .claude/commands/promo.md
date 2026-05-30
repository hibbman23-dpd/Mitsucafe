---
description: Design 1 marketing campaign / flash sale / happy hour — output PROMOTIONS row + banner copy + Zalo draft + cross-channel content
---

Invoke skill `cafe-manager` với chế độ **campaign-promo**.

Workflow:
1. Skill load `references/campaign-promo.md` + `references/_brand-voice.md`
2. Skill hỏi user (nếu thiếu trong `$ARGUMENTS`):
   - Mục đích: launch / flash / happy_hour / event / winback
   - Discount value + type (pct/fixed VND)
   - Thời gian: one-time / weekly / daily, ngày + giờ
   - Target SKU (cụ thể hay `*` = all beverage)
   - Audience: in-store / online / Zalo OA broadcast
3. Output theo format chuẩn trong `campaign-promo.md`:
   - PROMOTIONS sheet row (paste-ready)
   - Promo banner message (≤80 ký tự)
   - Zalo OA broadcast draft
   - Cross-channel content brief (IG/FB/TikTok/GBP)
   - Telegram alert nội bộ
   - ROI tracking plan

Validation trước khi finalize:
- Discount > 30% → cảnh báo (loss margin signal)
- Promo overlap với loyalty stamp redemption → flag conflict
- Holiday peak day → flag (don't discount when busy)
- Đã có promo active cùng SKU → flag conflict

Mặc định nếu user không nói:
- type: happy_hour
- duration: 1 tuần weekly T6-T7 14:00-17:00
- discount: 15% pct
- target: all beverage

Sau output → hỏi: "Paste config vào PROMOTIONS sheet → `checkAndRunCampaigns` 15' sau sẽ tự bật. Có muốn tôi draft post launch luôn không?"

User input optional: `$ARGUMENTS` có thể là free-form vd "flash sale matcha -20% T6 evening".
