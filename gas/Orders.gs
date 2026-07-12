/**
 * Orders.gs — Quản lý đơn hàng: validate · append · state machine.
 *
 * ORDERS là append-only. Không update-in-place — chỉ ghi thêm timestamp cột trạng thái.
 * order_id format: ORD-YYYYMMDD-XXXX (random 4 chữ số).
 */

var ORDERS_HEADERS = [
  'order_id', 'event_id', 'timestamp', 'channel', 'utm_source', 'location_id',
  'table_id', 'staff_id', 'customer_id', 'items_json', 'subtotal', 'total',
  'status', 'confirmed_at', 'making_at', 'ready_at', 'delivering_at', 'delivered_at',
  'payment_method', 'payment_status', 'label_printed_at', 'invoice_url',
  'printed_at', 'notes', 'customer_name', 'short_code', 'delivery_type', 'utm_campaign',
  'idempotency_key'
];
// Column indices (1-based, for getRange):
// payment_status = 20, customer_name = 25, short_code = 26, delivery_type = 27, utm_campaign = 28

var VALID_STATUS = ['NEW', 'CONFIRMED', 'MAKING', 'READY', 'DELIVERING', 'DELIVERED', 'CANCELLED'];

var VALID_TRANSITIONS = {
  'NEW':        ['CONFIRMED', 'MAKING', 'CANCELLED'],
  'CONFIRMED':  ['MAKING', 'CANCELLED'],
  'MAKING':     ['READY', 'CANCELLED'],
  'READY':      ['DELIVERED', 'DELIVERING'],
  'DELIVERING': ['DELIVERED'],
  'DELIVERED':  [],
  'CANCELLED':  [],
};

function validateOrderPayload(p) {
  if (!p.items || !p.items.length) throw new Error('items[] required');
  if (!p.channel) throw new Error('channel required');

  var customerId = normalizeCustomerId(p.customer_id);
  var deliveryType = p.metadata && p.metadata.delivery_type || (p.table_id ? 'dine_in' : 'pickup');
  if (deliveryType === 'delivery' && !customerId) {
    throw new Error('Số điện thoại là bắt buộc khi giao hàng.');
  }

  // Validate free drink redemption
  var useFreeDrink = p.metadata && p.metadata.use_free_drink === true;
  if (useFreeDrink) {
    if (!customerId) {
      throw new Error('Cần có số điện thoại để đổi ly nước miễn phí.');
    }
    var info = getCustomerInfo(customerId);
    var reserved = getPendingReservedFreeDrinks(customerId);
    var available = info.free_drinks_earned - info.free_drinks_used - reserved;
    if (available <= 0) {
      throw new Error('Tài khoản của bạn hiện tại không có ly nước miễn phí nào khả dụng (đã dùng hết hoặc đang chờ đối soát thanh toán đơn trước).');
    }
  }

  var notes = p.metadata && p.metadata.notes || p.notes || '';
  if (useFreeDrink) {
    notes = '[🎁 ĐỔI LY MIỄN PHÍ] ' + notes;
  }
  if (p.metadata) {
    p.metadata.notes = notes;
  }

  // Giá luôn tính lại server-side từ MENU + promo đang active — KHÔNG bao giờ tin
  // it.price/it.promo_price/p.total từ client (DevTools sửa payload = mua giá 1đ).
  var promoInfo = _getPromoInfoInternal();
  var subtotal = 0;
  p.items.forEach(function (it) {
    if (!it.sku || !it.qty) {
      throw new Error('item must have sku, qty');
    }
    var qty = parseInt(it.qty, 10);
    if (!(qty > 0)) throw new Error('item qty must be a positive number');

    var menuItem = getMenuItemBySku(it.sku);
    if (!menuItem) throw new Error('Món không tồn tại hoặc đã ngừng bán: ' + it.sku);

    var mods = it.modifiers || {};
    var unit = (mods.size === 'L' && menuItem.price_l) ? Number(menuItem.price_l) : Number(menuItem.price_m);

    // Promo toàn quán (PROMO_PERCENT) áp lên giá size TRƯỚC khi cộng topping —
    // phải khớp từng đồng với client (applyPromoPercent làm tròn price_m/price_l,
    // topping cộng nguyên giá sau), vì bank_notification gạch nợ khớp theo số tiền.
    if (promoInfo.active && promoInfo.percent > 0) {
      unit = Math.round(unit * (1 - promoInfo.percent / 100));
    }

    // Topping: client chỉ gửi tên (chuỗi "a, b"), giá luôn tra lại theo customizations_json của SKU.
    if (mods.toppings) {
      var toppingNames = String(mods.toppings).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var customizations = menuItem.customizations_json ? _safeJsonParse(menuItem.customizations_json) : null;
      var validToppings = (customizations && customizations.toppings) || [];
      toppingNames.forEach(function (name) {
        var match = validToppings.filter(function (t) { return t.name === name; })[0];
        if (match) unit += Number(match.price) || 0;
      });
    }

    it.qty = qty;
    it.price = unit; // ghi đè giá client gửi — dùng lại khi in tem/bill/report doanh thu
    subtotal += unit * qty;
  });

  var total = subtotal;
  if (useFreeDrink) {
    // Đổi 1 ly nước (không tính bánh) giá cao nhất trong đơn thành miễn phí — khớp logic client getCartDiscount().
    var highestDrinkPrice = 0;
    p.items.forEach(function (it) {
      var sku = String(it.sku || '').toUpperCase();
      if (sku.indexOf('BK') !== 0 && it.price > highestDrinkPrice) {
        highestDrinkPrice = it.price;
      }
    });
    total = Math.max(0, subtotal - highestDrinkPrice);
  }

  return {
    order_id: generateOrderId(),
    event_id: generateEventId(),
    timestamp: new Date().toISOString(),
    schema_ver: '1.1',
    channel: p.channel,
    utm_source: p.utm_source || p.channel,
    utm_campaign: p.utm_campaign || '',
    location_id: getConfig('LOCATION_ID') || 'LH01',
    table_id: p.table_id || null,
    staff_id: p.staff_id || null,
    customer_id: customerId,
    customer_name: p.customer_name || null,
    idempotency_key: (p.metadata && p.metadata.idempotency_key) || p.idempotency_key || '',
    items: p.items,
    subtotal: subtotal,
    total: total,
    status: 'NEW',
    confirmed_at: null,
    making_at: null,
    ready_at: null,
    delivering_at: null,
    delivered_at: null,
    payment: { method: (p.payment && p.payment.method) || 'vietqr', total: total, status: 'PENDING' },
    label_printed_at: null,
    invoice_url: null,
    printed_at: null,
    metadata: p.metadata || {
      delivery_type: deliveryType,
      business_line: 'kissaten',
      category_type: 'beverage',
      notes: notes,
    },
  };
}

