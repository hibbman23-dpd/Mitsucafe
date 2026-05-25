/**
 * LabelPrint.gs — In tem dán cốc khi đơn CONFIRMED.
 *
 * Máy in: Xprinter XP-365B — die-cut label 40×30mm (203 dpi).
 * Quy tắc: mỗi item × qty → in qty tem riêng.
 * Flow: GAS → Flask /print/label → TCP 9100 → XP-365B.
 *
 * Cấu hình printer cần làm 1 lần:
 *   - Kết nối XP-365B vào Xprinter Label Tool (Windows)
 *   - Cài label size: 40mm × 30mm, die-cut
 *   - Set code page: UTF-8 (nếu firmware hỗ trợ) hoặc CP1258
 *   - Cài IP tĩnh cho XP-365B trên LAN, điền vào env LABEL_PRINTER_IP
 *
 * Preview tem 40×30mm (24 ký tự/dòng):
 * ┌────────────────────────┐
 * │ #007        Bàn 03     │  ← bold
 * │ ──────────────────────  │
 * │ Bạc xỉu × 1            │  ← double-height
 * │   Vừa · Ít đá          │
 * │   ít ngọt (ghi chú)    │
 * │ 14:32                  │
 * └────────────────────────┘
 */

var LABEL_W = 24; // ký tự/dòng cho 40mm label (203 dpi, font 8×16)

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * In tem cho từng item trong đơn.
 * Gọi từ Orders.gs khi status → CONFIRMED.
 */
function printOrderLabels(order) {
  if (!order || !order.items || !order.items.length) {
    logError('printOrderLabels', new Error('Empty order or items'));
    return;
  }
  order.items.forEach(function (item) {
    for (var i = 0; i < item.qty; i++) {
      try {
        var esc = buildLabelEscPos365B(order, item);
        sendLabelToPrinter(esc);
      } catch (err) {
        logError('printOrderLabels item=' + item.sku, err);
      }
    }
  });
  updateField(order.order_id, 'label_printed_at', new Date().toISOString());
}

// ── ESC/POS builder — XP-365B 40×30mm ─────────────────────────────────────────

/**
 * Build ESC/POS command string cho 1 tem 40×30mm trên XP-365B.
 *
 * ESC/POS refs dùng:
 *   ESC @       = Init printer
 *   ESC t 255   = UTF-8 code page (Xprinter firmware 2020+)
 *   ESC 3 n     = Line spacing = n dots (24 = tight)
 *   ESC ! n     = Font style: 0x00=normal 0x08=bold 0x10=double-height
 *   ESC a n     = Justify: 0=left 1=center
 *   GS V 0x42 0 = Full cut
 */
function buildLabelEscPos365B(order, item) {
  var ESC = '\x1B', GS = '\x1D';
  var d = '';

  // Init + UTF-8 mode
  d += ESC + '@';           // Init printer
  d += ESC + 't\xFF';       // Code page 255 = UTF-8 (Xprinter 2020+)
  d += ESC + '3\x18';       // Line spacing 24 dots (tight)

  // ── Dòng 1: Short code + vị trí (bold) ────────────────────────────────────
  var shortCode = '#' + ((order.metadata && order.metadata.short_code) || order.order_id.slice(-4));
  var loc = _locationLabel(order);
  d += ESC + '!\x08';       // Bold
  d += _padBetween(shortCode, loc, LABEL_W) + '\n';
  d += ESC + '!\x00';       // Normal

  // ── Separator ─────────────────────────────────────────────────────────────
  d += _repeat('─', LABEL_W) + '\n'; // ── (unicode dash, fallback to -)

  // ── Tên món (double-height) ───────────────────────────────────────────────
  d += ESC + '!\x10';       // Double-height
  var nameLine = _truncate(item.name, LABEL_W - 3) + ' \xd7' + item.qty; // × qty
  d += nameLine + '\n';
  d += ESC + '!\x00';       // Normal

  // ── Modifiers ─────────────────────────────────────────────────────────────
  var mods = _buildModsLine(item.modifiers);
  if (mods) {
    d += _truncate('  ' + mods, LABEL_W) + '\n';
  }

  // ── Ghi chú ───────────────────────────────────────────────────────────────
  if (order.metadata && order.metadata.notes) {
    d += _truncate('  ' + order.metadata.notes, LABEL_W) + '\n';
  }

  // ── Thời gian ─────────────────────────────────────────────────────────────
  d += formatTime(order.timestamp) + '\n';

  // ── Feed + cắt ────────────────────────────────────────────────────────────
  d += ESC + '2';           // Reset line spacing
  d += '\n\n';              // 2 dòng trống trước khi cắt
  d += GS + 'V\x42\x00';   // Full cut

  return d;
}

