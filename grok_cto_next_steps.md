I'll review the repo architecture, recent P0 security work, and roadmap so the CTO assessment is grounded in what's actually shipped.There's already a prior CTO review and security notes — I'll cross-check those against the actual P0 fixes and remaining surface area.Verifying that the stated P0 fixes are actually in the code, then scanning remaining money-path and reliability risks.I spotted a likely regression in the waste-form Telegram link — validating that before the final assessment.# CTO Strategic Assessment — Post-P0 Hardening

**Context:** Branch `launch-hardening`, uncommitted P0 diffs in `gas/*` + `ops/deploy_gas.js`.  
**Stance:** Operate as a one-location F&B business with software leverage — not as an unbounded product studio.

---

## 0. Verdict after P0

| Dimension | Pre-P0 | Post-P0 (code) | Notes |
|-----------|--------|----------------|-------|
| Security | 6.5 | **~7.3** | Gates improved; deploy + config still open |
| Reliability | 7.5 | **~7.6** | Smoke decoupled from Meta; OAuth SPOF remains |
| Money path integrity | 7.0 | **7.0** | Auth better; matching / free-drink race untouched |
| Product readiness | 7.5 | **7.5** | No new features needed for service |
| Maintainability | 6.0 | **6.0** | Debt unchanged |

**Composite: ~7.4 / 10** if P0 is **deployed + config applied**.  
**Composite stays ~7.0** if code sits uncommitted / unpushed to the live Web App.

P0 closed the correct doors. Next risk is not “more security features” — it is **money-path correctness, operational config, and scope discipline**.

---

## 1. What the P0 work actually fixed (and residual gaps)

| Fix | Status in code | Residual |
|-----|----------------|----------|
| Bank webhook fail-closed | `!_bws \|\| secret mismatch → unauthorized` | **CONFIG must set `BANK_WEBHOOK_SECRET`** or *all* bank posts fail (fail-closed works). MacroDroid must send `secret`. Docs in `SECURITY_DEPLOY.md` still describe the old open-if-unset behavior. |
| Waste / review token | `_requireTokenIfSet` on form + submit; forms forward `token` | **Regression:** `cronCloseChecklistReminder` uses `formUrl` but no longer defines it → close-of-day Telegram can throw and skip the whole checklist. Also **puts `REPORT_API_TOKEN` into Telegram** (full KDS/print/admin-equivalent key in chat history). Prefer a **scoped waste token** or CF Access link, not the master report token. |
| Block default admin `123456` | Login + password-change reject weak values | Init still seeds hash of `123456`. After first deploy, owner must set a real password in CONFIG or via a recovery path — intentional pressure, but **ops checklist required**. |
| Deploy smoke ≠ Meta | Smoke hits `action=ping` → default catalog `{ok:true}` | Correct decoupling. Still only proves “Web App answers JSON”, not order/menu/token gates. |

**Ship gate (not optional):**

1. Commit + `clasp`/`gas_push` deploy these GAS changes.  
2. Set `BANK_WEBHOOK_SECRET` + update MacroDroid.  
3. Confirm OAuth consent **In production** (platform P0 from prior outages).  
4. Rotate admin password away from bootstrap.  
5. Fix `formUrl` + stop leaking `REPORT_API_TOKEN` on Telegram before relying on the waste link.

---

## 2. What to prioritize next (CTO order)

Think in **three horizons**. Do not start horizon C while A/B are open.

### Horizon A — This week (close the loop + money safety)

| # | Item | Why CTO cares | Effort |
|---|------|---------------|--------|
| **A1** | **Deploy P0 + config checklist** | Code without live deploy is theater | 0.5 d ops |
| **A2** | **Fix waste-link regression + scoped token** | P0 introduced a runtime bug and a secret-channel leak | 0.5–1 d |
| **A3** | **OAuth “In production” verified** | Silent 7-day order death is still the #1 business risk | 30 min console |
| **A4** | **Bank short-code match tighten** | `isShortCodeInDescription` allows `"7"` ≈ `"Q07"` — wrong order can be auto-PAID under same amount | 0.5–1 d |
| **A5** | **`order_id` uniqueness under lock** | 4 random digits, no collision check | 0.5 d |
| **A6** | **Free-drink reserve at order create** | Validate at order, debit at pay → double-redeem race | 1 d |
| **A7** | **Nightly smoke pack** | `menu` public · `orders` unauthorized · `ping` health · bank unauthorized · waste unauthorized | 1–2 d |

**Product features in this week: none.** Reliability of cup-out-the-door > any new module.

### Horizon B — Next 2–4 weeks (stabilize & harvest)

