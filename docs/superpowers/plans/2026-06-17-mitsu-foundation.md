# Mảng 1 — Nền tảng thiết kế Mitsu · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng lớp nền tảng thiết kế Mitsu (token 2 theme, theme switcher, bộ component, hợp đồng honeycomb-menu, hệ nhân vật placeholder) làm móng cho mọi bề mặt — không đụng menu/giá/logic đặt hàng.

**Architecture:** File tĩnh, không bundler (như repo hiện tại). `mitsu-theme.js` theo pattern `signage.js`: export hàm thuần cho `node:test`, đồng thời tự gắn DOM khi chạy browser. `mitsu.css` dùng token ngữ nghĩa; hai theme remap biến qua `prefers-color-scheme` + `data-theme`. Trang `mitsu-kit.html` là bằng chứng duyệt + nơi verify thủ công cả hai theme.

**Tech Stack:** HTML5, CSS (custom properties, `clip-path`), Vanilla JS, `node:test` (built-in), Google Fonts (Cormorant Garamond / Be Vietnam Pro / Noto Serif JP).

**Owner per task:** **CC** = Claude Code · **AG** = giao Antigravity. Spec: `docs/superpowers/specs/2026-06-17-mitsu-foundation-design.md`.

---

## File Structure

| File | Trách nhiệm | Owner |
|---|---|---|
| `web/mitsu-theme.js` | Resolver theme thuần (`resolveTheme`,`nextPref`,`normalizePref`) + DOM wiring nút theme | CC |
| `web/mitsu-theme.test.js` | Unit test `node:test` cho resolver | CC |
| `web/mitsu.css` | Token 2 theme + base type + component (wordmark, hanko, bees, badge, honeycomb, hc-menu, char, loader, theme-toggle) | CC |
| `web/mitsu-assets.svg` | Sprite SVG: `#hanko`, `#three-bees`, `#badge` | CC |
| `web/mitsu-kit.html` | Trang demo nội bộ duyệt nền tảng | CC |
| `web/img/mitsu/` | Placeholder nhân vật (4×6) + pattern (seigaiha, hoa cà phê) | AG |

---

## Task 1: Theme resolver + tests (CC)

