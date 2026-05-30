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
      '🌅 <b>CHECKLIST MỞ QUÁN</b>\n' +
      '<i>06:00 - ' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM') + '</i>\n\n' +
      '☐ Bật điện tổng + signage\n' +
      '☐ POS + Glide tablet OK\n' +
      '☐ Wi-Fi router + 4G backup\n' +
      '☐ Máy pha cà phê: flush 3s mỗi group head\n' +
      '☐ Máy nước nóng / boiler\n' +
      '☐ Máy đá — kiểm mực\n' +
      '☐ Fridge <5°C / Freezer <-18°C\n' +
      '☐ Pha mẻ trà đầu (matcha + hojicha) — label batch\n' +
      '☐ Pha mẻ trân châu (60p shelf-life)\n' +
      '☐ Setup quầy: ly, ống hút, túi, napkin\n' +
      '☐ Vệ sinh quầy + bàn\n' +
      '☐ Loa + playlist\n' +
      '☐ Phòng vệ sinh OK\n' +
      '☐ Biển "OPEN" + bảng menu\n' +
      '☐ Đếm float đầu ca → <code>/chot-ca open</code>\n' +
      '☐ Quick check maintenance overdue → <code>/bao-tri</code>'
    );
  } catch (err) { logError('cronOpenChecklist', err); }
}

/** 21:30 daily — nhắc waste log + cash close + đóng quán. */
function cronCloseChecklistReminder() {
  try {
    var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    var formUrl = ScriptApp.getService().getUrl();

    sendTelegramAlert(
      '🌙 <b>NHẮC CLOSE QUÁN</b>\n' +
      '<i>21:30 - ' + today + '</i>\n\n' +
      '☐ <b>Log waste cuối ngày</b> — <code>/huy</code> hoặc form: ' + formUrl + '?action=waste_form\n' +
      '☐ <b>Cash recon</b> — <code>/chot-ca close</code>\n' +
      '☐ Máy pha cà phê: backflush chemical\n' +
      '☐ FIFO check fridge — label batch mở\n' +
      '☐ Lau quầy + sàn + sanitize tools\n' +
      '☐ Rác + sanitize toilet\n' +
      '☐ Tắt máy + đèn (giữ Wi-Fi)\n' +
      '☐ Khóa cửa + biển CLOSED\n\n' +
      '<i>Nếu có incident/review → gõ /handover hoặc /sang sáng mai.</i>'
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

    var msg = '📦 <b>STOCK LOW ALERT</b>\n' +
              '<i>' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM HH:mm') + '</i>\n\n';
    lowItems.slice(0, 12).forEach(function (it) {
      msg += '- ' + it.name + ': ' + it.stock + it.unit + ' / min ' + it.min + it.unit;
      if (it.supplier) msg += ' (vendor: ' + it.supplier + ')';
      msg += '\n';
    });
    if (lowItems.length > 12) msg += '... +' + (lowItems.length - 12) + ' more\n';
    msg += '\nGõ <code>/sang</code> để xem priority + draft order.';

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

    var msg = '🥡 <b>FIFO SHELF-LIFE ALERT</b>\n' +
              '<i>17:00 - ' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM') + '</i>\n\n';
    warnings.slice(0, 10).forEach(function (w) {
      msg += '⚠️ ' + w.name + ' — ' + w.stock + w.unit +
             ' (mở ' + w.ageDays + 'd / shelf ' + w.shelfDays + 'd)\n';
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

    var msg = '📅 <b>WEEKLY OPS DIGEST</b>\n' +
              '<i>' + fromStr + ' → ' + toStr + '</i>\n\n';

    if (waste && waste.ok) {
      msg += '🗑️ <b>Waste</b>: ' + formatCurrency(waste.total_cost) +
             ' (' + waste.entry_count + ' entries)\n';
    }
    if (cash && cash.ok) {
      var c = cash.counts || {};
      msg += '🧾 <b>Cash</b>: ' + (c.ok || 0) + ' ok / ' + (c.warn || 0) + ' warn / ' + (c.alert || 0) + ' alert' +
             ' (var abs ' + formatCurrency(cash.total_variance_abs) + ')\n';
    }
    if (overdueMaint && overdueMaint.length > 0) {
      var overdueCount = overdueMaint.filter(function (t) { return t.status === 'overdue'; }).length;
      var dueCount = overdueMaint.filter(function (t) { return t.status === 'due'; }).length;
      msg += '🔧 <b>Maintenance</b>: ' + overdueCount + ' overdue / ' + dueCount + ' due\n';
    }

    msg += '\nGõ <code>/tuan</code> để xem full brief tuần.';
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
  try {
    sendTelegramAlert(
      '✅ <b>OPS TRIGGERS REGISTERED</b>\n' +
      '- 06:00 daily — open checklist\n' +
      '- 08:00 daily — inventory low\n' +
      '- 17:00 daily — FIFO check\n' +
      '- 21:30 daily — close checklist + waste reminder\n' +
      '- 22:00 daily — equipment maintenance\n' +
      '- 06:30 Friday — weekly ops digest'
    );
  } catch (_) {}
  return { ok: true, registered: 6 };
}

/** Idempotent seed Phase D — CUSTOMERS RFM schema extension. */
function setupPhaseD() {
  extendCustomersSchema();
  Logger.log('Phase D setup complete');
  try {
    sendTelegramAlert(
      '✅ <b>PHASE D SETUP COMPLETE</b>\n' +
      'CUSTOMERS extended với 9 columns RFM.\n' +
      'Run <code>computeRfmScores()</code> để segment lần đầu.\n\n' +
      'Claude scheduled tasks (RFM weekly, content daily, ...) cần setup riêng qua mcp__scheduled-tasks.'
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
      '✅ <b>PHASE C SETUP COMPLETE</b>\n' +
      'Sheets: WASTE_LOG, CASH_LOG, MAINTENANCE_LOG, REVIEWS_LOG\n' +
      'CONFIG defaults: CASH_VARIANCE_WARN_VND=20k, ALERT_VND=50k, FLOAT=500k\n' +
      'Maintenance seeded với cadence chuẩn industry.\n\n' +
      'Tiếp: chạy <code>setupOpsTriggers()</code> để bật cron.'
    );
  } catch (_) {}
  return { ok: true };
}