| # | Item | Rationale |
|---|------|-----------|
| **B1** | **Doc truth sprint** | README Day checklist, agent-map claiming `Loyalty.gs`/`Inventory.gs`, CLAUDE naming, “append-only ORDERS” vs lifecycle updates, `SECURITY_DEPLOY` bank wording | Agents and humans will re-ship fiction. |
| **B2** | **Money-path tests in repo** | Port `testReconcileVcbNotification` + free-drink + server pricing into `ops/test_logic.js` (or CI Node suite) | Payments are the only path where a bug steals cash or trust. |
| **B3** | **Auth middleware table in `Code.gs`** | `action → { auth: public\|token\|session\|bank, handler }` without full rewrite | Every new `action=` is an auth-miss risk; 900-line switch is the failure mode. |
| **B4** | **Public oracle hardening** | `customer_info` phone → name/stamps | Rate-limit / session / only after order context. |
| **B5** | **Asset hygiene** | Exploration HTML under `web/` on public Worker | Noindex + block or move out of deploy tree. |
| **B6** | **Operational SLOs** | Order accept >99% · label print p95 <60s · KDS error <1% · gas_health green | Make reliability measurable; Telegram already partial. |
| **B7** | **Insight ROI loop only** | Log decision → 14-day outcome; freeze new AI skills | Prove briefs change owner behavior before more Hermes work. |

### Horizon C — Selective upgrades (only after A/B)

Ranked by **value ÷ effort for a single cafe**, not “cool product”:

| Priority | Upgrade | When |
|----------|---------|------|
| **C1** | **Tax readiness (NĐ 70 / HĐĐT threshold watch + monthly revenue export)** | Legal/business risk as revenue approaches 1 tỷ/năm — start *threshold watch*, not full MISA integration yet |
| **C2** | **Manual Grab/Shopee order entry on KDS** (`utm_source=grabfood`) | Closes data hole without waiting for partner APIs |
| **C3** | **SePay (or better bank webhook) formalization** | MacroDroid is fragile; production payment rail needs a real provider + secret + tests |
| **C4** | **Prepaid / membership balance** | Retention; reuses VietQR + CUSTOMERS |
| **C5** | **Order-ahead `pickup_time`** | Small UX win for tourists / peak |
| **C6** | Modularize `order.js` / split Loyalty from Orders | Engineering quality when you still edit weekly |

**Explicit deprioritize (6 months):** multi-branch productization, camera biometrics, Zalo Mini App, new social pullers, replace Sheets “for modernity,” expanding agent roster.

---

## 3. Hidden risks & architectural issues (workflow-level)

### 3.1 Single points of failure (business-critical)

```
Customer order  → GAS Web App (OAuth grant)  → Sheets
Label / receipt → Mac Mini poller + Flask     → LAN printer
Auto-pay        → Phone MacroDroid → bank webhook secret → markOrderPaid
```

| Risk | Severity | Mitigation next |
|------|----------|-----------------|
| GAS OAuth Testing → 403 | **Critical** | Production consent + keep `gas_health` launchd |
| Mac Mini down | High | Offline SOP L3; verify launchd + print poller alive daily |
| MacroDroid phone dies | High | Manual mark_paid path trained; SePay as medium-term |
| LockService contention under promo rush | Medium | Already write-lock scoped; monitor “System busy” |
| Sheets full-table scans (reconcile, customer, idempotency) | Medium now / High at 150+ o/day | Archive + ScriptCache + header maps |

### 3.2 Auth model is still “one master key”

`REPORT_API_TOKEN` gates: KDS orders, mark_paid, print marks, waste, review, marketing pulls, rollups, dispatch. Putting that token in Telegram (close-checklist) collapses all of those privileges into chat history.

**Architecture improvement:** capability tokens or at least separate:

- `PRINT_TOKEN` (poller)
- `STAFF_FORM_TOKEN` (waste/review)
- `REPORT_API_TOKEN` (dashboard/KDS/analytics)

Cost is low; blast radius of a leak drops dramatically.

### 3.3 “Fail-closed if set” vs true fail-closed

`_requireTokenIfSet` still opens if `REPORT_API_TOKEN` is empty **and** `ALLOW_OPEN_API=true`. Bank path is now true fail-closed. Waste path is only as strong as token presence.

**CTO rule:** Prod CONFIG must assert tokens present; health check should alert if `ALLOW_OPEN_API=true` or token empty.

### 3.4 Doc/code dual reality (agent hazard)

Docs still describe:

- Append-only ORDERS (reality: lifecycle columns mutate — correct, but must say so)
- Modules `Loyalty.gs` / `Inventory.gs` (loyalty lives in `Orders.gs`)
- Glide-centric flow in architecture while PWA `order.js` owns customer path
- Bank webhook open-if-unset

Every agent session that reads fiction will reintroduce bugs. **Doc debt is a reliability bug**, not polish.

### 3.5 God-router + gravity wells

