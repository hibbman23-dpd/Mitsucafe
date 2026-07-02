# Web Review mitsu.cafe — 2026-07-02 · Danh sách việc cần fix

> Kết quả audit toàn diện (performance đo thật bằng Chrome for Testing + throttle chuẩn Lighthouse mobile Slow4G/4xCPU; security/SEO verify trực tiếp trên production). Session sau cứ theo checklist này, mỗi mục có đủ file path + cách fix. Đánh dấu ✅ khi xong.

## Bảng điểm hiện trạng (để đo lại sau khi fix)

| Mảng | Điểm | Sau fix kỳ vọng |
|---|---|---|
| Backend GAS | 7.5 | 8.5 (P1) |
| Hạ tầng Worker/CF | 8.5 | 9 (P2.3) |
| Security | 7.5 | 8 (P1, P3.2) |
| Performance | 5.5 | 8+ (P2 — landing LCP 10.4s → mục tiêu <4s throttled) |
| SEO | 6.5 | 8 (P3) |
| Content/Brand | 8 | 8.5 (P0.3) |
| UI/UX/A11y | 7.5 | 8.5 (P0.4) |
| PWA | 7 | 7.5 |

Baseline đo 2026-07-02 (mobile Slow4G + 4xCPU): landing `/` LCP **10.4s**, FCP 3.2s, CLS 0.038, tải **2.527KB**; order `/index.html` LCP 2.4s, tải 521KB. Cách đo lại: xem memory `reference-web-audit-tooling` (playwright-core + Chrome for Testing trong `~/Library/Caches/ms-playwright/chromium-1228/`, máy KHÔNG có Chrome stable, PSI API hết quota).

---

## 🔴 P0 — Khẩn cấp / việc tay

### P0.1 — GAS web app trả 403 anonymous → ĐẶT HÀNG ONLINE ĐANG GÃY *(việc tay của chủ, không code)*
- Bằng chứng: `curl` + headless Chrome sạch cookie gọi `https://script.google.com/macros/s/AKfycbynDqbg…/exec?action=menu` (đúng URL trong `web/order.js:11`) → 403 "Truy cập bị từ chối", POST cũng bị chặn trước `doPost`. Menu vẫn hiển thị (render từ `menu-data.js` tĩnh) nên lỗi KHÔNG lộ ra UI — chỉ gãy lúc khách bấm gửi đơn / check promo / tracking đơn.
- Fix: Apps Script editor → **Deploy → Manage deployments → Edit → Who has access: Anyone** → deploy version mới (giữ nguyên URL).
- Verify: tab ẩn danh mở `…/exec?action=menu` → phải trả JSON. Kiểm tra luôn KDS + Mac mini poller in tem chạy lại.
- Nghi vấn nguyên nhân: lần redeploy gần nhất chọn nhầm access level.

### P0.2 — (sau khi P0.1 xong) đặt 1 đơn test end-to-end xác nhận pipeline sống lại.

### P0.3 — Typo tiếng Nhật lẫn tiếng Hàn: `web/mitsu.html:401`
- `Đặt hàng online · オー더` → chữ **더 là Hangul**. Sửa thành **オーダー**.

### P0.4 — Chặn zoom vi phạm WCAG: `web/index.html:5`
- Bỏ `maximum-scale=1.0, user-scalable=no` khỏi meta viewport (giữ `width=device-width, initial-scale=1.0`).

---

## 🟠 P1 — Backend integrity

### P1.1 — `validateOrderPayload` tin giá client gửi: `gas/Orders.gs:62-69`
- Hiện tại: `subtotal += (it.on_promo && it.promo_price ? it.promo_price : it.price) * it.qty` và `total: p.total || subtotal` — toàn bộ từ payload client. Mở DevTools sửa payload là mua giá 1đ; tem/KDS/doanh thu ghi số giả.
- Fix: tra MENU theo `it.sku` server-side (`getActiveMenu()` đã có), lấy `price_m/price_l` theo size + topping + promo đang active từ CONFIG/PROMOTIONS, tự tính subtotal/total, **bỏ qua** `it.price`/`p.total` client (chỉ dùng để log chênh lệch nếu muốn). Chú ý case: size L, topping (xem `customizations_json`), `use_free_drink`, promo % toàn quán (`applyPromoPercent` phía client — logic % lấy từ `_getPromoInfoInternal`).
- Deploy GAS TAY: `cd gas && clasp push` + Apps Script redeploy new version (KHÔNG qua CI).

### P1.2 — `active_orders` (public, không token) lộ `total` từng đơn realtime: `gas/Code.gs:305-336`
- Cần cho tracking khách nhưng nên bỏ field `total` (hoặc chỉ trả khi kèm `order_id` khớp) để người lạ không đọc được nhịp doanh thu.

---

## 🟡 P2 — Performance (landing mobile LCP 10.4s → mục tiêu <4s)

### P2.1 — 3 sticker loyalty nặng 1.575KB (60% vấn đề)
- `web/img/mitsu/stk-kin.webp` 557KB · `stk-so.webp` 514KB · `stk-ritsu.webp` 504KB — hiển thị ~90px trong `.seal-badge` (mitsu.html §Experience).
- Fix: `cwebp -resize 200 0 -q 82` (hoặc sips/squoosh) → mục tiêu ≤30KB/file. Giữ bản gốc ở brand-assets nếu cần in ấn.

### P2.2 — Logo light + dark tải CẢ ĐÔI (~250KB lãng phí)
- `display:none` qua class `.logo-light-only/.logo-dark-only` (mitsu.css:124-133) KHÔNG ngăn `<img>` download. Các cặp: nav logo (mitsu.html:105-106), hero logo-full (156-157), footer (383-384).
- Fix: dùng `<picture><source media="(prefers-color-scheme: dark)">` cho mặc định + swap `src` trong `mitsu-theme.js` khi user bấm toggle (vì theme đổi được bằng JS). Hoặc tối thiểu: `loading="lazy"` cho variant ngược theme.

