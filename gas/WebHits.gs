/**
 * WebHits.gs — nhận hit log từ Worker (doPost action=web_hit, xem src/index.js)
 * + rollup hằng ngày vào WEB_TRAFFIC. Thay thế pipeline GA4 client-side
 * (xem docs/ga4-to-cloudflare-plan.md, WebTraffic.gs đã @deprecated).
 *
 * WEB_HITS = raw, giữ 90 ngày (prune). WEB_TRAFFIC = tổng hợp, giữ vĩnh viễn,
 * SCHEMA GIỮ NGUYÊN 11 cột hiện có (WEB_TRAFFIC_HEADERS, WebTraffic.gs) →
 * getRoiData/getWebTraffic KHÔNG cần sửa.
 */
var WEB_HITS_HEADERS = [
  'ts', 'date', 'path', 'utm_source', 'utm_medium', 'utm_campaign',
  'referer', 'country', 'city', 'device', 'visitor_hash'
];

function _webHitsSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WEB_HITS');
}

/** Tạo tab WEB_HITS (idempotent). */
function initWebHits() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('WEB_HITS');
  if (sheet) return sheet;
  sheet = ss.insertSheet('WEB_HITS');
  sheet.appendRow(WEB_HITS_HEADERS);
  sheet.getRange(1, 1, 1, WEB_HITS_HEADERS.length)
    .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * Ghi 1 hit từ Worker. appendRow THUẦN — KHÔNG LockService (append-only,
 * không read-modify-write) để không chèn ép lock của doPost đơn hàng.
 * Route trong Code.gs (action=web_hit) gọi hàm này TRƯỚC khi acquire lock.
 */
function logWebHit(payload) {
  var sheet = initWebHits();
  var now = new Date();
  var ts = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss');
  var date = Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  sheet.appendRow([
    ts, date,
    String(payload.path || ''),
    String(payload.utm_source || ''),
    String(payload.utm_medium || ''),
    String(payload.utm_campaign || ''),
    String(payload.referer || ''),
    String(payload.country || ''),
    String(payload.city || ''),
    String(payload.device || ''),
    String(payload.visitor_hash || '')
  ]);
  return { ok: true };
}

/**
 * Rollup WEB_HITS của `date` ('yyyy-MM-dd') → WEB_TRAFFIC (11 cột giữ nguyên).
 * Nhóm theo (landing_page=path, source, medium, campaign, city).
 *   source     = utm_source nếu có, else referer host, else '(direct)'.
 *   sessions   = số hit trong nhóm.
 *   users      = distinct visitor_hash trong nhóm.
 *   new_users  = hash CHƯA từng xuất hiện trong WEB_HITS ở 30 ngày trước `date`.
 *   conversions = 0 (chưa có custom event — xem plan §1, GA4 cũng luôn = 0).
 * Idempotent: xoá dòng WEB_TRAFFIC của `date` trước khi ghi lại (pattern pullGa4Traffic).
 * @return {number} số dòng đã ghi vào WEB_TRAFFIC
 */
