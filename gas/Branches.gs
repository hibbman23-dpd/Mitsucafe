/**
 * Branches.gs — Module SCALE (Tier 5): HQ rollup + config snapshot cho đa chi nhánh.
 *
 * Triết lý: 1 spreadsheet/chi nhánh + 1 HQ rollup. location_id LÀ KHÓA PHÂN TÁCH ĐẦU TIÊN
 * trên mọi dòng tổng hợp (để Looker/AI tách chi nhánh dễ).
 *
 * Hiện 1 chi nhánh:
 *  - getDailyRollup/recordDailyRollup chạy bình thường (1 location) → HQ_DAILY = bảng KPI ngày, dùng ngay cho Looker.
 *  - snapshotMenuFromMaster() NO-OP nếu chưa set CONFIG.MENU_MASTER_SHEET_ID (không đụng MENU local).
 */

var HQ_DAILY_HEADERS = [
  'location_id', 'date', 'revenue', 'order_count', 'avg_order_value',
  'expenses', 'waste_cost', 'walk_ins', 'conversion_pct', 'pulled_at'
];

/** location_id của chi nhánh NÀY (CONFIG.LOCATION_ID, mặc định LH01). */
function _locationId() { return getConfig('LOCATION_ID') || 'LH01'; }

/**
 * Tổng hợp 1 ngày của chi nhánh này → object có location_id làm khóa đầu (#4 HQ-ready).
 * HQ có thể pull hàm này từ mỗi CN qua route daily_rollup để dựng HQ_DAILY toàn chuỗi.
 * @param {string} [date] 'yyyy-MM-dd' (mặc định HÔM QUA)
 * @return {Object}
 */
function getDailyRollup(date) {
  var tz = 'Asia/Ho_Chi_Minh';
  if (!date) date = Utilities.formatDate(new Date(Date.now() - 86400000), tz, 'yyyy-MM-dd');
  var loc = _locationId();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ORDERS: revenue + order_count (bỏ CANCELLED) cho ngày + location này.
  // (1 sheet/CN thì location luôn khớp; phòng trường hợp sheet dùng chung vẫn lọc đúng.)
  var revenue = 0, orderCount = 0;
  var oSheet = ss.getSheetByName('ORDERS');
  if (oSheet && oSheet.getLastRow() >= 2) {
    var od = oSheet.getDataRange().getValues();
    for (var i = 1; i < od.length; i++) {
      var r = od[i];
      if (_asDateStr(r[2]) !== date) continue;
      if (String(r[5] || loc) !== String(loc)) continue;
      if (r[12] === 'CANCELLED') continue;
      revenue += Number(r[11]) || 0;
      orderCount += 1;
    }
  }

  // EXPENSES: tổng amount theo ngày (date=cột1, amount=cột3).
  var expenses = 0;
  var eSheet = ss.getSheetByName('EXPENSES');
  if (eSheet && eSheet.getLastRow() >= 2) {
    var ed = eSheet.getDataRange().getValues();
    for (var j = 1; j < ed.length; j++) {
      if (_asDateStr(ed[j][1]) === date) expenses += Number(ed[j][3]) || 0;
    }
  }

  // WASTE: tổng chi phí hao hụt ngày (dùng wasteReport nếu có).
  var waste = 0;
  try {
    if (typeof wasteReport === 'function') {
      var wr = wasteReport(date, date);
      if (wr && wr.ok !== false) waste = Number(wr.total) || 0;
    }
  } catch (e) { /* waste optional */ }

  // FOOT_TRAFFIC: lượt khách VÀO cửa (đếm ẩn danh) cho ngày+location → conversion = đơn/khách.
  var walkIns = _getWalkIns(date, loc);
  var conv = walkIns > 0 ? Math.round(orderCount / walkIns * 1000) / 10 : 0; // %, 1 chữ số

  return {
    location_id: loc,
    date: date,
    revenue: revenue,
    order_count: orderCount,
    avg_order_value: orderCount ? Math.round(revenue / orderCount) : 0,
    expenses: expenses,
    waste_cost: waste,
    walk_ins: walkIns,
    conversion_pct: conv,
    pulled_at: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm')
  };
}

function _hqDailySheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('HQ_DAILY');
  if (!sheet) {
    sheet = ss.insertSheet('HQ_DAILY');
    sheet.appendRow(HQ_DAILY_HEADERS);
    sheet.getRange(1, 1, 1, HQ_DAILY_HEADERS.length)
      .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Tính + ghi/ cập nhật 1 dòng HQ_DAILY cho (location_id + date). Idempotent (upsert theo khóa kép).
 * @param {string} [date]
 * @return {Object} dòng rollup đã ghi
 */
function recordDailyRollup(date) {
  var row = getDailyRollup(date);
  var sheet = _hqDailySheet();
  var data = sheet.getLastRow() >= 2 ? sheet.getDataRange().getValues() : [];
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(row.location_id) && _asDateStr(data[i][1]) === row.date) { rowIdx = i + 1; break; }
  }
  var values = [row.location_id, row.date, row.revenue, row.order_count, row.avg_order_value, row.expenses, row.waste_cost, row.walk_ins, row.conversion_pct, row.pulled_at];
  if (rowIdx === -1) sheet.appendRow(values);
  else sheet.getRange(rowIdx, 1, 1, values.length).setValues([values]);
  Logger.log('recordDailyRollup ' + row.location_id + ' ' + row.date + ' rev=' + row.revenue);
  return row;
}

