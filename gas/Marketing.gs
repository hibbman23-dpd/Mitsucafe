/**
 * Marketing.gs — MARKETING_LOG tab + ROI data endpoint.
 *
 * Hỗ trợ Agent Đo lường ROI (skill cafe-manager mode `roi-measurement`).
 * MARKETING_LOG là nơi DUY NHẤT lưu chi phí marketing (cost + effort) —
 * không có nó thì ROI chỉ là revenue trần, không trừ được cost.
 *
 * Setup 1 lần:
 *   1. initMarketingLog()        → tạo tab (idempotent, an toàn nếu đã có)
 *   2. seedMarketingLogSamples() → (tuỳ chọn) 3 dòng mẫu để test agent
 *
 * Nhập hằng ngày: logMarketingActivity({...}) hoặc nhập tay / mobile form.
 * Agent đọc: getRoiData('2026-06-01', '2026-06-07') → JSON gộp 3 nguồn.
 */

var MARKETING_LOG_HEADERS = [
  'activity_id', 'date', 'type', 'platform', 'campaign_id', 'title',
  'utm_tag', 'cost_vnd', 'effort_hours', 'reach', 'clicks', 'notes',
  // --- P1 engagement chiều sâu (append, index >= 12) ---
  'impressions', 'views', 'likes', 'comments', 'shares', 'saves',
  'watch_time_sec', 'avg_watch_pct', 'format', 'topic', 'sku_featured', 'data_source',
  // --- P2 Meta auto-pull: khoá đối soát chống trùng (external_post_id) ---
  'external_post_id'
];

function _marketingSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MARKETING_LOG');
}

/**
 * Tạo MARKETING_LOG tab. An toàn: không xoá data nếu đã tồn tại.
 */
function initMarketingLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('MARKETING_LOG');
  if (sheet) {
    Logger.log('MARKETING_LOG tab already exists.');
    return;
  }
  sheet = ss.insertSheet('MARKETING_LOG');
  sheet.appendRow(MARKETING_LOG_HEADERS);
  sheet.getRange(1, 1, 1, MARKETING_LOG_HEADERS.length)
    .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  Logger.log('MARKETING_LOG tab created.');
}

/**
 * Sinh activity_id: MKT-YYYYMMDD-XXX
 */
function generateActivityId() {
  var d = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  var rand = ('000' + Math.floor(Math.random() * 1000)).slice(-3);
  return 'MKT-' + d + '-' + rand;
}

/**
 * Ghi 1 hoạt động marketing.
 * @param {Object} a - { date, type, platform, campaign_id, title, utm_tag,
 *                        cost_vnd, effort_hours, reach, clicks, notes }
 *   type: post | promo | ad | event
 *   platform: fb | ig | tiktok | threads | zalo | gbp | landing | multi
 * @return {string} activity_id
 */
function logMarketingActivity(a) {
  var sheet = _marketingSheet();
  if (!sheet) throw new Error('MARKETING_LOG chưa tồn tại — chạy initMarketingLog() trước.');
  var id = a.activity_id || generateActivityId();
  sheet.appendRow([
    id,
    a.date || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'),
    a.type || 'post',
    a.platform || '',
    a.campaign_id || '',
    a.title || '',
    a.utm_tag || '',
    Number(a.cost_vnd) || 0,
    Number(a.effort_hours) || 0,
    Number(a.reach) || 0,
    Number(a.clicks) || 0,
    a.notes || '',
    Number(a.impressions) || 0,
    Number(a.views) || 0,
    Number(a.likes) || 0,
    Number(a.comments) || 0,
    Number(a.shares) || 0,
    Number(a.saves) || 0,
    Number(a.watch_time_sec) || 0,
    Number(a.avg_watch_pct) || 0,
    a.format || '',
    a.topic || '',
    a.sku_featured || '',
    a.data_source || 'manual',
    a.external_post_id || '',
  ]);
  return id;
}

/**
 * Đọc MARKETING_LOG trong khoảng ngày [from, to] (string 'yyyy-MM-dd', inclusive).
 * @return {Array<Object>}
 */