### P2.3 — Cache-Control cho asset: mọi file đang `max-age=0, must-revalidate`
- Fix trong `src/index.js` (worker mitsucafe): sau `env.ASSETS.fetch`, nếu `url.pathname.startsWith('/img/')` hoặc pathname đuôi `.css/.js/.webp/.png/.svg/.woff2` **và** có query `v=` → set `Cache-Control: public, max-age=31536000, immutable`. HTML giữ nguyên must-revalidate. (SW đã stale-while-revalidate nên an toàn.)

### P2.4 — Xóa `@import` fonts: `web/mitsu.css:2`
- HTML đã `<link>` cùng URL; trên index.html chuỗi `@import` này **phá trick preload-async fonts** (fonts thành render-blocking). Xóa dòng 2.

### P2.5 — (tùy chọn, quyết định của chủ) GA4 gtag = 167KB script lớn nhất trang (serve first-party `/fr7b/`)
- Đã có Cloudflare Web Analytics. Chọn: bỏ GA4, hoặc load sau `requestIdleCallback`/tương tác đầu. Nếu bỏ: gỡ 2 khối gtag trong mitsu.html:83-91 + index.html:42-50 và cân nhắc ảnh hưởng tới cafe-insight (GA4 pull `ga4_pull` trong GAS — kiểm tra trước khi bỏ!).

### P2.6 — Hero `logo-banner.webp` 209KB 1024×900 cho khung ~350px mobile
- Thêm `srcset` (512w/1024w) hoặc resize. LCP element chính là ảnh này.

---

## 🟢 P3 — SEO

### P3.1 — JSON-LD `CafeOrCoffeeShop` (mitsu.html:41-74) thiếu trường local-SEO ăn điểm nhất
- Thêm: `geo` (toạ độ quán 938 Hùng Vương), `sameAs` [FB, IG, TikTok, Threads — URL có sẵn trong hero socials], `hasMenu: "https://mitsu.cafe/index.html"`, `servesCuisine` giữ nguyên.

### P3.2 — Title thiếu từ khóa địa phương
- `Mitsu 蜜 — Cà phê · Trà sữa · Mang đi` → thêm `| Lâm Hà, Lâm Đồng` (cả title + og:title mitsu.html; index.html đặt title riêng "Đặt hàng online — Mitsu Lâm Hà" để hết duplicate với `/`).

### P3.3 — Sitemap (`web/sitemap.xml`) chỉ 2 URL, `/index.html` trùng title/desc với `/`
- Hoặc bỏ `/index.html` khỏi sitemap, hoặc để lại sau khi đã đổi title riêng (P3.2). Cập nhật `lastmod`.

### P3.4 — (quyết định của chủ) Cloudflare managed robots.txt đang chặn AI crawlers
- CF Content Signals (`ai-train=no`) + block GPTBot/ClaudeBot/Google-Extended/CCBot… đang prepend vào robots.txt live. Muốn xuất hiện trong AI search (kênh khách mới miễn phí) → tắt "Block AI bots" / chỉnh Content Signals trong CF dashboard. Muốn chặn thật thì giữ.

---

## 🔵 P4 — Nhỏ / dọn dẹp

- `web/order.js:3159-3168`: `banner.innerHTML` nhét `cust.name`, `favorite_drink` từ Camera AI **không qua `esc()`** (hàm có sẵn dòng 3). Rủi ro thấp (nguồn localhost) nhưng sửa 1 dòng cho sạch pattern.
- Footer mitsu.html: dồn style inline dài (soc-btn, foot-map, foot-directions, hours/contact-details) vào class trong mitsu-landing.css.
- Landing chưa đăng ký Service Worker (chỉ order.js có) → thêm `navigator.serviceWorker.register('sw.js')` vào mitsu-landing.js để cache shell từ lượt ghé đầu.
- `web/manifest.json`: thêm `"id"`, icon `"purpose": "maskable"`.
- CSP đang ở `<meta>` với `'unsafe-inline'` script-src — dài hạn chuyển sang header từ Worker + nonce (SECURITY_DEPLOY.md đã note; không gấp).
- `web/lh-report-new.json` (660KB, 13/06, trước rebrand) — xóa khỏi repo/web assets, không nên serve public.
- `web/server.log` cũng đang nằm trong thư mục assets public — xóa.

## ✅ Đã verify TỐT, đừng đụng
- Security headers live đủ (HSTS/XFO/nosniff/Referrer/Permissions); `/dashboard.html`,`/kds.html` → 404; ops.mitsu.cafe sau Cloudflare Access (302 verified); GitHub Pages đã tắt.
- Idempotency + LockService + state machine + append-only + logError throttle trong GAS.
- A11y: 100% ảnh có alt, skip-link, reduced-motion, focus-visible, dark mode.
- OG image 200 OK 47KB; canonical; SW network-first cho HTML là đúng chiến lược.
- Order page performance tốt (LCP 2.4s throttled) — vấn đề chỉ ở landing.

## Thứ tự làm gợi ý cho session sau
1. P0.3, P0.4 (5 phút) → 2. P2.1→P2.4, P2.6 (nửa buổi, xong đo lại bằng script trong memory `reference-web-audit-tooling`) → 3. P3.1→P3.3 → 4. P1.1, P1.2 (cần deploy GAS tay + test kỹ vì đụng tiền) → 5. P4 dọn dẹp. P0.1 + P2.5 + P3.4 là việc/quyết định của chủ quán.
