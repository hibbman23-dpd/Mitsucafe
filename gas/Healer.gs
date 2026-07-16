/**
 * Healer.gs — vòng self-healing v2. FIX_QUEUE + enqueueFix.
 * KHÔNG chứa logic deploy — deploy tách sang tiến trình khác (ops/deploy_approved_fix.js).
 */
var FIX_QUEUE_OPEN_STATUSES = ['pending', 'fixing', 'awaiting_approval', 'approved'];
var FIX_QUEUE_MAX_ATTEMPTS = 2;
var FIX_QUEUE_COLUMNS = ['fix_id', 'error_id', 'context', 'error_message', 'stack_trace',
  'snapshot', 'status', 'git_branch', 'base_commit_hash', 'deployed_version',
  'attempts', 'created_at', 'updated_at'];

function _getFixQueueSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('FIX_QUEUE');
  if (!sheet) {
    sheet = ss.insertSheet('FIX_QUEUE');
    sheet.appendRow(FIX_QUEUE_COLUMNS);
  }
  return sheet;
}

function _generateFixId() {
  var now = new Date();
  var ymd = Utilities.formatDate(now, 'GMT+7', 'yyyyMMdd');
  var rand = Math.floor(Math.random() * 9000 + 1000);
  return 'FIX-' + ymd + '-' + rand;
}

/**
 * enqueueFix — gọi từ logError khi muốn đẩy lỗi vào vòng /fix.
 * KHÔNG tự gọi trong logError() (tách rời cố ý — không phải mọi lỗi đều đáng tự sửa,
 * caller quyết định context nào enqueue).
 */
function enqueueFix(context, errorMessage, stackTrace, snapshot) {
  var sheet = _getFixQueueSheet();
  var data = sheet.getDataRange().getValues();
  var attemptsForContext = 0;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowContext = row[2];
    var rowStatus = row[6];
    var rowAttempts = Number(row[10]) || 0;
    if (rowContext !== context) continue;
    if (FIX_QUEUE_OPEN_STATUSES.indexOf(rowStatus) !== -1) {
      return { ok: false, reason: 'dedup' };
    }
    if (rowAttempts >= FIX_QUEUE_MAX_ATTEMPTS) {
      attemptsForContext = rowAttempts;
    }
  }
  if (attemptsForContext >= FIX_QUEUE_MAX_ATTEMPTS) {
    return { ok: false, reason: 'attempts_exceeded' };
  }

  var fixId = _generateFixId();
  var nowIso = new Date().toISOString();
  var snapshotStr = snapshot ? redactSnapshot(snapshot) : '';
  sheet.appendRow([fixId, '', context, errorMessage, stackTrace, snapshotStr,
    'pending', '', '', '', 0, nowIso, nowIso]);
  return { ok: true, fix_id: fixId };
}

var FIX_QUEUE_UPDATABLE_FIELDS = ['status', 'git_branch', 'base_commit_hash', 'deployed_version', 'attempts'];

/** Chỉ trả rows status=pending — dùng bởi _healer qua AUTH.HEALER (token hẹp). */
function healerPullPending() {
  var sheet = _getFixQueueSheet();
  var data = sheet.getDataRange().getValues();
  var fixes = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row[6] !== 'pending') continue;
    var obj = {};
    for (var c = 0; c < FIX_QUEUE_COLUMNS.length; c++) obj[FIX_QUEUE_COLUMNS[c]] = row[c];
    fixes.push(obj);
  }
  return { ok: true, fixes: fixes };
}

/**
 * Ghi patch vào đúng 1 row (theo fix_id). Chỉ nhận field trong
 * FIX_QUEUE_UPDATABLE_FIELDS — _healer không được ghi cột nào khác (vd snapshot,
 * error_message) dù có token đúng.
 */
function healerUpdateFix(fixId, patch) {
  for (var key in patch) {
    if (patch.hasOwnProperty(key) && FIX_QUEUE_UPDATABLE_FIELDS.indexOf(key) === -1) {
      return { ok: false, reason: 'field_not_allowed' };
    }
  }
  var sheet = _getFixQueueSheet();
  var data = sheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === fixId) { rowIdx = i; break; }
  }
  if (rowIdx === -1) return { ok: false, reason: 'not_found' };

  for (var field in patch) {
    if (!patch.hasOwnProperty(field)) continue;
    var colIdx = FIX_QUEUE_COLUMNS.indexOf(field);
    sheet.getRange(rowIdx + 1, colIdx + 1).setValue(patch[field]);
  }
  var updatedAtCol = FIX_QUEUE_COLUMNS.indexOf('updated_at');
  sheet.getRange(rowIdx + 1, updatedAtCol + 1).setValue(new Date().toISOString());
  return { ok: true };
}
