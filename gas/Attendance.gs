/**
 * Attendance.gs — tab ATTENDANCE + upsert từ Mac Mini + relay Telegram.
 *
 * Nguồn ghi là SQLite trên Mac Mini; sheet này là bản sao để báo cáo và lưu trữ.
 * Telegram phải relay qua đây vì TELEGRAM_BOT_TOKEN nằm ở CONFIG sheet —
 * guardrail CLAUDE.md cấm token nằm trong code phía Python.
 */

var ATTENDANCE_HEADERS = [
  'punch_id', 'staff_id', 'staff_name', 'date',
  'clock_in_at', 'clock_out_at', 'status', 'minutes_worked',
  'source', 'edited_by', 'edited_at', 'edit_note', 'created_at'
];

function ensureAttendanceSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('ATTENDANCE');
  if (sheet) return sheet;
  sheet = ss.insertSheet('ATTENDANCE');
  sheet.appendRow(ATTENDANCE_HEADERS);
  sheet.getRange(1, 1, 1, ATTENDANCE_HEADERS.length)
       .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  Logger.log('ATTENDANCE sheet created');
  return sheet;
}

/**
 * Upsert một ca theo punch_id. Idempotent: gọi lại N lần vẫn ra một dòng.
 * @param {Object} payload — { row: {...} }
 */
function attendanceUpsert(payload) {
  var row = (payload && payload.row) || {};
  if (!row.punch_id) return { ok: false, error: 'thiếu punch_id' };

  var sheet = ensureAttendanceSheet();
  var values = ATTENDANCE_HEADERS.map(function (h) {
    return row[h] === undefined || row[h] === null ? '' : row[h];
  });

  var ids = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
    : [];
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(row.punch_id)) {
      sheet.getRange(i + 2, 1, 1, values.length).setValues([values]);
      return { ok: true, punch_id: row.punch_id, updated: true };
    }
  }
  sheet.appendRow(values);
  return { ok: true, punch_id: row.punch_id, updated: false };
}

/**
 * Relay Telegram. Text do Mac Mini dựng từ SQLite (bản gốc, không lệch sync).
 */
function attendanceAlert(payload) {
  var text = (payload && payload.text) || '';
  if (!text) return { ok: false, error: 'thiếu text' };
  try {
    sendTelegramAlert(text);
    return { ok: true };
  } catch (err) {
    logError('attendanceAlert', err);
    return { ok: false, error: String(err) };
  }
}

/**
 * Trả STAFF cho Mac Mini dựng cache. PIN đi qua đây ở dạng thô rồi được băm
 * ngay phía Python — không bao giờ ghi thô xuống đĩa.
 */
function attendanceStaff() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('STAFF');
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, staff: [] };
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = data[r][c];
    if (!obj.staff_id) continue;
    out.push({
      staff_id: String(obj.staff_id),
      name: String(obj.name || ''),
      role: String(obj.role || '').toLowerCase(),
      active: obj.active === true || String(obj.active).toUpperCase() === 'TRUE',
      pin: String(obj.pin || '')
    });
  }
  return { ok: true, staff: out };
}
