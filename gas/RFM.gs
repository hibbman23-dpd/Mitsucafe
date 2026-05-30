/**
 * RFM.gs — Customer segmentation (Recency / Frequency / Monetary).
 *
 * 5 segments (research standard):
 *   Champions    — recency ≤14d, top 25% F+M
 *   Loyal        — recency ≤30d, top 50% F+M
 *   Promising    — recency ≤30d, bottom 50% F+M
 *   Hibernating  — recency 30-90d
 *   Lost         — recency >90d
 *
 * Winback trigger: recency > 2.5× avg purchase cycle (default 30d).
 * Skip auto-winback nếu CUSTOMERS.length < 50.
 *
 * Phase: D (CRM + Strategy).
 */

var _RFM_MIN_CUSTOMERS_FOR_AUTO = 50;
var _RFM_HIBERNATING_DAYS = 30;
var _RFM_LOST_DAYS = 90;
var _RFM_CHAMPIONS_RECENCY = 14;

// ─────────────────────────────────────────────────────────────────────
// Schema extension
// ─────────────────────────────────────────────────────────────────────

/** Idempotent: thêm columns RFM vào CUSTOMERS nếu chưa có. */
function extendCustomersSchema() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CUSTOMERS');
  if (!sheet) throw new Error('CUSTOMERS sheet missing — run initAllSheets first');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var newCols = [
    'rfm_recency', 'rfm_frequency', 'rfm_monetary',
    'rfm_score', 'rfm_segment',
    'last_winback_at', 'winback_count', 'nps_score', 'birthday'
  ];
  var added = 0;
  newCols.forEach(function (col) {
    if (headers.indexOf(col) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(col)
           .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
      added++;
    }
  });
  Logger.log('CUSTOMERS schema extended with ' + added + ' columns');
  return added;
}

// ─────────────────────────────────────────────────────────────────────
// Core compute
// ─────────────────────────────────────────────────────────────────────

/**
 * Compute RFM cho TẤT CẢ khách trong CUSTOMERS sheet.
 * Update rfm_recency/frequency/monetary/score/segment per row.
 */
function computeRfmScores() {
  extendCustomersSchema();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CUSTOMERS');
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, segments: {}, count: 0 };
  var headers = data[0];
  var idx = {
    customer_id: headers.indexOf('customer_id'),
    last_order: headers.indexOf('last_order'),
    total_orders: headers.indexOf('total_orders'),
    total_spent: headers.indexOf('total_spent'),
    rfm_recency: headers.indexOf('rfm_recency'),
    rfm_frequency: headers.indexOf('rfm_frequency'),
    rfm_monetary: headers.indexOf('rfm_monetary'),
    rfm_score: headers.indexOf('rfm_score'),
    rfm_segment: headers.indexOf('rfm_segment')
  };

  var now = Date.now();
  var customers = [];
  for (var i = 1; i < data.length; i++) {
    var id = data[i][idx.customer_id];
    if (!id) continue;
    var lastOrder = data[i][idx.last_order];
    var lastTs = lastOrder ? ((lastOrder instanceof Date) ? lastOrder.getTime() : new Date(String(lastOrder)).getTime()) : 0;
    var recency = lastTs ? Math.floor((now - lastTs) / 86400000) : 999;
    var freq = parseInt(data[i][idx.total_orders], 10) || 0;
    var mon = parseInt(data[i][idx.total_spent], 10) || 0;
    customers.push({ row: i + 1, id: id, recency: recency, freq: freq, mon: mon });
  }

  if (customers.length === 0) return { ok: true, segments: {}, count: 0 };

  // Compute median F + M for quintile split
  var sortedF = customers.map(function (c) { return c.freq; }).sort(function (a, b) { return b - a; });
  var sortedM = customers.map(function (c) { return c.mon; }).sort(function (a, b) { return b - a; });
  var top25Freq = sortedF[Math.floor(sortedF.length * 0.25)] || 1;
  var top50Freq = sortedF[Math.floor(sortedF.length * 0.5)] || 0;
  var top25Mon = sortedM[Math.floor(sortedM.length * 0.25)] || 1;
  var top50Mon = sortedM[Math.floor(sortedM.length * 0.5)] || 0;

  var segments = { Champions: 0, Loyal: 0, Promising: 0, Hibernating: 0, Lost: 0 };

  customers.forEach(function (c) {
    var segment;
    if (c.recency <= _RFM_CHAMPIONS_RECENCY && c.freq >= top25Freq && c.mon >= top25Mon) {
      segment = 'Champions';
    } else if (c.recency <= _RFM_HIBERNATING_DAYS && c.freq >= top50Freq && c.mon >= top50Mon) {
      segment = 'Loyal';
    } else if (c.recency <= _RFM_HIBERNATING_DAYS) {
      segment = 'Promising';
    } else if (c.recency <= _RFM_LOST_DAYS) {
      segment = 'Hibernating';
    } else {
      segment = 'Lost';
    }
    segments[segment]++;

    // Score: simple 3-digit (R, F, M each 1-5 quintile)
    var rScore = c.recency <= 14 ? 5 : (c.recency <= 30 ? 4 : (c.recency <= 60 ? 3 : (c.recency <= 90 ? 2 : 1)));
    var fScore = c.freq >= top25Freq ? 5 : (c.freq >= top50Freq ? 3 : 1);
    var mScore = c.mon >= top25Mon ? 5 : (c.mon >= top50Mon ? 3 : 1);
    var score = '' + rScore + fScore + mScore;

    // Batch write per row (single setValues call cho efficiency)
    var rowVals = [c.recency, c.freq, c.mon, score, segment];
    sheet.getRange(c.row, idx.rfm_recency + 1, 1, 5).setValues([rowVals]);
  });

  return { ok: true, segments: segments, count: customers.length };
}

