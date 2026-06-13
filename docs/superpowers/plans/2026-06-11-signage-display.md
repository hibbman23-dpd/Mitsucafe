# Signage Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a street-facing 16:9 digital-signage page (`/signage`) that rotates ukiyo-e themed scenes (spotlight, menu, combo, stamp card, video, live promo + QR), driven by `menu-data.js` + GAS config, controllable from a new Dashboard tab.

**Architecture:** Standalone `web/signage.html` + `web/signage.js` served by the Cloudflare Worker. Pure render/rotation logic in `signage.js` (CommonJS-exportable so it runs under Node for tests). Config is one JSON blob in the CONFIG sheet (`SIGNAGE_CONFIG`), read via public `?action=signage_config`, written by Dashboard via `?action=set_signage`. Page polls every 60s, caches to localStorage, renders instantly offline.

**Tech Stack:** Vanilla HTML/CSS/JS (no framework), Google Apps Script, Cloudflare Worker, Node for unit tests, preview tooling for visual verification.

**Source material:** The approved visual draft lives at `web/_signage_preview.html` (committed on this branch). It contains the final CSS (design tokens, washi/sun/wave, cascade-reveal keyframes) and the static markup for all 5 scenes. This plan **refactors that draft into a data-driven `signage.html` + `signage.js`**; reuse its CSS verbatim rather than re-authoring styles.

**Spec:** `docs/superpowers/specs/2026-06-11-signage-display-design.md`

---

## File Structure

- `web/signage.html` — **Create.** HTML shell: `<head>` (CSP allowing YouTube + Google Fonts, noindex), all CSS copied from the draft, persistent-frame markup (top bar, sun, frame, QR rail, promo ribbon, progress dots, empty `#stage`), loads `menu-data.js` then `signage.js`.
- `web/signage.js` — **Create.** All logic: config defaults/normalize, featured/daypart/queue (pure, exported), scene renderers (HTML strings), rotation runtime, data layer (poll + cache + resilience + auto-reload), `esc()`.
- `web/tools/test_signage.js` — **Create.** Node assertion tests for the pure functions exported by `signage.js`.
- `gas/Signage.gs` — **Create.** `getSignageConfig` (public read + default), `setSignageConfig` (admin write), `_defaultSignageConfig`.
- `gas/Code.gs` — **Modify.** Add `signage_config` route (doGet) + `set_signage` route (doPost).
- `gas/Admin.gs` — **Modify.** Add `SIGNAGE_CONFIG` to the CONFIG key whitelist if writes go through `adminConfigSet` (verify; otherwise no change).
- `web/dashboard.html` — **Modify.** New "📺 Màn hình" tab: block toggles, featured picker, combo editor, announcement box, rotate seconds, daypart, youtube id, Save → `set_signage`, "Xem trước" link.
- `src/index.js` — **Modify.** Add `/signage` + `/signage.html` to `NOINDEX_PATHS` (X-Robots-Tag). Confirm signage is NOT in control paths (it must keep its own YouTube-friendly CSP from the page `<meta>`, not the strict CONTROL_CSP).
- `docs/system/signage-hardware.md` — **Create.** Android-box kiosk runbook.
- `web/_signage_preview.html` — **Delete** in the final task (its content has moved into signage.html/js).

---

## Data Contract (shared across tasks)

`SIGNAGE_CONFIG` JSON (stored as a string in CONFIG sheet):

```json
{
  "blocks": { "spotlight": true, "promo": true, "menu": true, "video": true,
              "qr": true, "tem": true, "combo": true, "daypart": true },
  "featured": ["DR014", "DR003", "DR005"],
  "combos": [ { "items": ["DR005", "BK001"], "price": 50000, "label": "" } ],
  "announcement": { "text": "", "active": false, "until": "" },
  "video": { "youtube_id": "AQBbF4V4wRg" },
  "rotateSeconds": 11,
  "theme": "auto"
}
```
(`theme`: `auto` | `day` | `night`, added by R5.)

Scene descriptor (output of `buildQueue`): `{ type: 'spotlight'|'menu'|'combo'|'tem'|'video'|'announcement'|'brand', sku?, combo? }`.

---

## Task 1: signage.html shell from the draft

**Files:**
- Create: `web/signage.html`
- Reference: `web/_signage_preview.html` (CSS + frame markup source)

- [ ] **Step 1: Create `web/signage.html`** with the head, CSS, and persistent frame.

Copy the entire `<style>...</style>` block from `web/_signage_preview.html` verbatim (design tokens, `.tv`, sun, frame, topbar, ribbon, qrrail, dots, reveal system, and all `.sp/.vid/.menu/.combo/.tem` scene styles). Then use this document structure:

```html
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta http-equiv="Content-Security-Policy" content="default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://script.google.com https://script.googleusercontent.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self' https://script.google.com https://script.googleusercontent.com https://cloudflareinsights.com;">
<title>KaeruKàphê — Màn hình</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;500;700;900&family=IM+Fell+English+SC&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<style>
/* … PASTE the full <style> from web/_signage_preview.html here … */
</style>
</head>
<body>
<div class="tv" id="tv">
  <div class="sun"></div><div class="sun-disc"></div><div class="sun-ring"></div>
  <div class="frame"></div>
  <div class="topbar">
    <span class="kanjilogo">茶</span>
    <div class="brandwrap"><span class="en">KaeruKàphê</span><span class="vi">Bubble Tea &amp; Cà phê · Lâm Hà</span></div>
    <span class="open-dot"></span><span class="open-txt" id="open-txt">Đang mở cửa</span>
    <span class="clock" id="clock">--:--</span>
  </div>
  <div class="ribbon" id="ribbon" style="display:none"></div>
  <div id="stage"></div>
  <div class="qrrail" id="qrrail">
    <div class="qr"><span class="qr-fp tl"></span><span class="qr-fp tr"></span><span class="qr-fp bl"></span></div>
    <div class="qtxt">Quét đặt món</div><div class="qsub">tại bàn · mang đi</div>
  </div>
  <div class="dots" id="dots"></div>
</div>
<script src="menu-data.js?v=20260611"></script>
<script src="signage.js?v=20260611"></script>
</body>
</html>
```

Note: the `id="stage"` replaces the draft's inline `<section class="scene">` blocks — scenes are now injected by JS. The QR rail target URL is shown on screen as text only (the QR image is the decorative CSS block from the draft; a real scannable QR is out of scope for v1 and noted in the spec's "ngoài phạm vi"—the CSS QR is a placeholder visual).

- [ ] **Step 2: Verify the shell renders the frame** (no scenes yet).

```bash
# launch.json already defines "kaeru-web" on :8082 serving web/
```
Use preview: `preview_start "kaeru-web"`, `preview_resize 1280x720`, navigate to `http://localhost:8082/signage.html`, `preview_screenshot`.
Expected: dark teal stage, sun glow, gold frame, top bar with 茶 + brand + clock placeholder, QR rail, empty center. No console errors (`preview_console_logs level=error` → none).

