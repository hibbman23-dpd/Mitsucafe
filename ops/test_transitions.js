const test = require('node:test');
const assert = require('assert');
const { loadGas } = require('./gas_test_harness');

test('Chuyển trạng thái hợp lệ (bao gồm NEW/CONFIRMED/MAKING→DELIVERED [Xong]); DELIVERED→MAKING vẫn cấm', () => {
  const ctx = loadGas(['Orders.gs'], {});
  assert.strictEqual(ctx.isValidTransition('NEW','DELIVERED'), true);       // mở tắt từ NEW khi xong nhanh
  assert.strictEqual(ctx.isValidTransition('CONFIRMED','DELIVERED'), true); // mở từ CONFIRMED
  assert.strictEqual(ctx.isValidTransition('MAKING','DELIVERED'), true);    // mở từ MAKING
  assert.strictEqual(ctx.isValidTransition('DELIVERED','DELIVERED'), true); // idempotent cùng trạng thái
  assert.strictEqual(ctx.isValidTransition('DELIVERED','MAKING'), false);   // không mở ngược từ DELIVERED về MAKING
  assert.strictEqual(ctx.isValidTransition('CANCELLED','MAKING'), false);   // không mở từ CANCELLED về MAKING
});
