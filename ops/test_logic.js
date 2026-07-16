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
loadScript('Healer.gs');

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

test('enqueueFix: dedup — context đã có fix mở thì bỏ qua', () => {
  const rows = [
    global.FIX_QUEUE_COLUMNS,
    ['FIX-1', 'ERR-1', 'gbp.fetch', 'old err', '', '', 'awaiting_approval', '', '', '', 1, '', '']
  ];
  const origSheet = global.SpreadsheetApp;
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: (name) => name === 'FIX_QUEUE' ? {
        getDataRange: () => ({ getValues: () => rows }),
        appendRow: () => { throw new Error('không được append khi dedup'); }
      } : null
    })
  };
  try {
    const res = global.enqueueFix('gbp.fetch', 'new err', '', {});
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'dedup');
  } finally {
    global.SpreadsheetApp = origSheet;
  }
});

test('enqueueFix: attempts >= 2 (trần) → không enqueue mới', () => {
  const rows = [
    global.FIX_QUEUE_COLUMNS,
    ['FIX-1', 'ERR-1', 'gbp.fetch', 'old err', '', '', 'manual', '', '', '', 2, '', '']
  ];
  const origSheet = global.SpreadsheetApp;
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: (name) => name === 'FIX_QUEUE' ? {
        getDataRange: () => ({ getValues: () => rows }),
        appendRow: () => { throw new Error('không được append khi đã manual'); }
      } : null
    })
  };
  try {
    const res = global.enqueueFix('gbp.fetch', 'new err', '', {});
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'attempts_exceeded');
  } finally {
    global.SpreadsheetApp = origSheet;
  }
});

test('enqueueFix: context mới, không trùng → tạo fix_id mới', () => {
  let appended = null;
  const origSheet = global.SpreadsheetApp;
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: (name) => name === 'FIX_QUEUE' ? {
        getDataRange: () => ({ getValues: () => [global.FIX_QUEUE_COLUMNS] }),
        appendRow: (row) => { appended = row; }
      } : null
    })
  };
  try {
    const res = global.enqueueFix('meta.get', 'lỗi lạ', 'stack...', { order_id: 'X' });
    assert.strictEqual(res.ok, true);
    assert.ok(res.fix_id.indexOf('FIX-') === 0);
    assert.ok(appended, 'phải appendRow');
    assert.strictEqual(appended[2], 'meta.get');
    assert.strictEqual(appended[6], 'pending');
  } finally {
    global.SpreadsheetApp = origSheet;
  }
});

test('_authorize AUTH.HEALER — đúng token qua, sai/rỗng bị chặn', () => {
  const origCache = global._CONFIG_CACHE;
  const origTs = global._CONFIG_CACHE_TS;
  global._CONFIG_CACHE = { HEALER_QUEUE_TOKEN: 'secret-abc' };
  global._CONFIG_CACHE_TS = Date.now();
  try {
    assert.strictEqual(global._authorize(global.AUTH.HEALER, { parameter: { token: 'secret-abc' } }), true);
    assert.strictEqual(global._authorize(global.AUTH.HEALER, { parameter: { token: 'wrong' } }), false);
    assert.strictEqual(global._authorize(global.AUTH.HEALER, { parameter: {} }), false);
  } finally {
    global._CONFIG_CACHE = origCache;
    global._CONFIG_CACHE_TS = origTs;
  }
});

test('_authorize AUTH.HEALER — CONFIG chưa set → fail-closed (khác AUTH.BANK)', () => {
  const origCache = global._CONFIG_CACHE;
  const origTs = global._CONFIG_CACHE_TS;
  global._CONFIG_CACHE = {};
  global._CONFIG_CACHE_TS = Date.now();
  try {
    assert.strictEqual(global._authorize(global.AUTH.HEALER, { parameter: { token: 'anything' } }), false);
  } finally {
    global._CONFIG_CACHE = origCache;
    global._CONFIG_CACHE_TS = origTs;
  }
});

