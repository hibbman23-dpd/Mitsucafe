# Reference — Feedback Loop (Survey + Complaint + NPS)

> Closing the loop: feedback từ khách → actionable improvement.

## Channels thu thập feedback

| Channel | Trigger | Frequency |
|---|---|---|
| Zalo OA NPS (sau DELIVERED) | Auto sau order | Per order |
| Google Maps review | Khách tự nguyện | Continuous |
| FB / IG comment + DM | Khách tự nguyện | Continuous |
| In-store comment card | Walk-in | Walk-in |
| Internal survey (link Zalo broadcast) | Quarterly | Q |

## NPS (Net Promoter Score)

Gửi qua Zalo OA sau order DELIVERED:
```
Cảm ơn bạn đã ghé MitsuKàphê 🍵
Rate trải nghiệm 1-10 nhé? Reply số.
```

Score buckets:
- **9-10 Promoter** → mark `nps_score`, candidate Champions
- **7-8 Passive** → no auto-action
- **≤6 Detractor** → flag urgent + auto-draft response apology + escalate Telegram

NPS = % Promoter - % Detractor

Target sau 3 tháng launch: NPS > 30 (industry F&B baseline 20-40)

## Complaint workflow

**Severity buckets**:

| Severity | Examples | SLA respond | Action |
|---|---|---|---|
| **P1 Critical** | Đau bụng / nhiễm khuẩn / khách ngộ độc nghi vấn | <2h, in-person/phone | Quarantine batch, contact insurance |
| **P2 High** | Sai đơn major (giao sai SKU) / staff thái độ tệ / dị vật | <6h | Apology + bù đắp (refund + free) |
| **P3 Medium** | Drink loãng / chờ lâu / sai customization minor | <12h | Apology + voucher next visit |
| **P4 Low** | Suggestion / nice-to-have | <48h | Acknowledge, track, defer |

## Complaint response template (P2-P3)

```
Chào [tên],

Mình rất tiếc về [vấn đề cụ thể]. MitsuKàphê đã ghi nhận và sẽ:
1. [Hành động khắc phục cụ thể, vd "rút kinh nghiệm với staff ca đó"]
2. [Bù đắp, vd "tặng 1 ly miễn phí lần ghé tới"]

Mình gửi voucher qua Zalo này. Mong bạn cho cơ hội khắc phục.

— Team Mitsu
```

P1 critical: escalate user MANUALLY, không auto-draft.

## Feedback tracking — extension REVIEWS_LOG (Phase B)

REVIEWS_LOG đã handle reviews/comments. Cho NPS + complaint:
- `source` = `nps_zalo`, `complaint_in_store`, `complaint_dm`
- `rating` = NPS score (cho NPS) hoặc 1-5 mapping (cho complaint severity)

## Quarterly insight synthesis

`/tuan` weekly brief tóm tắt NPS + critical complaints.

Quarterly review (1 lần/quý qua subagent):
1. Pull REVIEWS_LOG 3 tháng
2. Group theo theme (drink quality, service, space, price, location)
3. Top 5 theme cần fix
4. Top 5 theme khen → double down
5. Output report `docs/feedback-quarterly/QX-YYYY.md`

## Action loop

Feedback → ghi nhận → response → root cause analysis → process change → close loop

Mỗi P1-P2 complaint phải có:
- Root cause (ghi note REVIEWS_LOG)
- Action taken
- Follow-up với khách sau 7-14 ngày: "Có muốn ghé lại không?"

## Compose với skill khác

- `marketing:brand-review` — voice consistency cho response
- `design:user-research` — cho quarterly insight synthesis

## Anti-patterns

- ❌ Defensive response P3 ("Quán mình đông nên bạn chờ là phải")
- ❌ Ignore P4 hoàn toàn → mất engagement chance
- ❌ Track complaint không có root cause
- ❌ Bù đắp giống nhau cho mọi severity (over-spend hoặc under-spend)
- ❌ Skip follow-up với khách complaint
- ❌ Aggregate NPS tuần đầu launch (data noisy)
