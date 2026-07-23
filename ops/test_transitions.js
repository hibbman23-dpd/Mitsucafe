const test = require('node:test');
const assert = require('assert');
const { loadGas, mkRow } = require('./gas_test_harness');

test('Chuyển trạng thái hợp lệ (bao gồm NEW/CONFIRMED/MAKING→DELIVERED [Xong]); DELIVERED→MAKING vẫn cấm', () => {
  const ctx = loadGas(['Orders.gs'], {});
  assert.strictEqual(ctx.isValidTransition('NEW','DELIVERED'), true);       // mở tắt từ NEW khi xong nhanh
  assert.strictEqual(ctx.isValidTransition('CONFIRMED','DELIVERED'), true); // mở từ CONFIRMED
  assert.strictEqual(ctx.isValidTransition('MAKING','DELIVERED'), true);    // mở từ MAKING
  assert.strictEqual(ctx.isValidTransition('DELIVERED','DELIVERED'), true); // idempotent cùng trạng thái
  assert.strictEqual(ctx.isValidTransition('DELIVERED','MAKING'), false);   // không mở ngược từ DELIVERED về MAKING
  assert.strictEqual(ctx.isValidTransition('CANCELLED','MAKING'), false);   // không mở từ CANCELLED về MAKING
});

test('DELIVERED→CANCELLED bị cấm (đơn đã thu tiền + cộng tem, không có refund flow)', () => {
  const ctx = loadGas(['Orders.gs'], {});
  assert.strictEqual(ctx.isValidTransition('DELIVERED', 'CANCELLED'), false);
});

// Gắn getLastRows + spy vào global scope của vm context (Orders.gs gọi các hàm này
// như identifier tự do, resolve qua global object = ctx, nên set sau khi load vẫn ăn).
function wireHarnessGlobals(ctx, rows) {
  ctx.getLastRows = function (sheet, count) {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [[]];
    var startRow = Math.max(2, lastRow - count + 1);
    var numRows = lastRow - startRow + 1;
    var data = sheet.getRange(startRow, 1, numRows, 29).getValues();
    data.unshift([]); // placeholder header — chỉ cần đúng offset, code thật bắt đầu loop tại i=1
    return data;
  };
  var zaloCalls = [];
  var printCalls = [];
  var errors = [];
  ctx.sendZaloNotify = function (customerId, msg) { zaloCalls.push([customerId, msg]); };
  ctx.printThermalReceipt = function (orderId) { printCalls.push(orderId); };
  ctx.logError = function (tag, err) { errors.push([tag, err && err.message]); };
  return { zaloCalls: zaloCalls, printCalls: printCalls, errors: errors };
}

test('updateOrderStatus: same-status update là no-op — KHÔNG spam Zalo, KHÔNG in lại bill, KHÔNG ghi timestamp', () => {
  const rows = [
    mkRow({ order_id: 'ORD-NOOP-1', status: 'MAKING' }),
  ];
  const ctx = loadGas(['Orders.gs'], { ordersRows: rows });
  const spies = wireHarnessGlobals(ctx, rows);

  const beforeStatus = rows[0][12];
  const beforeMakingAt = rows[0][14];

  const result = ctx.updateOrderStatus('ORD-NOOP-1', 'MAKING');

  assert.strictEqual(result.noop, true, 'phải trả noop:true');
  assert.strictEqual(spies.zaloCalls.length, 0, 'same-status KHÔNG được gọi sendZaloNotify');
  assert.strictEqual(spies.printCalls.length, 0, 'same-status KHÔNG được gọi printThermalReceipt');
  assert.strictEqual(rows[0][12], beforeStatus, 'status column KHÔNG bị ghi lại');
  assert.strictEqual(rows[0][14], beforeMakingAt, 'making_at timestamp KHÔNG bị ghi lại');
});

test('updateOrderStatus: DELIVERED→DELIVERED (double-tap / offline replay) KHÔNG in lại thermal receipt', () => {
  const rows = [
    mkRow({ order_id: 'ORD-NOOP-2', status: 'DELIVERED' }),
  ];
  const ctx = loadGas(['Orders.gs'], { ordersRows: rows });
  const spies = wireHarnessGlobals(ctx, rows);

  const result = ctx.updateOrderStatus('ORD-NOOP-2', 'DELIVERED');

  assert.strictEqual(result.noop, true);
  assert.strictEqual(spies.printCalls.length, 0, 'DELIVERED→DELIVERED lặp lại KHÔNG được in bill lần 2');
});

test('updateOrderStatus: chuyển trạng thái THẬT (CONFIRMED→MAKING) vẫn chạy side effect + ghi timestamp', () => {
  const rows = [
    mkRow({ order_id: 'ORD-REAL-1', status: 'CONFIRMED' }),
  ];
  const ctx = loadGas(['Orders.gs'], { ordersRows: rows });
  const spies = wireHarnessGlobals(ctx, rows);

  ctx.updateOrderStatus('ORD-REAL-1', 'MAKING');

  assert.strictEqual(rows[0][12], 'MAKING', 'status column phải được ghi trạng thái mới');
  assert.strictEqual(spies.zaloCalls.length, 1, 'chuyển trạng thái thật phải gọi sendZaloNotify đúng 1 lần');
  assert.ok(rows[0][14], 'making_at timestamp phải được ghi (non-empty ISO string)');
});

test('updateOrderStatus: DELIVERED→CANCELLED bị chặn ở tầng transition (throw, không ghi, không side effect)', () => {
  const rows = [
    mkRow({ order_id: 'ORD-CANCEL-1', status: 'DELIVERED' }),
  ];
  const ctx = loadGas(['Orders.gs'], { ordersRows: rows });
  const spies = wireHarnessGlobals(ctx, rows);

  assert.throws(() => ctx.updateOrderStatus('ORD-CANCEL-1', 'CANCELLED'), /Invalid transition/);
  assert.strictEqual(rows[0][12], 'DELIVERED', 'status KHÔNG được đổi thành CANCELLED');
  assert.strictEqual(spies.zaloCalls.length, 0);
  assert.strictEqual(spies.printCalls.length, 0);
});
