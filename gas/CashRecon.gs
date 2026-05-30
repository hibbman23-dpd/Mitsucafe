/**
 * CashRecon.gs — Đối soát két tiền mặt theo ca.
 *
 * Z-report style:
 *   expected = opening_cash + cash_orders - cash_expenses
 *   variance = closing_actual - expected
 *
 * Threshold (CONFIG-configurable):
 *   |variance| ≤ CASH_VARIANCE_WARN_VND (default 20.000đ)        → ok
 *   ≤ CASH_VARIANCE_ALERT_VND (default 50.000đ)                  → warn (log only)
 *   > CASH_VARIANCE_ALERT_VND                                    → alert (Telegram)
 *
 * Phase: C (F&B Operations).
 */

var _DEFAULT_FLOAT_VND = 500000;
var _DEFAULT_WARN_VND = 20000;
var _DEFAULT_ALERT_VND = 50000;

// ─────────────────────────────────────────────────────────────────────
// Sheet bootstrap
// ─────────────────────────────────────────────────────────────────────

function initCashLogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('CASH_LOG');
  if (sheet) return sheet;
  sheet = ss.insertSheet('CASH_LOG');
  var headers = [
    'log_id', 'date', 'shift', 'staff_id',
    'opening_cash', 'closing_cash_actual', 'closing_cash_expected',
    'variance', 'variance_pct', 'status',
    'cash_orders_total', 'cash_expenses_total',
    'notes', 'opened_at', 'closed_at'
  ];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length)
       .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  Logger.log('CASH_LOG sheet created');
  return sheet;
}

function _getCashThresholds() {
  return {
    warn: parseInt(getConfig('CASH_VARIANCE_WARN_VND'), 10) || _DEFAULT_WARN_VND,
    alert: parseInt(getConfig('CASH_VARIANCE_ALERT_VND'), 10) || _DEFAULT_ALERT_VND,
    float_default: parseInt(getConfig('DEFAULT_CASH_FLOAT_VND'), 10) || _DEFAULT_FLOAT_VND
  };
}

function _generateCashLogId(dateStr, shift) {
  var compact = String(dateStr).replace(/-/g, '');
  var rand = Math.floor(100 + Math.random() * 900);
  return 'CSH-' + compact + '-' + (shift || 'XX').toUpperCase() + '-' + rand;
}

// ─────────────────────────────────────────────────────────────────────
// Shift open/close
// ─────────────────────────────────────────────────────────────────────

/**
 * Mở ca: tạo CASH_LOG row mới với opening_cash + opened_at.
 * @param {Object} payload — { shift, staff_id, opening_cash, notes }
 * @returns {Object} — { log_id, opened_at }
 */
function startShift(payload) {
  var sheet = initCashLogSheet();
  var thresholds = _getCashThresholds();
  var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  var shift = (payload && payload.shift) || 'sang';
  var opening = parseInt(payload && payload.opening_cash, 10);
  if (isNaN(opening) || opening < 0) opening = thresholds.float_default;

  // Check: không cho mở ca trùng (date + shift) khi ca trước chưa close
  var openShift = _findOpenShift(today, shift);
  if (openShift) {
    throw new Error('Ca ' + shift + ' ngày ' + today + ' đã mở (log_id=' + openShift.log_id + '). Close trước.');
  }

  var log_id = _generateCashLogId(today, shift);
  var nowIso = new Date().toISOString();
  sheet.appendRow([
    log_id, today, shift, (payload && payload.staff_id) || '',
    opening, '', '',  // closing_actual, closing_expected
    '', '',  // variance, variance_pct
    '',  // status
    '', '',  // cash_orders_total, cash_expenses_total
    (payload && payload.notes) || '',
    nowIso, ''  // opened_at, closed_at
  ]);

  return { log_id: log_id, shift: shift, opening_cash: opening, opened_at: nowIso };
}

/**
 * Đóng ca: tính expected, variance, status. Alert nếu vượt threshold.
 * @param {Object} payload — { log_id (optional, tự lookup latest open), closing_cash_actual, notes }
 * @returns {Object} — full reconciliation
 */
