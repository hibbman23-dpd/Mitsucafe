/**
 * Menu.gs — Đọc menu từ Sheets MENU tab, áp/khôi phục giá promo.
 */

function getAllMenu() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MENU');
  if (!sheet) throw new Error('MENU sheet missing');
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0];
  var items = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var item = {};
    for (var j = 0; j < headers.length; j++) item[headers[j]] = row[j];
    items.push(item);
  }
  return items;
}

function getActiveMenu() {
  var menu = getAllMenu();
  return menu.filter(function(item) { return Boolean(item.available); });
}

function getMenuItemBySku(sku) {
  if (!sku) return null;
  var menu = getAllMenu();
  var skuUpper = String(sku).trim().toUpperCase();
  for (var i = 0; i < menu.length; i++) {
    if (!menu[i].sku) continue;
    if (String(menu[i].sku).trim().toUpperCase() === skuUpper) return menu[i];
  }
  return null;
}

function applyPromoPrice(sku, promoPrice) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MENU');
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var skuCol = headers.indexOf('sku');
  var onPromoCol = headers.indexOf('on_promo');
  var promoPriceCol = headers.indexOf('promo_price');

  for (var i = 1; i < data.length; i++) {
    if (data[i][skuCol] === sku) {
      sheet.getRange(i + 1, onPromoCol + 1).setValue(true);
      sheet.getRange(i + 1, promoPriceCol + 1).setValue(promoPrice);
      return;
    }
  }
}

function restoreOriginalPrice(sku) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MENU');
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var skuCol = headers.indexOf('sku');
  var onPromoCol = headers.indexOf('on_promo');
  var promoPriceCol = headers.indexOf('promo_price');

  for (var i = 1; i < data.length; i++) {
    if (data[i][skuCol] === sku) {
      sheet.getRange(i + 1, onPromoCol + 1).setValue(false);
      sheet.getRange(i + 1, promoPriceCol + 1).setValue('');
      return;
    }
  }
}

/**
 * Aggregate SKU-level performance for menu engineering (Boston/Kasavana matrix).
 * Đọc ORDERS DELIVERED trong tháng cho trước, parse items_json, sum per SKU.
 * Join MENU để tính unit_cost (cost_nl + cost_packaging) → margin.
 *
 * @param {string} monthStr  Format 'YYYY-MM'. Default = tháng trước.
 * @return {object} { ok, month, sku_count, total_revenue, items: [{ sku, name, category, qty_sold, revenue, unit_cost, total_cost, margin_amount, margin_pct }] }
 */
