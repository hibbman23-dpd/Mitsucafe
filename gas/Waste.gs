/**
 * Waste.gs — Hao hụt / hủy nguyên liệu cuối ngày.
 *
 * Gap fix: hiện `deductInventoryForOrder` chỉ trừ kho theo đơn bán.
 * Cuối ngày phải log waste để INVENTORY không lệch + COGS chính xác.
 *
 * Reasons: overproduction | spillage | expiry | test | other | correction
 *
 * Phase: C (F&B Operations).
 */

// ─────────────────────────────────────────────────────────────────────
// Sheet bootstrap
// ─────────────────────────────────────────────────────────────────────

function initWasteLogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('WASTE_LOG');
  if (sheet) return sheet;
  sheet = ss.insertSheet('WASTE_LOG');
  var headers = [
    'waste_id', 'date', 'time', 'ingredient_id', 'ingredient_name',
    'qty', 'unit', 'reason', 'staff_id', 'cost_estimate',
    'photo_url', 'notes', 'logged_at'
  ];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length)
       .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  Logger.log('WASTE_LOG sheet created');
  return sheet;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function _generateWasteId(dateStr) {
  var compact = String(dateStr).replace(/-/g, '');
  var rand = Math.floor(1000 + Math.random() * 9000);
  return 'WST-' + compact + '-' + rand;
}

function _lookupInventory(ingredient_id) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('INVENTORY');
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idxId = headers.indexOf('ingredient_id');
  var idxStock = headers.indexOf('current_stock');
  var idxCost = headers.indexOf('cost_per_unit');
  var idxName = headers.indexOf('name');
  var idxUnit = headers.indexOf('unit');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idxId]).toUpperCase() === String(ingredient_id).toUpperCase()) {
      return {
        row: i + 1,
        ingredient_id: data[i][idxId],
        name: data[i][idxName],
        unit: data[i][idxUnit],
        current_stock: parseFloat(data[i][idxStock]) || 0,
        cost_per_unit: parseFloat(data[i][idxCost]) || 0
      };
    }
  }
  return null;
}

function _updateInventoryStock(ingredient_id, deltaQty) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('INVENTORY');
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idxId = headers.indexOf('ingredient_id');
  var idxStock = headers.indexOf('current_stock');
  var idxLastUpdated = headers.indexOf('last_updated');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idxId]).toUpperCase() === String(ingredient_id).toUpperCase()) {
      var newStock = (parseFloat(data[i][idxStock]) || 0) + deltaQty;
      sheet.getRange(i + 1, idxStock + 1).setValue(Math.max(0, newStock));
      sheet.getRange(i + 1, idxLastUpdated + 1).setValue(new Date().toISOString());
      return newStock;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Log 1 waste entry + tự update INVENTORY.
 * @param {Object} payload — { date, ingredient_id, qty, unit, reason, staff_id, notes, photo_url }
 * @returns {Object} — { waste_id, cost_estimate, new_stock }
 */
function logWaste(payload) {
  var sheet = initWasteLogSheet();
  var date = payload.date || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  var time = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'HH:mm');
  var qty = parseFloat(payload.qty) || 0;
  if (qty <= 0) throw new Error('qty must be > 0');

  var inv = _lookupInventory(payload.ingredient_id);
  if (!inv) throw new Error('ingredient_id not found in INVENTORY: ' + payload.ingredient_id);

  var cost_estimate = Math.round(qty * inv.cost_per_unit);
  var waste_id = _generateWasteId(date);

  sheet.appendRow([
    waste_id, date, time,
    inv.ingredient_id, inv.name,
    qty, payload.unit || inv.unit,
    payload.reason || 'other',
    payload.staff_id || '',
    cost_estimate,
    payload.photo_url || '',
    payload.notes || '',
    new Date().toISOString()
  ]);

  // Update INVENTORY (deduct, unless reason=correction with positive qty)
  var delta = -qty;
  if (payload.reason === 'correction') delta = qty; // correction adds back
  var new_stock = _updateInventoryStock(inv.ingredient_id, delta);

  return {
    waste_id: waste_id,
    ingredient_name: inv.name,
    qty: qty,
    cost_estimate: cost_estimate,
    new_stock: new_stock
  };
}