function appendOrderToSheet(order) {
  var sheet = _ordersSheet();
  sheet.appendRow([
    order.order_id,
    order.event_id,
    order.timestamp,
    order.channel,
    order.utm_source,
    order.location_id,
    order.table_id || '',
    order.staff_id || '',
    order.customer_id,
    JSON.stringify(order.items),
    order.subtotal,
    order.total,
    order.status,
    '', '', '', '', '', // 5 status timestamps filled later
    order.payment.method,
    order.payment.status,
    '', '', '', // label_printed_at, invoice_url, printed_at
    order.metadata.notes || '',
    order.customer_name || '',
    order.metadata.short_code || '',
    order.metadata.delivery_type || '',
    order.utm_campaign || '',
    order.idempotency_key || '',
  ]);
}

/**
 * Idempotency: tìm order_id đã tạo với cùng idempotency_key (chống đơn trùng khi
 * client retry do mạng yếu). Quét cột idempotency_key (index 28 / cột AC).
 * Trả order_id nếu trùng, '' nếu chưa có. Gọi trong doPost (đã giữ lock → an toàn race).
 */
function findOrderIdByIdempotencyKey(key) {
  if (!key) return '';
  var sheet = _ordersSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '';
  var col = ORDERS_HEADERS.indexOf('idempotency_key') + 1; // 1-based
  var keys = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === String(key)) {
      return String(sheet.getRange(i + 2, 1, 1, 1).getValue());
    }
  }
  return '';
}

function generateOrderId() {
  var sheet = _ordersSheet();
  var dateStr = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  
  var existingIds = {};
  var data = getLastRows(sheet, 500);
  for (var i = 1; i < data.length; i++) { // i=1: getLastRows unshift header ở data[0]
    if (data[i] && data[i].length > 0) {
      existingIds[String(data[i][0])] = true;
    }
  }

  var orderId;
  var attempts = 0;
  do {
    var rand = Math.floor(1000 + Math.random() * 9000);
    orderId = 'ORD-' + dateStr + '-' + rand;
    attempts++;
  } while (existingIds[orderId] && attempts < 100);

  return orderId;
}

