# cafe-insight P2 (Auto pull: GA4 + Meta FB/IG) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tự động kéo số liệu web (GA4: traffic + nguồn + vị trí) và mạng xã hội (Meta FB/IG: engagement từng post) vào hệ thống, để subagent `cafe-insight` phân tích mà không cần nhập tay 3 kênh (web/FB/IG).

**Architecture:** GA4 đổ vào tab mới `WEB_TRAFFIC` (grain ngày×trang×nguồn×city) + khối `web_traffic` trong `getRoiData()`. Meta đổ vào `MARKETING_LOG` (rows `data_source=auto`, upsert theo `external_post_id` mới). GA4 dùng quyền Google của script owner (không token). Meta dùng System User token trong CONFIG + health-check tự hạ cấp xuống nhập tay khi token chết. TikTok/Threads vẫn nhập tay (P1).

**Tech Stack:** Apps Script (V8) · Analytics Data API (advanced service `AnalyticsData` v1beta) · Meta Graph API v21.0 (UrlFetchApp) · Google Sheets · PropertiesService (degrade flag).

> **Môi trường:** repo KHÔNG có test-runner local; GAS verify = chạy hàm trong Apps Script editor + curl endpoint deploy. Sau khi sửa `.gs`/`appsscript.json` phải `cd gas && clasp push` + redeploy. Token/Property-ID đọc từ CONFIG (guardrail `❌ Token/key trong code`).

**Spec:** `docs/superpowers/specs/2026-06-20-cafe-insight-subagent-design.md` (§7 token, §P2). **Tiền đề:** P1 đã merge (`MARKETING_LOG` 24 cột, `getRoiData`, `cafe-insight` agent).

**Quyết định đã chốt:** GA4 → tab `WEB_TRAFFIC` riêng (không nhét MARKETING_LOG); geo tới `city`; plan gồm CẢ GA4 + Meta.

---

## File Structure

| File | Trách nhiệm | Hành động |
|---|---|---|
| `gas/appsscript.json` | Bật advanced service AnalyticsData + scope analytics.readonly | Modify |
| `gas/WebTraffic.gs` | Tab `WEB_TRAFFIC`: init + `pullGa4Traffic` + `getWebTraffic` + trigger | Create |
| `gas/Meta.gs` | Meta token + Graph helper + `pullMetaFbInsights`/`pullMetaIgInsights` + upsert + `checkMetaTokenHealth` | Create |
| `gas/Marketing.gs` | Thêm cột `external_post_id` (migrate P2) + upsert helper | Modify |
| `gas/Code.gs` | doGet routes: `ga4_pull`, `meta_pull`, `meta_health` (writeActions) | Modify |
| `.claude/agents/cafe-insight.md` | Dùng `web_traffic` + phân biệt auto/manual + degrade | Modify |

CONFIG keys cần (user set tay trong tab CONFIG): `GA4_PROPERTY_ID` (số), `META_SYSTEM_TOKEN`, `META_PAGE_ID`, `META_IG_USER_ID`.

---

# PART A — GA4 (không token, làm trước)

## Task A1: Bật Analytics Data API + scope

**Files:** Modify `gas/appsscript.json`

- [ ] **Step 1: Thêm advanced service + scope**

Thay `gas/appsscript.json` thành (giữ nguyên phần cũ, thêm `dependencies.enabledAdvancedServices` và 1 scope):
```json
{
  "timeZone": "Asia/Ho_Chi_Minh",
  "dependencies": {
    "enabledAdvancedServices": [
      {
        "userSymbol": "AnalyticsData",
        "serviceId": "analyticsdata",
        "version": "v1beta"
      }
    ]
  },
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/forms",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.send_mail",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/analytics.readonly"
  ]
}
```

- [ ] **Step 2: Verify (sau clasp push)**

Trong Apps Script editor: **Editor → Services (+)** → kiểm "Google Analytics Data API" đã bật (hoặc Project Settings hiển thị). Chạy 1 hàm bất kỳ → khi authorize sẽ thấy xin thêm quyền Analytics readonly.
Expected: không lỗi "AnalyticsData is not defined" khi dùng ở Task A2.

- [ ] **Step 3: Commit**
```bash
git add gas/appsscript.json && git commit -m "feat(insight): enable Analytics Data API advanced service + scope (P2)"
```

---

## Task A2: Tab WEB_TRAFFIC + pull GA4

**Files:** Create `gas/WebTraffic.gs`

