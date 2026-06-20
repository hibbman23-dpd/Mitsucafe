# 🤝 HANDOFF — cafe-insight (analytics content→doanh số) · cho Antigravity

> **Đọc file này là đủ để làm tiếp** — không cần lịch sử chat. Cập nhật **2026-06-20 (cuối phiên, P2.5 đã code + merge)**.
> Dự án: **Mitsu / Lâm Hà Kissaten** (quán đồ uống + bánh, Lâm Hà). Kiến trúc: **Google Apps Script (event bus) + Google Sheets (DB)**, KHÔNG external DB. Web deploy qua CI (Cloudflare/Pages). GAS deploy TAY (`cd gas && clasp push` + **redeploy version** — xem §8, đây là chỗ DỄ VẤP nhất).

---

## 0. Mục tiêu hệ thống
Theo dõi lưu lượng đa nền tảng (web/FB/IG/Threads/TikTok/Zalo/GBP) **ở mức từng bài đăng**, đối soát ra **đơn hàng + lãi thật**, để subagent `cafe-insight` ra **báo cáo quyết định kinh doanh** (đẩy/sửa/bỏ nội dung nào, dự báo món bán chạy, nhắc nhập kho).

**Triết lý đo lường (stack 3 lớp):** Attribution (UTM, hằng ngày) + Incrementality (lift nhân-quả, P3) + MMM (ngân sách dài hạn, P4).

---

## 1. BẢNG TRẠNG THÁI

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| **P1** | Nhập tay (panel dashboard + MARKETING_LOG + DECISION_LOG + subagent) | ✅ **XONG, chạy thật** |
| **P2 Part A** | GA4 auto (traffic + vị trí khách) | ✅ **XONG, API thông** (0 rows vì GA4 mới tạo) |
| **P2 Part B** | Meta FB/IG/Threads auto-pull | ✅ **XONG, chạy thật** (kéo 4 FB + 1 IG) |
| **P2.5 — TikTok** | yt-dlp (Mac mini) → `tiktok_ingest` → MARKETING_LOG | ✅ **XONG, VERIFY RUNTIME END-TO-END** (3 video @mitsucafe83, ngày đăng thật) |
| **P2.5 — GBP/Maps** | Code xong, **CỐ Ý TẮT** chờ credential | 🔌 **DORMANT** (chờ verified 60 ngày + đơn API) |
| **P2.5 — Zalo OA** | Code xong, **CỐ Ý TẮT** chờ credential | 🔌 **DORMANT** (chờ OA token) |
| **P3** | Phone-match attribution + incrementality | 📋 **Plan ở §6** (chưa code) |
| **P4** | MMM (Marketing Mix Modeling) | 📋 **Plan ở §7** (chỉ cần log đủ data ~2 năm) |

**Git:** P1+P2+P2.5 đã **fast-forward merge vào `main`** (commit `5244fb8`), nhánh `cafe-insight-p2.5` đã xoá. **Chưa push origin** (Mac mini cron đọc working copy local nên không cần; push origin → CI deploy `web/`). GAS deploy tay (đang ở **version 62**).

---

## 2. ĐÃ LÀM & ĐANG CHẠY

### Sheets (tabs)
- **MARKETING_LOG** (25 cột): `activity_id, date, type, platform, campaign_id, title, utm_tag, cost_vnd, effort_hours, reach, clicks, notes, impressions, views, likes, comments, shares, saves, watch_time_sec, avg_watch_pct, format, topic, sku_featured, data_source, external_post_id`. Index 0-based — **reach=9, clicks=10, notes=11, impressions=12 … data_source=23, external_post_id=24**.
- **DECISION_LOG**: `decision_id, date, scope, ref_id, decision, rationale, expected_metric, review_date, actual_result, hit_or_miss`.
- **WEB_TRAFFIC**: `date, landing_page, source, medium, campaign, city, sessions, users, new_users, conversions, pulled_at`.
- **GBP_DAILY** (tạo khi GBP bật): `date, impr_maps, impr_search, calls, website_clicks, directions, pulled_at`.