// ── Gửi tới Flask server ──────────────────────────────────────────────────────

/** Gửi tem tới /print/label → XP-365B */
function sendLabelToPrinter(escposData) {
  _postToPrintServer('/print/label', escposData);
}

/** Gửi hóa đơn tới /print/receipt → POS-58L */
function sendReceiptToPrinter(escposData) {
  _postToPrintServer('/print/receipt', escposData);
}

/** Backward compat — dùng receipt printer */
function sendToPrinter(escposData) {
  sendReceiptToPrinter(escposData);
}

function _postToPrintServer(path, escposData) {
  var url = _printServerUrl(path);
  var response = UrlFetchApp.fetch(url, {
    method:      'post',
    contentType: 'application/octet-stream',
    payload:     Utilities.newBlob(escposData).getBytes(),
    muteHttpExceptions: true,
  });
  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('Print server ' + path + ' → HTTP ' + code + ': ' + response.getContentText());
  }
}

function _printServerUrl(path) {
  // PRINT_SERVER_IP = IP Mac Mini (nơi Flask chạy)
  // Backward compat: fallback sang LABEL_PRINTER_IP (tên cũ)
  var ip   = getConfig('PRINT_SERVER_IP') || getConfig('LABEL_PRINTER_IP');
  var port = getConfig('PRINT_SERVER_PORT') || '5000';
  if (!ip) throw new Error('PRINT_SERVER_IP not configured in CONFIG sheet');
  return 'http://' + ip + ':' + port + path;
}

// ── String helpers ────────────────────────────────────────────────────────────

/**
 * Điền khoảng trắng giữa left và right để tổng = width.
 * VD: _padBetween('#007', 'Bàn 03', 24) → '#007        Bàn 03'
 */
function _padBetween(left, right, width) {
  var spaces = width - left.length - right.length;
  return left + _repeat(' ', Math.max(1, spaces)) + right;
}

/**
 * Căn giữa text trong width.
 * VD: _center('KAERU', 32) → '             KAERU             '
 */
function _center(text, width) {
  if (text.length >= width) return text;
  var pad = Math.floor((width - text.length) / 2);
  return _repeat(' ', pad) + text;
}

/**
 * Căn phải text trong width.
 */
function _rjust(text, width) {
  if (text.length >= width) return text;
  return _repeat(' ', width - text.length) + text;
}

/** Cắt chuỗi nếu dài hơn max. */
function _truncate(s, max) {
  return s.length > max ? s.substring(0, max) : s;
}

/** Lặp ký tự n lần. */
function _repeat(ch, n) {
  var out = '';
  for (var i = 0; i < n; i++) out += ch;
  return out;
}

/** Format số tiền: 28000 → "28.000" */
function _formatAmount(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Label vị trí/hình thức nhận đơn ngắn gọn. */
function _locationLabel(order) {
  var dt = order.metadata && order.metadata.delivery_type;
  if (dt === 'delivery') return 'Giao hang';
  if (order.table_id)   return 'Ban ' + String(order.table_id).replace(/^TABLE_/i, '');
  return 'Mang di';
}

/** Build chuỗi modifiers ngắn gọn. */
function _buildModsLine(modifiers) {
  if (!modifiers) return '';
  var parts = [];
  var sugarMap = { '0%':'K.ngot', '30%':'It ngot', '50%':'Vua', '70%':'Ngot', '100%':'R.ngot' };
  var iceMap   = { 'full':'Nhieu da', 'less':'It da', 'none':'K.da', 'blended':'Xay' };
  if (modifiers.size)     parts.push(modifiers.size);
  if (modifiers.sugar)    parts.push(sugarMap[modifiers.sugar] || modifiers.sugar);
  if (modifiers.ice)      parts.push(iceMap[modifiers.ice]     || modifiers.ice);
  if (modifiers.toppings) parts.push(modifiers.toppings);
  return parts.join(' \xb7 '); // ·
}

// ── Test functions ────────────────────────────────────────────────────────────

/** Test in 1 tem mẫu — chạy thủ công từ GAS editor */
function testPrintLabel() {
  var sample = {
    order_id:  'ORD-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd') + '-9999',
    table_id:  'TABLE_03',
    channel:   'test',
    staff_id:  'S001',
    timestamp: new Date().toISOString(),
    items: [{
      sku:       'DR003',
      name:      'Bac xiu',
      qty:       1,
      modifiers: { size: 'M', sugar: '50%', ice: 'less' },
    }],
    metadata: { notes: 'it ngot', short_code: '007', delivery_type: 'dine_in' },
  };
  printOrderLabels(sample);
  Logger.log('Test label sent');
}

/** Test health check tới Flask server */
function testPrintServerHealth() {
  var url = _printServerUrl('/health');
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  Logger.log('Health: ' + res.getContentText());
}
