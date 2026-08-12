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

test('applyQty does not alias nested modifiers', () => {
  const items = [{ sku: 'A', qty: 2, modifiers: { sugar: '50%' } }];
  const out = C.applyQty(items, 0, -1);
  out[0].modifiers.sugar = '0%';
  assert.strictEqual(items[0].modifiers.sugar, '50%');  // original untouched
});

test('applyQty rescales an explicit subtotal', () => {
  const items = [{ sku: 'A', qty: 2, price: 30000, subtotal: 60000 }];
  const out = C.applyQty(items, 0, -1);
  assert.strictEqual(out[0].qty, 1);
  assert.strictEqual(out[0].subtotal, 30000);
  assert.strictEqual(C.cartTotal(out), 30000);
});

test('applyCancelQty removes only the cancelled cups', () => {
  const items = [{ sku: 'A', qty: 2, price: 30000, subtotal: 60000 }, { sku: 'B', qty: 1, price: 25000 }];
  const out = C.applyCancelQty(items, { 0: 1 });
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].qty, 1);
  assert.strictEqual(out[0].subtotal, 30000);
  assert.strictEqual(C.cartTotal(out), 55000);
  assert.strictEqual(items[0].qty, 2);                          // original untouched
});

test('applyCancelQty drops a line cancelled in full and clamps overshoot', () => {
  const items = [{ sku: 'A', qty: 2 }, { sku: 'B', qty: 1 }];
  assert.deepStrictEqual(C.applyCancelQty(items, { 0: 2 }).map(i => i.sku), ['B']);
  assert.deepStrictEqual(C.applyCancelQty(items, { 0: 9, 1: 1 }), []);
  assert.deepStrictEqual(C.applyCancelQty(items, { 0: 0 }).map(i => i.sku), ['A', 'B']);
});

test('applyCancelQty does not alias nested modifiers', () => {
  const items = [{ sku: 'A', qty: 2, modifiers: { sugar: '50%' } }];
  const out = C.applyCancelQty(items, { 0: 1 });
  out[0].modifiers.sugar = '0%';
  assert.strictEqual(items[0].modifiers.sugar, '50%');
});

test('buildPartitions does not alias nested modifiers', () => {
  const items = [{ sku: 'A', qty: 1, modifiers: { ice: 'full' } }];
  const parts = C.buildPartitions(items, ['A']);
  parts[0][0].modifiers.ice = 'none';
  assert.strictEqual(items[0].modifiers.ice, 'full');
});