### GAS files (tất cả trên `main`)
| File | Hàm chính |
|---|---|
| `gas/Marketing.gs` | `logMarketingActivity`, `getMarketingLog`, `migrateMarketingLogP1/P2`, **`upsertMarketingByExternalId(externalId, a)`** (upsert theo external_post_id, data_source=auto; map index 9:reach,10:clicks,12:impressions,13:views,14:likes,15:comments,16:shares,17:saves,18:watch_time_sec,19:avg_watch_pct), **`getRoiData(from,to)`** → `{ orders[], promotions[], marketing[], web_traffic[], gbp_daily[], menu_costs{} }` |
| `gas/Insight.gs` | `initDecisionLog`, `logDecision`, `getDecisionsDue`, `recordDecisionResult` |
| `gas/WebTraffic.gs` | `pullGa4Traffic(from,to)` (advanced service `AnalyticsData.Properties.runReport`), `getWebTraffic`, `pullGa4Recent`, `installGa4DailyTrigger` |
| `gas/Meta.gs` | `_cfg`, `getMetaToken`, `_getPageToken()`, `_metaGet(path,params,tokenOverride)`, degrade (ScriptProperties `META_DEGRADED`), `checkMetaTokenHealth`, `pullMetaFbInsights`, `pullMetaIgInsights` (xử CAROUSEL riêng), `pullMetaThreadsInsights` (graph.threads.net), `pullMetaAll`, `pullMetaRecent`, `installMetaPullTrigger`, `installMetaHealthTrigger` |
| `gas/GbpPerf.gs` 🔌 | `initGbpDaily`, **`pullGbpDaily(from,to)`** (`fetchMultiDailyMetricsTimeSeries` qua `ScriptApp.getOAuthToken()`), `getGbpDaily` (đọc an toàn, rỗng→`[]`), `pullGbpRecent`, `installGbpDailyTrigger` |
| `gas/Zalo.gs` 🔌 | **`refreshZaloToken()`** (LockService + ghi đè CONFIG token mới — refresh DÙNG-1-LẦN), `installZaloRefreshTrigger` (20h), `_zaloGet`, `pullZaloDailyFollowers` |
| `gas/TikTokScrape.gs` (fallback) | `pullTiktokViaFirecrawl()` (opt-in `TIKTOK_SCRAPE_ENABLED='true'`, regex `/video/(\d+)`→`tt_<id>`), `installTiktokTrigger`. **Mặc định TẮT** — nguồn chính là yt-dlp (dưới). |
| `gas/Code.gs` | **doPost**: `log_content`, `log_decision`, **`tiktok_ingest`** (nhận `videos[]` từ Mac mini → upsert `tt_<id>`, gate REPORT_API_TOKEN). **doGet**: `roi_data`, `get_decisions_due`, `record_decision_result`, `ga4_pull`, `meta_pull`, `meta_health`, `gbp_pull`, `zalo_pull`, `tiktok_pull` (write actions trong `writeActions[]`) |
| `gas/SeedSheets.gs` | `seedInsightConfigKeys()` (tạo sẵn key CONFIG placeholder) |
| `gas/appsscript.json` | advanced service `AnalyticsData` v1beta + scopes `analytics.readonly` **+ `business.manage`** (cho GBP) |