// ─────────────────────────────────────────────────────────────────────
// Winback candidates
// ─────────────────────────────────────────────────────────────────────

/**
 * Lấy danh sách Hibernating customers, sort by historic monetary descending.
 * Limit + skip những khách đã winback trong 30 ngày.
 */
function getWinbackCandidates(limit) {
  limit = limit || 10;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CUSTOMERS');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var idx = {
    customer_id: headers.indexOf('customer_id'),
    name: headers.indexOf('name'),
    total_spent: headers.indexOf('total_spent'),
    rfm_segment: headers.indexOf('rfm_segment'),
    rfm_recency: headers.indexOf('rfm_recency'),
    last_winback_at: headers.indexOf('last_winback_at'),
    winback_count: headers.indexOf('winback_count')
  };

  if (data.length - 1 < _RFM_MIN_CUSTOMERS_FOR_AUTO) {
    Logger.log('Skip winback: only ' + (data.length - 1) + ' customers (need ' + _RFM_MIN_CUSTOMERS_FOR_AUTO + ')');
    return [];
  }

  var now = Date.now();
  var candidates = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][idx.rfm_segment] !== 'Hibernating') continue;
    var lastWB = data[i][idx.last_winback_at];
    if (lastWB) {
      var wbTs = (lastWB instanceof Date) ? lastWB.getTime() : new Date(String(lastWB)).getTime();
      if (now - wbTs < 30 * 86400000) continue; // throttle 30d
    }
    var wbCount = parseInt(data[i][idx.winback_count], 10) || 0;
    if (wbCount >= 3) continue; // sau 3 lần không response, ngừng

    candidates.push({
      row: i + 1,
      customer_id: data[i][idx.customer_id],
      name: data[i][idx.name] || '',
      total_spent: parseInt(data[i][idx.total_spent], 10) || 0,
      rfm_recency: parseInt(data[i][idx.rfm_recency], 10) || 0,
      winback_count: wbCount
    });
  }

  // Sort by historic monetary desc
  candidates.sort(function (a, b) { return b.total_spent - a.total_spent; });
  return candidates.slice(0, limit);
}

/** Champions candidates cho thank-you. */
function getChampionsForThanks(limit) {
  limit = limit || 5;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CUSTOMERS');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var idx = {
    customer_id: headers.indexOf('customer_id'),
    name: headers.indexOf('name'),
    total_spent: headers.indexOf('total_spent'),
    total_orders: headers.indexOf('total_orders'),
    rfm_segment: headers.indexOf('rfm_segment')
  };
  var champs = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][idx.rfm_segment] !== 'Champions') continue;
    champs.push({
      customer_id: data[i][idx.customer_id],
      name: data[i][idx.name] || '',
      total_spent: parseInt(data[i][idx.total_spent], 10) || 0,
      total_orders: parseInt(data[i][idx.total_orders], 10) || 0
    });
  }
  champs.sort(function (a, b) { return b.total_orders - a.total_orders; });
  return champs.slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────
// Message templates
// ─────────────────────────────────────────────────────────────────────

/** Draft Zalo winback message theo brand voice. */
function draftWinbackMessage(customer) {
  var name = customer.name || 'bạn';
  return name + ', cảm ơn bạn đã từng ghé KaeruKàphê 🐸\n\n' +
         'Lâu rồi không thấy bạn về — かえる để dành sẵn 1 voucher 15% cho lần ghé tới của bạn.\n\n' +
         'Có hiệu lực 7 ngày: kaerukaphe.vn/menu\n\n' +
         'すべての一杯に、「おかえりなさい」を。';
}

/** Draft Zalo thank-you cho Champions. */
function draftChampionsThanks(customer) {
  var name = customer.name || 'bạn';
  return 'Anh/chị ' + name + ', かえる thấy bạn ghé Lâm Hà ' + customer.total_orders + ' lần rồi 🍵\n\n' +
         'Cảm ơn bạn đã đồng hành. Lần sau ghé thử món mới mùa này — quán để 1 ly riêng cho bạn.\n\n' +
         '— Team Kaeru';
}

/** Mark winback đã send. */
function markWinbackSent(customer_id) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CUSTOMERS');
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idxId = headers.indexOf('customer_id');
  var idxLastWB = headers.indexOf('last_winback_at');
  var idxCount = headers.indexOf('winback_count');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idxId]) === String(customer_id)) {
      sheet.getRange(i + 1, idxLastWB + 1).setValue(new Date().toISOString());
      sheet.getRange(i + 1, idxCount + 1).setValue((parseInt(data[i][idxCount], 10) || 0) + 1);
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────
// RFM snapshot endpoint (for /khach + scheduled task)
// ─────────────────────────────────────────────────────────────────────

/** Trả snapshot cho /khach display. */
function rfmSnapshot() {
  var result = computeRfmScores();
  var winback = getWinbackCandidates(10);
  var champions = getChampionsForThanks(5);
  return {
    ok: true,
    segments: result.segments,
    total_customers: result.count,
    eligible_for_auto: result.count >= _RFM_MIN_CUSTOMERS_FOR_AUTO,
    winback_candidates: winback,
    champions: champions
  };
}
