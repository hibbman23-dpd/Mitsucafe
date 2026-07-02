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
 *   GET  /?action=roi_data&from=YYYY-MM-DD&to=YYYY-MM-DD → Data cho Agent ROI (ORDERS+PROMOTIONS+MARKETING_LOG+MENU costs)
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Chờ tối đa 20 giây để lấy lock cho doPost
    lock.waitLock(20000);
  } catch (lockErr) {
    logError('doPost.lock', lockErr);
    return _jsonResponse({ ok: false, error: 'System busy, please try again.' });
  }

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

    // ── Device approval ──
    // Đăng ký thiết bị mới (open — thiết bị tự xin quyền, mặc định PENDING).
    if (payload && payload.action === 'device_register') {
      return _jsonResponse(deviceRegister(payload.device_id, payload.label, payload.user_agent));
    }
    // Duyệt/thu hồi/đặt nhãn từ dashboard — cần admin session (KHÔNG device-gate → bootstrap).
    if (payload && (payload.action === 'device_approve' || payload.action === 'device_revoke' || payload.action === 'device_label')) {
      if (!validateSessionToken(payload.token)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      if (payload.action === 'device_approve') return _jsonResponse(deviceApprove(payload.device_id, 'admin', payload.label));
      if (payload.action === 'device_revoke') return _jsonResponse(deviceRevoke(payload.device_id));
      return _jsonResponse(deviceLabel(payload.device_id, payload.label));
    }

    // Agent ghi 1 dòng insight lên dashboard (yêu cầu admin session token)
    if (payload && payload.action === 'log_agent_insight') {
      if (!validateSessionToken(payload.token)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      var insId = logAgentInsight(payload);
      return _jsonResponse({ ok: true, insight_id: insId });
    }

    // ── Dashboard admin writes (đều cần admin session token) ──
    var _ADMIN_WRITE = {
      'menu_update': adminMenuUpdate, 'menu_add': adminMenuAdd,
      'inventory_update': adminInventoryUpdate, 'inventory_add': adminInventoryAdd,
      'staff_update': adminStaffUpdate, 'staff_add': adminStaffAdd,
      'promo_toggle': adminPromoToggle, 'config_set': adminConfigSet,
    };
    if (payload && _ADMIN_WRITE[payload.action]) {
      if (!validateSessionToken(payload.token)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      if (!isDeviceApproved(payload.device_id)) {
        return _jsonResponse({ ok: false, error: 'device_not_approved' });
      }
      return _jsonResponse(_ADMIN_WRITE[payload.action](payload));
    }

    // ── Command queue (chat → Claude Code) ──
    if (payload && payload.action === 'queue_command') {
      if (!validateSessionToken(payload.token)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      if (!isDeviceApproved(payload.device_id)) {
        return _jsonResponse({ ok: false, error: 'device_not_approved' });
      }
      return _jsonResponse(queueCommand(payload));
    }
    if (payload && payload.action === 'command_update') {
      if (!validateSessionToken(payload.token)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      return _jsonResponse(updateCommand(payload));
    }
    if (payload && payload.action === 'dispatcher_heartbeat') {
      if (!validateSessionToken(payload.token)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      return _jsonResponse(recordDispatcherHeartbeat());
    }

    if (payload && payload.action === 'set_signage') {
      if (!validateSessionToken(payload.token)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      if (!isDeviceApproved(payload.device_id)) return _jsonResponse({ ok: false, error: 'device_not_approved' });
      return _jsonResponse(setSignageConfig(payload));
    }

    if (payload && payload.action === 'set_promo') {
      if (!validateSessionToken(payload.token)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      if (!isDeviceApproved(payload.device_id)) return _jsonResponse({ ok: false, error: 'device_not_approved' });
      var result = setStorePromo(payload.percent, payload.active === true || payload.active === 'true', payload.duration || '60', payload.message);
      if (!result.ok) return _jsonResponse({ ok: false, error: result.error || 'set_promo_failed' });
      return _jsonResponse({ ok: true, promo: _getPromoInfoInternal() });
    }

    // ── cafe-insight: nhập số post thủ công + ghi quyết định (admin session) ──
    if (payload && payload.action === 'log_content') {
      if (!validateSessionToken(payload.token)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      var cid = logMarketingActivity(payload.data || {});
      return _jsonResponse({ ok: true, activity_id: cid });
    }
    if (payload && payload.action === 'log_decision') {
      if (!validateSessionToken(payload.token)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      var did = logDecision(payload.data || {});
      return _jsonResponse({ ok: true, decision_id: did });
    }

    if (payload && payload.action === 'link_social_id') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var res = linkCustomerSocialId(payload.phone, {
        fb_psid: payload.fb_psid || null,
        ig_igsid: payload.ig_igsid || null,
        zalo_id: payload.zalo_id || null
      });
      return _jsonResponse(res);
    }

    // cafe-insight P2.5: nhận metric video TikTok do Mac mini kéo bằng yt-dlp (free, no API key).
    // Gate bằng REPORT_API_TOKEN (token Mac mini đã có trong .claude/.dispatcher-auth.json).
    // Mỗi video upsert theo external key 'tt_<id>' → data_source='auto', giữ NGÀY ĐĂNG THẬT.
    if (payload && payload.action === 'tiktok_ingest') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var ttVids = payload.videos || [];
      var ttN = 0;
      for (var ti = 0; ti < ttVids.length; ti++) {
        var tv = ttVids[ti];
        if (!tv || !tv.id) continue;
        upsertMarketingByExternalId('tt_' + tv.id, {
          platform: 'tiktok', type: 'post', format: 'reel',
          title: (tv.title || '').slice(0, 80), date: tv.date || undefined,
          views: Number(tv.views) || 0, likes: Number(tv.likes) || 0,
          comments: Number(tv.comments) || 0, shares: Number(tv.shares) || 0
        });
        ttN++;
      }
      return _jsonResponse({ ok: true, ingested: ttN });
    }

    // Route xử lý webhook biến động số dư từ MacroDroid.
    // Bảo vệ bằng shared secret (CONFIG.BANK_WEBHOOK_SECRET). Nếu chưa set CONFIG →
    // cho qua (tương thích ngược, giống _requireTokenIfSet). Set CONFIG + thêm
    // "secret" vào POST của MacroDroid để bật fail-closed.
    if (payload && payload.action === 'bank_notification') {
      var _bws = getConfig('BANK_WEBHOOK_SECRET');
      if (_bws && String(payload.secret || '') !== String(_bws)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      return handleBankNotification(payload);
    }

    // Idempotency: nếu client retry với cùng key → trả lại đơn cũ, KHÔNG tạo trùng.
    var _idemKey = (payload.metadata && payload.metadata.idempotency_key) || payload.idempotency_key || '';
    if (_idemKey) {
      var _existing = findOrderIdByIdempotencyKey(_idemKey);
      if (_existing) {
        return _jsonResponse({ ok: true, order_id: _existing, deduped: true });
      }
    }

    var order = validateOrderPayload(payload);

    // Mã đơn hiển thị do SERVER cấp (không trùng giữa các khách) — ghi đè short_code client gửi.
    order.metadata.short_code = buildShortCode(order.metadata.delivery_type);

    appendOrderToSheet(order);

    try {
      sendTelegramAlert(buildTelegramOrderSummary(order));
    } catch (tgErr) {
      logError('doPost.telegram', tgErr);
    }

    return _jsonResponse({ ok: true, order_id: order.order_id, short_code: order.metadata.short_code });
  } catch (err) {
    logError('doPost', err);
    return _jsonResponse({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;

  // Chỉ khóa cho các action ghi (mutation) để tránh tắc nghẽn luồng đọc (menu, pending_print, orders, v.v.)
  var writeActions = [
    'mark_paid',
    'mark_printed',
    'mark_labels_printed',
    'set_promo',
    'setup_financials',
    'compute_cogs',
    'waste_submit',
    'review_submit',
    'rfm_snapshot',
    'rfm_refresh',
    'winback_candidates',
    'device_approve',
    'device_revoke',
    'dispatch_done',
    'record_decision_result',
    'ga4_pull',
    'meta_pull',
    'gbp_pull',
    'zalo_pull',
    'tiktok_pull',
    'link_social_id',
    'daily_rollup',
    'menu_snapshot',
    'rollup_backfill',
    'traffic_ingest'
  ];
  var isWrite = writeActions.indexOf(action) !== -1;

  var lock = null;
  if (isWrite) {
    lock = LockService.getScriptLock();
    try {
      // Chờ tối đa 15 giây để lấy lock cho doGet
      lock.waitLock(15000);
    } catch (lockErr) {
      logError('doGet.lock', lockErr);
      return _jsonResponse({ ok: false, error: 'System busy, please try again.' });
    }
  }

  try {
    var action = e && e.parameter && e.parameter.action;

    if (action === 'orders') {
      // KDS đọc đơn hôm nay (kèm PII khách) — yêu cầu token + thiết bị đã duyệt
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      if (!isDeviceApproved(e.parameter.device_id)) return _jsonResponse({ ok: false, error: 'device_not_approved' });
      var orders = getTodayOrders();
      return _jsonResponse({ ok: true, orders: orders });
    }

    if (action === 'update_status') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var orderId = e.parameter.order_id;
      var newStatus = e.parameter.status;
      if (!orderId || !newStatus) return _jsonResponse({ ok: false, error: 'missing params' });
      updateOrderStatus(orderId, newStatus);
      return _jsonResponse({ ok: true, order_id: orderId, status: newStatus });
    }

    if (action === 'order_status') {
      var orderId = e.parameter.order_id;
      if (!orderId) return _jsonResponse({ ok: false, error: 'order_id required' });
      var row = _findOrderRow(orderId);
      if (!row) return _jsonResponse({ ok: false, error: 'not found' });
      var order = _rowToOrder(row.data);
      return _jsonResponse({ 
        ok: true, 
        order_id: orderId, 
        status: order.status, 
        delivery_type: order.delivery_type,
        short_code: order.short_code,
        total: order.total,
        payment_method: order.payment_method,
        payment_status: order.payment_status
      });
    }

    if (action === 'active_orders') {
      var allOrders = getTodayOrders(); // this is fast enough for today's orders
      var nowTime = new Date().getTime();
      var filtered = allOrders.filter(function(o) {
        if (['NEW', 'CONFIRMED', 'MAKING', 'READY'].indexOf(o.status) !== -1) {
          return true;
        }
        if (o.status === 'DELIVERED' && o.delivered_at) {
          try {
            var delTime = new Date(o.delivered_at).getTime();
            if (nowTime - delTime <= 45000) { // Keep DELIVERED orders on the board for 45s
              return true;
            }
          } catch(e) {}
        }
        return false;
      }).map(function(o) {
        return {
          order_id:       o.order_id,
          status:         o.status,
          delivery_type:  o.delivery_type,
          short_code:     o.short_code,
          payment_status: o.payment_status,
          table_id:       o.table_id,
          delivered_at:   o.delivered_at,
          making_at:      o.making_at,
          delivering_at:  o.delivering_at
        };
      });
      return _jsonResponse({ ok: true, orders: filtered });
    }

    if (action === 'mark_paid') {
      // Mutation tiền: KDS / Mac Mini poller — yêu cầu token (+ device nếu gọi từ KDS)
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var orderId = e.parameter.order_id;
      if (!orderId) return _jsonResponse({ ok: false, error: 'order_id required' });
      markOrderPaid(orderId);
      return _jsonResponse({ ok: true, order_id: orderId, payment_status: 'PAID' });
    }

    if (action === 'pending_print') {
      // Mac Mini poller lấy đơn cần in receipt (DELIVERED + printed_at empty) — yêu cầu token
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var pending = _getPendingPrintOrders();
      return _jsonResponse({ ok: true, orders: pending });
    }

    if (action === 'mark_printed') {
      // Mac Mini poller đánh dấu đã in xong — yêu cầu token
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var orderId = e.parameter.order_id;
      if (!orderId) return _jsonResponse({ ok: false, error: 'order_id required' });
      updateField(orderId, 'printed_at', new Date().toISOString());
      return _jsonResponse({ ok: true, order_id: orderId });
    }

    if (action === 'pending_labels') {
      // Mac Mini poller lấy đơn cần in tem (label_printed_at rỗng, chưa bị huỷ, trong 4h) — yêu cầu token
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var pending = _getPendingLabelOrders();
      return _jsonResponse({ ok: true, orders: pending });
    }

    if (action === 'mark_labels_printed') {
      // Mac Mini poller đánh dấu đã in tem xong — yêu cầu token
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
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

    if (action === 'signage_config') {
      // Public: màn signage chỉ đọc dữ liệu marketing.
      return _jsonResponse(getSignageConfig());
    }

    if (action === 'customer_info') {
      // Public (order.js dùng để autofill loyalty). KHÔNG trả field nội bộ.
      var phone = e.parameter.phone;
      if (!phone) return _jsonResponse({ ok: false, error: 'phone required' });
      var info = getCustomerInfo(phone);
      if (info) { delete info.zalo_id; delete info.notes; }
      return _jsonResponse({ ok: true, customer: info });
    }

    if (action === 'get_camera_events') {
      var token = e.parameter.token;
      var limit = e.parameter.limit;
      var res = getCameraEvents(token, limit);
      return _jsonResponse(res);
    }

    if (action === 'setup_financials') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var res = setupExpenseForm();
      createFinancialDashboard();
      return _jsonResponse({ ok: true, message: 'Financial system initialized.', form_url: res.formUrl, edit_url: res.editUrl });
    }

    if (action === 'compute_cogs') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var date = e.parameter.date;
      if (!date) {
        date = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      }
      var metrics = computeDailyMetrics(date);
      return _jsonResponse({ ok: true, metrics: metrics });
    }

    if (action === 'roi_data') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var roiTo = e.parameter.to || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      var roiFrom = e.parameter.from;
      if (!roiFrom) {
        // mặc định 28 ngày để đủ baseline so sánh
        roiFrom = Utilities.formatDate(new Date(Date.now() - 28 * 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      }
      return _jsonResponse({ ok: true, data: getRoiData(roiFrom, roiTo) });
    }

    if (action === 'mmm_data') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var mmmTo = e.parameter.to || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      var mmmFrom = e.parameter.from;
      if (!mmmFrom) {
        // default 1 year
        mmmFrom = Utilities.formatDate(new Date(Date.now() - 365 * 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      }
      return _jsonResponse({ ok: true, data: getMmmData(mmmFrom, mmmTo) });
    }

    if (action === 'inventory_snapshot') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      return _jsonResponse({ ok: true, inventory: _adminReadSheet('INVENTORY') });
    }

    if (action === 'link_social_id') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var res = linkCustomerSocialId(e.parameter.phone, {
        fb_psid: e.parameter.fb_psid || null,
        ig_igsid: e.parameter.ig_igsid || null,
        zalo_id: e.parameter.zalo_id || null
      });
      return _jsonResponse(res);
    }

    // cafe-insight: lấy quyết định tới hạn review (đọc)
    if (action === 'get_decisions_due') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      return _jsonResponse({ ok: true, decisions: getDecisionsDue() });
    }
    // cafe-insight: ghi kết quả review 1 quyết định (write — đã có trong writeActions)
    if (action === 'record_decision_result') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var okRec = recordDecisionResult(
        e.parameter.decision_id, e.parameter.actual_result, e.parameter.hit_or_miss);
      return _jsonResponse({ ok: okRec });
    }

    // cafe-insight P2: kéo GA4 thủ công (mặc định 7 ngày nếu không truyền from/to)
    if (action === 'ga4_pull') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var gTo = e.parameter.to || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      var gFrom = e.parameter.from ||
        Utilities.formatDate(new Date(Date.now() - 7 * 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      var ga4Rows = pullGa4Traffic(gFrom, gTo);
      return _jsonResponse({ ok: true, pulled_rows: ga4Rows, range: { from: gFrom, to: gTo } });
    }

    // cafe-insight P2: kéo Meta FB/IG/Threads thủ công (mặc định 7 ngày)
    if (action === 'meta_pull') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var mTo = e.parameter.to || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      var mFrom = e.parameter.from ||
        Utilities.formatDate(new Date(Date.now() - 7 * 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      return _jsonResponse(pullMetaAll(mFrom, mTo));
    }
    // cafe-insight P2: trạng thái token Meta (đọc)
    if (action === 'meta_health') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      return _jsonResponse(checkMetaTokenHealth());
    }

    // cafe-insight P2.5: kéo metric GBP/Maps thủ công (mặc định 7 ngày)
    if (action === 'gbp_pull') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var gbTo = e.parameter.to || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      var gbFrom = e.parameter.from ||
        Utilities.formatDate(new Date(Date.now() - 7 * 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      return _jsonResponse({ ok: true, days: pullGbpDaily(gbFrom, gbTo) });
    }

    // cafe-insight P2.5: kéo follower Zalo OA (best-effort) → MARKETING_LOG
    if (action === 'zalo_pull') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      return _jsonResponse({ ok: pullZaloDailyFollowers() });
    }
    // cafe-insight P2.5: kéo video TikTok qua Firecrawl (opt-in; 0 nếu tắt/chặn → nhập tay)
    if (action === 'tiktok_pull') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      return _jsonResponse({ ok: true, videos: pullTiktokViaFirecrawl() });
    }

    // SCALE (Tier 5): rollup ngày 1 chi nhánh (location_id khóa đầu). HQ pull route này.
    // &record=true → ghi/cập nhật HQ_DAILY (idempotent). Mặc định chỉ tính + trả về.
    if (action === 'daily_rollup') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var drDate = e.parameter.date || '';
      var rollup = (e.parameter.record === 'true') ? recordDailyRollup(drDate) : getDailyRollup(drDate);
      return _jsonResponse({ ok: true, rollup: rollup });
    }
    // SCALE: snapshot MENU cứng từ HQ master (no-op nếu chưa set MENU_MASTER_SHEET_ID).
    if (action === 'menu_snapshot') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      return _jsonResponse(snapshotMenuFromMaster());
    }
    // SCALE: backfill HQ_DAILY cho [from,to] (cho Looker có data lịch sử).
    if (action === 'rollup_backfill') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      if (!e.parameter.from || !e.parameter.to) return _jsonResponse({ ok: false, error: 'from + to required' });
      return _jsonResponse({ ok: true, days: recordRollupRange(e.parameter.from, e.parameter.to) });
    }
    // CAMERA: Mac mini đếm khách VÀO cửa (ẩn danh) → ghi FOOT_TRAFFIC (nền conversion = đơn/khách).
    if (action === 'traffic_ingest') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      return _jsonResponse(recordTraffic(e.parameter.date || '', e.parameter.walk_ins, e.parameter.source || 'camera'));
    }

    if (action === 'send_daily_report') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var date = e.parameter.date;
      if (!date) {
        date = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      }
      sendDailyEmailReport(date);
      return _jsonResponse({ ok: true, message: 'Report sent for date: ' + date });
    }

    if (action === 'set_promo') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      if (!isDeviceApproved(e.parameter.device_id)) return _jsonResponse({ ok: false, error: 'device_not_approved' });
      var active = e.parameter.active === 'true';
      var duration = e.parameter.duration || '60'; // minutes or 'end_of_day'
      var percent = e.parameter.percent || '5';     // default 5 for backward-compat
      var msg = e.parameter.message || 'Ưu đãi đặc biệt: Giảm giá toàn bộ menu!';

      var result = setStorePromo(percent, active, duration, msg);
      if (!result.ok) return _jsonResponse({ ok: false, error: result.error || 'set_promo_failed' });

      var promo = _getPromoInfoInternal();
      return _jsonResponse({ ok: true, promo: promo });
    }

    // ── Web app forms (Phase B/C/D operational tools) ──
    if (action === 'waste_form') return webAppWasteForm();
    if (action === 'waste_submit') return webAppWasteSubmit(e);
    if (action === 'review_form') return webAppReviewForm();
    if (action === 'review_submit') return webAppReviewSubmit(e);

    // ── Phase D analytics endpoints ──
    // Optional token guard: nếu CONFIG.REPORT_API_TOKEN có set, các endpoint phơi PII/sales
    // sẽ require ?token=<value>. Nếu không set → mở (backward compat).
    if (action === 'rfm_snapshot' || action === 'rfm_refresh' || action === 'winback_candidates') {
      // 3 aliases cùng trả rfmSnapshot() (đã refresh + winback + champions)
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      return _jsonResponse(rfmSnapshot());
    }
    if (action === 'menu_engineering_data') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var meMonth = e.parameter.month; // YYYY-MM; default = tháng trước
      return _jsonResponse(getMenuEngineeringData(meMonth));
    }
    if (action === 'waste_report') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var fromW = e.parameter.from, toW = e.parameter.to;
      if (!fromW || !toW) return _jsonResponse({ ok: false, error: 'from + to required' });
      return _jsonResponse(wasteReport(fromW, toW));
    }
    if (action === 'cash_report') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      var fromC = e.parameter.from, toC = e.parameter.to;
      if (!fromC || !toC) return _jsonResponse({ ok: false, error: 'from + to required' });
      return _jsonResponse(cashVarianceReport(fromC, toC));
    }
    if (action === 'maintenance_status') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      return _jsonResponse({ ok: true, tasks: getAllMaintenanceTasks() });
    }
    if (action === 'pending_reviews') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      return _jsonResponse({ ok: true, reviews: getPendingResponses() });
    }

    // ── Device approval (GET) ──
    if (action === 'device_check') {
      // Open — trang nội bộ poll trạng thái thiết bị của chính nó.
      return _jsonResponse(deviceCheck(e.parameter.device_id));
    }
    if (action === 'device_list') {
      // Dashboard tab "Thiết bị" (session) HOẶC Mac Mini (report token). KHÔNG device-gate → bootstrap.
      if (!validateSessionToken(e.parameter.token) && !_requireTokenIfSet(e)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      return _jsonResponse(deviceList());
    }
    if (action === 'device_approve' || action === 'device_revoke') {
      // Mac Mini curl bằng REPORT_API_TOKEN (bootstrap thiết bị đầu tiên không cần đăng nhập web).
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      if (action === 'device_approve') return _jsonResponse(deviceApprove(e.parameter.device_id, 'mac-mini', e.parameter.label));
      return _jsonResponse(deviceRevoke(e.parameter.device_id));
    }

    // ── Ops Dashboard (web/dashboard.html) — admin session token + thiết bị đã duyệt ──
    if (action === 'dashboard_summary') {
      if (!validateSessionToken(e.parameter.token)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      if (!isDeviceApproved(e.parameter.device_id)) return _jsonResponse({ ok: false, error: 'device_not_approved' });
      return _jsonResponse(getDashboardSummary());
    }
    if (action === 'agent_insights') {
      if (!validateSessionToken(e.parameter.token)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      if (!isDeviceApproved(e.parameter.device_id)) return _jsonResponse({ ok: false, error: 'device_not_approved' });
      var insLimit = parseInt(e.parameter.limit, 10) || 20;
      return _jsonResponse({ ok: true, insights: getAgentInsights(insLimit) });
    }
    if (action === 'admin_data') {
      if (!validateSessionToken(e.parameter.token)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      if (!isDeviceApproved(e.parameter.device_id)) return _jsonResponse({ ok: false, error: 'device_not_approved' });
      return _jsonResponse(getAdminData());
    }
    if (action === 'command_queue') {
      if (!validateSessionToken(e.parameter.token)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      if (!isDeviceApproved(e.parameter.device_id)) return _jsonResponse({ ok: false, error: 'device_not_approved' });
      var cqStatus = e.parameter.status || null;
      var cqLimit = parseInt(e.parameter.limit, 10) || 30;
      return _jsonResponse({ ok: true, commands: getCommandQueue(cqStatus, cqLimit) });
    }
    if (action === 'dispatcher_status') {
      if (!validateSessionToken(e.parameter.token)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      return _jsonResponse(getDispatcherStatus());
    }
    // Dispatcher GET endpoints (curl-friendly; gate bằng REPORT_API_TOKEN nếu set)
    if (action === 'dispatch_pull') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      return _jsonResponse(dispatchPull());
    }
    if (action === 'dispatch_done') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      return _jsonResponse(updateCommand({
        command_id: e.parameter.id,
        status: e.parameter.status || 'done',
        result: e.parameter.result || '',
      }));
    }

    return _jsonResponse({
      ok: true,
      service: 'Lâm Hà Kissaten Order API',
      version: '1.2',
      endpoints: {
        'POST /': 'Submit order (JSON body — see CLAUDE.md §2)',
        'GET /?action=menu': 'Return active menu items as JSON',
        'GET /?action=promo_info': 'Get active store promo status',
        'GET /?action=set_promo&active=true&duration=60&message=...': 'Turn on/off store promo (add &percent=5 or 10)',
        'GET /?action=orders': 'Today orders for KDS',
        'GET /?action=mark_paid&order_id=ORD-...': 'Mark paid + print receipt',
        'GET /?action=pending_print': 'Pending receipt print jobs (Mac Mini poller)',
        'GET /?action=mark_printed&order_id=ORD-...': 'Mark receipt as printed',
        'GET /?action=pending_labels': 'Pending label print jobs (Mac Mini poller)',
        'GET /?action=mark_labels_printed&order_id=ORD-...': 'Mark labels as printed',
        'GET /?action=waste_form': 'Mobile form to log waste (Phase C)',
        'GET /?action=review_form': 'Mobile form to log review (Phase B)',
        'GET /?action=mmm_data&from=YYYY-MM-DD&to=YYYY-MM-DD': 'Aggregated weekly marketing and revenue data for MMM (Phase 4)',
      },
    });
  } catch (err) {
    logError('doGet', err);
    return _jsonResponse({ ok: false, error: String(err) });
  } finally {
    if (lock) {
      lock.releaseLock();
    }
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
  var data = getLastRows(sheet, 300); // Tối ưu hóa: chỉ quét 300 dòng cuối thay vì toàn bộ sheet
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
  var data = getLastRows(sheet, 300); // Tối ưu hóa: chỉ quét 300 dòng cuối thay vì toàn bộ sheet
  var cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var status    = row[12];  // col M = status
    var printedAt = row[22];  // col W = printed_at
    var ts        = row[2];   // col C = timestamp
    var paymentStatus = row[19]; // col T = payment_status
    if (status !== 'DELIVERED' && paymentStatus !== 'PAID') continue;
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

/**
 * Token guard cho các endpoint phơi PII/sales data + mutation.
 * FAIL-CLOSED: nếu CONFIG.REPORT_API_TOKEN khớp `?token=` → cho qua, ngược lại từ chối.
 *
 * MIGRATION: nếu chưa kịp cấu hình token, set tạm CONFIG.ALLOW_OPEN_API='true' để giữ
 * hành vi mở cũ trong lúc cập nhật client. SAU KHI set token + cập nhật KDS/poller →
 * XOÁ ALLOW_OPEN_API để khoá lại. KHÔNG để ALLOW_OPEN_API='true' khi chạy thật.
 */
function _requireTokenIfSet(e) {
  var expected = getConfig('REPORT_API_TOKEN');
  if (!expected) {
    // Chưa cấu hình token: chỉ mở nếu cố ý bật cờ migration tạm thời.
    return getConfig('ALLOW_OPEN_API') === 'true';
  }
  var provided = (e && e.parameter && e.parameter.token) || '';
  return String(provided).trim() === String(expected).trim();
}

function _getPromoInfoInternal() {
  var activeStr = getConfig('PROMO_5PERCENT_ACTIVE') || 'false';
  var startVal  = getConfig('PROMO_5PERCENT_START') || '';
  var endVal    = getConfig('PROMO_5PERCENT_END') || '';
  var message   = getConfig('PROMO_5PERCENT_MSG') || 'Ưu đãi đặc biệt: Giảm giá toàn bộ menu!';
  
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
    percent: parseInt(getConfig('PROMO_PERCENT') || '5', 10),
    start: start && !isNaN(start.getTime()) ? start.toISOString() : String(startVal),
    end: end && !isNaN(end.getTime()) ? end.toISOString() : String(endVal),
    message: String(message)
  };
}

/**
 * Shared store-wide promo writer used by both the doGet (KDS/report-token)
 * and doPost (Dashboard/session) entry points.
 * @param {number|string} percent  5 or 10 (the discount tier when active)
 * @param {boolean} active         turn promo on/off
 * @param {string} duration        minutes as string, or 'end_of_day'
 * @param {string} msg             banner message
 * @return {{ok:boolean, percent?:number, active?:boolean, end?:string, error?:string}}
 */
function setStorePromo(percent, active, duration, msg) {
  try {
    if (active) {
      var pct = parseInt(percent, 10);
      if (pct !== 5 && pct !== 10) {
        return { ok: false, error: 'invalid_percent' };
      }
      var start = new Date();
      var end;
      if (duration === 'end_of_day') {
        end = new Date();
        end.setHours(23, 59, 59, 999);
      } else {
        var mins = parseInt(duration, 10) || 60;
        end = new Date(start.getTime() + mins * 60 * 1000);
      }
      setConfig('PROMO_PERCENT', String(pct));
      setConfig('PROMO_5PERCENT_ACTIVE', 'true');
      setConfig('PROMO_5PERCENT_START', start.toISOString());
      setConfig('PROMO_5PERCENT_END', end.toISOString());
      setConfig('PROMO_5PERCENT_MSG', msg || 'Ưu đãi đặc biệt: Giảm giá toàn bộ menu!');
      return { ok: true, percent: pct, active: true, end: end.toISOString() };
    } else {
      // Tắt: giữ PROMO_PERCENT để nhớ tier gần nhất.
      setConfig('PROMO_5PERCENT_ACTIVE', 'false');
      setConfig('PROMO_5PERCENT_START', '');
      setConfig('PROMO_5PERCENT_END', '');
      return { ok: true, active: false };
    }
  } catch (err) {
    logError('setStorePromo', err);
    return { ok: false, error: String(err) };
  }
}
