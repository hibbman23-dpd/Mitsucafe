'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('./signage.js');

test('normalizeConfig: v2 passes through scenes in order', () => {
  const raw = { version: 2, scenes: [
    { id: 'a', type: 'spotlight', enabled: true, duration: 12, sku: 'DR001' },
    { id: 'b', type: 'menu', enabled: false, duration: 11 },
  ], theme: 'day', promoRibbon: false };
  const c = S.normalizeConfig(raw);
  assert.strictEqual(c.version, 2);
  assert.strictEqual(c.scenes.length, 2);
  assert.strictEqual(c.scenes[0].sku, 'DR001');
  assert.strictEqual(c.theme, 'day');
  assert.strictEqual(c.promoRibbon, false);
});

test('normalizeConfig: bad input returns default v2 with empty scenes', () => {
  const c = S.normalizeConfig(null);
  assert.strictEqual(c.version, 2);
  assert.ok(Array.isArray(c.scenes));
});

test('normalizeConfig: clamps duration below 5 to 5', () => {
  const c = S.normalizeConfig({ version: 2, scenes: [
    { id: 'a', type: 'menu', enabled: true, duration: 2 }] });
  assert.strictEqual(c.scenes[0].duration, 5);
});

test('migrateV1: builds scenes from v1 blocks/featured/announcement', () => {
  const v1 = {
    blocks: { spotlight: true, menu: true, combo: true, tem: true, video: true, daypart: true },
    featured: ['DR001', 'DR002'],
    combos: [{ items: ['DR001', 'BK001'], price: 59000, label: 'Sáng' }],
    announcement: { text: 'Nghỉ lễ', active: true, until: '' },
    video: { youtube_id: 'YT123' },
    rotateSeconds: 9, theme: 'night'
  };
  const c = S.normalizeConfig(v1);
  assert.strictEqual(c.version, 2);
  const types = c.scenes.map(s => s.type);
  // announcement + 2 spotlights + menu + combo + tem + video
  assert.deepStrictEqual(types.filter(t => t === 'spotlight').length, 2);
  assert.ok(types.includes('announcement'));
  assert.ok(types.includes('combo'));
  assert.ok(types.includes('video'));
  assert.strictEqual(c.scenes.find(s => s.type === 'video').youtube_id, 'YT123');
  assert.strictEqual(c.scenes.find(s => s.type === 'spotlight').duration, 9); // from rotateSeconds
  assert.strictEqual(c.theme, 'night');
});

test('migrateV1: inactive announcement is skipped', () => {
  const c = S.normalizeConfig({ blocks: { menu: true }, announcement: { text: 'x', active: false }, rotateSeconds: 11 });
  assert.ok(!c.scenes.some(s => s.type === 'announcement'));
});

test('buildQueue: keeps enabled scenes in array order, drops disabled', () => {
  const cfg = S.normalizeConfig({ version: 2, scenes: [
    { id: 'a', type: 'menu', enabled: true, duration: 11 },
    { id: 'b', type: 'tem', enabled: false, duration: 11 },
    { id: 'c', type: 'announcement', enabled: true, duration: 9, text: 'hi' },
  ] });
  const q = S.buildQueue(cfg, new Date(), []);
  assert.deepStrictEqual(q.map(s => s.type), ['menu', 'announcement']);
});

test('buildQueue: drops spotlight whose sku is missing/unavailable; empty → brand', () => {
  const cfg = S.normalizeConfig({ version: 2, scenes: [
    { id: 'a', type: 'spotlight', enabled: true, duration: 11, sku: 'GONE' }] });
  const q = S.buildQueue(cfg, new Date(), [{ sku: 'DR001', available: true }]);
  assert.deepStrictEqual(q.map(s => s.type), ['brand']);
});

test('renderImage: outputs img src + caption + onerror fallback', () => {
  const html = S.renderImage({ image: 'https://x/sig-img/k.jpg', caption: 'Sale' });
  assert.ok(html.includes('https://x/sig-img/k.jpg'));
  assert.ok(html.includes('Sale'));
  assert.ok(html.toLowerCase().includes('onerror'));
});

test('renderImage: escapes caption', () => {
  const html = S.renderImage({ image: 'u', caption: '<script>x' });
  assert.ok(!html.includes('<script>x'));
});