function getMenuEngineeringData(monthStr) {
  if (!monthStr) {
    var d = new Date();
    d.setMonth(d.getMonth() - 1);
    monthStr = Utilities.formatDate(d, 'Asia/Ho_Chi_Minh', 'yyyy-MM');
  }
  if (!/^\d{4}-\d{2}$/.test(monthStr)) {
    return { ok: false, error: 'month must be YYYY-MM' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ordersSheet = ss.getSheetByName('ORDERS');
  var menuSheet = ss.getSheetByName('MENU');
  if (!ordersSheet || !menuSheet) {
    return { ok: false, error: 'ORDERS or MENU sheet missing' };
  }

  // Build menu lookup: sku → {name, category, unit_cost}
  var menuData = menuSheet.getDataRange().getValues();
  var menuHeaders = menuData[0];
  var mSku = menuHeaders.indexOf('sku');
  var mName = menuHeaders.indexOf('name');
  var mCat = menuHeaders.indexOf('category');
  var mCostNl = menuHeaders.indexOf('cost_nl');
  var mCostPkg = menuHeaders.indexOf('cost_packaging');
  var menuMap = {};
  for (var m = 1; m < menuData.length; m++) {
    var sk = String(menuData[m][mSku] || '').toUpperCase();
    if (!sk) continue;
    menuMap[sk] = {
      name: String(menuData[m][mName] || ''),
      category: String(menuData[m][mCat] || ''),
      unit_cost: (parseFloat(menuData[m][mCostNl]) || 0) + (parseFloat(menuData[m][mCostPkg]) || 0)
    };
  }

  // Aggregate from ORDERS DELIVERED trong tháng
  var ordersData = ordersSheet.getDataRange().getValues();
  if (ordersData.length < 2) {
    return { ok: true, month: monthStr, sku_count: 0, total_revenue: 0, items: [], note: 'No ORDERS data' };
  }
  var oHeaders = ordersData[0];
  var oTs = oHeaders.indexOf('timestamp');
  var oItems = oHeaders.indexOf('items_json');
  var oStatus = oHeaders.indexOf('status');

  var agg = {};
  for (var i = 1; i < ordersData.length; i++) {
    if (ordersData[i][oStatus] !== 'DELIVERED') continue;
    var ts = ordersData[i][oTs];
    var tsMonth = (ts instanceof Date)
      ? Utilities.formatDate(ts, 'Asia/Ho_Chi_Minh', 'yyyy-MM')
      : String(ts || '').substring(0, 7);
    if (tsMonth !== monthStr) continue;

    var itemsJson = ordersData[i][oItems];
    if (!itemsJson) continue;
    var items;
    try { items = JSON.parse(itemsJson); } catch (e) { continue; }
    if (!Array.isArray(items)) continue;

    items.forEach(function (it) {
      var sku = String(it.sku || '').toUpperCase();
      if (!sku) return;
      var qty = parseInt(it.qty, 10) || 0;
      var price = parseFloat(it.price) || 0;
      if (qty <= 0) return;

      var mInfo = menuMap[sku] || { name: it.name || sku, category: '', unit_cost: 0 };
      if (!agg[sku]) {
        agg[sku] = {
          sku: sku,
          name: mInfo.name,
          category: mInfo.category,
          qty_sold: 0,
          revenue: 0,
          unit_cost: mInfo.unit_cost
        };
      }
      agg[sku].qty_sold += qty;
      agg[sku].revenue += price * qty;
    });
  }

  // Tính margin + sort by revenue desc
  var result = [];
  Object.keys(agg).forEach(function (sku) {
    var r = agg[sku];
    r.total_cost = Math.round(r.unit_cost * r.qty_sold);
    r.revenue = Math.round(r.revenue);
    r.margin_amount = r.revenue - r.total_cost;
    r.margin_pct = r.revenue > 0 ? Math.round((r.margin_amount / r.revenue) * 100) : 0;
    result.push(r);
  });
  result.sort(function (a, b) { return b.revenue - a.revenue; });

  return {
    ok: true,
    month: monthStr,
    sku_count: result.length,
    total_revenue: result.reduce(function (s, r) { return s + r.revenue; }, 0),
    items: result
  };
}

// ─────────────────────────────────────────────────────────────────────
// Đồng bộ MENU từ seed/menu_items.json (nguồn sự thật của web)
// ─────────────────────────────────────────────────────────────────────

var MENU_SYNC_HEADERS = [
  'sku', 'name', 'name_jp', 'category', 'subcategory', 'role',
  'price_m', 'price_l', 'cost_nl', 'cost_packaging', 'cogs_percent',
  'on_promo', 'promo_price', 'available',
  'customizations', 'allergens', 'image_url', 'sort_order', 'story_telling'
];

/**
 * Ghi đè toàn bộ tab MENU bằng danh sách món gửi từ Mac Mini.
 *
 * Vì sao phải ghi đè chứ không cập nhật từng dòng: sheet đã tích tụ nhiều đời
 * menu chồng lên nhau (171 dòng cho 72 mã, mỗi mã 2-3 dòng), và getAllMenu()
 * dựng map nên DÒNG CUỐI THẮNG — tức là món nào đang có hiệu lực phụ thuộc
 * vào thứ tự dòng, không ai kiểm soát được. Cập nhật từng dòng chỉ đắp thêm
 * một đời nữa lên đống đó.
 *
 * Giữ lại on_promo/promo_price đang chạy: chiến dịch khuyến mãi đang diễn ra
 * không được biến mất chỉ vì đồng bộ menu.
 *
 * @param {Object} payload — { items: [...], dry_run: bool }
 */
function menuSyncFromRepo(payload) {
  var items = (payload && payload.items) || [];
  if (!items.length) return { ok: false, error: 'payload.items rỗng' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('MENU');
  if (!sheet) return { ok: false, error: 'MENU sheet missing' };

  // Giữ promo đang chạy, khoá theo sku
  var promo = {};
  var old = sheet.getDataRange().getValues();
  if (old.length > 1) {
    var oh = old[0].map(function (h) { return String(h).trim(); });
    var iS = oh.indexOf('sku'), iOn = oh.indexOf('on_promo'), iPp = oh.indexOf('promo_price');
    for (var r = 1; r < old.length; r++) {
      var s = String(old[r][iS] || '').trim().toUpperCase();
      if (s && iOn >= 0 && old[r][iOn] === true) {
        promo[s] = { on: true, price: iPp >= 0 ? old[r][iPp] : '' };
      }
    }
  }

  var rows = items.map(function (it) {
    var sku = String(it.sku || '').trim().toUpperCase();
    var p = promo[sku] || { on: false, price: '' };
    var cust = it.customizations;
    return [
      sku,
      it.name || '',
      it.name_jp || '',
      it.category || '',
      it.subcategory || '',
      it.role || '',
      it.price_m == null ? '' : it.price_m,
      it.price_l == null ? '' : it.price_l,
      it.cost_nl == null ? '' : it.cost_nl,
      it.cost_packaging == null ? '' : it.cost_packaging,
      it.cogs_percent == null ? '' : it.cogs_percent,
      p.on,
      p.price,
      it.available === false ? false : true,
      cust ? JSON.stringify(cust) : '',
      it.allergens ? JSON.stringify(it.allergens) : '',
      it.image_url || '',
      it.sort_order == null ? '' : it.sort_order,
      it.story_telling || ''
    ];
  });

  if (payload && payload.dry_run) {
    return { ok: true, dry_run: true, would_write: rows.length,
             current_rows: Math.max(0, sheet.getLastRow() - 1),
             promo_kept: Object.keys(promo).length, headers: MENU_SYNC_HEADERS };
  }

  sheet.clear();
  sheet.getRange(1, 1, 1, MENU_SYNC_HEADERS.length).setValues([MENU_SYNC_HEADERS]);
  sheet.getRange(1, 1, 1, MENU_SYNC_HEADERS.length)
       .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.getRange(2, 1, rows.length, MENU_SYNC_HEADERS.length).setValues(rows);

  return { ok: true, written: rows.length, promo_kept: Object.keys(promo).length };
}
