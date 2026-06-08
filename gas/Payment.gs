/**
 * Payment.gs — VietQR generation + payment reconciliation.
 *
 * VietQR open API (không cần key):
 *   https://img.vietqr.io/image/{BANK}-{ACCT}-compact2.png
 *     ?amount={TOTAL}&addInfo={ORDER_ID}&accountName={NAME}
 * addInfo = order_id để đối soát tự động khi khách chuyển khoản.
 */

function generateVietQR(orderId, amount) {
  var bank = getConfig('VIETQR_BANK_CODE');     // VCB, TCB, MBB, ...
  var acct = getConfig('VIETQR_ACCOUNT');
  var name = getConfig('VIETQR_ACCT_NAME');
  if (!bank || !acct || !name) {
    logError('generateVietQR', new Error('VietQR config missing'));
    return null;
  }
  return buildVietQRUrl(bank, acct, name, amount, orderId);
}

function buildVietQRUrl(bank, acct, name, amount, content) {
  var params = [
    'amount=' + encodeURIComponent(amount),
    'addInfo=' + encodeURIComponent(content),
    'accountName=' + encodeURIComponent(name),
  ].join('&');
  return 'https://img.vietqr.io/image/' + bank + '-' + acct + '-compact2.png?' + params;
}

/**
 * Xử lý thông báo biến động số dư ngân hàng gửi từ MacroDroid.
 * Bắt và trích xuất thông tin, tìm đơn hàng chưa thanh toán phù hợp và gạch nợ.
 */
function handleBankNotification(payload) {
  var text = payload.text || '';
  var bank = payload.bank || '';

  Logger.log('handleBankNotification: Bank = ' + bank + ', Text = ' + text);

  if (bank.toLowerCase() !== 'vietcombank') {
    return _jsonResponse({ ok: false, error: 'Unsupported bank: ' + bank });
  }

  var parsed = parseVcbNotificationText(text);
  if (!parsed) {
    Logger.log('handleBankNotification: Not a deposit transaction or parsing failed.');
    return _jsonResponse({ ok: false, error: 'Not a deposit or unable to parse' });
  }

  Logger.log('handleBankNotification: Parsed Amount = ' + parsed.amount + ', Content = ' + parsed.content);

  var matched = findOrderForReconciliation(parsed);
  if (!matched) {
    Logger.log('handleBankNotification: No matching pending order found.');
    return _jsonResponse({ ok: false, error: 'No matching order found' });
  }

  Logger.log('handleBankNotification: Matched order ' + matched.orderId + ' at row ' + matched.rowIndex);

  // Đánh dấu đơn đã thanh toán (markOrderPaid in Orders.gs)
  markOrderPaid(matched.orderId);

  // Gửi thông báo Telegram
  try {
    var displayCode = matched.shortCode ? '#' + matched.shortCode : matched.orderId.slice(-4);
    sendTelegramAlert('✅ [Tự động] Đơn ' + displayCode + ' (' + matched.orderId + ') đã tự động thanh toán qua Vietcombank (' + parsed.amount.toLocaleString() + 'đ).');
  } catch (tgErr) {
    logError('handleBankNotification.telegram', tgErr);
  }

  return _jsonResponse({
    ok: true,
    matched: true,
    order_id: matched.orderId,
    amount: parsed.amount,
    content: parsed.content
  });
}

/**
 * Trích xuất số tiền và nội dung chuyển khoản từ tin nhắn OTT Vietcombank.
 */
function parseVcbNotificationText(text) {
  if (!text) return null;

  // Vietcombank OTT gửi khi nhận tiền có dạng: "+50,000 VND" hoặc "+50.000 VND" hoặc "+50000 VND"
  var amountMatch = text.match(/\+([0-9,.]+)/);
  if (!amountMatch) {
    return null; // Không phải giao dịch cộng tiền (nhận tiền)
  }

  var amountStr = amountMatch[1];
  var amount = parseInt(amountStr.replace(/[,.]/g, ''), 10);
  if (isNaN(amount) || amount <= 0) {
    return null;
  }

  // Trích xuất nội dung sau ND: hoặc Noi dung:
  var content = '';
  var ndMatch = text.match(/(?:ND|Noi dung):\s*(.*)$/i);
  if (ndMatch) {
    content = ndMatch[1].trim();
  }

  return {
    amount: amount,
    content: content
  };
}

/**
 * Tìm kiếm đơn hàng khớp với số tiền và nội dung chuyển khoản.
 */