function endShift(payload) {
  var sheet = initCashLogSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idx = _colIndex(headers);

  var log_id = payload && payload.log_id;
  var rowIdx = -1;

  if (log_id) {
    for (var i = 1; i < data.length; i++) {
      if (data[i][idx.log_id] === log_id) { rowIdx = i; break; }
    }
    if (rowIdx === -1) throw new Error('log_id not found: ' + log_id);
  } else {
    // Auto-pick: ca đang mở mới nhất
    for (var j = data.length - 1; j >= 1; j--) {
      if (!data[j][idx.closed_at]) { rowIdx = j; break; }
    }
    if (rowIdx === -1) throw new Error('Không tìm thấy ca đang mở. Gọi startShift() trước.');
  }

  var row = data[rowIdx];
  var date = (row[idx.date] instanceof Date)
    ? Utilities.formatDate(row[idx.date], 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd')
    : String(row[idx.date]).trim();
  var shift = row[idx.shift];
  var opening = parseFloat(row[idx.opening_cash]) || 0;
  var opened_at = row[idx.opened_at];

  // Tính cash orders + expenses cho ca này
  var cashOrders = _sumCashOrdersForShift(date, shift, opened_at);
  var cashExpenses = _sumCashExpensesForShift(date, shift, opened_at);

  var expected = opening + cashOrders - cashExpenses;
  var actual = parseInt(payload && payload.closing_cash_actual, 10);
  if (isNaN(actual)) throw new Error('closing_cash_actual required');

  var variance = actual - expected;
  var variance_pct = (expected > 0) ? Math.round((variance / expected) * 1000) / 10 : 0;

  var thresholds = _getCashThresholds();
  var status;
  if (Math.abs(variance) <= thresholds.warn) status = 'ok';
  else if (Math.abs(variance) <= thresholds.alert) status = 'warn';
  else status = 'alert';

  // Update row
  var nowIso = new Date().toISOString();
  sheet.getRange(rowIdx + 1, idx.closing_cash_actual + 1).setValue(actual);
  sheet.getRange(rowIdx + 1, idx.closing_cash_expected + 1).setValue(expected);
  sheet.getRange(rowIdx + 1, idx.variance + 1).setValue(variance);
  sheet.getRange(rowIdx + 1, idx.variance_pct + 1).setValue(variance_pct);
  sheet.getRange(rowIdx + 1, idx.status + 1).setValue(status);
  sheet.getRange(rowIdx + 1, idx.cash_orders_total + 1).setValue(cashOrders);
  sheet.getRange(rowIdx + 1, idx.cash_expenses_total + 1).setValue(cashExpenses);
  sheet.getRange(rowIdx + 1, idx.closed_at + 1).setValue(nowIso);
  if (payload && payload.notes) {
    var existing = row[idx.notes] || '';
    sheet.getRange(rowIdx + 1, idx.notes + 1).setValue(
      existing ? (existing + ' | ' + payload.notes) : payload.notes
    );
  }

  var result = {
    log_id: row[idx.log_id],
    date: date, shift: shift,
    opening_cash: opening,
    cash_orders_total: cashOrders,
    cash_expenses_total: cashExpenses,
    closing_cash_expected: expected,
    closing_cash_actual: actual,
    variance: variance,
    variance_pct: variance_pct,
    status: status
  };

  // Alert nếu status=alert (via throttle pattern in logError)
  if (status === 'alert') {
    try {
      logError('cash.variance.alert', new Error(
        '🚨 CASH VARIANCE ALERT — Ca ' + shift + ' ' + date + '\n' +
        'Expected: ' + formatCurrency(expected) + ' | Actual: ' + formatCurrency(actual) + '\n' +
        'Variance: ' + (variance >= 0 ? '+' : '') + formatCurrency(variance) +
        ' (' + variance_pct + '%)\n' +
        'log_id=' + result.log_id + '\n' +
        'Suggest: kiểm tra camera ca ' + shift + ', ORDERS payment_method=cash hôm nay.'
      ));
    } catch (_) {}
  }

  return result;
}

function _findOpenShift(date, shift) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CASH_LOG');
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idx = _colIndex(headers);
  for (var i = 1; i < data.length; i++) {
    var cellDate = data[i][idx.date];
    var cellStr = (cellDate instanceof Date)
      ? Utilities.formatDate(cellDate, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd')
      : String(cellDate).trim();
    if (cellStr === date && data[i][idx.shift] === shift && !data[i][idx.closed_at]) {
      return { log_id: data[i][idx.log_id], opening_cash: data[i][idx.opening_cash] };
    }
  }
  return null;
}

function _colIndex(headers) {
  return {
    log_id: headers.indexOf('log_id'),
    date: headers.indexOf('date'),
    shift: headers.indexOf('shift'),
    staff_id: headers.indexOf('staff_id'),
    opening_cash: headers.indexOf('opening_cash'),
    closing_cash_actual: headers.indexOf('closing_cash_actual'),
    closing_cash_expected: headers.indexOf('closing_cash_expected'),
    variance: headers.indexOf('variance'),
    variance_pct: headers.indexOf('variance_pct'),
    status: headers.indexOf('status'),
    cash_orders_total: headers.indexOf('cash_orders_total'),
    cash_expenses_total: headers.indexOf('cash_expenses_total'),
    notes: headers.indexOf('notes'),
    opened_at: headers.indexOf('opened_at'),
    closed_at: headers.indexOf('closed_at')
  };
}

// ─────────────────────────────────────────────────────────────────────
// Cash flow calculations (orders + expenses for shift window)
// ─────────────────────────────────────────────────────────────────────

function _sumCashOrdersForShift(date, shift, opened_at) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ORDERS');
  if (!sheet) return 0;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idxId = headers.indexOf('order_id');
  var idxTotal = headers.indexOf('total');
  var idxPm = headers.indexOf('payment_method');
  var idxPs = headers.indexOf('payment_status');
  var idxTs = headers.indexOf('timestamp');

  var dateCompact = String(date).replace(/-/g, '');
  var openedTs = opened_at ? new Date(opened_at).getTime() : 0;
  var total = 0;

  for (var i = 1; i < data.length; i++) {
    var orderId = String(data[i][idxId]);
    if (orderId.indexOf('ORD-' + dateCompact) !== 0) continue;
    var pm = String(data[i][idxPm] || '').toLowerCase();
    var ps = String(data[i][idxPs] || '').toUpperCase();
    if (pm !== 'cash' || ps !== 'PAID') continue;

    // Filter by shift window
    if (opened_at) {
      var ts = data[i][idxTs];
      var orderTs = (ts instanceof Date) ? ts.getTime() : new Date(String(ts)).getTime();
      if (orderTs < openedTs) continue;
    }
    total += parseFloat(data[i][idxTotal]) || 0;
  }
  return total;
}