### TikTok — kiến trúc yt-dlp (nguồn CHÍNH, FREE, không API key)
- **Chạy trên Mac mini** (`Mac-mini-cua-MInh`, máy 24/7 đã chạy print-server + dispatcher): `ops/tiktok_pull.sh`.
- Lệnh: `yt-dlp --skip-download --dump-json --playlist-end N <profile>` → `jq` chuẩn hoá (id/title/views/likes/comments/shares + **upload_date thật** YYYYMMDD→YYYY-MM-DD bằng cắt chuỗi) → POST `tiktok_ingest`.
- **Cron** (đang cài): `10 7 * * * /Users/dpd/Projects/lamha-kissaten/ops/tiktok_pull.sh` (crontab Mac mini, cạnh dòng dispatcher `*/2 * * * *`).
- Profile thật: **`https://www.tiktok.com/@mitsucafe83`** (KHÔNG phải @mitsucafe).
- Confidence **MED** (số + ngày thật), cao hơn Firecrawl-scrape (LOW).

### Web / Agent
- `web/dashboard.html` — panel `#content-log-panel` (tab Overview) → `apiPost('log_content')` cho nhập tay.
- `.claude/agents/cafe-insight.md` — subagent: khung 4 tầng + dự báo món + kiểm kho + ngôn ngữ dễ hiểu cho quản lý + ghi rõ nguồn gbp/zalo/tiktok.
- **Báo cáo MẪU (format đích)**: `docs/insight-reports/2026-06-20-SAMPLE.md`.

### Endpoints GAS (base `…/macros/s/AKfycbylzJo…/exec` = deployment data-API v62)
`roi_data`, `rfm_snapshot`, `menu_engineering_data`, `get_decisions_due`, `record_decision_result`, `ga4_pull`, `meta_pull`, `meta_health`, `gbp_pull`, `zalo_pull`, `tiktok_pull`, `log_content`(POST), `log_decision`(POST), `tiktok_ingest`(POST). **Gate bằng CONFIG.REPORT_API_TOKEN**.

---

## 3. LUỒNG DỮ LIỆU
```
[Web GA4] ──pullGa4Traffic──────────→ WEB_TRAFFIC ─────────┐
[FB/IG/Threads] ─pullMetaAll(page token)─→ MARKETING_LOG(auto) ┤
[TikTok] ─yt-dlp(Mac mini cron)→tiktok_ingest→ MARKETING_LOG(auto) ┤
[GBP] 🔌 ─pullGbpDaily──────────────→ GBP_DAILY ───────────┤
[Zalo] 🔌 ─pullZaloDailyFollowers───→ MARKETING_LOG(auto) ──┤
[Nhập tay] ─panel dashboard────────→ MARKETING_LOG(manual) ─┤
                                                            ▼
            getRoiData() {orders, promotions, marketing, web_traffic, gbp_daily, menu_costs}
                                                            ▼
            subagent cafe-insight (4 tầng) → báo cáo docs/insight-reports/ + DECISION_LOG
```

---

## 4. CONFIG KEYS (gõ THẲNG vào tab CONFIG trong Google Sheet — KHÔNG qua dashboard)
| Key | Dùng cho | Trạng thái |
|---|---|---|
| `REPORT_API_TOKEN` | gate mọi endpoint analytics | ✅ đã set |
| `GA4_PROPERTY_ID` | GA4 (SỐ, không phải G-xxx) | ✅ |
| `META_SYSTEM_TOKEN` | Meta FB/IG | ✅ token Graph Explorer 60 ngày (xem gotcha) |
| `META_PAGE_ID` `1170994919421423` / `META_IG_USER_ID` | Meta | ✅ |
| `THREADS_TOKEN` / `THREADS_USER_ID` | Threads (tuỳ chọn) | placeholder |
| `GBP_LOCATION_ID` | GBP (ID dạng SỐ) | ⏳ chờ duyệt API |
| `ZALO_APP_ID` / `ZALO_APP_SECRET` / `ZALO_REFRESH_TOKEN` | Zalo OA | ⏳ chờ token |
| `FIRECRAWL_API_KEY` / `TIKTOK_PROFILE_URL` / `TIKTOK_SCRAPE_ENABLED` | TikTok fallback Firecrawl | không cần (đã dùng yt-dlp) |

---

## 5. ⚠️ GOTCHA (bài học — đừng vấp lại)

