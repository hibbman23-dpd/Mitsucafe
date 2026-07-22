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

var AUTH = {
  PUBLIC: 'public',
  REPORT: 'report',
  STAFF: 'staff',
  ADMIN: 'admin',
  BANK: 'bank',
  HEALER: 'healer',
  NONE: 'none'
};

function _authorize(authClass, e, payload) {
  if (authClass === AUTH.PUBLIC || authClass === AUTH.NONE) {
    return true;
  }
  if (authClass === AUTH.BANK) {
    var secret = (payload && payload.secret) || (e && e.parameter && e.parameter.secret) || '';
    var _bws = getConfig('BANK_WEBHOOK_SECRET');
    // Bắt buộc phải cấu hình BANK_WEBHOOK_SECRET. Nếu chưa set -> Từ chối (fail-closed).
    if (!_bws) return false;
    return String(secret) === String(_bws);
  }
  if (authClass === AUTH.STAFF) {
    return _requireStaffToken(e || { parameter: { token: payload && payload.token } });
  }
  if (authClass === AUTH.REPORT) {
    // Token có thể ở query (GET: e.parameter.token) HOẶC body JSON (POST: payload.token).
    // Bug cũ: e truthy cho POST → chỉ đọc query → POST-body token bị bỏ → unauthorized.
    var _rt = (e && e.parameter && e.parameter.token) || (payload && payload.token) || '';
    return _requireTokenIfSet({ parameter: { token: _rt } });
  }
  if (authClass === AUTH.ADMIN) {
    var token = (payload && payload.token) || (e && e.parameter && e.parameter.token) || '';
    return validateSessionToken(token);
  }
  if (authClass === AUTH.HEALER) {
    var hToken = (payload && payload.token) || (e && e.parameter && e.parameter.token) || '';
    var expected = getConfig('HEALER_QUEUE_TOKEN');
    // Fail-closed: khác AUTH.BANK, không có back-compat mở — chưa set CONFIG thì
    // _healer không gọi được gì cả (đúng ý: token này sinh ra chỉ để giới hạn _healer).
    if (!expected) return false;
    return String(hToken) === String(expected);
  }
  return false;
}

