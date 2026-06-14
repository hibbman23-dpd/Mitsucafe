# Signage Customization Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the front-of-house signage from a fixed block-toggle config into a phone-friendly "scene list" Studio in the Dashboard — reorderable scenes, per-scene duration, dish-picker, image upload (Cloudflare R2), live preview — while keeping the running display backward-compatible.

**Architecture:** Config stays a single JSON blob in CONFIG (`SIGNAGE_CONFIG`) but moves to a v2 `scenes[]` schema (ordered array, each scene `{id,type,enabled,duration,...}`). `signage.js` renders the queue in explicit order (no daypart sort) and migrates v1 configs on read. A new `image` scene type displays an uploaded photo; uploads go to Cloudflare R2 via the internal `kaeru-ops` Worker (behind Access) and are served publicly from the `kaerukaphe` Worker at a stable `/sig-img/<key>` URL.

**Tech Stack:** Vanilla JS (`web/signage.js`, `web/dashboard.html`), Google Apps Script (`gas/Signage.gs`), Cloudflare Workers (`src/index.js`, `src/ops.js`) + R2, `wrangler`. Node's built-in `node:test` runner for `signage.js` pure-function tests.

**Spec:** `docs/superpowers/specs/2026-06-14-signage-studio-design.md`

---

## Pre-flight context (read before starting)

**Repo realities:**
- **No package.json, no installed test framework.** BUT `web/signage.js` ends with a CommonJS `module.exports` of its pure functions, and the browser runtime is guarded by `if (typeof window !== 'undefined')`. So Node can `require('../web/signage.js')` safely and we test the pure logic with the **built-in** `node:test` + `node:assert` (no install). Run with `node --test`. This is real TDD for Tasks 1.
- Browser-only runtime code (the IIFE) and the Dashboard UI are verified in the **browser preview** (`preview_*` tools), not Node.
- **GAS** can't run locally; `gas/Signage.gs` change is tiny and verified by reading + `node --check` on a copy.
- **Two Cloudflare Workers** share `web/` assets: public `kaerukaphe` (`wrangler.jsonc`, `src/index.js`) and internal `kaeru-ops` (`wrangler.ops.jsonc`, `src/ops.js`). CI deploys BOTH on push to `main`. `src/index.js` already 404s `/dashboard /kds /camera` via `BLOCKED_PATHS` — do NOT block `/sig-img/`.
- **Deploy = manual for R2 setup** (`wrangler r2 bucket create`, secrets) then CI for code. Push to `main` is blocked → integrate via PR.

**Scene schema (locked — use these exact names everywhere):**
```jsonc
// config v2
{ "version": 2,
  "scenes": [ /* Scene[] in display order */ ],
  "theme": "auto",          // 'auto' | 'day' | 'night'
  "promoRibbon": true }

// Scene = { id, type, enabled, duration, ...typeFields }
//   type 'spotlight'    → sku:string
//   type 'image'        → image:string(URL), caption?:string
//   type 'video'        → youtube_id:string
//   type 'combo'        → items:string[], price:number, label?:string
//   type 'announcement' → text:string, until?:string(ISO)
//   type 'menu' | 'tem' | 'brand' → (no extra fields)
```
`duration` = seconds (number, min 5). `id` = unique short string.

---

## Task 1: `signage.js` v2 schema, migration, queue, renderImage (pure logic — TDD)

**Files:**
- Modify: `web/signage.js` (pure functions section + exports)
- Create: `web/signage.test.js` (Node test, run with `node --test`)

- [ ] **Step 1: Write failing tests for v2 normalize + migration + queue + renderImage**

Create `web/signage.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test web/signage.test.js`
Expected: FAIL — `S.renderImage is not a function`, migration/normalize assertions fail (v1 schema still returned).

- [ ] **Step 3: Rewrite the pure-logic functions in `web/signage.js`**

Replace `defaultConfig`, `normalizeConfig`, and add `migrateV1` + `renderImage`; replace `buildQueue`. The current `defaultConfig`/`normalizeConfig`/`buildQueue`/`resolveFeatured`/`dayPart`/`DAYPART_PRIORITY` (top of file) become:

```javascript
function defaultConfig() {
  return { version: 2, scenes: [], theme: 'auto', promoRibbon: true };
}

var SCENE_TYPES = ['spotlight','image','video','menu','combo','tem','announcement','brand'];

function clampDuration(d, fallback) {
  var n = parseInt(d, 10);
  if (isNaN(n) || n < 5) return (fallback && fallback >= 5) ? fallback : 11;
  return n;
}

// One-way migrate old v1 config (blocks/featured/combos/announcement/video/rotateSeconds) → v2 scenes[].
function migrateV1(raw) {
  var d = defaultConfig();
  var blocks = (raw && raw.blocks) || {};
  var dur = clampDuration(raw && raw.rotateSeconds, 11);
  var scenes = [];
  var n = 0;
  function add(s) { s.id = 'm' + (++n); s.enabled = true; if (!s.duration) s.duration = dur; scenes.push(s); }
  var ann = (raw && raw.announcement) || {};
  if (blocks.announcement !== false && ann.active && ann.text) add({ type: 'announcement', text: ann.text, until: ann.until || '' });
  if (blocks.spotlight !== false && Array.isArray(raw && raw.featured)) raw.featured.forEach(function (sku) { if (sku) add({ type: 'spotlight', sku: sku }); });
  if (blocks.menu !== false) add({ type: 'menu' });
  var combo = (raw && raw.combos && raw.combos[0]) || null;
  if (blocks.combo !== false && combo && Array.isArray(combo.items) && combo.items.length >= 2 && combo.price) add({ type: 'combo', items: combo.items.slice(), price: combo.price, label: combo.label || '' });
  if (blocks.tem !== false) add({ type: 'tem' });
  var yt = raw && raw.video && raw.video.youtube_id;
  if (blocks.video !== false && yt) add({ type: 'video', youtube_id: yt, duration: 45 });
  d.scenes = scenes;
  d.theme = (['auto','day','night'].indexOf(raw && raw.theme) >= 0) ? raw.theme : 'auto';
  d.promoRibbon = (raw && raw.blocks && raw.blocks.promo === false) ? false : true;
  return d;
}

function normalizeScene(s, i) {
  if (!s || typeof s !== 'object' || SCENE_TYPES.indexOf(s.type) < 0) return null;
  var out = { id: String(s.id || ('s' + i)), type: s.type, enabled: s.enabled !== false, duration: clampDuration(s.duration, 11) };
  if (s.type === 'spotlight') out.sku = String(s.sku || '');
  if (s.type === 'image') { out.image = String(s.image || ''); out.caption = String(s.caption || ''); }
  if (s.type === 'video') out.youtube_id = String(s.youtube_id || '');
  if (s.type === 'announcement') { out.text = String(s.text || ''); out.until = String(s.until || ''); }
  if (s.type === 'combo') { out.items = Array.isArray(s.items) ? s.items.slice() : []; out.price = parseInt(s.price, 10) || 0; out.label = String(s.label || ''); }
  return out;
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultConfig();
  if (raw.version !== 2) return migrateV1(raw); // old schema
  var d = defaultConfig();
  d.scenes = (Array.isArray(raw.scenes) ? raw.scenes : []).map(normalizeScene).filter(Boolean);
  d.theme = (['auto','day','night'].indexOf(raw.theme) >= 0) ? raw.theme : 'auto';
  d.promoRibbon = raw.promoRibbon !== false;
  return d;
}

function buildQueue(config, now, menu) {
  var byId = {}; (menu || []).forEach(function (m) { byId[m.sku] = m; });
  var q = (config.scenes || []).filter(function (s) {
    if (!s.enabled) return false;
    if (s.type === 'spotlight') return byId[s.sku] && byId[s.sku].available;
    if (s.type === 'image') return !!s.image;
    if (s.type === 'video') return !!s.youtube_id;
    if (s.type === 'announcement') return !!s.text;
    if (s.type === 'combo') return (s.items || []).length >= 2 && s.price > 0;
    return true; // menu, tem, brand
  });
  if (!q.length) return [{ type: 'brand', duration: 11 }];
  return q;
}
```

