/**
 * Menu.gs — Đọc menu từ Sheets MENU tab, áp/khôi phục giá promo.
 */

function getActiveMenu() {
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
    if (item.available) items.push(item);
  }
  return items;
}

function getMenuItemBySku(sku) {
  var menu = getActiveMenu();
  for (var i = 0; i < menu.length; i++) {
    if (menu[i].sku === sku) return menu[i];
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
