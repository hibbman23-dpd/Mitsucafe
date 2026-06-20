# Reference — Trend Scout (/trend)

> **Agent Trend Scout** — quét trend đồ uống + format content viral → lọc cái HỢP với quán → feed `/post` và `/menu-eng`.
> Nhịp: **2 tuần/lần** (trend đồ uống đổi chậm hơn meme nhưng nhanh hơn menu). Output: `docs/trend-scout/YYYY-MM-DD.md`
> Mục tiêu: quán test trend NHANH hơn đối thủ — "ai test nhanh hơn thắng".

## 1. NGUYÊN TẮC LỌC (quan trọng nhất)

Trend bắt được rất nhiều, nhưng **đa số KHÔNG hợp quán**. Mỗi trend phải qua 3 cổng lọc trước khi đề xuất:

1. **Hợp định vị?** — mid-premium "coffee + trà Nhật" Lâm Hà. Loại trend bình dân/giá rẻ thuần, loại trend quá đô thị không hợp khách tỉnh.
2. **Làm được với nguyên liệu/thiết bị hiện có?** — check INVENTORY + máy móc. Trend cần thiết bị mới = chi phí, hạ ưu tiên.
3. **Có khách địa phương không?** — Lâm Hà/Lâm Đồng, không phải Sài Gòn. Trend phải có dấu hiệu lan tới tỉnh, không chỉ hot ở TP lớn.

> Trend qua cả 3 cổng → đề xuất. Qua 2 → "thử nghiệm nhỏ". Qua ≤1 → ghi nhận, không hành động.

## 2. QUÉT GÌ

| Loại trend | Nguồn | Feed sang |
|---|---|---|
| **Món/đồ uống mới** (vị, topping, kiểu pha) | TikTok, IG, đối thủ (scan `/doi-thu`) | `/menu-eng` (SKU candidate) |
| **Format content viral** (kiểu quay, hook, audio) | TikTok, IG Reels | `/post` (học format) |
| **Nguyên liệu/ngách đang lên** | Báo F&B, group cộng đồng | `/menu-eng` + `/mo-rong` |
| **Seasonal/lễ tết sắp tới** | Lịch + demand-forecast | `/promo` + `/post` |

## 3. DEEP vs QUICK

- **Quick** ("trend gì đang hot cho trà sữa", "format reel nào ăn") → trả từ kiến thức + scan gần nhất.
- **Deep** (quét mới full) → **delegate subagent `cafe-insight`** (WebSearch/WebFetch nhiều bước). Task:
```
"Quét trend đồ uống + format content viral 2 tuần qua hợp quán cà phê/trà Nhật mid-premium tỉnh.
 Lọc qua 3 cổng (định vị / làm được / khách địa phương). Output theo format §4.
 Save docs/trend-scout/<YYYY-MM-DD>.md."
```

## 4. FORMAT CHUẨN

```markdown
# Trend Scout — <YYYY-MM-DD>

## TL;DR (3 bullets)
- Trend đáng thử nhất kỳ này: <tên> → action
- Format content nên bắt: <tên>
- Bỏ qua: <trend hot nhưng không hợp + lý do>

## 🥤 Trend đồ uống/món
| Trend | Mô tả | Cổng lọc (3/3?) | Làm được? | → Feed | Ưu tiên |
|---|---|---|---|---|---|
| <tên> | <vị/kiểu> | ✅✅✅ | Có (NL sẵn) | /menu-eng | 🟢 thử ngay |

## 📹 Format content viral
| Format | Hook/kiểu quay | Hợp brand? | → Feed |
|---|---|---|---|
| <tên> | <mô tả> | ✅ | /post |

## ❌ Bỏ qua (ghi nhận, không hành động)
- <trend> — lý do loại (cổng nào fail)

## 🎯 Actions
1. **Thử ngay**: <trend> → gọi `/menu-eng` đánh giá SKU / `/post` làm 1 reel test
2. **Thử nghiệm nhỏ**: <trend> → batch nhỏ cuối tuần, đo bằng `/roi`
3. **Theo dõi**: <trend> — chờ tín hiệu lan tới tỉnh
```

## 5. VÒNG LẶP ĐO (bắt buộc)

Trend scout KHÔNG dừng ở đề xuất. Mỗi trend được "thử" phải đo:
```
Trend → /post (reel test) HOẶC /menu-eng (SKU thử)
      → 1-2 tuần sau /roi chấm điểm: trend này ra đơn/tương tác không?
      → SCALE (làm thật) / KILL (bỏ) → ghi lại để lần quét sau không đề xuất lại cái đã fail
```

## 6. COMPOSE & ANTI-PATTERN

Compose:
- `/doi-thu` — đối thủ đang chạy trend nào (đừng đề xuất cái đối thủ đã bão hòa).
- `/menu-eng` — trend món → SKU candidate; nếu menu đang bloat thì đừng thêm.
- `/post` — trend format → content.
- `/roi` — đo trend đã thử.
- `demand-forecast.md` — trend seasonal.

Anti-pattern:
- ❌ Đề xuất trend chỉ vì "đang hot" mà bỏ 3 cổng lọc → menu bloat, lạc định vị.
- ❌ Chạy theo mọi trend → mất bản sắc. Quán mid-premium không phải quán bắt trend rẻ tiền.
- ❌ Thêm SKU trend mà không có kế hoạch đo/bỏ → tích tụ Dogs.
- ❌ Quét quá dày (hằng ngày) — trend đồ uống đổi chậm, 2 tuần/lần là đủ.
- ❌ Copy y nguyên trend đối thủ địa phương → đua nhau giống hệt. Adapt theo brand.
- ❌ Quên đo lại — đề xuất rồi không biết trend đó có hiệu quả không = vô nghĩa.
