'use strict';
var assert = require('assert');
var S = require('../signage.js');

// defaultConfig has all 8 blocks on
var d = S.defaultConfig();
assert.strictEqual(d.blocks.spotlight, true);
assert.strictEqual(d.rotateSeconds, 11);
assert.strictEqual(Array.isArray(d.featured), true);

// R5 — theme default
assert.strictEqual(d.theme, 'auto');

// normalizeConfig fills missing fields and rejects junk
var n = S.normalizeConfig({ blocks: { menu: false }, rotateSeconds: 2 });
assert.strictEqual(n.blocks.menu, false);      // honored
assert.strictEqual(n.blocks.spotlight, true);  // default kept
assert.strictEqual(n.rotateSeconds, 11);       // 2 < 5 → rejected to default
assert.deepStrictEqual(S.normalizeConfig(null), S.defaultConfig());
assert.deepStrictEqual(S.normalizeConfig('garbage'), S.defaultConfig());

// R5 — theme normalization
assert.strictEqual(S.normalizeConfig({theme: 'auto'}).theme, 'auto');
assert.strictEqual(S.normalizeConfig({theme: 'day'}).theme, 'day');
assert.strictEqual(S.normalizeConfig({theme: 'night'}).theme, 'night');
assert.strictEqual(S.normalizeConfig({theme: 'garbage'}).theme, 'auto');
assert.strictEqual(S.normalizeConfig({}).theme, 'auto');

console.log('Task2 OK');
