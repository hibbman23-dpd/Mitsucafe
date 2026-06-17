'use strict';
// mitsu-menu.js — hc-menu accordion một-mở. Export helper thuần cho node:test + DOM wiring.

function nextOpen(currentOpenId, clickedId) {
  return currentOpenId === clickedId ? null : clickedId;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { nextOpen };
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', function (e) {
    var line = e.target.closest('.hc-line');
    if (!line) return;
    var menu = line.closest('.hc-menu');
    var detail = document.getElementById(line.getAttribute('aria-controls'));
    var isOpen = line.getAttribute('aria-expanded') === 'true';
    // accordion một-mở: đóng các item khác trong cùng menu
    menu.querySelectorAll('.hc-line[aria-expanded="true"]').forEach(function (other) {
      other.setAttribute('aria-expanded', 'false');
      var d = document.getElementById(other.getAttribute('aria-controls'));
      if (d) d.hidden = true;
    });
    if (!isOpen) { line.setAttribute('aria-expanded', 'true'); if (detail) detail.hidden = false; }
  });
}