- [ ] **Step 1: Tạo `gas/WebTraffic.gs`**
```javascript
/**
 * WebTraffic.gs — kéo GA4 traffic vào tab WEB_TRAFFIC.
 * GA4 chạy bằng quyền Google của script owner (executeAs USER_DEPLOYING) → KHÔNG cần token.
 * Cần CONFIG.GA4_PROPERTY_ID = Property ID dạng SỐ (GA4 Admin → Property Settings),
 * KHÔNG phải measurement id 'G-XXXX'.
 */
var WEB_TRAFFIC_HEADERS = [
  'date', 'landing_page', 'source', 'medium', 'campaign', 'city',
  'sessions', 'users', 'new_users', 'conversions', 'pulled_at'
];

function _webTrafficSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WEB_TRAFFIC');
}

/** Tạo tab WEB_TRAFFIC (idempotent). */
function initWebTraffic() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('WEB_TRAFFIC');
  if (sheet) { Logger.log('WEB_TRAFFIC already exists.'); return; }
  sheet = ss.insertSheet('WEB_TRAFFIC');
  sheet.appendRow(WEB_TRAFFIC_HEADERS);
  sheet.getRange(1, 1, 1, WEB_TRAFFIC_HEADERS.length)
    .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  Logger.log('WEB_TRAFFIC created.');
}

/** 'YYYYMMDD' (GA4) → 'YYYY-MM-DD'. */
function _ga4Date(s) {
  s = String(s);
  return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) : s;
}

/**
 * Kéo GA4 cho khoảng [from,to] (string 'yyyy-MM-dd'). Idempotent:
 * xoá các dòng WEB_TRAFFIC có date trong khoảng rồi ghi lại fresh.
 * @return {number} số dòng đã ghi
 */
function pullGa4Traffic(from, to) {
  var propId = getConfig('GA4_PROPERTY_ID');
  if (!propId) throw new Error('CONFIG.GA4_PROPERTY_ID chưa set (Property ID dạng số).');
  initWebTraffic();
  var sheet = _webTrafficSheet();

  var request = {
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [
      // landingPage = đường dẫn SẠCH (vd /menu), KHÔNG kèm query (?fbclid/?gclid)
      // → tránh phân mảnh row; nguồn đã lưu riêng qua sessionSource/medium/campaign.
      { name: 'date' }, { name: 'landingPage' },
      { name: 'sessionSource' }, { name: 'sessionMedium' },
      { name: 'sessionCampaign' }, { name: 'city' }
    ],
    metrics: [
      { name: 'sessions' }, { name: 'totalUsers' },
      { name: 'newUsers' }, { name: 'conversions' }
    ],
    limit: 100000
  };
  var resp = AnalyticsData.Properties.runReport(request, 'properties/' + propId);
  var rows = (resp && resp.rows) ? resp.rows : [];

  // 1) Xoá dòng cũ trong khoảng (idempotent re-pull) — BATCH, không deleteRow trong loop
  //    (deleteRow lặp = N call API → timeout khi sheet lớn). Đọc → filter RAM → ghi lại 2 call.
  if (sheet.getLastRow() >= 2) {
    var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
    var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
    var keep = range.getValues().filter(function (row) {
      var d = _asDateStr(row[0]);
      return !(d >= from && d <= to);
    });
    range.clearContent();
    if (keep.length) sheet.getRange(2, 1, keep.length, lastCol).setValues(keep);
  }

  // 2) Ghi fresh
  var now = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm');
  var out = [];
  for (var r = 0; r < rows.length; r++) {
    var dim = rows[r].dimensionValues, met = rows[r].metricValues;
    out.push([
      _ga4Date(dim[0].value), dim[1].value, dim[2].value, dim[3].value,
      dim[4].value, dim[5].value,
      Number(met[0].value) || 0, Number(met[1].value) || 0,
      Number(met[2].value) || 0, Number(met[3].value) || 0, now
    ]);
  }
  if (out.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, out.length, WEB_TRAFFIC_HEADERS.length).setValues(out);
  }
  Logger.log('pullGa4Traffic ' + from + '..' + to + ' → ' + out.length + ' rows');
  return out.length;
}

/** Đọc WEB_TRAFFIC trong [from,to] → Array<Object> (cho getRoiData / subagent). */
function getWebTraffic(from, to) {
  var sheet = _webTrafficSheet();
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var date = _asDateStr(r[0]);
    if (from && date < from) continue;
    if (to && date > to) continue;
    rows.push({
      date: date, landing_page: r[1], source: r[2], medium: r[3],
      campaign: r[4], city: r[5], sessions: Number(r[6]) || 0,
      users: Number(r[7]) || 0, new_users: Number(r[8]) || 0,
      conversions: Number(r[9]) || 0
    });
  }
  return rows;
}

/** Trigger hằng ngày: pull 3 ngày gần nhất (GA4 chốt số trễ ~48h → backfill). */
function pullGa4Recent() {
  var tz = 'Asia/Ho_Chi_Minh';
  var to = Utilities.formatDate(new Date(Date.now() - 1 * 86400000), tz, 'yyyy-MM-dd');
  var from = Utilities.formatDate(new Date(Date.now() - 3 * 86400000), tz, 'yyyy-MM-dd');
  return pullGa4Traffic(from, to);
}

/** Cài trigger hằng ngày 6:00 (idempotent — xoá trigger cũ cùng hàm trước). */
function installGa4DailyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'pullGa4Recent') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('pullGa4Recent').timeBased().everyDays(1).atHour(6).create();
  Logger.log('Installed daily GA4 trigger @6:00.');
}
```

- [ ] **Step 2: Verify (editor, cần GA4_PROPERTY_ID đã set)**

