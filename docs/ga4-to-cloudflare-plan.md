# Plan: Gỡ GA4, thay bằng Cloudflare + Worker-side tracking — 2026-07-02

> Kết quả nghiên cứu của session review web. Session thực thi đọc file này là đủ ngữ cảnh, không cần đọc lại conversation. Mục tiêu: bỏ gtag.js 167KB (script nặng nhất trang) mà KHÔNG mất ROI attribution đang nuôi cafe-insight.

## 1. Kết luận nghiên cứu

**CF Web Analytics (beacon miễn phí, đã cài sẵn trên cả 2 trang) KHÔNG thay được GA4 một mình:**
- Dimensions chỉ có: country, host, path, referer, device, browser, OS ([docs](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/))
- ❌ KHÔNG có UTM source/medium/campaign — thứ GA4 đang cung cấp cho `WEB_TRAFFIC`
- ❌ Chỉ country-level, không có city · ❌ không custom events

**Nhưng site chạy sau Cloudflare Worker (`src/index.js`) → tự log được UTM server-side, còn TỐT hơn GA4:**
- `request.cf` có sẵn `city`, `country`, `region` — không cần JS client
- Không bị adblocker chặn (GA4 bị chặn bởi ~30-40% adblock user)
- Không cookie, không gửi data cho Google (điểm cộng Nghị định 13 PDPD)

**GA4 hiện tại thực chất dùng rất ít:** grep toàn bộ web/ — **KHÔNG có `gtag('event')` nào**, chỉ pageview mặc định. Cột `conversions` trong WEB_TRAFFIC = 0 vĩnh viễn (không có key event nào được config). Attribution đơn hàng đã nằm sẵn trong `ORDERS.utm_source/utm_campaign` (không liên quan GA4).

**→ Quyết định: thay được.** Kiến trúc: Worker log hit → GAS ghi tab `WEB_HITS` (raw) → rollup hằng ngày vào `WEB_TRAFFIC` (giữ NGUYÊN schema) → `getRoiData`/cafe-insight không phải sửa 1 dòng nào. Beacon CF Web Analytics GIỮ NGUYÊN (dashboard nhìn nhanh + CWV RUM). Lịch sử GA4 cũ đã nằm trong tab WEB_TRAFFIC (Sheets) — không mất gì.

(Đã cân nhắc Workers Analytics Engine: retention chỉ 3 tháng + thêm 1 hệ lưu trữ ngoài Sheets — phạm nguyên tắc "Sheets = database duy nhất" của CLAUDE.md → bỏ.)

## 2. Việc cần làm

### Task 1 — Worker: log landing hit (src/index.js)
Trong handler, với request là **HTML navigation** (pathname `/` hoặc `.html` public, KHÔNG thuộc BLOCKED_PATHS/NOINDEX_PATHS/`/sig-img/`, method GET, header `Accept` chứa `text/html`, UA không phải bot — regex `bot|crawler|spider|preview|lighthouse|headless`):

```js
ctx.waitUntil(logWebHit(request, env));  // fetch(request, env, ctx) — nhớ thêm ctx vào chữ ký
```

`logWebHit`: thu `path` (bỏ query), `utm_source/utm_medium/utm_campaign` từ query, `referer` host, `country/city/region` từ `request.cf`, `device` (mobile/desktop từ UA), `visitor_hash` = SHA-256(IP + UA + salt-theo-ngày) cắt 16 ký tự — KHÔNG lưu IP thô. POST JSON tới GAS `action=web_hit` kèm `token` (secret `REPORT_API_TOKEN` đã có sẵn trong Worker — xem SECURITY_DEPLOY.md; **kiểm tra secret này đã put cho worker mitsucafe chưa, trước giờ chỉ chắc chắn có ở mitsu-ops** — nếu chưa: `npx wrangler secret put REPORT_API_TOKEN`).
Lỗi thì nuốt im (không được ảnh hưởng serve trang).