function _sumCashExpensesForShift(date, shift, opened_at) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('EXPENSES');
  if (!sheet) return 0;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idxDate = headers.indexOf('date');
  var idxAmount = headers.indexOf('amount');
  var idxPm = headers.indexOf('payment_method');
  var idxCreated = headers.indexOf('created_at');

  var openedTs = opened_at ? new Date(opened_at).getTime() : 0;
  var total = 0;

  for (var i = 1; i < data.length; i++) {
    var cellDate = data[i][idxDate];
    var cellStr = (cellDate instanceof Date)
      ? Utilities.formatDate(cellDate, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd')
      : String(cellDate).trim();
    if (cellStr !== date) continue;
    var pm = String(data[i][idxPm] || '').toLowerCase();
    if (pm.indexOf('mặt') === -1 && pm.indexOf('cash') === -1 && pm.indexOf('tiền mặt') === -1) continue;

    if (opened_at && idxCreated !== -1) {
      var created = data[i][idxCreated];
      var createdTs = (created instanceof Date) ? created.getTime() : new Date(String(created)).getTime();
      if (createdTs < openedTs) continue;
    }
    total += parseFloat(data[i][idxAmount]) || 0;
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────────────────────────────

/** Tổng variance trong khoảng date. Dùng cho weekly brief. */
function cashVarianceReport(fromDate, toDate) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CASH_LOG');
  if (!sheet) return { ok: false };
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idx = _colIndex(headers);
  var fromD = new Date(fromDate).getTime();
  var toD = new Date(toDate).getTime() + 86400000; // include end day

  var counts = { ok: 0, warn: 0, alert: 0 };
  var totalVarianceAbs = 0;
  var shifts = [];
  for (var i = 1; i < data.length; i++) {
    var cellDate = data[i][idx.date];
    var ts = (cellDate instanceof Date) ? cellDate.getTime() : new Date(String(cellDate)).getTime();
    if (ts < fromD || ts >= toD) continue;
    if (!data[i][idx.status]) continue;  // skip open shifts
    counts[data[i][idx.status]] = (counts[data[i][idx.status]] || 0) + 1;
    totalVarianceAbs += Math.abs(parseFloat(data[i][idx.variance]) || 0);
    shifts.push({
      log_id: data[i][idx.log_id],
      date: cellDate, shift: data[i][idx.shift],
      variance: data[i][idx.variance], status: data[i][idx.status]
    });
  }
  return {
    ok: true,
    from: fromDate, to: toDate,
    total_variance_abs: totalVarianceAbs,
    counts: counts, shifts: shifts
  };
}
