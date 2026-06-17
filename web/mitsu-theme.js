'use strict';
// mitsu-theme.js — resolver theme thuần (test được bằng node:test) + DOM wiring nút theme.
// Pattern theo signage.js: export cho node, tự gắn DOM khi chạy browser.
// pref: 'auto' | 'light' | 'dark'

function normalizePref(p) {
  return (p === 'light' || p === 'dark' || p === 'auto') ? p : 'auto';
}
function resolveTheme(pref, prefersDark) {
  const p = normalizePref(pref);
  if (p === 'light' || p === 'dark') return p;
  return prefersDark ? 'dark' : 'light';
}
function nextPref(pref) {
  const p = normalizePref(pref);
  return p === 'auto' ? 'light' : p === 'light' ? 'dark' : 'auto';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { resolveTheme, nextPref, normalizePref };
}

if (typeof document !== 'undefined') {
  var KEY = 'mitsu-theme';
  var mq = window.matchMedia('(prefers-color-scheme: dark)');

  function getPref() { return normalizePref(localStorage.getItem(KEY)); }

  function apply() {
    var pref = getPref();
    // 'auto' -> gỡ data-theme, để CSS @media quyết (không nhấp nháy).
    if (pref === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', pref);
    var eff = resolveTheme(pref, mq.matches);
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('data-pref', pref);
      btn.setAttribute('aria-label', 'Giao diện: ' + pref + ' (đang hiện: ' + eff + ')');
    });
  }

  function cycle() { localStorage.setItem(KEY, nextPref(getPref())); apply(); }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-theme-toggle]');
    if (btn) cycle();
  });
  mq.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', apply);
  apply();
}
