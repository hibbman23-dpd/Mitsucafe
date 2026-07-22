const test = require('node:test');
const assert = require('assert');
const { loadGas } = require('./gas_test_harness');

test('CONFIRMED→DELIVERED hợp lệ (đường [Xong]); DELIVERED→* vẫn cấm', () => {
  const ctx = loadGas(['Orders.gs'], {});
  assert.strictEqual(ctx.isValidTransition('CONFIRMED','DELIVERED'), true);
  assert.strictEqual(ctx.isValidTransition('CONFIRMED','MAKING'), true);   // giữ cũ
  assert.strictEqual(ctx.isValidTransition('DELIVERED','MAKING'), false);  // không mở ngược
  assert.strictEqual(ctx.isValidTransition('NEW','DELIVERED'), false);     // không mở tắt từ NEW
});