- [ ] **Step 3: Commit**

```bash
git add web/signage.html
git commit -m "feat(signage): page shell + frame from approved draft"
```

---

## Task 2: Config defaults + normalize (pure, tested)

**Files:**
- Create: `web/signage.js`
- Create: `web/tools/test_signage.js`

- [ ] **Step 1: Write the failing test** in `web/tools/test_signage.js`

```js
const assert = require('assert');
const S = require('../signage.js');

// defaultConfig has all 8 blocks on
const d = S.defaultConfig();
assert.strictEqual(d.blocks.spotlight, true);
assert.strictEqual(d.rotateSeconds, 11);
assert.strictEqual(Array.isArray(d.featured), true);

// normalizeConfig fills missing fields and rejects junk
const n = S.normalizeConfig({ blocks: { menu: false }, rotateSeconds: 2 });
assert.strictEqual(n.blocks.menu, false);      // honored
assert.strictEqual(n.blocks.spotlight, true);  // default kept
assert.strictEqual(n.rotateSeconds, 11);       // 2 < 5 → rejected to default
assert.deepStrictEqual(S.normalizeConfig(null), S.defaultConfig());
assert.deepStrictEqual(S.normalizeConfig('garbage'), S.defaultConfig());

console.log('Task2 OK');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node web/tools/test_signage.js`
Expected: FAIL — `Cannot find module '../signage.js'`.

- [ ] **Step 3: Create `web/signage.js`** with config logic + the CommonJS export hook.

```js
'use strict';

function defaultConfig() {
  return {
    blocks: { spotlight: true, promo: true, menu: true, video: true,
              qr: true, tem: true, combo: true, daypart: true },
    featured: [],
    combos: [],
    announcement: { text: '', active: false, until: '' },
    video: { youtube_id: 'AQBbF4V4wRg' },
    rotateSeconds: 11
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
    rotateSeconds:(typeof raw.rotateSeconds === 'number' && raw.rotateSeconds >= 5) ? raw.rotateSeconds : d.rotateSeconds
  };
}

// ── CommonJS export for Node tests (ignored in browser) ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { defaultConfig: defaultConfig, normalizeConfig: normalizeConfig };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node web/tools/test_signage.js`
Expected: `Task2 OK`.

- [ ] **Step 5: Commit**

```bash
git add web/signage.js web/tools/test_signage.js
git commit -m "feat(signage): config defaults + normalize with node tests"
```

---

## Task 3: Featured resolution + daypart + queue (pure, tested)

**Files:**
- Modify: `web/signage.js`
- Modify: `web/tools/test_signage.js`

- [ ] **Step 1: Add failing tests** (append to `web/tools/test_signage.js`, before the final `console.log`)

```js
// --- Task 3 ---
const MENU = [
  { sku:'DR001', subcategory:'phin_coffee', role:'leader', available:true },
  { sku:'DR003', subcategory:'phin_coffee', role:'hero',   available:true },
  { sku:'DR014', subcategory:'milk_tea',    role:'signature', available:true },
  { sku:'DR099', subcategory:'milk_tea',    role:'hero',   available:false }
];

// resolveFeatured: explicit list keeps only available; missing → derive hero/signature
assert.deepStrictEqual(S.resolveFeatured(['DR014','DR099','DR001'], MENU), ['DR014','DR001']);
const derived = S.resolveFeatured([], MENU);
assert.ok(derived.indexOf('DR003') !== -1 && derived.indexOf('DR014') !== -1);
assert.ok(derived.indexOf('DR099') === -1); // unavailable excluded

// dayPart boundaries
assert.strictEqual(S.dayPart(9), 'morning');
assert.strictEqual(S.dayPart(14), 'afternoon');
assert.strictEqual(S.dayPart(20), 'evening');

// buildQueue: announcement first when active; brand fallback when all off
const cfgOn = S.normalizeConfig({ featured:['DR014'], combos:[{items:['DR003','BK001'],price:50000}],
  announcement:{text:'Nghỉ lễ',active:true,until:''} });
const q = S.buildQueue(cfgOn, new Date('2026-06-11T09:00:00+07:00'), MENU);
assert.strictEqual(q[0].type, 'announcement');
assert.ok(q.some(s => s.type==='spotlight' && s.sku==='DR014'));
assert.ok(q.some(s => s.type==='combo'));

const allOff = S.normalizeConfig({ blocks:{ spotlight:false,promo:false,menu:false,video:false,qr:false,tem:false,combo:false,daypart:false } });
const qEmpty = S.buildQueue(allOff, new Date(), MENU);
assert.deepStrictEqual(qEmpty.map(s=>s.type), ['brand']);

// evening daypart puts video before menu
const cfgEve = S.normalizeConfig({ featured:['DR014'] });
const qe = S.buildQueue(cfgEve, new Date('2026-06-11T20:00:00+07:00'), MENU);
assert.ok(qe.findIndex(s=>s.type==='video') < qe.findIndex(s=>s.type==='menu'));
```

- [ ] **Step 2: Run to verify it fails**

Run: `node web/tools/test_signage.js`
Expected: FAIL — `S.resolveFeatured is not a function`.

- [ ] **Step 3: Implement** (add to `web/signage.js` above the export block; also extend the export list).

```js
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
```

Update the export block to:
```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { defaultConfig, normalizeConfig, resolveFeatured, dayPart, announcementActive, buildQueue };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node web/tools/test_signage.js`
Expected: `Task2 OK` … `Task3 OK` (add a `console.log('Task3 OK')` after the Task 3 asserts).

- [ ] **Step 5: Commit**

```bash
git add web/signage.js web/tools/test_signage.js
git commit -m "feat(signage): featured/daypart/queue logic with node tests"
```

---

## Task 4: Scene renderers + esc

**Files:**
- Modify: `web/signage.js`

Each renderer returns an HTML string for `#stage`, reusing the draft's classes. Owner-supplied strings (combo label, announcement text) pass through `esc()`. The reveal classes (`r`, `--d` delays) are applied so the cascade plays each time a scene mounts.

- [ ] **Step 1: Add `esc()` and renderers** to `web/signage.js` (above export). `fmt()` formats VND.