/**
 * Mã đơn hiển thị: <chữ loại><số chạy trong ngày> — vd Q07 (tại quán), M05 (mang đi), G12 (giao).
 * Server tự cấp (gọi trong doPost đã giữ lock → số chạy không trùng).
 * Số chạy = số đơn ORD-<hôm nay> đã có + 1. order_id vẫn là khoá gốc.
 */
function buildShortCode(deliveryType) {
  var letter = deliveryType === 'delivery' ? 'G' : (deliveryType === 'dine_in' ? 'Q' : 'M');
  var sheet = _ordersSheet();
  var lastRow = sheet.getLastRow();
  var seq = 1;
  if (lastRow >= 2) {
    var dateStr = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
    var prefix = 'ORD-' + dateStr + '-';
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var count = 0;
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).indexOf(prefix) === 0) count++;
    }
    seq = count + 1;
  }
  return letter + (seq < 10 ? '0' + seq : String(seq));
}

function generateEventId() {
  var dateStr = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  var rand = Math.floor(100000 + Math.random() * 900000);
  return 'EVT-' + dateStr + '-' + rand;
}

/**
 * Chuẩn hoá customer_id = số điện thoại VN.
 *   "+84 901 234 567" → "0901234567"
 *   "84901234567"      → "0901234567"
 *   "0901-234-567"     → "0901234567"
 */
function normalizeCustomerId(raw) {
  if (!raw) return '';
  var digits = String(raw).replace(/\D/g, '');
  if (digits.indexOf('84') === 0 && digits.length === 11) digits = '0' + digits.substring(2);
  if (digits.length === 9 && digits.charAt(0) !== '0') digits = '0' + digits;
  return digits;
}

/**
 * Đổi trạng thái đơn. Gọi side effects tương ứng theo state.
 * @param {string} orderId
 * @param {string} newStatus
 * @param {object} [opts] - {staff_id, notes}
 */
function updateOrderStatus(orderId, newStatus, opts) {
  opts = opts || {};
  var row = _findOrderRow(orderId);
  if (!row) throw new Error('Order not found: ' + orderId);

  var currentStatus = row.data[12]; // status column index
  if (!isValidTransition(currentStatus, newStatus)) {
    throw new Error('Invalid transition: ' + currentStatus + ' → ' + newStatus);
  }

  var sheet = _ordersSheet();
  var now = new Date().toISOString();
  var statusCol = 13; // 1-indexed: M column (status)
  sheet.getRange(row.rowIndex, statusCol).setValue(newStatus);

  var tsCol = _getStatusTimestampColumn(newStatus);
  if (tsCol) sheet.getRange(row.rowIndex, tsCol).setValue(now);

  // Side effects
  var order = _rowToOrder(row.data);
  _runStateSideEffects(order, newStatus);
}

function isValidTransition(from, to) {
  if (!VALID_TRANSITIONS[from]) return false;
  return VALID_TRANSITIONS[from].indexOf(to) !== -1;
}

function _runStateSideEffects(order, newStatus) {
  try {
    switch (newStatus) {
      case 'CONFIRMED':
        // Tem dán ly được xử lý bởi Mac Mini poller (GAS không reach LAN).
        // Poller polling ?action=pending_labels và in ngay sau khi đơn tạo.
        break;
      case 'MAKING':
        sendZaloNotify(order.customer_id, '☕ Đơn ' + order.order_id + ' đang pha chế');
        break;
      case 'READY':
        sendZaloNotify(order.customer_id, '🔔 Đơn ' + order.order_id + ' xong rồi! Mời ra lấy.');
        break;
      case 'DELIVERING':
        sendZaloNotify(order.customer_id, '🛵 Shipper đang giao đơn ' + order.order_id);
        break;
      case 'DELIVERED':
        printThermalReceipt(order.order_id);              // Invoice.gs → POS-58L
        // generatePDFInvoice(order) → sendInvoiceViaZalo // Tier 2
        // addStamp(order.customer_id)                    // Tier 2
        break;
    }
  } catch (err) {
    logError('_runStateSideEffects ' + newStatus, err);
  }
}