/** Lấy tổng waste của 1 ngày. */
function getWasteForDate(dateStr) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WASTE_LOG');
  if (!sheet) return { total_cost: 0, entries: [] };
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idxDate = headers.indexOf('date');
  var idxCost = headers.indexOf('cost_estimate');
  var total = 0;
  var entries = [];
  for (var i = 1; i < data.length; i++) {
    var cellDate = data[i][idxDate];
    var cellDateStr = (cellDate instanceof Date)
      ? Utilities.formatDate(cellDate, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd')
      : String(cellDate).trim();
    if (cellDateStr === dateStr) {
      var c = parseFloat(data[i][idxCost]) || 0;
      total += c;
      var row = {};
      for (var k = 0; k < headers.length; k++) row[headers[k]] = data[i][k];
      entries.push(row);
    }
  }
  return { total_cost: total, entries: entries };
}

/** Tổng waste trong tuần ISO chứa date. */
function getWasteForWeek(dateStr) {
  var d = new Date(dateStr);
  var dayOfWeek = (d.getDay() + 6) % 7; // Monday=0
  var monday = new Date(d.getTime() - dayOfWeek * 86400000);
  var entries = [];
  var total = 0;
  for (var i = 0; i < 7; i++) {
    var day = new Date(monday.getTime() + i * 86400000);
    var dayStr = Utilities.formatDate(day, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    var dayResult = getWasteForDate(dayStr);
    entries = entries.concat(dayResult.entries);
    total += dayResult.total_cost;
  }
  return { total_cost: total, entries: entries };
}

/**
 * Generate waste report cho 1 khoảng date.
 * @param {string} fromDate — 'YYYY-MM-DD'
 * @param {string} toDate — 'YYYY-MM-DD'
 */
function wasteReport(fromDate, toDate) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WASTE_LOG');
  if (!sheet) return { ok: false, error: 'WASTE_LOG sheet missing' };
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idxDate = headers.indexOf('date');
  var idxCost = headers.indexOf('cost_estimate');
  var idxReason = headers.indexOf('reason');
  var idxIng = headers.indexOf('ingredient_name');

  var fromD = new Date(fromDate).getTime();
  var toD = new Date(toDate).getTime();
  var byReason = {}, byIngredient = {}, total = 0, count = 0;

  for (var i = 1; i < data.length; i++) {
    var cellDate = data[i][idxDate];
    var ts = (cellDate instanceof Date) ? cellDate.getTime() : new Date(String(cellDate)).getTime();
    if (ts < fromD || ts > toD) continue;
    var cost = parseFloat(data[i][idxCost]) || 0;
    var reason = data[i][idxReason] || 'other';
    var ing = data[i][idxIng] || 'unknown';
    byReason[reason] = (byReason[reason] || 0) + cost;
    byIngredient[ing] = (byIngredient[ing] || 0) + cost;
    total += cost;
    count++;
  }

  return {
    ok: true,
    from: fromDate, to: toDate,
    total_cost: total, entry_count: count,
    by_reason: byReason, by_ingredient: byIngredient
  };
}

// ─────────────────────────────────────────────────────────────────────
// Web app endpoint — mobile form
// ─────────────────────────────────────────────────────────────────────

/**
 * HTML form mobile để nhập waste. Hook vào doGet routing:
 *   if (e.parameter.action === 'waste_form') return webAppWasteForm();
 *   if (e.parameter.action === 'waste_submit') return webAppWasteSubmit(e);
 */
