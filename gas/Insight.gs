/**
 * Insight.gs — DECISION_LOG: nhật ký quyết định content/menu/promo của subagent cafe-insight.
 * Mỗi quyết định có review_date (+14d); subagent quét dòng tới hạn để điền kết quả.
 */
var DECISION_LOG_HEADERS = [
  'decision_id', 'date', 'scope', 'ref_id', 'decision', 'rationale',
  'expected_metric', 'review_date', 'actual_result', 'hit_or_miss'
];

function _decisionSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DECISION_LOG');
}

/** Tạo tab DECISION_LOG (idempotent). */
function initDecisionLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('DECISION_LOG');
  if (sheet) { Logger.log('DECISION_LOG already exists.'); return; }
  sheet = ss.insertSheet('DECISION_LOG');
  sheet.appendRow(DECISION_LOG_HEADERS);
  sheet.getRange(1, 1, 1, DECISION_LOG_HEADERS.length)
    .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  Logger.log('DECISION_LOG created.');
}

function generateDecisionId() {
  var d = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  var rand = ('000' + Math.floor(Math.random() * 1000)).slice(-3);
  return 'DEC-' + d + '-' + rand;
}

/**
 * Ghi 1 quyết định. review_date = date + 14 ngày nếu không truyền.
 * @param {Object} d - { scope, ref_id, decision, rationale, expected_metric, date }
 * @return {string} decision_id
 */
function logDecision(d) {
  var sheet = _decisionSheet();
  if (!sheet) { initDecisionLog(); sheet = _decisionSheet(); }
  var tz = 'Asia/Ho_Chi_Minh';
  var date = d.date || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var review = d.review_date ||
    Utilities.formatDate(new Date(new Date(date).getTime() + 14 * 86400000), tz, 'yyyy-MM-dd');
  var id = d.decision_id || generateDecisionId();
  sheet.appendRow([
    id, date, d.scope || 'post', d.ref_id || '', d.decision || '',
    d.rationale || '', d.expected_metric || '', review, '', '',
  ]);
  return id;
}

/** Các quyết định đã tới hạn review (review_date <= hôm nay) & chưa có actual_result. */
function getDecisionsDue() {
  var sheet = _decisionSheet();
  if (!sheet || sheet.getLastRow() < 2) return [];
  var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  var data = sheet.getDataRange().getValues();
  var due = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var reviewDate = _asDateStr(r[7]); // helper global từ Marketing.gs (cùng project scope)
    if (reviewDate && reviewDate <= today && !r[8]) {
      due.push({ row: i + 1, decision_id: r[0], scope: r[2], ref_id: r[3],
        decision: r[4], expected_metric: r[6], review_date: reviewDate });
    }
  }
  return due;
}

/** Điền kết quả review cho 1 quyết định (subagent gọi sau khi đánh giá). */
function recordDecisionResult(decisionId, actualResult, hitOrMiss) {
  var sheet = _decisionSheet();
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(decisionId)) {
      sheet.getRange(i + 1, 9).setValue(actualResult || '');
      sheet.getRange(i + 1, 10).setValue(hitOrMiss || '');
      return true;
    }
  }
  return false;
}