function _getStatusTimestampColumn(status) {
  // Headers (1-indexed): confirmed_at=14, making_at=15, ready_at=16, delivering_at=17, delivered_at=18
  switch (status) {
    case 'CONFIRMED':  return 14;
    case 'MAKING':     return 15;
    case 'READY':      return 16;
    case 'DELIVERING': return 17;
    case 'DELIVERED':  return 18;
    default:           return null;
  }
}

function _ordersSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('ORDERS');
  if (!sheet) throw new Error('ORDERS sheet missing');
  return sheet;
}

function _findOrderRow(orderId) {
  var sheet = _ordersSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;

  // Thử tìm trong 300 dòng gần nhất trước (tối ưu hóa tốc độ)
  var startRow = Math.max(2, lastRow - 300 + 1);
  var numRows = lastRow - startRow + 1;
  var data = getLastRows(sheet, 300);
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === orderId) {
      return { rowIndex: startRow + (i - 1), data: data[i] };
    }
  }

  // Fallback: Tìm trên toàn bộ bảng ORDERS nếu không thấy
  var fullData = sheet.getDataRange().getValues();
  for (var i = 1; i < fullData.length; i++) {
    if (fullData[i][0] === orderId) {
      return { rowIndex: i + 1, data: fullData[i] };
    }
  }
  return null;
}

function _rowToOrder(row) {
  var notes = row[23] || '';
  var useFreeDrink = notes.indexOf('[🎁 ĐỔI LY MIỄN PHÍ]') !== -1;
  return {
    order_id: row[0],
    event_id: row[1],
    timestamp: row[2],
    channel: row[3],
    utm_source: row[4],
    utm_campaign: row[27] || '',
    location_id: row[5],
    table_id: row[6],
    staff_id: row[7],
    customer_id: row[8],
    items: row[9] ? JSON.parse(row[9]) : [],
    subtotal: row[10],
    total: row[11],
    status: row[12],
    payment_method: row[18] || '',
    payment_status: row[19] || '',
    customer_name: row[24] || '',
    short_code: row[25] || '',
    delivery_type: row[26] || '',
    metadata: {
      notes: notes,
      short_code: row[25] || '',
      delivery_type: row[26] || '',
      use_free_drink: useFreeDrink,
    },
  };
}

/**
 * Đánh dấu đơn đã thanh toán. Gọi từ KDS khi nhân viên xác nhận.
 * Set payment_status=PAID và chạy side effect đúng một lần.
 * Bypass transition validation vì KDS có thể thanh toán từ bất kỳ state nào.
 * Hàm phải idempotent: browser/poller có thể retry sau khi timeout, không được
 * cộng tem, tăng doanh thu hay in bill lần thứ hai.
 * @param {string} orderId
 */
function markOrderPaid(orderId) {
  var row = _findOrderRow(orderId);
  if (!row) throw new Error('Order not found: ' + orderId);
  if (String(row.data[19] || '').toUpperCase() === 'PAID') {
    return { payment_status: 'PAID', already_paid: true };
  }
  var sheet = _ordersSheet();
  sheet.getRange(row.rowIndex, 20).setValue('PAID');       // payment_status col
  // Keep the current cooking status unchanged (so kitchen still sees it).
  // Only update payment_status to PAID. Receipt will print because of the PAID status.
  
  try {
    var order = _rowToOrder(row.data);
    _creditStampsForOrder(order);
  } catch (loyErr) {
    logError('markOrderPaid.loyalty', loyErr);
  }

  try { printThermalReceipt(orderId); } catch (e) { logError('markOrderPaid.print', e); }

  // Cập nhật số liệu tài chính thời gian thực
  try {
    var dateCompact = orderId.split('-')[1]; // ORD-20260528-1234 -> 20260528
    if (dateCompact && dateCompact.length === 8) {
      var yyyy = dateCompact.substring(0, 4);
      var mm = dateCompact.substring(4, 6);
      var dd = dateCompact.substring(6, 8);
      var dateStr = yyyy + '-' + mm + '-' + dd;
      computeDailyMetrics(dateStr);
    }
  } catch (fErr) {
    logError('markOrderPaid.financials', fErr);
  }

  return { payment_status: 'PAID', already_paid: false };
}

/**
 * Trả về danh sách đơn hôm nay (mới nhất lên đầu) cho KDS polling.
 */
