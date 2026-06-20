# cafe-insight P2.5 (Kênh gated: GBP/Maps + Zalo OA + TikTok) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps dùng checkbox (`- [ ]`).

**Goal:** Tự động hoá 3 kênh còn lại mà P2 hoãn — Google Business Profile/Maps (khách địa phương), Zalo OA (CSKH/broadcast), TikTok — mỗi kênh có rào cản riêng (duyệt/token/scrape).

**Architecture:** 3 phần ĐỘC LẬP, ship được riêng. GBP → tab `GBP_DAILY` + `business.manage` scope (quyền Google owner, KHÔNG token bên thứ ba). Zalo → infra auto-refresh token (25h, refresh dùng-1-lần; dùng `setConfig` đã có sẵn). TikTok → scrape công khai qua Firecrawl (opt-in, có fallback nhập tay). Tất cả đổ về cấu trúc P1/P2 (`MARKETING_LOG`/`getRoiData`) để subagent `cafe-insight` dùng.

**Tech Stack:** Apps Script (V8) · GBP Performance API (`businessprofileperformance.googleapis.com/v1`) · Zalo OA OAuth v4 · Firecrawl `/v2/scrape` · Sheets · `ScriptApp.getOAuthToken()` (GBP) · LockService (Zalo).

> **Môi trường:** không test-runner local; verify = chạy hàm editor + curl. Sửa `.gs`/`appsscript.json` → `clasp push` + redeploy. Token/key đọc từ CONFIG.

**Tiền đề:** P1 + P2 đã merge (`MARKETING_LOG` 25 cột với `external_post_id`, `upsertMarketingByExternalId`, `getRoiData`, `cafe-insight`).
**Quan hệ:** đây là nhánh "kênh gated", song song P2 (GA4+Meta). Làm sau / song song P2 đều được.

---

## ⚠️ PREREQUISITE (làm NGAY — lead time dài): nộp đơn xin quyền GBP API

GBP API **không mở mặc định** (quota = 0). Phải nộp đơn, **duyệt mất vài ngày–vài tuần** → nộp trước, code Part A sau khi được duyệt.

