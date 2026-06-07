---
description: Competitor scan — quét/so sánh đối thủ cà phê-trà sữa Lâm Hà + action né price war
---

Invoke skill `cafe-manager` với chế độ **competitor-scan**.

Workflow:
1. Skill load `references/competitor-scan.md`
2. Phân loại yêu cầu từ `$ARGUMENTS`:
   - **QUICK** ("đối thủ X bán gì", "so mình với <ai>", "giá <ai>") →
     đọc scan gần nhất `docs/competitor-scans/` + MENU mình → trả ngay
   - **DEEP** ("quét mới", "scan tháng này", "update đối thủ") →
     **delegate subagent `cafe-research`** (multi-step WebSearch/WebFetch),
     task theo §2 reference → save `docs/competitor-scans/YYYY-MM.md`
   - rỗng → hỏi: "Quét mới full hay tra nhanh 1 đối thủ?"
3. Output theo format §3 reference
4. Kết bằng **3 Recommended Actions**, mỗi action gắn skill cụ thể (/post, /promo, /web, /menu-eng)

Nguyên tắc:
- Quét mới = việc nhiều bước → KHÔNG làm inline, dùng `cafe-research`
- KHÔNG lao vào price war — định vị mid-premium "coffee + trà Nhật" (xem _brand-voice.md)
- KHÔNG copy menu/giá đối thủ — cạnh tranh bằng chất + trải nghiệm
- Mỗi scan PHẢI ra action, không để báo cáo suông
- Feed gap món → `/menu-eng`, format viral → `/post`, ngách promo → `/promo`

Nhịp khuyến nghị: hằng tháng (đầu tháng) + ad-hoc khi đối thủ mới mở / đổi giá.

User input optional: `$ARGUMENTS` = tên đối thủ | `quét mới` | `MM/YYYY` | free-form.