var GET_ROUTES = {
  'ping': {
    auth: AUTH.PUBLIC,
    handler: function(e) {
      return { ok: true, message: 'pong' };
    }
  },
  'menu': {
    auth: AUTH.PUBLIC,
    handler: function(e) {
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
          customizations: item.customizations_json ? _safeJsonParse(item.customizations_json) : {},
          allergens: item.allergens ? _safeJsonParse(item.allergens) : [],
          image_url: item.image_url || '',
          sort_order: item.sort_order || 999,
          story_telling: item.story_telling || '',
        };
      });
      var promo = _getPromoInfoInternal();
      return { ok: true, count: menu.length, items: menu, promo: promo };
    }
  },
  'promo_info': {
    auth: AUTH.PUBLIC,
    handler: function(e) {
      return { ok: true, promo: _getPromoInfoInternal() };
    }
  },
  'signage_config': {
    auth: AUTH.PUBLIC,
    handler: function(e) {
      return getSignageConfig();
    }
  },
  'customer_info': {
    auth: AUTH.PUBLIC,
    handler: function(e) {
      var phone = e.parameter.phone;
      if (!phone) return { ok: false, error: 'phone required' };
      var info = getCustomerInfo(phone);
      return { ok: true, customer: toPublicLoyaltyView(info) };
    }
  },
  'order_status': {
    auth: AUTH.PUBLIC,
    handler: function(e) {
      var orderId = e.parameter.order_id;
      if (!orderId) return { ok: false, error: 'order_id required' };
      var row = _findOrderRow(orderId);
      if (!row) return { ok: false, error: 'not found' };
      var order = _rowToOrder(row.data);
      return { 
        ok: true, 
        order_id: orderId, 
        status: order.status, 
        delivery_type: order.delivery_type,
        short_code: order.short_code,
        total: order.total,
        payment_method: order.payment_method,
        payment_status: order.payment_status
      };
    }
  },
  'active_orders': {
    auth: AUTH.PUBLIC,
    handler: function(e) {
      var allOrders = getTodayOrders();
      var nowTime = new Date().getTime();
      var filtered = allOrders.filter(function(o) {
        if (['NEW', 'CONFIRMED', 'MAKING', 'READY'].indexOf(o.status) !== -1) {
          return true;
        }
        if (o.status === 'DELIVERED' && o.delivered_at) {
          try {
            var delTime = new Date(o.delivered_at).getTime();
            if (nowTime - delTime <= 45000) {
              return true;
            }
          } catch(err) {}
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
      return { ok: true, orders: filtered };
    }
  },
  'orders': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return { ok: true, orders: getTodayOrders() };
    }
  },
  'update_status': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var orderId = e.parameter.order_id;
      var newStatus = e.parameter.status;
      if (!orderId || !newStatus) return { ok: false, error: 'missing params' };
      updateOrderStatus(orderId, newStatus);
      return { ok: true, order_id: orderId, status: newStatus };
    }
  },
  'mark_paid': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var orderId = e.parameter.order_id;
      if (!orderId) return { ok: false, error: 'order_id required' };
      var paymentResult = markOrderPaid(orderId);
      return { ok: true, order_id: orderId, payment_status: paymentResult.payment_status, already_paid: paymentResult.already_paid };
    }
  },
  'pending_print': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return { ok: true, orders: _getPendingPrintOrders() };
    }
  },
  'mark_printed': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var orderId = e.parameter.order_id;
      if (!orderId) return { ok: false, error: 'order_id required' };
      updateField(orderId, 'printed_at', new Date().toISOString());
      return { ok: true, order_id: orderId };
    }
  },
  'pending_labels': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return { ok: true, orders: _getPendingLabelOrders() };
    }
  },
  'mark_labels_printed': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var orderId = e.parameter.order_id;
      if (!orderId) return { ok: false, error: 'order_id required' };
      updateField(orderId, 'label_printed_at', new Date().toISOString());
      return { ok: true, order_id: orderId };
    }
  },
  'get_camera_events': {
    auth: AUTH.ADMIN,
    handler: function(e) {
      var limit = e.parameter.limit;
      return getCameraEvents(e.parameter.token, limit);
    }
  },
  'setup_financials': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var res = setupExpenseForm();
      createFinancialDashboard();
      return { ok: true, message: 'Financial system initialized.', form_url: res.formUrl, edit_url: res.editUrl };
    }
  },
  'compute_cogs': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var date = e.parameter.date || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      return { ok: true, metrics: computeDailyMetrics(date) };
    }
  },
  'roi_data': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var roiTo = e.parameter.to || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      var roiFrom = e.parameter.from || Utilities.formatDate(new Date(Date.now() - 28 * 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      return { ok: true, data: getRoiData(roiFrom, roiTo) };
    }
  },
  'mmm_data': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var mmmTo = e.parameter.to || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      var mmmFrom = e.parameter.from || Utilities.formatDate(new Date(Date.now() - 365 * 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      return { ok: true, data: getMmmData(mmmFrom, mmmTo) };
    }
  },
  'inventory_snapshot': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return { ok: true, inventory: _adminReadSheet('INVENTORY') };
    }
  },
  'link_social_id': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return linkCustomerSocialId(e.parameter.phone, {
        fb_psid: e.parameter.fb_psid || null,
        ig_igsid: e.parameter.ig_igsid || null,
        zalo_id: e.parameter.zalo_id || null
      });
    }
  },
  'get_decisions_due': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return { ok: true, decisions: getDecisionsDue() };
    }
  },
  'record_decision_result': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var okRec = recordDecisionResult(
        e.parameter.decision_id, e.parameter.actual_result, e.parameter.hit_or_miss);
      return { ok: okRec };
    }
  },
  'meta_pull': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var mTo = e.parameter.to || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      var mFrom = e.parameter.from || Utilities.formatDate(new Date(Date.now() - 7 * 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      return pullMetaAll(mFrom, mTo);
    }
  },
  'meta_health': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return checkMetaTokenHealth();
    }
  },
  'gbp_pull': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var gbTo = e.parameter.to || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      var gbFrom = e.parameter.from || Utilities.formatDate(new Date(Date.now() - 7 * 86400000), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      return { ok: true, days: pullGbpDaily(gbFrom, gbTo) };
    }
  },
  'zalo_pull': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return { ok: pullZaloDailyFollowers() };
    }
  },
  'tiktok_pull': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return { ok: true, videos: pullTiktokViaFirecrawl() };
    }
  },
  'daily_rollup': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var drDate = e.parameter.date || '';
      var rollup = (e.parameter.record === 'true') ? recordDailyRollup(drDate) : getDailyRollup(drDate);
      return { ok: true, rollup: rollup };
    }
  },
  'menu_snapshot': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return snapshotMenuFromMaster();
    }
  },
  'rollup_backfill': {
    auth: AUTH.REPORT,
    handler: function(e) {
      if (!e.parameter.from || !e.parameter.to) return { ok: false, error: 'from + to required' };
      return { ok: true, days: recordRollupRange(e.parameter.from, e.parameter.to) };
    }
  },
  'traffic_ingest': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return recordTraffic(e.parameter.date || '', e.parameter.walk_ins, e.parameter.source || 'camera');
    }
  },
  'send_daily_report': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var date = e.parameter.date || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
      sendDailyEmailReport(date);
      return { ok: true, message: 'Report sent for date: ' + date };
    }
  },
  'set_promo': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var active = e.parameter.active === 'true';
      var duration = e.parameter.duration || '60';
      var percent = e.parameter.percent || '5';
      var msg = e.parameter.message || 'Ưu đãi đặc biệt: Giảm giá toàn bộ menu!';
      var result = setStorePromo(percent, active, duration, msg);
      if (!result.ok) return { ok: false, error: result.error || 'set_promo_failed' };
      return { ok: true, promo: _getPromoInfoInternal() };
    }
  },
  'rfm_snapshot': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return rfmSnapshot();
    }
  },
  'rfm_refresh': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return rfmSnapshot();
    }
  },
  'winback_candidates': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return rfmSnapshot();
    }
  },
  'menu_engineering_data': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var meMonth = e.parameter.month;
      return getMenuEngineeringData(meMonth);
    }
  },
  'waste_report': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var fromW = e.parameter.from, toW = e.parameter.to;
      if (!fromW || !toW) return { ok: false, error: 'from + to required' };
      return wasteReport(fromW, toW);
    }
  },
  'cash_report': {
    auth: AUTH.REPORT,
    handler: function(e) {
      var fromC = e.parameter.from, toC = e.parameter.to;
      if (!fromC || !toC) return { ok: false, error: 'from + to required' };
      return cashVarianceReport(fromC, toC);
    }
  },
  'maintenance_status': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return { ok: true, tasks: getAllMaintenanceTasks() };
    }
  },
  'pending_reviews': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return { ok: true, reviews: getPendingResponses() };
    }
  },
  'dashboard_summary': {
    auth: AUTH.ADMIN,
    handler: function(e) {
      return getDashboardSummary();
    }
  },
  'agent_insights': {
    auth: AUTH.ADMIN,
    handler: function(e) {
      var insLimit = parseInt(e.parameter.limit, 10) || 20;
      return { ok: true, insights: getAgentInsights(insLimit) };
    }
  },
  'admin_data': {
    auth: AUTH.ADMIN,
    handler: function(e) {
      return getAdminData();
    }
  },
  'command_queue': {
    auth: AUTH.ADMIN,
    handler: function(e) {
      var cqStatus = e.parameter.status || null;
      var cqLimit = parseInt(e.parameter.limit, 10) || 30;
      return { ok: true, commands: getCommandQueue(cqStatus, cqLimit) };
    }
  },
  'dispatcher_status': {
    auth: AUTH.ADMIN,
    handler: function(e) {
      return getDispatcherStatus();
    }
  },
  'dispatch_pull': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return dispatchPull();
    }
  },
  'dispatch_done': {
    auth: AUTH.REPORT,
    handler: function(e) {
      return updateCommand({
        command_id: e.parameter.id,
        status: e.parameter.status || 'done',
        result: e.parameter.result || '',
      });
    }
  },
  'waste_form': {
    auth: AUTH.STAFF,
    handler: function(e) {
      return webAppWasteForm();
    },
    renderHtml: true
  },
  'waste_submit': {
    auth: AUTH.STAFF,
    handler: function(e) {
      return webAppWasteSubmit(e);
    }
  },
  'review_form': {
    auth: AUTH.STAFF,
    handler: function(e) {
      return webAppReviewForm();
    },
    renderHtml: true
  },
  'review_submit': {
    auth: AUTH.STAFF,
    handler: function(e) {
      return webAppReviewSubmit(e);
    }
  },
  'healer_pull': {
    auth: AUTH.HEALER,
    handler: function(e) {
      return healerPullPending();
    }
  }
};