function getTodayOrders() {
  var sheet = _ordersSheet();
  var data = getLastRows(sheet, 300); // Tối ưu hóa: chỉ quét 300 đơn gần nhất vì KDS chỉ cần hiển thị đơn hôm nay
  var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  var orders = [];
  
  // Cache customer lookups to optimize performance
  var customerCache = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] || String(row[0]).indexOf(today) === -1) continue;
    var itemsSummary = '';
    try {
      var items = JSON.parse(row[9]);
      itemsSummary = items.map(function(it) {
        var mods = [];
        if (it.modifiers) {
          Object.keys(it.modifiers).forEach(function(k) {
            mods.push(it.modifiers[k]);
          });
        }
        return it.name + ' × ' + it.qty + (mods.length ? ' (' + mods.join(', ') + ')' : '');
      }).join(', ');
    } catch(_) {}

    var customerPhone = row[8];
    var stampInfoText = '';
    if (customerPhone) {
      var norm = normalizeCustomerId(customerPhone);
      if (norm) {
        if (!customerCache[norm]) {
          try {
            customerCache[norm] = getCustomerInfo(norm);
          } catch (e) {
            customerCache[norm] = null;
          }
        }
        var info = customerCache[norm];
        if (info) {
          stampInfoText = info.stamp_count + '/10 🎟️';
          var freeLeft = info.free_drinks_earned - info.free_drinks_used;
          if (freeLeft > 0) {
            stampInfoText += ' (' + freeLeft + ' ly free)';
          }
        }
      }
    }

    var notes = row[23] || '';
    var useFreeDrink = notes.indexOf('[🎁 ĐỔI LY MIỄN PHÍ]') !== -1;

    orders.push({
      order_id:       row[0],
      short_code:     row[25] || '',
      timestamp:      Utilities.formatDate(new Date(row[2]), 'Asia/Ho_Chi_Minh', 'HH:mm'),
      created_iso:    row[2] ? new Date(row[2]).toISOString() : '',
      customer_id:    row[8],
      customer_name:  row[24] || '',
      table_id:       row[6] || '',
      total:          row[11],
      status:         row[12],
      payment_status: row[19],
      delivery_type:  row[26] || 'pickup',
      items_summary:  itemsSummary,
      notes:          notes,
      use_free_drink: useFreeDrink,
      customer_stamps: stampInfoText,
      delivered_at:   row[17] || '',
      making_at:      row[14] || '',
      delivering_at:  row[16] || '',
    });
  }
  orders.reverse();
  return orders;
}

/**
 * Đếm số lượng ly nước miễn phí đang ở trạng thái "chờ" (đơn hàng UNPAID và không bị CANCELLED).
 * Giúp ngăn chặn race condition double-spend khi đặt nhiều đơn cùng lúc.
 */
function getPendingReservedFreeDrinks(customerId) {
  var sheet = _ordersSheet();
  var data = getLastRows(sheet, 200);
  if (data.length === 0) return 0;
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idxId = headers.indexOf('customer_id');
  var idxStatus = headers.indexOf('status');
  var idxPayStatus = headers.indexOf('payment_status');
  var idxMeta = headers.indexOf('metadata');
  
  var count = 0;
  var normPhone = normalizeCustomerId(customerId);

  for (var i = 1; i < data.length; i++) { // i=1: getLastRows unshift header ở data[0]
    var row = data[i];
    var custPhone = normalizeCustomerId(row[idxId]);
    if (custPhone === normPhone) {
      var status = row[idxStatus];
      var payStatus = row[idxPayStatus];
      if (status !== 'CANCELLED' && payStatus !== 'PAID') {
        var metaStr = row[idxMeta] || '{}';
        var meta = {};
        try { meta = JSON.parse(metaStr); } catch(e) {}
        if (meta && meta.use_free_drink === true) {
          count++;
        }
      }
    }
  }
  return count;
}

function getCustomerInfo(phone) {
  var normPhone = normalizeCustomerId(phone);
  if (!normPhone) return null;
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CUSTOMERS');
  if (!sheet) return {
    customer_id: normPhone,
    name: '',
    phone: phone,
    stamp_count: 0,
    stamp_total_ever: 0,
    free_drinks_earned: 0,
    free_drinks_used: 0,
  };
  
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (normalizeCustomerId(row[0]) === normPhone || normalizeCustomerId(row[2]) === normPhone) {
      return {
        customer_id: row[0] || normPhone,
        name: row[1] || '',
        phone: row[2] || phone,
        zalo_id: row[3] || '',
        stamp_count: parseInt(row[8]) || 0,
        stamp_total_ever: parseInt(row[9]) || 0,
        free_drinks_earned: parseInt(row[10]) || 0,
        free_drinks_used: parseInt(row[11]) || 0,
        notes: row[12] || '',
      };
    }
  }
  
  return {
    customer_id: normPhone,
    name: '',
    phone: phone,
    stamp_count: 0,
    stamp_total_ever: 0,
    free_drinks_earned: 0,
    free_drinks_used: 0,
  };
}

