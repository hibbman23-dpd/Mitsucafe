/**
 * Code.gs — Entry point cho GAS Web App.
 * Webhook nhận đơn từ Glide / Chrome Form / Phone form → routing đi.
 *
 * Deploy: clasp push → Apps Script editor → Deploy → New deployment
 *         Type: Web App · Execute as: Me · Who has access: Anyone
 *
 * URL trả về sẽ paste vào Glide form action + các kênh khác.
 */

function doPost(e) {
  try {
    var raw = e.postData && e.postData.contents;
    if (!raw) {
      return _jsonResponse({ ok: false, error: 'Empty payload' });
    }

    var payload = JSON.parse(raw);
    var order = validateOrderPayload(payload);

    appendOrderToSheet(order);

    try {
      sendTelegramAlert(buildTelegramOrderSummary(order));
    } catch (tgErr) {
      logError('doPost.telegram', tgErr);
    }

    return _jsonResponse({ ok: true, order_id: order.order_id });
  } catch (err) {
    logError('doPost', err);
    return _jsonResponse({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    var action = e && e.parameter && e.parameter.action;
    if (action === 'orders') {
      var orders = getTodayOrders();
      return _jsonResponse({ ok: true, orders: orders });
    }

    if (action === 'mark_paid') {
      var orderId = e.parameter.order_id;
      if (!orderId) return _jsonResponse({ ok: false, error: 'order_id required' });
      markOrderPaid(orderId);
      return _jsonResponse({ ok: true, order_id: orderId, payment_status: 'PAID' });
    }

    if (action === 'menu') {
      var menu = getActiveMenu().map(function (item) {
        return {
          sku: item.sku,
          name: item.name,
          name_jp: item.name_jp || '',
          category: item.category,
          subcategory: item.subcategory || '',
          role: item.role || '',
          price_m: item.price_m,
          price_l: item.price_l || null,
          on_promo: !!item.on_promo,
          promo_price: item.promo_price || null,
          customizations: item.customizations_json
            ? _safeJsonParse(item.customizations_json)
            : {},
          allergens: item.allergens
            ? _safeJsonParse(item.allergens)
            : [],
          image_url: item.image_url || '',
          sort_order: item.sort_order || 999,
          story_telling: item.story_telling || '',
        };
      });
      return _jsonResponse({ ok: true, count: menu.length, items: menu });
    }

    return _jsonResponse({
      ok: true,
      service: 'Lâm Hà Kissaten Order API',
      version: '1.1',
      endpoints: {
        'POST /': 'Submit order (JSON body — see CLAUDE.md §2)',
        'GET /?action=menu': 'Return active menu items as JSON',
      },
    });
  } catch (err) {
    logError('doGet', err);
    return _jsonResponse({ ok: false, error: String(err) });
  }
}

function _safeJsonParse(s) {
  try { return JSON.parse(s); } catch (_) { return null; }
}

function _jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
