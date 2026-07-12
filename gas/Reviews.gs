/**
 * Reviews.gs — Track customer reviews (Google Maps, Facebook, Foody, ...)
 *
 * Workflow:
 *   1. User paste review qua doGet web form (action=review_form) hoặc gọi logReview() trực tiếp.
 *   2. Sentiment auto-detect (regex VN keyword).
 *   3. Draft response theo template trong .claude/skills/cafe-manager/references/reviews-reputation.md
 *   4. response_status=drafted → user duyệt → mark sent + paste lên platform thật.
 *   5. cronReviewsMonitor (Phase D, qua Claude scheduled task) quét pending.
 *
 * Phase: B (Web + Marketing).
 */

// ─────────────────────────────────────────────────────────────────────
// Sheet bootstrap
// ─────────────────────────────────────────────────────────────────────

function initReviewsLogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('REVIEWS_LOG');
  if (sheet) return sheet;

  sheet = ss.insertSheet('REVIEWS_LOG');
  var headers = [
    'review_id', 'source', 'date', 'rating', 'customer_name', 'comment',
    'sentiment', 'response_status', 'response_text', 'responded_at',
    'responder', 'platform_url', 'logged_at'
  ];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length)
       .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  Logger.log('REVIEWS_LOG sheet created');
  return sheet;
}

// ─────────────────────────────────────────────────────────────────────
// Sentiment detection (Vietnamese keyword regex)
// ─────────────────────────────────────────────────────────────────────

var _NEGATIVE_KEYWORDS = [
  'tệ', 'dở', 'không ngon', 'thất vọng', 'đắt', 'chậm', 'thái độ',
  'bẩn', 'không quay lại', 'không hài lòng', 'kém', 'chán', 'lừa',
  'sai', 'thiếu', 'lâu', 'phục vụ tệ'
];
var _POSITIVE_KEYWORDS = [
  'ngon', 'tuyệt', 'đẹp', 'thích', 'khen', 'yêu', 'recommend',
  'tuyệt vời', 'xuất sắc', 'best', 'hài lòng', 'sạch', 'đáng',
  'chuyên nghiệp', '5 sao', 'amazing', 'great'
];

function detectSentiment(comment) {
  if (!comment) return 'neutral';
  var c = String(comment).toLowerCase();
  var neg = 0, pos = 0;
  _NEGATIVE_KEYWORDS.forEach(function (k) { if (c.indexOf(k) !== -1) neg++; });
  _POSITIVE_KEYWORDS.forEach(function (k) { if (c.indexOf(k) !== -1) pos++; });
  if (neg > pos) return 'negative';
  if (pos > neg) return 'positive';
  return 'neutral';
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Log 1 review mới vào REVIEWS_LOG + auto-draft response template.
 * @param {Object} payload — { source, date, rating, customer_name, comment, platform_url }
 * @returns {Object} — { review_id, sentiment, draft_response }
 */
function logReview(payload) {
  var sheet = initReviewsLogSheet();
  var date = payload.date || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  var rating = parseInt(payload.rating, 10) || 0;
  var comment = String(payload.comment || '');
  var sentiment = detectSentiment(comment);

  var dateCompact = String(date).replace(/-/g, '');
  var rand = Math.floor(1000 + Math.random() * 9000);
  var review_id = 'REV-' + dateCompact + '-' + rand;

  var draft = draftResponseTemplate({
    rating: rating,
    customer_name: payload.customer_name || '',
    comment: comment,
    sentiment: sentiment
  });

  // 1-star → KHÔNG auto-draft, để pending cho user xử lý cá nhân
  var status = (rating === 1) ? 'pending' : 'drafted';
  var nowIso = new Date().toISOString();

  sheet.appendRow([
    review_id,
    payload.source || 'unknown',
    date,
    rating,
    payload.customer_name || '',
    comment,
    sentiment,
    status,
    (rating === 1) ? '' : draft,
    '',  // responded_at
    '',  // responder
    payload.platform_url || '',
    nowIso
  ]);

  // Alert Telegram nếu rating ≤ 2 hoặc sentiment negative (qua throttle để chống spam)
  if (rating > 0 && rating <= 2) {
    try {
      logError('reviews.criticalRating', new Error(
        rating + '⭐ review từ ' + (payload.customer_name || 'khách lạ') +
        ' (' + (payload.source || 'unknown') + '): "' +
        comment.substring(0, 100) + '..." | review_id=' + review_id
      ));
    } catch (_) {}
  }

  return { review_id: review_id, sentiment: sentiment, draft_response: draft };
}

/** Lấy list review status=pending hoặc drafted (chờ user duyệt + paste). */
function getPendingResponses() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('REVIEWS_LOG');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idxStatus = headers.indexOf('response_status');
  var pending = [];
  for (var i = 1; i < data.length; i++) {
    var status = data[i][idxStatus];
    if (status === 'pending' || status === 'drafted') {
      var row = {};
      for (var c = 0; c < headers.length; c++) row[headers[c]] = data[i][c];
      pending.push(row);
    }
  }
  return pending;
}

