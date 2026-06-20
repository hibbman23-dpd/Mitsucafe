/**
 * OpsTriggers.gs — Operational cron stubs + trigger registration.
 *
 * Cron jobs:
 *   cronOpenChecklist (06:00 daily)           → Telegram opening checklist
 *   cronCloseChecklistReminder (21:30 daily)  → nhắc waste log + cash close
 *   cronInventoryLow (08:00 daily)            → quét INVENTORY < min_stock
 *   cronFifoCheck (17:00 daily)               → cảnh báo lô approaching shelf-life
 *   cronWasteLogReminder (Waste.gs, 21:30 reused trong cronCloseChecklistReminder)
 *   cronEquipmentMaintReminder (Maintenance.gs, 22:00 daily)
 *   cronWeeklyOpsDigest (06:30 Friday)        → tổng hợp tuần
 *
 * Setup: chạy thủ công 1 lần qua editor — gọi setupOpsTriggers().
 *
 * Phase: C/D (F&B Ops + automation).
 */

// ─────────────────────────────────────────────────────────────────────
// Cron stubs — gửi Telegram digest
// ─────────────────────────────────────────────────────────────────────

/** 06:00 daily — opening checklist reminder. */
function cronOpenChecklist() {
  try {
    sendTelegramAlert(
      '🌅 <b>DANH SÁCH MỞ QUÁN</b>\n' +
      '<i>06:00 - ' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM') + '</i>\n\n' +
      '☐ Bật điện tổng + biển hiệu\n' +
      '☐ Máy tính tiền + máy tính bảng đặt món OK\n' +
      '☐ Wi-Fi + 4G dự phòng\n' +
      '☐ Máy pha cà phê: xả 3 giây mỗi đầu pha\n' +
      '☐ Máy đun nước nóng\n' +
      '☐ Máy đá — kiểm mực\n' +
      '☐ Tủ mát <5°C / Tủ đông <-18°C\n' +
      '☐ Pha mẻ trà đầu (matcha + hojicha) — dán nhãn mẻ\n' +
      '☐ Pha mẻ trân châu (dùng trong 60 phút)\n' +
      '☐ Chuẩn bị quầy: ly, ống hút, túi, khăn giấy\n' +
      '☐ Vệ sinh quầy + bàn\n' +
      '☐ Loa + nhạc nền\n' +
      '☐ Nhà vệ sinh sạch\n' +
      '☐ Biển "MỞ CỬA" + bảng thực đơn\n' +
      '☐ Đếm tiền lẻ đầu ca → <code>/chot-ca open</code>\n' +
      '☐ Kiểm tra nhanh bảo trì tới hạn → <code>/bao-tri</code>'
    );
  } catch (err) { logError('cronOpenChecklist', err); }
}

/** 21:30 daily — nhắc waste log + cash close + đóng quán. */
function cronCloseChecklistReminder() {
  try {
    var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    var formUrl = ScriptApp.getService().getUrl();

    sendTelegramAlert(
      '🌙 <b>NHẮC ĐÓNG QUÁN</b>\n' +
      '<i>21:30 - ' + today + '</i>\n\n' +
      '☐ <b>Ghi hao hụt cuối ngày</b> — <code>/huy</code> hoặc biểu mẫu: ' + formUrl + '?action=waste_form\n' +
      '☐ <b>Đối soát két tiền</b> — <code>/chot-ca close</code>\n' +
      '☐ Máy pha cà phê: súc rửa bằng hoá chất\n' +
      '☐ Kiểm tra hạn tủ mát — dán nhãn mẻ đã mở\n' +
      '☐ Lau quầy + sàn + khử khuẩn dụng cụ\n' +
      '☐ Đổ rác + khử khuẩn nhà vệ sinh\n' +
      '☐ Tắt máy + đèn (giữ Wi-Fi)\n' +
      '☐ Khóa cửa + biển "ĐÓNG CỬA"\n\n' +
      '<i>Nếu có sự cố/đánh giá xấu → gõ /handover hoặc /sang sáng mai.</i>'
    );

    // Đồng thời chạy cronWasteLogReminder (nếu user chưa nhập waste, send thêm urgent prompt)
    try { cronWasteLogReminder(); } catch (_) {}
  } catch (err) { logError('cronCloseChecklistReminder', err); }
}

