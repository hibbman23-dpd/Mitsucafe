# Tổng kết thực thi Web Review — 2026-07-02 (bản bàn giao double-check)

> File này dành cho việc review độc lập (antigravity / agent khác / người). Mọi claim "đã verify" đều kèm cách tự kiểm chứng. Báo cáo audit gốc: `docs/web-review-2026-07-02.md`. Plan GA4: `docs/ga4-to-cloudflare-plan.md`.

## A. Những gì đã làm (3 đợt, cùng ngày)

### Đợt 1 — Audit toàn diện (không đổi code)
Chấm điểm 8 mảng, đo CWV baseline bằng Chrome for Testing + throttle chuẩn Lighthouse mobile (Slow 4G + 4x CPU, cold load). Phát hiện lớn nhất: GAS `/exec` trả 403 anonymous → **đặt hàng online đang gãy âm thầm** (menu tĩnh vẫn hiện nên không lộ).

### Đợt 2 — PR #9 `web-review-fixes` (MERGED, commit merge `f899d3f`)
| Fix | File |
|---|---|
| Nén 3 sticker loyalty 1.57MB→52KB | `web/img/mitsu/stk-{kin,ritsu,so}.webp` |
| Logo light/dark `<picture>` + swap media khi toggle theme (hết tải cả đôi ~250KB) | `web/mitsu.html`, `web/mitsu-theme.js` |
| Hero banner srcset 512w/1024w + preload imagesrcset | `web/mitsu.html`, thêm `web/img/mitsu/logo-banner-512.webp` |
| Cache-Control `immutable` 1 năm cho `/img/*` + asset có `?v=` | `src/index.js` |
| Bỏ `@import` fonts (phá preload-async), bù `<link>` fonts 3 trang | `web/mitsu.css`, `web/kds.html`, `web/mitsu-kit.html`, `web/mitsu-menu-proto.html` |
| Bỏ chặn zoom `user-scalable=no` (WCAG 1.4.4) | `web/index.html` |
| SEO: title +"Lâm Hà, Lâm Đồng", JSON-LD thêm geo/sameAs/hasMenu, title riêng trang order, sitemap lastmod | `web/mitsu.html`, `web/index.html`, `web/sitemap.xml` |
| Typo tiếng Hàn lẫn tiếng Nhật オー더→オーダー | `web/mitsu.html` footer |
| **GAS: giá tính server-side theo SKU** (size L, topping tra `customizations_json`, promo % áp lên giá size TRƯỚC topping — khớp từng đồng với client để `bank_notification` gạch nợ theo số tiền không lệch), free-drink trừ ly non-BK đắt nhất, `total`/`payment.total` server-cấp | `gas/Orders.gs` |
| GAS: `active_orders` (endpoint public) bỏ field `total` | `gas/Code.gs` |
| Tooling mới: deploy GAS không cần clasp (clasp v3 gãy "Premature close" trên máy này) | `ops/gas_push.py` (`--deploy` = tạo version + trỏ deployment prod, giữ URL /exec) |

### Đợt 2.5 — Việc tay đã làm (user): mở lại quyền GAS
Apps Script deployment về **Who has access: Anyone** + redeploy → hết 403.

