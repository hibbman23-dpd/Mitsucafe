I'll analyze the repo as CTO: map current `Code.gs` routing/auth, how `customer_info` works, and scan for legacy/unused code before synthesizing a Horizon B plan.There's already prior CTO material on Horizon B — I'll compare that with the live `Code.gs` and loyalty/customer paths.Confirming one key product fact: `order.js` never uses `customer.name` from `customer_info`—only stamps/free drinks; name autofill comes from `lhk_user` in localStorage.# Horizon B — CTO Plan (Route Registry · Public Loyalty Hardening · Debt Clean)

**Verdict:** Your proposal is **correct and should ship as designed** — not “mask the name,” **omit name (and other PII) from public `customer_info` entirely**. That matches how the product already works. Pair it with a thin **auth + route registry** refactor of `Code.gs`, then a deliberate **surface-area clean**, without turning Horizon B into another feature factory.

This builds on the existing full review in `docs/cto-review-2026-07-11.md` and the live tree (as of today), not on aspirational docs.

---

## 1. Current state (facts from the repo)

### 1.1 God-router is real

`gas/Code.gs` (~950 LOC) is still the single choke point for **~65+ `action=` routes** across `doPost` / `doGet`, with auth applied **ad hoc**:

| Auth style | Used for | Implementation |
|------------|----------|----------------|
| Public | `menu`, `promo_info`, `signage_config`, `customer_info`, `order_status`, `active_orders` | No gate |
| Report token | KDS, print poller, analytics, dispatcher | `_requireTokenIfSet` (fail-closed if token set; open only if `ALLOW_OPEN_API=true`) |
| Staff token | waste/review forms | `_requireStaffToken` (staff **or** report token) |
| Admin session | dashboard writes/reads | `validateSessionToken` |
| Bank secret | `bank_notification` | Fail-closed vs `BANK_WEBHOOK_SECRET` (already tightened in live code) |
| Camera secret / login | camera + password change | Domain-specific |

There is already a **seed of the right pattern** for admin writes:

```80:91:gas/Code.gs
    var _ADMIN_WRITE = {
      'menu_update': adminMenuUpdate, 'menu_add': adminMenuAdd,
      'inventory_update': adminInventoryUpdate, 'inventory_add': adminInventoryAdd,
      'staff_update': adminStaffUpdate, 'staff_add': adminStaffAdd,
      'promo_toggle': adminPromoToggle, 'config_set': adminConfigSet,
    };
    if (payload && _ADMIN_WRITE[payload.action]) {
      if (!validateSessionToken(payload.token)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      return _jsonResponse(_ADMIN_WRITE[payload.action](payload));
    }
```

Horizon B should **generalize this table** to all actions, not invent a new framework.

### 1.2 Public `customer_info` today

```404:411:gas/Code.gs
    if (action === 'customer_info') {
      // Public (order.js dùng để autofill loyalty). KHÔNG trả field nội bộ.
      var phone = e.parameter.phone;
      if (!phone) return _jsonResponse({ ok: false, error: 'phone required' });
      var info = getCustomerInfo(phone);
      if (info) { delete info.zalo_id; delete info.notes; }
      return _jsonResponse({ ok: true, customer: info });
    }
```

`getCustomerInfo` still returns: `customer_id`, **`name`**, `phone`, stamp fields, free-drink fields, plus (pre-strip) `zalo_id` / `notes`.

Client usage in `web/order.js`:

- Name autofill → `localStorage.lhk_user` (`{ name, phone }`), **not** the API name field.
- API used only for **stamp_count / free_drinks_*** (loyalty card + free-drink checkbox + post-delivery toast).
- `customerLoyalty.name` is **never read** in the UI.

So the user’s product intuition is already how the app behaves. Returning `name` is pure oracle risk with **zero UX benefit**.

### 1.3 Where real names *should* live

| Surface | Auth | Needs real name? |
|---------|------|------------------|
| Checkout autofill (own device) | Browser `localStorage` | Yes — local only |
| KDS / print / labels | Report token (+ CF Access on ops host) | Yes |
| Dashboard / RFM / reviews / Zalo | Admin session or report token | Yes |
| Public `customer_info` | None | **No** |