function webAppWasteForm() {
  var inv = _getInventoryList();
  var options = inv.map(function (i) {
    return '<option value="' + i.ingredient_id + '">' + i.ingredient_id + ' — ' + i.name + ' (' + i.unit + ')</option>';
  }).join('');

  var html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>' +
    'body{font-family:system-ui;max-width:480px;margin:0 auto;padding:20px;background:#F5F0E8;color:#1E2D32;}' +
    'h1{color:#2D5F6B;font-size:1.3rem;margin-bottom:8px;}' +
    'label{display:block;margin-top:14px;font-weight:600;font-size:.9rem;}' +
    'input,select,textarea{width:100%;padding:10px;border:1px solid #A89B80;border-radius:4px;font-size:1rem;box-sizing:border-box;margin-top:4px;}' +
    'textarea{min-height:80px;font-family:inherit;}' +
    'button{margin-top:20px;width:100%;padding:14px;background:#EB624A;color:#fff;border:none;border-radius:4px;font-size:1rem;font-weight:600;cursor:pointer;}' +
    'button:hover{background:#c94f3a;}' +
    '.note{font-size:.78rem;color:#8a7d64;margin-top:6px;}' +
    '</style></head><body>' +
    '<h1>🗑️ Log waste — KaeruKàphê</h1>' +
    '<form id="f">' +
    '<label>Nguyên liệu<select name="ingredient_id" required>' + options + '</select></label>' +
    '<label>Số lượng<input type="number" name="qty" step="any" min="0.01" required></label>' +
    '<label>Lý do<select name="reason" required>' +
    '<option value="overproduction">Pha thừa (overproduction)</option>' +
    '<option value="spillage">Rớt/Đổ (spillage)</option>' +
    '<option value="expiry">Hết hạn (expiry)</option>' +
    '<option value="test">Pha thử / Training (test)</option>' +
    '<option value="other">Khác (other)</option>' +
    '<option value="correction">Hiệu chỉnh kho (correction)</option>' +
    '</select></label>' +
    '<label>Mã nhân viên (optional)<input type="text" name="staff_id"></label>' +
    '<label>Ghi chú<textarea name="notes" placeholder="VD: Lô pha sáng 8:00, cuối ngày còn"></textarea></label>' +
    '<button type="submit">Lưu waste + cập nhật kho</button>' +
    '<p class="note">Sẽ trừ INVENTORY tương ứng + ghi cost vào báo cáo tài chính.</p>' +
    '</form>' +
    '<script>' +
    'document.getElementById("f").addEventListener("submit",function(e){' +
    'e.preventDefault();' +
    'var fd=new FormData(this);' +
    'var params=new URLSearchParams();' +
    'fd.forEach(function(v,k){params.append(k,v);});' +
    'params.append("action","waste_submit");' +
    'fetch(window.location.pathname+"?"+params.toString()).then(function(r){return r.json();}).then(function(d){' +
    'document.body.innerHTML="<h1>✅ Đã lưu</h1><pre style=\\"white-space:pre-wrap;background:#fff;padding:14px;border-radius:6px;\\">"+JSON.stringify(d,null,2)+"</pre><a href=\\"?action=waste_form\\">Log thêm waste</a>";' +
    '});' +
    '});' +
    '</script>' +
    '</body></html>'
  );
  html.setTitle('Log waste — KaeruKàphê');
  return html;
}

function _getInventoryList() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('INVENTORY');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idxId = headers.indexOf('ingredient_id');
  var idxName = headers.indexOf('name');
  var idxUnit = headers.indexOf('unit');
  var result = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][idxId]) {
      result.push({
        ingredient_id: data[i][idxId],
        name: data[i][idxName],
        unit: data[i][idxUnit]
      });
    }
  }
  return result;
}

function webAppWasteSubmit(e) {
  try {
    var payload = {
      ingredient_id: e.parameter.ingredient_id,
      qty: parseFloat(e.parameter.qty),
      reason: e.parameter.reason,
      staff_id: e.parameter.staff_id,
      notes: e.parameter.notes,
      date: e.parameter.date  // optional, default today
    };
    var result = logWaste(payload);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, result: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    logError('webAppWasteSubmit', err);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err && err.message || err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Cron: end-of-day waste reminder + waste % alert
// ─────────────────────────────────────────────────────────────────────

/** Chạy 21:30 daily — nhắc user log waste. */
function cronWasteLogReminder() {
  try {
    var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    var waste = getWasteForDate(today);
    var formUrl = ScriptApp.getService().getUrl() + '?action=waste_form';

    if (waste.entries.length === 0) {
      sendTelegramAlert(
        '🗑️ <b>NHẮC LOG WASTE</b>\n' +
        'Chưa nhập waste hôm nay (' + today + ').\n' +
        '👉 Form: ' + formUrl + '\n' +
        'Hoặc gõ <code>/huy</code> trong Claude.'
      );
    } else {
      // Check waste % revenue
      var metrics = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DAILY_METRICS');
      if (metrics) {
        var data = metrics.getDataRange().getValues();
        var headers = data[0];
        var idxDate = headers.indexOf('date');
        var idxRev = headers.indexOf('revenue');
        for (var i = 1; i < data.length; i++) {
          var cellDate = data[i][idxDate];
          var cellStr = (cellDate instanceof Date)
            ? Utilities.formatDate(cellDate, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd')
            : String(cellDate).trim();
          if (cellStr === today) {
            var rev = parseFloat(data[i][idxRev]) || 0;
            if (rev > 0) {
              var wastePct = waste.total_cost / rev * 100;
              if (wastePct > 5) {
                logError('waste.highRatio', new Error(
                  'Waste hôm nay ' + Math.round(wastePct * 10) / 10 + '% revenue (' +
                  formatCurrency(waste.total_cost) + ' / ' + formatCurrency(rev) +
                  '). Target <3%. Review recipe portion?'
                ));
              }
            }
            break;
          }
        }
      }
    }
  } catch (err) {
    logError('cronWasteLogReminder', err);
  }
}