function getMarketingLog(from, to) {
  var sheet = _marketingSheet();
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var date = _asDateStr(r[1]);
    if (from && date < from) continue;
    if (to && date > to) continue;
    rows.push({
      activity_id: r[0], date: date, type: r[2], platform: r[3],
      campaign_id: r[4], title: r[5], utm_tag: r[6],
      cost_vnd: Number(r[7]) || 0, effort_hours: Number(r[8]) || 0,
      reach: Number(r[9]) || 0, clicks: Number(r[10]) || 0, notes: r[11],
      impressions: Number(r[12]) || 0, views: Number(r[13]) || 0,
      likes: Number(r[14]) || 0, comments: Number(r[15]) || 0,
      shares: Number(r[16]) || 0, saves: Number(r[17]) || 0,
      watch_time_sec: Number(r[18]) || 0, avg_watch_pct: Number(r[19]) || 0,
      format: r[20] || '', topic: r[21] || '', sku_featured: r[22] || '',
      data_source: r[23] || '',
      external_post_id: r[24] || '',
    });
  }
  return rows;
}

/**
 * ENDPOINT cho Agent ROI: gộp ORDERS + PROMOTIONS + MARKETING_LOG trong khoảng ngày.
 * Trả JSON gọn để skill tính baseline / incremental / ROI ở phía Claude.
 *
 * Gọi từ doGet?action=roi_data&from=YYYY-MM-DD&to=YYYY-MM-DD (xem Code.gs routing)
 * hoặc trực tiếp trong Apps Script editor để test.
 *
 * @return {Object} { range, orders[], promotions[], marketing[], web_traffic[], gbp_daily[], menu_costs{} }
 */
function getRoiData(from, to) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- ORDERS (chỉ field cần cho ROI) ---
  var oSheet = ss.getSheetByName('ORDERS');
  var orders = [];
  if (oSheet && oSheet.getLastRow() >= 2) {
    var od = oSheet.getDataRange().getValues();
    for (var i = 1; i < od.length; i++) {
      var row = od[i];
      var date = _asDateStr(row[2]);
      if (from && date < from) continue;
      if (to && date > to) continue;
      if (row[12] === 'CANCELLED') continue;
      var items = [];
      try { items = row[9] ? JSON.parse(row[9]) : []; } catch (e) { items = []; }
      orders.push({
        order_id: row[0],
        customer_id: normalizeCustomerId(row[8]),   // xem chú thích ở _rowToOrder (Orders.gs)
        timestamp: row[2],
        date: date,
        utm_source: row[4],
        utm_campaign: row[27] || '',
        total: Number(row[11]) || 0,
        status: row[12],
        items: items.map(function (it) {
          return {
            sku: it.sku, qty: it.qty, price: it.price,
            on_promo: !!it.on_promo, promo_price: it.promo_price || null,
          };
        }),
      });
    }
  }

  // --- PROMOTIONS ---
  var pSheet = ss.getSheetByName('PROMOTIONS');
  var promos = [];
  if (pSheet && pSheet.getLastRow() >= 2) {
    var pd = pSheet.getDataRange().getValues();
    for (var j = 1; j < pd.length; j++) {
      var p = pd[j];
      promos.push({
        campaign_id: p[0], name: p[1], type: p[2],
        discount_value: p[3], discount_type: p[4],
        start_date: _asDateStr(p[6]), end_date: _asDateStr(p[7]),
        start_time: p[8], end_time: p[9],
        target_skus: p[11], is_active: p[16],
      });
    }
  }

  // --- MENU costs (cho gross margin) ---
  var mSheet = ss.getSheetByName('MENU');
  var menuCosts = {};
  if (mSheet && mSheet.getLastRow() >= 2) {
    var md = mSheet.getDataRange().getValues();
    var head = md[0];
    var iSku = head.indexOf('sku');
    var iPrice = head.indexOf('price_m');
    var iCogs = head.indexOf('cogs_percent');
    var iCostNl = head.indexOf('cost_nl');
    var iCostPkg = head.indexOf('cost_packaging');
    for (var k = 1; k < md.length; k++) {
      var m = md[k];
      var costNl = iCostNl >= 0 ? (Number(m[iCostNl]) || 0) : 0;
      var costPkg = iCostPkg >= 0 ? (Number(m[iCostPkg]) || 0) : 0;
      menuCosts[m[iSku]] = {
        price: Number(m[iPrice]) || 0,
        // cogs_percent là PHÂN SỐ (vd 0.33 = COGS 33% → margin 67%)
        cogs_percent: iCogs >= 0 ? (Number(m[iCogs]) || null) : null,
        unit_cost: costNl + costPkg, // cost_nl + cost_packaging (đồng bộ getMenuEngineeringData)
      };
    }
  }

  // --- CUSTOMERS social profiles for phone-match ---
  var cSheet = ss.getSheetByName('CUSTOMERS');
  var customersSocial = [];
  if (cSheet && cSheet.getLastRow() >= 2) {
    extendCustomersSchema(); // Đảm bảo cột fb_psid, ig_igsid tồn tại
    var cd = cSheet.getDataRange().getValues();
    var cHead = cd[0];
    var iPhone = cHead.indexOf('phone');
    var iZalo = cHead.indexOf('zalo_id');
    var iFb = cHead.indexOf('fb_psid');
    var iIg = cHead.indexOf('ig_igsid');
    var iId = cHead.indexOf('customer_id');
    for (var k = 1; k < cd.length; k++) {
      var cRow = cd[k];
      var phone = cRow[iPhone] || cRow[iId];
      var fb = iFb >= 0 ? cRow[iFb] : '';
      var ig = iIg >= 0 ? cRow[iIg] : '';
      var zalo = iZalo >= 0 ? cRow[iZalo] : '';
      if (phone && (fb || ig || zalo)) {
        customersSocial.push({
          customer_id: String(phone),
          fb_psid: String(fb),
          ig_igsid: String(ig),
          zalo_id: String(zalo)
        });
      }
    }
  }

  // --- RECENT ERRORS (để subagent kiểm tra tính toàn vẹn dữ liệu) ---
  var errSheet = ss.getSheetByName('ERROR_LOG');
  var recentErrors = [];
  if (errSheet && errSheet.getLastRow() >= 2) {
    var errData = getLastRows(errSheet, 20); // lấy 20 dòng lỗi gần nhất
    var errHead = errData[0];
    var iTime = errHead.indexOf('timestamp');
    var iCtx = errHead.indexOf('context');
    var iErr = errHead.indexOf('error');
    for (var m = 1; m < errData.length; m++) {
      recentErrors.push({
        timestamp: errData[m][iTime],
        context: errData[m][iCtx],
        error: errData[m][iErr]
      });
    }
  }

  return {
    range: { from: from || null, to: to || null },
    orders: orders,
    promotions: promos,
    marketing: getMarketingLog(from, to),
    web_traffic: getWebTraffic(from, to),
    gbp_daily: getGbpDaily(from, to),
    customers_social: customersSocial,
    errors: recentErrors,
    menu_costs: menuCosts,
  };
}

