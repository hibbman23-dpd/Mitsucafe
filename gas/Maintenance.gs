/**
 * Maintenance.gs — Preventive maintenance schedule cho thiết bị quán.
 *
 * Equipment + task cadence chuẩn industry:
 *   - Espresso: daily backflush, weekly soak, monthly descale, quarterly pro, 6mo gasket
 *   - Grinder: weekly burr brush, monthly disassemble
 *   - Ice maker: weekly clean, monthly deep sanitize, quarterly filter
 *   - Water filter: 3-6 months cartridge
 *   - Fridge: weekly wipe, monthly defrost check
 *   - ... (xem references/equipment-maintenance.md)
 *
 * Status auto: ok | due | overdue (qua getOverdueMaint).
 * Cron reminder daily morning + escalate >3 days overdue.
 *
 * Phase: C (F&B Operations).
 */

var _MAINT_GRACE_DAYS = 3;  // sau due bao lâu mới flagged overdue

// ─────────────────────────────────────────────────────────────────────
// Sheet bootstrap + seed default tasks
// ─────────────────────────────────────────────────────────────────────

function initMaintenanceLogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('MAINTENANCE_LOG');
  if (sheet) return sheet;
  sheet = ss.insertSheet('MAINTENANCE_LOG');
  var headers = [
    'task_id', 'equipment', 'task_type', 'frequency_days',
    'last_done_at', 'next_due_at', 'status',
    'staff_id', 'notes', 'photo_url', 'seed_at'
  ];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length)
       .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  Logger.log('MAINTENANCE_LOG sheet created');
  return sheet;
}

/**
 * Seed default maintenance tasks (run 1 lần khi setup).
 * Idempotent: chỉ append nếu chưa có task_id tương ứng.
 */
function seedDefaultMaintenanceTasks() {
  var sheet = initMaintenanceLogSheet();
  var existing = sheet.getDataRange().getValues();
  var existingIds = {};
  for (var i = 1; i < existing.length; i++) existingIds[existing[i][0]] = true;

  var defaults = [
    // Espresso machine
    { equipment: 'EQ-ESP', task_type: 'backflush_chemical', frequency_days: 1 },
    { equipment: 'EQ-ESP', task_type: 'soak_screen_gasket', frequency_days: 7 },
    { equipment: 'EQ-ESP', task_type: 'descale_boiler', frequency_days: 30 },
    { equipment: 'EQ-ESP', task_type: 'replace_group_gasket', frequency_days: 180 },
    { equipment: 'EQ-ESP', task_type: 'professional_service', frequency_days: 90 },
    // Grinder
    { equipment: 'EQ-GRD', task_type: 'burr_brush', frequency_days: 7 },
    { equipment: 'EQ-GRD', task_type: 'disassemble_clean', frequency_days: 30 },
    // Ice maker
    { equipment: 'EQ-ICE', task_type: 'weekly_clean', frequency_days: 7 },
    { equipment: 'EQ-ICE', task_type: 'deep_sanitize', frequency_days: 30 },
    { equipment: 'EQ-ICE', task_type: 'replace_water_filter', frequency_days: 90 },
    // Water filter
    { equipment: 'EQ-WTR', task_type: 'cartridge_replace', frequency_days: 120 },
    // Fridge / Freezer
    { equipment: 'EQ-FRG', task_type: 'weekly_wipe', frequency_days: 7 },
    { equipment: 'EQ-FRG', task_type: 'monthly_defrost_check', frequency_days: 30 },
    { equipment: 'EQ-FRZ', task_type: 'monthly_defrost', frequency_days: 30 },
    // Printers
    { equipment: 'EQ-PRN', task_type: 'head_clean', frequency_days: 30 },
    { equipment: 'EQ-PRT', task_type: 'head_clean', frequency_days: 30 },
    // Blender + Sealer
    { equipment: 'EQ-BLD', task_type: 'blade_clean', frequency_days: 1 },
    { equipment: 'EQ-SEL', task_type: 'belt_check', frequency_days: 30 }
  ];

  var nowIso = new Date().toISOString();
  var added = 0;
  defaults.forEach(function (d) {
    var task_id = 'MTN-' + d.equipment + '-' + d.task_type.toUpperCase();
    if (existingIds[task_id]) return;
    var nextDue = new Date(Date.now() + d.frequency_days * 86400000);
    sheet.appendRow([
      task_id, d.equipment, d.task_type, d.frequency_days,
      '',  // last_done_at (chưa làm bao giờ)
      nextDue.toISOString(),
      'due',  // assume due ngay khi seed (user chạy first time = nên check ngay)
      '', '', '', nowIso
    ]);
    added++;
  });
  Logger.log('Seeded ' + added + ' maintenance tasks');
  return added;
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Mark 1 task done — update last_done_at, recalc next_due_at, status=ok.
 * @param {string} task_id
 * @param {Object} payload — { staff_id, notes, photo_url }
 */
function markMaintenanceDone(task_id, payload) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MAINTENANCE_LOG');
  if (!sheet) throw new Error('MAINTENANCE_LOG sheet missing');
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idx = {
    task_id: headers.indexOf('task_id'),
    frequency_days: headers.indexOf('frequency_days'),
    last_done_at: headers.indexOf('last_done_at'),
    next_due_at: headers.indexOf('next_due_at'),
    status: headers.indexOf('status'),
    staff_id: headers.indexOf('staff_id'),
    notes: headers.indexOf('notes'),
    photo_url: headers.indexOf('photo_url')
  };

  for (var i = 1; i < data.length; i++) {
    if (data[i][idx.task_id] === task_id) {
      var freq = parseInt(data[i][idx.frequency_days], 10) || 30;
      var now = new Date();
      var nextDue = new Date(now.getTime() + freq * 86400000);
      sheet.getRange(i + 1, idx.last_done_at + 1).setValue(now.toISOString());
      sheet.getRange(i + 1, idx.next_due_at + 1).setValue(nextDue.toISOString());
      sheet.getRange(i + 1, idx.status + 1).setValue('ok');
      if (payload && payload.staff_id) sheet.getRange(i + 1, idx.staff_id + 1).setValue(payload.staff_id);
      if (payload && payload.notes) {
        var existing = data[i][idx.notes] || '';
        sheet.getRange(i + 1, idx.notes + 1).setValue(
          existing ? (existing + ' | ' + now.toISOString().slice(0, 10) + ': ' + payload.notes) : payload.notes
        );
      }
      if (payload && payload.photo_url) sheet.getRange(i + 1, idx.photo_url + 1).setValue(payload.photo_url);
      return { task_id: task_id, last_done_at: now.toISOString(), next_due_at: nextDue.toISOString() };
    }
  }
  throw new Error('task_id not found: ' + task_id);
}

