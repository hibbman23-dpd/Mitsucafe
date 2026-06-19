# Reference — Reviews & Reputation Management

> Track Google Maps + Facebook reviews → draft response → user duyệt + paste lên platform.

## Source review

| Source | URL | Frequency check | API/Manual |
|---|---|---|---|
| Google Maps (GBP) | https://maps.app.goo.gl/zRE1hNLej9oWhtEP6 | mỗi 6h | Manual paste hoặc GBP API |
| Facebook page | https://www.facebook.com/profile.php?id=61590071517195 | mỗi 6h | Manual paste hoặc Graph API |
| Foody / Lozi (nếu claim) | TBD | weekly | Manual |
| TripAdvisor (nếu có) | TBD | weekly | Manual |
| Instagram comment/DM | direct | daily | Manual |
| Internal NPS (sau order, qua Zalo) | n/a | daily | GAS |

Phase B implements: ghi vào REVIEWS_LOG sheet + draft response. Phase D scheduled task `Reviews monitor` mỗi 6h.

## REVIEWS_LOG schema

```
review_id | source | date | rating (1-5) | customer_name | comment |
sentiment (positive/neutral/negative) | response_status (pending/drafted/sent/skipped) |
response_text | responded_at | responder | platform_url
```

## Response template by rating

### 5⭐ — Champion review

Tone: warm, thank-you, mention 1 chi tiết review nhắc → mời quay lại.

Template:
```
Cảm ơn [tên] đã ghé Mitsu! Vui khi bạn thích [chi tiết review — hojicha / mascot / không gian]. 
Lần sau ghé thử [SKU phù hợp] nhé — かえる đợi 🍵

— Team Mitsu
```

### 4⭐ — Promoter chưa thật đỉnh

Tone: cảm ơn + acknowledge feedback nếu có constructive point + improvement note.

Template:
```
Cảm ơn [tên] đã chia sẻ. Bạn nhắc [point] — team đã note để cải thiện. 
Lần sau cho khẩu vị [đậm/nhẹ/ngọt] cụ thể, mình điều chỉnh cho bạn nhé!

— Team Mitsu
```

### 3⭐ — Neutral, cần khắc phục

Tone: chuyên nghiệp, không defensive, hỏi chi tiết để cải thiện, đề nghị bù đắp riêng tư.

Template:
```
Chào [tên], cảm ơn bạn đã ghé. Mình xin lỗi nếu [vấn đề trong review] làm bạn chưa hài lòng. 
Bạn nhắn riêng Mitsu qua [Zalo / IG DM] giúp tả rõ hơn để team xử lý + bù đắp lần sau nhé.

— Team Mitsu
```

### 2⭐ — Critical, cần handle cẩn thận

Tone: empathetic, ownership, không tranh cãi public, di chuyển sang private channel.

Template:
```
Chào [tên], mình rất tiếc trải nghiệm hôm đó chưa tốt với bạn. [Acknowledge cụ thể vấn đề]. 
Đây là email/Zalo trực tiếp chủ quán: [contact]. Mong bạn cho team cơ hội bù đắp.

— Chủ quán Mitsu
```

### 1⭐ — Urgent, escalate

**KHÔNG auto-draft. Always escalate to user manually.**

Skill chỉ output: "🚨 1⭐ review từ [tên]. Cần user xử lý cá nhân, không auto-draft." + paste original comment.

## Sentiment detection rules (Vietnamese)

Quick keyword check (không cần ML):

| Sentiment | Keywords/phrases (VN) |
|---|---|
| Positive | "ngon", "tuyệt", "đẹp", "thích", "khen", "yêu", "best", "recommend", "5 sao" |
| Neutral | "ok", "tạm", "bình thường", "được", "trung bình" |
| Negative | "tệ", "dở", "không ngon", "thất vọng", "đắt", "chậm", "thái độ", "bẩn", "không quay lại" |

Mixed → ưu tiên negative (cần xử lý).

## Response timing target

| Rating | Response within |
|---|---|
| 5⭐ | 48h (low priority) |
| 4⭐ | 24h |
| 3⭐ | 12h |
| 2⭐ | 6h |
| 1⭐ | 2h (immediate escalation) |

## Khi user nói "trả lời 10 review"

Skill output:
1. Group review theo rating
2. Pre-draft response từng review theo template
3. Highlight các response cần user customize (3⭐ trở xuống)
4. Output trong format markdown table — user check + paste lên platform

## Subagent dispatch

Cho task >5 review hoặc cần deep-scan history → dispatch `cafe-research`:

```
Task: "Quét Google Maps + FB của Mitsu 6 tháng qua, group review by month, 
       tóm tắt sentiment trend, draft response cho 20 review pending."
```

Subagent output: markdown report + REVIEWS_LOG append rows.

## Internal NPS (qua Zalo OA)

Sau order DELIVERED status (gas/Orders.gs), gửi Zalo:
```
Cảm ơn bạn đã ghé. Rate trải nghiệm 1-10 nhé? Reply số.
```

Score:
- 9-10 → Promoter (Champion candidate)
- 7-8 → Passive
- ≤6 → Detractor (cần follow up)

Tổng hợp weekly trong `/tuan` brief.

## Anti-patterns

- ❌ Defensive response ("Quán mình đông nên bạn chờ là phải")
- ❌ Copy-paste cùng response cho mọi review
- ❌ Public dispute với khách
- ❌ Xoá review xấu (Google tracking → penalty)
- ❌ Fake positive review để dilute negative (TOS violation)
- ❌ Bỏ qua 1⭐ >24h
- ❌ Trả lời chậm 5⭐ (mất cơ hội build relationship)
