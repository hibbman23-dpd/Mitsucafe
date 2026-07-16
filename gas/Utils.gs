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
  var headers = getSheetHeaders(sheet);
  var colIdx = headers.indexOf(colName) + 1;
  if (colIdx === 0) throw new Error('Column not found: ' + colName);

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  // Thử tìm trong 200 dòng gần nhất trước (tối ưu hóa hiệu năng)
  var startRow = Math.max(2, lastRow - 200 + 1);
  var numRows = lastRow - startRow + 1;
  var data = sheet.getRange(startRow, 1, numRows, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === orderId) {
      sheet.getRange(startRow + i, colIdx).setValue(value);
      return;
    }
  }

  // Fallback: Quét toàn bộ cột A
  var fullData = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < fullData.length; i++) {
    if (fullData[i][0] === orderId) {
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

/**
 * Che PII trong snapshot trước khi ghi ERROR_LOG. Chạy TRƯỚC khi ghi sheet —
 * PII không bao giờ chạm ERROR_LOG hay prompt /fix.
 */
var SNAPSHOT_PII_FIELDS = ['customer_name', 'delivery_address', 'notes', 'notes_raw', 'address'];
function redactSnapshot(snapshot) {
  if (!snapshot) return '';
  var copy = {};
  for (var key in snapshot) {
    if (!snapshot.hasOwnProperty(key)) continue;
    var val = snapshot[key];
    if (key === 'customer_id' && typeof val === 'string' && val.length >= 4) {
      copy[key] = '****' + val.slice(-4);
    } else if (SNAPSHOT_PII_FIELDS.indexOf(key) !== -1) {
      copy[key] = '[redacted]';
    } else {
      copy[key] = val;
    }
  }
  var out = JSON.stringify(copy);
  if (out.length > 2000) out = out.slice(0, 2000);
  return out;
}

function logError(context, err, snapshot) {
  var msg = String((err && err.message) || err);
  var stack = String((err && err.stack) || '');
  var snapshotStr = snapshot ? redactSnapshot(snapshot) : '';
  var nowIso = new Date().toISOString();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('ERROR_LOG');
  if (!sheet) {
    sheet = ss.insertSheet('ERROR_LOG');
    sheet.appendRow(['timestamp', 'context', 'error', 'stack', 'snapshot']);
  }
  sheet.appendRow([nowIso, context, msg, stack, snapshotStr]);

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
    var tgMsg = '🚨 LỖI ' + context + ': ' + msg;
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

/**
 * Lấy danh sách tiêu đề cột (Header) từ CacheService nếu có, nếu không thì đọc từ sheet và cache lại.
 */
function getSheetHeaders(sheet) {
  var sheetName = sheet.getName();
  var cache = CacheService.getScriptCache();
  var cachedHeader = cache.get("headers_" + sheetName);
  if (cachedHeader) {
    try {
      var header = JSON.parse(cachedHeader);
      if (header && header.length > 0) return header;
    } catch (e) {}
  }
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  try {
    cache.put("headers_" + sheetName, JSON.stringify(header), 3600); // Lưu 1 tiếng
  } catch (e) {}
  return header;
}

/**
 * Lấy danh sách dòng cuối cùng của bảng tính kèm theo dòng tiêu đề (Header).
 * Tối ưu hóa hiệu năng, giảm dung lượng bộ nhớ đọc/ghi so với getDataRange().getValues().
 */
function getLastRows(sheet, count) {
  var lastRow = sheet.getLastRow();
  if (lastRow === 0) return [];
  var header = getSheetHeaders(sheet);
  if (header.length === 0) return [];
  if (lastRow <= 1) return [header];
  
  var lastCol = header.length;
  var startRow = Math.max(2, lastRow - count + 1);
  var numRows = lastRow - startRow + 1;
  
  var data = sheet.getRange(startRow, 1, numRows, lastCol).getValues();
  data.unshift(header);
  return data;
}

/**
 * Dịch mã thiết bị, loại tác vụ và trạng thái bảo trì sang tiếng Việt.
 * @param {string} key
 * @return {string}
 */
function translateMaintTerm(key) {
  var dict = {
    'due': 'Tới hạn',
    'overdue': 'Quá hạn',
    'ok': 'Đã hoàn thành',
    'Champions': 'Khách VIP (Champions)',
    'Loyal': 'Khách thân thiết (Loyal)',
    'Promising': 'Khách tiềm năng',
    'Hibernating': 'Khách ngủ đông (sắp rời bỏ)',
    'Lost': 'Khách đã mất',
    'EQ-ESP': 'Máy pha Espresso',
    'EQ-GRD': 'Máy xay cafe',
    'EQ-ICE': 'Máy làm đá',
    'EQ-WTR': 'Máy lọc nước sinh hoạt',
    'EQ-FRG': 'Tủ lạnh',
    'EQ-FRZ': 'Tủ đông',
    'EQ-PRN': 'Máy in hóa đơn',
    'EQ-PRT': 'Máy in tem',
    'EQ-BLD': 'Máy xay sinh tố',
    'EQ-SEL': 'Máy dập nắp cốc',
    'EQ-SHK': 'Máy lắc trà sữa',
    'EQ-MLK': 'Máy đánh sữa',
    'backflush_chemical': 'Vệ sinh họng pha bằng thuốc',
    'soak_screen_gasket': 'Ngâm filter & gioăng họng pha',
    'descale_boiler': 'Tẩy cặn nồi hơi',
    'replace_group_gasket': 'Thay gioăng họng pha',
    'professional_service': 'Bảo dưỡng hãng',
    'burr_brush': 'Vệ sinh lưỡi xay (chổi)',
    'disassemble_clean': 'Tháo rời vệ sinh máy xay',
    'weekly_clean': 'Vệ sinh máy làm đá hàng tuần',
    'deep_sanitize': 'Khử trùng sâu máy làm đá',
    'replace_water_filter': 'Thay lõi lọc nước máy đá',
    'cartridge_replace': 'Thay lõi lọc nước sinh hoạt',
    'weekly_wipe': 'Lau chùi tủ lạnh hàng tuần',
    'monthly_defrost_check': 'Kiểm tra xả tuyết tủ lạnh',
    'monthly_defrost': 'Xả tuyết tủ đông',
    'head_clean': 'Vệ sinh đầu in',
    'blade_clean': 'Vệ sinh lưỡi dao máy xay',
    'belt_check': 'Kiểm tra dây curoa/băng tải'
  };
  return dict[key] || key;
}