> Note: `dayPart`, `DAYPART_PRIORITY`, `resolveFeatured`, `announcementActive` are no longer used by the queue. Remove `DAYPART_PRIORITY` and `resolveFeatured`. Keep `dayPart` ONLY if still referenced elsewhere (it isn't after this change — remove it). Keep `esc`, `fmt`, `fmtK`, `cupSvg`, and all `render*` functions.

- [ ] **Step 4: Add `renderImage` next to the other scene renderers**

After `renderAnnouncement` in `web/signage.js`, add:

```javascript
function renderImage(scene){
  var cap = scene.caption ? '<div class="img-cap r" style="--d:.6s">'+esc(scene.caption)+'</div>' : '';
  return '<section class="scene show"><div class="imgscene">'
    + '<img class="imgfull r fade" style="--d:.2s" src="'+esc(scene.image)+'" alt="" '
    + 'onerror="this.closest(\'.scene\').outerHTML=window.__renderBrand?window.__renderBrand():\'\'">'
    + cap + '</div></section>';
}
```

> The `onerror` swaps in the brand scene. Expose the brand renderer on window in Task 2's runtime so `__renderBrand` exists; in Node tests it's never executed so it's fine.

- [ ] **Step 5: Update the CommonJS export list**

In `web/signage.js`, replace the `module.exports = {...}` to drop removed fns and add new ones:

```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { defaultConfig: defaultConfig, normalizeConfig: normalizeConfig, migrateV1: migrateV1, clampDuration: clampDuration, buildQueue: buildQueue, esc: esc, renderSpotlight: renderSpotlight, renderMenu: renderMenu, renderCombo: renderCombo, renderTem: renderTem, renderVideo: renderVideo, renderAnnouncement: renderAnnouncement, renderImage: renderImage, renderBrand: renderBrand };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test web/signage.test.js`
Expected: PASS — all tests green (9 passing).

- [ ] **Step 7: Add minimal CSS for the image scene**

In `web/signage.html`, inside the existing `<style>` block (search for `.scene` rules), add:

```css
.imgscene{position:absolute;inset:0;width:100%;height:100%}
.imgfull{width:100%;height:100%;object-fit:cover}
.img-cap{position:absolute;left:0;right:0;bottom:0;padding:24px 32px;font-size:2.2vw;font-weight:700;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.65))}
```

- [ ] **Step 8: Commit**

```bash
git add web/signage.js web/signage.test.js web/signage.html
git commit -m "feat(signage): v2 scene-list schema + v1 migration + image scene (Node-tested)"
```

---

## Task 2: `signage.js` runtime + preview mode (browser)

**Files:**
- Modify: `web/signage.js` (the `if (typeof window !== 'undefined')` IIFE)
- Modify: `web/signage.html` (bump `signage.js?v=`)

- [ ] **Step 1: Update `mountScene` for image + per-scene duration + expose brand**

In the IIFE in `web/signage.js`, inside `mountScene(d)`, add an `image` branch and expose the brand renderer. Replace the renderer-selection chain so it includes:

```javascript
    } else if (d.type === 'announcement') {
      html = renderAnnouncement(cfg.announcement ? cfg.announcement.text : d.text);
    } else if (d.type === 'image') {
      html = renderImage(d);
    } else {
      html = renderBrand();
    }
```

Note: `announcement` text now lives on the scene (`d.text`), not `cfg.announcement`. Use `d.text`:

```javascript
    } else if (d.type === 'announcement') {
      html = renderAnnouncement(d.text);
```

Near the top of the IIFE (after `var GAS_URL = ...`), expose brand for the image onerror fallback:

```javascript
  window.__renderBrand = renderBrand;
```

Also `combo` and `video` scenes now read fields off the scene `d` (not cfg). Update those branches:

```javascript
    } else if (d.type === 'combo') {
      html = renderCombo({ items: d.items, price: d.price, label: d.label }, menuData());
    } else if (d.type === 'video') {
      if (!navigator.onLine || !d.youtube_id) { html = renderBrand(); }
      else { html = renderVideo(d.youtube_id,
        menuData().filter(function (m) { return m.available && m.subcategory === 'milk_tea'; })[0],
        menuData().filter(function (m) { return m.available && m.subcategory === 'phin_coffee'; })[0]); }
```

- [ ] **Step 2: Per-scene dwell in `advance()`**

In the IIFE `advance()`, replace the dwell calculation:

```javascript
    var dwell = (d.duration && d.duration >= 5 ? d.duration : 11) * 1000;
    timer = setTimeout(advance, dwell);
```

(Remove the old `(d.type === 'video') ? 45000 : cfg.rotateSeconds * 1000` line — video duration now comes from the scene.)

- [ ] **Step 3: Ribbon honors `promoRibbon`**

In `applyPromo()`, change the gate from `cfg.blocks.promo` to `cfg.promoRibbon`:

```javascript
    if (cfg.promoRibbon && promo && promo.active) {
```

- [ ] **Step 4: Add preview mode (Studio iframe drives one scene via postMessage)**

At the very start of the IIFE body (right after `var GAS_URL = ...; window.__renderBrand = renderBrand;`), add:

```javascript
  var params = new URLSearchParams(location.search);
  if (params.get('preview') === '1') {
    // Studio preview: render a single scene sent by parent; no polling, no auto-rotate.
    window.addEventListener('message', function (e) {
      if (!e.data || e.data.kind !== 'signage-preview') return;
      var scene = e.data.scene || { type: 'brand', duration: 11 };
      cfg = normalizeConfig({ version: 2, scenes: [scene], theme: e.data.theme || 'auto', promoRibbon: false });
      applyTheme();
      queue = buildQueue(cfg, new Date(), menuData());
      idx = -1;
      // advance once but do not schedule the next tick
      if (queue.length) { idx = 0; mountScene(queue[0]); clearTimeout(timer); }
    });
    applyTheme();
    tickClock(); setInterval(tickClock, 1000);
    return; // skip the normal boot/poll path below
  }
```

> This sits before the normal `applyTheme(); rebuild(); ... poll();` boot lines so preview mode short-circuits them.

- [ ] **Step 5: Bump the asset version**

In `web/signage.html` line ~208, change `signage.js?v=20260611d` → `signage.js?v=20260614a`.

- [ ] **Step 6: Verify in browser preview (normal mode)**

Start preview (`preview_start`). Open `/signage`. With `preview_eval`, confirm the v2 path renders without errors and an image scene works:

```javascript
// inject a v2 config directly into the running page's cfg and rebuild
(function(){
  // grab the module's normalizeConfig via a fresh fetch is not needed; test renderImage exists in DOM scope:
  return typeof renderImage + ' | ' + typeof buildQueue;
})()
```
Expected: `"function | function"`. Then check `preview_console_logs` → no errors.

- [ ] **Step 7: Verify preview mode renders a single scene**

`preview_eval` (simulate the Studio parent posting a scene — same-window post works for the listener):

```javascript
window.postMessage({ kind:'signage-preview', theme:'day', scene:{ id:'p', type:'image', enabled:true, duration:8, image:'https://via.placeholder.com/600x400', caption:'Test' } }, '*');
new Promise(r=>setTimeout(()=>r(document.getElementById('stage').innerHTML.includes('imgfull')),300));
```
Expected: `true` (the image scene mounted). Note: this only works if the page was opened with `?preview=1`; open `/signage?preview=1` first via `preview_eval` `window.location.href='/signage?preview=1'`.

- [ ] **Step 8: Commit**

```bash
git add web/signage.js web/signage.html
git commit -m "feat(signage): runtime renders v2 scenes (image, per-scene duration) + Studio preview mode"
```

---

## Task 3: `gas/Signage.gs` default config → v2

**Files:**
- Modify: `gas/Signage.gs` (`_defaultSignageConfig`)

- [ ] **Step 1: Update the default to v2 shape**

In `gas/Signage.gs`, replace `_defaultSignageConfig`:

```javascript
function _defaultSignageConfig() {
  return {
    version: 2,
    scenes: [
      { id: 'd1', type: 'menu', enabled: true, duration: 11 },
      { id: 'd2', type: 'tem',  enabled: true, duration: 11 },
      { id: 'd3', type: 'brand', enabled: true, duration: 11 }
    ],
    theme: 'auto',
    promoRibbon: true
  };
}
```

> `getSignageConfig`/`setSignageConfig` are unchanged — they store/return whatever JSON they're given. The front-end's `normalizeConfig` migrates any old stored value on read, so existing deployments keep working until the owner saves once.

- [ ] **Step 2: Syntax check (GAS can't run locally)**

Run: `cp gas/Signage.gs /tmp/sg.js && node --check /tmp/sg.js && echo OK && rm /tmp/sg.js`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add gas/Signage.gs
git commit -m "feat(gas,signage): default SIGNAGE_CONFIG to v2 scene-list shape"
```

---

## Task 4: Cloudflare R2 image pipeline (bindings + upload/serve/delete routes)

**Files:**
- Modify: `wrangler.jsonc` (R2 binding for public worker)
- Modify: `wrangler.ops.jsonc` (R2 binding for ops worker)
- Modify: `src/index.js` (public: `GET /sig-img/<key>`)
- Modify: `src/ops.js` (internal: `POST /sig-img`, `DELETE /sig-img/<key>`)

> **Manual prerequisite (the engineer runs once, needs Cloudflare auth):**
> ```bash
> npx wrangler r2 bucket create kaeru-signage-img
> ```
> If R2 isn't enabled on the account, this prompts to enable it (may require a payment method even on the free 10GB tier). This is the spec's flagged risk — if blocked, fall back to the Drive proxy (spec §6.2), not covered by this task.

- [ ] **Step 1: Add the R2 binding to both wrangler configs**

In `wrangler.jsonc`, add a top-level key (after `"assets"`):

```jsonc
  "r2_buckets": [
    { "binding": "SIGN_IMG", "bucket_name": "kaeru-signage-img" }
  ],
```

In `wrangler.ops.jsonc`, add the identical block.

- [ ] **Step 2: Public worker serves images — `src/index.js`**

In `src/index.js`, inside `fetch(request, env)`, add a route BEFORE the `BLOCKED_PATHS` check (so it is always reachable and cacheable):

```javascript
    // Public read-only image serving for signage (R2). Stable, cacheable, same-origin.
    if (url.pathname.startsWith('/sig-img/')) {
      const key = url.pathname.slice('/sig-img/'.length);
      if (!key) return new Response('Not found', { status: 404 });
      const obj = await env.SIGN_IMG.get(key);
      if (!obj) return new Response('Not found', { status: 404 });
      const headers = new Headers();
      headers.set('Content-Type', (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream');
      headers.set('Cache-Control', 'public, max-age=604800, immutable');
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
      return new Response(obj.body, { headers });
    }
```

- [ ] **Step 3: Ops worker upload + delete — `src/ops.js`**

In `src/ops.js`, inside `fetch(request, env)`, add BEFORE the asset-serving block. The gate is Cloudflare Access (all of `kaeru-ops` is behind Access) plus content-type/size validation:

```javascript
    // Signage image upload/delete (R2). Behind Cloudflare Access (whole worker) — staff only.
    if (url.pathname === '/sig-img' && request.method === 'POST') {
      const ct = request.headers.get('content-type') || '';
      if (!/^image\/(jpeg|png|webp)$/.test(ct)) return jsonRes({ ok: false, error: 'bad_type' }, 415);
      const buf = await request.arrayBuffer();
      if (buf.byteLength === 0 || buf.byteLength > 3 * 1024 * 1024) return jsonRes({ ok: false, error: 'bad_size' }, 413);
      const ext = ct === 'image/png' ? 'png' : ct === 'image/webp' ? 'webp' : 'jpg';
      const key = crypto.randomUUID() + '.' + ext;
      await env.SIGN_IMG.put(key, buf, { httpMetadata: { contentType: ct } });
      return jsonRes({ ok: true, key: key, url: '/sig-img/' + key }, 200);
    }
    if (url.pathname.startsWith('/sig-img/') && request.method === 'DELETE') {
      const key = url.pathname.slice('/sig-img/'.length);
      if (key) await env.SIGN_IMG.delete(key);
      return jsonRes({ ok: true }, 200);
    }
```

Add this helper near the top of `src/ops.js` (module scope, after the `CONTROL_CSP` const):

```javascript
function jsonRes(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json' } });
}
```

> Note: the ops worker also serves `/sig-img/<key>` GETs through its normal asset path? No — R2 reads only happen on the public worker (Step 2). The ops worker only writes/deletes. Signage (public) reads from `kaerukaphe`. Dashboard stores the FULL public URL in `scene.image` (Task 5 builds `https://kaerukaphe.kaerukaphe.workers.dev/sig-img/<key>`).

- [ ] **Step 4: Syntax check both workers**

Run:
```bash
cp src/index.js /tmp/i.mjs && node --check /tmp/i.mjs && echo index-OK
cp src/ops.js /tmp/o.mjs && node --check /tmp/o.mjs && echo ops-OK
rm /tmp/i.mjs /tmp/o.mjs
```
Expected: `index-OK` and `ops-OK`.

- [ ] **Step 5: Commit (code) — deploy is manual/CI**

```bash
git add wrangler.jsonc wrangler.ops.jsonc src/index.js src/ops.js
git commit -m "feat(worker,signage): R2 image pipeline — ops upload/delete + public serve /sig-img"
```

- [ ] **Step 6: Post-deploy verification (after `wrangler r2 bucket create` + merge→CI, or manual `wrangler deploy -c`)**

After the bucket exists and both workers are deployed:
```bash
# upload a small jpg through the ops worker (must be authenticated through Access in a browser;
#   from CLI this returns the Access login page unless you have a service token — so verify upload
#   from the Dashboard UI in Task 5 instead). Serve path is public and curl-able:
curl -s -o /dev/null -w "%{http_code}\n" "https://kaerukaphe.kaerukaphe.workers.dev/sig-img/does-not-exist.jpg"
```
Expected: `404` (route wired, key absent). Real upload+serve round-trip is verified from the Studio UI in Task 5 Step 9.

---

## Task 5: Dashboard Studio UI (scene list + per-scene editor + image upload + preview)

**Files:**
- Modify: `web/dashboard.html` — replace the `#v-signage` markup (lines ~134-178) and the `SG_BLOCKS`/`signageLoad`/`signageSave` JS (lines ~516-560)

> Dashboard already exposes `MENU_DATA`? Check: the signage tab needs the menu for the dish picker. The Dashboard loads menu via `ensureAdmin()` (admin payload has menu rows). Use the admin cache. If `MENU_DATA` global isn't present, fetch menu through the existing admin data (Step 2 handles this).

- [ ] **Step 1: Replace the `#v-signage` markup**

In `web/dashboard.html`, replace the whole `<div id="v-signage" ...>...</div>` block (lines ~134-178) with:

```html
  <div id="v-signage" class="view">
    <div class="sectitle">📺 Màn hình quảng cáo</div>
    <div class="hint">Kéo ☰ để đổi thứ tự cảnh. Bấm 1 cảnh để sửa. Thay đổi có hiệu lực trong ~60 giây sau khi Lưu.</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;margin-top:10px">
      <div style="flex:1;min-width:280px">
        <div id="sg-scenes"></div>
        <button class="btn" onclick="sgAddSceneMenu()" style="width:100%;margin-top:8px">＋ Thêm cảnh</button>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px">
          <label class="hint">Giao diện</label>
          <select id="sg-theme" class="cell" style="width:160px">
            <option value="auto">Tự động</option><option value="day">Ngày</option><option value="night">Đêm</option>
          </select>
          <button class="btn primary" onclick="signageSave()">💾 Lưu</button>
          <a class="btn" href="/signage" target="_blank">Xem màn thật ↗</a>
        </div>
      </div>
      <div style="width:220px;flex-shrink:0">
        <div class="hint" style="margin-bottom:6px">Xem trước cảnh đang chọn</div>
        <iframe id="sg-preview" src="/signage?preview=1" style="width:220px;height:124px;border:2px solid var(--border);border-radius:8px;background:#0d2228"></iframe>
        <div id="sg-editor" style="margin-top:10px"></div>
      </div>
    </div>
  </div>
```

- [ ] **Step 2: Replace the signage JS — state + load**

In `web/dashboard.html`, replace the block from `var SG_BLOCKS=[...]` through the end of `signageSave` (lines ~516-560) with the following. First, state + menu access + load:

```javascript
/* ---------- SIGNAGE STUDIO ---------- */
var SG = { scenes: [], theme: 'auto', promoRibbon: true, sel: -1, menu: [] };
var SG_TYPES = [
  { t:'spotlight', i:'☕', n:'Món nổi bật' }, { t:'image', i:'🖼️', n:'Ảnh poster' },
  { t:'video', i:'🎬', n:'Video' }, { t:'menu', i:'📋', n:'Thực đơn' },
  { t:'combo', i:'🎁', n:'Combo' }, { t:'tem', i:'🎯', n:'Thẻ tem' },
  { t:'announcement', i:'📢', n:'Thông báo' }
];
function sgTypeMeta(t){ return SG_TYPES.find(function(x){return x.t===t;}) || { i:'🎬', n:t }; }
function sgId(){ return 's' + Date.now().toString(36) + Math.floor(Math.random()*1000); }

async function signageLoad(){
  document.getElementById('sg-scenes').innerHTML='<div class="empty">Đang tải…</div>';
  // menu for dish picker (from admin cache)
  try { var d = await ensureAdmin(); SG.menu = d.menu || d.menu_items || []; } catch(e){ SG.menu = []; }
  try {
    var j = await (await fetch(GAS_URL+'?action=signage_config')).json();
    var c = (j && j.config) || {};
    if (c.version === 2) { SG.scenes = (c.scenes||[]).slice(); SG.theme = c.theme||'auto'; SG.promoRibbon = c.promoRibbon!==false; }
    else { SG.scenes = sgMigrate(c); SG.theme = c.theme||'auto'; SG.promoRibbon = (c.blocks&&c.blocks.promo===false)?false:true; }
  } catch(e){ SG.scenes = []; }
  document.getElementById('sg-theme').value = SG.theme;
  SG.sel = SG.scenes.length ? 0 : -1;
  sgRenderList(); sgRenderEditor(); sgPushPreview();
}

// Minimal v1→v2 for the editor (mirror of signage.js migrateV1, scenes only)
function sgMigrate(c){
  var b=c.blocks||{}, dur=(parseInt(c.rotateSeconds,10)||11), out=[];
  function add(s){ s.id=sgId(); s.enabled=true; if(!s.duration)s.duration=dur; out.push(s); }
  var a=c.announcement||{}; if(b.announcement!==false&&a.active&&a.text) add({type:'announcement',text:a.text,until:a.until||''});
  if(b.spotlight!==false&&Array.isArray(c.featured)) c.featured.forEach(function(sku){ if(sku) add({type:'spotlight',sku:sku}); });
  if(b.menu!==false) add({type:'menu'});
  var cb=(c.combos||[])[0]; if(b.combo!==false&&cb&&(cb.items||[]).length>=2&&cb.price) add({type:'combo',items:cb.items.slice(),price:cb.price,label:cb.label||''});
  if(b.tem!==false) add({type:'tem'});
  var yt=c.video&&c.video.youtube_id; if(b.video!==false&&yt) add({type:'video',youtube_id:yt,duration:45});
  return out;
}
```

- [ ] **Step 3: Scene list rendering + reorder + toggle + select**

Append to the same JS block:

```javascript
function sgSceneTitle(s){
  if(s.type==='spotlight'){ var m=SG.menu.find(function(x){return x.sku===s.sku;}); return 'Món — '+(m?m.name:(s.sku||'(chưa chọn)')); }
  if(s.type==='image') return 'Ảnh poster'+(s.caption?' — '+s.caption:'');
  if(s.type==='video') return 'Video — '+(s.youtube_id||'(chưa có link)');
  if(s.type==='combo') return 'Combo — '+(s.label||((s.items||[]).length+' món'));
  if(s.type==='announcement') return 'Thông báo — '+(s.text||'');
  return sgTypeMeta(s.type).n;
}
function sgRenderList(){
  var el=document.getElementById('sg-scenes');
  if(!SG.scenes.length){ el.innerHTML='<div class="empty">Chưa có cảnh nào. Bấm ＋ Thêm cảnh.</div>'; return; }
  el.innerHTML = SG.scenes.map(function(s,i){
    var meta=sgTypeMeta(s.type), selcls=(i===SG.sel)?'border-color:var(--accent,#EB624A)':'border-color:var(--border)';
    return '<div class="sg-row" draggable="true" data-i="'+i+'" onclick="sgSelect('+i+')" '
      +'style="display:flex;align-items:center;gap:8px;background:var(--panel2);border:1px solid;'+selcls+';border-radius:8px;padding:8px 10px;margin-bottom:6px;cursor:pointer">'
      +'<span style="cursor:grab;color:var(--muted)">☰</span><span>'+meta.i+'</span>'
      +'<div style="flex:1;font-size:.85rem">'+esc(sgSceneTitle(s))+'</div>'
      +'<span class="badge" style="font-size:.72rem">'+(s.duration||11)+'s</span>'
      +'<span onclick="event.stopPropagation();sgToggle('+i+')" style="cursor:pointer">'+(s.enabled!==false?'🟢':'⚪')+'</span>'
      +'<span onclick="event.stopPropagation();sgDelete('+i+')" style="cursor:pointer;color:#c00">🗑</span></div>';
  }).join('');
  // drag reorder
  var rows=el.querySelectorAll('.sg-row'); var dragI=null;
  rows.forEach(function(r){
    r.addEventListener('dragstart',function(){ dragI=+r.getAttribute('data-i'); });
    r.addEventListener('dragover',function(e){ e.preventDefault(); });
    r.addEventListener('drop',function(e){ e.preventDefault(); var to=+r.getAttribute('data-i');
      if(dragI===null||dragI===to)return; var m=SG.scenes.splice(dragI,1)[0]; SG.scenes.splice(to,0,m);
      SG.sel=to; sgRenderList(); sgRenderEditor(); });
  });
}
function sgSelect(i){ SG.sel=i; sgRenderList(); sgRenderEditor(); sgPushPreview(); }
function sgToggle(i){ SG.scenes[i].enabled = SG.scenes[i].enabled===false; sgRenderList(); }
function sgDelete(i){
  var s=SG.scenes[i];
  if(s.type==='image'&&s.image) sgDeleteImage(s.image);
  SG.scenes.splice(i,1); if(SG.sel>=SG.scenes.length)SG.sel=SG.scenes.length-1;
  sgRenderList(); sgRenderEditor(); sgPushPreview();
}
function sgAddSceneMenu(){
  var t=prompt('Loại cảnh: '+SG_TYPES.map(function(x){return x.t;}).join(' / '),'spotlight');
  if(!t||!SG_TYPES.find(function(x){return x.t===t;}))return;
  var s={ id:sgId(), type:t, enabled:true, duration:(t==='video'?45:11) };
  if(t==='spotlight')s.sku=''; if(t==='image'){s.image='';s.caption='';} if(t==='video')s.youtube_id='';
  if(t==='announcement'){s.text='';s.until='';} if(t==='combo'){s.items=[];s.price=0;s.label='';}
  SG.scenes.push(s); SG.sel=SG.scenes.length-1; sgRenderList(); sgRenderEditor(); sgPushPreview();
}
```

> The "＋ Thêm cảnh" uses `prompt()` for type selection to keep the plan small and dependency-free. A nicer type-picker sheet is an optional polish, out of scope for v1.

- [ ] **Step 4: Per-scene editor (dish picker, caption, youtube, duration) + image upload**

Append:

```javascript
function sgDishOptions(sel){
  return '<option value="">— chọn món —</option>'+SG.menu.map(function(m){
    return '<option value="'+esc(m.sku)+'"'+(m.sku===sel?' selected':'')+'>'+esc(m.name)+' ('+esc(m.sku)+')</option>';
  }).join('');
}
function sgRenderEditor(){
  var el=document.getElementById('sg-editor'); if(SG.sel<0||!SG.scenes[SG.sel]){ el.innerHTML=''; return; }
  var s=SG.scenes[SG.sel], h='<div class="card" style="padding:10px"><div class="hint" style="margin-bottom:6px">Sửa cảnh: '+esc(sgTypeMeta(s.type).n)+'</div>';
  if(s.type==='spotlight') h+='<select class="cell" style="width:100%;margin-bottom:6px" onchange="sgSet(\'sku\',this.value)">'+sgDishOptions(s.sku)+'</select>';
  if(s.type==='image'){
    h+='<input type="file" accept="image/jpeg,image/png,image/webp" onchange="sgUpload(this)" style="margin-bottom:6px;font-size:.8rem">';
    if(s.image) h+='<img src="'+esc(s.image)+'" style="width:100%;border-radius:6px;margin-bottom:6px">';
    h+='<input class="cell" placeholder="Chữ trên ảnh (tùy chọn)" value="'+esc(s.caption||'')+'" oninput="sgSet(\'caption\',this.value)" style="width:100%;margin-bottom:6px">';
  }
  if(s.type==='video') h+='<input class="cell" placeholder="Link hoặc ID YouTube" value="'+esc(s.youtube_id||'')+'" oninput="sgSet(\'youtube_id\',sgYt(this.value))" style="width:100%;margin-bottom:6px">';
  if(s.type==='announcement') h+='<input class="cell" placeholder="Nội dung thông báo" value="'+esc(s.text||'')+'" oninput="sgSet(\'text\',this.value)" style="width:100%;margin-bottom:6px">';
  if(s.type==='combo') h+='<input class="cell" placeholder="Mã món, cách nhau dấu phẩy" value="'+esc((s.items||[]).join(','))+'" oninput="sgSet(\'items\',this.value.split(\',\').map(function(x){return x.trim();}).filter(Boolean))" style="width:100%;margin-bottom:6px">'
    +'<input class="cell" type="number" placeholder="Giá combo" value="'+(s.price||'')+'" oninput="sgSet(\'price\',parseInt(this.value,10)||0)" style="width:100%;margin-bottom:6px">';
  h+='<label class="hint">Thời lượng (giây)</label><input class="cell" type="number" min="5" value="'+(s.duration||11)+'" oninput="sgSet(\'duration\',parseInt(this.value,10)||11)" style="width:100px"></div>';
  el.innerHTML=h;
}
function sgSet(k,v){ if(SG.sel<0)return; SG.scenes[SG.sel][k]=v; sgRenderList(); sgPushPreview(); }
function sgYt(v){ var m=String(v).match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/); return m?m[1]:String(v).trim(); }
```

- [ ] **Step 5: Image upload to ops worker + delete**

Append (client resizes before upload, then POSTs bytes to the ops worker which is same-origin when Dashboard runs on `kaeru-ops`):

```javascript
var SIG_PUBLIC = 'https://kaerukaphe.kaerukaphe.workers.dev'; // where signage reads images from
async function sgUpload(input){
  var file=input.files&&input.files[0]; if(!file)return;
  toast('Đang tải ảnh…');
  var blob=await sgResize(file, 1600, 0.82);
  try{
    var res=await fetch('/sig-img',{ method:'POST', headers:{'content-type':blob.type}, body:blob });
    var j=await res.json();
    if(j&&j.ok){ sgSet('image', SIG_PUBLIC + j.url); sgRenderEditor(); toast('Đã tải ảnh'); }
    else toast('Lỗi tải ảnh: '+((j&&j.error)||'?'));
  }catch(e){ toast('Lỗi tải ảnh'); }
}
function sgDeleteImage(url){
  var i=url.indexOf('/sig-img/'); if(i<0)return;
  fetch(url.slice(i),{ method:'DELETE' }).catch(function(){});
}
// Resize/compress in-browser → smaller, faster, avoids worker size limit
function sgResize(file, maxEdge, quality){
  return new Promise(function(resolve){
    var img=new Image();
    img.onload=function(){
      var w=img.width,h=img.height,sc=Math.min(1,maxEdge/Math.max(w,h));
      var cv=document.createElement('canvas'); cv.width=Math.round(w*sc); cv.height=Math.round(h*sc);
      cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
      cv.toBlob(function(b){ resolve(b||file); }, 'image/jpeg', quality||0.82);
    };
    img.onerror=function(){ resolve(file); };
    img.src=URL.createObjectURL(file);
  });
}
```

> When Dashboard is served from `kaeru-ops`, `fetch('/sig-img', {POST})` hits the ops worker (same origin, behind Access). The stored `scene.image` uses the absolute `SIG_PUBLIC` URL so the public signage display can read it.

- [ ] **Step 6: Live preview push + save**

Append:

```javascript
function sgPushPreview(){
  var f=document.getElementById('sg-preview'); if(!f||SG.sel<0)return;
  try{ f.contentWindow.postMessage({ kind:'signage-preview', theme:SG.theme, scene:SG.scenes[SG.sel] }, '*'); }catch(e){}
}
document.getElementById('sg-theme') && document.getElementById('sg-theme').addEventListener('change',function(){ SG.theme=this.value; sgPushPreview(); });

async function signageSave(){
  var config={ version:2, scenes:SG.scenes, theme:document.getElementById('sg-theme').value, promoRibbon:SG.promoRibbon };
  var res=await apiPost({action:'set_signage',token:tk(),config:config});
  toast(res&&res.ok?'Đã lưu — màn cập nhật trong ~60s':'Lỗi: '+((res&&res.error)||'?'));
}
```

- [ ] **Step 7: Re-push preview when the iframe finishes loading**

The iframe may not be ready when `signageLoad` first runs. Add an onload re-push. In the markup from Step 1 the iframe is `id="sg-preview"`; append this once near the other signage JS:

```javascript
document.getElementById('sg-preview') && document.getElementById('sg-preview').addEventListener('load', function(){ sgPushPreview(); });
```

- [ ] **Step 8: Verify the Studio renders + edits in browser preview**

Start preview, open `/dashboard` (log in or stub a session/admin cache). Switch to the 📺 Màn hình tab. With `preview_eval`, drive the state directly (no GAS needed):

```javascript
(function(){
  SG.menu=[{sku:'DR001',name:'Trà sữa Kaeru'}];
  SG.scenes=[{id:'a',type:'spotlight',enabled:true,duration:12,sku:'DR001'},{id:'b',type:'image',enabled:true,duration:8,image:'',caption:'Sale'}];
  SG.sel=0; sgRenderList(); sgRenderEditor();
  return { rows: document.querySelectorAll('#sg-scenes .sg-row').length,
           title: document.querySelector('#sg-scenes .sg-row div').textContent,
           hasDishPicker: !!document.querySelector('#sg-editor select') };
})()
```
Expected: `rows:2`, title contains `Trà sữa Kaeru`, `hasDishPicker:true`. Check `preview_console_logs` → no errors.

- [ ] **Step 9: Verify save payload shape**

`preview_eval`:
```javascript
(function(){ var captured=null; var orig=window.apiPost; window.apiPost=function(b){captured=b;return Promise.resolve({ok:true});};
  return signageSave().then(function(){ window.apiPost=orig; return JSON.stringify({action:captured.action, version:captured.config.version, n:captured.config.scenes.length}); }); })()
```
Expected: `{"action":"set_signage","version":2,"n":2}`.

> Real image upload + end-to-end (R2 round-trip) is verified manually on the deployed `kaeru-ops` Dashboard after Task 4's bucket exists: pick a photo in an `image` scene → it appears in the editor preview → Save → open `/signage` and confirm the image scene shows.

- [ ] **Step 10: Commit**

```bash
git add web/dashboard.html
git commit -m "feat(dashboard,signage): Studio — scene list, per-scene editor, image upload, live preview"
```

---

## Deployment & integration notes

- **R2 bucket** must be created once (`wrangler r2 bucket create kaeru-signage-img`) before the upload/serve routes work. If R2 can't be enabled, switch to the Drive-proxy fallback (spec §6.2) — same `/sig-img/<key>` URL contract, different backend.
- **Workers** deploy via CI on merge to `main` (both `kaerukaphe` + `kaeru-ops`, per `.github/workflows/cloudflare.yml`). The R2 binding must exist in both wrangler configs before deploy or the deploy fails.
- **GAS** (`Signage.gs`) deploys manually (`cd gas && clasp push` + redeploy) — only affects the seed default; existing configs migrate on read.
- **Web** version bump (`signage.js?v=20260614a`) busts the signage display cache.
- Integrate via PR to `main` (direct push blocked).

---

## Self-Review

**Spec coverage:**
- §3 v2 schema + §3.1 migration → Task 1 (Steps 1-6) ✅
- §4 scene types incl. new `image` (renderImage) → Task 1 Step 4 + Task 2 Step 1 ✅
- §5 Studio UI (scene list, reorder, per-scene editor, dish picker, caption, youtube, duration, upload, preview, save) → Task 5 ✅
- §6 image pipeline R2 (bindings, ops upload/delete, public serve, client resize, cache headers, orphan delete) → Task 4 + Task 5 Steps 5 ✅; §6.2 Drive fallback noted as out-of-task with same contract ✅
- §7 signage.js runtime (image branch, per-scene dwell, preview mode, ribbon→promoRibbon) → Task 2 ✅
- §8 GAS default v2 + unchanged getter/setter; upload gated by Access + type/size validation → Task 3 + Task 4 Step 3 ✅
- §9 tests (migration, render each type, reorder/duration, upload, error fallback, security 404) → Task 1 tests + Task 2/4/5 verification ✅

**Placeholder scan:** No TBD/TODO; the `prompt()` type-picker and Drive fallback are explicitly scoped decisions, not placeholders. Every code step has full code.

**Type consistency:** Scene fields (`sku`, `image`, `caption`, `youtube_id`, `items`, `price`, `label`, `text`, `until`, `duration`, `enabled`, `id`) match across `signage.js` (Task 1/2), `Signage.gs` default (Task 3), and Dashboard `SG.scenes` (Task 5). Config keys `version`/`scenes`/`theme`/`promoRibbon` consistent. Route `/sig-img/<key>` and binding `SIGN_IMG` consistent across `wrangler.*` (Task 4 Step 1), `src/index.js` (Step 2), `src/ops.js` (Step 3), Dashboard upload (Task 5 Step 5). `set_signage` action unchanged in GAS — Dashboard sends `{version:2,...}`.

**Known dependency note:** Task 5's image upload (Step 5) needs Task 4 deployed (ops `/sig-img` route + bucket) to work end-to-end, but the UI code and non-image verification (Steps 8-9) don't. Build order 1→2→3→4→5 respects this.
