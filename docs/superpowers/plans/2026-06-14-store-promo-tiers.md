# Store-Wide Promo Tiers (5% / 10%) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the hardcoded "5% off whole store" promo into a single mutually-exclusive tier (Off / 5% / 10%) controllable from both Dashboard (owner session) and KDS (report-token + approved device), with auto-expiry and a one-click "post to social" command.

**Architecture:** Reuse existing infra only — CONFIG sheet keys + GAS `set_promo` + `promo_info` + `COMMAND_QUEUE`. Add one CONFIG key `PROMO_PERCENT`; a shared GAS helper `setStorePromo`; a percent-aware `_getPromoInfoInternal`; a new session-gated doPost `set_promo` for Dashboard alongside the existing report-token doGet `set_promo` for KDS. Front-ends read `promo_info.percent` and apply `(1 - percent/100)` to every menu price. No external DB.

**Tech Stack:** Google Apps Script (`.gs`), vanilla JS front-ends (`order.js`, `kds.html`, `dashboard.html`, `kaeru.js`, `signage.js`), Google Sheets CONFIG.

**Spec:** `docs/superpowers/specs/2026-06-14-store-promo-tiers-design.md`

---

## Pre-flight context (read before starting)

**No automated test runner exists in this repo.** There is no `package.json`, no Jest/Vitest, no `*.test` files. "Tests" here are concrete manual verifications:
- **GAS** cannot run locally (needs Google's runtime). Verify by deploying (`cd gas && clasp push` + redeploy) then `curl` the Web App URL, OR by running the function in the Apps Script editor and reading the log. The plan's GAS verification steps use `curl` with the exact expected JSON.
- **Front-end JS** is verified in the browser preview via `preview_eval` (assert computed prices / DOM) and `preview_console_logs` — these are the harness's `preview_*` tools, not Bash.

**Operational rules (from CLAUDE.md + project memory):**
- GAS deploys MANUALLY (`cd gas && clasp push` then redeploy a new version). Never assume CI pushes GAS.
- Web deploys via CI on push to `main`. We are on branch `store-promo-tiers` → integrate via PR (pushing straight to main is blocked).
- ORDERS is append-only; this feature does not touch ORDERS.
- Tokens/keys always come from CONFIG, never hardcoded.
- Always call `logError(...)` in new GAS branches that can fail.

**Current hardcoded-5% surfaces discovered (the work):**
| File | Symbol | Current | Target |
|------|--------|---------|--------|
| `gas/Code.gs:556` | `_getPromoInfoInternal` | `percent: 5` | read `PROMO_PERCENT` |
| `gas/Code.gs:282` | doGet `set_promo` | inline config writes, default msg "5%" | call `setStorePromo`, accept `percent`, neutral default msg |
| `gas/Code.gs` (new) | `setStorePromo` | — | shared helper |
| `gas/Code.gs` (new doPost) | doPost `set_promo` | — | session-gated entry for Dashboard |
| `gas/SeedSheets.gs:152-155` | CONFIG seed | no `PROMO_PERCENT` | add `PROMO_PERCENT: '5'`, neutral default msg |
| `web/order.js:1249` | `applyPromo5Percent` | `* 0.95` | `applyPromoPercent` reads `activePromo.percent` |
| `web/kds.html:495` | `applyPromo5Percent` | `* 0.95` | `applyPromoPercent` reads `activePromo.percent` + 5/10 selector |
| `web/dashboard.html:352` | `loadPromo` | campaign list only | add store-wide mini-panel + "Đăng MXH" |
| `web/index.html:48` | `order.js?v=` | `20260528c` | bump |

**Already percent-aware (do NOT change, verify only):**
- `web/kaeru.js:256-271` already reads `promo.percent` (falls back to 5% only if missing) and renders `promo.message`. No hardcoded "5%".
- `web/signage.js:231-235` ribbon renders `promo.message` only (no percent literal). No change needed unless we later want a "−X%" badge (out of scope).

---

## Task 1: GAS — `PROMO_PERCENT` config + `setStorePromo` helper + percent-aware promo info + refactor doGet

**Files:**
- Modify: `gas/SeedSheets.gs:152-155` (CONFIG seed)
- Modify: `gas/Code.gs:556-581` (`_getPromoInfoInternal`)
- Modify: `gas/Code.gs:282-311` (doGet `set_promo` branch)
- Create (append): `gas/Code.gs` — new function `setStorePromo` (place it just below `_getPromoInfoInternal`, near line 581)

- [ ] **Step 1: Add `PROMO_PERCENT` to the CONFIG seed + neutralize default message**

In `gas/SeedSheets.gs`, the current block is:

```javascript
    'PROMO_5PERCENT_ACTIVE': 'false',
    'PROMO_5PERCENT_START': '',
    'PROMO_5PERCENT_END': '',
    'PROMO_5PERCENT_MSG': 'Khuyến mãi đặc biệt: Giảm giá 5% cho toàn bộ menu!',
```

Replace with (adds `PROMO_PERCENT`, makes the default message tier-neutral so it is not wrong at 10%):

```javascript
    'PROMO_5PERCENT_ACTIVE': 'false',
    'PROMO_5PERCENT_START': '',
    'PROMO_5PERCENT_END': '',
    'PROMO_5PERCENT_MSG': 'Ưu đãi đặc biệt: Giảm giá toàn bộ menu!',
    'PROMO_PERCENT': '5',
```

> Note: existing keys keep the historical `5PERCENT` name on purpose (spec §3) — renaming them broadly is out of scope. `PROMO_PERCENT` is the live tier value.

- [ ] **Step 2: Make `_getPromoInfoInternal` read the percent and use a neutral default message**

In `gas/Code.gs`, the current function (lines 556-581) hardcodes `percent: 5` and a "5%" default message. Replace the function body's two relevant lines.

Change line 560 from:

```javascript
  var message   = getConfig('PROMO_5PERCENT_MSG') || 'Khuyến mãi đặc biệt: Giảm 5% toàn bộ menu!';
```

to:

```javascript
  var message   = getConfig('PROMO_5PERCENT_MSG') || 'Ưu đãi đặc biệt: Giảm giá toàn bộ menu!';
```

Change the return block (line 574-580) from `percent: 5,` to read CONFIG:

```javascript
  return {
    active: active,
    percent: parseInt(getConfig('PROMO_PERCENT') || '5', 10),
    start: start && !isNaN(start.getTime()) ? start.toISOString() : String(startVal),
    end: end && !isNaN(end.getTime()) ? end.toISOString() : String(endVal),
    message: String(message)
  };
```

- [ ] **Step 3: Add the shared `setStorePromo` helper**

In `gas/Code.gs`, immediately AFTER the closing `}` of `_getPromoInfoInternal` (after line 581), add:

```javascript
/**
 * Shared store-wide promo writer used by both the doGet (KDS/report-token)
 * and doPost (Dashboard/session) entry points.
 * @param {number|string} percent  5 or 10 (the discount tier when active)
 * @param {boolean} active         turn promo on/off
 * @param {string} duration        minutes as string, or 'end_of_day'
 * @param {string} msg             banner message
 * @return {{ok:boolean, percent?:number, active?:boolean, end?:string, error?:string}}
 */
function setStorePromo(percent, active, duration, msg) {
  try {
    if (active) {
      var pct = parseInt(percent, 10);
      if (pct !== 5 && pct !== 10) {
        return { ok: false, error: 'invalid_percent' };
      }
      var start = new Date();
      var end;
      if (duration === 'end_of_day') {
        end = new Date();
        end.setHours(23, 59, 59, 999);
      } else {
        var mins = parseInt(duration, 10) || 60;
        end = new Date(start.getTime() + mins * 60 * 1000);
      }
      setConfig('PROMO_PERCENT', String(pct));
      setConfig('PROMO_5PERCENT_ACTIVE', 'true');
      setConfig('PROMO_5PERCENT_START', start.toISOString());
      setConfig('PROMO_5PERCENT_END', end.toISOString());
      setConfig('PROMO_5PERCENT_MSG', msg || 'Ưu đãi đặc biệt: Giảm giá toàn bộ menu!');
      return { ok: true, percent: pct, active: true, end: end.toISOString() };
    } else {
      // Tắt: giữ PROMO_PERCENT để nhớ tier gần nhất.
      setConfig('PROMO_5PERCENT_ACTIVE', 'false');
      setConfig('PROMO_5PERCENT_START', '');
      setConfig('PROMO_5PERCENT_END', '');
      return { ok: true, active: false };
    }
  } catch (err) {
    logError('setStorePromo', err);
    return { ok: false, error: String(err) };
  }
}
```

- [ ] **Step 4: Refactor the doGet `set_promo` branch to call the helper and accept `percent`**

In `gas/Code.gs`, replace the whole branch body (lines 282-311) with:

```javascript
    if (action === 'set_promo') {
      if (!_requireTokenIfSet(e)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      if (!isDeviceApproved(e.parameter.device_id)) return _jsonResponse({ ok: false, error: 'device_not_approved' });
      var active = e.parameter.active === 'true';
      var duration = e.parameter.duration || '60'; // minutes or 'end_of_day'
      var percent = e.parameter.percent || '5';     // default 5 for backward-compat
      var msg = e.parameter.message || 'Ưu đãi đặc biệt: Giảm giá toàn bộ menu!';

      var result = setStorePromo(percent, active, duration, msg);
      if (!result.ok) return _jsonResponse({ ok: false, error: result.error || 'set_promo_failed' });

      var promo = _getPromoInfoInternal();
      return _jsonResponse({ ok: true, promo: promo });
    }
```

- [ ] **Step 5: Verify `logError` exists (helper sanity)**

Run: `grep -n "function logError" gas/*.gs`
Expected: at least one match (the helper is referenced project-wide). If absent, replace `logError('setStorePromo', err);` in Step 3 with `Logger.log('setStorePromo error: ' + err);` and note it in the commit.

- [ ] **Step 6: Deploy GAS and verify with curl (5% backward-compat)**

Deploy: `cd gas && clasp push` then redeploy a new Web App version (manual, per ops rules). Let `GAS_URL` be the deployed `/exec` URL, `TOKEN` the REPORT_API_TOKEN, `DEV` an approved device_id.

Run:
```bash
curl -s "$GAS_URL?action=set_promo&active=true&duration=60&percent=5&token=$TOKEN&device_id=$DEV"
```
Expected JSON contains: `"ok":true` and `"promo":{...,"active":true,"percent":5,...}`.

- [ ] **Step 7: Verify the 10% tier and validation**

Run:
```bash
curl -s "$GAS_URL?action=set_promo&active=true&duration=60&percent=10&token=$TOKEN&device_id=$DEV"
curl -s "$GAS_URL?action=set_promo&active=true&duration=60&percent=7&token=$TOKEN&device_id=$DEV"
curl -s "$GAS_URL?action=promo_info"
```
Expected: first returns `"percent":10`; second returns `"ok":false,"error":"invalid_percent"`; third (`promo_info`) reflects the last *successful* write (`percent:10, active:true`).

- [ ] **Step 8: Commit**

```bash
git add gas/SeedSheets.gs gas/Code.gs
git commit -m "feat(gas,promo): PROMO_PERCENT config + setStorePromo helper + percent-aware promo_info"
```

---

## Task 2: GAS — session-gated doPost `set_promo` for Dashboard

**Files:**
- Modify: `gas/Code.gs:109-113` (add a new branch right after the `set_signage` doPost branch, which has the identical session+device gate)

- [ ] **Step 1: Add the doPost `set_promo` branch**

In `gas/Code.gs`, immediately AFTER the `set_signage` branch (which ends at line 113 with `}`), add:

```javascript
    if (payload && payload.action === 'set_promo') {
      if (!validateSessionToken(payload.token)) return _jsonResponse({ ok: false, error: 'unauthorized' });
      if (!isDeviceApproved(payload.device_id)) return _jsonResponse({ ok: false, error: 'device_not_approved' });
      var result = setStorePromo(payload.percent, payload.active === true || payload.active === 'true', payload.duration || '60', payload.message);
      if (!result.ok) return _jsonResponse({ ok: false, error: result.error || 'set_promo_failed' });
      return _jsonResponse({ ok: true, promo: _getPromoInfoInternal() });
    }
```

> Why a standalone branch and not `_ADMIN_WRITE`: matches the existing `set_signage` / `queue_command` pattern (lines 87-113) which gate session+device explicitly. Consistency over cleverness.

- [ ] **Step 2: Deploy GAS and verify doPost happy-path (session)**

Deploy (`cd gas && clasp push` + redeploy). With `SESSION` a valid admin session token and `DEV` an approved device:

```bash
curl -s -X POST "$GAS_URL" -H 'Content-Type: text/plain' \
  -d '{"action":"set_promo","token":"'"$SESSION"'","device_id":"'"$DEV"'","percent":10,"active":true,"duration":120,"message":"Giảm 10% toàn menu chiều nay!"}'
```
Expected: `"ok":true,"promo":{...,"active":true,"percent":10,...}`.

- [ ] **Step 3: Verify doPost rejects a missing/invalid session**

```bash
curl -s -X POST "$GAS_URL" -H 'Content-Type: text/plain' \
  -d '{"action":"set_promo","token":"BOGUS","device_id":"'"$DEV"'","percent":10,"active":true,"duration":60}'
```
Expected: `"ok":false,"error":"unauthorized"`.

- [ ] **Step 4: Commit**

```bash
git add gas/Code.gs
git commit -m "feat(gas,promo): session-gated doPost set_promo for dashboard control"
```

---

## Task 3: order.js — generalize `applyPromo5Percent` → `applyPromoPercent`

**Files:**
- Modify: `web/order.js:1249-1259` (function definition)
- Modify: `web/order.js:1304` and `web/order.js:1347` and `web/order.js:1351` (call sites)
- Modify: `web/index.html:48` (bump `order.js?v=`)

- [ ] **Step 1: Replace the function definition**

In `web/order.js`, replace lines 1249-1259:

```javascript
function applyPromo5Percent(active) {
  MENU_DATA.forEach(item => {
    if (active) {
      item.price_m = Math.round(item.price_m_old * 0.95);
      if (item.price_l_old) item.price_l = Math.round(item.price_l_old * 0.95);
    } else {
      item.price_m = item.price_m_old;
      if (item.price_l_old) item.price_l = item.price_l_old;
    }
  });
}
```

with:

```javascript
function applyPromoPercent(active) {
  const pct = (activePromo && activePromo.percent) ? activePromo.percent : 5;
  const factor = 1 - pct / 100;
  MENU_DATA.forEach(item => {
    if (active) {
      item.price_m = Math.round(item.price_m_old * factor);
      if (item.price_l_old) item.price_l = Math.round(item.price_l_old * factor);
    } else {
      item.price_m = item.price_m_old;
      if (item.price_l_old) item.price_l = item.price_l_old;
    }
  });
}
```

- [ ] **Step 2: Update the three call sites**

In `web/order.js`:
- Line 1304: `applyPromo5Percent(false);` → `applyPromoPercent(false);`
- Line 1347: `applyPromo5Percent(true);` → `applyPromoPercent(true);`
- Line 1351: `applyPromo5Percent(false);` → `applyPromoPercent(false);`

Run to confirm none remain:
```bash
grep -n "applyPromo5Percent" web/order.js
```
Expected: no output.

- [ ] **Step 3: Bump the cache-busting version**

In `web/index.html`, line 48, change:

```html
  <script src="order.js?v=20260528c"></script>
```

to:

```html
  <script src="order.js?v=20260614a"></script>
```

- [ ] **Step 4: Verify pricing in the browser preview at 10%**

Start the preview server (`preview_start` if not running) and open the order page (`web/index.html`). Use `preview_eval` to simulate a 10% promo and assert prices, since `updatePromoState` is the real entry point:

```javascript
// preview_eval
const sample = MENU_DATA[0];
const base_m = sample.price_m_old;
updatePromoState({ active: true, percent: 10, end: new Date(Date.now()+3600000).toISOString(), message: 'test' });
const after10 = MENU_DATA[0].price_m;
updatePromoState({ active: true, percent: 5, end: new Date(Date.now()+3600000).toISOString(), message: 'test' });
const after5 = MENU_DATA[0].price_m;
updatePromoState({ active: false });
const afterOff = MENU_DATA[0].price_m;
JSON.stringify({ base_m, after10, after5, afterOff,
  ok10: after10 === Math.round(base_m*0.90),
  ok5:  after5  === Math.round(base_m*0.95),
  okOff: afterOff === base_m });
```
Expected: `ok10`, `ok5`, `okOff` all `true`.

- [ ] **Step 5: Verify no console errors**

Use `preview_console_logs`. Expected: no errors referencing `applyPromo5Percent` or `applyPromoPercent`.

- [ ] **Step 6: Commit**

```bash
git add web/order.js web/index.html
git commit -m "feat(web,promo): order.js reads activePromo.percent (5/10) + bump version"
```

---

## Task 4: kds.html — percent selector (5% / 10%) + generalized pricing

**Files:**
- Modify: `web/kds.html:314` (panel heading text)
- Modify: `web/kds.html:323-344` (add a percent selector to the promo settings panel)
- Modify: `web/kds.html:489` (add `selectedPercent` state next to `selectedDuration`)
- Modify: `web/kds.html:495-506` (generalize `applyPromo5Percent` → `applyPromoPercent`)
- Modify: `web/kds.html:576,650,673` (call sites)
- Modify: `web/kds.html:584-635` (`updatePromoUI` — show live tier, prefill selector)
- Modify: `web/kds.html:637-659` (`activatePromo` — send `percent`)

- [ ] **Step 1: Add `selectedPercent` state**

In `web/kds.html`, line 489 currently:

```javascript
let selectedDuration = '60'; // Default 1 hour
```

Add right below it:

```javascript
let selectedPercent = '5'; // Default tier
```

- [ ] **Step 2: Generalize the KDS pricing function**

Replace `web/kds.html` lines 495-506:

```javascript
function applyPromo5Percent(active) {
  MENU_DATA.forEach(item => {
    if (active) {
      item.price_m = Math.round(item.price_m_old * 0.95);
      if (item.price_l_old) item.price_l = Math.round(item.price_l_old * 0.95);
    } else {
      item.price_m = item.price_m_old;
      if (item.price_l_old) item.price_l = item.price_l_old;
    }
  });
}
```

with:

```javascript
function applyPromoPercent(active) {
  const pct = (activePromo && activePromo.percent) ? activePromo.percent : 5;
  const factor = 1 - pct / 100;
  MENU_DATA.forEach(item => {
    if (active) {
      item.price_m = Math.round(item.price_m_old * factor);
      if (item.price_l_old) item.price_l = Math.round(item.price_l_old * factor);
    } else {
      item.price_m = item.price_m_old;
      if (item.price_l_old) item.price_l = item.price_l_old;
    }
  });
}
```

Update the three call sites (lines 576, 650, 673): `applyPromo5Percent(` → `applyPromoPercent(`. Then confirm:
```bash
grep -n "applyPromo5Percent" web/kds.html
```
Expected: no output.

- [ ] **Step 3: Add the percent selector UI + setter**

In `web/kds.html`, change the panel heading (line 314) from:

```html
      <span>⭐</span> Cấu hình Khuyến mãi 5% toàn trang web
```

to:

```html
      <span>⭐</span> Cấu hình Khuyến mãi toàn quán
```

Then, inside `#promo-settings-panel`, insert a percent selector BEFORE the "Thời lượng áp dụng" block (i.e. right after line 328's closing `</div>` of the message input, before the `<div style="margin-bottom: 22px;">` duration block at line 330):

```html
      <div style="margin-bottom: 18px;">
        <label class="form-label" style="margin-bottom: 8px; display: block;">Mức giảm</label>
        <div class="mode-btns" style="display: flex; gap: 8px;">
          <div class="mode-btn active" id="percent-5"  onclick="setPromoPercent('5')"  style="flex: 1; padding: 10px 0; text-align: center; border-radius: 8px; border: 1px solid var(--border); cursor: pointer; font-size: 0.85rem;">Giảm 5%</div>
          <div class="mode-btn"        id="percent-10" onclick="setPromoPercent('10')" style="flex: 1; padding: 10px 0; text-align: center; border-radius: 8px; border: 1px solid var(--border); cursor: pointer; font-size: 0.85rem;">Giảm 10%</div>
        </div>
      </div>
```

Add the setter next to `setPromoDuration` (after line 567's closing `}`):

```javascript
function setPromoPercent(pct) {
  selectedPercent = pct;
  document.getElementById('percent-5').classList.toggle('active', pct === '5');
  document.getElementById('percent-10').classList.toggle('active', pct === '10');
}
```

- [ ] **Step 4: Show the live tier in status + prefill the selector**

In `web/kds.html` `updatePromoUI` (lines 593-598), the active branch currently hardcodes "(Giảm 5%)". Replace lines 594-598:

```javascript
    statusTxt.textContent = '🟢 ĐANG HOẠT ĐỘNG (Giảm 5%)';
    statusTxt.style.color = '#81C784';
    msgInput.value = promo.message;
    btnDeactivate.style.display = 'block';
    btnActivate.textContent = 'Cập nhật tin nhắn KM';
```

with:

```javascript
    statusTxt.textContent = '🟢 ĐANG HOẠT ĐỘNG (Giảm ' + (promo.percent || 5) + '%)';
    statusTxt.style.color = '#81C784';
    msgInput.value = promo.message;
    setPromoPercent(String(promo.percent || 5));
    btnDeactivate.style.display = 'block';
    btnActivate.textContent = 'Cập nhật tin nhắn KM';
```

- [ ] **Step 5: Send `percent` from `activatePromo`**

In `web/kds.html` `activatePromo` (line 644), change the URL from:

```javascript
    const url = `${GAS_URL}?action=set_promo&active=true&duration=${selectedDuration}&message=${encodeURIComponent(msg)}${TQ}${DQ}`;
```

to:

```javascript
    const url = `${GAS_URL}?action=set_promo&active=true&percent=${selectedPercent}&duration=${selectedDuration}&message=${encodeURIComponent(msg)}${TQ}${DQ}`;
```

Also update the success alert (line 652) from `'Đã kích hoạt chương trình giảm giá 5%!'` to:

```javascript
      alert('Đã kích hoạt chương trình giảm giá ' + selectedPercent + '%!');
```

- [ ] **Step 6: Neutralize the hardcoded message input default**

In `web/kds.html` line 327, change the input's `value="Khuyến mãi đặc biệt: Giảm giá 5% cho toàn bộ menu!"` to `value="Ưu đãi đặc biệt: Giảm giá toàn bộ menu!"`.

- [ ] **Step 7: Verify in preview**

Open `web/kds.html` in the preview, switch to the "⭐ Khuyến mãi" tab. Use `preview_click` to select "Giảm 10%", then `preview_eval`:

```javascript
selectedPercent;  // expect "10"
```
Expected: `"10"`. Then simulate state and check labels:
```javascript
updatePromoUI({ active: true, percent: 10, message: 'x', end: new Date(Date.now()+3600000).toISOString() });
document.getElementById('promo-status-text').textContent;  // expect contains "Giảm 10%"
```
Expected: contains `Giảm 10%`. Confirm no console errors via `preview_console_logs`.

- [ ] **Step 8: Commit**

```bash
git add web/kds.html
git commit -m "feat(web,kds): 5%/10% promo tier selector + percent-aware pricing"
```

---

## Task 5: dashboard.html — store-wide promo mini-panel + "Đăng MXH" button

**Files:**
- Modify: `web/dashboard.html:352-365` (`loadPromo` — prepend a store-wide control panel above the campaign list)
- Modify: `web/dashboard.html` (add helper functions after `togglePromo`, around line 369)

- [ ] **Step 1: Render the store-wide panel inside `loadPromo`**

In `web/dashboard.html`, replace the `loadPromo` function (lines 352-365) with a version that renders the store-wide mini-panel first, then the existing campaign table. New function:

```javascript
async function loadPromo(){
  const el=document.getElementById('v-promo');el.innerHTML='<div class="empty">Đang tải...</div>';
  let d;try{d=await ensureAdmin();}catch(e){el.innerHTML='<div class="err">⚠ '+esc(e.message)+'</div>';return;}

  // ── Store-wide % promo mini-panel ──
  let sp='<div class="sectitle">🏷️ Giảm giá toàn quán</div>'
    +'<div class="hint">Bật giảm % cho TẤT CẢ món. Tự hết hạn theo thời lượng. Áp dụng ngay trên web khách + biển hiệu.</div>'
    +'<div id="storepromo-status" class="hint" style="margin:6px 0 10px">Đang tải trạng thái…</div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">'
    +'<button class="btn sm" id="sp-off"  onclick="setSpPercent(\'0\')">Tắt</button>'
    +'<button class="btn sm" id="sp-5"    onclick="setSpPercent(\'5\')">5%</button>'
    +'<button class="btn sm" id="sp-10"   onclick="setSpPercent(\'10\')">10%</button>'
    +'</div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">'
    +'<select class="cell" id="sp-duration" style="max-width:180px">'
    +'<option value="60">1 giờ</option><option value="120">2 giờ</option>'
    +'<option value="240">4 giờ</option><option value="end_of_day">Đến hết ngày</option>'
    +'</select></div>'
    +'<input class="cell" id="sp-message" placeholder="Lời nhắn hiển thị" value="Ưu đãi đặc biệt: Giảm giá toàn bộ menu!" style="margin-bottom:10px;width:100%">'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
    +'<button class="btn green" onclick="saveStorePromo()">💾 Lưu</button>'
    +'<button class="btn" onclick="postPromoSocial()">📣 Đăng tin lên MXH</button>'
    +'</div><hr style="margin:18px 0;border:none;border-top:1px solid var(--border)">';

  const rows=d.promotions||[];
  let h='<div class="sectitle">🏷️ Chiến dịch khuyến mãi</div><div class="hint">Bật/tắt chiến dịch. Tạo chiến dịch mới dùng /promo ở tab Trợ lý (tự áp giọng thương hiệu + sinh nội dung).</div>';
  if(!rows.length)h+='<div class="empty">Chưa có chiến dịch. Vào tab Trợ lý → nút /promo để tạo.</div>';
  else{
    h+='<div class="tablewrap"><table><thead><tr><th>Mã</th><th>Tên</th><th>Loại</th><th>Giảm</th><th>Đang chạy</th></tr></thead><tbody>';
    rows.forEach(r=>{const on=(r.is_active===true||r.is_active==='TRUE'||r.is_active==='true');
      h+=`<tr><td>${esc(r.campaign_id)}</td><td>${esc(r.name)}</td><td>${esc(vis(r.type))}</td><td>${esc(r.discount_value)} ${esc(vis(r.discount_type||''))}</td><td><button class="btn sm ${on?'green':''}" onclick="togglePromo('${esc(r.campaign_id)}',${!on})">${on?'ĐANG BẬT':'TẮT'}</button></td></tr>`;});
    h+='</tbody></table></div>';
  }
  el.innerHTML=sp+h;
  loadStorePromoStatus();
}
```

- [ ] **Step 2: Add the store-wide panel helpers**

In `web/dashboard.html`, immediately AFTER the `togglePromo` function (after line 369), add:

```javascript
let spSelectedPercent='0';
function setSpPercent(p){
  spSelectedPercent=p;
  ['0','5','10'].forEach(x=>{const b=document.getElementById('sp-'+(x==='0'?'off':x));if(b)b.classList.toggle('green',x===p);});
}
async function loadStorePromoStatus(){
  const st=document.getElementById('storepromo-status');if(!st)return;
  try{
    const res=await fetch(GAS_URL+'?action=promo_info');const data=await res.json();
    const p=data&&data.promo;
    if(p&&p.active){
      setSpPercent(String(p.percent||5));
      const end=new Date(p.end);
      st.innerHTML='🟢 Đang giảm <b>'+(p.percent||5)+'%</b> · hết hạn '+(isNaN(end)?'?':end.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}));
    }else{setSpPercent('0');st.textContent='🔴 Đang tắt';}
  }catch(e){st.textContent='⚠ Không tải được trạng thái';}
}
async function saveStorePromo(){
  const active=spSelectedPercent!=='0';
  const body={action:'set_promo',token:tk(),percent:spSelectedPercent,active:active,
    duration:document.getElementById('sp-duration').value,
    message:document.getElementById('sp-message').value.trim()};
  const res=await apiPost(body);
  if(res&&res.ok){toast(active?('Đã bật giảm '+spSelectedPercent+'%'):'Đã tắt giảm giá');loadStorePromoStatus();}
  else toast('Lỗi: '+((res&&res.error)||'?'));
}
async function postPromoSocial(){
  if(spSelectedPercent==='0'){toast('Chọn mức giảm 5% hoặc 10% trước');return;}
  const msg=document.getElementById('sp-message').value.trim();
  const dur=document.getElementById('sp-duration').value;
  const durTxt=dur==='end_of_day'?'đến hết ngày':('trong '+dur+' phút');
  const text='/post khuyến mãi giảm '+spSelectedPercent+'% toàn quán '+durTxt+', nội dung: "'+msg+'"';
  const res=await apiPost({action:'queue_command',token:tk(),text:text});
  if(res&&res.ok){toast('Đã đẩy vào hàng đợi trợ lý');}else toast('Lỗi gửi lệnh');
}
```

> `apiPost` (line 193) already injects `device_id`, so the new doPost `set_promo` and `queue_command` both pass the device gate. `tk()` (line 197) supplies the session token.

- [ ] **Step 3: Verify the panel renders + state loads (preview)**

Open `web/dashboard.html` in preview, log in (or stub a session), open the "🏷️ Khuyến mãi" tab. Use `preview_snapshot` to confirm the "Giảm giá toàn quán" heading, the Tắt/5%/10% buttons, duration select, message input, and the two action buttons are present. Use `preview_eval`:

```javascript
setSpPercent('10'); spSelectedPercent;  // expect "10"
```
Expected: `"10"` and the `5%`/`10%` button highlights toggle (check `document.getElementById('sp-10').classList.contains('green')` → `true`).

- [ ] **Step 4: Verify the social-post command text builder**

```javascript
// preview_eval
document.getElementById('sp-message').value='Giảm 10% toàn menu chiều nay!';
document.getElementById('sp-duration').value='120';
setSpPercent('10');
// reproduce postPromoSocial's text without sending:
(function(){const m=document.getElementById('sp-message').value.trim();const d=document.getElementById('sp-duration').value;const dt=d==='end_of_day'?'đến hết ngày':('trong '+d+' phút');return '/post khuyến mãi giảm '+spSelectedPercent+'% toàn quán '+dt+', nội dung: "'+m+'"';})();
```
Expected: `/post khuyến mãi giảm 10% toàn quán trong 120 phút, nội dung: "Giảm 10% toàn menu chiều nay!"`.

- [ ] **Step 5: Commit**

```bash
git add web/dashboard.html
git commit -m "feat(web,dashboard): store-wide 5/10% promo panel + post-to-social button"
```

---

## Task 6: End-to-end verification + display checks across surfaces

**Files:** none (verification only). Requires GAS deployed (Tasks 1-2) and web preview.

- [ ] **Step 1: KDS → server → customer web round-trip (10%)**

Set promo to 10% from KDS preview ("Giảm 10%" + 1 giờ + Kích hoạt). Then `curl -s "$GAS_URL?action=promo_info"` → expect `"percent":10,"active":true`. Reload the order page (`web/index.html`) preview and `preview_eval`:

```javascript
MENU_DATA[0].price_m === Math.round(MENU_DATA[0].price_m_old * 0.90);
```
Expected: `true`.

- [ ] **Step 2: Dashboard → server (set 5%, then off)**

From Dashboard preview: select 5%, Lưu → `loadStorePromoStatus` shows "🟢 Đang giảm 5%". Then select Tắt, Lưu → status shows "🔴 Đang tắt". Confirm via `curl -s "$GAS_URL?action=promo_info"` → `"active":false`.

- [ ] **Step 3: kaeru.html banner reflects the live percent**

Open `web/kaeru.html` in preview with a 10% promo active. `preview_eval`:

```javascript
document.getElementById('promo-banner').classList.contains('hidden') === false;
```
Expected: `true` (banner visible). Confirm discounted prices were applied by `kaeru.js` (it reads `promo.percent` → multiplier `0.90`). Spot-check one price node is reduced ~10% via `preview_inspect` or `preview_snapshot`.

- [ ] **Step 4: signage ribbon shows the promo message**

Open `web/signage.html` in preview with promo active. `preview_eval`:

```javascript
document.getElementById('ribbon').style.display !== 'none';
```
Expected: `true`, and the ribbon text contains the configured message (not a hardcoded "5%").

- [ ] **Step 5: "Đăng MXH" enqueues a `/post` command**

From Dashboard, click "📣 Đăng tin lên MXH" with 10% selected. Then verify the COMMAND_QUEUE received a row — either via the dashboard Chat/Assistant tab (the new `/post ...` line appears) or `curl` whichever endpoint lists queued commands (e.g. `?action=command_list` if present; otherwise check the COMMAND_QUEUE sheet). Expected: one new row whose text starts with `/post khuyến mãi giảm 10% toàn quán`.

- [ ] **Step 6: Spec self-check + final commit**

Re-read the spec's §10 test matrix and confirm each row is covered by Steps 1-5 above. Then:

```bash
git add -A
git commit -m "test(promo): e2e verification notes for 5/10% store promo" --allow-empty
```

(If nothing changed, this `--allow-empty` records that verification ran; otherwise it captures any small fixes found during verification.)

---

## Deployment & integration notes (post-implementation)

- **GAS:** `cd gas && clasp push` then redeploy a NEW Web App version (manual). The doGet/doPost `set_promo` and `promo_info` changes are live only after redeploy.
- **Web:** merge `store-promo-tiers` → `main` via PR (direct push to main is blocked). CI deploys the static site. The `order.js?v=20260614a` bump busts the CDN cache for returning visitors.
- **Out of scope (separate specs, per spec §11):** signage "−X%" badge, auto-posting via FB/IG/Zalo APIs, logging promo activations to PROMOTIONS for ROI, and the Signage customization studio (item B in project memory).

---

## Self-Review

**Spec coverage:**
- §3 CONFIG `PROMO_PERCENT` + seed → Task 1 Steps 1-2 ✅
- §4.1 `setStorePromo` helper → Task 1 Step 3 ✅
- §4.2 doGet accepts `percent` + new doPost session-gated → Task 1 Step 4, Task 2 ✅
- §4.3 `_getPromoInfoInternal` reads percent → Task 1 Step 2 ✅
- §4.4 `/post` via `queue_command` → Task 5 Step 2 (`postPromoSocial`) ✅
- §5 order.js `applyPromoPercent` + rename + version bump → Task 3 ✅
- §6 percent-aware display: kaeru.js already done (verify Task 6 Step 3); signage message-driven (verify Task 6 Step 4); neutral default MSG → Task 1 Steps 1-2 ✅
- §7 Dashboard mini-panel + Đăng MXH + status countdown → Task 5 ✅
- §8 KDS quick control + live tier badge → Task 4 ✅
- §9 validate percent∈{5,10}, gates, logError → Task 1 Step 3 (`invalid_percent`, `logError`), Task 2 gates ✅
- §10 test matrix → Task 6 ✅

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step shows full code.

**Type consistency:** Function named `applyPromoPercent` consistently in order.js (Task 3) and kds.html (Task 4); `setStorePromo(percent, active, duration, msg)` signature identical in helper (Task 1) and both callers (Tasks 1-2); `selectedPercent` (kds) and `spSelectedPercent` (dashboard) are deliberately separate page-scoped globals.

**Note on §8 placement:** Spec said "header bar"; the codebase already has a full KDS promo *tab* (`#view-promo`). Plan extends that existing panel instead of adding a redundant header control — same capability, less duplication. Flagged here so the reviewer knows it's intentional.
