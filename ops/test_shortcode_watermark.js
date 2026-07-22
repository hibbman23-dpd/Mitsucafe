const test = require('node:test');
const assert = require('assert');
const { loadGas, mkRow } = require('./gas_test_harness');

test('buildShortCode tăng seq đơn điệu cho cùng letter', () => {
  const ctx = loadGas(['Orders.gs'], { ordersRows: [], props: {} });
  const a = ctx.buildShortCode('dine_in');   // Q + seq
  const b = ctx.buildShortCode('dine_in');
  assert.strictEqual(a, 'Q01');
  assert.strictEqual(b, 'Q02');
});

test('seed watermark từ MAX(seq) khi có đơn cũ, không tụt số dù thiếu dòng', () => {
  // ORDERS đã có Q05 (các Q01..Q04 bị huỷ/xoá) → tiếp theo phải là Q06
  const ctx = loadGas(['Orders.gs'], {
    ordersRows: [ mkRow({ order_id: 'ORD-20260722-1000', short_code: 'Q05', dtype: 'dine_in' }) ],
    props: {},
    today: '20260722',
  });
  assert.strictEqual(ctx.buildShortCode('dine_in'), 'Q06');
});

test('letter đúng theo delivery_type', () => {
  const ctx = loadGas(['Orders.gs'], { ordersRows: [], props: {} });
  assert.ok(ctx.buildShortCode('delivery').startsWith('G'));
  assert.ok(ctx.buildShortCode('take_away').startsWith('M'));
});
