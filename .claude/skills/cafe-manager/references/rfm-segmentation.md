# Reference — RFM Segmentation + Winback

> 5-segment model (research-backed). Goal: kéo khách cũ quay lại trước khi đốt tiền acquire khách mới.

## RFM dimensions

| Dimension | Compute |
|---|---|
| **Recency** | days since `last_order` |
| **Frequency** | `total_orders` trong CUSTOMERS |
| **Monetary** | `total_spent` trong CUSTOMERS |

## 5 segments (research standard)

| Segment | Recency | Frequency | Monetary | Action |
|---|---|---|---|---|
| **Champions** | ≤14 ngày | top 25% | top 25% | Thank-you message + exclusive preview món mới |
| **Loyal** | ≤30 ngày | top 50% | top 50% | Engage with loyalty stamp progress nudge |
| **Promising** | ≤30 ngày | bottom 50% | bottom 50% | Onboarding cross-sell, education |
| **Hibernating** | 30-90 ngày | any | any | Winback voucher 15% + reminder gentle |
| **Lost** | >90 ngày | any | any | Final winback 25% → nếu không quay lại → pause email regular |

## Winback trigger logic

Rule of thumb (industry): `last_order > 2.5× avg_purchase_cycle`.

Mitsu early stage (chưa có nhiều data):
- Default trigger: **last_order >30 ngày**
- Recompute mỗi tuần (cron Monday 08:00)
- Skip auto-winback nếu `CUSTOMERS.length < 50` (data quá ít để segment)

## CUSTOMERS schema extension (Phase D)

Thêm columns (qua `extendCustomersSchema()`):
- `rfm_recency` (int, days)
- `rfm_frequency` (int)
- `rfm_monetary` (int VND)
- `rfm_score` (string, vd "555" = top tier all 3, "111" = bottom)
- `rfm_segment` (Champions/Loyal/Promising/Hibernating/Lost)
- `last_winback_at` (ISO)
- `winback_count` (int — ngừng winback nếu >3 lần không response)
- `nps_score` (int 0-10, optional)
- `birthday` (MM-DD, optional)

## Workflow `/khach`

User nói `/khach`:
1. Skill load reference này
2. Pull CUSTOMERS sheet → compute RFM nếu chưa fresh (chạy `computeRfmScores`)
3. Output dashboard:

```
👥 RFM Snapshot — DD/MM/YYYY

| Segment      | Count | % | Δ vs T-7 |
|--------------|-------|---|----------|
| Champions    | 12    | 8 | +2       |
| Loyal        | 28    | 19| +1       |
| Promising    | 45    | 30| -3       |
| Hibernating  | 38    | 25| +5  ⚠️   |
| Lost         | 27    | 18| +0       |

⚠️ Hibernating tăng 5 — suggest winback batch 38 khách.

Top 5 Champions cần thank-you:
1. Anh Khôi (0903xxx) — 24 đơn, 1.2M VND
2. ...

Hibernating winback candidates (top 10 by historic monetary):
1. Chị Linh (0905xxx) — last order 35d, đã chi 800k
2. ...

→ Draft Zalo winback cho 10 khách trên không?
```

4. Nếu user đồng ý → call `getWinbackCandidates()` → loop draft Zalo qua brand voice → save vào `docs/winback-drafts/YYYY-MM-DD.md`
5. Output: file path + remind user paste vào Zalo OA Manager schedule send.

## Draft template winback

```
[Tên khách], cảm ơn bạn đã từng ghé Mitsu 🐝

Lâu rồi không thấy bạn về — Mitsu để dành sẵn 1 voucher 15% cho lần ghé tới của bạn.

Có hiệu lực 7 ngày: mitsucafe.vn/menu

一杯ごとに、ひとさじの蜜と愛を。
```

Variations theo segment:
- Hibernating: tone gentle, voucher 15%
- Lost: tone reconcile, voucher 25% + final reminder

## Champions thank-you template

```
Anh/chị [tên], Mitsu thấy bạn ghé Lâm Hà ~3 lần tuần vừa rồi 🍵

Cảm ơn bạn đã đồng hành. Lần sau ghé thử [SKU vừa launch] — quán để 1 ly riêng cho bạn.

— Team Mitsu
```

## Automation flow (Phase D scheduled task)

`cronWeeklyRfmRefresh` Monday 08:00 (Claude scheduled task):
1. Dispatch subagent `cafe-research` 
2. Subagent gọi RFM.gs:computeRfmScores() qua GAS endpoint
3. Output markdown report
4. Draft 10 Zalo winback (Hibernating top monetary) + 5 thank-you (Champions)
5. Save `docs/winback-drafts/YYYY-MM-DD.md` + `docs/champions-thanks/YYYY-MM-DD.md`
6. Telegram chủ quán: "10 winback + 5 thank-you ready để duyệt"

## Frequency limits (compliance + brand)

- Tối đa 1 winback message / khách / 30 ngày
- Tối đa 2 thank-you / khách / 60 ngày
- `winback_count` >3 không response → ngừng đẩy regular, archive

## Defer cho skill khác

- `small-business:customer-pulse` — context broad
- `marketing:email-sequence` — multi-step sequence design

## Anti-patterns

- ❌ Winback voucher >30% → signal "đại hạ giá"
- ❌ Mass broadcast cho cả 5 segment (không personalize)
- ❌ Winback Lost segment liên tục (đã rời, tôn trọng)
- ❌ Skip thank-you cho Champions (mất goodwill)
- ❌ Recompute RFM hàng giờ (waste compute, data không thay đổi nhanh)
- ❌ Voucher không expire (mất control budget)
