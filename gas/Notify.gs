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
  lines.push('💳 ' + order.payment.method + ' · ' + order.payment.status);

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
function notifyStampUpdate(customerId, newCount, totalEver) {
  var remaining = 10 - newCount;
  var msg;
  if (newCount === 0) {
    msg = '✅ 1 ly miễn phí đã dùng. Tem bắt đầu từ 0. Cảm ơn! ❤️';
  } else if (newCount >= 10) {
    msg = '🎉 Đủ 10 tem rồi! Lần sau ghé nhắc nhân viên để lấy 1 ly free nhé!';
  } else {
    msg = '☕ Vừa tích 1 tem! ' + newCount + '/10 🎟️ · Còn ' + remaining + ' tem nữa là free!';
  }
  sendZaloNotify(customerId, msg);
}