/** Mark 1 review đã sent (sau khi user paste response lên platform thật). */
function markReviewResponded(review_id, responder) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('REVIEWS_LOG');
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idxId = headers.indexOf('review_id');
  var idxStatus = headers.indexOf('response_status');
  var idxRespondedAt = headers.indexOf('responded_at');
  var idxResponder = headers.indexOf('responder');
  for (var i = 1; i < data.length; i++) {
    if (data[i][idxId] === review_id) {
      var row = i + 1;
      sheet.getRange(row, idxStatus + 1).setValue('sent');
      sheet.getRange(row, idxRespondedAt + 1).setValue(new Date().toISOString());
      sheet.getRange(row, idxResponder + 1).setValue(responder || 'owner');
      return true;
    }
  }
  return false;
}

/**
 * Draft response template theo rating + sentiment + customer_name.
 * Logic theo .claude/skills/cafe-manager/references/reviews-reputation.md.
 */
function draftResponseTemplate(review) {
  var name = review.customer_name || 'bạn';
  var rating = review.rating;

  if (rating >= 5) {
    return 'Cảm ơn ' + name + ' đã ghé Mitsu Café! Vui khi bạn thích quán. ' +
           'Lần sau ghé thử món mới — Mitsu đợi 🍵\n\n— Team Mitsu';
  }
  if (rating === 4) {
    return 'Cảm ơn ' + name + ' đã chia sẻ. Team đã note feedback của bạn để cải thiện. ' +
           'Lần sau cho khẩu vị cụ thể (đậm/nhẹ/ngọt), mình điều chỉnh cho bạn nhé!\n\n— Team Mitsu';
  }
  if (rating === 3) {
    return 'Chào ' + name + ', cảm ơn bạn đã ghé. Mình xin lỗi nếu trải nghiệm chưa hài lòng. ' +
           'Bạn nhắn riêng cho Mitsu Café qua Zalo / IG DM giúp tả rõ hơn để team xử lý + bù đắp lần sau nhé.\n\n— Team Mitsu';
  }
  if (rating === 2) {
    return 'Chào ' + name + ', mình rất tiếc trải nghiệm hôm đó chưa tốt với bạn. ' +
           'Đây là Zalo trực tiếp chủ quán: 0975087429. Mong bạn cho team cơ hội bù đắp.\n\n— Chủ quán Mitsu Café';
  }
  // rating === 1 hoặc 0 — không auto-draft
  return '';
}

// ─────────────────────────────────────────────────────────────────────
// Web app endpoint — mobile-friendly form để nhập review
// Gọi qua: https://script.google.com/.../exec?action=review_form
// ─────────────────────────────────────────────────────────────────────