### Task 2 — GAS: nhận hit + rollup (file mới gas/WebHits.gs)
- Tab `WEB_HITS`: `ts, date, path, utm_source, utm_medium, utm_campaign, referer, country, city, device, visitor_hash`. Route `web_hit` trong doPost (gate `_requireTokenIfSet`), **appendRow không cần LockService** (append thuần, không read-modify-write — tránh chèn ép lock của orders).
- `rollupWebHits(date)`: gom WEB_HITS theo (landing_page=path, source=utm_source||'(direct)'/referer-host, medium, campaign, city) → ghi vào **WEB_TRAFFIC giữ nguyên 11 cột hiện có** (`WebTraffic.gs:7-10`): sessions = số hit, users = distinct visitor_hash, new_users = hash chưa từng thấy 30 ngày trước, conversions = 0. Idempotent theo date (xoá dòng date đó trước khi ghi — copy pattern batch-filter của `pullGa4Traffic` WebTraffic.gs:66-75).
- Trigger hằng ngày 5:50 (trước rollup 6:00 hiện có): rollup hôm qua + prune WEB_HITS >90 ngày (theo pattern Archive.gs).

### Task 3 — Gỡ GA4 khỏi web
- `web/mitsu.html` (~dòng 96-103) + `web/index.html` (~dòng 42-50): xoá 2 khối `<script async src="googletagmanager...">` + inline `gtag(...)`.
- CSP meta cả 2 trang: bỏ `https://www.googletagmanager.com` khỏi script-src, bỏ `https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com` khỏi img-src/connect-src/default-src.
- GIỮ `static.cloudflareinsights.com` (beacon CF ở lại).

### Task 4 — GAS: cho GA4 pipeline nghỉ hưu
- Xoá trigger `pullGa4Recent` (chạy tay `installGa4DailyTrigger` đã xoá-trước-khi-tạo → viết hàm `removeGa4Trigger()` hoặc xoá trong UI Triggers).
- `WebTraffic.gs`: GIỮ `pullGa4Traffic` + đánh dấu `@deprecated — chỉ dùng backfill lịch sử` trong comment đầu file; route `ga4_pull` (Code.gs:500) giữ nguyên (vô hại, có token gate).
- KHÔNG đụng `getWebTraffic()` — Marketing.gs:267 (`getRoiData`) đang dùng.
- `appsscript.json`: GIỮ AnalyticsData advanced service (pullGa4Traffic còn tham chiếu; xoá sẽ gãy compile).

### Task 5 — Verify + deploy
1. Local: `node --check src/index.js`. Deploy web qua PR (CI tự deploy khi merge — push thẳng main bị chặn).
2. GAS: `python3 /Users/dpd/Projects/lamha-kissaten/ops/gas_push.py` (KHÔNG dùng clasp — gãy, xem memory `gas-deploy-command`), bảo user chạy `--deploy`.
3. Mở `https://mitsu.cafe/?utm_source=test&utm_campaign=ga4cutover` bằng tab ẩn danh → check tab WEB_HITS có dòng mới (path=/, utm_source=test, city đúng).
4. Chạy `rollupWebHits('<hôm nay>')` tay trong editor → WEB_TRAFFIC có dòng tổng hợp.
5. DevTools Network trên mitsu.cafe: KHÔNG còn request googletagmanager/google-analytics (kể cả bản first-party `/fr7b/`* — sau khi gỡ gtag thì mất theo); console không lỗi CSP.
6. Đo lại: script memory `reference-web-audit-tooling` — kỳ vọng tổng tải landing 729KB → ~560KB, script 182KB → ~15KB.

*Lưu ý `/fr7b/`: gtag đang được serve first-party qua path này (167KB) — là cơ chế proxy, sẽ tự biến mất khi gỡ tag; nếu còn thấy sau khi gỡ → tìm trong CF dashboard (Zaraz/managed transforms) và tắt.

## 3. Trade-off chấp nhận (đã cân nhắc, không cần hỏi lại)
- Mất GA4 UI + demographic/interest reports — chưa từng dùng (data vào Sheets hết).
- "sessions" mới = pageview-hits, "users" = unique/ngày theo hash — định nghĩa khác GA4 một chút; số liệu TĂNG nhẹ so GA4 (không bị adblock chặn). Ghi chú vào cột nguồn nếu cần so sánh giai đoạn giao thời.
- WEB_HITS raw giữ 90 ngày (prune) — WEB_TRAFFIC tổng hợp giữ vĩnh viễn như cũ.

## 4. Rollback
Web: revert PR. GAS: route `web_hit` vô hại kể cả khi Worker ngừng gọi; bật lại GA4 = restore 2 khối script + cài lại trigger `pullGa4Recent`.