/**
 * Refresh status cho TẤT CẢ tasks dựa on next_due_at.
 * Chạy bởi cron hoặc trước getOverdueMaint.
 */
function refreshMaintenanceStatus() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MAINTENANCE_LOG');
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idxDue = headers.indexOf('next_due_at');
  var idxStatus = headers.indexOf('status');
  var now = Date.now();
  var graceMs = _MAINT_GRACE_DAYS * 86400000;

  for (var i = 1; i < data.length; i++) {
    var due = data[i][idxDue];
    if (!due) continue;
    var dueTs = (due instanceof Date) ? due.getTime() : new Date(String(due)).getTime();
    var newStatus;
    if (now < dueTs) newStatus = 'ok';
    else if (now < dueTs + graceMs) newStatus = 'due';
    else newStatus = 'overdue';
    if (newStatus !== data[i][idxStatus]) {
      sheet.getRange(i + 1, idxStatus + 1).setValue(newStatus);
    }
  }
}

/** Lấy list task overdue + due. */
function getOverdueMaint() {
  refreshMaintenanceStatus();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MAINTENANCE_LOG');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idxStatus = headers.indexOf('status');
  var result = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][idxStatus] === 'overdue' || data[i][idxStatus] === 'due') {
      var row = {};
      for (var c = 0; c < headers.length; c++) row[headers[c]] = data[i][c];
      result.push(row);
    }
  }
  // Sort: overdue trước due
  result.sort(function (a, b) {
    if (a.status === b.status) {
      return new Date(a.next_due_at).getTime() - new Date(b.next_due_at).getTime();
    }
    return a.status === 'overdue' ? -1 : 1;
  });
  return result;
}

