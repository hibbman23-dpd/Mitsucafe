'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('./checkout.js');

test('cartTotal sums qty*price, prefers subtotal', () => {
  assert.strictEqual(C.cartTotal([{ qty: 2, price: 30000 }, { qty: 1, price: 25000, subtotal: 20000 }]), 80000);
});

test('applyQty decrements and removes at zero', () => {
  const items = [{ sku: 'A', qty: 2 }, { sku: 'B', qty: 1 }];
  assert.strictEqual(C.applyQty(items, 1, -1).length, 1);       // B removed
  assert.strictEqual(C.applyQty(items, 0, -1)[0].qty, 1);       // A -> 1
  assert.strictEqual(items[0].qty, 2);                          // original untouched
});

test('buildPartitions groups by assignment and skips empties', () => {
  const items = [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 1 }, { sku: 'C', qty: 1 }];
  const parts = C.buildPartitions(items, ['A', 'B', 'A']);
  assert.strictEqual(parts.length, 2);
  assert.strictEqual(parts[0].length, 2); // A-group: items 0 and 2
});

test('buildPartitions throws on unassigned', () => {
  assert.throws(() => C.buildPartitions([{ sku: 'A', qty: 1 }], [null]));
});

test('mergeChanges upserts by order_id', () => {
  const cur = [{ order_id: 'O1', status: 'NEW' }, { order_id: 'O2', status: 'NEW' }];
  const merged = C.mergeChanges(cur, [{ order_id: 'O2', status: 'READY' }, { order_id: 'O3', status: 'NEW' }]);
  assert.strictEqual(merged.length, 3);
  assert.strictEqual(merged.find(o => o.order_id === 'O2').status, 'READY');
});

test('isLate true beyond threshold', () => {
  assert.strictEqual(C.isLate('2026-07-26T10:00:00+07:00', '2026-07-26T10:20:00+07:00', 15), true);
  assert.strictEqual(C.isLate('2026-07-26T10:00:00+07:00', '2026-07-26T10:05:00+07:00', 15), false);
});