**Deploy / hạ tầng GAS (mất nhiều giờ debug ở phiên này):**
1. **Có 3 deployment** của script (scriptId `1nIdKqCQWD-BYGxin50Zf6L0aH41gu402nhM5SqkoaNvWvb4zV4wWhk4q`):
   - `AKfycbyPDjPW…` = **@HEAD** (luôn = code mới nhất push) nhưng `/exec` **yêu cầu đăng nhập** → KHÔNG curl ẩn danh được.
   - `AKfycbylzJo…` = **data-API CHÍNH** (subagent + tiktok_pull.sh + dashboard dùng) — ẩn danh OK, **ghim version** (đang **v62**).
   - `AKfycbynDqbg…` = v61 (dispatcher dùng) — từng trả 404 Drive, **cần kiểm**.
2. **`clasp push` KHÔNG đủ** — chỉ cập nhật HEAD. URL versioned (`AKfycbylzJo`) phải **đổi version** mới phục vụ code mới: Manage deployments → Edit → chọn version, HOẶC API: tạo version (`POST .../versions`) rồi PUT `.../deployments/{id}` (xem §8).
3. **Google cache GET /exec**: GET cùng URL+params bị Google frontend cache → sau redeploy vẫn thấy response CŨ (tưởng deploy fail). **LUÔN thêm `--data-urlencode "_cb=$RANDOM"` khi test GET.**
4. **POST trả 302 → script.googleusercontent.com/macros/echo** là BÌNH THƯỜNG (= thành công, doPost đã ghi data). `curl -L` 1-bước hay rớt thành trang lỗi Drive → đọc kết quả bằng **2 bước**: lấy `%{redirect_url}` rồi GET sạch URL đó. (`ops/tiktok_pull.sh` đã làm đúng.)
5. **clasp v3.3.0 lỗi** `clasp deployments`/deploy ("Premature close") → bypass bằng curl thẳng `script.googleapis.com/v1/projects/{sid}/...` với access_token trong `~/.clasprc.json` (`jq '.. | .access_token?'`). **PUT deployments (retarget production) bị auto-mode chặn** → bước cuối phải người làm tay.

**API bên thứ ba:**
6. **Meta đọc Page/IG CẦN Page access token** (không phải user token) → `_getPageToken()`. Placeholder `<...>` coi là chưa-set (`_cfg`). Token Meta hiện 60 ngày (Graph Explorer) → cần **Xác minh doanh nghiệp** để đổi System User token vĩnh viễn.
7. **GA4 dimension** đúng: `sessionCampaignName` (không `sessionCampaign`), `landingPage` (không `landingPagePlusQueryString`). Lỗi *"conversions is not a valid metric"* → đổi `conversions`→`keyEvents`. GA4 từ GAS không cần token (mượn quyền owner) nhưng cần bật advanced service + enable Analytics Data API + owner là Viewer property.
8. **yt-dlp warn "impersonation no target"** = vô hại (vẫn lấy đủ video). Triệt để: `pipx inject yt-dlp curl-cffi` hoặc `brew install yt-dlp` (bundle curl_cffi).

**Dữ liệu:**
9. **MARKETING_LOG cập-nhật-tại-chỗ OK** (khác ORDERS append-only). Row manual có `external_post_id` rỗng → auto-pull KHÔNG đè → **rủi ro trùng**: 1 video TikTok vừa nhập tay vừa yt-dlp tự kéo = 2 dòng. Chủ quán nên xoá dòng manual cũ. Subagent nên ưu tiên dòng auto (`tt_<id>`).
10. **GAS không có test-runner local** → verify = chạy hàm trong editor + kiểm Sheet, hoặc curl. Sửa `.gs` phải `clasp push` + redeploy.

---

## 6. PLAN P3 — Phone-match attribution + Incrementality (CHƯA code)

