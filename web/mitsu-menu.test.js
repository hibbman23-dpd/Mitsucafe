'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('./mitsu-menu.js');

// nextOpen(currentOpenId, clickedId) -> id sẽ mở (accordion một-mở); null = đóng hết
test('mở item mới khi chưa có gì mở', () => {
  assert.strictEqual(M.nextOpen(null, 'a'), 'a');
});
test('bấm lại item đang mở -> đóng', () => {
  assert.strictEqual(M.nextOpen('a', 'a'), null);
});
test('bấm item khác -> chuyển sang item đó', () => {
  assert.strictEqual(M.nextOpen('a', 'b'), 'b');
});