/**
 * Helper: chuẩn hoá date về 'yyyy-MM-dd' (nhận Date object hoặc ISO string).
 */
function _asDateStr(v) {
  if (!v) return '';
  var d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v).slice(0, 10);
  return Utilities.formatDate(d, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
}

/**
 * Seed 3 dòng mẫu để test agent ROI. Chạy 1 lần (tuỳ chọn).
 * Xoá đi sau khi có data thật.
 */
function seedMarketingLogSamples() {
  initMarketingLog();
  var today = new Date();
  function dStr(offsetDays) {
    var d = new Date(today.getTime() - offsetDays * 86400000);
    return Utilities.formatDate(d, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  }
  logMarketingActivity({
    date: dStr(5), type: 'post', platform: 'ig', title: 'Reel matcha latte cận cảnh',
    utm_tag: 'ig-matcha-reel', cost_vnd: 0, effort_hours: 1.5, reach: 2400, clicks: 38,
    notes: 'Organic, không boost',
  });
  logMarketingActivity({
    date: dStr(3), type: 'promo', platform: 'zalo', campaign_id: 'promo-happyhour-tea',
    title: 'Happy Hour trà -15% T6-T7', utm_tag: 'zalo-happyhour',
    cost_vnd: 50000, effort_hours: 0.5, reach: 320, clicks: 27,
    notes: 'Zalo OA broadcast + banner in',
  });
  logMarketingActivity({
    date: dStr(2), type: 'ad', platform: 'fb', title: 'Boost post khai trương',
    utm_tag: 'fb-launch-boost', cost_vnd: 200000, effort_hours: 0.5, reach: 8600, clicks: 142,
    notes: 'Ad spend 200k, 2 ngày',
  });
  Logger.log('Seeded 3 sample MARKETING_LOG rows.');
}

/**
 * P1: thêm các cột engagement mới vào MARKETING_LOG đang tồn tại.
 * Idempotent — chỉ thêm cột header còn thiếu, không đụng data.
 */
function migrateMarketingLogP1() {
  var sheet = _marketingSheet();
  if (!sheet) { initMarketingLog(); sheet = _marketingSheet(); }
  var lastCol = sheet.getLastColumn();
  // Phòng sheet rỗng hoàn toàn: getRange(1,1,1,0) sẽ crash.
  var existing = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var added = 0;
  for (var i = 0; i < MARKETING_LOG_HEADERS.length; i++) {
    if (existing.indexOf(MARKETING_LOG_HEADERS[i]) === -1) {
      sheet.getRange(1, lastCol + 1 + added).setValue(MARKETING_LOG_HEADERS[i])
        .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
      added++;
    }
  }
  Logger.log('migrateMarketingLogP1: added ' + added + ' columns.');
  return added;
}

/** P2: thêm cột external_post_id (dùng chung logic migrate P1 — gọi lại an toàn). */
function migrateMarketingLogP2() { return migrateMarketingLogP1(); }

/**
 * Upsert 1 row MARKETING_LOG theo external_post_id (cho auto-pull Meta).
 * Có row cùng external_post_id → cập nhật cột metric TẠI CHỖ; không → append mới (data_source='auto').
 * KHÔNG đụng row manual (external_post_id rỗng → không khớp).
 * @param {string} externalId
 * @param {Object} a - field như logMarketingActivity (platform, title, date, reach, views, likes,
 *                      comments, shares, saves, watch_time_sec, avg_watch_pct, format, sku_featured...)
 * @return {string} activity_id
 */
function upsertMarketingByExternalId(externalId, a) {
  var sheet = _marketingSheet();
  if (!sheet) { initMarketingLog(); sheet = _marketingSheet(); }
  migrateMarketingLogP1(); // đảm bảo đủ 25 cột
  var data = sheet.getLastRow() >= 2 ? sheet.getDataRange().getValues() : [];
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][24]) === String(externalId) && externalId) { rowIdx = i + 1; break; }
  }
  if (rowIdx === -1) {
    a.data_source = 'auto';
    a.external_post_id = externalId;
    return logMarketingActivity(a); // append mới (25 cột)
  }
  // update tại chỗ các cột metric. KEY = index 0-based trong MARKETING_LOG_HEADERS; cột thực = index+1.
  // reach=9, clicks=10, impressions=12, views=13, likes=14, comments=15, shares=16, saves=17,
  // watch_time_sec=18, avg_watch_pct=19.
  var map = {
    9: a.reach, 10: a.clicks, 12: a.impressions, 13: a.views, 14: a.likes,
    15: a.comments, 16: a.shares, 17: a.saves, 18: a.watch_time_sec, 19: a.avg_watch_pct
  };
  for (var col in map) {
    if (map[col] !== undefined && map[col] !== null) {
      sheet.getRange(rowIdx, Number(col) + 1).setValue(Number(map[col]) || 0);
    }
  }
  return data[rowIdx - 1][0]; // activity_id
}

