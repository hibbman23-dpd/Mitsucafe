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
  'NEW':        ['CONFIRMED', 'MAKING', 'READY', 'DELIVERING', 'DELIVERED', 'CANCELLED'],
  'CONFIRMED':  ['MAKING', 'READY', 'DELIVERING', 'DELIVERED', 'CANCELLED'],
  'MAKING':     ['READY', 'DELIVERING', 'DELIVERED', 'CANCELLED'],
  'READY':      ['DELIVERING', 'DELIVERED', 'CANCELLED'],
  'DELIVERING': ['DELIVERED', 'CANCELLED'],
  'DELIVERED':  [], // đơn đã DELIVERED = đã thu tiền + đã cộng tem — không cho cancel qua path này (không có refund flow)
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

  var allMenuItems = getAllMenu();
  var menuMap = {};
  allMenuItems.forEach(function(m) {
    if (m.sku) menuMap[String(m.sku).trim().toUpperCase()] = m;
  });

  p.items.forEach(function (it) {
    if (!it.sku || !it.qty) {
      throw new Error('item must have sku, qty');
    }
    var qty = parseInt(it.qty, 10);
    if (!(qty > 0)) throw new Error('item qty must be a positive number');

    var menuItem = it.sku ? menuMap[String(it.sku).trim().toUpperCase()] : null;
    var mods = it.modifiers || {};
    var unit = 0;

    if (menuItem) {
      unit = (mods.size === 'L' && menuItem.price_l) ? Number(menuItem.price_l) : Number(menuItem.price_m);

      // Promo toàn quán (PROMO_PERCENT) áp lên giá size TRƯỚC khi cộng topping
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
    } else {
      // Fallback: Nếu SKU không có trong MENU sheet (hoặc là SKU mới chưa sync), dùng giá client gửi
      unit = Number(it.price) || 0;
      _logAudit('UNRESOLVED_SKU_FALLBACK', 'Món ' + it.sku + ' (' + (it.name || '') + ') không có trong MENU tab. Dùng giá fallback: ' + unit);
    }

    it.qty = qty;
    it.price = unit; // ghi đè giá client gửi — dùng lại khi in tem/bill/report doanh thu
    subtotal += unit * qty;
  });

  var total = subtotal;
  if (useFreeDrink) {
    // Đổi 1 ly nước size M cơ bản (sau promo, bỏ topping/L) — khớp client getCartDiscount().
    var freeDrinkDiscount = _freeDrinkBaseMDiscount(p.items, promoInfo);
    total = Math.max(0, subtotal - freeDrinkDiscount);
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
function _letterFor(deliveryType) {
  return deliveryType === 'delivery' ? 'G' : (deliveryType === 'dine_in' ? 'Q' : 'M');
}
function _currentDateStr() {
  return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
}
function _shortCodeWmKey(dateStr, letter) { return 'sc_wm_' + dateStr + '_' + letter; }

function _seedWatermarkFromMax(dateStr, letter) {
  var sheet = _ordersSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var ids  = sheet.getRange(2, 1, lastRow - 1, 1).getValues();          // col A order_id
  var codes = sheet.getRange(2, 27, lastRow - 1, 1).getValues();        // col AA short_code (idx 26 → col 27)
  var prefix = 'ORD-' + dateStr + '-';
  var max = 0;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).indexOf(prefix) !== 0) continue;
    var code = String(codes[i][0] || '');
    var m = code.match(new RegExp('^' + letter + '(\\d+)$'));
    if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return max;
}

function _nextShortCodeSeq(letter) {
  var dateStr = _currentDateStr();
  var props = PropertiesService.getScriptProperties();
  var key = _shortCodeWmKey(dateStr, letter);
  var cur = props.getProperty(key);
  var wm = (cur === null) ? _seedWatermarkFromMax(dateStr, letter) : parseInt(cur, 10);
  wm = wm + 1;
  props.setProperty(key, String(wm));
  return wm;
}

function buildShortCode(deliveryType) {
  var letter = _letterFor(deliveryType);
  var seq = _nextShortCodeSeq(letter);
  return letter + (seq < 10 ? '0' + seq : String(seq));
}

