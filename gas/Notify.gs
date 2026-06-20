/**
 * Notify.gs — Telegram alerts cho chủ quán + Zalo OA notify cho khách.
 */

function sendTelegramAlert(message) {
  var token = getConfig('TELEGRAM_BOT_TOKEN');
  var chatId = getConfig('TELEGRAM_CHAT_ID');
  if (!token || !chatId) {
    Logger.log('Telegram not configured');
    return;
  }
  var url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    }),
    muteHttpExceptions: true,
  });
}

// Dịch phương thức + trạng thái thanh toán sang tiếng Việt để hiển thị.
function _payMethodVi(m){var x={vietqr:'VietQR',momo:'MoMo',zalopay:'ZaloPay',cash:'Tiền mặt',bank_transfer:'Chuyển khoản'};return x[m]||m;}
function _payStatusVi(s){var x={PENDING:'Chờ thanh toán',PAID:'Đã thanh toán',FAILED:'Thất bại',UNPAID:'Chưa thanh toán'};return x[s]||s;}

function buildTelegramOrderSummary(order) {
  var meta         = order.metadata || {};
  var deliveryType = meta.delivery_type || 'pickup';
  var isDelivery   = deliveryType === 'delivery';
  var isDineIn     = deliveryType === 'dine_in';

  // Icon + tiêu đề theo hình thức
  var typeLabel;
  if (isDelivery)  typeLabel = '🛵 GIAO HÀNG';
  else if (isDineIn) typeLabel = '🏪 TẠI BÀN';
  else               typeLabel = '🥡 MANG ĐI';

  var lines = [];
  var shortCode = (order.metadata && order.metadata.short_code) ? ' [#' + order.metadata.short_code + ']' : '';
  lines.push('🔔 <b>ĐƠN MỚI · ' + typeLabel + shortCode + '</b>');
  lines.push('🆔 ' + order.order_id);

  // Thông tin khách
  var customerLine = '📞 ' + order.customer_id;
  if (order.customer_name) customerLine += '  (' + order.customer_name + ')';
  lines.push(customerLine);

  // Vị trí / địa chỉ
  if (isDelivery) {
    var addr = meta.delivery_address || '(chưa điền)';
    lines.push('📍 <b>Địa chỉ:</b> ' + addr);
  } else if (isDineIn && order.table_id) {
    lines.push('🪑 Bàn: ' + order.table_id);
  }

  lines.push('─────────');

  // Danh sách món
  order.items.forEach(function (it) {
    var line = '• ' + it.name + ' × ' + it.qty;
    if (it.modifiers && Object.keys(it.modifiers).length) {
      var mods = Object.keys(it.modifiers).map(function (k) {
        return it.modifiers[k];
      }).join(' · ');
      if (mods) line += '\n   ↳ ' + mods;
    }
    lines.push(line);
  });

  // Ghi chú
  if (meta.notes) {
    lines.push('📝 ' + meta.notes);
  }

  lines.push('─────────');
  lines.push('<b>TỔNG: ' + formatCurrency(order.total) + '</b>');
  lines.push('💳 ' + _payMethodVi(order.payment.method) + ' · ' + _payStatusVi(order.payment.status));

  return lines.join('\n');
}

/**
 * Zalo OA notify khách. Cần khách đã follow OA.
 * Phase 2 implement đầy đủ — MVP để stub.
 */
function sendZaloNotify(customerId, message) {
  var token = getConfig('ZALO_OA_TOKEN');
  if (!token) {
    Logger.log('Zalo OA not configured yet (Phase 2)');
    return;
  }
  // TODO Phase 2:
  // POST https://openapi.zalo.me/v2.0/oa/message
  // Header: access_token
  // Body: { recipient: { user_id: zalo_id }, message: { text: message } }
  // Cần lookup zalo_id từ CUSTOMERS theo customer_id (phone).
}

function buildZaloStatusMessage(order, status) {
  var map = {
    'CONFIRMED':  '✅ Đơn ' + order.order_id + ' đã xác nhận. Đang chuẩn bị.',
    'MAKING':     '☕ Pha chế ngay cho bạn!',
    'READY':      '🔔 Đơn xong rồi! Mời ra lấy.',
    'DELIVERING': '🛵 Shipper đang giao tới bạn.',
    'DELIVERED':  '🎉 Cảm ơn bạn! Hẹn gặp lại ❤️',
  };
  return map[status] || '';
}

/** Thông báo stamp update — Tier 2 */
function notifyStampUpdate(customerId, stampsEarned, newCount, totalEver, freeDrinksBalance) {
  var remaining = 10 - newCount;
  var msg = '🐝 [Mitsu Café] Tích điểm thành công!\n' +
            '• Đơn này tích lũy: ' + stampsEarned + ' tem\n' +
            '• Số tem hiện tại: ' + newCount + '/10 🎟️\n' +
            '• Số ly nước thưởng đang có: ' + freeDrinksBalance + ' 🎁\n';
  if (freeDrinksBalance > 0) {
    msg += '👉 Hãy chọn "Đổi ly nước miễn phí" trong lần đặt đơn tới nhé!';
  } else {
    msg += '👉 Còn ' + remaining + ' tem nữa để nhận 1 ly nước miễn phí!';
  }
  
  // Gửi Zalo OA
  sendZaloNotify(customerId, msg);

  // Gửi Telegram alert để chủ quán theo dõi
  try {
    var tgMsg = '🐝 <b>TÍCH ĐIỂM THÀNH VIÊN</b>\n' +
                'Khách hàng: <code>' + customerId + '</code>\n' +
                '• Đơn này tích lũy: <b>+' + stampsEarned + '</b> tem\n' +
                '• Số tem hiện tại: <b>' + newCount + '/10</b> 🎟️\n' +
                '• Số ly nước thưởng: <b>' + freeDrinksBalance + '</b> 🎁';
    sendTelegramAlert(tgMsg);
  } catch (tgErr) {
    Logger.log('Telegram loyalty alert error: ' + tgErr);
  }
}
