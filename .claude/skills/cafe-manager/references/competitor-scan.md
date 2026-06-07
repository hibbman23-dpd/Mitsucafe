# Reference — Competitor Scan (/doi-thu)

> **Agent Đối thủ** — quét + theo dõi đối thủ cà phê/trà sữa khu vực Lâm Hà · Bảo Lộc · Đà Lạt.
> Nhịp: **hằng tháng** (đầu tháng) + ad-hoc khi có biến động (đối thủ mới mở, đổi giá, war giá).
> Output: `docs/competitor-scans/YYYY-MM.md`

## 1. KHI NÀO QUICK vs DEEP

| Tình huống | Xử lý |
|---|---|
| Hỏi nhanh "đối thủ X bán gì / giá bao nhiêu" | Quick — đọc scan gần nhất `docs/competitor-scans/`, trả ngay |
| "So sánh mình với đối thủ về <món/giá/định vị>" | Quick — dùng scan gần nhất + MENU của mình |
| **Quét mới full 5 đối thủ** (web search + social) | **DEEP — delegate `cafe-research` agent** (multi-step, WebSearch/WebFetch) |
| Theo dõi 1 đối thủ cụ thể qua thời gian | Quick nếu đã có data; DEEP nếu cần search lại |

> Quét mới = công việc nhiều bước (search từng quán, đọc social, ước lượng engagement) → **gọi subagent `cafe-research`**, đừng làm inline. cafe-manager chỉ tóm tắt + ra action.

## 2. DELEGATE SANG cafe-research (deep scan)

Khi user muốn quét mới, dispatch task cho `cafe-research`:
```
Task: "Quét đối thủ cà phê/trà sữa Lâm Hà + Bảo Lộc + Đà Lạt tháng <MM/YYYY>.
       Update từ scan trước docs/competitor-scans/<prev>.md (cái gì đổi?).
       Output theo format §3. Save docs/competitor-scans/<YYYY-MM>.md."
```
cafe-research trả report 1 trang → cafe-manager tóm tắt 3 bullet + top action cho user.

## 3. FORMAT CHUẨN (mỗi đối thủ)

```markdown
# Competitor Scan — Tháng MM/YYYY

## TL;DR (3 bullets)
- <thay đổi lớn nhất tháng này>
- <threat mới / cơ hội mới>
- <1 action gấp>

## Đối thủ #N — <Tên>
- **Vị trí**: <địa chỉ / khoảng cách tới quán mình>
- **Social**: FB/IG/TikTok handle + follower (ước lượng)
- **Menu highlight**: <3-5 món chủ lực> · khoảng giá <Xk–Yk>
- **Định vị**: <bình dân / mid / premium · cà phê / trà sữa / ăn vặt>
- **Điểm mạnh**: ...
- **Điểm yếu / gap mình khai thác được**: ...
- **Δ vs tháng trước**: <giá ↑↓, món mới, campaign>

## Opportunity Matrix
| Cơ hội | Đối thủ yếu chỗ này | Mình khai thác bằng |
|---|---|---|

## Threat Assessment
### Threat cao nhất: <tên> — vì sao
### Threat phụ: <...>

## Recommended Actions — Tháng MM/YYYY
1. <action gắn với /post, /promo, /web, /menu-eng>
2. ...
3. ...
```

## 4. CHIỀU DỮ LIỆU CẦN BẮT

- **Giá** — để định vị mình (tránh price war, xem brand-voice mid-premium "coffee + trà Nhật").
- **Món hot / món mới** — feed cho `menu-engineering` (mình có gap nào không?) và `/post` (counter-content).
- **Campaign/promo đối thủ đang chạy** — feed cho `/promo` (đừng đụng đầu trực tiếp, tìm ngách).
- **Social cadence + format ăn tương tác** — feed cho `/post` (học format, không copy).
- **Review/complaint đối thủ** — gap dịch vụ mình làm tốt hơn → talking point.

## 5. COMPOSE & ANTI-PATTERN

Compose:
- `menu-engineering.md` — gap món → quyết định thêm/bỏ SKU.
- `campaign-promo.md` — tránh đối đầu promo, tìm ngách.
- `social-content.md` — học format viral, làm counter-content.
- `expansion-strategy.md` — đối thủ = 1 trục trong brainstorm mở rộng.

Anti-pattern:
- ❌ Copy y nguyên menu/giá đối thủ → mất định vị riêng.
- ❌ Lao vào price war (đối thủ bình dân rẻ hơn là chuyện đương nhiên) — cạnh tranh bằng chất + trải nghiệm.
- ❌ Quét mới inline trong cafe-manager (chậm, tốn context) → để cafe-research.
- ❌ Scan rồi để đó không ra action — mỗi scan phải kết bằng 3 action gắn skill cụ thể.
- ❌ Quét < hằng tháng cho data thay đổi nhanh, nhưng đừng quét hằng tuần (đối thủ không đổi nhanh thế, lãng phí).
