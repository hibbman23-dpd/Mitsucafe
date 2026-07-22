const test = require('node:test');
const assert = require('assert');
const { loadGas, mkRow } = require('./gas_test_harness');

function basePayload() {
  return {
    action: 'ingest_order',
    channel: 'kds', staff_id: 'S001',
    items: [{ sku: 'DR001', name: 'Bạc xỉu', qty: 1, price: 40000, modifiers: {} }],
    payment: { method: 'cash' },
    metadata: { delivery_type: 'dine_in', notes: '' },
    idempotency_key: 'idem-abc',
    gateway_order_id: 'ORD-20260722-4242',
    gateway_short_code: 'Q21',
    printed_at: '2026-07-22T08:10:05+07:00',
  };
}

test('ingest append 1 dòng với id/short_code từ gateway, status CONFIRMED, label_printed_at set', () => {
  const ctx = loadGas(['Utils.gs','Meta.gs','Menu.gs','Orders.gs','Notify.gs','Code.gs'], { ordersRows: [], props: {} });
  ctx.getMenuItemBySku = (sku) => ({ sku: sku, name: 'Bạc xỉu', price_m: 40000, available: true });
  const r = ctx.ingestPreMintedOrder(basePayload());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.order_id, 'ORD-20260722-4242');
  assert.strictEqual(r.short_code, 'Q21');
  assert.strictEqual(ctx._rows.length, 1);
  const row = ctx._rows[0];
  assert.strictEqual(row[0], 'ORD-20260722-4242');   // order_id
  assert.strictEqual(row[12], 'CONFIRMED');          // status
  assert.notStrictEqual(row[22], '');                // label_printed_at (col 23 idx22) đã set
});

test('ingest lần 2 cùng idempotency_key → deduped, KHÔNG append thêm, KHÔNG ghi đè', () => {
  const ctx = loadGas(['Utils.gs','Meta.gs','Menu.gs','Orders.gs','Notify.gs','Code.gs'], {
    ordersRows: [ mkRow({ order_id: 'ORD-20260722-9999', idem: 'idem-abc', short_code: 'Q05', status: 'DELIVERED' }) ],
    props: {},
  });
  const r = ctx.ingestPreMintedOrder(basePayload());
  assert.strictEqual(r.deduped, true);
  assert.strictEqual(ctx._rows.length, 1);           // vẫn 1 dòng
  assert.strictEqual(ctx._rows[0][0], 'ORD-20260722-9999');  // PK KHÔNG đổi
});