**Files:**
- Create: `web/mitsu-theme.js`
- Test: `web/mitsu-theme.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test web/mitsu-theme.test.js`
Expected: FAIL — `Cannot find module './mitsu-theme.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
'use strict';
// Resolve hiệu lực theme từ lựa chọn lưu (pref) + OS preference.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test web/mitsu-theme.test.js`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/mitsu-theme.js web/mitsu-theme.test.js
git commit -m "feat(mitsu): theme resolver + tests"
```

---

## Task 2: DOM wiring cho theme switcher (CC)

**Files:**
- Modify: `web/mitsu-theme.js` (append khối browser, sau `module.exports`)

- [ ] **Step 1: Append DOM wiring**

```js
if (typeof document !== 'undefined') {
  var KEY = 'mitsu-theme';
  var mq = window.matchMedia('(prefers-color-scheme: dark)');

  function getPref() { return normalizePref(localStorage.getItem(KEY)); }

  function apply() {
    var pref = getPref();
    // 'auto' -> gỡ data-theme, để CSS @media quyết (không nhấp nháy).
    if (pref === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', pref);
    // Cập nhật mọi nút theme.
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
```

- [ ] **Step 2: Verify tests still pass (no regression)**

Run: `node --test web/mitsu-theme.test.js`
Expected: PASS — 5 tests (DOM block skipped under node vì không có `document`).

- [ ] **Step 3: Commit**

```bash
git add web/mitsu-theme.js
git commit -m "feat(mitsu): theme switcher DOM wiring"
```

---

## Task 3: Token layer + base typography (CC)

**Files:**
- Create: `web/mitsu.css`

- [ ] **Step 1: Write token + base**

```css
/* mitsu.css — nền tảng thiết kế Mitsu (2 theme). Spec: 2026-06-17-mitsu-foundation-design.md */
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Be+Vietnam+Pro:wght@300;400;500;600&family=Noto+Serif+JP:wght@400;600&display=swap');

:root {
  --bg:#F2EBDD; --surface:#EFE6D4; --surface-2:#E7DCC6;
  --text:#1C1C1A; --text-dim:#3A3833; --text-muted:rgba(28,28,26,.55);
  --accent:#C68A3E; --accent-deep:#9C6A2C; --seal:#B83A2E; --moss:#6E7A4F;
  --line:rgba(28,28,26,.14); --line-soft:rgba(28,28,26,.08);
  --radius:8px; --radius-sm:4px;
  --disp:"Cormorant Garamond",Georgia,serif;
  --body:"Be Vietnam Pro",system-ui,sans-serif;
  --jp:"Noto Serif JP",serif;
}
:root[data-theme="dark"] {
  --bg:#16130E; --surface:#221C14; --surface-2:#2C2419;
  --text:#F2EBDD; --text-dim:rgba(242,235,221,.62); --text-muted:rgba(242,235,221,.4);
  --accent:#E0AC5E; --accent-deep:#C68A3E; --seal:#C9483B; --moss:#8A9568;
  --line:rgba(242,235,221,.12); --line-soft:rgba(242,235,221,.07);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg:#16130E; --surface:#221C14; --surface-2:#2C2419;
    --text:#F2EBDD; --text-dim:rgba(242,235,221,.62); --text-muted:rgba(242,235,221,.4);
    --accent:#E0AC5E; --accent-deep:#C68A3E; --seal:#C9483B; --moss:#8A9568;
    --line:rgba(242,235,221,.12); --line-soft:rgba(242,235,221,.07);
  }
}
* { box-sizing:border-box; margin:0; padding:0; }
body.mitsu { background:var(--bg); color:var(--text); font-family:var(--body); font-weight:300; line-height:1.7; -webkit-font-smoothing:antialiased; }
.mitsu h1,.mitsu h2,.mitsu h3 { font-family:var(--disp); font-weight:500; line-height:1.1; }
.mitsu .jp { font-family:var(--jp); }
.mitsu .amber { color:var(--accent); }
```

- [ ] **Step 2: Verify it parses (no syntax error)**

Run: `node -e "const c=require('fs').readFileSync('web/mitsu.css','utf8'); const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length; if(o!==cl) throw new Error('brace mismatch '+o+'/'+cl); console.log('css braces ok', o);"`
Expected: `css braces ok <n>`.

- [ ] **Step 3: Commit**

```bash
git add web/mitsu.css
git commit -m "feat(mitsu): token layer + base typography"
```

---

## Task 4: Asset sprite (hanko, three-bees, badge) (CC)

**Files:**
- Create: `web/mitsu-assets.svg`

- [ ] **Step 1: Write sprite**

```html
<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <symbol id="hanko" viewBox="0 0 100 100">
    <rect x="14" y="14" width="72" height="72" rx="7" fill="var(--seal,#B83A2E)" transform="rotate(-3 50 50)"/>
    <text x="50" y="51" text-anchor="middle" dominant-baseline="central" font-family="'Noto Serif JP',serif" font-size="46" fill="#F2EBDD">蜜</text>
  </symbol>
  <symbol id="three-bees" viewBox="0 0 200 200">
    <circle class="fp1" cx="100" cy="100" r="74" fill="none" stroke="var(--accent,#C68A3E)" stroke-width="2.4"/>
    <rect class="fp2" x="44" y="44" width="112" height="112" rx="3" fill="none" stroke="var(--moss,#6E7A4F)" stroke-width="1.6" transform="rotate(45 100 100)"/>
    <path class="fp3" d="M100,42 C150,55 158,150 100,158 C50,150 42,95 100,72 C140,86 138,128 100,134" fill="none" stroke="var(--text,#1C1C1A)" stroke-width="1.4" opacity=".55"/>
    <g transform="rotate(-3 100 100)">
      <rect x="76" y="76" width="48" height="48" rx="5" fill="var(--seal,#B83A2E)"/>
      <text x="100" y="101" text-anchor="middle" dominant-baseline="central" font-family="'Noto Serif JP',serif" font-size="30" fill="#F2EBDD">蜜</text>
    </g>
  </symbol>
  <symbol id="badge" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="56" fill="none" stroke="var(--accent,#C68A3E)" stroke-width="2"/>
    <circle cx="60" cy="60" r="48" fill="none" stroke="var(--line,rgba(28,28,26,.14))" stroke-width="1"/>
    <text x="60" y="54" text-anchor="middle" font-family="'Cormorant Garamond',serif" font-size="22" font-weight="600" fill="var(--text,#1C1C1A)">mitsu</text>
    <text x="60" y="80" text-anchor="middle" font-family="'Noto Serif JP',serif" font-size="20" fill="var(--seal,#B83A2E)">蜜</text>
  </symbol>
</svg>
```

- [ ] **Step 2: Verify well-formed XML**

Run: `node -e "const s=require('fs').readFileSync('web/mitsu-assets.svg','utf8'); if(!/id=\"hanko\"/.test(s)||!/id=\"three-bees\"/.test(s)||!/id=\"badge\"/.test(s)) throw new Error('missing symbol'); console.log('sprite ok');"`
Expected: `sprite ok`.

- [ ] **Step 3: Commit**

```bash
git add web/mitsu-assets.svg
git commit -m "feat(mitsu): SVG sprite — hanko, three-bees, badge"
```

---

## Task 5: Component classes — wordmark, hanko, bees, badge, loader, theme-toggle (CC)

**Files:**
- Modify: `web/mitsu.css` (append)

- [ ] **Step 1: Append component CSS**

```css
/* --- brand marks --- */
.wm { font-family:var(--disp); font-weight:600; letter-spacing:.01em; color:var(--text); }
.wm .dot { color:var(--accent); }
.hanko,.bees,.badge { display:inline-block; vertical-align:middle; }
.hanko { width:40px; height:40px; }
.bees { width:120px; height:120px; }
.badge { width:96px; height:96px; }

/* --- three-bees loader --- */
@keyframes mitsu-drift { to { stroke-dashoffset:-200; } }
.mitsu-loader { display:flex; flex-direction:column; align-items:center; gap:12px; color:var(--text-dim); font-family:var(--disp); font-style:italic; }
.mitsu-loader .bees .fp1 { stroke-dasharray:5 7; animation:mitsu-drift 9s linear infinite; }
.mitsu-loader .bees .fp3 { stroke-dasharray:1 9; animation:mitsu-drift 14s linear infinite reverse; }
@media (prefers-reduced-motion:reduce) { .mitsu-loader .bees .fp1,.mitsu-loader .bees .fp3 { animation:none; } }

/* --- theme toggle --- */
.theme-toggle { display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border:1px solid var(--line); border-radius:var(--radius-sm); background:var(--surface); color:var(--text); cursor:pointer; }
.theme-toggle:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.theme-toggle::before { content:"◐"; font-size:1rem; }
.theme-toggle[data-pref="light"]::before { content:"☀"; }
.theme-toggle[data-pref="dark"]::before { content:"☾"; }
.theme-toggle[data-pref="auto"]::before { content:"◐"; }
```

- [ ] **Step 2: Verify braces balanced**

Run: `node -e "const c=require('fs').readFileSync('web/mitsu.css','utf8'); const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length; if(o!==cl) throw new Error('brace mismatch '+o+'/'+cl); console.log('css braces ok', o);"`
Expected: `css braces ok <n>`.

- [ ] **Step 3: Commit**

```bash
git add web/mitsu.css
git commit -m "feat(mitsu): brand mark, loader, theme-toggle components"
```

---

## Task 6: Honeycomb + hc-menu component (CC)

**Files:**
- Modify: `web/mitsu.css` (append)

- [ ] **Step 1: Append honeycomb + hc-menu CSS**

```css
/* --- honeycomb cell --- */
.hc-cell { background:var(--surface); border:1px solid var(--line); display:flex; align-items:center; justify-content:center; color:var(--accent); overflow:hidden;
  clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%); }
.hc-cell img { width:100%; height:100%; object-fit:cover; }

/* --- menu: text line -> expandable detail --- */
.hc-menu { list-style:none; }
.hc-item { border-bottom:1px dotted var(--line); }
.hc-line { display:flex; align-items:baseline; gap:10px; width:100%; padding:11px 2px; background:none; border:0; cursor:pointer; text-align:left; color:var(--text); font:inherit; }
.hc-line:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.hc-name { font-weight:500; }
.hc-dots { flex:1; border-bottom:1px dotted var(--line); transform:translateY(-3px); min-width:14px; }
.hc-price { font-family:var(--disp); color:var(--accent); }
.hc-chev::before { content:"⌄"; color:var(--accent); display:inline-block; transition:transform .2s; }
.hc-line[aria-expanded="true"] .hc-chev::before { transform:rotate(180deg); }
.hc-detail { display:flex; gap:14px; align-items:center; padding:4px 2px 16px; }
.hc-detail[hidden] { display:none; }
.hc-detail .hc-cell { width:96px; height:104px; flex-shrink:0; }
.hc-desc { font-size:.92rem; color:var(--text-dim); }
@media (prefers-reduced-motion:reduce) { .hc-chev::before { transition:none; } }
```

- [ ] **Step 2: Verify braces balanced**

Run: `node -e "const c=require('fs').readFileSync('web/mitsu.css','utf8'); const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length; if(o!==cl) throw new Error('brace mismatch '+o+'/'+cl); console.log('css braces ok', o);"`
Expected: `css braces ok <n>`.

- [ ] **Step 3: Commit**

```bash
git add web/mitsu.css
git commit -m "feat(mitsu): honeycomb cell + hc-menu component"
```

---

## Task 7: hc-menu interaction JS (accordion một-mở) + tests (CC)

**Files:**
- Create: `web/mitsu-menu.js`
- Test: `web/mitsu-menu.test.js`

- [ ] **Step 1: Write failing test for pure toggle helper**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test web/mitsu-menu.test.js`
Expected: FAIL — `Cannot find module './mitsu-menu.js'`.

- [ ] **Step 3: Implement**

```js
'use strict';
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test web/mitsu-menu.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add web/mitsu-menu.js web/mitsu-menu.test.js
git commit -m "feat(mitsu): hc-menu accordion interaction + tests"
```

---

## Task 8: Character component `.mitsu-char` + placeholder convention (CC)

**Files:**
- Modify: `web/mitsu.css` (append)

- [ ] **Step 1: Append character CSS**

```css
/* --- nhân vật minh hoạ (raster, thay hi-res sau) --- */
.mitsu-char { display:inline-block; width:120px; aspect-ratio:3/4; border-radius:var(--radius); background:var(--surface); border:1px solid var(--line-soft); object-fit:contain; }
.mitsu-char--ph { display:flex; align-items:center; justify-content:center; color:var(--accent); font-family:var(--jp); font-size:1.6rem; }
.mitsu-char--sm { width:72px; }
.mitsu-char--lg { width:200px; }
```

Quy ước tên file (ảnh hi-res chủ gửi thả đúng tên, không sửa code):
`web/img/mitsu/char-{kin|ritsu|so|queen}-{determined|joyful|surprised|sleepy|proud|goodbye}.webp`

- [ ] **Step 2: Verify braces balanced**

Run: `node -e "const c=require('fs').readFileSync('web/mitsu.css','utf8'); const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length; if(o!==cl) throw new Error('brace mismatch '+o+'/'+cl); console.log('css braces ok', o);"`
Expected: `css braces ok <n>`.

- [ ] **Step 3: Commit**

```bash
git add web/mitsu.css
git commit -m "feat(mitsu): .mitsu-char component + asset naming convention"
```

---

## Task 9: Trang demo `mitsu-kit.html` (CC)

**Files:**
- Create: `web/mitsu-kit.html`

- [ ] **Step 1: Write demo page**

```html
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mitsu — Design Kit (nội bộ)</title>
<script>
  // anti-flash: set data-theme trước khi vẽ (chỉ khi pref là light/dark)
  try { var p = localStorage.getItem('mitsu-theme');
    if (p === 'light' || p === 'dark') document.documentElement.setAttribute('data-theme', p); } catch (e) {}
</script>
<link rel="stylesheet" href="mitsu.css">
<style>
  .kit { max-width:900px; margin:0 auto; padding:40px 24px 90px; }
  .kit section { margin-top:48px; }
  .kit .eyebrow { font-size:.66rem; letter-spacing:.3em; text-transform:uppercase; color:var(--accent); font-weight:600; margin-bottom:14px; }
  .sw { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
  .sw div { height:64px; border-radius:var(--radius-sm); border:1px solid var(--line); display:flex; align-items:end; padding:6px; font-size:.7rem; }
  .row { display:flex; gap:20px; align-items:center; flex-wrap:wrap; }
  .topbar { display:flex; align-items:center; gap:16px; }
</style>
</head>
<body class="mitsu">
<div class="kit">
  <div class="topbar">
    <span class="wm" style="font-size:2rem;">mitsu<span class="dot">.</span></span>
    <svg class="hanko"><use href="mitsu-assets.svg#hanko"/></svg>
    <span style="margin-left:auto"></span>
    <button class="theme-toggle" data-theme-toggle aria-label="Đổi giao diện"></button>
  </div>

  <section>
    <div class="eyebrow">Swatches (đổi nút theme góc phải để xem 2 theme)</div>
    <div class="sw">
      <div style="background:var(--bg)">--bg</div>
      <div style="background:var(--surface)">--surface</div>
      <div style="background:var(--accent);color:#fff">--accent</div>
      <div style="background:var(--seal);color:#fff">--seal</div>
    </div>
  </section>

  <section>
    <div class="eyebrow">Typography</div>
    <h1>Giọt mật của ba con ong</h1>
    <p>Hạt này, hôm qua còn trên cây. Hôm nay đã trong ly bạn.</p>
    <p class="jp" style="color:var(--seal)">蜜は一匹では作れない</p>
  </section>

  <section>
    <div class="eyebrow">Marks & loader</div>
    <div class="row">
      <svg class="bees"><use href="mitsu-assets.svg#three-bees"/></svg>
      <svg class="badge"><use href="mitsu-assets.svg#badge"/></svg>
      <div class="mitsu-loader"><svg class="bees"><use href="mitsu-assets.svg#three-bees"/></svg>Đang pha mật…</div>
    </div>
  </section>

  <section>
    <div class="eyebrow">Nhân vật (placeholder)</div>
    <div class="row">
      <span class="mitsu-char mitsu-char--ph">勤</span>
      <span class="mitsu-char mitsu-char--ph">律</span>
      <span class="mitsu-char mitsu-char--ph">創</span>
      <span class="mitsu-char mitsu-char--ph">女王</span>
    </div>
  </section>

  <section>
    <div class="eyebrow">Honeycomb menu (mẫu)</div>
    <ul class="hc-menu">
      <li class="hc-item">
        <button class="hc-line" aria-expanded="false" aria-controls="d1">
          <span class="hc-name">Cà phê muối</span><span class="hc-dots"></span>
          <span class="hc-price">30k</span><span class="hc-chev" aria-hidden="true"></span>
        </button>
        <div class="hc-detail" id="d1" hidden>
          <span class="hc-cell mitsu-char--ph" style="color:var(--accent)">☕</span>
          <p class="hc-desc">Cà phê muối — vị mặn ngọt cân bằng, kem muối đánh tay. (ảnh placeholder)</p>
        </div>
      </li>
      <li class="hc-item">
        <button class="hc-line" aria-expanded="false" aria-controls="d2">
          <span class="hc-name">Bạc xỉu</span><span class="hc-dots"></span>
          <span class="hc-price">28k</span><span class="hc-chev" aria-hidden="true"></span>
        </button>
        <div class="hc-detail" id="d2" hidden>
          <span class="hc-cell" style="color:var(--accent)">☕</span>
          <p class="hc-desc">Bạc xỉu — nhiều sữa, cà phê nhẹ. (ảnh placeholder)</p>
        </div>
      </li>
    </ul>
  </section>
</div>
<script src="mitsu-theme.js"></script>
<script src="mitsu-menu.js"></script>
</body>
</html>
```

- [ ] **Step 2: Khởi động preview server**

Dùng preview tool (`preview_start`) trỏ vào thư mục `web/`, mở `mitsu-kit.html`.

- [ ] **Step 3: Verify — console & cả hai theme**

- `preview_console_logs`: Expected — không có error.
- `preview_snapshot`: thấy wordmark, hanko, badge, 4 nhân vật placeholder, hc-menu.
- Bấm nút theme (`preview_click` `.theme-toggle`) vòng Auto→Sáng→Tối; `preview_screenshot` mỗi trạng thái: nền + chữ đổi đúng, chữ vẫn đọc rõ ở theme tối.
- Bấm `.hc-line` đầu: `preview_snapshot` xác nhận `aria-expanded="true"` và detail hiện; bấm line thứ 2: line đầu đóng (accordion một-mở).

- [ ] **Step 4: Commit**

```bash
git add web/mitsu-kit.html
git commit -m "feat(mitsu): internal design-kit demo page"
```

---

## Task 10 (AG): Placeholder nhân vật & pattern

> Giao Antigravity. Thẻ bàn giao: dùng quy ước tên ở Task 8; KHÔNG sửa `.css`/`.js`/schema.

**Files:**
- Create: `web/img/mitsu/char-*.webp` (24 file: 4 nhân vật × 6 biểu cảm), kích thước ~600×800, nền washi `#F2EBDD`, kanji + nhãn biểu cảm — placeholder tạm.
- Create: `web/img/mitsu/pattern-seigaiha.svg`, `web/img/mitsu/pattern-coffee.svg` — tile pattern tông `--accent`/`--line`.

- [ ] **Step 1:** Sinh 24 ảnh placeholder đúng tên `char-{kin|ritsu|so|queen}-{determined|joyful|surprised|sleepy|proud|goodbye}.webp`.
- [ ] **Step 2:** Sinh 2 SVG pattern tile (seigaiha, hoa/quả cà phê), nền trong suốt.
- [ ] **Step 3: Verify** — đủ 24+2 file, mở `mitsu-kit.html` thay `--ph` bằng `<img>` thử một nhân vật: không vỡ layout.
- [ ] **Step 4: Commit**

```bash
git add web/img/mitsu/
git commit -m "assets(mitsu): placeholder characters + patterns"
```

---

## Self-Review (đã rà)

**Spec coverage:** token 2 theme (T3) · auto+manual switch (T1,T2) · anti-flash (T9 head script) · wordmark/hanko/bees/badge (T4,T5) · loader (T5) · honeycomb + hc-menu hợp đồng (T6,T7) · accordion một-mở (T7) · char component + naming + placeholder (T8,T10) · demo page + verify 2 theme/a11y (T9) · "không đụng app/landing" (không task nào sửa `style.css`/`order.js`/`kaeru.html`). ✓

**Placeholder scan:** mọi step code có nội dung thật; verify có lệnh + kết quả mong đợi. ✓

**Type consistency:** `resolveTheme/nextPref/normalizePref` (T1) dùng lại nguyên ở T2; `nextOpen` (T7) khớp test; class `.hc-line/.hc-detail/.hc-cell/.mitsu-char/.theme-toggle` nhất quán giữa CSS (T5,T6,T8), JS (T2,T7) và demo (T9); `data-theme-toggle`/`data-pref` khớp T2↔T5↔T9; `aria-controls`/id khớp T7↔T9. ✓