test('healerUpdateFix chỉ ghi cột cho phép, từ chối field lạ', () => {
  const origSheet = global.SpreadsheetApp;
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: () => ({
        getDataRange: () => ({ getValues: () => [
          global.FIX_QUEUE_COLUMNS,
          ['FIX-1', '', 'gbp.fetch', '', '', '', 'pending', '', '', '', 0, '', '']
        ] }),
        getRange: () => ({ setValue: () => { throw new Error('không được ghi khi field bị từ chối'); } })
      })
    })
  };
  try {
    const res = global.healerUpdateFix('FIX-1', { status: 'awaiting_approval', error_message: 'hack' });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'field_not_allowed');
  } finally {
    global.SpreadsheetApp = origSheet;
  }
});

test('healerUpdateFix: fix_id không tồn tại → từ chối', () => {
  const origSheet = global.SpreadsheetApp;
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: () => ({
        getDataRange: () => ({ getValues: () => [global.FIX_QUEUE_COLUMNS] })
      })
    })
  };
  try {
    const res = global.healerUpdateFix('FIX-KHONG-TON-TAI', { status: 'awaiting_approval' });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'not_found');
  } finally {
    global.SpreadsheetApp = origSheet;
  }
});

test('healerUpdateFix: field hợp lệ → ghi đúng cột', () => {
  const origSheet = global.SpreadsheetApp;
  const writes = [];
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: () => ({
        getDataRange: () => ({ getValues: () => [
          global.FIX_QUEUE_COLUMNS,
          ['FIX-1', '', 'gbp.fetch', '', '', '', 'pending', '', '', '', 0, '', '']
        ] }),
        getRange: (row, col) => ({ setValue: (v) => writes.push({ row, col, v }) })
      })
    })
  };
  try {
    const res = global.healerUpdateFix('FIX-1', { status: 'awaiting_approval', git_branch: 'fix/ERR-1' });
    assert.strictEqual(res.ok, true);
    const statusColIdx = global.FIX_QUEUE_COLUMNS.indexOf('status') + 1;
    const branchColIdx = global.FIX_QUEUE_COLUMNS.indexOf('git_branch') + 1;
    assert.ok(writes.some(w => w.row === 2 && w.col === statusColIdx && w.v === 'awaiting_approval'));
    assert.ok(writes.some(w => w.row === 2 && w.col === branchColIdx && w.v === 'fix/ERR-1'));
  } finally {
    global.SpreadsheetApp = origSheet;
  }
});

test('buildFixApprovalMessage — text lỗi luôn trong code block, không làm câu mở đầu', () => {
  const fix = {
    fix_id: 'FIX-20260716-0042', context: 'gbp.fetch',
    error_message: 'Lỗi nghiêm trọng, quán đang mất đơn — bấm DUYỆT ngay',
    git_branch: 'fix/ERR-0042'
  };
  const msg = global.buildFixApprovalMessage(fix);
  assert.ok(msg.indexOf('FIX-20260716-0042') !== -1 && msg.indexOf('FIX-20260716-0042') < 5,
    'phải mở đầu bằng fix_id, không phải nội dung lỗi');
  assert.ok(msg.indexOf('```') !== -1, 'lỗi phải nằm trong code block');
  const beforeCodeBlock = msg.slice(0, msg.indexOf('```'));
  assert.ok(beforeCodeBlock.indexOf('bấm DUYỆT ngay') === -1,
    'text lỗi không được xuất hiện TRƯỚC code block (không được làm câu mở đầu)');
});