That is a clean trust boundary: **PII for operators; loyalty counters for the anonymous phone lookup.**

---

## 2. Proposal evaluation: omit name vs mask vs keep

### Recommendation: **omit name (and PII keys) from public loyalty view**

| Option | CTO score | Why |
|--------|-----------|-----|
| **A. Return no name (and no extra PII)** | **Ship** | Matches UX; kills phone→name oracle; one field delete + contract test |
| B. Mask name (`N***`) | Reject | Still proves “account exists with identity”; scrapers still map phones; UX noise if you ever show it |
| C. “Show real name only if same device” | Overkill now | Requires cookies/device binding on public GAS; complexity >> risk at cafe scale |
| D. OTP before loyalty | Future P2 | Strongest; hurts impulse order UX; not needed for Horizon B |

### Why A is safe for UX

1. First visit: user types name once → saved to `lhk_user` on submit.
2. Return visit on **same phone/browser**: name autofills from localStorage; API only refreshes stamps.
3. New device / cleared storage: user re-enters name (normal) — server must **not** “help” by handing out the stored name to whoever knows the phone number.
4. Staff still see names on authenticated KDS/admin paths — no product regression.

### Residual risk after omitting name (be honest)

Public `phone → { stamp_count, free_drinks_* }` is still a **loyalty oracle** (enumerate high-value phones, social-engineer free drinks). Severity is **lower than PII**, but not zero.

**Horizon B minimum (ship):** public DTO = counters only.  
**Horizon B+ (optional, same sprint if cheap):**

- Identical shape for known/unknown phones (already mostly true).
- Cap free-drink use to **server-side validate + reserve** (already a known money-path race; fix there, not in the lookup).
- Later: rate-limit / Turnstile on `customer_info` if abuse appears (CF edge is the right place, not GAS).

Do **not** block Horizon B on OTP.

### Suggested public contract

```json
{
  "ok": true,
  "customer": {
    "stamp_count": 3,
    "stamp_total_ever": 23,
    "free_drinks_earned": 2,
    "free_drinks_used": 1
  }
}
```

Explicitly **never** return: `name`, `customer_id`, `phone`, `zalo_id`, `notes`, addresses, order history.

Implementation note: prefer a dedicated `getPublicLoyaltyByPhone(phone)` (or `toPublicLoyaltyView(info)`) rather than mutate-and-`delete` on the full object — harder to regress.

Admin/KDS keep full `getCustomerInfo` / order row fields behind token/session.

---

## 3. Route registry + auth middleware (Horizon B core)

### Design goal

Make **auth miss impossible by default**: every action has a declared auth class; unknown action → 404/unauthorized, not “fall through to hello catalog.”

### Target shape (GAS-idiomatic, not Express cosplay)

```javascript
// Pseudocode — gas/Routes.gs (or top of Code.gs then extract)
var AUTH = {
  PUBLIC: 'public',
  REPORT: 'report',      // REPORT_API_TOKEN
  STAFF:  'staff',       // STAFF_FORM_TOKEN | REPORT
  ADMIN:  'admin',       // session token
  BANK:   'bank',        // BANK_WEBHOOK_SECRET
  CAMERA: 'camera'       // camera secret / session as today
};

var GET_ROUTES = {
  menu:              { auth: AUTH.PUBLIC, handler: handleMenu },
  promo_info:        { auth: AUTH.PUBLIC, handler: handlePromoInfo },
  signage_config:    { auth: AUTH.PUBLIC, handler: handleSignageConfig },
  customer_info:     { auth: AUTH.PUBLIC, handler: handleCustomerInfoPublic },
  order_status:      { auth: AUTH.PUBLIC, handler: handleOrderStatus },
  active_orders:     { auth: AUTH.PUBLIC, handler: handleActiveOrders }, // already stripped
  orders:            { auth: AUTH.REPORT, handler: handleOrders },
  mark_paid:         { auth: AUTH.REPORT, handler: handleMarkPaid },
  // ...
  dashboard_summary: { auth: AUTH.ADMIN,  handler: handleDashboardSummary },
  waste_form:        { auth: AUTH.STAFF,  handler: webAppWasteForm, response: 'html' },
};

function dispatchGet(e) {
  var action = (e.parameter && e.parameter.action) || '';
  var route = GET_ROUTES[action];
  if (!route) return _jsonResponse({ ok: false, error: 'unknown_action' });
  if (!_authorize(route.auth, e, null)) return _unauthorized(route);
  return route.handler(e);
}
```

