# Reference — Content Calendar (Weekly + Monthly planning)

> Plan content trước → giảm stress decision daily + đảm bảo brand consistency.

## Cadence khuyến nghị (tổng)

Per week:
- 3-5 FB post
- 4-5 IG feed + 7-14 Story + 1-2 Reels
- 2-3 TikTok
- 5-7 Threads
- ≤2 Zalo OA broadcast
- 1-2 GBP post (Update/Offer)

## Weekly content matrix template

```
| Day | Time | Platform | Type      | Topic                         | Status   |
|-----|------|----------|-----------|-------------------------------|----------|
| T2  | 8:00 | IG feed  | Product   | Bạc xỉu morning routine       | drafted  |
| T2  | 12:00| Threads  | Observation| "Mưa Lâm Hà sáng nay…"       | drafted  |
| T2  | 20:30| IG Story | UGC       | Repost khách check-in T7      | scheduled|
| T3  | 11:30| FB       | Story     | Vùng trà Bảo Lộc — story arc 2| drafted  |
| T3  | 19:00| TikTok   | ASMR      | Pha hojicha latte cận         | drafted  |
| T4  | 8:00 | IG feed  | Behind    | Pha mẻ trân châu sáng         | drafted  |
| ...
```

## Weekly content theme rotation (suggested)

Tuần 1:
- Mon: Product spotlight (bestseller)
- Tue: Behind-the-scenes (pha drink)
- Wed: Customer story (UGC)
- Thu: Education (về matcha, hojicha, cà phê)
- Fri: Weekend invite (mời ghé)

Tuần 2: rotate themes slightly để không duplicated.

## Monthly thematic anchor (1 chủ đề lớn/tháng)

VD:
- T6 2026: "Soft launch month" — focus mascot intro + story `Mitsu`
- T7 2026: "Hè cao điểm — hojicha cold launch"
- T8 2026: "Mưa Tây Nguyên — hot drink comfort"
- T9 2026: "Trung Thu — matcha mooncake"
- T12 2026: "Giáng sinh ở Lâm Hà"

Mỗi anchor → 30% content tuần xoay quanh theme.

## CONTENT_CALENDAR sheet (optional)

Schema:
```
post_id | scheduled_date | scheduled_time | platform | type |
topic | hook | caption | hashtags | cta |
visual_brief | status (idea/drafted/approved/scheduled/published) |
performance_url (after publish)
```

Phase D init via `initContentCalendarSheet()`.

## Workflow — auto draft daily

`cronMorningContentDraft` 07:00 daily (Claude scheduled task):
1. Skill `cafe-manager` mode social-content
2. Pick topic from monthly theme anchor + day-of-week rotation
3. Pick platform (IG default, alternate FB/TikTok/Threads)
4. Generate draft theo brand voice
5. Save `docs/content-drafts/YYYY-MM-DD.md`
6. Telegram chủ quán: "Draft sẵn cho hôm nay, mở Claude `/post` để duyệt"

Solo operator approve → publish → mark CONTENT_CALENDAR.status=published.

## Workflow — Friday weekly plan

`cronFridayContentPlan` 09:00 Friday (Claude scheduled task):
1. Skill brainstorm 7 ideas tuần sau dựa:
   - Monthly anchor
   - Day-of-week rotation
   - Upcoming events/holidays (lookup `demand-forecast.md` calendar)
   - SKU launch nếu có
2. Output `docs/content-plans/YYYY-WW.md`
3. Telegram chủ quán summary

## Quarterly content review

Mỗi quý 1 lần:
- Pull CONTENT_CALENDAR Q vừa qua
- Sort by engagement (reach, like, comment) — Cloudflare/social analytics
- Top 5 winning format → double down
- Top 5 underperform → drop/redesign
- Sentiment trend: positive vs negative engagement

Save `docs/content-review/QX-YYYY.md`.

## Repurpose matrix

```
Source (high effort): TikTok 30s
  ↓ same week
  → IG Reels (same video, caption khác)
  → FB (cut 15s preview + link)
  → Threads (1 frame + text quote)
  
Source: IG feed 1 photo
  ↓ same day
  → FB (caption shorter, hashtag fewer)
  → Threads (1 line từ caption)
  → KHÔNG re-post nguyên xi
```

## Compose với skill khác

- `marketing:campaign-plan` — quarterly content campaign
- `small-business:content-strategy` — generic content framework
- `marketing:performance-report` — quarterly review

## Anti-patterns

- ❌ No calendar = ad-hoc panic posting
- ❌ Same content y hệt 4 platform (đổi nhẹ format)
- ❌ Promo content >30% feed (mất giá trị brand)
- ❌ Skip Friday plan → tuần sau cold start
- ❌ Plan quá rigid không adapt event/weather
- ❌ Aggregate engagement <30 ngày (data noisy)
