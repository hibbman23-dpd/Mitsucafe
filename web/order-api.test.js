'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { OrderApi } = require('./order-api.js');

function fakeFetch(record, resp) {
  return async (url, opts) => {
    record.url = url; record.opts = opts || {};
    return { status: resp.status || 200, json: async () => resp.body };
  };
}

test('listOrders GETs /orders', async () => {
  const rec = {};
  const api = OrderApi('http://x', fakeFetch(rec, { body: { ok: true, orders: [] } }));
  const r = await api.listOrders();
  assert.strictEqual(rec.url, 'http://x/orders');
  assert.deepStrictEqual(r.body.orders, []);
});

test('patchItems PATCHes with version + items and surfaces 409', async () => {
  const rec = {};
  const api = OrderApi('http://x', fakeFetch(rec, { status: 409, body: { ok: false, error: 'version_conflict' } }));
  const r = await api.patchItems('ORD-1', [{ sku: 'DR005', qty: 1 }], 3);
  assert.strictEqual(rec.url, 'http://x/order/ORD-1/items');
  assert.strictEqual(rec.opts.method, 'PATCH');
  const sent = JSON.parse(rec.opts.body);
  assert.strictEqual(sent.version, 3);
  assert.strictEqual(sent.items[0].sku, 'DR005');
  assert.strictEqual(r.status, 409);
});

test('patchItems includes reason only when provided', async () => {
  const rec = {};
  const api = OrderApi('http://x', fakeFetch(rec, { body: { ok: true } }));
  await api.patchItems('ORD-1', [{ sku: 'DR005', qty: 1 }], 3, '1234', 'Khách đổi ý');
  const sent = JSON.parse(rec.opts.body);
  assert.strictEqual(sent.manager_pin, '1234');
  assert.strictEqual(sent.reason, 'Khách đổi ý');

  const rec2 = {};
  const api2 = OrderApi('http://x', fakeFetch(rec2, { body: { ok: true } }));
  await api2.patchItems('ORD-1', [{ sku: 'DR005', qty: 1 }], 3);
  const sent2 = JSON.parse(rec2.opts.body);
  assert.strictEqual('manager_pin' in sent2, false);
  assert.strictEqual('reason' in sent2, false);
});

test('splitOrder POSTs partitions', async () => {
  const rec = {};
  const api = OrderApi('http://x', fakeFetch(rec, { body: { ok: true, suborders: [] } }));
  await api.splitOrder('ORD-1', [[{ sku: 'DR005', qty: 1 }]], 2);
  assert.strictEqual(rec.url, 'http://x/order/ORD-1/split');
  assert.strictEqual(rec.opts.method, 'POST');
  assert.strictEqual(JSON.parse(rec.opts.body).partitions.length, 1);
});

test('acceptOnline POSTs to /inbox/<id>/accept', async () => {
  const rec = {};
  const api = OrderApi('http://x', fakeFetch(rec, { body: { ok: true, order_id: 'ORD-9' } }));
  const r = await api.acceptOnline('OL1', { items: [] });
  assert.strictEqual(rec.url, 'http://x/inbox/OL1/accept');
  assert.strictEqual(r.body.order_id, 'ORD-9');
});
