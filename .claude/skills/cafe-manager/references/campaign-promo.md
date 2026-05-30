# Reference — Marketing Campaign + Promo (Flash sale, Happy Hour, Zalo broadcast)

> Integrate với `gas/Promo.gs` (đã có nền — Promotion sheet + checkAndRunCampaigns trigger 15').

## Promo schema trong Sheets (tab PROMOTIONS — đã có)

```
campaign_id | name | type (flash|discount|bogo|happy_hour) |
discount_value | discount_type (pct|fixed) |
schedule_type (one_time|weekly|daily) |
start_date | end_date |
start_time | end_time |
days_of_week (Mon,Fri,Sat hoặc * = mọi ngày) |
target_skus (null = tất cả beverage) |
currently_running | zalo_sent | telegram_sent | slides_updated | is_active
```

## Workflow `/promo` — design 1 campaign

Hỏi user:
1. **Mục đích**: launch / flash / happy hour / event / winback
2. **Discount**: % hay fixed VND, value
3. **Thời gian**: one-time / weekly / daily, ngày + giờ
4. **Target**: SKU cụ thể hay all beverage
5. **Audience**: in-store / online / Zalo OA broadcast

Output:
```markdown
# Campaign brief: <name>

## Cấu hình PROMOTIONS row (paste vào Sheets)
| campaign_id | name | type | discount_value | discount_type | schedule_type | start_date | end_date | start_time | end_time | days_of_week | target_skus | is_active |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| promo-YYYYMMDD-001 | <name> | <type> | <val> | <pct/fixed> | <one_time/weekly/daily> | YYYY-MM-DD | YYYY-MM-DD | HH:MM | HH:MM | <Mon,Fri,Sat hoặc *> | <SKU list hoặc *> | TRUE |

## Promo banner message (cho landing — `data.promo.message`)
"<copy ngắn, ≤80 ký tự, friendly tone, mention discount nếu pct>"

VD: "🍵 Hojicha mùa mới — giảm 15% T6-T7 14:00-17:00"

## Zalo OA broadcast draft (nếu user chọn)
[Theo format Zalo trong _brand-voice.md §5]

## Cross-channel content
- IG Story thông báo (visual brief riêng — gọi /post mode story)
- FB post (ngắn, có promo image)
- TikTok teaser 15s (nếu time cho phép)
- GBP Offer post (link Google Business Profile)

## Telegram alert nội bộ (chủ quán + staff)
"📢 Promo <name> bật from <time>. Target: <SKU>. Discount: <val>."

## ROI tracking sau campaign
- Trước: avg revenue 7d before campaign
- Trong: revenue during campaign window
- Sau: revenue 7d after
- Delta % + delta VND
- Zalo OA: count khách follow tăng, click link
- Web: pageview spike (Cloudflare)
```

## Promo types — best practice

### Flash sale (one_time)
- Window: 2-6h
- Discount: 15-25% (đủ urgent, không ăn vào margin)
- Schedule: weekday afternoon nếu push lunch crowd, weekend evening cho khách trẻ
- Cảnh báo: KHÔNG chạy flash sale liên tục → loss premium positioning

### Happy Hour (weekly)
- Khung giờ chậm khách (vd 14:00-17:00 T6-T7)
- Discount nhẹ 10-15%
- Apply: chỉ beverage, không bánh
- KHÔNG combo với loyalty stamp (tránh stack discount)

### BOGO (Buy One Get One)
- Cho launch món mới: "Mua trà sữa cũ, tặng 1 ly hojicha mới (size S)"
- Stack với loyalty: KHÔNG (tránh nhân stamp)
- Bắt buộc khai báo trong Sheets type=bogo + logic riêng trong Promo.gs

### Event-based (one_time)
- Lễ hội Đà Lạt, chợ phiên Lâm Hà, Tết, Trung thu, Giáng sinh
- Theme drink: special edition (vd "Matcha Trung Thu" với hộp bánh)
- Time-limited collateral (sticker, ly mang đi đặc biệt)

## Calendar promo gợi ý (Lâm Hà / Lâm Đồng context)

| Tháng | Sự kiện | Promo idea |
|---|---|---|
| 1 | Tết Dương lịch + Tết Nguyên đán (cuối tháng) | Combo "lì xì" matcha boxset |
| 2 | Valentine | "Cho 2" — buy 2 drink + tặng macaron matcha |
| 3 | Mùa hái trà Bảo Lộc | "Story trà tươi" + sample trà mới |
| 4 | Lễ giỗ tổ + 30/4 | Theme nghỉ lễ — drink cold-brew |
| 5 | Lao Động + Đà Lạt cuối xuân | Iced bạc xỉu launch |
| 6 | Hè + soft launch anniversary (6/18) | "Sinh nhật quán" — free 1 sticker mỗi đơn |
| 7 | Hè cao điểm | Trà đào cam sả happy hour |
| 8 | Mùa mưa Tây Nguyên | Hojicha warm launch |
| 9 | Trung Thu + back-to-school | Matcha mooncake boxset |
| 10 | Mùa cà phê thu hoạch Lâm Đồng | "Vụ mới" — cà phê specialty single origin |
| 11 | Mùa khô + Giáng Sinh sớm | Hot drink combo |
| 12 | Giáng Sinh + Year-End | "Giáng sinh ở Lâm Hà" — limited edition matcha eggnog |

## Logic chống stack discount

Quan trọng: KHÔNG cho phép:
- Promo + Loyalty stamp redemption cùng đơn
- 2 promo cùng SKU cùng lúc
- Promo + giá free drink (đã đổi stamp)

Implementation: trong `applyPromoPrice()` check existing flags. Nếu conflict → ưu tiên FIRST flag set (FIFO).

## Khi promo kết thúc

`checkAndRunCampaigns` tự tắt khi end_time. Cleanup:
1. Restore prices qua `restoreOriginalPrice()`
2. Hide banner landing (JS tự handle vì `data.promo.active=false`)
3. Telegram report tổng kết: revenue diff, đơn count, ROI
4. Update PROMOTIONS row `currently_running=FALSE`

## Anti-patterns

- ❌ Discount >30% (mất margin + signal "đại hạ giá")
- ❌ Chạy flash sale >1 lần/tuần
- ❌ Broadcast Zalo OA cho promo nhỏ
- ❌ Promo trùng holiday peak (giảm khi đông là tự sát margin)
- ❌ Quên cleanup PROMOTIONS row sau end
- ❌ Stack promo + stamp
- ❌ Promo banner copy dài >80 ký tự (overflow mobile)
