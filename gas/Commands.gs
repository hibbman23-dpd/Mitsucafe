/**
 * Commands.gs — COMMAND_QUEUE: cầu nối chat Dashboard → Claude Code.
 *
 * Luồng:
 *   1. Chat trên dashboard POST queue_command {text} → ghi row status=pending
 *   2. Claude Code (lệnh /inbox, chạy tay hoặc scheduled) GET command_queue?status=pending
 *      → thực thi (route sang skill phù hợp) → POST command_update {id, status:done, result}
 *   3. Dashboard poll command_queue → hiện status + result như khung chat
 *
 * KHÔNG real-time: trễ = nhịp poll của Claude Code. Máy phải bật Claude Code.
 * Dùng đúng gói Claude Code hiện tại — không tốn phí API.
 */

var COMMAND_QUEUE_HEADERS = [
  'command_id', 'created_at', 'text', 'status', 'result', 'updated_at', 'source'
];

function initCommandQueueSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('COMMAND_QUEUE');
  if (sheet) { Logger.log('COMMAND_QUEUE already exists.'); return; }
  sheet = ss.insertSheet('COMMAND_QUEUE');
  sheet.appendRow(COMMAND_QUEUE_HEADERS);
  sheet.getRange(1, 1, 1, COMMAND_QUEUE_HEADERS.length)
    .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  Logger.log('COMMAND_QUEUE tab created.');
}

/** Chat ghi 1 lệnh. status = pending. */
function queueCommand(p) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('COMMAND_QUEUE');
  if (!sheet) { initCommandQueueSheet(); sheet = ss.getSheetByName('COMMAND_QUEUE'); }
  var id = 'CMD-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd-HHmmss')
           + '-' + Math.floor(Math.random() * 1000);
  sheet.appendRow([id, new Date().toISOString(), p.text || '', 'pending', '', '', p.source || 'dashboard']);
  return { ok: true, command_id: id };
}

/** Lấy lệnh theo status (mặc định tất cả, mới→cũ). Cho cả poller lẫn chat hiển thị. */
function getCommandQueue(status, limit) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('COMMAND_QUEUE');
  if (!sheet || sheet.getLastRow() < 2) return [];
  limit = limit || 30;
  var data = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = data.length - 1; i >= 1 && rows.length < limit; i--) {
    if (status && data[i][3] !== status) continue;
    rows.push({
      command_id: data[i][0], created_at: data[i][1], text: data[i][2],
      status: data[i][3], result: data[i][4], updated_at: data[i][5], source: data[i][6],
    });
  }
  return rows;
}

/** Dispatcher (Claude Code /inbox) ghi nhịp tim mỗi lần chạy. */
function recordDispatcherHeartbeat() {
  setConfig('DISPATCHER_LAST_RUN', new Date().toISOString());
  return { ok: true };
}

/** Trạng thái dispatcher: online nếu heartbeat < 180s (loop 2 phút). */
function getDispatcherStatus() {
  var last = getConfig('DISPATCHER_LAST_RUN');
  if (!last) return { ok: true, online: false, last_run: null, age_sec: null };
  var age = Math.round((Date.now() - new Date(last).getTime()) / 1000);
  return { ok: true, online: age < 180, last_run: last, age_sec: age };
}

/** Claude Code cập nhật kết quả sau khi chạy. */
function updateCommand(p) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('COMMAND_QUEUE');
  if (!sheet) return { ok: false, error: 'COMMAND_QUEUE missing' };
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === p.command_id) {
      if (p.status != null) sheet.getRange(i + 1, 4).setValue(p.status);   // status
      if (p.result != null) sheet.getRange(i + 1, 5).setValue(p.result);   // result
      sheet.getRange(i + 1, 6).setValue(new Date().toISOString());          // updated_at
      return { ok: true, command_id: p.command_id };
    }
  }
  return { ok: false, error: p.command_id + ' not found' };
}