function rollupWebHits(date) {
  var hitsSheet = _webHitsSheet();
  if (!hitsSheet || hitsSheet.getLastRow() < 2) { Logger.log('rollupWebHits: WEB_HITS trống'); return 0; }

  var data = hitsSheet.getDataRange().getValues();
  var headers = data[0];
  var idx = {};
  headers.forEach(function (h, i) { idx[h] = i; });

  var windowStart = Utilities.formatDate(
    new Date(new Date(date + 'T00:00:00Z').getTime() - 30 * 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'
  );

  var seenBefore = {};  // visitor_hash đã thấy TRƯỚC `date` (trong cửa sổ 30 ngày)
  var groups = {};      // key "path|source|medium|campaign|city" -> { ...dims, hits, hashes }

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var d = String(row[idx.date]);
    var hash = String(row[idx.visitor_hash] || '');
    if (d < windowStart || d > date) continue;
    if (d < date) {
      if (hash) seenBefore[hash] = true;
      continue;
    }
    var path = String(row[idx.path] || '');
    var utmSource = String(row[idx.utm_source] || '');
    var medium = String(row[idx.utm_medium] || '');
    var campaign = String(row[idx.utm_campaign] || '');
    var referer = String(row[idx.referer] || '');
    var city = String(row[idx.city] || '');
    var source = utmSource || referer || '(direct)';
    var key = [path, source, medium, campaign, city].join('|');
    if (!groups[key]) {
      groups[key] = { path: path, source: source, medium: medium, campaign: campaign, city: city, hits: 0, hashes: {} };
    }
    groups[key].hits++;
    if (hash) groups[key].hashes[hash] = true;
  }

  initWebTraffic();
  var trafficSheet = _webTrafficSheet();

  // Idempotent re-rollup: xoá dòng của `date` — BATCH (đọc → filter RAM → ghi lại),
  // KHÔNG deleteRow trong loop (pattern pullGa4Traffic, WebTraffic.gs:64-75).
  if (trafficSheet.getLastRow() >= 2) {
    var lastRow = trafficSheet.getLastRow(), lastCol = trafficSheet.getLastColumn();
    var range = trafficSheet.getRange(2, 1, lastRow - 1, lastCol);
    var keep = range.getValues().filter(function (r) { return _asDateStr(r[0]) !== date; });
    range.clearContent();
    if (keep.length) trafficSheet.getRange(2, 1, keep.length, lastCol).setValues(keep);
  }

  var now = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm');
  var out = [];
  Object.keys(groups).forEach(function (key) {
    var g = groups[key];
    var hashKeys = Object.keys(g.hashes);
    var users = hashKeys.length;
    var newUsers = hashKeys.filter(function (h) { return !seenBefore[h]; }).length;
    out.push([date, g.path, g.source, g.medium, g.campaign, g.city, g.hits, users, newUsers, 0, now]);
  });
  if (out.length) {
    trafficSheet.getRange(trafficSheet.getLastRow() + 1, 1, out.length, WEB_TRAFFIC_HEADERS.length).setValues(out);
  }
  Logger.log('rollupWebHits ' + date + ' → ' + out.length + ' rows');
  return out.length;
}

/** Xoá dòng WEB_HITS cũ hơn `days` ngày (BATCH — pattern Archive.gs, không deleteRow trong loop). */
function pruneWebHits(days) {
  var sheet = _webHitsSheet();
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var cutoff = Utilities.formatDate(new Date(Date.now() - days * 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var values = range.getValues();
  var keep = values.filter(function (r) { return String(r[1]) >= cutoff; }); // cột B = date
  var pruned = values.length - keep.length;
  if (pruned > 0) {
    range.clearContent();
    if (keep.length) sheet.getRange(2, 1, keep.length, lastCol).setValues(keep);
  }
  Logger.log('pruneWebHits: removed ' + pruned + ' rows older than ' + cutoff);
  return pruned;
}

/** Trigger hằng ngày 5:50 (trước rollup 6:00 cũ): rollup HÔM QUA + prune WEB_HITS >90 ngày. */
function cronRollupWebHitsYesterday() {
  try {
    var yesterday = Utilities.formatDate(new Date(Date.now() - 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    rollupWebHits(yesterday);
    pruneWebHits(90);
  } catch (err) { logError('cronRollupWebHitsYesterday', err); }
}

/** Cài trigger 5:50 hằng ngày (idempotent — xoá trigger cũ cùng hàm trước). Chạy tay 1 lần trong editor. */
function installWebHitsRollupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'cronRollupWebHitsYesterday') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cronRollupWebHitsYesterday').timeBased().everyDays(1).atHour(5).nearMinute(50).create();
  Logger.log('Installed WEB_HITS rollup trigger @5:50.');
}