**Mục tiêu:** trả lời "đơn này do tương tác social nào?" cho khách ĐÃ định danh, và "post có thật sự làm tăng đơn không?" (nhân-quả, không chỉ tương quan).

**⚠️ Giới hạn cốt lõi:** Meta API **KHÔNG BAO GIỜ** trả SĐT người tương tác organic. Phone-match chỉ chạy khi có **bảng ánh xạ social-id ↔ SĐT**. Không bịa ghi công cho khách vãng lai → xếp `unattributed`.

**Task P3:**
- [ ] **T1 — Mở rộng CUSTOMERS:** thêm cột `fb_psid`, `ig_igsid` (append cuối; `RFM.gs` đọc theo tên header nên an toàn). Migrate idempotent giống `migrateMarketingLogP1`.
- [ ] **T2 — Luồng bắt mapping social-id↔SĐT:** (chọn 1+){ chatbot Fanpage/IG hỏi SĐT tích điểm khi khách nhắn; QR order nhập SĐT; link Zalo }. Ghi `fb_psid`/`ig_igsid` vào CUSTOMERS khi có.
- [ ] **T3 — Module attribution phone-match:** trong subagent (hoặc hàm GAS) ghép `order` → tương tác social qua cùng SĐT, cửa sổ **7 ngày**, CHỈ cho khách có social-id link. Phần dư = `unattributed`. Kết hợp UTM last-click (72h) đã có.
- [ ] **T4 — Incrementality:** so **tuần CÓ post vs tuần KHÔNG post** (before/after + holdout nhẹ) → đo lift nhân-quả, tách khỏi tương quan. Bổ sung vào subagent **Module 6** (Incrementality & Forecast). Cần ≥ vài tuần data MARKETING_LOG + ORDERS.
- [ ] **T5 — DECISION_LOG review loop +14d:** đã có hàm (`getDecisionsDue`/`recordDecisionResult`); nối vào subagent để tự đối chiếu quyết định cũ với kết quả thật.

**Phụ thuộc:** cần data tích luỹ (P1/P2/P2.5 đang log). Làm được ngay phần T1 (schema) + T2 (luồng); T3/T4 cần đủ data.

---

## 7. PLAN P4 — MMM (Marketing Mix Modeling) — TƯƠNG LAI XA

**Mục tiêu:** trả lời "chia ngân sách + công sức cho kênh nào" ở mức tổng (không cần định danh khách).

**Điều kiện:** cần **~2 năm dữ liệu TUẦN** (cost từ MARKETING_LOG, revenue từ ORDERS, biến ngoại: lễ/mưa đèo/payday/mùa). Quán mới mở → **chưa đủ data**.

**Nhiệm vụ HIỆN TẠI = chỉ LOG đủ** (P1/P2/P2.5 đã đảm bảo cost + engagement + revenue được ghi hằng ngày/tuần). KHÔNG code MMM bây giờ.

**Task P4 (khi đủ ~2 năm data):**
- [ ] Export MARKETING_LOG + ORDERS → dữ liệu tuần (cost/kênh, revenue, biến ngoại).
- [ ] Chạy 1 trong các tool FREE: **Meta Robyn** (R), **Google Meridian** (Python), **PyMC-Marketing** (Python). Chạy offline, không cần nhét vào GAS.
- [ ] Đưa kết luận phân bổ ngân sách vào báo cáo subagent (mức chiến lược quý/năm).

---

## 8. KÍCH HOẠT KÊNH ĐANG TẮT (khi chủ quán có credential)