Set CONFIG.GA4_PROPERTY_ID trước. Chạy `initWebTraffic` → tab xuất hiện 11 header. Chạy:
```javascript
function _tmpGa4(){ Logger.log('rows=' + pullGa4Traffic('2026-06-01','2026-06-19')); }
```
Expected: log `rows=N` (N≥0); tab WEB_TRAFFIC có dòng date/landing_page/source/city/sessions. Chạy lại → không nhân đôi (xoá-rồi-ghi). Nếu lỗi `AnalyticsData is not defined` → quay lại Task A1. Xoá hàm `_tmpGa4` sau.

- [ ] **Step 3: Commit**
```bash
git add gas/WebTraffic.gs && git commit -m "feat(insight): WEB_TRAFFIC tab + GA4 pull + daily trigger (P2)"
```

---

## Task A3: getRoiData expose web_traffic

**Files:** Modify `gas/Marketing.gs` (`getRoiData` return object)

- [ ] **Step 1: Thêm web_traffic vào return của getRoiData**

Trong `gas/Marketing.gs`, object `return { ... }` cuối `getRoiData` (hiện có `range/orders/promotions/marketing/menu_costs`), thêm 1 dòng:
```javascript
    web_traffic: getWebTraffic(from, to),
```
(đặt sau `marketing: getMarketingLog(from, to),`). `getWebTraffic` là global từ WebTraffic.gs.

- [ ] **Step 2: Verify**

`curl -sLG "<BASE>" --data-urlencode action=roi_data --data-urlencode from=2026-06-01 --data-urlencode to=2026-06-30 --data-urlencode token=<TOKEN>` → JSON có key `"web_traffic"` (mảng, có thể rỗng nếu chưa pull).

- [ ] **Step 3: Commit**
```bash
git add gas/Marketing.gs && git commit -m "feat(insight): surface web_traffic through getRoiData (P2)"
```

---

## Task A4: doGet route ga4_pull (kéo thủ công theo yêu cầu)

**Files:** Modify `gas/Code.gs` (writeActions + doGet route)

- [ ] **Step 1: Thêm `'ga4_pull'` vào `writeActions[]`** (ghi sheet → là write).

- [ ] **Step 2: Thêm route doGet (cạnh các route analytics, vd sau `get_decisions_due`)**
```javascript
    // cafe-insight P2: kéo GA4 thủ công (mặc định 7 ngày nếu không truyền from/to)
    if (action === 'ga4_pull') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var gTo = e.parameter.to || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      var gFrom = e.parameter.from ||
        Utilities.formatDate(new Date(Date.now() - 7 * 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      var n = pullGa4Traffic(gFrom, gTo);
      return _jsonResponse({ ok: true, pulled_rows: n, range: { from: gFrom, to: gTo } });
    }
```

- [ ] **Step 3: Verify**

`curl -sLG "<BASE>" --data-urlencode action=ga4_pull --data-urlencode token=<TOKEN>` → `{"ok":true,"pulled_rows":N,...}`; WEB_TRAFFIC cập nhật.

- [ ] **Step 4: Commit**
```bash
git add gas/Code.gs && git commit -m "feat(insight): doGet ga4_pull route (P2)"
```

---

# PART B — Meta FB/IG (System User token)