function reserveShortCodes(deliveryType, n) {
  n = Math.max(1, parseInt(n, 10) || 1);
  var letter = _letterFor(deliveryType);
  var dateStr = _currentDateStr();
  var props = PropertiesService.getScriptProperties();
  var key = _shortCodeWmKey(dateStr, letter);
  var cur = props.getProperty(key);
  var wm = (cur === null) ? _seedWatermarkFromMax(dateStr, letter) : parseInt(cur, 10);
  var from = wm + 1, to = wm + n;
  props.setProperty(key, String(to));
  return { letter: letter, date: dateStr, from: from, to: to };
}

function ingestPreMintedOrder(p) {
  p = p || {};
  if (!p.customer_id) p.customer_id = '0000000000';
  if (!p.channel) p.channel = 'staff';
  if (!p.items || !Array.isArray(p.items)) p.items = [];

  var key = p.idempotency_key || (p.metadata && p.metadata.idempotency_key) || '';
  if (key) {
    var existing = findOrderIdByIdempotencyKey(key);
    if (existing) return { ok: true, order_id: existing, deduped: true };
  }
  // Đã qua dedup theo idempotency_key ở trên. Tới đây mà order_id đã tồn tại nghĩa là
  // COLLISION hiếm (gateway rand ORD-date-XXXX trùng id GAS mint cho đơn khác). KHÔNG được
  // dedup (sẽ drop đơn dù tem đã in + tiền đã thu) — cấp order_id mới GAS-side rồi ghi tiếp.
  var mintedId = p.gateway_order_id;
  if (mintedId && _findOrderRow(mintedId)) {
    mintedId = generateOrderId();  // unique (tránh 500 dòng cuối, gồm cả id đang trùng)
  }
  var order = validateOrderPayload(p);
  order.order_id = mintedId || order.order_id;
  order.metadata = order.metadata || {};
  order.metadata.short_code = p.gateway_short_code || order.metadata.short_code;
  order.status = 'CONFIRMED';
  order.confirmed_at = new Date().toISOString();
  order.label_printed_at = p.printed_at || new Date().toISOString();
  order.idempotency_key = key;
  appendOrderToSheet(order);
  var row = _findOrderRow(order.order_id);
  if (row) {
    var sheet = _ordersSheet();
    sheet.getRange(row.rowIndex, 14).setValue(order.confirmed_at);       // col 14 = confirmed_at
    sheet.getRange(row.rowIndex, 21).setValue(order.label_printed_at);   // col 21 = label_printed_at (poller skip); printed_at (col 23) phải để TRỐNG cho receipt in lúc DELIVERED
  }
  try { sendTelegramAlert(buildTelegramOrderSummary(order)); }
  catch (tgErr) { logError('ingest.telegram', tgErr); }
  return { ok: true, order_id: order.order_id, short_code: order.metadata.short_code, deduped: false };
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

  // Same-status update = no-op. KDS double-tap / offline-queue replay gửi lại cùng
  // trạng thái không được ghi lại timestamp và KHÔNG được chạy lại side effects
  // (sendZaloNotify spam khách, printThermalReceipt in bill trùng).
  if (String(newStatus) === String(currentStatus)) {
    return { ok: true, order_id: orderId, status: newStatus, noop: true };
  }

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
  if (from === to) return true;
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
function markOrderPaid(orderId, opts) {
  opts = opts || {};
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

  if (opts.skipReceipt) {
    // Gateway đã in receipt local (offline). Đánh dấu printed_at để poller KHÔNG in lần 2.
    try { updateField(orderId, 'printed_at', new Date().toISOString()); }
    catch (e) { logError('markOrderPaid.printedAt', e); }
  } else {
    try { printThermalReceipt(orderId); } catch (e) { logError('markOrderPaid.print', e); }
  }

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
 * Đánh dấu thanh toán đồng loạt nhiều đơn (dùng cho gộp đơn theo bàn).
 * @param {Array<string>} orderIds
 * @param {object} [opts]
 */
function batchMarkOrdersPaid(orderIds, opts) {
  if (!orderIds || !orderIds.length) return { ok: false, error: 'orderIds required' };
  var results = [];
  for (var i = 0; i < orderIds.length; i++) {
    try {
      var res = markOrderPaid(orderIds[i], opts);
      results.push({ order_id: orderIds[i], ok: true, res: res });
    } catch (err) {
      results.push({ order_id: orderIds[i], ok: false, error: String(err) });
    }
  }
  return { ok: true, results: results };
}

/**
 * Cập nhật trạng thái đồng loạt nhiều đơn (dùng cho gộp đơn theo bàn).
 * @param {Array<string>} orderIds
 * @param {string} newStatus
 * @param {object} [opts]
 */
function batchUpdateOrdersStatus(orderIds, newStatus, opts) {
  if (!orderIds || !orderIds.length || !newStatus) return { ok: false, error: 'orderIds and newStatus required' };
  var results = [];
  for (var i = 0; i < orderIds.length; i++) {
    try {
      var res = updateOrderStatus(orderIds[i], newStatus, opts);
      results.push({ order_id: orderIds[i], ok: true, res: res });
    } catch (err) {
      results.push({ order_id: orderIds[i], ok: false, error: String(err) });
    }
  }
  return { ok: true, results: results };
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
    if (!row[0]) continue;
    var orderId = String(row[0]);
    var orderDate = row[2] ? new Date(row[2]) : null;
    var orderDateStr = (orderDate && !isNaN(orderDate.getTime())) ? Utilities.formatDate(orderDate, 'Asia/Ho_Chi_Minh', 'yyyyMMdd') : '';
    var isToday = orderId.indexOf(today) !== -1 || orderDateStr === today;
    var status = row[12];
    var paymentStatus = row[19];

    var isActive = ['NEW', 'CONFIRMED', 'MAKING', 'READY', 'DELIVERING'].indexOf(status) !== -1;
    var isUnpaid = paymentStatus !== 'PAID' && status !== 'CANCELLED';

    // Đơn hôm nay HOẶC đơn ngày trước chưa hoàn thành / chưa thanh toán
    if (!isToday && !isActive && !isUnpaid) continue;
    var itemsSummary = '';
    var items = [];
    try {
      items = JSON.parse(row[9]) || [];
      if (Array.isArray(items)) {
        itemsSummary = items.map(function(it) {
          var mods = [];
          if (it.modifiers) {
            Object.keys(it.modifiers).forEach(function(k) {
              if (it.modifiers[k]) mods.push(it.modifiers[k]);
            });
          }
          return (it.name || 'Món') + ' × ' + (it.qty || 1) + (mods.length ? ' (' + mods.join(', ') + ')' : '');
        }).join(', ');
      }
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
      items:          items,
      items_json:     row[9] || '[]',
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

/** Tính tem thưởng theo giá trị đơn net. Trả {stampsEarned, specialFreeDrink}. */
function _computeStampAward(total) {
  var t1 = Number(getConfig('STAMP_THRESHOLD_1')) || 66000;
  var t2 = Number(getConfig('STAMP_THRESHOLD_2')) || 100000;
  var tS = Number(getConfig('STAMP_THRESHOLD_SPECIAL')) || 490000;
  var amt = Number(total) || 0;
  if (amt >= tS) return { stampsEarned: 0, specialFreeDrink: true };
  if (amt >= t2) return { stampsEarned: 2, specialFreeDrink: false };
  if (amt >= t1) return { stampsEarned: 1, specialFreeDrink: false };
  return { stampsEarned: 0, specialFreeDrink: false };
}

/** Giá trị giảm trừ ly đổi thưởng = giá size M (sau promo) đắt nhất trong giỏ, bỏ bánh (BK*). */
function _freeDrinkBaseMDiscount(items, promoInfo) {
  var maxBaseM = 0;
  (items || []).forEach(function (it) {
    var sku = String(it.sku || '').toUpperCase();
    if (sku.indexOf('BK') === 0) return; // bỏ bánh
    var menuItem = getMenuItemBySku(it.sku);
    if (!menuItem) return;
    var baseM = Number(menuItem.price_m) || 0;
    if (promoInfo && promoInfo.active && promoInfo.percent > 0) {
      baseM = Math.round(baseM * (1 - promoInfo.percent / 100));
    }
    if (baseM > maxBaseM) maxBaseM = baseM;
  });
  return maxBaseM;
}

/** Áp tem thưởng vào bản ghi khách. Mutate + trả cust. Rollover 10 tem = 1 ly. */
function _applyStampAward(cust, award) {
  cust.stamp_count += award.stampsEarned;
  cust.stamp_total_ever += award.stampsEarned;
  if (cust.stamp_count >= 10) {
    var newEarned = Math.floor(cust.stamp_count / 10);
    cust.free_drinks_earned += newEarned;
    cust.stamp_count = cust.stamp_count % 10;
  }
  if (award.specialFreeDrink) {
    cust.free_drinks_earned += 1;
  }
  return cust;
}

function _creditStampsForOrder(order) {
  var phone = order.customer_id;
  var normPhone = normalizeCustomerId(phone);
  if (!normPhone) {
    Logger.log('No valid phone number for order ' + order.order_id + ', skipping loyalty points.');
    return;
  }

  // 1. Tem theo giá trị đơn net (thay cho đếm ly)
  var award = _computeStampAward(order.total);
  var stampsEarned = award.stampsEarned;

  if (stampsEarned === 0 && !order.metadata.use_free_drink && !award.specialFreeDrink) {
    Logger.log('No stamp award for order ' + order.order_id);
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

  _applyStampAward(cust, award);

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
    notifyStampUpdate(normPhone, stampsEarned, cust.stamp_count, cust.stamp_total_ever, cust.free_drinks_earned - cust.free_drinks_used, award.specialFreeDrink);
  } catch (notifErr) {
    logError('loyalty.notify', notifErr);
  }
}

/**
 * Đổi toàn bộ đơn active/unpaid từ bàn cũ sang bàn mới.
 * @param {string} fromTableId
 * @param {string} toTableId
 */
function transferTableOrders(fromTableId, toTableId) {
  if (!fromTableId || !toTableId) return { ok: false, error: 'fromTableId and toTableId required' };
  var sheet = _ordersSheet();
  var data = sheet.getDataRange().getValues();
  var count = 0;
  var updatedIds = [];
  var now = Date.now();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var tbl = String(row[6] || '').trim();
    var status = String(row[12] || '');
    var payStatus = String(row[19] || '');

    var orderDate = row[2] ? new Date(row[2]) : null;
    var isRecent = orderDate && (now - orderDate.getTime() < 24 * 3600 * 1000);

    var isActiveOrUnpaid = payStatus !== 'PAID' || ['NEW','CONFIRMED','MAKING','READY','DELIVERING'].indexOf(status) !== -1;
    if (isRecent && isActiveOrUnpaid && tbl === String(fromTableId).trim() && status !== 'CANCELLED') {
      sheet.getRange(i + 1, 7).setValue(toTableId); // col 7 = table_id (G)
      count++;
      updatedIds.push(String(row[0]));
    }
  }

  _logAudit('TRANSFER_TABLE', 'Chuyển bàn ' + fromTableId + ' -> ' + toTableId + ' (' + count + ' đơn)');
  return { ok: true, count: count, updated_ids: updatedIds, from_table: fromTableId, to_table: toTableId };
}

/**
 * Hủy 1 món trong đơn hàng và tính lại tổng tiền.
 * @param {string} orderId
 * @param {number} itemIndex - 0-based index trong items array
 * @param {string} reason
 * @param {string} pin
 */
function cancelOrderItem(orderId, itemIndex, reason, pin) {
  if (!orderId || itemIndex === undefined) return { ok: false, error: 'orderId and itemIndex required' };
  if (pin && pin.trim() !== '1234') {
    return { ok: false, error: 'Mã PIN Quản lý không đúng!' };
  }
  var row = _findOrderRow(orderId);
  if (!row) return { ok: false, error: 'Order not found' };

  var sheet = _ordersSheet();
  var items = [];
  try { items = JSON.parse(row.data[9]); } catch(e) {}

  if (itemIndex < 0 || itemIndex >= items.length) {
    return { ok: false, error: 'Invalid itemIndex' };
  }

  var canceledItem = items.splice(itemIndex, 1)[0];
  var newSubtotal = items.reduce(function(acc, it) { return acc + (Number(it.price) || 0) * (Number(it.qty) || 1); }, 0);
  var newTotal = newSubtotal;

  sheet.getRange(row.rowIndex, 10).setValue(JSON.stringify(items)); // col 10 = items_json (J)
  sheet.getRange(row.rowIndex, 11).setValue(newSubtotal);          // col 11 = subtotal (K)
  sheet.getRange(row.rowIndex, 12).setValue(newTotal);             // col 12 = total (L)

  if (items.length === 0) {
    sheet.getRange(row.rowIndex, 13).setValue('CANCELLED');        // col 13 = status (M)
  }

  _logAudit('CANCEL_ITEM', 'Hủy món "' + (canceledItem.name || '') + '" đơn ' + orderId + '. Lý do: ' + (reason || 'Không ghi'));
  return { ok: true, order_id: orderId, new_total: newTotal, canceled_item: canceledItem };
}

/**
 * Tách một số món từ đơn gốc ra đơn mới độc lập.
 * @param {string} parentOrderId
 * @param {Array<number>} itemIndexes
 * @param {string} pin
 */
function splitBill(parentOrderId, itemIndexes, pin) {
  if (!parentOrderId || !itemIndexes || !itemIndexes.length) return { ok: false, error: 'parentOrderId and itemIndexes required' };
  if (pin && pin.trim() !== '1234') {
    return { ok: false, error: 'Mã PIN Quản lý không đúng!' };
  }
  var row = _findOrderRow(parentOrderId);
  if (!row) return { ok: false, error: 'Parent order not found' };

  var sheet = _ordersSheet();
  var parentOrder = _rowToOrder(row.data);
  var items = parentOrder.items || [];

  var keepItems = [];
  var splitItems = [];

  for (var i = 0; i < items.length; i++) {
    if (itemIndexes.indexOf(i) !== -1) {
      splitItems.push(items[i]);
    } else {
      keepItems.push(items[i]);
    }
  }

  if (!splitItems.length) return { ok: false, error: 'No items selected to split' };

  // Recalculate parent order total
  var parentSubtotal = keepItems.reduce(function(acc, it) { return acc + (Number(it.price) || 0) * (Number(it.qty) || 1); }, 0);
  sheet.getRange(row.rowIndex, 10).setValue(JSON.stringify(keepItems));
  sheet.getRange(row.rowIndex, 11).setValue(parentSubtotal);
  sheet.getRange(row.rowIndex, 12).setValue(parentSubtotal);

  if (keepItems.length === 0) {
    sheet.getRange(row.rowIndex, 13).setValue('CANCELLED');
  }

  // Create new split order
  var newOrderId = generateOrderId();
  var newSubtotal = splitItems.reduce(function(acc, it) { return acc + (Number(it.price) || 0) * (Number(it.qty) || 1); }, 0);

  var newOrderPayload = {
    order_id: newOrderId,
    event_id: generateEventId(),
    timestamp: new Date().toISOString(),
    channel: parentOrder.channel || 'web',
    utm_source: parentOrder.utm_source || 'kds_split',
    location_id: parentOrder.location_id || 'LAM_HA_01',
    table_id: parentOrder.table_id || '',
    staff_id: parentOrder.staff_id || '',
    customer_id: parentOrder.customer_id || '',
    items: splitItems,
    subtotal: newSubtotal,
    total: newSubtotal,
    status: 'NEW',
    payment_status: 'UNPAID',
    notes: 'Đơn tách từ ' + parentOrderId,
    customer_name: parentOrder.customer_name || ''
  };

  var letter = _letterFor(parentOrder.delivery_type || 'dine_in');
  var shortCode = letter + 'S' + Math.floor(10 + Math.random() * 90);
  var idempotencyKey = parentOrderId + ':split:' + newOrderId;

  var newRow = [
    newOrderId,
    newOrderPayload.event_id,
    newOrderPayload.timestamp,
    newOrderPayload.channel,
    newOrderPayload.utm_source,
    newOrderPayload.location_id,
    newOrderPayload.table_id,
    newOrderPayload.staff_id,
    newOrderPayload.customer_id,
    JSON.stringify(splitItems),
    newSubtotal,
    newSubtotal,
    'NEW',
    newOrderPayload.timestamp,
    '', '', '', '', '',
    'UNPAID',
    '', '', '',
    newOrderPayload.notes,
    newOrderPayload.customer_name,
    shortCode,
    parentOrder.delivery_type || 'dine_in',
    '',
    idempotencyKey
  ];

  sheet.appendRow(newRow);
  _logAudit('SPLIT_BILL', 'Tách đơn ' + parentOrderId + ' -> đơn mới ' + newOrderId + ' (' + splitItems.length + ' món)');
  return { ok: true, parent_order_id: parentOrderId, new_order_id: newOrderId, split_total: newSubtotal, short_code: shortCode };
}

/**
 * Ghi vết nhật ký kiểm toán vào sheet AuditLogs.
 */
function _logAudit(action, details) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('AuditLogs');
    if (!sheet) {
      sheet = ss.insertSheet('AuditLogs');
      sheet.appendRow(['log_id', 'timestamp', 'action', 'details']);
    }
    var logId = 'LOG-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd-HHmmss');
    var ts = new Date().toISOString();
    sheet.appendRow([logId, ts, action, details]);
  } catch (e) {
    logError('logAudit', e);
  }
}

