# Reference — Local SEO + Google Business Profile

## Mục tiêu

Khi khách Lâm Hà / Lâm Đồng / Đà Lạt search "cà phê gần đây", "trà sữa Lâm Hà", "matcha Đà Lạt" → MitsuKàphê xuất hiện trong **Local Pack 3-result** Google Maps.

## Setup chính (đã/cần làm)

### Google Business Profile (GBP)
- [ ] Claim địa chỉ: MitsuKàphê, 938 Đường Hùng Vương, Lâm Hà, Lâm Đồng
- [ ] Category chính: **Bubble tea store** (primary) + **Café** (secondary)
- [ ] Phone: 0975 087 429
- [ ] Website: https://hibbman23-dpd.github.io/mitsucafe/mitsu.html
- [ ] Hours: 6:00-0:00 hàng ngày
- [ ] Cover photo: mascot outdoor / hero brand
- [ ] Logo: round mascot
- [ ] Upload 10+ photos: drink, không gian, mascot, menu, ngoài quán
- [ ] Description: bilingual JP/VN, có keyword "Lâm Hà", "matcha", "trà sữa Nhật Bản"
- [ ] Attributes: Free Wi-Fi, Outdoor seating (nếu có), Takeout, Dine-in

### Schema.org structured data
Đã có trong `mitsu.html:28-58` — `@type: CafeOrCoffeeShop`. Bao gồm:
- `name`, `image`, `telephone`, `address`, `openingHours`
- Check telephone đúng (đã fix `+84975087429`)

### NAP consistency
**N**ame **A**ddress **P**hone phải giống y hệt trên:
- Google Business Profile
- Website (footer + schema.org)
- Facebook page
- Instagram bio
- TikTok bio
- Threads
- Maps listing
- Bất kỳ directory nào claim (Foody, Lozi, Yelp...)

Inconsistency = signal yếu cho Google.

## Keyword target (Vietnamese)

### Primary (high intent)
- `cà phê Lâm Hà`
- `trà sữa Lâm Hà`
- `quán cà phê Lâm Đồng`
- `matcha Đà Lạt`
- `hojicha Việt Nam`

### Secondary (long-tail)
- `cà phê Nhật Bản Lâm Đồng`
- `cà phê có wifi Lâm Hà`
- `trà sữa matcha gần đây`
- `quán cà phê Hùng Vương Lâm Hà`
- `kissaten Việt Nam`

### Branded
- `MitsuKàphê`
- `Mitsu`
- `かえる Lâm Hà`

## Content SEO trên landing

### `mitsu.html` đã có:
- `<title>`: brand + category ✓
- `<meta description>`: bilingual với keyword địa danh ✓
- `<h1>`: brand name (không phải keyword) — OK vì brand-first
- Schema.org CafeOrCoffeeShop ✓
- OG image cho FB/IG share ✓

### Còn thiếu (gợi ý add):
- [ ] Alt text cho mọi ảnh trong web/img/ (đã có 1 số, cần audit)
- [ ] BreadcrumbList schema (nếu có sub-pages)
- [ ] FAQPage schema cho hỏi-đáp thường gặp (Q: Quán mở mấy giờ? Q: Có dùng được app gì?)
- [ ] Sitemap.xml (nếu thêm sub-page)

## Posting cadence trên GBP

- 1-2 post/tuần (GBP có feature post type: Update / Offer / Event)
- Promo flash → GBP Offer post
- Launch món → GBP Update post + ảnh
- Event (chợ phiên Lâm Hà, lễ hội Đà Lạt) → GBP Event post

## Review management

Reference riêng: `reviews-reputation.md`.

GBP review quan trọng nhất:
- 4.5+ ⭐ trung bình → ranking boost
- Response rate >70% review → ranking signal
- Response time <24h → conversion signal

## Local link building

Nên kiếm backlink từ:
- Foody.vn (claim listing)
- Lozi.vn
- Lonely Planet / TripAdvisor (Lâm Đồng section)
- Blog du lịch Đà Lạt (Vinpearl, Vntrip)
- Báo địa phương Lâm Đồng (báo Lâm Đồng Online)
- Báo specialty coffee VN (CafeF, Specialty Coffee VN)

Outreach pitch: "Quán mới mở ở Lâm Hà, concept Nhật-Việt, có mascot かえる, mời journalist ghé thử".

## Quarterly audit checklist

Mỗi quý 1 lần:
- [ ] NAP consistency check (search "MitsuKàphê" → 5 link đầu, verify NAP)
- [ ] Review rating trend (3 tháng trước vs hiện tại)
- [ ] Top keyword ranking (Google search incognito từ Đà Lạt IP)
- [ ] GBP photo count + recency
- [ ] Backlink check (Ahrefs free check)
- [ ] Competitor local pack ranking

## Defer cho skill khác

- `marketing:seo-audit` — quarterly deep SEO audit toàn diện
- `marketing:competitive-brief` — quarterly competitor scan

## Anti-patterns

- ❌ Stuff keyword vào title/description (`Cà phê tốt nhất Lâm Hà số 1 đỉnh nhất`)
- ❌ Mua backlink farm
- ❌ Tạo nhiều GBP listing cho cùng 1 quán
- ❌ Fake review (1 quán có 1 listing thật + 10 review giả → suspended)
- ❌ Update giờ mở cửa GBP không khớp thực tế
- ❌ Quên reply review xấu (phải reply chuyên nghiệp, không xoá)