**Các bước user làm (1 lần):**
1. Tạo/ chọn 1 **Google Cloud project** (cùng tài khoản Google sở hữu GBP + Apps Script). Ghi lại **Project Number**.
2. Bật **"Business Profile API"** (và "Business Profile Performance API") trong Cloud Console → APIs & Services → Library.
3. Vào [form xin quyền GBP API](https://support.google.com/business/contact/api_default) → chọn **"Application for Basic API Access"** → điền Project Number, business use case ("đo lượt xem/gọi/chỉ đường Maps cho quán để tối ưu marketing"), website, scope `business.manage`.
4. Điều kiện: GBP đã **verified + hoạt động 60+ ngày**, email nộp là **owner/manager** của GBP.
5. Kiểm duyệt: Cloud Console → IAM & Admin → Quotas → Business Profile API. **Quota 0 = chưa duyệt; 300 QPM = đã duyệt.** Khi thành 300 → làm Part A.

---

# PART A — Google Business Profile / Maps (sau khi được duyệt)

## Task A1: Scope business.manage + CONFIG

**Files:** Modify `gas/appsscript.json`

- [ ] **Step 1: Thêm scope** vào mảng `oauthScopes`:
```json
    "https://www.googleapis.com/auth/business.manage"
```
(thêm 1 dòng, giữ nguyên các scope khác.)

- [ ] **Step 2: CONFIG key** — user set `GBP_LOCATION_ID` = ID dạng số của location (lấy từ GBP API `accounts.locations` hoặc URL quản lý; KHÔNG kèm tiền tố `locations/`).

- [ ] **Step 3: Commit**
```bash
git add gas/appsscript.json && git commit -m "feat(insight): add business.manage scope for GBP (P2.5)"
```

## Task A2: GbpPerf.gs — tab GBP_DAILY + pull

**Files:** Create `gas/GbpPerf.gs`

- [ ] **Step 1: Tạo `gas/GbpPerf.gs`**
```javascript
/**
 * GbpPerf.gs — kéo metric Google Business Profile / Maps vào tab GBP_DAILY.
 * Dùng quyền Google của script owner (ScriptApp.getOAuthToken) + scope business.manage.
 * CẦN: GBP API đã được Google duyệt (quota>0) + CONFIG.GBP_LOCATION_ID (số).
 */
var GBP_DAILY_HEADERS = [
  'date', 'impr_maps', 'impr_search', 'calls', 'website_clicks', 'directions', 'pulled_at'
];
var GBP_PERF_API = 'https://businessprofileperformance.googleapis.com/v1';

function _gbpDailySheet() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('GBP_DAILY'); }

function initGbpDaily() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName('GBP_DAILY')) { Logger.log('GBP_DAILY exists.'); return; }
  var sheet = ss.insertSheet('GBP_DAILY');
  sheet.appendRow(GBP_DAILY_HEADERS);
  sheet.getRange(1, 1, 1, GBP_DAILY_HEADERS.length)
    .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

/** {year,month,day} → 'yyyy-MM-dd'. */
function _gbpDate(d) {
  return d.year + '-' + ('0' + d.month).slice(-2) + '-' + ('0' + d.day).slice(-2);
}

/**
 * Kéo metric GBP cho [from,to] (string 'yyyy-MM-dd') → upsert GBP_DAILY (1 dòng/ngày).
 * @return {number} số ngày ghi
 */
function pullGbpDaily(from, to) {
  var loc = getConfig('GBP_LOCATION_ID');
  if (!loc) throw new Error('CONFIG.GBP_LOCATION_ID chưa set.');
  initGbpDaily();
  var fp = from.split('-'), tp = to.split('-');
  var metrics = ['BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
    'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
    'CALL_CLICKS', 'WEBSITE_CLICKS', 'BUSINESS_DIRECTION_REQUESTS'];
  var url = GBP_PERF_API + '/locations/' + loc + ':fetchMultiDailyMetricsTimeSeries'
    + '?' + metrics.map(function (m) { return 'dailyMetrics=' + m; }).join('&')
    + '&dailyRange.startDate.year=' + fp[0] + '&dailyRange.startDate.month=' + Number(fp[1]) + '&dailyRange.startDate.day=' + Number(fp[2])
    + '&dailyRange.endDate.year=' + tp[0] + '&dailyRange.endDate.month=' + Number(tp[1]) + '&dailyRange.endDate.day=' + Number(tp[2]);
  var resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    logError('gbp.fetch', new Error('HTTP ' + resp.getResponseCode() + ' ' + resp.getContentText().slice(0, 200)));
    return 0;
  }
  var body = JSON.parse(resp.getContentText());
  // gom theo ngày: { 'yyyy-MM-dd': { metric: value } }
  var byDate = {};
  var series = (body.multiDailyMetricTimeSeries || []);
  for (var i = 0; i < series.length; i++) {
    var arr = series[i].dailyMetricTimeSeries || [];
    for (var j = 0; j < arr.length; j++) {
      var metric = arr[j].dailyMetric;
      var dv = (arr[j].timeSeries && arr[j].timeSeries.datedValues) || [];
      for (var k = 0; k < dv.length; k++) {
        var d = _gbpDate(dv[k].date);
        byDate[d] = byDate[d] || {};
        byDate[d][metric] = Number(dv[k].value) || 0;
      }
    }
  }
  // upsert từng ngày vào GBP_DAILY
  var sheet = _gbpDailySheet();
  var existing = sheet.getLastRow() >= 2 ? sheet.getDataRange().getValues() : [GBP_DAILY_HEADERS];
  var rowByDate = {};
  for (var r = 1; r < existing.length; r++) rowByDate[_asDateStr(existing[r][0])] = r + 1;
  var now = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm');
  var n = 0;
  for (var date in byDate) {
    var m = byDate[date];
    var row = [date,
      (m.BUSINESS_IMPRESSIONS_DESKTOP_MAPS || 0) + (m.BUSINESS_IMPRESSIONS_MOBILE_MAPS || 0),
      (m.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH || 0) + (m.BUSINESS_IMPRESSIONS_MOBILE_SEARCH || 0),
      m.CALL_CLICKS || 0, m.WEBSITE_CLICKS || 0, m.BUSINESS_DIRECTION_REQUESTS || 0, now];
    if (rowByDate[date]) sheet.getRange(rowByDate[date], 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
    n++;
  }
  Logger.log('pullGbpDaily ' + from + '..' + to + ' → ' + n + ' days');
  return n;
}

/** Đọc GBP_DAILY [from,to] cho getRoiData/subagent. */
function getGbpDaily(from, to) {
  var sheet = _gbpDailySheet();
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getDataRange().getValues(), out = [];
  for (var i = 1; i < data.length; i++) {
    var date = _asDateStr(data[i][0]);
    if (from && date < from) continue; if (to && date > to) continue;
    out.push({ date: date, impr_maps: Number(data[i][1]) || 0, impr_search: Number(data[i][2]) || 0,
      calls: Number(data[i][3]) || 0, website_clicks: Number(data[i][4]) || 0, directions: Number(data[i][5]) || 0 });
  }
  return out;
}

/** Trigger hằng ngày: pull 4 ngày gần nhất (GBP chốt số trễ ~3 ngày). */
function pullGbpRecent() {
  var tz = 'Asia/Ho_Chi_Minh';
  var to = Utilities.formatDate(new Date(Date.now() - 1 * 86400000), tz, 'yyyy-MM-dd');
  var from = Utilities.formatDate(new Date(Date.now() - 4 * 86400000), tz, 'yyyy-MM-dd');
  return pullGbpDaily(from, to);
}
function installGbpDailyTrigger() {
  var t = ScriptApp.getProjectTriggers();
  for (var i = 0; i < t.length; i++) if (t[i].getHandlerFunction() === 'pullGbpRecent') ScriptApp.deleteTrigger(t[i]);
  ScriptApp.newTrigger('pullGbpRecent').timeBased().everyDays(1).atHour(6).nearMinute(30).create();
}
```

- [ ] **Step 2: Verify (sau khi GBP API đã duyệt + GBP_LOCATION_ID set)**

Editor: `initGbpDaily` → tab 7 cột. Chạy `function _tg(){ Logger.log(pullGbpDaily('2026-06-01','2026-06-15')); }`.
Expected: GBP_DAILY có dòng/ngày với calls/website_clicks/directions. Nếu HTTP 403 → GBP API **chưa được duyệt** (xem Prerequisite). Nếu 404 → sai `GBP_LOCATION_ID`. Xoá hàm tạm.

- [ ] **Step 3: Commit**
```bash
git add gas/GbpPerf.gs && git commit -m "feat(insight): GBP_DAILY tab + GBP Performance pull + trigger (P2.5)"
```

## Task A3: getRoiData + doGet route GBP

**Files:** Modify `gas/Marketing.gs`, `gas/Code.gs`

- [ ] **Step 1: `getRoiData` return thêm** `gbp_daily: getGbpDaily(from, to),` (sau `web_traffic`).
- [ ] **Step 2: `gas/Code.gs`** — thêm `'gbp_pull'` vào `writeActions[]` + route doGet:
```javascript
    if (action === 'gbp_pull') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var gTo = e.parameter.to || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      var gFrom = e.parameter.from || Utilities.formatDate(new Date(Date.now() - 7 * 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      return _jsonResponse({ ok: true, days: pullGbpDaily(gFrom, gTo) });
    }
```
- [ ] **Step 3: Verify** `curl -sLG "<BASE>" --data-urlencode action=gbp_pull --data-urlencode token=<TOKEN>` → `{"ok":true,"days":N}`; roi_data có key `gbp_daily`.
- [ ] **Step 4: Commit**
```bash
git add gas/Marketing.gs gas/Code.gs && git commit -m "feat(insight): gbp_daily in getRoiData + gbp_pull route (P2.5)"
```

---

# PART B — Zalo OA (auto-refresh token + best-effort stats)

> **Đối soát research:** access token Zalo OA ~25h; **refresh token DÙNG 1 LẦN** (mỗi refresh trả refresh_token MỚI, hạn 3 tháng) → phải ghi đè CONFIG mỗi lần + khoá tránh đua. Endpoint refresh `POST oauth.zaloapp.com/v4/oa/access_token`. ⚠️ Metric per-broadcast (đã đọc/click) qua API **hạn chế/không rõ tài liệu công khai** → Part B tập trung **hạ tầng token (tái dùng) + pull best-effort**, granular có thể vẫn phải xem dashboard.

> **setConfig đã có sẵn — KHÔNG cần viết.** `setConfig(key, value)` tồn tại ở `gas/Utils.gs:18` (key cột A / value cột B, append nếu chưa có, tự `_CONFIG_CACHE = null` để invalidate cache). Zalo refresh dùng trực tiếp. Khoá chống đua đặt ở `refreshZaloToken` mức tổng (bọc cả 2 lần `setConfig`) → đủ an toàn cho refresh-token dùng-1-lần.

## Task B1: Zalo.gs — auto-refresh token + trigger

**Files:** Create `gas/Zalo.gs`. CONFIG cần: `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_REFRESH_TOKEN` (seed lần đầu từ Zalo OA console). `ZALO_OA_TOKEN` (access token) do hàm này tự ghi.

- [ ] **Step 1: Tạo `gas/Zalo.gs`**
```javascript
/**
 * Zalo.gs — tự xoay OA access token (hạn ~25h) bằng refresh token (dùng-1-lần).
 * Mỗi refresh ghi đè CONFIG.ZALO_OA_TOKEN + CONFIG.ZALO_REFRESH_TOKEN (token mới).
 */
var ZALO_OAUTH = 'https://oauth.zaloapp.com/v4/oa/access_token';

/** Gọi refresh, lưu token mới. Có lock tránh 2 tiến trình refresh cùng lúc (mất chuỗi token). */
function refreshZaloToken() {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var refresh = getConfig('ZALO_REFRESH_TOKEN');
    var appId = getConfig('ZALO_APP_ID');
    var secret = getConfig('ZALO_APP_SECRET');
    if (!refresh || !appId || !secret) { logError('zalo.refresh', new Error('thiếu CONFIG ZALO_*')); return null; }
    var resp = UrlFetchApp.fetch(ZALO_OAUTH, {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      headers: { secret_key: secret },
      payload: { refresh_token: refresh, app_id: appId, grant_type: 'refresh_token' },
      muteHttpExceptions: true
    });
    var body; try { body = JSON.parse(resp.getContentText()); } catch (e) { body = null; }
    if (!body || !body.access_token) {
      logError('zalo.refresh', new Error('refresh fail: ' + resp.getContentText().slice(0, 200)));
      try { sendTelegramAlert('⚠️ Zalo OA refresh token LỖI — cần lấy lại refresh_token từ Zalo OA console → CONFIG.ZALO_REFRESH_TOKEN'); } catch (e2) {}
      return null;
    }
    setConfig('ZALO_OA_TOKEN', body.access_token);
    if (body.refresh_token) setConfig('ZALO_REFRESH_TOKEN', body.refresh_token); // token mới, ghi đè
    Logger.log('Zalo token refreshed; expires_in=' + body.expires_in);
    return body.access_token;
  } finally { lock.releaseLock(); }
}

/** Trigger refresh mỗi 20h (an toàn trước hạn ~25h). */
function installZaloRefreshTrigger() {
  var t = ScriptApp.getProjectTriggers();
  for (var i = 0; i < t.length; i++) if (t[i].getHandlerFunction() === 'refreshZaloToken') ScriptApp.deleteTrigger(t[i]);
  ScriptApp.newTrigger('refreshZaloToken').timeBased().everyHours(20).create();
}
```

- [ ] **Step 2: Verify (cần ZALO_* seed thật)** — editor: `refreshZaloToken()` → trả access token; CONFIG.ZALO_OA_TOKEN + ZALO_REFRESH_TOKEN cập nhật giá trị mới. Chạy lại lần 2 vẫn OK (vì đã lưu refresh mới). Nếu fail → kiểm seed refresh token còn hạn (3 tháng) + app secret.

- [ ] **Step 3: Commit**
```bash
git add gas/Zalo.gs && git commit -m "feat(insight): Zalo OA auto-refresh token infra + trigger (P2.5)"
```

## Task B2: Zalo best-effort stats (followers) + degrade-honest

**Files:** Modify `gas/Zalo.gs`

- [ ] **Step 1: Thêm pull số follower (endpoint OA chắc chắn có) + ghi MARKETING_LOG**
```javascript
var ZALO_OPENAPI = 'https://openapi.zalo.me/v2.0/oa';

/** GET Zalo OA API với access token hiện tại. Trả object hoặc null. */
function _zaloGet(path, params) {
  var token = getConfig('ZALO_OA_TOKEN');
  if (!token) { refreshZaloToken(); token = getConfig('ZALO_OA_TOKEN'); }
  if (!token) return null;
  params = params || {};
  var qs = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  var resp = UrlFetchApp.fetch(ZALO_OPENAPI + path + (qs ? '?' + qs : ''), {
    headers: { access_token: token }, muteHttpExceptions: true
  });
  var body; try { body = JSON.parse(resp.getContentText()); } catch (e) { return null; }
  if (body && body.error && body.error !== 0) {
    // token có thể hết hạn → refresh 1 lần rồi thử lại
    if (refreshZaloToken()) {
      resp = UrlFetchApp.fetch(ZALO_OPENAPI + path + (qs ? '?' + qs : ''),
        { headers: { access_token: getConfig('ZALO_OA_TOKEN') }, muteHttpExceptions: true });
      try { body = JSON.parse(resp.getContentText()); } catch (e) { body = null; }
    }
  }
  return body;
}

/**
 * Best-effort: ghi 1 dòng MARKETING_LOG/ngày cho Zalo OA (reach = follower count).
 * ⚠️ Per-broadcast open/click qua API Zalo hạn chế — phần đó có thể giữ thủ công.
 * @return {boolean}
 */
function pullZaloDailyFollowers() {
  var info = _zaloGet('/getoa', {});
  if (!info || !info.data) return false;
  var followers = Number(info.data.num_follower || info.data.follower || 0);
  var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  upsertMarketingByExternalId('zalo_followers_' + today, {
    platform: 'zalo', type: 'event', title: 'Zalo OA followers',
    date: today, reach: followers, format: 'text'
  });
  Logger.log('Zalo followers=' + followers);
  return true;
}
```
> **Note thành thật:** `/getoa` trả thông tin OA gồm follower. Endpoint thống kê broadcast chi tiết (đã gửi/đọc/click) của Zalo **không ổn định qua API công khai** → Step này chỉ chốt follower; broadcast-level để cân nhắc P3 hoặc nhập tay. Implementer **verify field thật** `num_follower` vs `follower` bằng log response.

- [ ] **Step 2: Verify** — editor `pullZaloDailyFollowers()` → MARKETING_LOG có dòng `platform=zalo, reach=<followers>`. Log response để xác nhận tên field follower. Xoá dòng test nếu sai field rồi sửa.

- [ ] **Step 3: Commit**
```bash
git add gas/Zalo.gs && git commit -m "feat(insight): Zalo follower pull (best-effort) → MARKETING_LOG (P2.5)"
```

---

# PART C — TikTok qua Firecrawl (opt-in, fragile)

> **⚠️ CAVEAT BẮT BUỘC ĐỌC:** scrape profile công khai TikTok có thể **vi phạm ToS TikTok**, **dễ gãy** khi TikTok đổi layout/chặn bot, và Firecrawl **tốn phí + có thể trả rỗng** (TikTok chặn mạnh). Vì vậy Part C **opt-in** (cờ `TIKTOK_SCRAPE_ENABLED=true`), luôn có **fallback nhập tay** (panel P1), và subagent phải gắn `confidence=LOW` cho data tiktok-auto. Cân nhắc kỹ trước khi bật.

## Task C1: TikTokScrape.gs — Firecrawl pull

**Files:** Create `gas/TikTokScrape.gs`. CONFIG: `FIRECRAWL_API_KEY`, `TIKTOK_PROFILE_URL` (vd `https://www.tiktok.com/@mitsucafe`), `TIKTOK_SCRAPE_ENABLED`.

- [ ] **Step 1: Tạo `gas/TikTokScrape.gs`**
```javascript
/**
 * TikTokScrape.gs — kéo video gần nhất từ profile TikTok công khai qua Firecrawl /v2/scrape (json extract).
 * OPT-IN: chỉ chạy khi CONFIG.TIKTOK_SCRAPE_ENABLED='true'. Có fallback nhập tay (panel P1).
 */
var FIRECRAWL_SCRAPE = 'https://api.firecrawl.dev/v2/scrape';

/**
 * @return {number} số video upsert (0 nếu tắt/lỗi/rỗng → tự về nhập tay)
 */
function pullTiktokViaFirecrawl() {
  if (getConfig('TIKTOK_SCRAPE_ENABLED') !== 'true') { Logger.log('TikTok scrape disabled.'); return 0; }
  var key = getConfig('FIRECRAWL_API_KEY');
  var profile = getConfig('TIKTOK_PROFILE_URL');
  if (!key || !profile) return 0;

  var payload = {
    url: profile,
    onlyMainContent: true,
    waitFor: 4000,
    formats: [{
      type: 'json',
      schema: {
        type: 'object',
        properties: {
          videos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                video_url: { type: 'string' }, caption: { type: 'string' },
                views: { type: 'number' }, likes: { type: 'number' },
                comments: { type: 'number' }, shares: { type: 'number' }
              }
            }
          }
        }
      }
    }]
  };
  var resp = UrlFetchApp.fetch(FIRECRAWL_SCRAPE, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var body; try { body = JSON.parse(resp.getContentText()); } catch (e) { body = null; }
  var vids = body && body.data && body.data.json && body.data.json.videos;
  if (!vids || !vids.length) {
    logError('tiktok.scrape', new Error('Firecrawl trả rỗng (TikTok có thể chặn). HTTP ' + resp.getResponseCode()));
    return 0; // không có data → fallback nhập tay
  }
  var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  var n = 0;
  for (var i = 0; i < vids.length; i++) {
    var v = vids[i];
    var rawUrl = v.video_url || '';
    // Bóc ID SỐ ổn định của video (vd .../@mitsucafe/video/7382910392?is_copy_url=1 → 7382910392)
    // → khoá đối soát cố định, tránh trùng dòng khi URL đổi (tương đối/tuyệt đối/kèm tham số chia sẻ).
    var match = rawUrl.match(/\/video\/(\d+)/);
    var videoId = match ? match[1] : rawUrl.replace(/[^a-zA-Z0-9]/g, '');
    if (!videoId) continue;
    upsertMarketingByExternalId('tt_' + videoId, {
      platform: 'tiktok', type: 'post', format: 'reel',
      title: (v.caption || '').slice(0, 80), date: today, // scrape không có ngày đăng chuẩn → ngày kéo
      views: Number(v.views) || 0, likes: Number(v.likes) || 0,
      comments: Number(v.comments) || 0, shares: Number(v.shares) || 0
    });
    n++;
  }
  Logger.log('pullTiktokViaFirecrawl → ' + n + ' videos');
  return n;
}

/** Trigger hằng ngày (chỉ chạy nếu enabled). */
function installTiktokTrigger() {
  var t = ScriptApp.getProjectTriggers();
  for (var i = 0; i < t.length; i++) if (t[i].getHandlerFunction() === 'pullTiktokViaFirecrawl') ScriptApp.deleteTrigger(t[i]);
  ScriptApp.newTrigger('pullTiktokViaFirecrawl').timeBased().everyDays(1).atHour(7).create();
}
```
> **Note (đã đối soát docs Firecrawl v2):** dạng `formats: [{type:'json', schema}]` là đúng theo api-reference v2 hiện hành (KHÔNG có field `jsonOptions` riêng — đó là dạng v1 cũ). Đường dẫn kết quả kỳ vọng `data.json.videos`. **Verify lần đầu** bằng log `resp.getContentText()`: nếu Firecrawl trả `400` thì thử dạng v1 cũ `formats:['json'] + jsonOptions:{schema}` và đọc `data.json`/`data.extract` (API Firecrawl từng đổi shape giữa version). `date` để ngày kéo vì scrape khó lấy ngày đăng chuẩn → subagent đừng dùng tiktok-auto cho phân tích theo-ngày chính xác.

- [ ] **Step 2: Verify (cần FIRECRAWL_API_KEY + bật cờ)** — editor `pullTiktokViaFirecrawl()`. Nếu trả >0 và MARKETING_LOG có dòng tiktok-auto → OK. Nếu 0/rỗng → TikTok chặn, **chấp nhận fallback nhập tay** (không coi là fail kiến trúc). Log response để chỉnh đường dẫn `data.json.videos` nếu Firecrawl bọc khác.

- [ ] **Step 3: Commit**
```bash
git add gas/TikTokScrape.gs && git commit -m "feat(insight): TikTok via Firecrawl scrape (opt-in, fallback manual) (P2.5)"
```

---

# PART D — Wiring subagent + routes

## Task D1: doGet routes zalo_pull + tiktok_pull + cafe-insight update

**Files:** Modify `gas/Code.gs`, `.claude/agents/cafe-insight.md`

- [ ] **Step 1: `gas/Code.gs`** — thêm `'zalo_pull'`, `'tiktok_pull'` vào `writeActions[]` + routes:
```javascript
    if (action === 'zalo_pull') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      return _jsonResponse({ ok: pullZaloDailyFollowers() });
    }
    if (action === 'tiktok_pull') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      return _jsonResponse({ ok: true, videos: pullTiktokViaFirecrawl() });
    }
```

- [ ] **Step 2: `.claude/agents/cafe-insight.md`** — trong "Nguồn dữ liệu" thêm:
```markdown
- GBP/Maps: `roi_data` kèm `gbp_daily[]` = ngày × (impr_maps, impr_search, calls, website_clicks, directions). Đây là tín hiệu **khách địa phương/vãng lai** (Maps views → ghé quán); dùng để đo kênh Maps ngoài web/social.
- Zalo: dòng MARKETING_LOG `platform=zalo` (reach=follower); broadcast chi tiết có thể vẫn nhập tay.
- TikTok auto (nếu bật scrape): `platform=tiktok, data_source=auto` — **GẮN confidence=LOW** (scrape không chuẩn ngày + có thể thiếu), ưu tiên số nhập tay khi có.
```

- [ ] **Step 3: Verify** — `curl` 2 route trả JSON; đọc lại agent md frontmatter nguyên vẹn.

- [ ] **Step 4: Commit**
```bash
git add gas/Code.gs .claude/agents/cafe-insight.md && git commit -m "feat(insight): zalo_pull/tiktok_pull routes + subagent gbp/zalo/tiktok wiring (P2.5)"
```

---

## Self-Review (đã chạy)

- **Spec coverage:** GBP→A1-A3 (sau prereq duyệt); Zalo refresh infra→B1 (dùng `setConfig` có sẵn ở Utils.gs:18), best-effort stats→B2; TikTok scrape opt-in→C1; wiring/routes→D1. Khớp lộ trình P2.5 trong P2 appendix.
- **Placeholder scan:** không TBD; code đầy đủ. 3 chỗ "verify field thật" (GBP location, Zalo follower field, Firecrawl json path) là đặc thù API bên thứ ba — đã nêu rõ bước log-để-xác-nhận, không phải placeholder.
- **Type consistency:** `getGbpDaily` (A2) dùng A3+D1; `refreshZaloToken`/`_zaloGet` (B1/B2) khớp + dùng `setConfig` có sẵn; `upsertMarketingByExternalId` (P2) dùng B2/C1 với field khớp `logMarketingActivity`. (`setConfig` KHÔNG viết lại — đã tồn tại.)
- **Phụ thuộc:** A độc lập (chỉ cần GBP duyệt); Zalo B1 trước B2; C1 độc lập (cần Firecrawl key). Mỗi Part ship riêng được.
- **Rủi ro đã ghi rõ:** GBP cổng duyệt (prereq) · Zalo per-broadcast API hạn chế (best-effort) · TikTok ToS/fragile (opt-in + fallback). KHÔNG che giấu.
- **Việc tay user:** nộp đơn GBP (lead time); set CONFIG (`GBP_LOCATION_ID`; `ZALO_APP_ID/APP_SECRET/REFRESH_TOKEN`; `FIRECRAWL_API_KEY/TIKTOK_PROFILE_URL/TIKTOK_SCRAPE_ENABLED`); chạy init/install trigger; `clasp push`+redeploy.
