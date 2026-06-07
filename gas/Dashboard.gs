/**
 * Dashboard.gs — Backend cho trang điều hành tổng (web/dashboard.html).
 *
 * 1 endpoint gộp tất cả live state + 1 endpoint agent insights.
 * Auth: dùng admin session token (validateSessionToken) — giống camera.html.
 *
 * Endpoints (thêm trong Code.gs):
 *   GET  ?action=dashboard_summary&token=<session>   → toàn bộ live state
 *   GET  ?action=agent_insights&token=<session>&limit=20 → log output agent
 *   POST {action:'log_agent_insight', token, agent, summary, verdict, doc_link} → ghi 1 dòng
 *
 * MỞ RỘNG: thêm card mới = thêm 1 khối try trong getDashboardSummary() + 1 card trong HTML.
 */

/**
 * Gộp toàn bộ trạng thái vận hành hôm nay. Mỗi khối bọc try riêng —
 * 1 phần lỗi không làm sập cả dashboard.
 */
function getDashboardSummary() {
  var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  var out = { ok: true, date: today, generated_at: new Date().toISOString() };

  // KPI hôm nay
  try { out.kpi = computeDailyMetrics(today); }
  catch (e) { out.kpi = { error: String(e) }; }

  // Đơn hôm nay
  try {
    var orders = getTodayOrders() || [];
    out.orders = {
      count: orders.length,
      by_status: _dashCountBy(orders, 'status'),
      recent: orders.slice(-8),
    };
  } catch (e) { out.orders = { error: String(e) }; }

  // Két ca hôm nay
  try { out.cash = cashVarianceReport(today, today); }
  catch (e) { out.cash = { error: String(e) }; }

  // Tồn kho thấp
  try { out.low_stock = _dashLowStock(); }
  catch (e) { out.low_stock = { error: String(e) }; }

  // Bảo trì (toàn bộ task + đánh dấu due/overdue ở frontend)
  try { out.maintenance = getAllMaintenanceTasks() || []; }
  catch (e) { out.maintenance = { error: String(e) }; }

  // Review chờ trả lời
  try { out.reviews_pending = getPendingResponses() || []; }
  catch (e) { out.reviews_pending = { error: String(e) }; }

  // Promo đang chạy
  try { out.promo = _getPromoInfoInternal(); }
  catch (e) { out.promo = { error: String(e) }; }

  // RFM gọn (chỉ segment counts + total)
  try {
    var r = rfmSnapshot();
    out.rfm = { total: r.total_customers, segments: r.segments, champions: r.champions };
  } catch (e) { out.rfm = { error: String(e) }; }

  // Agent insights gần nhất
  try { out.agent_insights = getAgentInsights(8); }
  catch (e) { out.agent_insights = []; }

  return out;
}

function _dashCountBy(arr, key) {
  var m = {};
  (arr || []).forEach(function (o) {
    var k = o[key] || 'UNKNOWN';
    m[k] = (m[k] || 0) + 1;
  });
  return m;
}

/**
 * Đọc INVENTORY → list nguyên liệu current_stock < min_stock.
 * Cols: ingredient_id(0) name(1) unit(2) current_stock(3) min_stock(4) ...
 */
function _dashLowStock() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('INVENTORY');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getDataRange().getValues();
  var low = [];
  for (var i = 1; i < data.length; i++) {
    var cur = parseFloat(data[i][3]);
    var min = parseFloat(data[i][4]);
    if (isNaN(cur) || isNaN(min)) continue;
    if (cur < min) {
      low.push({
        name: data[i][1], unit: data[i][2],
        current_stock: cur, min_stock: min,
        deficit: Math.round((min - cur) * 100) / 100,
      });
    }
  }
  return low;
}

/* ─────────────────────────────────────────────
 * AGENT INSIGHTS — log output các agent (roi, menu-eng, doi-thu, trend, review, khach...)
 * ───────────────────────────────────────────── */

var AGENT_INSIGHTS_HEADERS = [
  'insight_id', 'timestamp', 'agent', 'summary', 'verdict', 'doc_link'
];

function initAgentInsightsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('AGENT_INSIGHTS');
  if (sheet) { Logger.log('AGENT_INSIGHTS already exists.'); return; }
  sheet = ss.insertSheet('AGENT_INSIGHTS');
  sheet.appendRow(AGENT_INSIGHTS_HEADERS);
  sheet.getRange(1, 1, 1, AGENT_INSIGHTS_HEADERS.length)
    .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  Logger.log('AGENT_INSIGHTS tab created.');
}

/**
 * Ghi 1 dòng insight. Gọi từ agent qua POST log_agent_insight.
 * @param {Object} a { agent, summary, verdict, doc_link }
 */
function logAgentInsight(a) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('AGENT_INSIGHTS');
  if (!sheet) { initAgentInsightsSheet(); sheet = ss.getSheetByName('AGENT_INSIGHTS'); }
  var id = 'INS-' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd-HHmmss');
  sheet.appendRow([
    id, new Date().toISOString(),
    a.agent || '', a.summary || '', a.verdict || '', a.doc_link || '',
  ]);
  return id;
}

/**
 * Lấy N insight gần nhất (mới → cũ).
 */
function getAgentInsights(limit) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('AGENT_INSIGHTS');
  if (!sheet || sheet.getLastRow() < 2) return [];
  limit = limit || 20;
  var data = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = data.length - 1; i >= 1 && rows.length < limit; i--) {
    rows.push({
      insight_id: data[i][0], timestamp: data[i][1], agent: data[i][2],
      summary: data[i][3], verdict: data[i][4], doc_link: data[i][5],
    });
  }
  return rows;
}