function findOrderForReconciliation(parsed) {
  var sheet = _ordersSheet();
  var data = sheet.getDataRange().getValues();
  var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');

  // Quét từ cuối bảng lên đầu để ưu tiên các đơn mới nhất
  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    var orderId = row[0];
    if (!orderId) continue;

    // Giới hạn tìm kiếm trong các đơn hôm nay (ORD-YYYYMMDD-XXXX)
    if (orderId.indexOf(today) === -1) {
      break; // Hết các đơn hôm nay thì dừng để tối ưu
    }

    var total = row[11];
    var status = row[12];
    var paymentStatus = row[19]; // cột T
    var shortCode = row[25];     // cột Z

    if (status === 'CANCELLED' || paymentStatus === 'PAID') continue;

    // Khớp số tiền
    if (Number(total) !== parsed.amount) continue;

    // Khớp nội dung chuyển khoản (nếu có nội dung)
    if (parsed.content) {
      if (isShortCodeInDescription(shortCode, parsed.content) || 
          parsed.content.toUpperCase().indexOf(orderId.toUpperCase()) !== -1) {
        return { rowIndex: i + 1, orderId: orderId, total: total, shortCode: shortCode };
      }
    }
  }
  return null;
}

/**
 * Kiểm tra xem short_code có xuất hiện trong nội dung chuyển khoản hay không.
 * Hỗ trợ so khớp khi người dùng nhập thiếu số 0 ở đầu (ví dụ: short_code "007" nhưng khách chuyển "ck 7").
 */
function isShortCodeInDescription(shortCode, description) {
  if (!shortCode || !description) return false;
  var descClean = description.toUpperCase();
  var scClean = String(shortCode).toUpperCase();

  // 1. Khớp theo ranh giới ký tự đặc biệt/khoảng trắng với mã gốc (ví dụ: "007")
  // Điều này tránh trường hợp "007" khớp nhầm với "9007" hoặc "0070"
  var regexRaw = new RegExp('(?:^|[^a-zA-Z0-9])' + _escapeRegExp(scClean) + '(?:$|[^a-zA-Z0-9])');
  if (regexRaw.test(descClean)) return true;

  // 2. Khớp số nguyên nếu mã gốc có số (ví dụ: short_code gốc là "007", scNum là "7" độc lập)
  var scNum = parseInt(shortCode, 10);
  if (!isNaN(scNum)) {
    var scNumStr = String(scNum);
    var regexNum = new RegExp('(?:^|[^0-9])' + scNumStr + '(?:$|[^0-9])');
    if (regexNum.test(descClean)) {
      return true;
    }
  }
  return false;
}

function _escapeRegExp(string) {
  return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * Hàm kiểm thử parser và logic so khớp (chạy thủ công từ Apps Script Editor).
 */
function testReconcileVcbNotification() {
  var testCases = [
    {
      text: "TK 9975087429 GD: +50,000 VND luc 27-05-2026 18:10. So du: 1,500,000 VND. ND: 007",
      expectedAmount: 50000,
      expectedContent: "007"
    },
    {
      text: "TK 9975087429 GD: +150.000 VND luc 27-05-2026 18:10. So du: 1,500,000 VND. ND: ORD-20260527-1234",
      expectedAmount: 150000,
      expectedContent: "ORD-20260527-1234"
    },
    {
      text: "GD: +28000 VND. ND: ck 7",
      expectedAmount: 28000,
      expectedContent: "ck 7"
    },
    {
      text: "GD: -20,000 VND. ND: rut tien",
      expectedAmount: null,
      expectedContent: null
    }
  ];

  Logger.log("--- STARTING UNIT TESTS FOR PARSING ---");
  for (var i = 0; i < testCases.length; i++) {
    var tc = testCases[i];
    var parsed = parseVcbNotificationText(tc.text);
    if (!parsed) {
      if (tc.expectedAmount === null) {
        Logger.log("Pass: Case " + i + " correctly ignored non-deposit.");
      } else {
        Logger.log("FAIL: Case " + i + " failed to parse. Text: " + tc.text);
      }
      continue;
    }

    if (parsed.amount === tc.expectedAmount && parsed.content === tc.expectedContent) {
      Logger.log("Pass: Case " + i + " parsed correctly. Amount: " + parsed.amount + ", Content: " + parsed.content);
    } else {
      Logger.log("FAIL: Case " + i + ". Expected: {" + tc.expectedAmount + ", '" + tc.expectedContent + "'}, Got: {" + parsed.amount + ", '" + parsed.content + "'}");
    }
  }

  Logger.log("--- STARTING UNIT TESTS FOR SHORT CODE MATCHING ---");
  var matchCases = [
    { sc: "007", desc: "007", expected: true },
    { sc: "007", desc: "MINH CK 007", expected: true },
    { sc: "007", desc: "MINH CK 7", expected: true },
    { sc: "007", desc: "ck 7 nhe", expected: true },
    { sc: "007", desc: "ck 70", expected: false },
    { sc: "007", desc: "ck 17", expected: false },
    { sc: "007", desc: "ORD-20260527-007", expected: true }
  ];

  for (var j = 0; j < matchCases.length; j++) {
    var mc = matchCases[j];
    var res = isShortCodeInDescription(mc.sc, mc.desc);
    if (res === mc.expected) {
      Logger.log("Pass: Match Case " + j + " (" + mc.sc + " in '" + mc.desc + "') -> " + res);
    } else {
      Logger.log("FAIL: Match Case " + j + " (" + mc.sc + " in '" + mc.desc + "'). Expected: " + mc.expected + ", Got: " + res);
    }
  }
  Logger.log("--- UNIT TESTS COMPLETED ---");
}