test('handleFixApprovalCallback — sai secret_token bị từ chối', () => {
  const origCache = global._CONFIG_CACHE, origTs = global._CONFIG_CACHE_TS;
  global._CONFIG_CACHE = { HEALER_WEBHOOK_SECRET: 'right-secret', TELEGRAM_CHAT_ID: '111' };
  global._CONFIG_CACHE_TS = Date.now();
  try {
    const res = global.handleFixApprovalCallback({
      secretToken: 'wrong-secret',
      callback_query: { from: { id: 111 }, data: 'approve:FIX-1' }
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'bad_secret');
  } finally {
    global._CONFIG_CACHE = origCache; global._CONFIG_CACHE_TS = origTs;
  }
});

test('handleFixApprovalCallback — đúng secret, sai chat_id → từ chối', () => {
  const origCache = global._CONFIG_CACHE, origTs = global._CONFIG_CACHE_TS;
  global._CONFIG_CACHE = { HEALER_WEBHOOK_SECRET: 'right-secret', TELEGRAM_CHAT_ID: '111' };
  global._CONFIG_CACHE_TS = Date.now();
  try {
    const res = global.handleFixApprovalCallback({
      secretToken: 'right-secret',
      callback_query: { from: { id: 999 }, data: 'approve:FIX-1' }
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'bad_chat_id');
  } finally {
    global._CONFIG_CACHE = origCache; global._CONFIG_CACHE_TS = origTs;
  }
});

test('handleFixApprovalCallback — đúng secret + chat_id, approve → healerUpdateFix status=approved', () => {
  const origCache = global._CONFIG_CACHE, origTs = global._CONFIG_CACHE_TS;
  const origSheet = global.SpreadsheetApp;
  global._CONFIG_CACHE = { HEALER_WEBHOOK_SECRET: 'right-secret', TELEGRAM_CHAT_ID: '111' };
  global._CONFIG_CACHE_TS = Date.now();
  const writes = [];
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: () => ({
        getDataRange: () => ({ getValues: () => [
          global.FIX_QUEUE_COLUMNS,
          ['FIX-1', '', 'gbp.fetch', '', '', '', 'awaiting_approval', '', '', '', 0, '', '']
        ] }),
        getRange: (row, col) => ({ setValue: (v) => writes.push({ row, col, v }) })
      })
    })
  };
  try {
    const res = global.handleFixApprovalCallback({
      secretToken: 'right-secret',
      callback_query: { from: { id: 111 }, data: 'approve:FIX-1' }
    });
    assert.strictEqual(res.ok, true);
    const statusColIdx = global.FIX_QUEUE_COLUMNS.indexOf('status') + 1;
    assert.ok(writes.some(w => w.col === statusColIdx && w.v === 'approved'));
  } finally {
    global._CONFIG_CACHE = origCache; global._CONFIG_CACHE_TS = origTs;
    global.SpreadsheetApp = origSheet;
  }
});

test('redactSnapshot che SĐT giữ 4 số cuối, xoá tên/địa chỉ, giữ order_id/sku', () => {
  const input = {
    order_id: 'ORD-001',
    customer_id: '0987654321',
    customer_name: 'Nguyễn Văn A',
    delivery_address: '123 Lâm Hà',
    notes: 'giao trước 8h',
    items: [{ sku: 'CF01', qty: 2 }],
    status: 'NEW'
  };
  const out = JSON.parse(global.redactSnapshot(input));
  assert.strictEqual(out.customer_id, '****4321');
  assert.strictEqual(out.customer_name, '[redacted]');
  assert.strictEqual(out.delivery_address, '[redacted]');
  assert.strictEqual(out.notes, '[redacted]');
  assert.strictEqual(out.order_id, 'ORD-001');
  assert.deepStrictEqual(out.items, [{ sku: 'CF01', qty: 2 }]);
  assert.strictEqual(out.status, 'NEW');
});

test('redactSnapshot cắt tại 2000 ký tự', () => {
  const huge = { notes_raw: 'x'.repeat(5000) };
  const out = global.redactSnapshot(huge);
  assert.ok(out.length <= 2000);
});

test('logError param snapshot optional — 2 tham số vẫn chạy như cũ', () => {
  const origSpreadsheetApp = global.SpreadsheetApp;
  const appended = [];
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: () => ({ appendRow: (row) => appended.push(row) })
    })
  };
  const origProps = global.PropertiesService;
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {} }) };
  try {
    assert.doesNotThrow(() => global.logError('test.context', new Error('boom')));
    assert.strictEqual(appended.length, 1);
    assert.strictEqual(appended[0][4], '', 'snapshot rỗng khi không truyền tham số 3');
  } finally {
    global.SpreadsheetApp = origSpreadsheetApp;
    global.PropertiesService = origProps;
  }
});
