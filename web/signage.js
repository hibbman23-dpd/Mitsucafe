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

function resolveFeatured(featured, menu) {
  var byId = {};
  menu.forEach(function (m) { byId[m.sku] = m; });
  if (featured && featured.length) {
    return featured.filter(function (sku) { return byId[sku] && byId[sku].available; });
  }
  // derive: available hero/signature, up to 5
  return menu.filter(function (m) { return m.available && (m.role === 'hero' || m.role === 'signature'); })
             .map(function (m) { return m.sku; }).slice(0, 5);
}

function dayPart(hour) { return hour < 11 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'; }

var DAYPART_PRIORITY = {
  morning:   ['announcement','spotlight','menu','combo','tem','video','brand'],
  afternoon: ['announcement','spotlight','combo','tem','menu','video','brand'],
  evening:   ['announcement','video','spotlight','tem','menu','combo','brand']
};

function announcementActive(ann, now) {
  if (!ann || !ann.active || !ann.text) return false;
  if (ann.until) { var t = new Date(ann.until).getTime(); if (!isNaN(t) && t < now.getTime()) return false; }
  return true;
}

function buildQueue(config, now, menu) {
  var b = config.blocks, q = [];
  if (announcementActive(config.announcement, now)) q.push({ type: 'announcement' });
  if (b.spotlight) resolveFeatured(config.featured, menu).forEach(function (sku) { q.push({ type: 'spotlight', sku: sku }); });
  if (b.menu)  q.push({ type: 'menu' });
  if (b.combo && config.combos.length) q.push({ type: 'combo', combo: config.combos[0] });
  if (b.tem)   q.push({ type: 'tem' });
  if (b.video) q.push({ type: 'video' });
  if (!q.length) return [{ type: 'brand' }];
  if (b.daypart) {
    var order = DAYPART_PRIORITY[dayPart(now.getHours())];
    q = q.slice().sort(function (a, c) { return order.indexOf(a.type) - order.indexOf(c.type); });
  }
  return q;
}

// ── CommonJS export for Node tests (ignored in browser) ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { defaultConfig: defaultConfig, normalizeConfig: normalizeConfig, resolveFeatured: resolveFeatured, dayPart: dayPart, announcementActive: announcementActive, buildQueue: buildQueue };
}