/**
 * Backfill HQ_DAILY cho khoảng [from,to] (vd để Looker có data lịch sử, hoặc bù ngày trigger lỡ).
 * Cap 120 ngày/lần tránh timeout. @return {number} số ngày ghi.
 */
function recordRollupRange(from, to) {
  if (!from || !to) throw new Error('recordRollupRange cần from + to (yyyy-MM-dd)');
  var ms = 86400000, cur = new Date(from + 'T00:00:00+07:00').getTime();
  var end = new Date(to + 'T00:00:00+07:00').getTime(), n = 0, guard = 0;
  while (cur <= end && guard < 120) {
    recordDailyRollup(Utilities.formatDate(new Date(cur), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'));
    cur += ms; n++; guard++;
  }
  Logger.log('recordRollupRange ' + from + '..' + to + ' → ' + n + ' ngày');
  return n;
}

/** Trigger hằng ngày 1:10 sáng: chốt rollup HÔM QUA. */
function recordRollupYesterday() { return recordDailyRollup(); }
function installDailyRollupTrigger() {
  var t = ScriptApp.getProjectTriggers();
  for (var i = 0; i < t.length; i++) if (t[i].getHandlerFunction() === 'recordRollupYesterday') ScriptApp.deleteTrigger(t[i]);
  ScriptApp.newTrigger('recordRollupYesterday').timeBased().everyDays(1).atHour(1).nearMinute(10).create();
}

/**
 * #1 — Snapshot MENU cứng từ HQ master (đọc tĩnh, tránh IMPORTRANGE lag chặn đặt món).
 * NO-OP nếu chưa set CONFIG.MENU_MASTER_SHEET_ID (1 chi nhánh → MENU local không bị đụng).
 * Chạy daily 3AM ở chi nhánh "managed". Ghi đè toàn bộ MENU bằng giá trị từ master.
 * @return {Object}
 */
function snapshotMenuFromMaster() {
  var masterId = getConfig('MENU_MASTER_SHEET_ID');
  if (!masterId || String(masterId).indexOf('<') === 0) {
    Logger.log('snapshotMenuFromMaster: chưa có MENU_MASTER_SHEET_ID → bỏ qua (single branch).');
    return { ok: true, skipped: 'no_master' };
  }
  var masterSS;
  try { masterSS = SpreadsheetApp.openById(masterId); }
  catch (e) { logError('menu.snapshot.open', e); return { ok: false, error: 'cannot open master ' + masterId }; }
  var masterMenu = masterSS.getSheetByName('MENU');
  if (!masterMenu || masterMenu.getLastRow() < 1) return { ok: false, error: 'master MENU empty' };
  var values = masterMenu.getDataRange().getValues();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var local = ss.getSheetByName('MENU') || ss.insertSheet('MENU');
  local.clearContents();
  local.getRange(1, 1, values.length, values[0].length).setValues(values);
  Logger.log('snapshotMenuFromMaster: copied ' + (values.length - 1) + ' món từ master.');
  return { ok: true, rows: values.length - 1 };
}
function installMenuSnapshotTrigger() {
  var t = ScriptApp.getProjectTriggers();
  for (var i = 0; i < t.length; i++) if (t[i].getHandlerFunction() === 'snapshotMenuFromMaster') ScriptApp.deleteTrigger(t[i]);
  ScriptApp.newTrigger('snapshotMenuFromMaster').timeBased().everyDays(1).atHour(3).create();
}

/* ── FOOT_TRAFFIC (đếm khách VÀO cửa, ẩn danh) — nền cho conversion = đơn/khách ── */
var FOOT_TRAFFIC_HEADERS = ['date', 'location_id', 'walk_ins', 'source', 'recorded_at'];

function _footSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName('FOOT_TRAFFIC');
  if (!s) {
    s = ss.insertSheet('FOOT_TRAFFIC');
    s.appendRow(FOOT_TRAFFIC_HEADERS);
    s.getRange(1, 1, 1, FOOT_TRAFFIC_HEADERS.length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
    s.setFrozenRows(1);
  }
  return s;
}

/** Lượt khách vào cửa cho ngày + location (0 nếu chưa có). */
function _getWalkIns(date, loc) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName('FOOT_TRAFFIC');
  if (!s || s.getLastRow() < 2) return 0;
  var d = s.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    if (_asDateStr(d[i][0]) === date && String(d[i][1] || loc) === String(loc)) return Number(d[i][2]) || 0;
  }
  return 0;
}

/**
 * Ghi/cập nhật lượt khách vào cửa (Mac mini đếm bằng camera → POST traffic_ingest).
 * Upsert theo (date + location). source: 'camera' | 'manual'.
 */
function recordTraffic(date, walkIns, source) {
  var loc = _locationId();
  if (!date) date = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  var s = _footSheet();
  var data = s.getLastRow() >= 2 ? s.getDataRange().getValues() : [];
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (_asDateStr(data[i][0]) === date && String(data[i][1]) === String(loc)) { rowIdx = i + 1; break; }
  }
  var now = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm');
  var vals = [date, loc, Number(walkIns) || 0, source || 'camera', now];
  if (rowIdx === -1) s.appendRow(vals);
  else s.getRange(rowIdx, 1, 1, vals.length).setValues([vals]);
  Logger.log('recordTraffic ' + loc + ' ' + date + ' walk_ins=' + walkIns);
  return { ok: true, date: date, location_id: loc, walk_ins: Number(walkIns) || 0 };
}
