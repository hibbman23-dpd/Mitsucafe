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
  'printed_at', 'notes', 'customer_name', 'short_code', 'delivery_type'
];
// Column indices (1-based, for getRange):
// payment_status = 20, customer_name = 25, short_code = 26, delivery_type = 27

var VALID_STATUS = ['NEW', 'CONFIRMED', 'MAKING', 'READY', 'DELIVERING', 'DELIVERED', 'CANCELLED'];

var VALID_TRANSITIONS = {
  'NEW':        ['CONFIRMED', 'CANCELLED'],
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
  if (!customerId) throw new Error('customer_id required (phone)');

  var subtotal = 0;
  p.items.forEach(function (it) {
    if (!it.sku || !it.qty || !it.price) {
      throw new Error('item must have sku, qty, price');
    }
    var unit = it.on_promo && it.promo_price ? it.promo_price : it.price;
    subtotal += unit * it.qty;
  });

  return {
    order_id: generateOrderId(),
    event_id: generateEventId(),
    timestamp: new Date().toISOString(),
    schema_ver: '1.1',
    channel: p.channel,
    utm_source: p.utm_source || p.channel,
    location_id: getConfig('LOCATION_ID') || 'LH01',
    table_id: p.table_id || null,
    staff_id: p.staff_id || null,
    customer_id: customerId,
    customer_name: p.customer_name || null,
    items: p.items,
    subtotal: subtotal,
    total: p.total || subtotal,
    status: 'NEW',
    confirmed_at: null,
    making_at: null,
    ready_at: null,
    delivering_at: null,
    delivered_at: null,
    payment: p.payment || { method: 'vietqr', total: p.total || subtotal, status: 'PENDING' },
    label_printed_at: null,
    invoice_url: null,
    printed_at: null,
    metadata: p.metadata || {
      delivery_type: p.table_id ? 'dine_in' : 'pickup',
      business_line: 'kissaten',
      category_type: 'beverage',
      notes: p.notes || '',
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
  ]);
}

function generateOrderId() {
  var dateStr = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  var rand = Math.floor(1000 + Math.random() * 9000);
  return 'ORD-' + dateStr + '-' + rand;
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
        printOrderLabels(order);
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
        // Tier 1: printThermalReceipt(order)
        // Tier 1: generatePDFInvoice(order) → sendInvoiceViaZalo
        // Tier 2: addStamp(order.customer_id)
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
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === orderId) {
      return { rowIndex: i + 1, data: data[i] };
    }
  }
  return null;
}

function _rowToOrder(row) {
  return {
    order_id: row[0],
    event_id: row[1],
    timestamp: row[2],
    channel: row[3],
    utm_source: row[4],
    location_id: row[5],
    table_id: row[6],
    staff_id: row[7],
    customer_id: row[8],
    items: row[9] ? JSON.parse(row[9]) : [],
    subtotal: row[10],
    total: row[11],
    status: row[12],
    customer_name: row[24] || '',
    metadata: {
      notes: row[23] || '',
      short_code: row[25] || '',
      delivery_type: row[26] || '',
    },
  };
}

/**
 * Đánh dấu đơn đã thanh toán. Gọi từ KDS khi nhân viên xác nhận.
 * @param {string} orderId
 */
function markOrderPaid(orderId) {
  var row = _findOrderRow(orderId);
  if (!row) throw new Error('Order not found: ' + orderId);
  _ordersSheet().getRange(row.rowIndex, 20).setValue('PAID'); // payment_status col
  return 'PAID';
}

/**
 * Trả về danh sách đơn hôm nay (mới nhất lên đầu) cho KDS polling.
 */
function getTodayOrders() {
  var sheet = _ordersSheet();
  var data = sheet.getDataRange().getValues();
  var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  var orders = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] || String(row[0]).indexOf(today) === -1) continue;
    var itemsSummary = '';
    try {
      var items = JSON.parse(row[9]);
      itemsSummary = items.map(function(it) {
        return it.name + ' × ' + it.qty;
      }).join(', ');
    } catch(_) {}
    orders.push({
      order_id:       row[0],
      short_code:     row[25] || '',
      timestamp:      Utilities.formatDate(new Date(row[2]), 'Asia/Ho_Chi_Minh', 'HH:mm'),
      customer_id:    row[8],
      customer_name:  row[24] || '',
      table_id:       row[6] || '',
      total:          row[11],
      status:         row[12],
      payment_status: row[19],
      delivery_type:  row[26] || 'pickup',
      items_summary:  itemsSummary,
    });
  }
  orders.reverse();
  return orders;
}
