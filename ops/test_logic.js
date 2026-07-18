const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');
const vm = require('vm');

// 1. Mock Google Apps Script Globals
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: () => ({
      getLastColumn: () => 10,
      getRange: () => ({
        getValues: () => [['customer_id', 'phone']],
        setValue: () => ({
          setFontWeight: () => ({
            setBackground: () => ({
              setFontColor: () => {}
            })
          })
        })
      }),
      // Header-only rows so getConfig()/_loadConfig() (Utils.gs) don't throw
      // when a test calls real (un-mocked) getConfig without CONFIG data.
      getDataRange: () => ({
        getValues: () => [['key', 'value']]
      })
    })
  })
};
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: () => '1',
    setProperty: () => {},
    deleteProperty: () => {}
  })
};
global.Logger = { log: () => {} };
global.Utilities = {
  formatDate: (date, tz, format) => {
    // Simple mock formatter
    return date.toISOString().slice(0, 10);
  },
  // No-op: các test retry không cần chờ delay thật (xem _executeWithRetry).
  sleep: () => {}
};
global.ContentService = {
  createTextOutput: (text) => ({
    _content: text,
    setMimeType: function () { return this; },
    getContent: function () { return this._content; }
  }),
  MimeType: { JSON: 'JSON' }
};
global.HtmlService = {
  createHtmlOutput: (html) => ({
    _content: html,
    setTitle: function () { return this; },
    getContent: function () { return this._content; }
  })
};

