/**
 * Invoice.gs — In hóa đơn nhiệt khi đơn DELIVERED.
 *
 * Máy in: Xprinter POS-58L — thermal roll 58mm (203 dpi).
 * Flow: GAS → Flask /print/receipt → TCP 9100 → POS-58L.
 *
 * Cấu hình printer 1 lần:
 *   - Kết nối POS-58L vào Xprinter Thermal Printer Tool (Windows)
 *   - Code page: UTF-8 (firmware 2020+) hoặc CP1258 (Vietnamese)
 *   - Cài IP tĩnh, điền vào env RECEIPT_PRINTER_IP
 *
 * Preview hóa đơn 58mm (32 ký tự/dòng):
 * ================================
 *        KAERU KÀPHE
 *     Lâm Hà, Lâm Đồng
 * ================================
 *   14:32  25/05/2026
 *   #007  ·  Bàn 03
 * --------------------------------
 * Bạc xỉu (M)        x1  28.000
 * Croissant bơ Pháp  x1  28.000
 * --------------------------------
 *              Tổng: 56.000đ
 *           TT: Chuyển khoản
 * ================================
 *    Cảm ơn! Hẹn gặp lại nhé ☕
 * ================================
 */

var RECEIPT_W = 32; // ký tự/dòng cho POS-58L 58mm

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * In hóa đơn cho đơn hàng đã giao/nhận.
 * Gọi từ Orders.gs khi status → DELIVERED.
 * @param {string} orderId
 */
function printThermalReceipt(orderId) {
  // In receipt được xử lý bởi Mac Mini poller (kiến trúc pull).
  // GAS chạy trên Google Cloud → không reach được LAN (192.168.x.x).
  // Poller tự polling ?action=pending_print mỗi 4s rồi in trực tiếp trên Mac Mini.
  // Không cần làm gì từ GAS — poller sẽ pick up khi thấy status=DELIVERED + printed_at rỗng.
  Logger.log('printThermalReceipt: ' + orderId + ' → queued for Mac Mini poller');
}

// ── ESC/POS builder — POS-58L 58mm ───────────────────────────────────────────

/**
 * Build ESC/POS command string cho hóa đơn 58mm trên POS-58L.
 *
 * ESC/POS refs:
 *   ESC @       = Init printer
 *   ESC t 255   = UTF-8 code page
 *   ESC ! n     = Font: 0x00=normal 0x08=bold 0x10=dbl-height 0x20=dbl-width
 *   ESC a n     = Justify: 0=left 1=center 2=right
 *   GS V 0x42 0 = Full cut
 */