/**
 * Render HTML form đơn giản cho user paste review trên mobile.
 * Gắn vào doGet() routing trong Code.gs:
 *   if (e.parameter.action === 'review_form') return webAppReviewForm();
 *   if (e.parameter.action === 'review_submit') return webAppReviewSubmit(e);
 */
function webAppReviewForm() {
  var html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>' +
    'body{font-family:system-ui;max-width:480px;margin:0 auto;padding:20px;background:#F5F0E8;color:#1E2D32;}' +
    'h1{color:#2D5F6B;font-size:1.3rem;margin-bottom:8px;}' +
    'label{display:block;margin-top:14px;font-weight:600;font-size:.9rem;}' +
    'input,select,textarea{width:100%;padding:10px;border:1px solid #A89B80;border-radius:4px;font-size:1rem;box-sizing:border-box;margin-top:4px;}' +
    'textarea{min-height:120px;font-family:inherit;}' +
    'button{margin-top:20px;width:100%;padding:14px;background:#EB624A;color:#fff;border:none;border-radius:4px;font-size:1rem;font-weight:600;cursor:pointer;}' +
    'button:hover{background:#c94f3a;}' +
    '.note{font-size:.78rem;color:#8a7d64;margin-top:6px;}' +
    '</style></head><body>' +
    '<h1>🍵 Log review — Mitsu Café</h1>' +
    '<form id="f" action="" method="POST">' +
    '<label>Nguồn<select name="source"><option>google_maps</option><option>facebook</option><option>instagram</option><option>foody</option><option>tiktok</option><option>other</option></select></label>' +
    '<label>Ngày review<input type="date" name="date" required></label>' +
    '<label>Rating (1-5)<select name="rating" required><option value="5">5 ⭐</option><option value="4">4 ⭐</option><option value="3">3 ⭐</option><option value="2">2 ⭐</option><option value="1">1 ⭐</option></select></label>' +
    '<label>Tên khách (nếu có)<input type="text" name="customer_name"></label>' +
    '<label>Nội dung review<textarea name="comment" required placeholder="Paste comment thật của khách..."></textarea></label>' +
    '<label>Link platform (optional)<input type="url" name="platform_url" placeholder="https://..."></label>' +
    '<button type="submit">Lưu review + sinh draft response</button>' +
    '<p class="note">Sentiment + draft response tự động sinh. 1⭐ sẽ flagged pending cho chủ quán xử lý cá nhân.</p>' +
    '</form>' +
    '<script>' +
    'var token = new URLSearchParams(window.location.search).get("token") || "";' +
    'document.getElementById("f").addEventListener("submit",function(e){' +
    'e.preventDefault();' +
    'var fd=new FormData(this);' +
    'var params=new URLSearchParams();' +
    'fd.forEach(function(v,k){params.append(k,v);});' +
    'params.append("action","review_submit");' +
    'if (token) params.append("token", token);' +
    'fetch(window.location.pathname+"?"+params.toString()).then(function(r){return r.json();}).then(function(d){' +
    'document.body.innerHTML="<h1>✅ Lưu xong</h1><pre style=\\"white-space:pre-wrap;background:#fff;padding:14px;border-radius:6px;\\">"+JSON.stringify(d,null,2)+"</pre><a href=\\"?action=review_form&token="+token+"\\">Log thêm review</a>";' +
    '});' +
    '});' +
    '</script>' +
    '</body></html>'
  );
  html.setTitle('Log review — Mitsu Café');
  return html;
}

/** Endpoint xử lý submit từ webAppReviewForm. Trả JSON. */
function webAppReviewSubmit(e) {
  try {
    var payload = {
      source: e.parameter.source,
      date: e.parameter.date,
      rating: e.parameter.rating,
      customer_name: e.parameter.customer_name,
      comment: e.parameter.comment,
      platform_url: e.parameter.platform_url
    };
    var result = logReview(payload);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, result: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    logError('webAppReviewSubmit', err);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err && err.message || err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
