/**
 * Code.gs — Entry point cho GAS Web App.
 * Webhook nhận đơn từ Glide / Chrome Form / Phone form → routing đi.
 *
 * Deploy: clasp push → Apps Script editor → Deploy → New deployment
 *         Type: Web App · Execute as: Me · Who has access: Anyone
 *
 * URL trả về sẽ paste vào Glide form action + các kênh khác.
 *
 * Endpoints:
 *   POST /                → Submit order (JSON body)
 *   GET  /?action=orders  → Danh sách đơn hôm nay (KDS)
 *   GET  /?action=mark_paid&order_id=... → Thanh toán + DELIVERED + in receipt
 *   GET  /?action=pending_print         → Đơn chưa in (Mac Mini poller)
 *   GET  /?action=mark_printed&order_id=... → Đánh dấu đã in (Mac Mini poller)
 *   GET  /?action=menu    → Menu đang active
 */

function doPost(e) {
  try {
    var raw = e.postData && e.postData.contents;
    if (!raw) {
      return _jsonResponse({ ok: false, error: 'Empty payload' });
    }

    var payload = JSON.parse(raw);

    // Route xử lý các sự kiện Camera AI & Bảo mật
    if (payload && payload.action === 'admin_login') {
      var res = adminLogin(payload.username, payload.password);
      return _jsonResponse(res);
    }

    if (payload && payload.action === 'update_admin_password') {
      var res = updateAdminPassword(payload.token, payload.old_password, payload.new_password);
      return _jsonResponse(res);
    }

    if (payload && payload.action === 'log_camera_event') {
      var res = saveCameraEvent(payload.secret, payload.event_data || {});
      return _jsonResponse(res);
    }

    // Route xử lý webhook biến động số dư từ MacroDroid
    if (payload && payload.action === 'bank_notification') {
      return handleBankNotification(payload);
    }

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

    if (action === 'pending_print') {
      // Mac Mini poller lấy đơn cần in receipt (DELIVERED + printed_at empty)
      var pending = _getPendingPrintOrders();
      return _jsonResponse({ ok: true, orders: pending });
    }

    if (action === 'mark_printed') {
      // Mac Mini poller đánh dấu đã in xong
      var orderId = e.parameter.order_id;
      if (!orderId) return _jsonResponse({ ok: false, error: 'order_id required' });
      updateField(orderId, 'printed_at', new Date().toISOString());
      return _jsonResponse({ ok: true, order_id: orderId });
    }

    if (action === 'pending_labels') {
      // Mac Mini poller lấy đơn cần in tem (label_printed_at rỗng, chưa bị huỷ, trong 4h)
      var pending = _getPendingLabelOrders();
      return _jsonResponse({ ok: true, orders: pending });
    }

    if (action === 'mark_labels_printed') {
      // Mac Mini poller đánh dấu đã in tem xong
      var orderId = e.parameter.order_id;
      if (!orderId) return _jsonResponse({ ok: false, error: 'order_id required' });
      updateField(orderId, 'label_printed_at', new Date().toISOString());
      return _jsonResponse({ ok: true, order_id: orderId });
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
      var promo = _getPromoInfoInternal();
      return _jsonResponse({ ok: true, count: menu.length, items: menu, promo: promo });
    }

    if (action === 'promo_info') {
      var promo = _getPromoInfoInternal();
      return _jsonResponse({ ok: true, promo: promo });
    }

    if (action === 'customer_info') {
      var phone = e.parameter.phone;
      if (!phone) return _jsonResponse({ ok: false, error: 'phone required' });
      var info = getCustomerInfo(phone);
      return _jsonResponse({ ok: true, customer: info });
    }

    if (action === 'get_camera_events') {
      var token = e.parameter.token;
      var limit = e.parameter.limit;
      var res = getCameraEvents(token, limit);
      return _jsonResponse(res);
    }

    if (action === 'setup_financials') {
      var res = setupExpenseForm();
      createFinancialDashboard();
      return _jsonResponse({ ok: true, message: 'Financial system initialized.', form_url: res.formUrl, edit_url: res.editUrl });
    }

    if (action === 'compute_cogs') {
      var date = e.parameter.date;
      if (!date) {
        date = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      }
      var metrics = computeDailyMetrics(date);
      return _jsonResponse({ ok: true, metrics: metrics });
    }
    
    if (action === 'send_daily_report') {
      var date = e.parameter.date;
      if (!date) {
        date = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      }
      sendDailyEmailReport(date);
      return _jsonResponse({ ok: true, message: 'Report sent for date: ' + date });
    }

    if (action === 'set_promo') {
      var active = e.parameter.active === 'true';
      var duration = e.parameter.duration || '60'; // minutes or 'end_of_day'
      var msg = e.parameter.message || 'Khuyến mãi đặc biệt: Giảm giá 5% cho toàn bộ menu!';
      
      if (active) {
        var start = new Date();
        var end;
        if (duration === 'end_of_day') {
          end = new Date();
          end.setHours(23, 59, 59, 999);
        } else {
          var mins = parseInt(duration, 10) || 60;
          end = new Date(start.getTime() + mins * 60 * 1000);
        }
        setConfig('PROMO_5PERCENT_ACTIVE', 'true');
        setConfig('PROMO_5PERCENT_START', start.toISOString());
        setConfig('PROMO_5PERCENT_END', end.toISOString());
        setConfig('PROMO_5PERCENT_MSG', msg);
      } else {
        setConfig('PROMO_5PERCENT_ACTIVE', 'false');
        setConfig('PROMO_5PERCENT_START', '');
        setConfig('PROMO_5PERCENT_END', '');
      }
      
      var promo = _getPromoInfoInternal();
      return _jsonResponse({ ok: true, promo: promo });
    }

    return _jsonResponse({
      ok: true,
      service: 'Lâm Hà Kissaten Order API',
      version: '1.1',
      endpoints: {
        'POST /': 'Submit order (JSON body — see CLAUDE.md §2)',
        'GET /?action=menu': 'Return active menu items as JSON',
        'GET /?action=promo_info': 'Get active 5% promo status',
        'GET /?action=set_promo&active=true&duration=60&message=...': 'Turn on/off 5% promo',
        'GET /?action=orders': 'Today orders for KDS',
        'GET /?action=mark_paid&order_id=ORD-...': 'Mark paid + print receipt',
        'GET /?action=pending_print': 'Pending receipt print jobs (Mac Mini poller)',
        'GET /?action=mark_printed&order_id=ORD-...': 'Mark receipt as printed',
        'GET /?action=pending_labels': 'Pending label print jobs (Mac Mini poller)',
        'GET /?action=mark_labels_printed&order_id=ORD-...': 'Mark labels as printed',
      },
    });
  } catch (err) {
    logError('doGet', err);
    return _jsonResponse({ ok: false, error: String(err) });
  }
}