```js
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function fmt(n){return Number(n||0).toLocaleString('vi-VN')+'đ';}
function fmtK(n){return Math.round(Number(n||0)/1000)+'k';}

// SVG cup fallbacks (no photos yet). Returns an <svg> string by category.
function cupSvg(cat){
  if (cat==='milk_tea'||cat==='fruit_tea') return '<svg class="sp-cup r" style="--d:.5s" viewBox="0 0 200 280" fill="none"><ellipse cx="100" cy="60" rx="62" ry="16" fill="#15485A" stroke="#E0A93F" stroke-width="2.6"/><rect x="116" y="6" width="9" height="70" rx="4" fill="#FF5E40" stroke="#08171c" stroke-width="1.5"/><path d="M40 92 L160 92 L146 250 Q145 264 131 264 L69 264 Q55 264 54 250 Z" fill="#2D5F6B" stroke="#E0A93F" stroke-width="2.8"/><ellipse cx="100" cy="92" rx="60" ry="15" fill="#488aa0" stroke="#E0A93F" stroke-width="2.6"/></svg>';
  return '<svg class="sp-cup r" style="--d:.5s" viewBox="0 0 200 280" fill="none"><ellipse cx="100" cy="60" rx="60" ry="15" fill="#15485A" stroke="#E0A93F" stroke-width="2.4"/><path d="M48 90 L152 90 L150 120 Q150 250 100 250 Q50 250 50 120 Z" fill="#3a2218" stroke="#E0A93F" stroke-width="2.6"/><path d="M50 175 L150 175 L148 210 Q120 230 100 230 Q80 230 52 210 Z" fill="#D8B877"/><ellipse cx="100" cy="90" rx="52" ry="12" fill="#5a3a28" stroke="#E0A93F" stroke-width="2"/></svg>';
}

function renderSpotlight(item){
  var img = item.image ? '<img class="sp-cup r" style="--d:.5s" src="'+esc(item.image)+'" alt="">' : cupSvg(item.subcategory);
  var jp = item.name_jp ? '<div class="sp-jp r" style="--d:.85s">'+esc(item.name_jp)+'</div>' : '';
  var story = item.story ? '<div class="sp-story r" style="--d:1.2s">'+esc(item.story)+'</div>' : '';
  var sizehint = item.price_l ? 'size M · L thêm '+fmt(item.price_l-item.price_m) : '';
  return '<section class="scene show"><div class="sp"><div class="sp-left"><div class="steam"><span></span><span></span><span></span></div>'+img+'</div>'
    +'<div class="sp-right"><div class="eyebrow r" style="--d:.7s"><span class="seal">推</span><span class="lbl">Món nên thử</span></div>'
    +jp+'<div class="sp-name r" style="--d:1s">'+esc(item.name)+'</div>'+story
    +'<div class="sp-pricewrap"><div class="pricetag r pop" style="--d:1.35s">'+fmt(item.price_m).replace('đ','')+'<span class="d">đ</span></div>'
    +(sizehint?'<span class="sizehint r" style="--d:1.5s">'+esc(sizehint)+'</span>':'')+'</div></div></div>'
    +'<div class="waveband r fade" style="--d:.35s">'+WAVE_BAND_SVG+'</div></section>';
}

function renderMenu(menu, categories){
  // up to 3 category columns, ~4 items each, available only
  var cats = categories.slice(0,3);
  var kanji = {phin_coffee:'珈',machine_coffee:'琲',milk_tea:'茶',fruit_tea:'果',blended:'氷',kissaten:'菓',pastry:'麭'};
  var cols = cats.map(function(c,i){
    var items = menu.filter(function(m){return m.available && m.subcategory===c.id;}).slice(0,4);
    var rows = items.map(function(m){var bdg=m.role==='hero'?'<span class="mtag hot">Bán chạy</span>':m.role==='signature'?'<span class="mtag sig">Đặc biệt</span>':''; return '<div class="mitem"><span class="nm">'+esc(m.name)+bdg+'</span><span class="ln"></span><span class="pr">'+fmtK(m.price_m)+'</span></div>';}).join('');
    return '<div class="mcol r" style="--d:'+(0.5+i*0.15)+'s"><div class="mcat"><span class="k">'+(kanji[c.id]||'品')+'</span><span class="n">'+esc(c.label)+'</span></div>'+rows+'</div>';
  }).join('');
  return '<section class="scene show"><div class="menu"><div class="menu-h r" style="--d:.3s"><div class="jp">お品書き</div><div class="vi">Thực đơn hôm nay</div></div><div class="menu-cols">'+cols+'</div></div></section>';
}

function renderCombo(combo, menu){
  var byId={}; menu.forEach(function(m){byId[m.sku]=m;});
  var its=(combo.items||[]).map(function(sku){return byId[sku];}).filter(Boolean);
  if (its.length<2) return renderBrand();
  var sum=its.reduce(function(s,m){return s+(m.price_m||0);},0);
  var save=sum-combo.price;
  var pct=sum>0?Math.round(save/sum*100):0;
  var seal=save>0?'<span class="save-seal">-'+fmtK(save)+'</span>':''; // triện tròn đỏ đè góc giá
  var cells=its.map(function(m,i){return '<div class="citem r" style="--d:'+(0.5+i*0.1)+'s">'+cupSvg(m.subcategory).replace('sp-cup','')+'<span class="nm">'+esc(m.name)+'</span><span class="op">'+fmt(m.price_m)+'</span></div>'+(i<its.length-1?'<div class="cplus r pop" style="--d:.7s">＋</div>':'');}).join('');
  return '<section class="scene show"><div class="combo"><div class="combo-badge r pop" style="--d:.3s">本日のセット · '+esc(combo.label||'Combo hôm nay')+'</div>'
    +'<div class="combo-row">'+cells+'<div class="cequals r pop" style="--d:.9s">＝</div><div class="cprice r pop" style="--d:1.05s">'+seal+fmt(combo.price).replace('đ','')+'<span class="d">đ</span></div></div>'
    +(save>0?'<div class="csave r" style="--d:1.2s">Tiết kiệm '+fmt(save)+(pct?' ('+pct+'%)':'')+' so với mua lẻ</div>':'')+'</div></section>';
}
```