### Đợt 3 — PR #10 (MERGED, commit `767f9bd`): gỡ GA4 → Worker-side tracking
- `src/index.js`: `ctx.waitUntil(logWebHit)` cho HTML navigation public — log path/UTM/referer/country/**city** (`request.cf`)/device/`visitor_hash` (SHA-256 IP+UA+salt ngày — không lưu IP thô) → POST `action=web_hit` (token-gated) về GAS.
- `gas/WebHits.gs` (mới): tab `WEB_HITS` raw + `rollupWebHits(date)` gộp vào `WEB_TRAFFIC` **giữ nguyên 11 cột** → `getRoiData`/cafe-insight không phải sửa. Trigger hằng ngày + prune 90 ngày.
- Gỡ 2 khối gtag + dọn CSP (googletagmanager/google-analytics) khỏi `web/mitsu.html`, `web/index.html`. Beacon CF Web Analytics GIỮ.
- `gas/WebTraffic.gs` đánh dấu deprecated (giữ `getWebTraffic` vì `Marketing.gs:267` dùng; giữ AnalyticsData service để không gãy compile).

## B. Trạng thái live ĐÃ VERIFY (2026-07-02, sau deploy tất cả)

| Hạng mục | Kết quả | Tự kiểm chứng |
|---|---|---|
| GAS anonymous | `action=menu` → JSON 200, 27 món | mở ẩn danh `<GAS_URL>?action=menu` |
| `web_hit` route | live, sai token → `{"ok":false,"error":"unauthorized"}` | fetch POST từ console trang |
| gtag trong HTML | 0 reference | `curl -s https://mitsu.cafe/ \| grep -c gtag` → 0 |
| Cache asset | `cache-control: public, max-age=31536000, immutable` trên /img/* | `curl -sI https://mitsu.cafe/img/mitsu/stk-kin.webp` |
| Trang nội bộ | /dashboard.html /kds.html → 404; ops.mitsu.cafe → 302 Cloudflare Access | curl |
| Lighthouse mobile | **SEO 100 · Best Practices 100 · A11y 96** | chrome-devtools lighthouse |

**CWV (mobile 390px, Slow 4G + 4x CPU, cold — cùng phương pháp 3 lần đo):**

| | Baseline sáng | Sau PR #9 | Sau PR #10 (hiện tại) |
|---|---|---|---|
| Landing tổng tải | 2.527KB | 729KB | **730KB**¹ |
| Landing LCP | 10.4s | 7.7s | **6.8s** |
| Landing FCP | 3.2s | 2.1s | 2.8s |
| Order LCP | 2.4s | 1.9s | **2.1s** |
| Desktop LCP | 1.3s | 0.8s | **0.8s** |

¹ Chưa giảm thêm vì mục C.1 dưới đây.

## C. ⚠️ CÒN LẠI — theo thứ tự ưu tiên

1. **🔴 (VIỆC TAY — CF dashboard, 2 phút) Tắt "Google tag gateway"**: HTML đã sạch gtag nhưng **Cloudflare vẫn tự tiêm** script qua `https://mitsu.cafe/fr7b/` (167KB) và VẪN bắn `page_view` về `G-V9F9RB43N9` (đã thấy request `POST /fr7b/ga/g/c?...tid=G-V9F9RB43N9...en=page_view` trong DevTools). Tìm trong dash.cloudflare.com zone mitsu.cafe → mục Google tag gateway / Zaraz / Tag setup → tắt. Verify: `curl -s -o /dev/null -w "%{http_code}" https://mitsu.cafe/fr7b/` → hết 200, và DevTools Network không còn `/fr7b/`. Kỳ vọng sau tắt: script 183KB→~16KB, landing ~563KB.
2. **Check tab WEB_HITS trong Sheets**: session review đã bắn hit test `?utm_source=test&utm_campaign=antigravity_check` (~13h 02/07) — phải thấy dòng tương ứng. Không thấy → nghi secret `REPORT_API_TOKEN` chưa put cho worker `mitsucafe` (`npx wrangler secret put REPORT_API_TOKEN`, giá trị = CONFIG sheet).
3. **Đợt tối ưu nhỏ còn treo** (code, ~nửa buổi): nén `logo-banner.webp` 1024w 209KB→~120KB (điện thoại DPR3 không ăn bản 512w — đây là nút thắt LCP còn lại); resize `char-kin-joyful.webp` 600×800 (story-bubble hiện muộn chiếm LCP khi cache ấm); order.js còn tải cả 2 logo light+dark (~244KB); 2 audit a11y fail (contrast nút "Đặt ngay" + foot-tagline; cart badge "0" lệch aria-label); dồn style inline footer vào class; manifest thêm `id` + icon maskable.
4. **Dọn assets public**: xóa `web/lh-report-new.json` (660KB) + `web/server.log` khỏi thư mục deploy.
5. **Sau 1-2 tuần chạy song song số liệu**: xóa hẳn GA4 property (data mới giờ vào WEB_HITS/WEB_TRAFFIC; lịch sử cũ đã nằm trong Sheets), cân nhắc gỡ AnalyticsData khỏi appsscript.json + xóa pullGa4Traffic.
6. **Quyết định kinh doanh (không phải bug)**: CF managed robots.txt đang chặn AI crawlers (GPTBot/ClaudeBot/Google-Extended) — muốn hiện diện trong AI search thì tắt trong CF; dài hạn thêm trang content địa phương cho SEO (site hiện 1 trang).
7. **Đơn test end-to-end sau các thay đổi giá GAS** (nếu chưa làm): 1 đơn size L + topping (+ promo nếu đang bật) → tổng tiền client = số ghi trong ORDERS = số tiền VietQR.

## D. File exploration KHÔNG deploy (giữ untracked có chủ đích)
`web/logo-explorations.html`, `web/seal-honeycomb*.{html,svg}`, `web/signboard-concept.html`, `web/sign-relief-explainer.html`, `web/typography-explorations.html`, `web/mitsu-order-qr*.svg/png`, `docs/content-plans/`, `docs/trend-scout/` — bản nháp thiết kế, chưa được yêu cầu publish.
