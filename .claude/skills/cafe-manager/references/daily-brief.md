# Reference — Daily brief sáng (/sang)

> Mục tiêu: 90s đọc → user biết hôm nay focus gì.

## Output format chuẩn

```markdown
# ☀️ Brief sáng <thứ X, DD/MM/YYYY>

## 📊 Hôm qua đã qua
- Doanh thu: <X.XXX.000đ>  (<+/-X%> vs T-7)
- Đơn: <X>  (<+/-X%> vs T-7)
- AOV: <XX.000đ>
- Top 3 SKU: 1. <name> · 2. <name> · 3. <name>
- Waste log: <X% revenue>  | OPEX hôm qua: <X.XXX.000đ>
- Cash variance ca tối: <ok / warn / alert>

## ⚠️ Cần để mắt
- <vd: Trân châu đường đen sắp hết stock (<2 batches)>
- <vd: Máy pha cà phê — backflush hôm qua chưa done>
- <vd: 1 review Google Maps 3⭐ pending response>

## 🎯 Top 3 priority hôm nay
1. <action cụ thể, có thể done trong 1h>
2. <action>
3. <action>

## 📱 Content gợi ý (nếu chưa đăng)
- <platform> · <topic> · best slot <HH:MM>
  Draft sẵn ở `docs/content-drafts/YYYY-MM-DD.md` (nếu cron đã chạy)

## 🧾 Checklist mở quán (6:00)
[Link `opening-closing-checklist.md` — chỉ remind nếu hôm qua có ⚠️]
```

## Dữ liệu cần pull (theo thứ tự ưu tiên)

| # | Source | Function/Sheet | Fallback nếu chưa có |
|---|---|---|---|
| 1 | DAILY_METRICS (hôm qua) | `gas/Financials.gs:computeDailyMetrics()` | Hỏi user paste hoặc skip |
| 2 | ORDERS (hôm qua, top SKU) | filter ORDERS sheet, group by items | Skip |
| 3 | EXPENSES (hôm qua) | filter EXPENSES sheet | Skip |
| 4 | WASTE_LOG (hôm qua) | filter WASTE_LOG (Phase C) | "Chưa có dữ liệu — log /huy cuối ngày" |
| 5 | CASH_LOG (ca tối hôm qua) | last row CASH_LOG (Phase C) | "Chưa có" |
| 6 | INVENTORY low stock | filter INVENTORY where current_stock < min_stock | Skip |
| 7 | MAINTENANCE_LOG overdue | filter MAINTENANCE_LOG status=overdue (Phase C) | Skip |
| 8 | REVIEWS_LOG pending (Phase B) | filter REVIEWS_LOG response_status=pending | Skip |

## Cách tính so sánh week-over-week

```
delta_pct = (today - same_day_last_week) / same_day_last_week × 100
```

Nếu T-7 = 0 hoặc data thiếu → ghi `vs T-7: n/a` (KHÔNG bịa).

## Top 3 priority — logic chọn

Rank theo công thức ưu tiên:

1. **Critical** (any): cash variance > 50k, stock = 0 SKU bán chạy, maintenance overdue >7 ngày, review <3⭐ chưa response >24h
2. **Trend signal**: revenue ↓ >15% vs T-7 → suggest promo / push content; revenue ↑ >25% → suggest scale ingredient prep
3. **Quotidian**: chưa post FB/IG hôm nay, chưa nhập waste hôm qua, FIFO cảnh báo

Chọn top 3 với ít nhất 1 critical nếu có.

## Khi user paste data

Nếu user paste rows từ Sheets:
1. Parse format: detect tab name từ header
2. Compute metrics in-memory
3. Output brief
4. KHÔNG lưu data ra file (privacy)

## Tone cho brief

- Tiếng Việt, ngắn gọn
- Không "Quý khách" / không câu khen sáo
- Có thể dùng 1-2 emoji status (☀️ ⚠️ 🎯) — không lạm dụng
- KHÔNG ép user làm cả 3 priority → cho phép user pick

## Trigger từ slash command

`/sang` → load `daily-brief.md` + `opening-closing-checklist.md` → run flow:
1. Hỏi user: "Cho tôi pull data hôm qua, hay bạn paste sẵn?"
2. (Nếu auto-pull qua doGet endpoint GAS, hỏi key một lần lưu trong Script Properties)
3. Output brief
4. Optional: push tới Telegram chủ quán (nếu user xác nhận)

## Compose with existing skills

- Daily brief có thể defer phần "cash flow" tới skill `small-business:cash-flow-snapshot` nếu user muốn chi tiết hơn.
- Defer phần "customer pulse" tới `small-business:customer-pulse` nếu cần segment quick.