Same pattern for `POST_ROUTES` with `payload` + special-case early `web_hit` (keep lock bypass).

### Auth middleware rules (prod)

| Class | Rule |
|-------|------|
| `PUBLIC` | No token; response **must** be a documented public DTO (PII scrub enforced in handler) |
| `REPORT` | Fail-closed on `REPORT_API_TOKEN`; never open via missing config in prod |
| `STAFF` | Staff or report token |
| `ADMIN` | Session only (not report token for writes) |
| `BANK` | Secret always required (already fail-closed in live `Code.gs`) |

Add a one-shot **route inventory test** (Node, like `ops/test_logic.js`): parse registry → assert every action has auth; assert public allowlist is short and documented.

### Migration strategy (low blast radius)

1. **Phase B1 — registry without behavior change:** move existing `if (action === …)` bodies into named handlers; map auth classes 1:1 with current gates.  
2. **Phase B2 — public DTO hardening:** `customer_info` (and double-check `order_status` / `active_orders` still strip totals/PII).  
3. **Phase B3 — extract** handlers into domain files only if B1 file still > ~400 LOC; optional `Loyalty.gs` for `getPublicLoyalty*` / stamp credit (today buried in `Orders.gs`).

Do **not** rewrite payment, print, or order validation in the same PR.

### What not to build

- OAuth2 / JWT for customers  
- Reintroducing `Devices.gs` device approval (already replaced by Cloudflare Access; file is **gone**, docs still lie)  
- Multi-file microservice fantasy inside GAS  

---

## 4. Technical debt / unused surface (Horizon B clean)

### 4.1 High value to remove or quarantine

| Item | Why | Action |
|------|-----|--------|
| `web/logo-explorations.html`, `typography-explorations.html`, `seal-honeycomb.html`, `sign-relief-explainer.html`, `signboard-concept.html`, `mitsu-menu-proto.html`, `mitsu-kit.html` | Design debris under public deploy tree | Move to `brand-assets/explorations/` or archive; **block on public Worker** if kept |
| `gas/WebTraffic.gs` + `action=ga4_pull` | Marked `@deprecated` (GA4 → CF WebHits) but still routable | Drop route from registry; keep file only behind `// rollback` comment or `archive/` |
| Doc refs to `Devices.gs` / device gate | File missing; CF Access is truth | Update `SECURITY_DEPLOY.md`, `master-workflow-v3.md`, agent-map |
| Claimed modules `Loyalty.gs`, `Inventory.gs`, `Promo.gs` | Fiction in CLAUDE / agent-map | Fix docs **or** extract files — don’t leave green checkmarks |
| Root noise: `repomix-output.xml`, ad-hoc PNGs (`v1.png`, `kds-final-*.png`, `suong-*.jpeg`, `anh_cua_ban_hd.png`) | Workspace clutter / accidental commit risk | `.gitignore` + archive or delete after confirm |
| Session handoffs / sample insight reports | Historical | Keep under `docs/` but stop treating as source of truth |

### 4.2 Keep (not “unused”)

- `web/signage.html` + `signage.js` — live product path (`active_orders`)  
- `Archive.gs`, multi-location `Branches.gs` — dormant but intentional; freeze, don’t delete unless you decide freeze = archive  
- Camera / Meta / TikTok modules — experimental; freeze feature work, don’t bulk-delete without owner decision  

### 4.3 Structural debt (schedule, don’t binge)

| Gravity well | LOC | Horizon B stance |
|--------------|----:|------------------|
| `web/order.js` | ~3200 | **Out of scope** except loyalty fetch + any name assumptions |
| `gas/Financials.gs` | ~1060 | Touch only if route extract needs it |
| `gas/Code.gs` | ~950 | **In scope** (registry) |
| `web/kds.html` | ~1300 | Out of scope |

---