/** 08:00 daily — quét INVENTORY < min_stock. */
function cronInventoryLow() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('INVENTORY');
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var idxName = headers.indexOf('name');
    var idxUnit = headers.indexOf('unit');
    var idxStock = headers.indexOf('current_stock');
    var idxMin = headers.indexOf('min_stock');
    var idxSupplier = headers.indexOf('supplier');
    var lowItems = [];
    for (var i = 1; i < data.length; i++) {
      var stock = parseFloat(data[i][idxStock]) || 0;
      var min = parseFloat(data[i][idxMin]) || 0;
      if (min > 0 && stock <= min) {
        lowItems.push({
          name: data[i][idxName],
          stock: stock,
          min: min,
          unit: data[i][idxUnit],
          supplier: data[i][idxSupplier] || ''
        });
      }
    }
    if (lowItems.length === 0) return;

    var msg = '📦 <b>CẢNH BÁO TỒN KHO THẤP</b>\n' +
              '<i>' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM HH:mm') + '</i>\n\n';
    lowItems.slice(0, 12).forEach(function (it) {
      msg += '- ' + it.name + ': ' + it.stock + it.unit + ' / tối thiểu ' + it.min + it.unit;
      if (it.supplier) msg += ' (nhà cung cấp: ' + it.supplier + ')';
      msg += '\n';
    });
    if (lowItems.length > 12) msg += '... +' + (lowItems.length - 12) + ' mục nữa\n';
    msg += '\nGõ <code>/sang</code> để xem thứ tự ưu tiên + nháp đơn nhập.';

    // Throttle qua logError pattern để chống spam (chỉ 1 alert/6h cho cùng "stock low")
    logError('inventory.lowStock', new Error(msg.replace(/<[^>]+>/g, '')));
  } catch (err) { logError('cronInventoryLow', err); }
}

/** 17:00 daily — FIFO check, cảnh báo lô approaching shelf-life. */
function cronFifoCheck() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('INVENTORY');
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var idxName = headers.indexOf('name');
    var idxStock = headers.indexOf('current_stock');
    var idxUnit = headers.indexOf('unit');
    var idxLastUpdated = headers.indexOf('last_updated');

    // Shelf-life mapping (theo food-safety.md table) — fallback nếu chưa có cột riêng
    var SHELF_LIFE_DAYS_BY_NAME_KEYWORD = [
      { kw: /trân châu|boba|pearl/i, days: 0.5 },   // 12h fridge
      { kw: /trà ủ|brewed tea|matcha pha|hojicha pha/i, days: 1 },  // 24h fridge
      { kw: /milk foam/i, days: 0.17 },              // 4h fridge
      { kw: /sữa tươi|fresh milk/i, days: 4 },       // 3-5 days mở
      { kw: /whipping/i, days: 6 },
      { kw: /pudding|thạch/i, days: 4 },
      { kw: /croissant|bánh/i, days: 3 },
      { kw: /syrup/i, days: 30 },
      { kw: /espresso bean/i, days: 14 }
    ];

    var now = Date.now();
    var warnings = [];
    for (var i = 1; i < data.length; i++) {
      var name = String(data[i][idxName] || '');
      var stock = parseFloat(data[i][idxStock]) || 0;
      var lastUpdated = data[i][idxLastUpdated];
      if (stock <= 0 || !lastUpdated) continue;
      var lastTs = (lastUpdated instanceof Date) ? lastUpdated.getTime() : new Date(String(lastUpdated)).getTime();
      if (isNaN(lastTs)) continue;
      var ageDays = (now - lastTs) / 86400000;

      // Lookup shelf-life
      var shelfDays = 0;
      for (var k = 0; k < SHELF_LIFE_DAYS_BY_NAME_KEYWORD.length; k++) {
        if (SHELF_LIFE_DAYS_BY_NAME_KEYWORD[k].kw.test(name)) {
          shelfDays = SHELF_LIFE_DAYS_BY_NAME_KEYWORD[k].days;
          break;
        }
      }
      if (shelfDays === 0) continue;

      if (ageDays >= shelfDays * 0.8) {
        warnings.push({
          name: name,
          stock: stock,
          unit: data[i][idxUnit],
          ageDays: Math.round(ageDays * 10) / 10,
          shelfDays: shelfDays
        });
      }
    }
    if (warnings.length === 0) return;

    var msg = '🥡 <b>CẢNH BÁO HẠN SỬ DỤNG</b>\n' +
              '<i>17:00 - ' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM') + '</i>\n\n';
    warnings.slice(0, 10).forEach(function (w) {
      msg += '⚠️ ' + w.name + ' — ' + w.stock + w.unit +
             ' (đã mở ' + w.ageDays + ' ngày / hạn ' + w.shelfDays + ' ngày)\n';
    });
    msg += '\n→ Dùng tối nay hoặc log <code>/huy</code> nếu phải bỏ.';

    sendTelegramAlert(msg);
  } catch (err) { logError('cronFifoCheck', err); }
}