function _creditStampsForOrder(order) {
  var phone = order.customer_id;
  var normPhone = normalizeCustomerId(phone);
  if (!normPhone) {
    Logger.log('No valid phone number for order ' + order.order_id + ', skipping loyalty points.');
    return;
  }

  // 1. Đếm số lượng ly nước trong đơn (bỏ qua bánh - SKU bắt đầu bằng BK)
  var stampsEarned = 0;
  if (order.items && order.items.length) {
    order.items.forEach(function (item) {
      var sku = (item.sku || '').toUpperCase();
      if (sku.indexOf('BK') !== 0) {
        stampsEarned += parseInt(item.qty) || 0;
      }
    });
  }

  if (stampsEarned === 0 && !order.metadata.use_free_drink) {
    Logger.log('No eligible drink items and no free drink usage for order ' + order.order_id);
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('CUSTOMERS');
  if (!sheet) {
    throw new Error('CUSTOMERS sheet is missing');
  }

  var data = sheet.getDataRange().getValues();
  var customerRowIndex = -1;
  var cust = {
    customer_id: normPhone,
    name: order.customer_name || '',
    phone: normPhone,
    zalo_id: '',
    first_order: order.timestamp,
    last_order: order.timestamp,
    total_orders: 1,
    total_spent: order.total,
    stamp_count: 0,
    stamp_total_ever: 0,
    free_drinks_earned: 0,
    free_drinks_used: 0,
    notes: '',
  };

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (normalizeCustomerId(row[0]) === normPhone || normalizeCustomerId(row[2]) === normPhone) {
      customerRowIndex = i + 1;
      cust.customer_id = row[0] || normPhone;
      cust.name = row[1] || order.customer_name || cust.name;
      cust.phone = row[2] || normPhone;
      cust.zalo_id = row[3] || '';
      cust.first_order = row[4] || order.timestamp;
      cust.last_order = order.timestamp;
      cust.total_orders = (parseInt(row[6]) || 0) + 1;
      cust.total_spent = (parseFloat(row[7]) || 0) + order.total;
      cust.stamp_count = parseInt(row[8]) || 0;
      cust.stamp_total_ever = parseInt(row[9]) || 0;
      cust.free_drinks_earned = parseInt(row[10]) || 0;
      cust.free_drinks_used = parseInt(row[11]) || 0;
      cust.notes = row[12] || '';
      break;
    }
  }

  // 2. Cập nhật tem và ly miễn phí
  var usedFreeDrink = false;
  if (order.metadata.use_free_drink) {
    var availableFree = cust.free_drinks_earned - cust.free_drinks_used;
    if (availableFree > 0) {
      cust.free_drinks_used += 1;
      usedFreeDrink = true;
    } else {
      logError('loyalty.use_free_drink', new Error('Customer ' + normPhone + ' tried to use free drink but had none available.'));
    }
  }

  cust.stamp_count += stampsEarned;
  cust.stamp_total_ever += stampsEarned;

  if (cust.stamp_count >= 10) {
    var newEarned = Math.floor(cust.stamp_count / 10);
    cust.free_drinks_earned += newEarned;
    cust.stamp_count = cust.stamp_count % 10;
  }

  var rowData = [
    cust.customer_id,
    cust.name,
    cust.phone,
    cust.zalo_id,
    cust.first_order,
    cust.last_order,
    cust.total_orders,
    cust.total_spent,
    cust.stamp_count,
    cust.stamp_total_ever,
    cust.free_drinks_earned,
    cust.free_drinks_used,
    cust.notes,
  ];

  if (customerRowIndex !== -1) {
    sheet.getRange(customerRowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  try {
    notifyStampUpdate(normPhone, stampsEarned, cust.stamp_count, cust.stamp_total_ever, cust.free_drinks_earned - cust.free_drinks_used);
  } catch (notifErr) {
    logError('loyalty.notify', notifErr);
  }
}
