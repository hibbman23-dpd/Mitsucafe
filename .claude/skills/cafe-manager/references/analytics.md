# Reference — Web Analytics (Cloudflare default, GA4 optional)

## Setup hiện tại

**Cloudflare Web Analytics** (free, privacy-friendly, no cookie banner):
- Script ở `mitsu.html` + `index.html` cuối `<head>`
- Token đặt trong `data-cf-beacon="{"token":"..."}"` placeholder
- CSP đã cho phép `static.cloudflareinsights.com` trong `script-src` + `connect-src`

## Operator setup steps (manual, 1 lần)

```
1. Đăng ký https://www.cloudflare.com/web-analytics/ (free, không cần move DNS)
2. Add site: mitsu.cafe
3. Lấy site token (string ~32 ký tự)
4. Sửa cả 2 file:
   - web/mitsu.html → tìm "REPLACE_WITH_CF_TOKEN"
   - web/index.html → cùng vậy
5. Commit + push GitHub Pages
6. Đợi 5 phút → check https://dash.cloudflare.com/?to=/:account/analytics/web/
```

## Metric ưu tiên đọc (theo intent)

### Khi user hỏi "trang web có ai vào không"
- **Pageviews 24h / 7d / 30d**
- **Unique visitors** (Cloudflare estimate, không có cookie nên estimate)
- **Top page**: mitsu.html vs index.html share
- **Source/referrer**: direct / Google search / social / QR

### Khi user hỏi "marketing có effective không"
- **Source breakdown**: % traffic từ FB / IG / TikTok / Google / Direct
- **Click-through landing → order** (cần custom event, xem dưới)
- **Bounce rate** (visit 1 page rồi rời)

### Khi user hỏi "khách ở đâu"
- **Country/region breakdown** (Cloudflare granular tới state/province cho 1 số nước)
- **Đối với Việt Nam**: Cloudflare hiển thị tới city level (Hà Nội, TP.HCM, Đà Lạt, ...)

### Khi user hỏi "device gì"
- **Device split**: mobile / desktop / tablet
- **Browser**: Chrome / Safari / others
- Lâm Hà audience expected: 85%+ mobile

## Custom event tracking (optional, Phase B+)

Để track CTA click landing → order page:

```html
<!-- Add to mitsu.html khi user click "Đặt ngay" -->
<script>
  document.querySelectorAll('.btn-primary, .nav-cta, .nav-order-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window._cfBeacon) {
        // Cloudflare custom event (nếu Cloudflare Pages Plan có RUM events)
      }
    });
  });
</script>
```

Note: Cloudflare Web Analytics FREE TIER không support custom event. Để track click-through, hoặc:
- A. Upgrade Cloudflare Pages Plan
- B. Switch sang GA4 (free, có custom event)
- C. Track gián tiếp: query string `?utm_source=landing` đã có sẵn (xem mitsu.html line 1001) → đếm orders với utm_source=landing trong GAS ORDERS tab

**Recommended path C**: dùng UTM đã có + GAS counter. Output: % visit landing → tạo order = CONVERSION.

## GA4 alternative (chưa default)

Nếu user muốn full IP / detailed funnel:

```html
<!-- Add ở thay vị trí Cloudflare beacon hoặc song song -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX', {
    'anonymize_ip': true,  // GDPR-friendly
    'cookie_flags': 'SameSite=None;Secure'
  });
</script>
```

CSP cần add `*.googletagmanager.com` + `*.google-analytics.com`.

## Threshold cho daily/weekly brief

| Metric | Healthy baseline | Warn | Alert |
|---|---|---|---|
| Daily pageviews | >50 sau soft launch | <30 | <10 trong 7d |
| Bounce rate | <60% | 60-75% | >75% |
| % social traffic | >40% | 20-40% | <20% (rely on direct) |
| % mobile | 70-90% | <60% | <40% (kiểm responsive) |

## Khi cron weekly brief chạy

`cronWeeklyOpsDigest` (Layer 5) cần kéo Cloudflare data qua:
- Option 1: Cloudflare Analytics GraphQL API (cần Cloudflare API token)
- Option 2: Manual export → user paste vào Sheets
- Option 3 (MVP): skip, hỏi user paste

Phase B mặc định **Option 3** — Phase D+ có thể nâng cấp Option 1 nếu user OK.

## Compose với skill khác

- `marketing:seo-audit` — defer cho deep SEO audit quarterly
- `marketing:performance-report` — defer cho format social+web report
- `data:analyze` — nếu user paste CSV export

## Anti-patterns

- ❌ Add Cloudflare + GA4 cùng lúc (double tracking, slow page)
- ❌ Bỏ `anonymize_ip` trong GA4
- ❌ Track PII (số đt, email) qua analytics
- ❌ Add tracker mà không update CSP
- ❌ Trust pageview <5 ngày đầu sau launch (data noisy)