var POST_ROUTES = {
  'admin_login': {
    auth: AUTH.PUBLIC,
    handler: function(p) {
      return adminLogin(p.username, p.password);
    }
  },
  'update_admin_password': {
    auth: AUTH.PUBLIC,
    handler: function(p) {
      return updateAdminPassword(p.token, p.old_password, p.new_password);
    }
  },
  'log_camera_event': {
    auth: AUTH.PUBLIC,
    handler: function(p) {
      return saveCameraEvent(p.secret, p.event_data || {});
    }
  },
  'log_agent_insight': {
    auth: AUTH.ADMIN,
    handler: function(p) {
      return { ok: true, insight_id: logAgentInsight(p) };
    }
  },
  'menu_update': { auth: AUTH.ADMIN, handler: function(p) { return adminMenuUpdate(p); } },
  'menu_add': { auth: AUTH.ADMIN, handler: function(p) { return adminMenuAdd(p); } },
  'inventory_update': { auth: AUTH.ADMIN, handler: function(p) { return adminInventoryUpdate(p); } },
  'inventory_add': { auth: AUTH.ADMIN, handler: function(p) { return adminInventoryAdd(p); } },
  'staff_update': { auth: AUTH.ADMIN, handler: function(p) { return adminStaffUpdate(p); } },
  'staff_add': { auth: AUTH.ADMIN, handler: function(p) { return adminStaffAdd(p); } },
  'promo_toggle': { auth: AUTH.ADMIN, handler: function(p) { return adminPromoToggle(p); } },
  'config_set': { auth: AUTH.ADMIN, handler: function(p) { return adminConfigSet(p); } },
  'queue_command': { auth: AUTH.ADMIN, handler: function(p) { return queueCommand(p); } },
  'command_update': { auth: AUTH.ADMIN, handler: function(p) { return updateCommand(p); } },
  'dispatcher_heartbeat': {
    auth: AUTH.ADMIN,
    handler: function(p) {
      return recordDispatcherHeartbeat();
    }
  },
  'set_signage': { auth: AUTH.ADMIN, handler: function(p) { return setSignageConfig(p); } },
  'set_promo': {
    auth: AUTH.ADMIN,
    handler: function(p) {
      var result = setStorePromo(p.percent, p.active === true || p.active === 'true', p.duration || '60', p.message);
      if (!result.ok) return { ok: false, error: result.error || 'set_promo_failed' };
      return { ok: true, promo: _getPromoInfoInternal() };
    }
  },
  'log_content': {
    auth: AUTH.ADMIN,
    handler: function(p) {
      return { ok: true, activity_id: logMarketingActivity(p.data || {}) };
    }
  },
  'log_decision': {
    auth: AUTH.ADMIN,
    handler: function(p) {
      return { ok: true, decision_id: logDecision(p.data || {}) };
    }
  },
  'link_social_id': {
    auth: AUTH.REPORT,
    handler: function(p) {
      return linkCustomerSocialId(p.phone, {
        fb_psid: p.fb_psid || null,
        ig_igsid: p.ig_igsid || null,
        zalo_id: p.zalo_id || null
      });
    }
  },
  'tiktok_ingest': {
    auth: AUTH.REPORT,
    handler: function(p) {
      var ttVids = p.videos || [];
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
      return { ok: true, ingested: ttN };
    }
  },
  'bank_notification': {
    auth: AUTH.BANK,
    handler: function(p) {
      return handleBankNotification(p);
    }
  },
  'healer_update': {
    auth: AUTH.HEALER,
    handler: function(p) {
      return healerUpdateFix(p.fix_id, p.patch || {});
    }
  },
  'reserve_codes': {
    auth: AUTH.REPORT,
    handler: function(p) {
      var lock = LockService.getScriptLock();
      lock.waitLock(15000);
      try {
        var blk = reserveShortCodes(p.type || 'dine_in', p.n || 20);
        return { ok: true, letter: blk.letter, date: blk.date, from: blk.from, to: blk.to };
      } finally { lock.releaseLock(); }
    }
  },
  'ingest_order': {
    auth: AUTH.REPORT,
    handler: function(p) {
      var lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try { return ingestPreMintedOrder(p); }
      finally { lock.releaseLock(); }
    }
  },
  // POST mirror của update_status/mark_paid (GET vẫn giữ cho tương thích cũ).
  // Gateway gọi qua POST; thiếu 2 route này thì op offline kẹt outbox vĩnh viễn (mất PAID).
  'update_status': {
    auth: AUTH.REPORT,
    handler: function(p) {
      if (!p.order_id || !p.status) return { ok: false, error: 'missing params' };
      var lock = LockService.getScriptLock();
      lock.waitLock(15000);
      try {
        updateOrderStatus(p.order_id, p.status);
        return { ok: true, order_id: p.order_id, status: p.status };
      } finally { lock.releaseLock(); }
    }
  },
  'mark_paid': {
    auth: AUTH.REPORT,
    handler: function(p) {
      if (!p.order_id) return { ok: false, error: 'order_id required' };
      var lock = LockService.getScriptLock();
      lock.waitLock(15000);
      try {
        // receipt_printed_local=true: gateway đã in receipt local (offline) → GAS bỏ in lần 2.
        var r = markOrderPaid(p.order_id, { skipReceipt: !!p.receipt_printed_local });
        return { ok: true, order_id: p.order_id, payment_status: r.payment_status, already_paid: r.already_paid };
      } finally { lock.releaseLock(); }
    }
  }
};

