'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Outbox = require('./outbox.js');

function fakeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    _raw: (k) => store.get(k),
    _set: (k, v) => { store.set(k, v); },
  };
}

test('enqueue then list returns the entry', () => {
  const st = fakeStorage();
  const entry = Outbox.enqueue('w-1', { total: 100 }, st);
  assert.strictEqual(entry.idempotency_key, 'w-1');
  assert.strictEqual(entry.status, 'pending');
  assert.strictEqual(entry.attempts, 0);
  const all = Outbox.list(st);
  assert.strictEqual(all.length, 1);
  assert.strictEqual(all[0].idempotency_key, 'w-1');
  assert.deepStrictEqual(all[0].payload, { total: 100 });
});

test('enqueueing the same idempotency_key twice does not duplicate', () => {
  const st = fakeStorage();
  Outbox.enqueue('w-dup', { total: 50 }, st);
  Outbox.enqueue('w-dup', { total: 999 }, st); // payload khác cũng bị bỏ qua — key cũ thắng
  const all = Outbox.list(st);
  assert.strictEqual(all.length, 1);
  assert.strictEqual(all[0].payload.total, 50);
});

test('nextDelayMs returns backoff schedule then null', () => {
  assert.strictEqual(Outbox.nextDelayMs(0), 2000);
  assert.strictEqual(Outbox.nextDelayMs(1), 5000);
  assert.strictEqual(Outbox.nextDelayMs(2), 15000);
  assert.strictEqual(Outbox.nextDelayMs(3), null);
  assert.strictEqual(Outbox.nextDelayMs(4), null);
});

test('expiry: 29 minutes old, same Asia/Ho_Chi_Minh day is NOT expired', () => {
  // now = 2026-08-09T10:00:00Z = 17:00 HCM (UTC+7); created 29 min earlier, same HCM day.
  const now = new Date('2026-08-09T10:00:00.000Z');
  const created = new Date('2026-08-09T09:31:00.000Z');
  const entry = { created_at: created.toISOString(), status: 'pending' };
  assert.strictEqual(Outbox.isExpired(entry, now), false);
});

test('expiry: 31 minutes old IS expired', () => {
  const now = new Date('2026-08-09T10:00:00.000Z');
  const created = new Date('2026-08-09T09:29:00.000Z');
  const entry = { created_at: created.toISOString(), status: 'pending' };
  assert.strictEqual(Outbox.isExpired(entry, now), true);
});

test('expiry: previous Asia/Ho_Chi_Minh calendar day IS expired even under 30 minutes', () => {
  // created 23:50 HCM (2026-08-09) = 16:50Z; now 00:05 HCM (2026-08-10) = 17:05Z — 15 min apart.
  const created = new Date('2026-08-09T16:50:00.000Z');
  const now = new Date('2026-08-09T17:05:00.000Z');
  const entry = { created_at: created.toISOString(), status: 'pending' };
  assert.strictEqual(Outbox.isExpired(entry, now), true);
});

test('expireStale flips expired pending entries to failed, leaves others alone', () => {
  const st = fakeStorage();
  const now = new Date('2026-08-09T17:05:00.000Z');
  Outbox.enqueue('w-old', { total: 1 }, st);
  Outbox.update('w-old', { created_at: '2026-08-09T16:50:00.000Z' }, st); // đêm hôm trước ở HCM
  Outbox.enqueue('w-fresh', { total: 2 }, st);
  // created_at phải neo theo `now` cắm cứng ở trên, KHÔNG lấy đồng hồ thật của
  // enqueue(): trộn mốc cứng với đồng hồ thật thì test chỉ xanh trong đúng ngày
  // viết nó, qua nửa đêm là khác ngày HCM và w-fresh bị tính là hết hạn.
  Outbox.update('w-fresh', { created_at: '2026-08-09T17:00:00.000Z' }, st);
  Outbox.expireStale(st, now);
  const all = Outbox.list(st);
  const old = all.find((e) => e.idempotency_key === 'w-old');
  const fresh = all.find((e) => e.idempotency_key === 'w-fresh');
  assert.strictEqual(old.status, 'failed');
  assert.strictEqual(fresh.status, 'pending');
});

test('remove-on-success drops only the matching entry', () => {
  const st = fakeStorage();
  Outbox.enqueue('w-a', { total: 1 }, st);
  Outbox.enqueue('w-b', { total: 2 }, st);
  Outbox.remove('w-a', st);
  const all = Outbox.list(st);
  assert.strictEqual(all.length, 1);
  assert.strictEqual(all[0].idempotency_key, 'w-b');
});

test('update patches fields on the matching entry only', () => {
  const st = fakeStorage();
  Outbox.enqueue('w-a', { total: 1 }, st);
  Outbox.enqueue('w-b', { total: 2 }, st);
  const updated = Outbox.update('w-a', { status: 'failed', attempts: 3 }, st);
  assert.strictEqual(updated.status, 'failed');
  assert.strictEqual(updated.attempts, 3);
  const all = Outbox.list(st);
  assert.strictEqual(all.find((e) => e.idempotency_key === 'w-b').status, 'pending');
});

test('corrupted storage (invalid JSON) yields [] rather than throwing', () => {
  const st = fakeStorage();
  st._set(Outbox.OUTBOX_KEY, '{not valid json[[');
  assert.doesNotThrow(() => {
    const all = Outbox.list(st);
    assert.deepStrictEqual(all, []);
  });
});
