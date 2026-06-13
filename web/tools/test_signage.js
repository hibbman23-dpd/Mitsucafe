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

// --- Task 3 ---
var MENU = [
  { sku:'DR001', subcategory:'phin_coffee', role:'leader', available:true },
  { sku:'DR003', subcategory:'phin_coffee', role:'hero',   available:true },
  { sku:'DR014', subcategory:'milk_tea',    role:'signature', available:true },
  { sku:'DR099', subcategory:'milk_tea',    role:'hero',   available:false }
];

// resolveFeatured: explicit list keeps only available; missing → derive hero/signature
assert.deepStrictEqual(S.resolveFeatured(['DR014','DR099','DR001'], MENU), ['DR014','DR001']);
var derived = S.resolveFeatured([], MENU);
assert.ok(derived.indexOf('DR003') !== -1 && derived.indexOf('DR014') !== -1);
assert.ok(derived.indexOf('DR099') === -1); // unavailable excluded

// dayPart boundaries
assert.strictEqual(S.dayPart(9), 'morning');
assert.strictEqual(S.dayPart(14), 'afternoon');
assert.strictEqual(S.dayPart(20), 'evening');

// buildQueue: announcement first when active; brand fallback when all off
var cfgOn = S.normalizeConfig({ featured:['DR014'], combos:[{items:['DR003','BK001'],price:50000}],
  announcement:{text:'Nghỉ lễ',active:true,until:''} });
var q = S.buildQueue(cfgOn, new Date('2026-06-11T09:00:00+07:00'), MENU);
assert.strictEqual(q[0].type, 'announcement');
assert.ok(q.some(function(s){ return s.type==='spotlight' && s.sku==='DR014'; }));
assert.ok(q.some(function(s){ return s.type==='combo'; }));

var allOff = S.normalizeConfig({ blocks:{ spotlight:false,promo:false,menu:false,video:false,qr:false,tem:false,combo:false,daypart:false } });
var qEmpty = S.buildQueue(allOff, new Date(), MENU);
assert.deepStrictEqual(qEmpty.map(function(s){ return s.type; }), ['brand']);

// evening daypart puts video before menu
var cfgEve = S.normalizeConfig({ featured:['DR014'] });
var qe = S.buildQueue(cfgEve, new Date('2026-06-11T20:00:00+07:00'), MENU);
assert.ok(qe.findIndex(function(s){ return s.type==='video'; }) < qe.findIndex(function(s){ return s.type==='menu'; }));

console.log('Task3 OK');

// --- Task 4 --- renderers return strings, escape input
assert.ok(S.renderSpotlight({name:'Trà sữa',price_m:38000,subcategory:'milk_tea'}).indexOf('Trà sữa')!==-1);
assert.ok(S.renderAnnouncement('<script>x').indexOf('&lt;script&gt;')!==-1); // escaped
assert.ok(S.renderTem().indexOf('10 tem')!==-1);
console.log('Task4 OK');
