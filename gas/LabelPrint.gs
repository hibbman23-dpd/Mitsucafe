/**
 * LabelPrint.gs — In tem dán ly khi đơn CONFIRMED.
 *
 * Quy tắc: mỗi item × qty = 1 tem riêng (qty=2 → in 2 tem).
 * Gửi ESC/POS raw bytes tới Flask server trên Mac Mini → forward TCP 9100 → Xprinter POS-58L.
 */

function printOrderLabels(order) {
  if (!order || !order.items || !order.items.length) {
    logError('printOrderLabels', new Error('Empty order or items'));
    return;
  }

  order.items.forEach(function (item) {
    for (var i = 0; i < item.qty; i++) {
      try {
        var esc = buildLabelEscPos(order, item);
        sendToPrinter(esc);
      } catch (err) {
        logError('printOrderLabels item ' + item.sku, err);
      }
    }
  });

  updateField(order.order_id, 'label_printed_at', new Date().toISOString());
}

/**
 * Build ESC/POS command string cho 1 tem 58mm.
 * Layout (28 ký tự width):
 *   ORD-XXXX     Bàn 03
 *   ──────────────────
 *   <Tên món> x1
 *     <modifier1> · <modifier2>
 *     <notes nếu có>
 *   HH:MM · staff_id
 *   [full cut]
 */
function buildLabelEscPos(order, item) {
  var ESC = '\x1B';
  var GS = '\x1D';
  var d = '';

  d += ESC + '@';                          // Init printer
  d += ESC + '!\x08';                      // Emphasized (bold)
  d += ESC + 'a\x01';                      // Center align

  var shortId = order.order_id.replace('ORD-', '').replace(/^\d{8}-/, '');
  var rightLabel = order.table_id ? 'Bàn ' + order.table_id : order.channel.toUpperCase();
  d += 'ORD-' + shortId + '  ' + rightLabel + '\n';

  d += ESC + '!\x00';                      // Cancel bold
  d += ESC + 'a\x00';                      // Left align
  d += _repeat('-', 28) + '\n';

  d += ESC + '!\x10';                      // Double height
  d += item.name + ' x1\n';
  d += ESC + '!\x00';

  if (item.modifiers) {
    var mods = Object.keys(item.modifiers).map(function (k) {
      return k + ': ' + item.modifiers[k];
    }).join(' · ');
    if (mods) d += '  ' + mods + '\n';
  }

  if (order.metadata && order.metadata.notes) {
    d += '  ' + order.metadata.notes + '\n';
  }

  d += formatTime(order.timestamp) + ' · ' + (order.staff_id || '') + '\n';
  d += '\n\n\n';                            // Feed before cut
  d += GS + 'V\x42\x00';                   // Full cut

  return d;
}

function sendToPrinter(escposData) {
  var ip = getConfig('LABEL_PRINTER_IP');
  var port = getConfig('PRINT_SERVER_PORT') || '5000';
  if (!ip) {
    logError('sendToPrinter', new Error('LABEL_PRINTER_IP not set in CONFIG'));
    return;
  }
  var url = 'http://' + ip + ':' + port + '/print';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/octet-stream',
    payload: Utilities.newBlob(escposData).getBytes(),
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('Print server returned ' + response.getResponseCode() + ': ' + response.getContentText());
  }
}

function _repeat(s, n) {
  var out = '';
  for (var i = 0; i < n; i++) out += s;
  return out;
}

/** Test in 1 tem mẫu — chạy thủ công từ GAS editor */
function testPrintSample() {
  var sample = {
    order_id: 'ORD-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd') + '-9999',
    table_id: '03',
    channel: 'test',
    staff_id: 'S001',
    timestamp: new Date().toISOString(),
    items: [{ sku: 'DR003', name: 'Bạc xỉu', qty: 1, modifiers: { sugar: '50%', ice: 'less' } }],
    metadata: { notes: 'ít ngọt' },
  };
  printOrderLabels(sample);
}