/** 06:30 Friday — weekly ops digest (Phase D). */
function cronWeeklyOpsDigest() {
  try {
    var today = new Date();
    var monday = new Date(today.getTime() - 4 * 86400000);  // Friday - 4 = Monday
    var fromStr = Utilities.formatDate(monday, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    var toStr = Utilities.formatDate(today, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');

    var waste = wasteReport(fromStr, toStr);
    var cash = cashVarianceReport(fromStr, toStr);
    var overdueMaint = getOverdueMaint();

    var msg = '📅 <b>TỔNG HỢP VẬN HÀNH TUẦN</b>\n' +
              '<i>' + fromStr + ' → ' + toStr + '</i>\n\n';

    if (waste && waste.ok) {
      msg += '🗑️ <b>Hao hụt</b>: ' + formatCurrency(waste.total_cost) +
             ' (' + waste.entry_count + ' lần ghi)\n';
    }
    if (cash && cash.ok) {
      var c = cash.counts || {};
      msg += '🧾 <b>Két tiền</b>: ' + (c.ok || 0) + ' ổn / ' + (c.warn || 0) + ' cảnh báo / ' + (c.alert || 0) + ' báo động' +
             ' (lệch tổng ' + formatCurrency(cash.total_variance_abs) + ')\n';
    }
    if (overdueMaint && overdueMaint.length > 0) {
      var overdueCount = overdueMaint.filter(function (t) { return t.status === 'overdue'; }).length;
      var dueCount = overdueMaint.filter(function (t) { return t.status === 'due'; }).length;
      msg += '🔧 <b>Bảo trì</b>: ' + overdueCount + ' quá hạn / ' + dueCount + ' tới hạn\n';
    }

    msg += '\nGõ <code>/tuan</code> để xem báo cáo tuần đầy đủ.';
    sendTelegramAlert(msg);
  } catch (err) { logError('cronWeeklyOpsDigest', err); }
}

// ─────────────────────────────────────────────────────────────────────
// Trigger registration
// ─────────────────────────────────────────────────────────────────────

/**
 * Setup tất cả ops triggers. Idempotent — xoá trigger cũ trước khi tạo mới.
 * Chạy thủ công 1 lần qua GAS editor.
 */
function setupOpsTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var handlers = [
    'cronOpenChecklist',
    'cronCloseChecklistReminder',
    'cronInventoryLow',
    'cronFifoCheck',
    'cronEquipmentMaintReminder',
    'cronWeeklyOpsDigest'
  ];

  // Xoá triggers cũ
  triggers.forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Tạo mới
  ScriptApp.newTrigger('cronOpenChecklist')
           .timeBased().everyDays(1).atHour(6).create();
  ScriptApp.newTrigger('cronInventoryLow')
           .timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('cronFifoCheck')
           .timeBased().everyDays(1).atHour(17).create();
  ScriptApp.newTrigger('cronCloseChecklistReminder')
           .timeBased().everyDays(1).atHour(21).nearMinute(30).create();
  ScriptApp.newTrigger('cronEquipmentMaintReminder')
           .timeBased().everyDays(1).atHour(22).create();
  ScriptApp.newTrigger('cronWeeklyOpsDigest')
           .timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(6).nearMinute(30).create();

  Logger.log('Ops triggers registered: 6 triggers');

  // Register the weekly database backup trigger
  try {
    installBackupTrigger();
  } catch (backupErr) {
    logError('setupOpsTriggers.backup', backupErr);
  }

  try {
    sendTelegramAlert(
      '✅ <b>ĐÃ BẬT LỊCH NHẮC VẬN HÀNH & SAO LƯU</b>\n' +
      '- 06:00 hằng ngày — danh sách mở quán\n' +
      '- 08:00 hằng ngày — cảnh báo tồn kho thấp\n' +
      '- 17:00 hằng ngày — kiểm tra hạn dùng\n' +
      '- 21:30 hằng ngày — danh sách đóng quán + nhắc hao hụt\n' +
      '- 22:00 hằng ngày — bảo trì thiết bị\n' +
      '- 06:30 Thứ 6 — tổng hợp vận hành tuần\n' +
      '- 04:00 Thứ 2 hằng tuần — tự động sao lưu dữ liệu'
    );
  } catch (_) {}
  return { ok: true, registered: 7 };
}

/** Idempotent seed Phase D — CUSTOMERS RFM schema extension. */
function setupPhaseD() {
  extendCustomersSchema();
  Logger.log('Phase D setup complete');
  try {
    sendTelegramAlert(
      '✅ <b>THIẾT LẬP PHÂN NHÓM KHÁCH HÀNG (RFM) THÀNH CÔNG</b>\n' +
      'Bảng dữ liệu CUSTOMERS đã được mở rộng thêm 9 cột chỉ số RFM.\n' +
      'Hãy chạy thử <code>computeRfmScores()</code> để bắt đầu phân nhóm lần đầu.\n\n' +
      'Các tác vụ định kỳ của trợ lý (báo cáo RFM tuần, viết bài hàng ngày, ...) cần cấu hình riêng.'
    );
  } catch (_) {}
  return { ok: true };
}

/** Idempotent seed all Phase C sheets + default maintenance tasks. */
function setupPhaseC() {
  initWasteLogSheet();
  initCashLogSheet();
  initMaintenanceLogSheet();
  initReviewsLogSheet();
  seedDefaultMaintenanceTasks();

  // Seed CONFIG defaults nếu chưa có
  if (!getConfig('CASH_VARIANCE_WARN_VND')) setConfig('CASH_VARIANCE_WARN_VND', '20000');
  if (!getConfig('CASH_VARIANCE_ALERT_VND')) setConfig('CASH_VARIANCE_ALERT_VND', '50000');
  if (!getConfig('DEFAULT_CASH_FLOAT_VND')) setConfig('DEFAULT_CASH_FLOAT_VND', '500000');

  Logger.log('Phase C setup complete');
  try {
    sendTelegramAlert(
      '✅ <b>THIẾT LẬP PHÂN HỆ VẬN HÀNH (PHASE C) THÀNH CÔNG</b>\n' +
      'Đã khởi tạo các bảng: WASTE_LOG (Hao hụt), CASH_LOG (Két tiền), MAINTENANCE_LOG (Bảo trì thiết bị), REVIEWS_LOG (Đánh giá khách hàng)\n' +
      'Cấu hình két tiền mặc định: Lệch cảnh báo = 20.000đ, Lệch báo động = 50.000đ, Quỹ két ca = 500.000đ\n' +
      'Danh sách bảo trì mẫu đã được nạp theo đúng tần suất chuẩn của ngành.\n\n' +
      'Tiếp theo: Hãy chạy <code>setupOpsTriggers()</code> để kích hoạt lịch nhắc việc.'
    );
  } catch (_) {}
  return { ok: true };
}