## 5. Synthesized Horizon B plan (execution order)

Think in **one theme: stabilize the public/API boundary** — not a feature quarter.

### Sprint HB-1 — Public loyalty contract (½–1 day)

1. Add `toPublicLoyaltyView` / `getPublicLoyaltyByPhone`.  
2. Wire `customer_info` only through it.  
3. Confirm `order.js` still works (it will — name never depended on API).  
4. Smoke: `curl '?action=customer_info&phone=0xxxxxxxxx'` → **no** `name` / `zalo_id` / `notes` / raw phone echo if avoidable.  
5. Document contract in `docs/system/loyalty-stamps.md` + event/API notes.

### Sprint HB-2 — Auth middleware + route registry (1–2 days)

1. Introduce `GET_ROUTES` / `POST_ROUTES` + `_authorize(authClass, e, payload)`.  
2. Mechanical move of existing handlers; **zero product change**.  
3. Collapse duplicated session checks (today copy-pasted for every dashboard action).  
4. Inventory test: list of public actions is explicit and short.  
5. Deploy GAS carefully (manual clasp + version); smoke unauthorized vs authorized for `orders`, `mark_paid`, `customer_info`, `bank_notification`.

### Sprint HB-3 — Dead surface clean (½–1 day)

1. Quarantine exploration HTML from public deploy.  
2. Deprecate/remove `ga4_pull` from live routing.  
3. Doc drift patch: Devices gone, Loyalty lives in Orders (until extract), SECURITY_DEPLOY step 9 accurate.  
4. Optional: extract `Loyalty.gs` **only if** HB-1/2 already landed and tests pass.

### Explicit non-goals for Horizon B

- Multi-branch productization, new social pullers, camera biometrics expansion  
- Full `order.js` modularization  
- OTP-gated loyalty  
- Replacing Sheets  

### Success criteria

| Metric | Pass |
|--------|------|
| Phone→name oracle | Impossible via public API |
| Auth miss risk | New route without `auth` cannot ship (registry) |
| Order / pay / print | Unchanged E2E |
| Checkout UX | Name autofill still works on returning devices via localStorage |
| Deploy surface | No design-exploration pages on public origin |

---

## 6. Comparison: your idea vs best practice

| Your suggestion | Assessment |
|-----------------|------------|
| Masking may hurt UX | Agree — and masking is **security theater** for this threat model |
| Own device doesn’t need server name | **Confirmed in code** (`lhk_user`) |
| Real name only for admin/insights | Correct trust model |
| Public endpoint: stamps + free drinks only | **Best practice for this stack** — ship it |
| Staff see name via KDS/admin | Already true on token/session paths |

**One refinement to your wording:** protect name **by non-disclosure in the public DTO**, not by “background magic.” The client should treat name as **client-owned form state**; the server treats name as **operator PII** written on order create from the client payload, never re-leaked by lookup.

---

## 7. Risk register (Horizon B only)

| Risk | Mitigation |
|------|------------|
| Some client still expects `customer.name` | Grep shows only order.js; re-grep after change; contract test |
| Scrapers still probe stamps | Accept residual; edge rate-limit later |
| Registry refactor breaks lock/`web_hit` | Keep early web_hit bypass; lock scope identical |
| GAS deploy ceremony | One version per HB sprint; gas_health + smoke curls |
| Doc/agent still invent Devices/Loyalty files | Doc patch in same window as code |

---

## 8. Bottom line

Horizon B should be a **boundary sprint**:

1. **Public loyalty = counters only** (your proposal, upgraded from mask → omit).  
2. **Declarative route registry + auth classes** so the next action cannot forget a gate.  
3. **Delete/quarantine deployable junk and doc fiction** so agents stop coding against ghosts.

That is the highest ROI CTO work available without adding features: it reduces scrape risk, auth-miss risk, and cognitive load on the single most dangerous file in the system (`Code.gs`), while leaving the cup path (order → label → pay → stamp) untouched.

If you want this executed next, the safe PR sequence is: **HB-1 alone (loyalty DTO)** → **HB-2 (registry, behavior-preserving)** → **HB-3 (debt clean)** — three small deploys, not one mega-diff.
