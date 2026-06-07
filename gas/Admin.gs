/**
 * Admin.gs — CRUD an toàn cho Ops Dashboard (sửa trực tiếp trên web).
 *
 * Mọi write yêu cầu admin session token (validateSessionToken).
 * CRUD generic theo HEADER NAME (bền với thứ tự cột).
 * CONFIG chỉ cho sửa key trong allowlist (KHÔNG đụng token/secret/password).
 *
 * Endpoints (Code.gs):
 *   GET  ?action=admin_data&token=        → menu+inventory+staff+promotions+config(safe)
 *   POST {action:'menu_update', token, sku, fields:{}}
 *   POST {action:'menu_add', token, item:{}}
 *   POST {action:'inventory_update', token, ingredient_id, fields:{}}
 *   POST {action:'inventory_add', token, item:{}}
 *   POST {action:'staff_update', token, staff_id, fields:{}}
 *   POST {action:'staff_add', token, item:{}}
 *   POST {action:'promo_toggle', token, campaign_id, is_active}
 *   POST {action:'config_set', token, key, value}
 */

// Field cần ép kiểu số / boolean khi ghi
var _ADMIN_NUMERIC = ['price_m','price_l','cost_nl','cost_packaging','cogs_percent','promo_price',
  'current_stock','min_stock','cost_per_unit','hourly_rate','sort_order','prep_time_sec',
  'discount_value','total_orders','total_spent','stamp_count'];
var _ADMIN_BOOL = ['available','on_promo','currently_running','is_active','active','zalo_sent',
  'telegram_sent','slides_updated'];

// CONFIG key được phép sửa từ dashboard (KHÔNG có secret/token/password/hash/account)
var _CONFIG_ALLOWLIST = [
  'LOCATION_ID','CAFE_NAME','CAFE_ADDRESS','CAFE_PHONE',
  'STORE_NAME','STORE_ADDRESS','STORE_PHONE','RECEIPT_FOOTER1','RECEIPT_FOOTER2',
  'STAMP_PER_CUP','STAMPS_FOR_FREE',
  'LABEL_PRINTER_IP','LABEL_PRINTER_PORT','LABEL_PRINTER_MODEL',
  'PRINT_SERVER_IP','PRINT_SERVER_PORT'
];

function _adminCoerce(header, val) {
  if (_ADMIN_NUMERIC.indexOf(header) !== -1) {
    var n = Number(val); return isNaN(n) ? val : n;
  }
  if (_ADMIN_BOOL.indexOf(header) !== -1) {
    return (val === true || val === 'true' || val === 'TRUE' || val === 1 || val === '1');
  }
  return val;
}

/** Cập nhật 1 row theo key column. Chỉ ghi field được cung cấp. */
function _adminUpdateRowByKey(sheetName, keyHeader, keyVal, fields) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return { ok: false, error: sheetName + ' missing' };
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var keyIdx = headers.indexOf(keyHeader);
  if (keyIdx === -1) return { ok: false, error: 'key header ' + keyHeader + ' not found' };
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][keyIdx]) === String(keyVal)) {
      Object.keys(fields).forEach(function (h) {
        var col = headers.indexOf(h);
        if (col !== -1) sheet.getRange(i + 1, col + 1).setValue(_adminCoerce(h, fields[h]));
      });
      return { ok: true, updated: keyVal };
    }
  }
  return { ok: false, error: keyVal + ' not found in ' + sheetName };
}

/** Append 1 row map theo header. */
function _adminAppendByHeaders(sheetName, obj) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return { ok: false, error: sheetName + ' missing' };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) {
    return obj[h] != null ? _adminCoerce(h, obj[h]) : '';
  });
  sheet.appendRow(row);
  return { ok: true, added: obj[headers[0]] || true };
}

/** Đọc 1 sheet thành array object (theo header). */
function _adminReadSheet(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var o = {};
    headers.forEach(function (h, c) { o[h] = data[i][c]; });
    out.push(o);
  }
  return out;
}

/** Toàn bộ data cho các tab editor. */
function getAdminData() {
  var cfg = {};
  _CONFIG_ALLOWLIST.forEach(function (k) { cfg[k] = getConfig(k) || ''; });
  return {
    ok: true,
    menu: _adminReadSheet('MENU'),
    inventory: _adminReadSheet('INVENTORY'),
    staff: _adminReadSheet('STAFF'),
    promotions: _adminReadSheet('PROMOTIONS'),
    config: cfg,
    config_keys: _CONFIG_ALLOWLIST,
  };
}

// ── Wrappers cho endpoint ──
function adminMenuUpdate(p)      { return _adminUpdateRowByKey('MENU', 'sku', p.sku, p.fields || {}); }
function adminMenuAdd(p)         { return _adminAppendByHeaders('MENU', p.item || {}); }
function adminInventoryUpdate(p) { return _adminUpdateRowByKey('INVENTORY', 'ingredient_id', p.ingredient_id, p.fields || {}); }
function adminInventoryAdd(p)    { return _adminAppendByHeaders('INVENTORY', p.item || {}); }
function adminStaffUpdate(p)     { return _adminUpdateRowByKey('STAFF', 'staff_id', p.staff_id, p.fields || {}); }
function adminStaffAdd(p)        { return _adminAppendByHeaders('STAFF', p.item || {}); }
function adminPromoToggle(p)     { return _adminUpdateRowByKey('PROMOTIONS', 'campaign_id', p.campaign_id, { is_active: p.is_active }); }

function adminConfigSet(p) {
  if (_CONFIG_ALLOWLIST.indexOf(p.key) === -1) {
    return { ok: false, error: 'Key "' + p.key + '" không được phép sửa từ dashboard (bảo mật).' };
  }
  setConfig(p.key, String(p.value == null ? '' : p.value));
  return { ok: true, key: p.key };
}