| File | LOC | Risk |
|------|----:|------|
| `web/order.js` | ~3,200 | Entire customer commerce surface |
| `web/kds.html` | ~1,306 | Kitchen critical path as monolith |
| `gas/Financials.gs` | ~1,060 | Finance + forms + email |
| `gas/Code.gs` | ~929 | Every `action=` auth decision |

Next architectural step is **not microservices** — it is **route registry + domain extract (Loyalty, Payment reconcile tests)** while keeping Sheets.

### 3.6 State machine vs print reality

Docs: labels at **CONFIRMED**. Implementation: poller prints pending labels for NEW-ish unpaid path. Staff training and KDS UX must match **poller-driven print**, or you will chase “ghost bugs” that are really process mismatch.

### 3.7 Payment reconciliation semantics

- Amount must match **and** content must contain short_code / order_id — good (no amount-only pay).
- Numeric short-code stripping is **too friendly** for auto-pay.
- Empty transfer content never auto-pays — safe, but ops must know.
- No uniqueness on which order matches first among same-amount short codes.

This is the next money P1 after P0 auth.

### 3.8 Free-drink / stamp accounting

Stamps credit on `markOrderPaid`; free-drink availability checked at order create. Without reserve, two concurrent checkouts can both pass. Under lock on `doPost` this is partially serialized **for create**, but pay-time debit still races with other creates if status paths differ. Treat as **ledger design**, not a one-line fix.

### 3.9 Scope explosion vs operator capacity

Repo contains: full order OS, dual Workers, local Hermes/Ollama, eval harness, camera AI, multi-branch rollup, content/film plans, growth-OS productization notes. For one owner-operator, **horizontal expansion is the strategic failure mode**.

**Policy recommendation (90 days):**

- **Green path only:** order → print → pay → stamp → KDS → daily cash close  
- **Yellow:** insight brief if it changes ≥2 decisions/month with measured outcome  
- **Red freeze:** multi-location HQ product, biometrics, new pullers, selling “OS to other shops” until green path SLOs hold for 30 consecutive days  

### 3.10 Deploy asymmetry

- `web/` → CI auto-deploy  
- `gas/` → manual deploy ceremony  

P0 lives entirely in GAS. Web can be “green” while money path is still pre-P0 in production. **Always treat GAS version number as the production truth**, not git `main`.

### 3.11 Compliance / legal (non-code but CTO-owned)

| Topic | Why next |
|-------|----------|
| NĐ 70 HĐĐT threshold | Revenue trajectory → legal obligation; PDF invoice ≠ HĐĐT |
| PDPD (phone, stamps, camera) | Customer PII; face path should stay frozen |
| Privacy / retention | WEB_HITS prune exists; ORDERS forever needs explicit policy |

---

## 4. Recommended 90-day sequence

```
Week 1   Deploy P0 · fix formUrl/token leak · OAuth prod · secrets set
Week 2   Short-code tighten · order_id unique · free-drink reserve · smoke CI
Week 3   Doc truth sprint · SECURITY_DEPLOY sync · asset block explorations
Week 4   Money-path unit tests · customer_info hardening · SLO dashboard
Month 2  Code.gs auth registry · Loyalty extract · SePay evaluation
Month 3  Tax threshold watch · Grab manual KDS entry · only then prepaid/order-ahead
```

**Feature freeze rule:** No new `action=` without an auth class in the registry table and a smoke assertion.

---

## 5. What *not* to do next

1. **Do not** start multi-branch / HQ productization.  
2. **Do not** expand camera face recognition before consent UX.  
3. **Do not** build more cafe-manager skills until insight ROI is measured.  
4. **Do not** migrate off Sheets “because scale” at current volume.  
5. **Do not** treat uncommitted P0 as production-secure.  
6. **Do not** put master `REPORT_API_TOKEN` in Telegram (or any shared chat).

---

## 6. Bottom line

You now have **adult fail-closed gates** on bank money, staff forms, admin bootstrap, and deploy smoke. That was the right P0 sequence.

The CTO job for the next quarter is **not innovation** — it is:

1. **Make P0 real in production** (deploy + secrets + OAuth).  
2. **Fix the P0 side-effects** (`formUrl`, token-in-Telegram).  
3. **Harden money semantics** (match, order id, free-drink ledger).  
4. **Instrument the green path** (smoke + SLOs).  
5. **Tell the truth in docs** so agents stop coding from fiction.  
6. **Only then** unlock selective product (tax readiness, delivery-channel data, prepaid).

You already own a **real store operating system**. The strategic win is boring reliability at the counter — not another horizontal module.

---

If you want a follow-up, the highest-leverage next engineering slice is a single PR: **fixUrl fix + scoped waste token + bank match tighten + `order_id` uniqueness** (still pure money/reliability, no features).