### GBP/Maps (chờ GBP verified 60+ ngày + đơn API duyệt — dự kiến ~tháng 8/2026)
1. Nộp [đơn xin quyền GBP API](https://support.google.com/business/contact/api_default) → "Application for Basic API Access" (cần Project Number của GCP project ĐÃ LIÊN KẾT với Apps Script). Theo dõi quota: Cloud Console → IAM & Admin → Quotas → Business Profile API (0=chưa duyệt, 300 QPM=duyệt).
2. **Liên kết Apps Script ↔ GCP project đã duyệt** (Project Settings → Change GCP project).
3. Set CONFIG `GBP_LOCATION_ID` (ID dạng SỐ).
4. Apps Script editor: `initGbpDaily()` → `installGbpDailyTrigger()`. Verify `pullGbpDaily('2026-08-01','2026-08-07')`.

### Zalo OA (chờ OA token)
1. Lấy `App ID` + `App Secret` + `Refresh Token` (developers.zalo.me, app gắn OA của quán).
2. Set CONFIG `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_REFRESH_TOKEN`.
3. Apps Script editor: `refreshZaloToken()` (tự ghi `ZALO_OA_TOKEN` + xoay refresh) → `installZaloRefreshTrigger()`. Verify `pullZaloDailyFollowers()`.

### Ops chung (1 lần)
- Apps Script editor: `installMetaPullTrigger()` · `installMetaHealthTrigger()` · `installGa4DailyTrigger()` (để Meta/GA4 tự kéo hằng ngày — nếu chưa cài).
- **Nối đường đọc INVENTORY cho subagent** (bước dự báo-kho): hiện chỉ qua `action=admin_data` (cần session token). Đề xuất: thêm endpoint GET `inventory_snapshot` gate REPORT_API_TOKEN trả `[{ingredient_id, current_stock, min_stock, unit}]`.
- **Kiểm dispatcher**: URL trong `ops/dispatcher.sh` (`AKfycbynDqbg…`) từng trả 404 → xác nhận luồng dashboard-chat→/inbox còn chạy.

---

## 9. QUY TRÌNH DEPLOY/VERIFY (mọi thay đổi GAS — ĐỌC KỸ §5)
1. Sửa `.gs` → `cd gas && clasp push` (cập nhật HEAD).
2. **Redeploy version cho deployment data-API** `AKfycbylzJo…` (KHÔNG bỏ qua):
   - **Editor:** Deploy → Manage deployments → ✏️ Edit bản data-API → Version: **New version** → Deploy (giữ URL).
   - **API (nếu editor bất tiện):** `POST script.googleapis.com/v1/projects/{sid}/versions` lấy versionNumber → `PUT .../deployments/{deploymentId}` với `deploymentConfig{scriptId,versionNumber,manifestFileName:"appsscript"}`. (PUT có thể bị auto-mode chặn nếu chạy qua agent → người làm tay.)
3. Verify: `curl -sS -G "<BASE>" --data-urlencode action=… --data-urlencode token=<REPORT_API_TOKEN> --data-urlencode "_cb=$RANDOM"` (nhớ `_cb` bust cache; url-encode token). POST: lấy `%{redirect_url}` rồi GET.
4. Web (`web/*`) deploy qua CI khi push origin main.

## 10. TÀI LIỆU GỐC
- Spec thiết kế: `docs/superpowers/specs/2026-06-20-cafe-insight-subagent-design.md`
- Plan P1: `docs/superpowers/plans/2026-06-20-cafe-insight-p1.md`
- Plan P2 (GA4+Meta+Threads): `docs/superpowers/plans/2026-06-20-cafe-insight-p2.md`
- Plan P2.5 (GBP+Zalo+TikTok, kèm Part C′ yt-dlp): `docs/superpowers/plans/2026-06-20-cafe-insight-p2.5.md`
- Báo cáo mẫu: `docs/insight-reports/2026-06-20-SAMPLE.md`
- Subagent: `.claude/agents/cafe-insight.md`
- CLAUDE.md + `docs/system/*` (schema chi tiết).

---
*Handoff cafe-insight · cập nhật 2026-06-20 cuối phiên · P1+P2+P2.5(TikTok) DONE & verified runtime · GBP/Zalo code-xong-tắt-chờ-credential · P3/P4 có plan hành động.*