/**
 * Lấy dữ liệu gộp theo tuần (ISO Week) phục vụ cho Marketing Mix Modeling (P4).
 * @param {string} from - yyyy-MM-dd
 * @param {string} to - yyyy-MM-dd
 * @return {Array<Object>} list các tuần kèm chi phí/reach và doanh thu gộp
 */
function getMmmData(from, to) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Tạo danh sách các tuần (Monday start) trong khoảng [from, to]
  var weeksMap = {};
  var weeksList = [];
  
  var endMs = new Date(to + 'T23:59:59+07:00').getTime();
  
  // Lùi về ngày thứ Hai của tuần chứa ngày 'from'
  var startMonStr = _getMondaysDateString(from);
  var currentMonStr = startMonStr;
  var currentMonMs = new Date(currentMonStr + 'T00:00:00+07:00').getTime();
  
  while (currentMonMs <= endMs) {
    // currentMonMs là 0h thứ Hai theo giờ VN (+07) → format theo +07 để lấy đúng ngày.
    // (KHÔNG dùng toISOString: nó đổi sang UTC, lùi 7h → sang Chủ Nhật hôm trước → lệch tuần.)
    var monStr = Utilities.formatDate(new Date(currentMonMs), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    if (!weeksMap[monStr]) {
      var row = {
        week_start: monStr,
        revenue: 0,
        order_count: 0,
        fb_cost: 0, fb_reach: 0,
        ig_cost: 0, ig_reach: 0,
        tiktok_cost: 0, tiktok_reach: 0,
        zalo_cost: 0, zalo_reach: 0,
        gbp_cost: 0, gbp_reach: 0,
        web_cost: 0, web_reach: 0,
        other_cost: 0, other_reach: 0,
        active_promos_count: 0
      };
      weeksMap[monStr] = row;
      weeksList.push(row);
    }
    currentMonMs += 7 * 86400000; // tiến 7 ngày
  }

  // 2. Aggregate ORDERS
  var oSheet = ss.getSheetByName('ORDERS');
  if (oSheet && oSheet.getLastRow() >= 2) {
    var od = oSheet.getDataRange().getValues();
    for (var i = 1; i < od.length; i++) {
      var status = od[i][12];
      if (status === 'CANCELLED') continue;
      var dateStr = _asDateStr(od[i][2]);
      if (dateStr < from || dateStr > to) continue;
      var mon = _getMondaysDateString(dateStr);
      if (weeksMap[mon]) {
        weeksMap[mon].revenue += (Number(od[i][11]) || 0);
        weeksMap[mon].order_count += 1;
      }
    }
  }

  // 3. Aggregate MARKETING_LOG
  var mSheet = ss.getSheetByName('MARKETING_LOG');
  if (mSheet && mSheet.getLastRow() >= 2) {
    var md = mSheet.getDataRange().getValues();
    var mHead = md[0];
    var iDate = mHead.indexOf('date');
    var iPlatform = mHead.indexOf('platform');
    var iCost = mHead.indexOf('cost_vnd');
    var iReach = mHead.indexOf('reach');
    var iViews = mHead.indexOf('views');
    
    for (var j = 1; j < md.length; j++) {
      var mRow = md[j];
      var mDateStr = _asDateStr(mRow[iDate]);
      if (mDateStr < from || mDateStr > to) continue;
      var mMon = _getMondaysDateString(mDateStr);
      if (weeksMap[mMon]) {
        var plat = String(mRow[iPlatform]).trim().toLowerCase();
        var cost = Number(mRow[iCost]) || 0;
        var rchVal = Number(mRow[iReach]) || 0;
        var viewsVal = iViews >= 0 ? (Number(mRow[iViews]) || 0) : 0;
        var reach = (plat === 'tiktok') ? (viewsVal || rchVal) : rchVal;
        
        var w = weeksMap[mMon];
        if (plat === 'fb' || plat === 'facebook') {
          w.fb_cost += cost;
          w.fb_reach += reach;
        } else if (plat === 'ig' || plat === 'instagram') {
          w.ig_cost += cost;
          w.ig_reach += reach;
        } else if (plat === 'tiktok') {
          w.tiktok_cost += cost;
          w.tiktok_reach += reach;
        } else if (plat === 'zalo') {
          w.zalo_cost += cost;
          w.zalo_reach += reach;
        } else if (plat === 'gbp' || plat === 'google' || plat === 'maps') {
          w.gbp_cost += cost;
          w.gbp_reach += reach;
        } else if (plat === 'web') {
          w.web_cost += cost;
          w.web_reach += reach;
        } else {
          w.other_cost += cost;
          w.other_reach += reach;
        }
      }
    }
  }

  // 4. Aggregate PROMOTIONS
  var pSheet = ss.getSheetByName('PROMOTIONS');
  if (pSheet && pSheet.getLastRow() >= 2) {
    var pd = pSheet.getDataRange().getValues();
    for (var k = 1; k < pd.length; k++) {
      var p = pd[k];
      var isAct = p[16];
      if (isAct === false || isAct === 'false') continue;
      var pStart = _asDateStr(p[6]);
      var pEnd = _asDateStr(p[7]);
      if (!pStart || !pEnd) continue;
      
      weeksList.forEach(function (w) {
        var wStart = w.week_start;
        var wEnd = new Date(new Date(wStart + 'T00:00:00+07:00').getTime() + 6 * 86400000).toISOString().slice(0, 10);
        if (pStart <= wEnd && pEnd >= wStart) {
          w.active_promos_count += 1;
        }
      });
    }
  }

  weeksList.sort(function(a, b) {
    return a.week_start.localeCompare(b.week_start);
  });

  return weeksList;
}

/** Trả về ngày thứ Hai của tuần chứa dateStr. */
function _getMondaysDateString(dateStr) {
  var d = new Date(dateStr + 'T00:00:00+07:00');
  var day = d.getDay();
  var diff = d.getDate() - day + (day === 0 ? -6 : 1);
  var monday = new Date(d.setDate(diff));
  var yyyy = monday.getFullYear();
  var mm = ('0' + (monday.getMonth() + 1)).slice(-2);
  var dd = ('0' + monday.getDate()).slice(-2);
  return yyyy + '-' + mm + '-' + dd;
}