function deleteTestOrders(orderIdsInput) {
  var idsToDelete = Array.isArray(orderIdsInput)
    ? orderIdsInput
    : (typeof orderIdsInput === 'string' ? orderIdsInput.split(',') : []);

  idsToDelete = idsToDelete.map(function(id) { return String(id).trim(); }).filter(Boolean);
  if (!idsToDelete.length) return { ok: false, error: 'No order IDs specified' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('ORDERS');
  if (!sheet || sheet.getLastRow() <= 1) return { ok: true, deleted_count: 0 };

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIdx = headers.indexOf('order_id');
  if (idIdx === -1) return { ok: false, error: 'order_id column not found' };

  var deletedCount = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    var oid = String(data[i][idIdx] || '').trim();
    if (idsToDelete.indexOf(oid) !== -1) {
      sheet.deleteRow(i + 1);
      deletedCount++;
    }
  }

  _logAudit('delete_test_orders', 'Deleted ' + deletedCount + ' test orders: ' + idsToDelete.join(','));
  return { ok: true, deleted_count: deletedCount };
}

function swapOrderItem(payload) {
  if (!payload || !payload.order_id) return { ok: false, error: 'Thiếu order_id' };
  var pin = String(payload.manager_pin || '').trim();
  if (pin !== '9999' && pin !== '1234') {
    return { ok: false, error: 'PIN Quản lý không chính xác (Mặc định: 9999)' };
  }

  var orderId = String(payload.order_id).trim();
  var itemIdx = Number(payload.item_index);
  var newItem = payload.new_item;
  if (!newItem || !newItem.sku) return { ok: false, error: 'Món mới không hợp lệ' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('ORDERS');
  if (!sheet) return { ok: false, error: 'Không tìm thấy tab ORDERS' };

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIdx = headers.indexOf('order_id');
  var itemsIdx = headers.indexOf('items_json');
  var totalIdx = headers.indexOf('total');
  if (idIdx === -1 || itemsIdx === -1) return { ok: false, error: 'Cấu trúc ORDERS sheet không khớp' };

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idIdx] || '').trim() === orderId) {
      var rawItems = data[i][itemsIdx];
      var items = [];
      try { items = typeof rawItems === 'string' ? JSON.parse(rawItems) : (rawItems || []); } catch(e) { items = []; }
      
      if (isNaN(itemIdx) || itemIdx < 0 || itemIdx >= items.length) {
        return { ok: false, error: 'Vị trí món cần đổi không hợp lệ' };
      }

      var oldItem = items[itemIdx];
      var oldName = oldItem.name || oldItem.sku || 'Món cũ';
      var oldQty = oldItem.qty || 1;
      var oldPrice = Number(oldItem.price) || 0;
      var oldSubtotal = (oldItem.subtotal !== undefined) ? Number(oldItem.subtotal) : (oldQty * oldPrice);

      var newQty = Number(newItem.qty) || 1;
      var newPrice = Number(newItem.price) || 0;
      var newSubtotal = newQty * newPrice;
      newItem.subtotal = newSubtotal;

      if (!newItem.modifiers) newItem.modifiers = {};
      newItem.modifiers.swap_from = oldName;

      items[itemIdx] = newItem;

      var oldOrderTotal = Number(data[i][totalIdx]) || 0;
      var newOrderTotal = Math.max(0, oldOrderTotal - oldSubtotal + newSubtotal);

      sheet.getRange(i + 1, itemsIdx + 1).setValue(JSON.stringify(items));
      if (totalIdx !== -1) {
        sheet.getRange(i + 1, totalIdx + 1).setValue(newOrderTotal);
      }

      var priceDiff = newSubtotal - oldSubtotal;
      _logAudit('swap_order_item', 'Đổi món đơn ' + orderId + ': ' + oldName + ' -> ' + newItem.name + ' (Chênh lệch: ' + priceDiff + ')');

      return {
        ok: true,
        order_id: orderId,
        old_item: oldItem,
        new_item: newItem,
        items: items,
        old_total: oldOrderTotal,
        new_total: newOrderTotal,
        price_diff: priceDiff
      };
    }
  }

  return { ok: false, error: 'Không tìm thấy đơn hàng: ' + orderId };
}
