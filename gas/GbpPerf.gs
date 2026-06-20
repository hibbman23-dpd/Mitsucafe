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
