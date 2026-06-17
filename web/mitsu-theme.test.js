'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('./mitsu-theme.js');

test('resolveTheme: auto follows OS dark', () => {
  assert.strictEqual(T.resolveTheme('auto', true), 'dark');
});
test('resolveTheme: auto follows OS light', () => {
  assert.strictEqual(T.resolveTheme('auto', false), 'light');
});
test('resolveTheme: explicit pref overrides OS', () => {
  assert.strictEqual(T.resolveTheme('light', true), 'light');
  assert.strictEqual(T.resolveTheme('dark', false), 'dark');
});
test('nextPref cycles auto -> light -> dark -> auto', () => {
  assert.strictEqual(T.nextPref('auto'), 'light');
  assert.strictEqual(T.nextPref('light'), 'dark');
  assert.strictEqual(T.nextPref('dark'), 'auto');
});
test('normalizePref maps bad input to auto', () => {
  assert.strictEqual(T.normalizePref('xyz'), 'auto');
  assert.strictEqual(T.normalizePref('dark'), 'dark');
});