/** Lấy full list tasks (cho /bao-tri output). */
function getAllMaintenanceTasks() {
  refreshMaintenanceStatus();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MAINTENANCE_LOG');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var c = 0; c < headers.length; c++) row[headers[c]] = data[i][c];
    result.push(row);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────
// Cron: daily reminder
// ─────────────────────────────────────────────────────────────────────

/**
 * Chạy 22:00 daily — Telegram reminder cho task due/overdue.
 * Throttle: 24h dedupe per task qua logError pattern.
 */
function cronEquipmentMaintReminder() {
  try {
    var overdueList = getOverdueMaint();
    if (overdueList.length === 0) {
      Logger.log('No maintenance tasks due');
      return;
    }

    var overdue = overdueList.filter(function (t) { return t.status === 'overdue'; });
    var due = overdueList.filter(function (t) { return t.status === 'due'; });

    var msg = '🔧 <b>TÌNH TRẠNG BẢO TRÌ</b>\n';
    if (overdue.length > 0) {
      msg += '\n<b>❌ QUÁ HẠN (' + overdue.length + ')</b>\n';
      overdue.slice(0, 8).forEach(function (t) {
        var daysOverdue = Math.floor((Date.now() - new Date(t.next_due_at).getTime()) / 86400000);
        var eqName = translateMaintTerm(t.equipment);
        var taskName = translateMaintTerm(t.task_type);
        msg += '- ' + eqName + ' (' + taskName + ') — quá hạn ' + daysOverdue + ' ngày\n';
      });
      if (overdue.length > 8) msg += '... +' + (overdue.length - 8) + ' mục nữa\n';
    }
    if (due.length > 0) {
      msg += '\n<b>⏰ TỚI HẠN (' + due.length + ')</b>\n';
      due.slice(0, 8).forEach(function (t) {
        var eqName = translateMaintTerm(t.equipment);
        var taskName = translateMaintTerm(t.task_type);
        msg += '- ' + eqName + ' (' + taskName + ')\n';
      });
      if (due.length > 8) msg += '... +' + (due.length - 8) + ' mục nữa\n';
    }
    msg += '\nGõ <code>/bao-tri</code> để đánh dấu xong.';

    // Direct send (không qua logError vì đây là digest expected daily, không phải error)
    sendTelegramAlert(msg);
  } catch (err) {
    logError('cronEquipmentMaintReminder', err);
  }
}

/**
 * Tạo bản sao lưu định kỳ cho Google Spreadsheet của quán.
 * Tạo 1 bản sao lưu trong thư mục "Mitsu_Backups" (tự tạo nếu chưa có).
 * Giới hạn tối đa 5 bản sao lưu cũ nhất (auto dọn dẹp để tránh đầy Drive).
 */
function backupSpreadsheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var file = DriveApp.getFileById(ss.getId());
    var tz = 'Asia/Ho_Chi_Minh';
    var dateStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd-HHmm');
    var backupName = 'Mitsu_Backup_' + dateStr;
    
    // Tìm hoặc tạo thư mục backups
    var folders = DriveApp.getFoldersByName('Mitsu_Backups');
    var folder;
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder('Mitsu_Backups');
    }
    
    // Tạo bản sao lưu
    var backupFile = file.makeCopy(backupName, folder);
    Logger.log('Spreadsheet backed up: ' + backupFile.getName());
    
    // Tự động dọn dẹp nếu có > 5 bản sao lưu trong thư mục
    var files = folder.getFiles();
    var backupList = [];
    while (files.hasNext()) {
      var f = files.next();
      backupList.push({ id: f.getId(), date: f.getDateCreated() });
    }
    
    // Sắp xếp theo ngày tạo (cũ nhất lên đầu)
    backupList.sort(function(a, b) {
      return a.date.getTime() - b.date.getTime();
    });
    
    // Xoá các file cũ vượt quá số lượng 5
    var maxBackups = 5;
    if (backupList.length > maxBackups) {
      var toDeleteCount = backupList.length - maxBackups;
      for (var i = 0; i < toDeleteCount; i++) {
        var fToDelete = DriveApp.getFileById(backupList[i].id);
        fToDelete.setTrashed(true);
        Logger.log('Deleted old backup: ' + fToDelete.getName());
      }
    }
  } catch (e) {
    logError('backupSpreadsheet', e);
  }
}

/** Cài đặt trigger sao lưu tự động hàng tuần chạy lúc 4:00 sáng thứ Hai. */
function installBackupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'backupSpreadsheet') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('backupSpreadsheet')
           .timeBased()
           .onWeekDay(ScriptApp.WeekDay.MONDAY)
           .atHour(4)
           .nearMinute(0)
           .create();
  Logger.log('Installed weekly backup trigger @4:00 Monday.');
}

