/**
 * Utils.gs — Helpers dùng chung: config, format, error log.
 */

var _CONFIG_CACHE = null;
var _CONFIG_CACHE_TS = 0;
var CONFIG_TTL_MS = 60000; // 1 phút

function getConfig(key) {
  var now = Date.now();
  if (!_CONFIG_CACHE || (now - _CONFIG_CACHE_TS) > CONFIG_TTL_MS) {
    _CONFIG_CACHE = _loadConfig();
    _CONFIG_CACHE_TS = now;
  }
  return _CONFIG_CACHE[key];
}

function setConfig(key, value) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG');
  if (!sheet) throw new Error('CONFIG sheet missing');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      _CONFIG_CACHE = null;
      return;
    }
  }
  sheet.appendRow([key, value]);
  _CONFIG_CACHE = null;
}

function _loadConfig() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG');
  if (!sheet) throw new Error('CONFIG sheet missing');
  var data = sheet.getDataRange().getValues();
  var cfg = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) cfg[data[i][0]] = data[i][1];
  }
  return cfg;
}

/** 70000 → "70.000đ" */
function formatCurrency(amount) {
  return Number(amount).toLocaleString('vi-VN') + 'đ';
}

/** ISO string → "14:32" */
function formatTime(isoString) {
  var d = isoString ? new Date(isoString) : new Date();
  return Utilities.formatDate(d, 'Asia/Ho_Chi_Minh', 'HH:mm');
}

/** ISO/Date → "14:32 06/05/2025" */
function formatTimestamp(date) {
  var d = date instanceof Date ? date : new Date(date);
  return Utilities.formatDate(d, 'Asia/Ho_Chi_Minh', 'HH:mm dd/MM/yyyy');
}

/** Cập nhật 1 ô của 1 đơn theo cột tên */
function updateField(orderId, colName, value) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ORDERS');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIdx = headers.indexOf(colName) + 1;
  if (colIdx === 0) throw new Error('Column not found: ' + colName);

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === orderId) {
      sheet.getRange(i + 2, colIdx).setValue(value);
      return;
    }
  }
}

/**
 * Ghi lỗi vào tab ERROR_LOG + alert Telegram (có throttle chống spam).
 *
 * Throttle: cùng 1 `context` chỉ gửi Telegram tối đa 1 lần / TELEGRAM_THROTTLE_MIN
 * phút. Mọi lỗi đều luôn ghi đầy đủ vào ERROR_LOG.
 * Lý do: trigger cron fire mỗi 23:00, nếu lỗi cứng (permission, quota...) thì
 * không cần báo lại cùng nội dung mỗi đêm.
 */
var TELEGRAM_THROTTLE_MIN = 360; // 6 giờ
function logError(context, err) {
  var msg = String((err && err.message) || err);
  var stack = String((err && err.stack) || '');
  var nowIso = new Date().toISOString();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('ERROR_LOG');
  if (!sheet) {
    sheet = ss.insertSheet('ERROR_LOG');
    sheet.appendRow(['timestamp', 'context', 'error', 'stack']);
  }
  sheet.appendRow([nowIso, context, msg, stack]);

  // Throttle Telegram: dùng PropertiesService, key duy nhất theo context
  var shouldSendTelegram = true;
  var suppressedCount = 0;
  try {
    var props = PropertiesService.getScriptProperties();
    var key = 'last_tg_err_' + context;
    var countKey = 'tg_err_suppressed_' + context;
    var last = parseInt(props.getProperty(key) || '0', 10);
    var ageMin = (Date.now() - last) / 60000;
    if (last && ageMin < TELEGRAM_THROTTLE_MIN) {
      shouldSendTelegram = false;
      var prev = parseInt(props.getProperty(countKey) || '0', 10);
      props.setProperty(countKey, String(prev + 1));
    } else {
      suppressedCount = parseInt(props.getProperty(countKey) || '0', 10);
      props.setProperty(key, String(Date.now()));
      props.setProperty(countKey, '0');
    }
  } catch (_) { /* fall through */ }

  if (!shouldSendTelegram) return;

  try {
    var tgMsg = '🚨 ERROR ' + context + ': ' + msg;
    if (suppressedCount > 0) {
      tgMsg += '\n(Đã bỏ qua ' + suppressedCount + ' lần lặp giống nhau trong ' +
               TELEGRAM_THROTTLE_MIN + ' phút qua)';
    }
    sendTelegramAlert(tgMsg);
  } catch (_) { /* avoid recursion */ }
}

/**
 * Reset throttle counter cho 1 context (hoặc tất cả nếu không truyền tham số).
 * Dùng sau khi đã fix lỗi để Telegram có thể alert tiếp lần sau.
 */
function resetErrorThrottle(context) {
  var props = PropertiesService.getScriptProperties();
  if (context) {
    props.deleteProperty('last_tg_err_' + context);
    props.deleteProperty('tg_err_suppressed_' + context);
    return;
  }
  var all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('last_tg_err_') === 0 || k.indexOf('tg_err_suppressed_') === 0) {
      props.deleteProperty(k);
    }
  });
}