// 2. Load production Apps Script files into the Node context
function loadScript(fileName) {
  const filePath = path.join(__dirname, '../gas', fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInThisContext(code, { filename: fileName });
}

// Load Utils first (contains getConfig, format, etc.)
loadScript('Utils.gs');
loadScript('Orders.gs');
loadScript('Meta.gs');
loadScript('Admin.gs');
loadScript('RFM.gs');
loadScript('Marketing.gs');
loadScript('Payment.gs');
loadScript('Code.gs');
loadScript('Zalo.gs');

// 3. Define Unit Tests
test('normalizeCustomerId normalizes VN phone numbers correctly', (t) => {
  // Test cases: [input, expected]
  const cases = [
    ['+84 975 087 429', '0975087429'],
    ['84975087429', '0975087429'],
    ['0975-087-429', '0975087429'],
    ['0975087429', '0975087429'],
    ['975087429', '0975087429'],
    ['', ''],
    [null, '']
  ];

  for (const [input, expected] of cases) {
    const actual = global.normalizeCustomerId(input);
    assert.strictEqual(actual, expected, `Failed for input: ${input}`);
  }
});

test('_sumReactions calculates totals from object and numbers', (t) => {
  assert.strictEqual(global._sumReactions(10), 10);
  assert.strictEqual(global._sumReactions('5'), 5);
  assert.strictEqual(global._sumReactions(null), 0);
  assert.strictEqual(global._sumReactions({ like: 3, love: 2, haha: 1 }), 6);
  assert.strictEqual(global._sumReactions({ like: '3', wow: null }), 3);
});

test('_adminCoerce converts types according to schema definitions', (t) => {
  // Numbers
  assert.strictEqual(global._adminCoerce('price_m', '15000'), 15000);
  assert.strictEqual(global._adminCoerce('current_stock', '4.5'), 4.5);
  // Booleans
  assert.strictEqual(global._adminCoerce('available', 'true'), true);
  assert.strictEqual(global._adminCoerce('available', 'TRUE'), true);
  assert.strictEqual(global._adminCoerce('available', 1), true);
  assert.strictEqual(global._adminCoerce('available', '0'), false);
  // Normal string
  assert.strictEqual(global._adminCoerce('name', 'Matcha Latte'), 'Matcha Latte');
});

test('_getMondaysDateString aggregates dates to correct ISO Monday start', (t) => {
  const cases = [
    ['2026-06-21', '2026-06-15'], // Sunday to Monday
    ['2026-06-15', '2026-06-15'], // Monday to Monday
    ['2026-06-16', '2026-06-15'], // Tuesday to Monday
    ['2026-06-20', '2026-06-15'], // Saturday to Monday
    ['2026-06-22', '2026-06-22']  // Next Monday
  ];
  for (const [input, expected] of cases) {
    const actual = global._getMondaysDateString(input);
    assert.strictEqual(actual, expected, `Failed for date: ${input}`);
  }
});

test('markOrderPaid is idempotent and skips all side effects for an already paid order', () => {
  let writes = 0;
  let stamps = 0;
  let receipts = 0;
  let metrics = 0;

  global._findOrderRow = () => ({ rowIndex: 2, data: ['ORD-20260711-1000', '', '', '', '', '', '', '', '', '', '', 45000, 'NEW', '', '', '', '', '', 'cash', 'PAID'] });
  global._ordersSheet = () => ({ getRange: () => ({ setValue: () => { writes++; } }) });
  global._creditStampsForOrder = () => { stamps++; };
  global.printThermalReceipt = () => { receipts++; };
  global.computeDailyMetrics = () => { metrics++; };

  const result = global.markOrderPaid('ORD-20260711-1000');
  assert.deepStrictEqual(result, { payment_status: 'PAID', already_paid: true });
  assert.deepStrictEqual({ writes, stamps, receipts, metrics }, { writes: 0, stamps: 0, receipts: 0, metrics: 0 });
});

test('isShortCodeInDescription matches correctly and avoids false positives', () => {
  const cases = [
    // Alphanumeric short codes (like Q07)
    ['Q07', 'CK Q07', true],
    ['Q07', 'Q7', true],
    ['Q07', 'CKQ07', true],
    ['Q07', 'CK Q070', false],
    ['Q07', 'Q070', false],
    ['Q07', 'chuyen 7 ly', false],
    ['Q07', 'ban 7', false],

    // Alphanumeric G07 brand-sensitive checks (prevent false positive matching for brand G7)
    ['G07', 'mua ca phe G7', false],
    ['G07', 'CK G7', true],
    ['G07', 'G07', true],
    ['G07', 'CK G07', true],
    ['G07', 'FT2218MG07X', false], // boundary alphanumeric collision

    // Numeric short codes (like 007)
    ['007', 'ND: 007', true],
    ['007', 'ck 7', true],
    ['007', '007', true],
    ['007', '9007', false],
    ['007', '0070', false]
  ];

  for (const [shortCode, description, expected] of cases) {
    const actual = global.isShortCodeInDescription(shortCode, description);
    assert.strictEqual(actual, expected, `Failed for shortCode: ${shortCode}, description: ${description}`);
  }
});

test('toPublicLoyaltyView strips name, phone, zalo_id and notes', () => {
  const fullInfo = {
    customer_id: '0975087429',
    name: 'Nguyễn Văn Hùng',
    phone: '0975087429',
    zalo_id: 'zalo-123',
    stamp_count: 5,
    stamp_total_ever: 15,
    free_drinks_earned: 2,
    free_drinks_used: 1,
    notes: 'Khách VIP'
  };

  const actual = global.toPublicLoyaltyView(fullInfo);
  assert.strictEqual(actual.name, undefined);
  assert.strictEqual(actual.phone, undefined);
  assert.strictEqual(actual.customer_id, undefined);
  assert.strictEqual(actual.zalo_id, undefined);
  assert.strictEqual(actual.notes, undefined);
  assert.strictEqual(actual.stamp_count, 5);
  assert.strictEqual(actual.free_drinks_earned, 2);
  assert.strictEqual(actual.free_drinks_used, 1);
});

test('ROUTE_REGISTRY enforces strict authentication rules and short public allowlist', () => {
  const getRoutes = global.GET_ROUTES;
  const postRoutes = global.POST_ROUTES;
  const auths = global.AUTH;

  // Expected public routes
  const publicGetAllowlist = ['ping', 'menu', 'promo_info', 'signage_config', 'customer_info', 'order_status', 'active_orders'];
  const publicPostAllowlist = ['admin_login', 'update_admin_password', 'log_camera_event'];

  const validAuthValues = Object.values(auths);

  // Validate GET_ROUTES
  for (const [action, route] of Object.entries(getRoutes)) {
    assert.strictEqual(typeof route, 'object', `GET Route ${action} must be an object`);
    assert.strictEqual(validAuthValues.includes(route.auth), true, `GET Route ${action} has invalid auth: ${route.auth}`);
    assert.strictEqual(typeof route.handler, 'function', `GET Route ${action} must have a handler function`);
    
    if (route.auth === auths.PUBLIC) {
      assert.strictEqual(publicGetAllowlist.includes(action), true, `GET Route ${action} is PUBLIC but not in the allowlist!`);
    }
  }

  // Validate POST_ROUTES
  for (const [action, route] of Object.entries(postRoutes)) {
    assert.strictEqual(typeof route, 'object', `POST Route ${action} must be an object`);
    assert.strictEqual(validAuthValues.includes(route.auth), true, `POST Route ${action} has invalid auth: ${route.auth}`);
    assert.strictEqual(typeof route.handler, 'function', `POST Route ${action} must have a handler function`);

    if (route.auth === auths.PUBLIC) {
      assert.strictEqual(publicPostAllowlist.includes(action), true, `POST Route ${action} is PUBLIC but not in the allowlist!`);
    }
  }
});

// --- _executeWithRetry / doGet retry behavior ---
// Bối cảnh: _executeWithRetry chỉ retry khi fn() THROW. doGet gọi
// _executeWithRetry(_doGetInternal, 3, 1000) để chịu được lỗi Google Sheets
// service gián đoạn dưới 1 giây (Dịch vụ Bảng tính / Spreadsheet). Nếu
// _doGetInternal tự nuốt lỗi (try/catch nội bộ) thì fn() không bao giờ throw
// và cơ chế retry chết lâm sàng — đây là bug mà bản fix (di chuyển catch ra
// doGet) sửa. Utilities.sleep được mock no-op ở trên nên các test này không
// chờ delay thật dù delayMs thật của doGet là 1000ms.

test('_executeWithRetry retries a throwing function and returns its value once it succeeds', () => {
  let calls = 0;
  const fn = () => {
    calls++;
    if (calls < 3) {
      throw new Error('Dịch vụ Bảng tính đang bận, vui lòng thử lại');
    }
    return 'success-value';
  };

  const result = global._executeWithRetry(fn, 3, 1);
  assert.strictEqual(result, 'success-value');
  assert.strictEqual(calls, 3, 'fn phải được gọi đúng 3 lần (2 lần fail + 1 lần thành công)');
});

test('_executeWithRetry gives up after maxRetries and surfaces the failure', () => {
  let calls = 0;
  const fn = () => {
    calls++;
    throw new Error('Spreadsheet service error: timeout');
  };

  assert.throws(() => global._executeWithRetry(fn, 3, 1), /Spreadsheet service error/);
  assert.strictEqual(calls, 3, 'phải thử đủ maxRetries lần trước khi bỏ cuộc');
});

test('doGet retries a transient failure end-to-end and returns the eventual success (catches the dead-retry bug)', () => {
  // Ping route: PUBLIC, không cần lock/auth phức tạp — phù hợp để lái toàn bộ
  // đường đi thật của doGet → _executeWithRetry → _doGetInternal → route.handler.
  const originalHandler = global.GET_ROUTES.ping.handler;
  const originalLogError = global.logError;
  let calls = 0;
  global.logError = () => {}; // tránh phụ thuộc ERROR_LOG sheet thật trong mock SpreadsheetApp
  global.GET_ROUTES.ping.handler = function (e) {
    calls++;
    if (calls < 3) {
      throw new Error('Dịch vụ Bảng tính đang quá tải, thử lại sau');
    }
    return { ok: true, message: 'pong' };
  };

  try {
    const res = global.doGet({ parameter: { action: 'ping' } });
    assert.strictEqual(calls, 3, 'handler phải được gọi lại sau mỗi lần fail — nếu = 1 thì retry đã chết (bug cũ)');
    const body = JSON.parse(res.getContent());
    assert.deepStrictEqual(body, { ok: true, message: 'pong' });
  } finally {
    global.GET_ROUTES.ping.handler = originalHandler;
    global.logError = originalLogError;
  }
});

test('doGet returns a proper JSON error response when every retry attempt fails', () => {
  const originalHandler = global.GET_ROUTES.ping.handler;
  const originalLogError = global.logError;
  let calls = 0;
  global.logError = () => {};
  global.GET_ROUTES.ping.handler = function (e) {
    calls++;
    throw new Error('Dịch vụ Bảng tính không phản hồi');
  };

  try {
    const res = global.doGet({ parameter: { action: 'ping' } });
    assert.strictEqual(calls, 3, 'phải thử đủ 3 lần trước khi doGet trả lỗi cho client');
    const body = JSON.parse(res.getContent());
    assert.strictEqual(body.ok, false);
    assert.match(body.error, /Dịch vụ Bảng tính không phản hồi/);
  } finally {
    global.GET_ROUTES.ping.handler = originalHandler;
    global.logError = originalLogError;
  }
});


test('_tokenFingerprint không rò token — ERROR_LOG là sheet, ai đọc được cũng thấy', () => {
  const fp = global._tokenFingerprint('SUPER_SECRET_ZALO_TOKEN_abcd');

  // Cái phải KHÔNG có: bất kỳ mẩu nào của token đủ để dùng lại.
  assert.ok(!fp.includes('SUPER_SECRET'), 'không được chứa thân token');
  assert.ok(!fp.includes('ZALO_TOKEN'), 'không được chứa thân token');

  // Cái phải CÓ: đủ chẩn đoán "sheet ghi đúng chưa" — độ dài + 4 ký tự cuối.
  assert.match(fp, /len=28/, 'phải nêu độ dài để thấy token cụt/lệch');
  assert.match(fp, /…abcd$/, 'phải nêu 4 ký tự cuối để so 2 token có khớp không');
});

test('_tokenFingerprint phân biệt rỗng với có giá trị (ca lỗi hay gặp nhất)', () => {
  assert.strictEqual(global._tokenFingerprint(''), '(rỗng)');
  assert.strictEqual(global._tokenFingerprint(null), '(rỗng)');
  assert.strictEqual(global._tokenFingerprint(undefined), '(rỗng)');
});

test('hai token khác nhau ra fingerprint khác nhau — vẫn so sánh được', () => {
  const a = global._tokenFingerprint('token_aaaa');
  const b = global._tokenFingerprint('token_bbbb');
  assert.notStrictEqual(a, b, 'fingerprint phải phân biệt được token lệch nhau');
});

test('_computeStampAward: bậc tem theo total net', () => {
  const cases = [
    [0, 0, false], [65999, 0, false], [66000, 1, false], [75000, 1, false],
    [99999, 1, false], [100000, 2, false], [150000, 2, false], [489999, 2, false],
    [490000, 0, true], [500000, 0, true],
  ];
  for (const [total, stampsEarned, specialFreeDrink] of cases) {
    const r = global._computeStampAward(total);
    assert.deepStrictEqual(r, { stampsEarned, specialFreeDrink }, `total=${total}`);
  }
});

test('_computeStampAward: đọc ngưỡng từ CONFIG', () => {
  const orig = global.getConfig;
  global.getConfig = (k) => ({ STAMP_THRESHOLD_1: '50000', STAMP_THRESHOLD_2: '90000', STAMP_THRESHOLD_SPECIAL: '400000' }[k] || '');
  try {
    assert.deepStrictEqual(global._computeStampAward(50000), { stampsEarned: 1, specialFreeDrink: false });
    assert.deepStrictEqual(global._computeStampAward(400000), { stampsEarned: 0, specialFreeDrink: true });
  } finally { global.getConfig = orig; }
});

test('_applyStampAward: cộng tem + rollover 10', () => {
  const cust = { stamp_count: 8, stamp_total_ever: 8, free_drinks_earned: 0 };
  global._applyStampAward(cust, { stampsEarned: 2, specialFreeDrink: false });
  assert.deepStrictEqual(
    { stamp_count: cust.stamp_count, stamp_total_ever: cust.stamp_total_ever, free_drinks_earned: cust.free_drinks_earned },
    { stamp_count: 0, stamp_total_ever: 10, free_drinks_earned: 1 });
});

test('_applyStampAward: bậc special cộng thẳng 1 ly, không đụng tem', () => {
  const cust = { stamp_count: 3, stamp_total_ever: 13, free_drinks_earned: 1 };
  global._applyStampAward(cust, { stampsEarned: 0, specialFreeDrink: true });
  assert.deepStrictEqual(
    { stamp_count: cust.stamp_count, stamp_total_ever: cust.stamp_total_ever, free_drinks_earned: cust.free_drinks_earned },
    { stamp_count: 3, stamp_total_ever: 13, free_drinks_earned: 2 });
});