function buildReceiptEscPos(order) {
  var ESC = '\x1B', GS = '\x1D';
  var W   = RECEIPT_W;
  var d   = '';

  // ── Init ──────────────────────────────────────────────────────────────────
  d += ESC + '@';             // Init printer
  // ESC t code page: KHÔNG dùng 0xFF (Xprinter-specific UTF-8, không tương thích)
  // Rongta/standard printers: dùng default PC437 hoặc cài qua printer tool

  // ── Header (center) ───────────────────────────────────────────────────────
  d += ESC + 'a\x01';         // Center
  d += ESC + '!\x38';         // Bold + double-height + double-width

  var storeName = getConfig('STORE_NAME') || 'KAERU KAPHE';
  d += storeName + '\n';

  d += ESC + '!\x00';         // Normal
  var storeAddr = getConfig('STORE_ADDRESS') || 'Lam Ha, Lam Dong';
  d += storeAddr + '\n';

  var storePhone = getConfig('STORE_PHONE') || '';
  if (storePhone) d += storePhone + '\n';

  d += ESC + 'a\x00';         // Left

  // ── Separator ─────────────────────────────────────────────────────────────
  d += _repeat('=', W) + '\n';

  // ── Thời gian + mã đơn ────────────────────────────────────────────────────
  var ts = formatTimestamp(order.timestamp);       // "14:32 25/05/2026"
  d += '  ' + ts + '\n';

  var shortCode   = (order.metadata && order.metadata.short_code) ? '#' + order.metadata.short_code : '';
  var tableOrType = _receiptLocLabel(order);
  var orderLine   = [shortCode, tableOrType].filter(Boolean).join('  /  '); // '/' thay cho · (ASCII safe)
  if (orderLine) d += '  ' + orderLine + '\n';

  if (order.customer_name) {
    d += '  ' + order.customer_name + '  ' + order.customer_id + '\n';
  } else if (order.customer_id && order.customer_id !== '0000000000') {
    d += '  ' + order.customer_id + '\n';
  }

  // ── Separator ─────────────────────────────────────────────────────────────
  d += _repeat('-', W) + '\n';

  // ── Danh sách món ─────────────────────────────────────────────────────────
  order.items.forEach(function (it) {
    var itemName = it.name;
    if (it.modifiers && it.modifiers.size) {
      itemName += ' (' + it.modifiers.size + ')';
    }
    d += _receiptItemLine(itemName, it.qty, it.price, W) + '\n';

    // Modifiers (indent)
    var mods = _buildModsLine(it.modifiers);
    if (mods) {
      d += _truncate('  ' + mods, W) + '\n';
    }
  });

  // ── Ghi chú ───────────────────────────────────────────────────────────────
  if (order.metadata && order.metadata.notes) {
    d += '  Ghi chu: ' + _truncate(order.metadata.notes, W - 10) + '\n';
  }

  // ── Separator ─────────────────────────────────────────────────────────────
  d += _repeat('-', W) + '\n';

  // ── Tổng tiền ─────────────────────────────────────────────────────────────
  d += ESC + '!\x08';         // Bold
  d += _rjust('Tong: ' + _formatAmount(order.total) + 'd', W) + '\n';
  d += ESC + '!\x00';         // Normal

  // ── Phương thức thanh toán ────────────────────────────────────────────────
  var pmtLabel = _paymentLabel(order.payment && order.payment.method);
  d += _rjust('TT: ' + pmtLabel, W) + '\n';

  // ── Footer ────────────────────────────────────────────────────────────────
  d += _repeat('=', W) + '\n';
  d += ESC + 'a\x01';         // Center

  var footer1 = getConfig('RECEIPT_FOOTER1') || 'Cam on! Hen gap lai nhe!';
  var footer2 = getConfig('RECEIPT_FOOTER2') || 'kaerukaphevn';
  d += footer1 + '\n';
  if (footer2) d += footer2 + '\n';

  d += ESC + 'a\x00';         // Left
  d += _repeat('=', W) + '\n';

  // ── Feed + cut ────────────────────────────────────────────────────────────
  d += '\n\n\n\n';             // 4 dòng trống trước khi cắt
  d += GS + 'V\x42\x00';      // Full cut

  return d;
}

// ── Helpers riêng cho receipt ─────────────────────────────────────────────────

/**
 * Format 1 dòng item: name + qty + price, tổng = width.
 * VD: "Bac xiu (M)          x1  28.000"
 */
function _receiptItemLine(name, qty, unitPrice, width) {
  var right    = 'x' + qty + '  ' + _formatAmount(unitPrice); // "x1  28.000"
  var maxName  = width - right.length - 1;
  var nameStr  = name.length > maxName ? name.substring(0, maxName) : name;
  var spaces   = width - nameStr.length - right.length;
  return nameStr + _repeat(' ', Math.max(1, spaces)) + right;
}

function _paymentLabel(method) {
  var map = {
    'bank_transfer': 'Chuyen khoan',
    'cash':          'Tien mat',
    'momo':          'MoMo',
    'zalopay':       'ZaloPay',
    'vnpay':         'VNPay',
  };
  return map[method] || 'Thanh toan';
}

function _receiptLocLabel(order) {
  var dt = order.metadata && order.metadata.delivery_type;
  if (dt === 'delivery') {
    var addr = order.metadata.delivery_address || '';
    return 'Giao hang' + (addr ? ': ' + _truncate(addr, 18) : '');
  }
  if (order.table_id) return 'Ban ' + String(order.table_id).replace(/^TABLE_/i, '');
  return 'Mang di';
}

// ── Test ─────────────────────────────────────────────────────────────────────

/** Test in hóa đơn mẫu — chạy thủ công từ GAS editor */
function testPrintReceipt() {
  var sample = {
    order_id:     'ORD-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd') + '-9999',
    table_id:     'TABLE_03',
    channel:      'test',
    customer_id:  '0901234567',
    customer_name: 'Minh',
    timestamp:    new Date().toISOString(),
    items: [
      { sku: 'DR003', name: 'Bac xiu',           qty: 1, price: 28000, modifiers: { size: 'M', sugar: '50%', ice: 'less' } },
      { sku: 'BK001', name: 'Croissant bo Phap', qty: 1, price: 28000, modifiers: {} },
    ],
    subtotal: 56000,
    total:    56000,
    payment:  { method: 'bank_transfer', status: 'PAID' },
    metadata: { notes: '', short_code: '007', delivery_type: 'dine_in' },
  };
  var esc = buildReceiptEscPos(sample);
  sendReceiptToPrinter(esc);
  Logger.log('Test receipt sent (' + esc.length + ' chars)');
}
