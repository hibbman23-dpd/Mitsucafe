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
      { name: 'sessionCampaignName' }, { name: 'city' }
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