Add this CSS to `signage.html` `<style>` (the seal is a coral disc overlapping the price's top-right):
```css
.cprice{position:relative;overflow:visible}
.save-seal{position:absolute;top:-2vh;right:-2vh;width:8vh;height:8vh;border-radius:50%;background:var(--seal);color:#fff;font-family:var(--jp);font-weight:900;font-size:2.4vh;display:flex;align-items:center;justify-content:center;transform:rotate(-12deg);box-shadow:.4vh .4vh 0 rgba(8,23,28,.4);border:2px dashed rgba(255,255,255,.6)}

function renderTem(){
  var slots='';
  for(var i=1;i<=10;i++){ slots += i<=7 ? '<span class="stamp on">茶</span>' : (i===10?'<span class="stamp free">無</span>':'<span class="stamp">'+i+'</span>'); }
  return '<section class="scene show"><div class="tem"><div class="tem-h r" style="--d:.3s">スタンプカード · THẺ TÍCH TEM</div>'
    +'<div class="tem-big r" style="--d:.45s">Đủ <b>10 tem</b> = <b>1 ly miễn phí</b></div>'
    +'<div class="tem-card r pop" style="--d:.6s">'+slots+'</div>'
    +'<div class="tem-steps r" style="--d:1.1s">Mỗi ly nước mua = <b>1 tem</b> · đọc số điện thoại khi đặt để tích.<br>Đủ 10 tem → nhắc nhân viên đổi <b>1 ly miễn phí</b>.</div></div></section>';
}

function renderVideo(youtubeId, leftItem, rightItem){
  var side=function(it,delay,extra){ if(!it) return '<div class="vside">'+WAVE_SIDE_SVG+'</div>';
    return '<div class="vside">'+WAVE_SIDE_SVG+cupSvg(it.subcategory).replace('sp-cup','vcup'+(extra||''))+'<div class="vcaption r" style="--d:'+delay+'s">'+esc(it.name)+'<span class="p">'+fmt(it.price_m)+'</span></div></div>'; };
  return '<section class="scene show"><div class="vid">'+side(leftItem,0.9)
    +'<div class="vcenter"><div class="vframe r pop" style="--d:.4s"><iframe src="https://www.youtube-nocookie.com/embed/'+encodeURIComponent(youtubeId)+'?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&modestbranding=1&loop=1&playlist='+encodeURIComponent(youtubeId)+'" allow="autoplay; encrypted-media" frameborder="0"></iframe></div>'
    +'<div class="vtitle r" style="--d:.7s">かえるの物語<span class="s">Câu chuyện của Kaeru</span></div></div>'
    +side(rightItem,1,' two')+'</div></section>';
}

function renderAnnouncement(text){
  return '<section class="scene show"><div class="combo"><div class="combo-badge r pop" style="--d:.3s">お知らせ · THÔNG BÁO</div><div class="sp-name r" style="--d:.5s;text-align:center;max-width:80vw">'+esc(text)+'</div></div></section>';
}

function renderBrand(){
  return '<section class="scene show"><div class="combo"><div class="sp-name r" style="--d:.4s;text-align:center">KaeruKàphê</div><div class="sp-story r" style="--d:.7s;text-align:center">お茶の心を、ふるさとへ。</div></div></section>';
}

var WAVE_BAND_SVG = '<svg viewBox="0 0 1440 200" preserveAspectRatio="none"><path d="M0 120 Q120 70 240 110 T480 110 T720 110 T960 110 T1200 110 T1440 110 L1440 200 L0 200 Z" fill="#07232c"/><path d="M0 140 Q120 100 240 132 T480 132 T720 132 T960 132 T1200 132 T1440 132 L1440 200 L0 200 Z" fill="#0c2e38"/></svg><svg class="b" viewBox="0 0 1440 200" preserveAspectRatio="none"><path d="M0 150 Q160 110 320 144 T640 144 T960 144 T1280 144 T1600 144 L1600 200 L0 200 Z" fill="#15384a"/></svg>';
var WAVE_SIDE_SVG = '<div class="wavewrap r fade" style="--d:.2s"><svg viewBox="0 0 240 600" preserveAspectRatio="xMidYMax slice" fill="none"><path d="M0 600 L240 600 L240 300 Q160 250 230 180 Q120 230 110 130 Q150 70 60 40 Q110 130 0 170 Z" fill="#0c2e38"/><path d="M0 600 L240 600 L240 420 Q150 380 210 300 Q110 360 70 270 Q40 360 0 350 Z" fill="#15384a"/><g fill="#FCF7EC" opacity=".6"><circle cx="60" cy="42" r="7"/><circle cx="110" cy="132" r="6"/><circle cx="230" cy="182" r="6"/></g></svg></div>';
```

Add the `vcup` styling note: `.vframe iframe{width:100%;height:100%;border:0}` — append this one rule to the `<style>` in `signage.html` (the draft used a placeholder `.ph`; the real video uses an `<iframe>`).

- [ ] **Step 2: Smoke-test renderers under Node** (append to `web/tools/test_signage.js`)

```js
// --- Task 4 --- renderers return strings, escape input
assert.ok(S.renderSpotlight({name:'Trà sữa',price_m:38000,subcategory:'milk_tea'}).indexOf('Trà sữa')!==-1);
assert.ok(S.renderAnnouncement('<script>x').indexOf('&lt;script&gt;')!==-1); // escaped
assert.ok(S.renderTem().indexOf('10 tem')!==-1);
console.log('Task4 OK');
```
Add the new renderers + `esc` to the export block.

- [ ] **Step 3: Run**

Run: `node web/tools/test_signage.js`
Expected: `Task4 OK`.

- [ ] **Step 4: Commit**

```bash
git add web/signage.js web/signage.html web/tools/test_signage.js
git commit -m "feat(signage): data-driven scene renderers + esc"
```

---

## Task 5: Rotation runtime + data layer + resilience

**Files:**
- Modify: `web/signage.js`

Browser-only runtime (guarded by `typeof window`). Renders from cache instantly, polls every 60s, rotates scenes, handles video duration, updates clock + promo countdown, auto-reloads at 4am.

- [ ] **Step 1: Append the runtime** to `web/signage.js` (after renderers, before export).

```js
if (typeof window !== 'undefined') (function () {
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec';
  var CACHE_KEY = 'lhk_signage_cfg', PROMO_KEY = 'lhk_signage_promo';
  var cfg = normalizeConfig(safeJSON(localStorage.getItem(CACHE_KEY)));
  var promo = safeJSON(localStorage.getItem(PROMO_KEY)) || { active: false };
  var queue = [], idx = -1, timer = null, RELOADED = false;

  function safeJSON(s){ try { return JSON.parse(s); } catch (e) { return null; } }
  function menu(){ return (typeof MENU_DATA !== 'undefined') ? MENU_DATA : []; }
  function cats(){ return (typeof CATEGORIES !== 'undefined') ? CATEGORIES : []; }

  function mountScene(d){
    var stage = document.getElementById('stage'), html;
    var byId = {}; menu().forEach(function(m){ byId[m.sku]=m; });
    if (d.type==='spotlight') html = renderSpotlight(byId[d.sku]||{name:'',price_m:0,subcategory:''});
    else if (d.type==='menu') html = renderMenu(menu(), cats());
    else if (d.type==='combo') html = renderCombo(d.combo, menu());
    else if (d.type==='tem') html = renderTem();
    else if (d.type==='video') html = renderVideo(cfg.video.youtube_id, menu().filter(function(m){return m.available&&m.subcategory==='milk_tea';})[0], menu().filter(function(m){return m.available&&m.subcategory==='phin_coffee';})[0]);
    else if (d.type==='announcement') html = renderAnnouncement(cfg.announcement.text);
    else html = renderBrand();
    stage.innerHTML = html;
    // video scene hides QR rail (it has side panels)
    document.getElementById('qrrail').style.display = (d.type==='video') ? 'none' : '';
    // replay cascade
    var tv = document.getElementById('tv'); tv.classList.remove('run'); void tv.offsetWidth; tv.classList.add('run');
    renderDots();
  }

  function renderDots(){
    var el = document.getElementById('dots'), h='';
    for (var i=0;i<queue.length;i++) h += '<i class="'+(i===idx?'on':'')+'"></i>';
    el.innerHTML = h;
  }

  function advance(){
    if (!queue.length) return;
    idx = (idx+1) % queue.length;
    var d = queue[idx];
    mountScene(d);
    clearTimeout(timer);
    var dwell = (d.type==='video') ? 45000 : cfg.rotateSeconds*1000;
    timer = setTimeout(advance, dwell);
  }

  function rebuild(){
    queue = buildQueue(cfg, new Date(), menu());
    idx = -1; advance();
  }

  function applyPromo(){
    var r = document.getElementById('ribbon');
    if (cfg.blocks.promo && promo && promo.active) {
      r.style.display=''; r.innerHTML = '十 '+esc(promo.message||'Ưu đãi')+' <b id="pc"></b>';
      tickCountdown();
    } else { r.style.display='none'; }
  }
  function tickCountdown(){
    var pc = document.getElementById('pc'); if (!pc || !promo.end) return;
    var ms = new Date(promo.end).getTime() - Date.now();
    if (ms <= 0) { promo.active=false; applyPromo(); return; }
    var m = Math.floor(ms/60000), s = Math.floor((ms%60000)/1000);
    pc.textContent = '· còn '+(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
  }

  function tickClock(){
    var d = new Date();
    document.getElementById('clock').textContent = (d.getHours()<10?'0':'')+d.getHours()+':'+(d.getMinutes()<10?'0':'')+d.getMinutes();
    var open = d.getHours()>=6 && d.getHours()<23;
    document.getElementById('open-txt').textContent = open ? 'Đang mở cửa' : 'Đã đóng cửa';
    if (d.getHours()===4 && !RELOADED) { RELOADED=true; location.reload(); }
  }

  function poll(){
    fetch(GAS_URL+'?action=signage_config').then(function(r){return r.json();}).then(function(j){
      if (j && j.ok && j.config) { cfg = normalizeConfig(j.config); localStorage.setItem(CACHE_KEY, JSON.stringify(j.config)); rebuild(); }
    }).catch(function(){});
    fetch(GAS_URL+'?action=promo_info').then(function(r){return r.json();}).then(function(j){
      if (j) { promo = j; localStorage.setItem(PROMO_KEY, JSON.stringify(j)); applyPromo(); }
    }).catch(function(){});
  }

  window.addEventListener('online', function(){ if (queue.length===0) location.reload(); });

  // boot: render from cache immediately, then poll
  rebuild(); applyPromo();
  tickClock(); setInterval(tickClock, 1000);
  setInterval(tickCountdown, 1000);
  poll(); setInterval(poll, 60000);
})();
```

Note: `promo_info` returns the existing shape used by `kaeru.html` (`{active, percent, message, end, ...}`); reuse those field names. If `promo_info` uses different keys, align `applyPromo`/`tickCountdown` to them (check `gas/Code.gs` `promo_info` handler).

- [ ] **Step 2: Verify in the browser** with a seeded cache (no GAS needed).

`preview_start "kaeru-web"`, `preview_resize 1280x720`, then `preview_eval`:
```js
localStorage.setItem('lhk_signage_cfg', JSON.stringify({featured:['DR014','DR003'],combos:[{items:['DR005','BK001'],price:50000}]}));
location.href='http://localhost:8082/signage.html';
```
Then `preview_screenshot` after ~2s. Expected: a spotlight scene cascades in; after `rotateSeconds` it advances; progress dots reflect queue length. `preview_console_logs level=error` → none.
Verify rotation: `preview_eval("document.querySelectorAll('#dots i').length")` → equals queue length (>1).

- [ ] **Step 3: Verify offline resilience** — `preview_eval` to block the network is not available; instead confirm boot renders from cache before any fetch by checking the stage is non-empty immediately:
```js
preview_eval: "document.getElementById('stage').children.length"  // expect >= 1
```

- [ ] **Step 4: Commit**

```bash
git add web/signage.js
git commit -m "feat(signage): rotation runtime + 60s poll + cache + countdown + 4am reload"
```

---

## Task 6: GAS — signage_config + set_signage

**Files:**
- Create: `gas/Signage.gs`
- Modify: `gas/Code.gs`

- [ ] **Step 1: Create `gas/Signage.gs`**

```js
/**
 * Signage.gs — cấu hình màn quảng cáo mặt tiền.
 * Lưu 1 ô JSON trong CONFIG (key SIGNAGE_CONFIG). Đọc public; ghi cần admin.
 */
function _defaultSignageConfig() {
  return {
    blocks: { spotlight: true, promo: true, menu: true, video: true, qr: true, tem: true, combo: true, daypart: true },
    featured: [], combos: [],
    announcement: { text: '', active: false, until: '' },
    video: { youtube_id: 'AQBbF4V4wRg' },
    rotateSeconds: 11
  };
}

/** Public read — màn signage poll cái này. */
function getSignageConfig() {
  var raw = getConfig('SIGNAGE_CONFIG');
  if (!raw) return { ok: true, config: _defaultSignageConfig() };
  try { return { ok: true, config: JSON.parse(raw) }; }
  catch (e) { logError('getSignageConfig.parse', e); return { ok: true, config: _defaultSignageConfig() }; }
}

/** Admin write — Dashboard tab "Màn hình" gọi. p.config = object. */
function setSignageConfig(p) {
  var cfg = p && p.config;
  if (!cfg || typeof cfg !== 'object') return { ok: false, error: 'config required' };
  cfg.updated_at = new Date().toISOString();
  setConfig('SIGNAGE_CONFIG', JSON.stringify(cfg));
  return { ok: true, updated_at: cfg.updated_at };
}
```

- [ ] **Step 2: Add routes** in `gas/Code.gs`.

In `doGet`, after the `payment_heartbeat`/`pending_print` block (public read, no token):
```js
    if (action === 'signage_config') {
      // Public: màn signage chỉ đọc dữ liệu marketing.
      return _jsonResponse(getSignageConfig());
    }
```
In `doPost`, after the `dispatcher_heartbeat` block:
```js
    if (payload && payload.action === 'set_signage') {
      if (!validateSessionToken(payload.token)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      if (!isDeviceApproved(payload.device_id)) return _jsonResponse({ ok: false, error: 'device_not_approved' });
      return _jsonResponse(setSignageConfig(payload));
    }
```

- [ ] **Step 3: Syntax-check locally** (cannot run GAS, but parse JS).

```bash
cp gas/Signage.gs /tmp/s.js && node --check /tmp/s.js && echo OK && rm /tmp/s.js
cp gas/Code.gs /tmp/c.js && node --check /tmp/c.js && echo OK && rm /tmp/c.js
```
Expected: `OK` twice.

- [ ] **Step 4: Manual deploy test** (documented for the operator; not run in this session).

After `clasp push` + redeploy:
```bash
curl "<GAS_URL>?action=signage_config"   # → {"ok":true,"config":{...}}
curl "<GAS_URL>" -d '{"action":"set_signage","config":{"rotateSeconds":9}}' -H "Content-Type: application/json"  # → unauthorized (no token)
```

- [ ] **Step 5: Commit**

```bash
git add gas/Signage.gs gas/Code.gs
git commit -m "feat(signage): GAS signage_config (public) + set_signage (admin)"
```

---

## Task 7: Dashboard "Màn hình" tab

**Files:**
- Modify: `web/dashboard.html`

Follow the existing tab pattern in `dashboard.html` (read it first: locate the tab nav, the panel container, the `gasPost`/`gasGet` helpers, and how `device_id`/session token are attached — mirror the `set_promo`/`promo_toggle` tab exactly).

- [ ] **Step 1: Read the existing tab system.**

Run: open `web/dashboard.html`; find (a) the tab button row, (b) one existing panel + its show/hide JS, (c) the auth helper that POSTs with `{token, device_id}`. Note the exact function names.

- [ ] **Step 2: Add the tab button + panel.** Insert a nav button `📺 Màn hình` and a panel:

```html
<div id="panel-signage" class="panel" style="display:none">
  <h3>📺 Màn hình quảng cáo</h3>
  <div id="sg-blocks"></div>
  <label>Món nổi bật (SKU, cách nhau dấu phẩy)</label>
  <input id="sg-featured" placeholder="DR014,DR003,DR005">
  <label>Combo: item SKUs + giá</label>
  <input id="sg-combo-items" placeholder="DR005,BK001">
  <input id="sg-combo-price" type="number" placeholder="50000">
  <label>Thông báo đột xuất</label>
  <input id="sg-ann-text" placeholder="Nghỉ lễ 30/4…">
  <label><input type="checkbox" id="sg-ann-active"> Bật thông báo</label>
  <label>Số giây mỗi cảnh</label>
  <input id="sg-rotate" type="number" value="11">
  <label><input type="checkbox" id="sg-daypart" checked> Đổi theo khung giờ</label>
  <label>YouTube ID video</label>
  <input id="sg-video" placeholder="AQBbF4V4wRg">
  <div style="margin-top:12px">
    <button onclick="signageSave()">Lưu</button>
    <a href="/signage" target="_blank">Xem trước ↗</a>
  </div>
</div>
```

- [ ] **Step 3: Add the JS** (place near other panel logic; reuse the existing auth-POST helper — shown here as `gasPost`, rename to match dashboard's actual helper):

```js
var SG_BLOCKS = ['spotlight','promo','menu','video','qr','tem','combo','daypart'];
function signageLoad(){
  fetch(GAS_URL+'?action=signage_config').then(function(r){return r.json();}).then(function(j){
    var c = (j&&j.config)||{}; c.blocks=c.blocks||{};
    document.getElementById('sg-blocks').innerHTML = SG_BLOCKS.map(function(b){
      return '<label><input type="checkbox" data-blk="'+b+'" '+(c.blocks[b]!==false?'checked':'')+'> '+b+'</label>';
    }).join(' ');
    document.getElementById('sg-featured').value = (c.featured||[]).join(',');
    var combo=(c.combos||[])[0]||{}; document.getElementById('sg-combo-items').value=(combo.items||[]).join(','); document.getElementById('sg-combo-price').value=combo.price||'';
    var a=c.announcement||{}; document.getElementById('sg-ann-text').value=a.text||''; document.getElementById('sg-ann-active').checked=!!a.active;
    document.getElementById('sg-rotate').value=c.rotateSeconds||11;
    document.getElementById('sg-daypart').checked=c.blocks.daypart!==false;
    document.getElementById('sg-video').value=(c.video&&c.video.youtube_id)||'';
  });
}
function signageSave(){
  var blocks={}; document.querySelectorAll('#sg-blocks input[data-blk]').forEach(function(i){blocks[i.getAttribute('data-blk')]=i.checked;});
  blocks.daypart = document.getElementById('sg-daypart').checked;
  var items=document.getElementById('sg-combo-items').value.split(',').map(function(s){return s.trim();}).filter(Boolean);
  var price=parseInt(document.getElementById('sg-combo-price').value,10);
  var config={ blocks:blocks,
    featured:document.getElementById('sg-featured').value.split(',').map(function(s){return s.trim();}).filter(Boolean),
    combos: (items.length>=2 && price) ? [{items:items,price:price,label:''}] : [],
    announcement:{text:document.getElementById('sg-ann-text').value, active:document.getElementById('sg-ann-active').checked, until:''},
    video:{youtube_id:document.getElementById('sg-video').value.trim()||'AQBbF4V4wRg'},
    rotateSeconds:parseInt(document.getElementById('sg-rotate').value,10)||11 };
  // gasPost = existing helper that adds {token, device_id} + POSTs JSON
  gasPost({action:'set_signage', config:config}).then(function(j){ alert(j.ok?'Đã lưu — màn cập nhật trong ~60s':'Lỗi: '+(j.error||'')); });
}
```
Wire `signageLoad()` into the tab's show handler (call it when the Màn hình tab is opened, like other tabs lazy-load).

- [ ] **Step 4: Verify in preview** (dashboard needs a token to save, but the form render + load is testable). `preview` navigate to `http://localhost:8082/dashboard.html`, open the Màn hình tab, `preview_screenshot`. Expected: 8 block checkboxes + inputs render; no console errors. (Saving requires a deployed GAS + session; verify in staging.)

- [ ] **Step 5: Commit**

```bash
git add web/dashboard.html
git commit -m "feat(signage): Dashboard 'Màn hình' control tab"
```

---

## Task 8: Worker noindex + cleanup + hardware runbook

**Files:**
- Modify: `src/index.js`
- Create: `docs/system/signage-hardware.md`
- Delete: `web/_signage_preview.html`

- [ ] **Step 1: Add signage to NOINDEX_PATHS** in `src/index.js` (do NOT add to control CSP — signage keeps its own YouTube-friendly `<meta>` CSP):

```js
const NOINDEX_PATHS = [
  '/dashboard.html', '/kds.html', '/camera.html',
  '/dashboard', '/kds', '/camera',
  '/signage.html', '/signage',
];
```
Confirm `/signage` is not listed among the control pages that receive `CONTROL_CSP` (it isn't — `NOINDEX_PATHS` only sets `X-Robots-Tag`; the CSP line in the worker is applied to the same list, so MOVE signage handling out: the worker currently sets BOTH `X-Robots-Tag` and CSP for every `NOINDEX_PATHS` entry). **Therefore:** keep a separate list. Change the worker so the strict `Content-Security-Policy` is applied only to the original control trio, while `X-Robots-Tag` applies to all noindex incl. signage:

```js
const CONTROL_PATHS = ['/dashboard.html','/kds.html','/camera.html','/dashboard','/kds','/camera'];
const NOINDEX_PATHS  = CONTROL_PATHS.concat(['/signage.html','/signage']);
// …
if (NOINDEX_PATHS.includes(url.pathname)) res.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
if (CONTROL_PATHS.includes(url.pathname)) res.headers.set('Content-Security-Policy', CONTROL_CSP);
```

- [ ] **Step 2: Verify the worker still serves signage with its own CSP** (local wrangler optional; minimally, lint):

```bash
cp src/index.js /tmp/i.js && node --check /tmp/i.js && echo OK && rm /tmp/i.js
```
Expected: `OK`. (Full check: after deploy, `curl -I https://kaerukaphe.workers.dev/signage` shows `x-robots-tag` and NOT the strict control CSP; the page's YouTube embed loads.)

- [ ] **Step 3: Write `docs/system/signage-hardware.md`** (Android-box kiosk runbook). Content: install Fully Kiosk Browser; Start URL `https://kaerukaphe.kaerukaphe.workers.dev/signage`; enable Start-on-boot, Keep-screen-on, Auto-reload-on-disconnect, Relaunch-on-crash, hide bars, screensaver off; TV HDMI-CEC on + sleep off + max brightness; optional smart-plug schedule; wifi (page is offline-tolerant).

- [ ] **Step 4: Delete the draft**

```bash
git rm web/_signage_preview.html
```

- [ ] **Step 5: Final verification** — run the full node test suite + render smoke:

```bash
node web/tools/test_signage.js   # → Task2 OK / Task3 OK / Task4 OK
```
Preview: navigate `/signage.html`, screenshot, confirm scenes rotate, no console errors.

- [ ] **Step 6: Commit**

```bash
git add src/index.js docs/system/signage-hardware.md
git commit -m "feat(signage): worker noindex route + hardware runbook; remove draft"
```

---

## Feedback revisions (v2) — incorporated

These refine earlier tasks. Apply each delta to the referenced task.

### R1 — Legibility CSS (Task 1 `<style>` additions)
Serif identity stays for big titles; small text gets weight + no italic; menu tags + combo seal styled on-brand.
```css
.sp-story{font-style:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.mitem .nm{font-weight:500}
.mitem .pr{font-weight:700}
.mtag{font-family:var(--body);font-size:1.4vh;font-weight:700;letter-spacing:.02em;padding:.2vh .8vh;border-radius:3px;margin-left:1vh;vertical-align:.2vh}
.mtag.hot{background:var(--coral);color:#fff}
.mtag.sig{background:rgba(224,169,63,.25);color:var(--gold-lt)}
.cprice{position:relative;overflow:visible}
.save-seal{position:absolute;top:-2vh;right:-2vh;width:8vh;height:8vh;border-radius:50%;background:var(--seal);color:#fff;font-family:var(--jp);font-weight:900;font-size:2.4vh;display:flex;align-items:center;justify-content:center;transform:rotate(-12deg);box-shadow:.4vh .4vh 0 rgba(8,23,28,.4);border:2px dashed rgba(255,255,255,.6)}
```

### R2 — Real scannable QR (replaces the decorative CSS QR)
The draft `.qr` was decorative stripes — not scannable, which defeats the street-scan goal. Generate a real QR and enlarge it.

Pre-step (run once, commit the PNG):
```bash
cd qr && python3 generate_qr.py --base-url https://kaerukaphe.kaerukaphe.workers.dev/ --tables 0
cp qr/labels/takeaway.png ../web/img/qr-order.png   # generate_qr.py makes takeaway.png = base URL, no table param
```
In `web/signage.html`, replace the decorative QR block with a real image + bigger rail + pulsing scan border + CTA:
```html
<div class="qrrail" id="qrrail">
  <img class="qr" src="img/qr-order.png" alt="QR đặt món">
  <div class="qtxt">Quét đặt món</div><div class="qsub">miễn xếp hàng</div>
</div>
```
CSS (override the draft's `.qr`/`.qrrail`):
```css
.qrrail{right:3.4vh;bottom:3.4vh;padding:2vh;position:absolute}
.qr{width:17vh;height:17vh;border-radius:6px;background:#fff;padding:1vh;object-fit:contain}
.qr::before,.qr::after{content:none}
.qrrail::before{content:'';position:absolute;inset:-.6vh;border:2px solid var(--coral);border-radius:9px;animation:qpulse 1.8s ease-in-out infinite;pointer-events:none}
@keyframes qpulse{0%,100%{opacity:.25;transform:scale(1)}50%{opacity:.9;transform:scale(1.03)}}
.qrrail .qtxt{font-size:2.1vh}
```
Verify: open `/signage.html`, scan `img/qr-order.png` with a phone → lands on the order page. Add this to Task 8 Step 5 verification.

### R3 — Mascot in brand + tem (light version; per-stamp jump deferred to phase 2)
`web/kaeru-mascot.webp` already exists. Update `renderBrand` (Task 4) to:
```js
function renderBrand(){
  return '<section class="scene show"><div class="combo"><img class="brand-frog r" style="--d:.3s" src="kaeru-mascot.webp" alt=""><div class="sp-name r" style="--d:.6s;text-align:center">KaeruKàphê</div><div class="sp-story r" style="--d:.9s;text-align:center;font-style:normal">お茶の心を、ふるさとへ。</div></div></section>';
}
```
Append to `renderTem`'s outer `.tem` div a corner frog: add `<img class="tem-frog r" style="--d:.9s" src="kaeru-mascot.webp" alt="">` just before `</div></section>`.
CSS:
```css
.brand-frog{width:30vh;height:auto;display:block;margin:0 auto 2vh;animation:bow 5s ease-in-out infinite}
@keyframes bow{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-1.4vh) rotate(1deg)}}
.tem-frog{position:absolute;right:4vh;bottom:4vh;width:16vh;height:auto;opacity:.9;animation:bow 6s ease-in-out infinite}
.tem{position:relative}
```

### R4 — Video offline fallback (Task 5 `mountScene`)
Replace the video branch in `mountScene` with a network guard:
```js
    else if (d.type==='video') {
      if (!navigator.onLine || !cfg.video.youtube_id) { html = renderBrand(); }
      else html = renderVideo(cfg.video.youtube_id, menu().filter(function(m){return m.available&&m.subcategory==='milk_tea';})[0], menu().filter(function(m){return m.available&&m.subcategory==='phin_coffee';})[0]);
    }
```

### R5 — NEW Task 4b: Day/Night theme (anti-glare)
**Why:** a street-facing TV behind glass acts as a mirror in daylight; the dark ukiyo-e palette is unreadable then. Day = light washi + dark ink (kills glare); Night = current deep-indigo glow.

**This is the largest single addition** because scene colors are currently hardcoded in SVG `fill=` attributes. The fix is to route theme-sensitive colors through CSS variables (inline SVG supports `fill="var(--x)"`), then swap the variable set with a `.day`/`.night` class on `#tv`.

**Files:** Modify `web/signage.html` (palettes), `web/signage.js` (SVG constants use vars + `applyTheme` runtime + config `theme`), and the config schema in Tasks 2/6/7.

- [ ] **Step 1 — config `theme` field.** Add `theme: 'auto'` to `defaultConfig()` (Task 2), `_defaultSignageConfig()` (Task 6), and the dashboard form (Task 7) as a select `auto | day | night`. In `normalizeConfig`, carry it: `theme: (['auto','day','night'].indexOf(raw.theme)>=0?raw.theme:'auto')`. Update the Task 2 node test to assert the default is `'auto'` and junk falls back to `'auto'`.

- [ ] **Step 2 — parameterize theme colors.** In `web/signage.html` define theme variables on `.tv.night` (current values) and `.tv.day`:
```css
.tv.night{--bg1:#2a6e80;--bg2:#15485A;--bg3:#0D3340;--bg4:#07232c;--ink:#FCF7EC;--ink-dim:#e2d8c2;--wave1:#07232c;--wave2:#0c2e38;--wave3:#15384a;--sun-a:rgba(255,94,64,.55);--sun-b:rgba(255,94,64,.28)}
.tv.day{--bg1:#FCF7EC;--bg2:#F3EAD6;--bg3:#E9DCC0;--bg4:#DFCEAA;--ink:#0D3340;--ink-dim:#3a5b66;--wave1:#cdb98c;--wave2:#b9d3d6;--wave3:#9fc0c4;--sun-a:rgba(224,140,90,.30);--sun-b:rgba(224,169,63,.18)}
.tv{background:radial-gradient(125% 95% at 50% -12%,var(--bg1) 0%,var(--bg2) 34%,var(--bg3) 68%,var(--bg4) 100%)}
.tv .sun{background:radial-gradient(circle,var(--sun-a) 0%,var(--sun-b) 34%,transparent 74%)}
```
Then change the draft's hardcoded text/background uses from `--cream`/`--indigo` to `--ink`/`--bg3` (search-replace within the scene CSS: `var(--cream)`→`var(--ink)`, `var(--cream-dim)`→`var(--ink-dim)`). Keep `--coral`, `--gold`, `--gold-lt`, `--seal` unchanged (they read on both grounds).

- [ ] **Step 3 — SVG fills via vars.** In `web/signage.js`, change `WAVE_BAND_SVG`/`WAVE_SIDE_SVG` fills `#07232c`→`var(--wave1)`, `#0c2e38`→`var(--wave2)`, `#15384a`→`var(--wave3)`. Cup teal/coffee fills may stay (they read on both); foam circles stay `#FCF7EC` (or `var(--ink)` if you want them dark on day — prefer keeping cream foam for contrast on day's lighter waves → use `var(--wave-foam)` = night `#FCF7EC`, day `#0D3340`).

- [ ] **Step 4 — runtime switch.** Add to the runtime IIFE (Task 5) and call in boot + `tickClock`:
```js
function applyTheme(){
  var m = cfg.theme||'auto', h = new Date().getHours();
  var day = (m==='day') || (m==='auto' && h>=6 && h<18); // 6:00–18:00 = day
  var tv = document.getElementById('tv');
  tv.classList.toggle('day', day); tv.classList.toggle('night', !day);
}
```
Call `applyTheme()` once at boot, inside `tickClock()` (cheap, keeps it correct across the 18:00 flip), and after each `poll()` config update.

- [ ] **Step 5 — verify both themes.** preview `preview_resize 1280x720`; force day: `preview_eval("document.getElementById('tv').className='tv day';")` → screenshot (light washi, dark ink, readable). Force night → screenshot (current look). Confirm coral/gold accents legible in both.

- [ ] **Step 6 — commit**
```bash
git add web/signage.html web/signage.js web/tools/test_signage.js
git commit -m "feat(signage): day/night anti-glare theme (auto by hour + config)"
```

> Phasing option: if you want to ship sooner, R5 can be a fast-follow — launch night-only first, add the day theme next. Everything else (R1–R4) ships with v1.

## Self-Review

**Spec coverage:**
- Orientation 16:9 / frame → Task 1. ✓
- 8 blocks (spotlight, promo, menu, video, qr, tem, combo, daypart) → renderers Task 4, queue Task 3, overlay/promo Task 5. ✓
- Spotlight typographic/mascot + `image` field → `renderSpotlight` (cupSvg fallback + image). ✓
- Video center + ukiyo-e wave panels + cups → `renderVideo` + `WAVE_SIDE_SVG`. ✓
- Tem = 10 → `renderTem` (10 slots, slot 10 reward). ✓
- Daypart → Task 3. ✓ Cascade reveal → reuse draft classes + `mountScene` replay. ✓
- Data: menu-data + poll promo_info + signage_config + localStorage cache + resilience + 4am reload → Task 5. ✓
- GAS signage_config/set_signage + default + CONFIG JSON → Task 6. ✓
- Dashboard tab → Task 7. ✓
- Worker noindex + YouTube CSP → Task 8. ✓
- Hardware runbook → Task 8. ✓
- **(v2) Day/Night anti-glare theme** → Task 4b (R5). ✓
- **(v2) Real scannable QR + pulse + CTA** → R2 (+Task 8 verify). ✓
- **(v2) Legibility: no italic, bold menu/price, on-brand tags** → R1. ✓
- **(v2) Combo savings seal + best-seller menu badges** → renderCombo/renderMenu edits + R1 CSS. ✓
- **(v2) Story 2-line clamp** → R1 CSS. ✓
- **(v2) Mascot in brand/tem** → R3. ✓
- **(v2) Video loop=1&playlist + offline→mascot fallback** → renderVideo + R4. ✓

**Placeholder scan:** No TBD/TODO; all steps have runnable commands or complete code. The one external reference ("paste the `<style>` from the draft") points to a committed file on this branch — acceptable since re-typing ~250 lines of verbatim CSS would be error-prone; the draft is the source of truth.

**Type consistency:** `normalizeConfig`/`defaultConfig`/`buildQueue`/`resolveFeatured`/`dayPart`/`announcementActive`/`esc`/renderers are exported in Task 2–4 and consumed in Task 5 with matching names. Config keys (`blocks`, `featured`, `combos`, `announcement`, `video.youtube_id`, `rotateSeconds`, `theme`) are identical across signage.js, GAS `_defaultSignageConfig`, and the Dashboard form — note `theme` is added by R5 to all three; keep them in sync. Scene `type` strings match between `buildQueue` and `mountScene`.

**Open verification items (cannot run here, flagged for operator):** GAS deploy + curl tests (Task 6 Step 4), dashboard save with real session token (Task 7 Step 4), worker CSP header after deploy (Task 8 Step 2), and real Android-box smoke. `promo_info` field names must be confirmed against `gas/Code.gs` during Task 5.
