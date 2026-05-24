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
