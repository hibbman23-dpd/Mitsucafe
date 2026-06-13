'use strict';

function defaultConfig() {
  return {
    blocks: { spotlight: true, promo: true, menu: true, video: true,
              qr: true, tem: true, combo: true, daypart: true },
    featured: [],
    combos: [],
    announcement: { text: '', active: false, until: '' },
    video: { youtube_id: 'AQBbF4V4wRg' },
    rotateSeconds: 11,
    theme: 'auto'
  };
}

function normalizeConfig(raw) {
  var d = defaultConfig();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  return {
    blocks:       Object.assign({}, d.blocks, raw.blocks || {}),
    featured:     Array.isArray(raw.featured) ? raw.featured.slice() : d.featured,
    combos:       Array.isArray(raw.combos) ? raw.combos.slice() : d.combos,
    announcement: Object.assign({}, d.announcement, raw.announcement || {}),
    video:        Object.assign({}, d.video, raw.video || {}),
    rotateSeconds: (typeof raw.rotateSeconds === 'number' && raw.rotateSeconds >= 5) ? raw.rotateSeconds : d.rotateSeconds,
    theme:        (['auto', 'day', 'night'].indexOf(raw.theme) >= 0 ? raw.theme : 'auto')
  };
}

// ── CommonJS export for Node tests (ignored in browser) ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { defaultConfig: defaultConfig, normalizeConfig: normalizeConfig };
}