> **Cảnh báo tên metric Meta:** Graph API đôi khi đổi/deprecate tên metric theo version + loại tài khoản. Code dưới dùng v21.0 với metric phổ biến; **bước verify mỗi task phải chạy thật 1 lần** — nếu trả lỗi `(#100) ... invalid metric`, chỉnh danh sách metric theo [Graph API docs](https://developers.facebook.com/docs/graph-api) rồi chạy lại. Đây là điều chỉnh dữ liệu, không phải lỗi kiến trúc.

## Task B1: MARKETING_LOG thêm external_post_id (upsert key)

**Files:** Modify `gas/Marketing.gs`

- [ ] **Step 1: Thêm `'external_post_id'` cuối `MARKETING_LOG_HEADERS`** (sau `data_source`, index 24).

- [ ] **Step 2: Thêm `a.external_post_id || ''` cuối mảng `appendRow` trong `logMarketingActivity`** (sau `a.data_source || 'manual',`).

- [ ] **Step 3: Đọc cột mới trong `getMarketingLog`** — thêm vào object `rows.push`:
```javascript
      external_post_id: r[24] || '',
```

- [ ] **Step 4: Thêm hàm migrate + upsert ở cuối `gas/Marketing.gs`**
```javascript
/** P2: thêm cột external_post_id (chạy migrateMarketingLogP1 dùng chung logic — gọi lại an toàn). */
function migrateMarketingLogP2() { return migrateMarketingLogP1(); }

/**
 * Upsert 1 row MARKETING_LOG theo external_post_id (dùng cho auto-pull Meta).
 * Nếu có row cùng external_post_id → cập nhật cột metric tại chỗ; nếu không → append mới (data_source='auto').
 * KHÔNG đụng row data_source='manual' (chúng có external_post_id rỗng → không bao giờ khớp).
 * @param {string} externalId
 * @param {Object} a - field như logMarketingActivity (platform, title, utm_tag, date, reach, views, likes,
 *                      comments, shares, saves, watch_time_sec, avg_watch_pct, format, sku_featured, ...)
 */
function upsertMarketingByExternalId(externalId, a) {
  var sheet = _marketingSheet();
  if (!sheet) { initMarketingLog(); sheet = _marketingSheet(); }
  migrateMarketingLogP1(); // đảm bảo đủ cột
  var data = sheet.getLastRow() >= 2 ? sheet.getDataRange().getValues() : [];
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][24]) === String(externalId) && externalId) { rowIdx = i + 1; break; }
  }
  if (rowIdx === -1) {
    a.data_source = 'auto';
    a.external_post_id = externalId;
    return logMarketingActivity(a); // append mới (đã ghi đủ 25 cột nếu logMarketingActivity cập nhật — xem note)
  }
  // update tại chỗ các cột metric. KEY = index 0-based trong MARKETING_LOG_HEADERS;
  // cột thực = index+1. CHÚ Ý alignment: reach=9, clicks=10, impressions=12, views=13,
  // likes=14, comments=15, shares=16, saves=17, watch_time_sec=18, avg_watch_pct=19.
  var map = {
    9: a.reach, 10: a.clicks, 12: a.impressions, 13: a.views, 14: a.likes,
    15: a.comments, 16: a.shares, 17: a.saves, 18: a.watch_time_sec, 19: a.avg_watch_pct
  };
  for (var col in map) {
    if (map[col] !== undefined && map[col] !== null) {
      sheet.getRange(rowIdx, Number(col) + 1).setValue(Number(map[col]) || 0);
    }
  }
  return data[rowIdx - 1][0]; // activity_id
}
```

> **Note cho implementer:** `logMarketingActivity` (P1) hiện append 24 phần tử (chưa có external_post_id ở mảng appendRow). Step 2 đã thêm phần tử thứ 25 → mảng giờ 25 phần tử khớp header. Verify lại 25-element alignment.

- [ ] **Step 5: Verify**

Editor: chạy `migrateMarketingLogP2()` → MARKETING_LOG có cột `external_post_id` (25 cột). Test upsert:
```javascript
function _tmpUp(){
  var id1 = upsertMarketingByExternalId('FB_TEST_1', {platform:'fb', title:'t', reach:100, saves:0});
  var id2 = upsertMarketingByExternalId('FB_TEST_1', {platform:'fb', title:'t', reach:250, saves:5}); // update
  Logger.log('id1='+id1+' id2='+id2+' (phải bằng nhau, reach=250 saves=5)');
}
```
Expected: 1 dòng duy nhất cho FB_TEST_1, reach=250. Xoá dòng test + hàm tạm.

- [ ] **Step 6: Commit**
```bash
git add gas/Marketing.gs && git commit -m "feat(insight): MARKETING_LOG external_post_id + upsert helper (P2)"
```

---

## Task B2: Meta.gs — token, helper, health-check

**Files:** Create `gas/Meta.gs`

- [ ] **Step 1: Tạo `gas/Meta.gs`**
```javascript
/**
 * Meta.gs — kéo insight FB/IG qua Graph API v21.0.
 * Token = System User token (KHÔNG hết hạn) trong CONFIG.META_SYSTEM_TOKEN.
 * CONFIG.META_PAGE_ID (Facebook Page id), CONFIG.META_IG_USER_ID (IG business user id).
 * Khi token chết → set degrade flag (ScriptProperties) + Telegram alert; kênh tự rớt về nhập tay.
 */
var META_API = 'https://graph.facebook.com/v21.0';

function getMetaToken() { return getConfig('META_SYSTEM_TOKEN'); }
function _metaProps() { return PropertiesService.getScriptProperties(); }
function isMetaDegraded() { return _metaProps().getProperty('META_DEGRADED') === '1'; }

/** GET Graph API. Trả parsed object hoặc null (+ set degrade) nếu lỗi. */
function _metaGet(path, params) {
  var token = getMetaToken();
  if (!token) { _setMetaDegraded('CONFIG.META_SYSTEM_TOKEN chưa set'); return null; }
  params = params || {};
  params.access_token = token;
  var qs = Object.keys(params).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var url = META_API + path + '?' + qs;
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var code = resp.getResponseCode();
  var body;
  try { body = JSON.parse(resp.getContentText()); } catch (e) { body = null; }
  if (code !== 200 || !body || body.error) {
    var msg = body && body.error ? body.error.message : ('HTTP ' + code);
    _setMetaDegraded(msg);
    logError('meta.get ' + path, new Error(msg));
    return null;
  }
  // gọi thành công → clear degrade
  if (isMetaDegraded()) _clearMetaDegraded();
  return body;
}

function _setMetaDegraded(reason) {
  if (isMetaDegraded()) return; // tránh spam alert
  _metaProps().setProperty('META_DEGRADED', '1');
  try {
    sendTelegramAlert(
      '⚠️ <b>Token Meta lỗi</b> — hệ thống tự chuyển FB/IG sang <b>nhập tay</b>.\n' +
      'Lý do: ' + reason + '\n' +
      'Khắc phục: tạo token System User mới (Business Manager) → dán vào CONFIG → key <code>META_SYSTEM_TOKEN</code>.\n' +
      'Hướng dẫn: https://developers.facebook.com/docs/marketing-api/system-users'
    );
  } catch (e) { logError('meta.alert', e); }
}
function _clearMetaDegraded() { _metaProps().deleteProperty('META_DEGRADED'); }

/** Health-check: gọi endpoint rẻ. Trả {ok, degraded}. Dùng cho trigger hằng ngày. */
function checkMetaTokenHealth() {
  var pageId = getConfig('META_PAGE_ID');
  var probe = _metaGet('/' + (pageId || 'me'), { fields: 'id' });
  return { ok: !!probe, degraded: isMetaDegraded() };
}

/** Cài trigger health-check hằng ngày 5:30 (idempotent). */
function installMetaHealthTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkMetaTokenHealth') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('checkMetaTokenHealth').timeBased().everyDays(1).atHour(5).create();
  Logger.log('Installed daily Meta health-check @5:00.');
}
```

> **Note:** `sendTelegramAlert`, `logError`, `getConfig` đều global sẵn (Notify.gs/Utils.gs). Verify tên đúng bằng grep trước khi dựa vào.

- [ ] **Step 2: Verify scaffolding (editor)**

Set CONFIG.META_SYSTEM_TOKEN + META_PAGE_ID. Chạy `checkMetaTokenHealth` → `{ok:true,degraded:false}` nếu token đúng. Tạm set token sai → chạy lại → `{ok:false,degraded:true}` + nhận Telegram alert. Sửa token đúng → chạy lại → degrade tự clear. (Confirm `sendTelegramAlert` tồn tại: `grep -n "function sendTelegramAlert" gas/*.gs`.)

- [ ] **Step 3: Commit**
```bash
git add gas/Meta.gs && git commit -m "feat(insight): Meta.gs token + Graph helper + health-check + degrade (P2)"
```

---

## Task B3: pull insight Facebook posts

**Files:** Modify `gas/Meta.gs`

- [ ] **Step 1: Thêm `pullMetaFbInsights(from, to)`**
```javascript
/**
 * Kéo insight các bài Facebook Page đăng trong [from,to] → upsert MARKETING_LOG (data_source=auto).
 * @return {number} số post xử lý (0 nếu degrade/không token)
 */
function pullMetaFbInsights(from, to) {
  var pageId = getConfig('META_PAGE_ID');
  if (!pageId) return 0;
  var posts = _metaGet('/' + pageId + '/published_posts', {
    fields: 'id,message,created_time,shares,comments.summary(true)',
    since: from, until: to, limit: 50
  });
  if (!posts || !posts.data) return 0;
  var n = 0;
  for (var i = 0; i < posts.data.length; i++) {
    var p = posts.data[i];
    var date = _asDateStr(p.created_time);
    var ins = _metaGet('/' + p.id + '/insights', {
      metric: 'post_impressions,post_impressions_unique,post_clicks,post_reactions_by_type_total'
    });
    var m = _flattenInsights(ins);
    upsertMarketingByExternalId('fb_' + p.id, {
      platform: 'fb', type: 'post', title: (p.message || '').slice(0, 80),
      date: date,
      reach: m.post_impressions_unique || 0,
      impressions: m.post_impressions || 0,
      clicks: m.post_clicks || 0,
      likes: _sumReactions(m.post_reactions_by_type_total),
      comments: (p.comments && p.comments.summary) ? p.comments.summary.total_count : 0,
      shares: (p.shares ? p.shares.count : 0),
      format: 'photo'
    });
    n++;
  }
  Logger.log('pullMetaFbInsights → ' + n + ' posts');
  return n;
}

/** insights API trả data[] mỗi metric có values[0].value → map {metric: value}. */
function _flattenInsights(ins) {
  var out = {};
  if (ins && ins.data) {
    for (var i = 0; i < ins.data.length; i++) {
      var d = ins.data[i];
      out[d.name] = (d.values && d.values[0]) ? d.values[0].value : 0;
    }
  }
  return out;
}

/** post_reactions_by_type_total là object {like:.., love:..} → tổng. */
function _sumReactions(v) {
  if (!v || typeof v !== 'object') return Number(v) || 0;
  var s = 0; for (var k in v) s += Number(v[k]) || 0; return s;
}
```

- [ ] **Step 2: Verify (editor, token thật)**
```javascript
function _tmpFb(){ Logger.log('fb posts=' + pullMetaFbInsights('2026-06-01','2026-06-19')); }
```
Expected: log số post; MARKETING_LOG có dòng `platform=fb, data_source=auto, external_post_id=fb_...`. Nếu lỗi invalid metric → chỉnh metric list theo docs. Xoá hàm tạm.

- [ ] **Step 3: Commit**
```bash
git add gas/Meta.gs && git commit -m "feat(insight): pull Facebook post insights → MARKETING_LOG (P2)"
```

---

## Task B4: pull insight Instagram media

**Files:** Modify `gas/Meta.gs`

- [ ] **Step 1: Thêm `pullMetaIgInsights(from, to)`**
```javascript
/**
 * Kéo insight IG media trong [from,to] → upsert MARKETING_LOG (data_source=auto).
 * IG cho `saved` + (reels) plays/avg_watch_time mà FB không có.
 * @return {number} số media xử lý
 */
function pullMetaIgInsights(from, to) {
  var igId = getConfig('META_IG_USER_ID');
  if (!igId) return 0;
  var media = _metaGet('/' + igId + '/media', {
    fields: 'id,caption,timestamp,media_type,like_count,comments_count',
    since: from, until: to, limit: 50
  });
  if (!media || !media.data) return 0;
  var n = 0;
  for (var i = 0; i < media.data.length; i++) {
    var md = media.data[i];
    var date = _asDateStr(md.timestamp);
    if (date < from || date > to) continue;
    var isReel = md.media_type === 'VIDEO' || md.media_type === 'REEL';
    var metric = isReel
      ? 'reach,saved,shares,plays,ig_reels_avg_watch_time'
      : 'reach,impressions,saved,shares';
    var m = _flattenInsights(_metaGet('/' + md.id + '/insights', { metric: metric }));
    upsertMarketingByExternalId('ig_' + md.id, {
      platform: 'ig', type: 'post',
      title: (md.caption || '').slice(0, 80), date: date,
      format: isReel ? 'reel' : 'photo',
      reach: m.reach || 0,
      impressions: m.impressions || 0,
      views: m.plays || 0,
      likes: md.like_count || 0,
      comments: md.comments_count || 0,
      shares: m.shares || 0,
      saves: m.saved || 0,
      avg_watch_pct: 0,
      watch_time_sec: Math.round((m.ig_reels_avg_watch_time || 0) / 1000)
    });
    n++;
  }
  Logger.log('pullMetaIgInsights → ' + n + ' media');
  return n;
}
```

- [ ] **Step 2: Verify (editor, token thật)**
```javascript
function _tmpIg(){ Logger.log('ig media=' + pullMetaIgInsights('2026-06-01','2026-06-19')); }
```
Expected: MARKETING_LOG có dòng `platform=ig, data_source=auto, saves>0` cho bài có lưu. Chạy lại → upsert (không nhân đôi). Điều chỉnh metric nếu API báo lỗi. Xoá hàm tạm.

- [ ] **Step 3: Commit**
```bash
git add gas/Meta.gs && git commit -m "feat(insight): pull Instagram media insights → MARKETING_LOG (P2)"
```

---

## Task B5: doGet routes meta_pull + meta_health + trigger pull

**Files:** Modify `gas/Code.gs`, `gas/Meta.gs`

- [ ] **Step 1: Hàm gộp pull + trigger trong `gas/Meta.gs`**
```javascript
/** Pull cả FB+IG cho [from,to]. Skip nếu degrade. @return {Object} */
function pullMetaAll(from, to) {
  if (isMetaDegraded()) return { ok: false, degraded: true, fb: 0, ig: 0 };
  var fb = pullMetaFbInsights(from, to);
  var ig = pullMetaIgInsights(from, to);
  return { ok: true, degraded: isMetaDegraded(), fb: fb, ig: ig };
}

/** Trigger hằng ngày: pull 3 ngày gần nhất (engagement còn tăng vài ngày). */
function pullMetaRecent() {
  var tz = 'Asia/Ho_Chi_Minh';
  var to = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var from = Utilities.formatDate(new Date(Date.now() - 3 * 86400000), tz, 'yyyy-MM-dd');
  return pullMetaAll(from, to);
}

/** Cài trigger pull Meta hằng ngày 5:30 (idempotent). */
function installMetaPullTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'pullMetaRecent') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('pullMetaRecent').timeBased().everyDays(1).atHour(5).nearMinute(30).create();
  Logger.log('Installed daily Meta pull @5:30.');
}
```

- [ ] **Step 2: doGet routes trong `gas/Code.gs`** — thêm `'meta_pull'` vào `writeActions[]`, rồi:
```javascript
    // cafe-insight P2: kéo Meta thủ công (mặc định 7 ngày)
    if (action === 'meta_pull') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var mTo = e.parameter.to || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      var mFrom = e.parameter.from ||
        Utilities.formatDate(new Date(Date.now() - 7 * 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      return _jsonResponse(pullMetaAll(mFrom, mTo));
    }
    // cafe-insight P2: trạng thái token Meta (đọc)
    if (action === 'meta_health') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      return _jsonResponse(checkMetaTokenHealth());
    }
```

- [ ] **Step 3: Verify**
```bash
curl -sLG "<BASE>" --data-urlencode action=meta_health --data-urlencode token=<TOKEN>   # {"ok":true,"degraded":false}
curl -sLG "<BASE>" --data-urlencode action=meta_pull --data-urlencode token=<TOKEN>     # {"ok":true,"fb":N,"ig":M}
```
Expected: MARKETING_LOG có thêm dòng auto FB+IG. `meta_health` phản ánh đúng trạng thái token.

- [ ] **Step 4: Commit**
```bash
git add gas/Meta.gs gas/Code.gs && git commit -m "feat(insight): pullMetaAll + meta_pull/meta_health routes + triggers (P2)"
```

---

## Task B6: pull insight Threads (cùng vendor Meta, token riêng)

> **Đối soát research:** Threads CÓ insights endpoint (`views, likes, replies, reposts, quotes`, +click metrics từ 7/2025). Nhưng **base khác** (`graph.threads.net`) và **token riêng** scope `threads_basic, threads_manage_insights` (cùng app Meta nhưng KHÔNG phải y hệt System User token của FB). → CONFIG thêm `THREADS_TOKEN`, `THREADS_USER_ID`.

**Files:** Modify `gas/Meta.gs`

- [ ] **Step 1: Thêm helper + pull Threads**
```javascript
var THREADS_API = 'https://graph.threads.net/v1.0';

/** GET Threads Graph API (token + base riêng). Trả object hoặc null (+degrade). */
function _threadsGet(path, params) {
  var token = getConfig('THREADS_TOKEN');
  if (!token) { _setMetaDegraded('CONFIG.THREADS_TOKEN chưa set'); return null; }
  params = params || {};
  params.access_token = token;
  var qs = Object.keys(params).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var resp = UrlFetchApp.fetch(THREADS_API + path + '?' + qs, { muteHttpExceptions: true });
  var body; try { body = JSON.parse(resp.getContentText()); } catch (e) { body = null; }
  if (resp.getResponseCode() !== 200 || !body || body.error) {
    logError('threads.get ' + path, new Error(body && body.error ? body.error.message : 'http'));
    return null;
  }
  return body;
}

/**
 * Kéo insight các thread đăng trong [from,to] → upsert MARKETING_LOG (platform='threads', auto).
 * @return {number} số thread xử lý
 */
function pullMetaThreadsInsights(from, to) {
  var uid = getConfig('THREADS_USER_ID');
  if (!uid) return 0;
  var posts = _threadsGet('/' + uid + '/threads', {
    fields: 'id,text,timestamp', since: from, until: to, limit: 50
  });
  if (!posts || !posts.data) return 0;
  var n = 0;
  for (var i = 0; i < posts.data.length; i++) {
    var p = posts.data[i];
    var date = _asDateStr(p.timestamp);
    if (date < from || date > to) continue;
    var m = _flattenInsights(_threadsGet('/' + p.id + '/insights',
      { metric: 'views,likes,replies,reposts,quotes' }));
    upsertMarketingByExternalId('th_' + p.id, {
      platform: 'threads', type: 'post', format: 'text',
      title: (p.text || '').slice(0, 80), date: date,
      views: m.views || 0, likes: m.likes || 0, comments: m.replies || 0,
      shares: (Number(m.reposts) || 0) + (Number(m.quotes) || 0)
    });
    n++;
  }
  Logger.log('pullMetaThreadsInsights → ' + n + ' threads');
  return n;
}
```

- [ ] **Step 2: Thêm Threads vào `pullMetaAll` (sửa hàm đã viết ở B5)**

Trong `pullMetaAll(from, to)`, sau dòng `var ig = pullMetaIgInsights(from, to);` thêm:
```javascript
  var threads = pullMetaThreadsInsights(from, to);
```
và đổi return thành:
```javascript
  return { ok: true, degraded: isMetaDegraded(), fb: fb, ig: ig, threads: threads };
```

- [ ] **Step 3: Verify (editor, THREADS_TOKEN thật)**
```javascript
function _tmpTh(){ Logger.log('threads=' + pullMetaThreadsInsights('2026-06-01','2026-06-19')); }
```
Expected: MARKETING_LOG có dòng `platform=threads, data_source=auto`. Nếu lỗi token/scope → kiểm THREADS_TOKEN có scope `threads_manage_insights`. Xoá hàm tạm.

- [ ] **Step 4: Commit**
```bash
git add gas/Meta.gs && git commit -m "feat(insight): pull Threads insights (graph.threads.net) → MARKETING_LOG (P2)"
```

---

# PART C — Wiring subagent

## Task C1: cafe-insight dùng web_traffic + phân biệt auto/manual

**Files:** Modify `.claude/agents/cafe-insight.md`

- [ ] **Step 1: Thêm web_traffic vào "Nguồn dữ liệu"** — sau dòng ROI gộp, thêm:
```markdown
- Web traffic (GA4): `roi_data` giờ kèm `web_traffic[]` = ngày×landing×source×medium×campaign×city → sessions/users/new_users/conversions. Dùng để: (a) đối soát chéo `sessionCampaign/source` với `utm_source` ORDERS, (b) phân tích **vị trí khách** (city), (c) lượt web → đơn.
- Kéo thủ công nếu cần data mới: GET `action=ga4_pull` (GA4), `action=meta_pull` (FB/IG), `action=meta_health` (trạng thái token).
```

- [ ] **Step 2: Thêm note phân biệt nguồn** — trong CHẾ ĐỘ A mục 1 (DESCRIPTIVE), thêm:
```markdown
- `data_source`: `auto` (FB/IG/Threads kéo qua Meta API) vs `manual` (TikTok nhập tay; GBP/Zalo = P2.5; hoặc FB/IG/Threads khi token degrade). Nếu `meta_health` báo degraded → nhắc chủ quán các kênh Meta đang ở chế độ nhập tay.
- GA4 chốt số trễ ~48h → khi phân tích sát ngày, ưu tiên dữ liệu ≥2 ngày trước.
```

- [ ] **Step 3: Verify** — đọc lại file, frontmatter còn nguyên; không phá cấu trúc CHẾ ĐỘ A/B.

- [ ] **Step 4: Commit**
```bash
git add .claude/agents/cafe-insight.md && git commit -m "feat(insight): subagent uses web_traffic + auto/manual + degrade awareness (P2)"
```

---

## Self-Review (đã chạy)

- **Spec coverage:** §P2 GA4 (Data API + traffic + geo)→A1-A4; §7 Meta System User token + health-check + degrade→B2; Meta FB/IG pull→B3-B4; trigger→A2/B5; subagent wiring→C1. Storage `WEB_TRAFFIC` riêng + `external_post_id` upsert đúng quyết định đã chốt.
- **Placeholder scan:** không có TBD; mọi code step có code thật. Metric Meta có cảnh báo verify-runtime (đặc thù API đổi version, không thể tránh).
- **Type consistency:** `upsertMarketingByExternalId` field names khớp `logMarketingActivity` (P1) + index `external_post_id`=24 khớp B1 Step 1-3. `_flattenInsights/_sumReactions` định nghĩa B3, dùng B3+B4. `getWebTraffic` định nghĩa A2, dùng A3+C1. `pullMetaAll/pullMetaRecent` định nghĩa B5, route B5.
- **Phụ thuộc tuần tự:** A1 trước A2 (advanced service); B1 trước B3/B4 (external_post_id + upsert); B2 trước B3/B4 (_metaGet). GA4 (Part A) độc lập hẳn Meta (Part B) — có thể ship A trước.
- **Việc tay user (ngoài code):** set CONFIG `GA4_PROPERTY_ID`/`META_SYSTEM_TOKEN`/`META_PAGE_ID`/`META_IG_USER_ID`/`THREADS_TOKEN`/`THREADS_USER_ID`; bật advanced service; chạy `initWebTraffic`/`migrateMarketingLogP2`; cài trigger (`installGa4DailyTrigger`/`installMetaPullTrigger`/`installMetaHealthTrigger`); `clasp push`+redeploy.

## Đối soát góp ý v2 (đã tích hợp 2026-06-20)

3 fix kỹ thuật từ rà soát chủ quán — **đã áp dụng vào plan**:
1. **Offset bug `upsertMarketingByExternalId`** (B1) — map index lệch +1 (reach ở index 9 không phải 10) → đã sửa về `9:reach,10:clicks,12:impressions,…`. Bug nghiêm trọng nếu để (ghi reach đè clicks).
2. **`pullGa4Traffic` xoá dòng batch** (A2) — bỏ `deleteRow` trong loop (timeout khi sheet lớn) → đọc-filter-RAM-ghi-lại 2 call.
3. **GA4 dùng `landingPage`** (A2) thay `landingPagePlusQueryString` — tránh phân mảnh row do query string (fbclid/gclid).

Kênh mới: **Threads → Task B6** (đã thêm; base `graph.threads.net`, token riêng `THREADS_TOKEN`).

## Phụ lục — Lộ trình P2.5 / P3 (kênh chưa đưa vào P2)

> Đã research khả thi, để riêng vì hạ tầng/độ rủi ro khác — KHÔNG implement trong plan này.

| Kênh | Khả thi | Vướng phải xử | Xếp |
|---|---|---|---|
| **Google Business Profile / Maps** (views, click gọi/chỉ đường/website) | Cao (dùng quyền Google owner, scope `business.manage`, gọi từ GAS qua `ScriptApp.getOAuthToken()`) | ⚠️ **Cổng duyệt thủ công của Google**: quota mặc định 0, phải nộp form, cần GBP verified 60+ ngày, duyệt vài ngày–tuần. **→ Nộp đơn xin quyền NGAY**, code sau khi được duyệt. Reviews qua API bị siết → giữ luồng review thủ công (`cafe-insight` chế độ research) | **P2.5** (sau khi duyệt) |
| **Zalo OA** (broadcast/ZNS report: gửi/đọc/click) | Cao | Token ~25h, **refresh token DÙNG 1 LẦN** (mỗi refresh trả token mới phải ghi đè CONFIG) → cần **hàm ghi CONFIG** (`setConfig`) + LockService tránh đua mất chuỗi token; endpoint refresh `POST oauth.zaloapp.com/v4/oa/access_token`. Dự án đã có `ZALO_OA_TOKEN` (static) | **P2.5** |
| **TikTok** (views/like/comment/share theo video) | Trung bình–thấp | Official Creator API cần duyệt doanh nghiệp + OAuth định kỳ (quá nặng cho 1 quán). Thay thế: scrape `@mitsucafe` qua **Firecrawl** (repo có `.firecrawl/`) hoặc Apify. ⚠️ Caveat: scrape có thể **vi phạm ToS TikTok**, dễ gãy khi đổi layout, Firecrawl tốn phí | **P3** (hoặc P2.5 nếu chấp nhận rủi ro scrape) |

**Khi làm P2.5:** tách plan riêng `2026-XX-cafe-insight-p2.5.md`. GBP cần làm trước bước "nộp đơn" (lead time dài). Zalo cần thêm `setConfig` writer (tiện ích chung, có thể dùng lại). TikTok scrape nên có cờ bật/tắt + fallback nhập tay.
