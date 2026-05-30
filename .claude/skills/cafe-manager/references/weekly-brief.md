# Reference — Weekly brief Friday (/tuan)

> Mục tiêu: 5-8 phút đọc → hiểu tuần qua + có plan tuần sau.

## Output format chuẩn

```markdown
# 📅 Weekly Brief — Tuần <ISO week> · <DD/MM – DD/MM/YYYY>

## 💰 Tài chính tuần
| KPI | Tuần này | Tuần trước | Δ |
|---|---|---|---|
| Doanh thu | X.XXX.XXXđ | X.XXX.XXXđ | ±X% |
| Số đơn | XXX | XXX | ±X% |
| AOV | XX.XXXđ | XX.XXXđ | ±X% |
| Gross profit | X.XXX.XXXđ | X.XXX.XXXđ | ±X% |
| OPEX | X.XXX.XXXđ | X.XXX.XXXđ | ±X% |
| Net profit | X.XXX.XXXđ | X.XXX.XXXđ | ±X% |
| Margin % | X% | X% | ±X pp |

## 🏆 Top 5 SKU & Bottom 3 SKU
**Top**: 1. <name> (X đơn, X.XXXđ) · 2. ... · 3. ...
**Bottom**: 1. ... 2. ... 3. ...

## ⚠️ Operations highlight
- Waste tổng: X.XXX gram = ~X% revenue (target <3%)
- Cash variance: X ca ok / X ca warn / X ca alert
- Maintenance: X task done / X overdue
- Stock low: <list SKU/ingredient>

## 👥 Khách hàng
- Khách mới: X
- Khách quay lại: X (X% repeat rate)
- RFM movement: Champions ±X, Hibernating ±X (winback gửi: X)
- NPS: X.X (X reviews)

## 📱 Content & engagement (nếu có Cloudflare/social data)
| Platform | Posts | Reach | Best post | Worst post |
|---|---|---|---|---|
| FB | X | X | <link> | <link> |
| IG | X | X | <link> | <link> |
| TikTok | X | X | <link> | <link> |
| Web traffic | X pageview | top source: ... | top page: ... |

## 🎯 Plan tuần sau (NEXT)
### Content calendar (7 ngày)
- T2 <topic platform best-time>
- T3 ...
- ...

### Operations focus
- <vd: deep clean máy đá cuối tuần>
- <vd: re-order trân châu trước T3>

### Marketing
- <vd: chạy flash promo T6-T7 14-17h matcha -15%>
- <vd: response 12 review Maps pending>

### Strategy thought
- <1 câu observation cho strategic agenda>
```

## Dữ liệu cần pull

Như `daily-brief.md` nhưng aggregate 7 ngày, cộng thêm:
- REVIEWS_LOG tuần này (Phase B)
- CONTENT_CALENDAR đã post (Phase D)
- CUSTOMERS RFM snapshot (Phase D)
- Cloudflare Analytics (Phase B) — top page, top source

## So sánh week-over-week

So với tuần ISO ngay trước (T-1 tuần), không phải same calendar week last month.

## Plan tuần sau — logic gợi ý

1. Pull `content-calendar.md` xem template ý tưởng theo mùa
2. Check `automation-registry.md` xem tuần sau có cron quan trọng nào không
3. Check upcoming holiday/event Lâm Đồng (chợ phiên, lễ địa phương, festival)
4. Suggest 1 promo nếu doanh thu tuần này ↓ >10% vs T-1

## Trigger

- Slash: `/tuan` (manual)
- Auto: `cronWeeklyOpsDigest` Friday 06:30 → push Telegram tóm tắt 1-2 đoạn → user mở Claude `/tuan` để thấy full version

## Compose với skill khác

- `small-business:friday-brief` — defer cho format chung nếu user muốn standard small-biz Friday format
- `marketing:performance-report` — defer cho phần social/web traffic deep dive
- `data:build-dashboard` — nếu user muốn export HTML dashboard tuần