/**
 * Trả danh sách đơn cần in tem dán ly:
 * label_printed_at rỗng + status != CANCELLED + trong 4 giờ.
 * Dùng cho Mac Mini poller — in ngay khi đơn NEW (vừa tạo).
 */
function _getPendingLabelOrders() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ORDERS');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000);  // 4 giờ trước
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var status         = row[12];  // col M = status
    var labelPrintedAt = row[20];  // col U = label_printed_at
    var ts             = row[2];   // col C = timestamp
    if (status === 'CANCELLED') continue;
    if (labelPrintedAt) continue;
    var orderDate = ts ? new Date(ts) : null;
    if (!orderDate || orderDate < cutoff) continue;
    result.push(_rowToOrderFull(row));
  }
  return result;
}

/**
 * Trả danh sách đơn cần in receipt:
 * status=DELIVERED và printed_at rỗng, trong vòng 24h.
 * Dùng cho Mac Mini poller (kiến trúc pull thay vì GAS→LAN push).
 *
 * LÝ DO DÙNG POLLING:
 * GAS chạy trên Google Cloud — không reach được IP LAN (192.168.x.x).
 * Thay vào đó: Mac Mini TỰ polling GAS mỗi vài giây qua HTTPS.
 */
function _getPendingPrintOrders() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ORDERS');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var status    = row[12];  // col M = status
    var printedAt = row[22];  // col W = printed_at
    var ts        = row[2];   // col C = timestamp
    if (status !== 'DELIVERED') continue;
    if (printedAt) continue;  // đã in
    var orderDate = ts ? new Date(ts) : null;
    if (!orderDate || orderDate < cutoff) continue;
    result.push(_rowToOrderFull(row));
  }
  return result;
}

/** Full order object cho receipt builder trên Mac Mini */
function _rowToOrderFull(row) {
  return {
    order_id:      row[0],
    timestamp:     row[2],
    table_id:      row[6],
    customer_id:   row[8],
    customer_name: row[24] || '',
    items:         row[9] ? JSON.parse(row[9]) : [],
    subtotal:      row[10],
    total:         row[11],
    status:        row[12],
    payment: {
      method: row[18] || 'bank_transfer',
      status: row[19] || 'PAID',
    },
    metadata: {
      notes:         row[23] || '',
      short_code:    row[25] || '',
      delivery_type: row[26] || '',
    },
  };
}

function _safeJsonParse(s) {
  try { return JSON.parse(s); } catch (_) { return null; }
}

function _jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _getPromoInfoInternal() {
  var activeStr = getConfig('PROMO_5PERCENT_ACTIVE') || 'false';
  var startVal  = getConfig('PROMO_5PERCENT_START') || '';
  var endVal    = getConfig('PROMO_5PERCENT_END') || '';
  var message   = getConfig('PROMO_5PERCENT_MSG') || 'Khuyến mãi đặc biệt: Giảm 5% toàn bộ menu!';
  
  var active = activeStr === true || String(activeStr).trim().toLowerCase() === 'true';
  var now = new Date();
  
  var start = startVal ? new Date(startVal) : null;
  var end = endVal ? new Date(endVal) : null;
  
  if (active && start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
    if (now < start || now > end) {
      active = false;
    }
  }
  
  return {
    active: active,
    percent: 5,
    start: start && !isNaN(start.getTime()) ? start.toISOString() : String(startVal),
    end: end && !isNaN(end.getTime()) ? end.toISOString() : String(endVal),
    message: String(message)
  };
}