function doPost(e) {
  // 1. Lock-bypass early check for web_hit tracking (tối ưu hóa tốc độ ghi log)
  try {
    var earlyRaw = e.postData && e.postData.contents;
    if (earlyRaw) {
      var earlyPayload = JSON.parse(earlyRaw);
      if (earlyPayload && earlyPayload.action === 'web_hit') {
        if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
        return _jsonResponse(logWebHit(earlyPayload));
      }
      // Telegram gửi callback_query (nút DUYỆT/BỎ), không có field `action` theo
      // dạng POST_ROUTES thường — route riêng, verify secret+chat_id bên trong.
      if (earlyPayload && earlyPayload.callback_query) {
        var secretHeader = (e.parameter && e.parameter.__secret_token_test) ||
          (e.headers && e.headers['X-Telegram-Bot-Api-Secret-Token']) || '';
        return _jsonResponse(handleFixApprovalCallback({
          secretToken: secretHeader,
          callback_query: earlyPayload.callback_query
        }));
      }
    }
  } catch (earlyErr) {
    // Rơi xuống luồng xử lý chính dưới lock
  }

  var lock = LockService.getScriptLock();
  try {
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
    var action = payload.action;

    if (action) {
      var route = POST_ROUTES[action];
      if (!route) {
        return _jsonResponse({ ok: false, error: 'unknown_action: ' + action });
      }
      if (!_authorize(route.auth, e, payload)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      var res = route.handler(payload);
      return _jsonResponse(res);
    }

    // Default POST fallback: Đặt hàng (submit order)
    var _idemKey = (payload.metadata && payload.metadata.idempotency_key) || payload.idempotency_key || '';
    if (_idemKey) {
      var _existing = findOrderIdByIdempotencyKey(_idemKey);
      if (_existing) {
        return _jsonResponse({ ok: true, order_id: _existing, deduped: true });
      }
    }

    var order = validateOrderPayload(payload);
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

function _doGetInternal(e) {
  var action = e && e.parameter && e.parameter.action;

  if (action === 'web_hit') {
    if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
    return _jsonResponse(logWebHit(e.parameter));
  }

  var writeActions = [
    'mark_paid', 'mark_printed', 'mark_labels_printed', 'set_promo',
    'setup_financials', 'compute_cogs', 'waste_submit', 'review_submit',
    'rfm_snapshot', 'rfm_refresh', 'winback_candidates', 'dispatch_done',
    'record_decision_result', 'meta_pull', 'gbp_pull', 'zalo_pull',
    'tiktok_pull', 'link_social_id', 'daily_rollup', 'menu_snapshot',
    'rollup_backfill', 'traffic_ingest'
  ];

  var lock = null;
  if (writeActions.indexOf(action) !== -1) {
    lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
    } catch (lockErr) {
      logError('doGet.lock', lockErr);
      return _jsonResponse({ ok: false, error: 'System busy, please try again.' });
    }
  }

  try {
    if (action) {
      var route = GET_ROUTES[action];
      if (!route) {
        return _jsonResponse({ ok: false, error: 'unknown_action: ' + action });
      }
      if (!_authorize(route.auth, e, null)) {
        if (route.renderHtml) {
          return HtmlService.createHtmlOutput('<h1>401 Unauthorized</h1><p>Mã token không hợp lệ.</p>');
        }
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }

      var res = route.handler(e);
      if (route.renderHtml) {
        res.setTitle(action === 'waste_form' ? 'Log waste — Mitsu Café' : 'Log review — Mitsu Café');
        return res;
      }
      return _jsonResponse(res);
    }

    // Default GET fallback: trả danh sách hướng dẫn API
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
/**
 * Lọc thông tin tích điểm công khai của khách hàng.
 * CHỈ trả về số lượng điểm tích lũy và số ly nước miễn phí khả dụng.
 * Tuyệt đối không trả về thông tin cá nhân (tên, sđt, zalo_id, ghi chú).
 */
function toPublicLoyaltyView(info) {
  if (!info) return null;
  return {
    stamp_count: info.stamp_count || 0,
    stamp_total_ever: info.stamp_total_ever || 0,
    free_drinks_earned: info.free_drinks_earned || 0,
    free_drinks_used: info.free_drinks_used || 0
  };
}

function _requireTokenIfSet(e) {
  var expected = getConfig('REPORT_API_TOKEN');
  if (!expected) {
    // Chưa cấu hình token: chỉ mở nếu cố ý bật cờ migration tạm thời.
    return getConfig('ALLOW_OPEN_API') === 'true';
  }
  var provided = (e && e.parameter && e.parameter.token) || '';
  return String(provided).trim() === String(expected).trim();
}

/**
 * Token guard dành riêng cho nhân viên truy cập form (Waste/Review).
 * Cho phép STAFF_FORM_TOKEN hoặc REPORT_API_TOKEN.
 */
function _requireStaffToken(e) {
  var provided = (e && e.parameter && e.parameter.token) || '';
  var staffToken = getConfig('STAFF_FORM_TOKEN');
  var masterToken = getConfig('REPORT_API_TOKEN');

  if (staffToken && String(provided).trim() === String(staffToken).trim()) {
    return true;
  }
  if (masterToken && String(provided).trim() === String(masterToken).trim()) {
    return true;
  }
  if (!staffToken && !masterToken) {
    return getConfig('ALLOW_OPEN_API') === 'true';
  }
  return false;
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

/**
  * Wrapper cho doGet để tự động thử lại (retry) khi gặp lỗi dịch vụ bảng tính tạm thời (transient Google Sheets service error).
  * Giúp tránh gãy hệ thống KDS/Web Order khi Google API gặp sự cố gián đoạn dưới 1 giây.
  */
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  try {
    return _executeWithRetry(function () {
      return _doGetInternal(e);
    }, 3, 1000);
  } catch (err) {
    logError('doGet', err);
    if (action && GET_ROUTES[action] && GET_ROUTES[action].renderHtml) {
      return HtmlService.createHtmlOutput('<h1>500 Internal Error</h1><p>' + err.message + '</p>');
    }
    return _jsonResponse({ ok: false, error: String(err) });
  }
}

/**
  * Thực thi một hàm với cơ chế thử lại (exponential backoff retry).
  * Chỉ thử lại với các lỗi liên quan đến Google Sheets API / Service.
  */
function _executeWithRetry(fn, maxRetries, delayMs) {
  var lastError;
  for (var attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (err) {
      lastError = err;
      var errMsg = String(err);
      
      // Nhận diện lỗi dịch vụ bảng tính (Vietnamese + English variants)
      var isSpreadsheetError = 
        errMsg.indexOf('Dịch vụ Bảng tính') !== -1 || 
        errMsg.indexOf('Spreadsheet') !== -1 ||
        errMsg.indexOf('Service error') !== -1 ||
        errMsg.indexOf('Action not allowed') !== -1 ||
        errMsg.indexOf('không thể truy cập') !== -1;
      
      if (isSpreadsheetError && attempt < maxRetries) {
        // Log cảnh báo thử lại để theo dõi trong Apps Script logs
        Logger.log('Gặp lỗi Spreadsheet Service. Thử lại lần ' + attempt + '/' + maxRetries + ' sau ' + (delayMs * attempt) + 'ms. Lỗi: ' + errMsg);
        Utilities.sleep(delayMs * attempt);
        continue;
      }
      throw err;
    }
  }
}
