# CTO Full-Repository Review — Lâm Hà Kissaten / Mitsu

**Date:** 2026-07-11  
**Reviewer stance:** CTO, 15+ years (startup + production systems)  
**Branch reviewed:** `launch-hardening` (ahead of recent production hardening)  
**Scope:** Full repository — GAS event bus, Sheets DB, web/PWA, Workers, print pipeline, local AI/insight, ops automation, docs/agents  

**Mission source:** `.grok/REVIEW_INSTRUCTIONS.md`

---

## 1. Executive Summary (1 page)

**Verdict: Ship-ready as a single-store operations OS — not yet as a “product platform.”**  
This is an unusually complete system for a single F&B shop: order intake → kitchen labels → payment reconciliation → KDS → loyalty stamps → financials → marketing attribution → local LLM insight. Most cafes at this stage still run paper + bank app. The engineering ambition is high and often well-executed where it matters (money path, print, fail-closed tokens).

**Overall health score (CTO composite): 7.2 / 10**

| Domain | Score | One-line |
|--------|------:|----------|
| Architecture fit for 1 store | 8.5 | Sheets + GAS is correct for this scale |
| Code quality / maintainability | 6.0 | God-files, doc drift, surface area explosion |
| Security | 6.5 | Hardened recently; residual open/weak gates |
| Reliability / ops | 7.5 | Launch-hardening + watchdog; GAS OAuth fragility remains |
| Performance / scalability | 6.0 | Fine for 1 store; Sheets wall is real |
| Product / UX alignment | 7.5 | Strong brand + ordering; control UIs dense |
| AI / agent layer | 7.0 | Thoughtful local RAG + eval; ROI still unproven |
| DevOps / delivery | 7.0 | Web CI solid; GAS still manual + SPOF |

### What is genuinely excellent

1. **Money path is taken seriously** — server-side price recalculation in `validateOrderPayload` (no trust of client prices), idempotent `markOrderPaid`, bank webhook secret design, VietQR content matching with short-code boundaries.
2. **Security posture improved materially** — dual Workers (`mitsucafe` public / `mitsu-ops` Access-gated), token injection for KDS, fail-closed `_requireTokenIfSet`, salted admin password KDF, launch-hardening removed dead device-gate noise.
3. **Operational realism** — offline SOP tiers, print poller architecture (GAS cannot push to LAN), gas_health watchdog after the 7-day OAuth 403 incident, ERROR_LOG + Telegram throttle.
4. **Local insight system** — deterministic metrics first, LLM second, quarantine + human approval, FREEZE on eval regression — rare discipline for a cafe stack.

### What will hurt you next

1. **Scope explosion vs single-operator capacity** — multi-location rollups, Meta/TikTok/GBP pipelines, camera AI, Hermes local models, 30+ GAS modules, 1.3k+ `.claude` files. Complexity tax compounds faster than revenue.
2. **Documentation lies** — README still Day-1 checklist; `docs/agent-map.md` claims `Inventory.gs` / `Loyalty.gs`; CLAUDE naming list outdated; architecture “append-only ORDERS” vs real update-in-place status columns.
3. **Single-file gravity wells** — `Code.gs` (~920 LOC router), `Financials.gs` (~1060), `order.js` (~3200), `kds.html` (~1300). These are where bugs hide and reviews die.
4. **GAS as SPOF** — public Web App + OAuth consent in Testing mode already caused silent order-taking death; every redeploy is a ceremony risk.
5. **Residual security holes** — `bank_notification` open if secret unset; waste/review forms unauthenticated; default admin `123456`; VietQR bank identity hardcoded in public JS; public `customer_info` phone oracle.

### CTO recommendation (next 90 days)

**Do not build more features.** Run a **“Stabilize & Harvest”** quarter:

1. **P0 security & reliability gates** (bank secret mandatory, waste auth, OAuth Production, admin password).
2. **Cut surface area** — freeze multi-location, freeze camera face/biometrics for launch, archive design explorations from deploy tree.
3. **One golden path E2E test** run nightly (order → label → pay → stamp) + keep gas_health.
4. **Doc debt sprint** (1–2 days) so future agents stop shipping from fiction.
5. Only then invest in AI insight ROI measurement (did weekly digests change a decision that moved revenue?).

**Business fit:** Correct stack for Lâm Hà volume. Wrong stack if you expect 5 branches or 500 orders/day without migration plan. Sheets is a feature until it becomes a cliff.

---

## 2. Architecture & Tech Stack

### 2.1 Current architecture (as built)

```
Channels (web PWA, QR, Zalo, phone, social)
        │ webhook / UTM
        ▼
Google Apps Script  ── doPost/doGet event bus (LockService)
        │
        ▼
Google Sheets  ── ORDERS, MENU, CUSTOMERS, CONFIG, + many ops tabs
        │
   ┌────┼────────────┬──────────────┬────────────────┐
   ▼    ▼            ▼              ▼                ▼
Telegram  Zalo    Print poller    KDS/Dashboard   Local Mac
alerts   notify   (Mac Mini)      (ops.mitsu)     (Hermes/Ollama)
                    │
                    ▼
              Flask print server → Xprinter LAN
```

**Edge:** Cloudflare Workers  
- `mitsucafe` → public site + security headers + web_hit logging  
- `mitsu-ops` → control pages + REPORT_API_TOKEN injection + R2 signage upload  
- `approve` worker → Telegram approval KV loop for local insight  

### 2.2 Assessment

| Decision | Verdict | Why |
|----------|---------|-----|
| GAS + Sheets as bus/DB | **Correct for 1 store** | Zero infra cost, owner can open data, matches skill set |
| No external DB (CLAUDE guardrail) | **Correct now** | Premature Postgres would add ops without customers |
| Poll-based print (not push) | **Correct** | GAS cannot reach LAN; poller is the right pattern |
| Dual CF Workers + Access | **Strong** | Separates public attack surface from ops |
| Server-side pricing | **Mandatory & done** | Trust boundary fixed after 2026-07-02 web review |
| Glide → custom PWA | **Good** | Less vendor lock; `order.js` owns UX now |
| Local Ollama insight | **Interesting bet** | Privacy + cost; value unproven until decisions stick |

### 2.3 Architecture risks

1. **God-router anti-pattern** — `gas/Code.gs` is a 900-line action switchboard. Every new `action=` increases cognitive load and auth-miss risk.  
2. **“Append-only ORDERS” is marketing, not truth** — status timestamps and payment_status are updated in place (`updateOrderStatus`, `markOrderPaid`, `updateField`). Acceptable, but docs must say “order payload immutable; lifecycle columns mutable.”  
3. **Claimed modules missing as files** — no `Loyalty.gs`, `Inventory.gs`, `Promo.gs`, `Devices.gs` (deleted). Loyalty lives inside `Orders.gs` (`_creditStampsForOrder`). Agent map still marks Inventory/Loyalty as ✅ separate modules.  
4. **Scale cliff** — full-sheet scans (`getDataRange`) in payment reconcile, customer lookup, short_code sequencing. Fine at tens of orders/day; painful at hundreds.  
5. **Config as runtime DB** — secrets, sessions, promo flags all in CONFIG sheet + PropertiesService. Works; session store in sheet cell JSON is fragile under concurrent logins.  
6. **Hardcoded production URLs** — GAS deployment URL and bank QR identity in multiple client files; rotation is multi-file search/replace.

### 2.4 Tech stack fitness matrix

| Layer | Tech | Fit | Notes |
|-------|------|-----|-------|
| Backend | Google Apps Script | High (now) | 6-min exec, quotas, no real tests in CI |
| Data | Google Sheets | High (now) | Concurrent write limits; no transactions |
| Edge | CF Workers | High | Good split public/ops |
| Frontend | Vanilla HTML/JS | Medium | Fast ship; 3k-line order.js hurts |
| Print | Python Flask + ESC/POS | High | Proven for thermal |
| AI | Ollama + RAG + eval | Medium-High | Well designed; ops burden |
| Auth | Token + session + CF Access | Medium-High | Gaps remain (see §4) |

---

## 3. Code Quality, Maintainability, Technical Debt

### 3.1 Size & gravity wells

| Artifact | ~LOC | Risk |
|----------|-----:|------|
| `gas/` total | ~8,900 | Wide surface |
| `gas/Financials.gs` | 1,060 | Reporting + forms + email |
| `gas/Code.gs` | 919 | Auth/routing SPOF |
| `gas/Orders.gs` | 672 | Money + loyalty mixed |
| `web/order.js` | 3,202 | Entire customer app |
| `web/kds.html` | 1,306 | Kitchen critical path |
| `web/dashboard.html` | 677 | Admin surface |
| `docs/` | 83 files | Often ahead/behind code |
| `.claude/` | 52MB (worktrees) | Agent noise in workspace |

### 3.2 Strengths

- Clear Vietnamese + English comments on non-obvious security decisions (token fail-closed, free-drink pricing parity with bank match).
- Recent idempotency for orders (`idempotency_key`) and `markOrderPaid` — production scars converted into code.
- Retry wrapper `_executeWithRetry` for transient Sheets errors — pragmatic.
- `ops/test_logic.js` + web `*.test.js` + `eval/` golden questions — not empty, though incomplete.
- Launch-hardening commit message shows real incident learning (OAuth 7-day Testing mode).

### 3.3 Debt inventory (prioritized)

| ID | Debt | Severity | Example |
|----|------|----------|---------|
| D1 | Doc/code drift | High | README Day checklist incomplete; agent-map missing files |
| D2 | Monolith frontend | High | `order.js` owns menu, cart, payment, tracking, loyalty |
| D3 | God router GAS | High | All actions in `Code.gs` |
| D4 | Mixed domains in Orders | Medium | Validation + sheet + stamps + customer CRUD |
| D5 | Magic column indices | Medium | `row[19]` payment_status, `row[25]` short_code |
| D6 | Design HTML in deploy tree | Low-Med | logo-explorations, seal-honeycomb, typography — public unless blocked |
| D7 | Naming inconsistency | Low | CLAUDE lists Promo.gs/Loyalty.gs; tree has Marketing.gs/Orders |
| D8 | Worktree bloat | Low | `.claude/worktrees/*` duplicates full trees |
| D9 | Test gap on money path | High | No CI test for server pricing / bank match / free drink |
| D10 | GAS deploy not in CI | Medium | Manual clasp/gas_push; drift risk |

### 3.4 Maintainability score drivers

Positive: modular GAS files by domain (mostly), CONFIG centralization, SECURITY_DEPLOY runbook, web-review DONE doc with evidence.

Negative: one person + agents expanding horizontally; every skill in cafe-manager multiplies “almost automation” without permanent ownership; dead endpoints and deprecated GA4 path still in tree.

---

## 4. Security (P0 / P1 first)

### P0 — Fix before relying on production money path

| # | Issue | Evidence | Impact | Fix |
|---|--------|----------|--------|-----|
| S1 | **`bank_notification` open when `BANK_WEBHOOK_SECRET` unset** | `Code.gs` ~176–181: if no config, accepts any POST | Attacker marks arbitrary unpaid orders PAID (if they can guess/match amounts/codes) or spam reconcile | **Require secret always** (fail-closed). Remove backward-compat open mode. |
| S2 | **GAS OAuth / Access “Anyone” + Testing project** | launch-hardening notes 7-day 403; web review P0.1 | Entire order intake silently dies; UI still shows static menu | Publish OAuth app **In production**; gas_health already monitors — keep it |
| S3 | **Default admin password `123456`** | `CameraAI.gs` init | Dashboard/camera compromise if not changed | Force password change on first login; refuse weak passwords |
| S4 | **Unauthenticated waste (and likely review) web forms** | `Code.gs` waste_form/waste_submit without token; `Waste.gs` HTML form | Inventory sabotage / garbage data / distraction | Gate with staff PIN or REPORT token or CF Access link |

### P1 — High priority

| # | Issue | Evidence | Impact | Fix |
|---|--------|----------|--------|-----|
| S5 | **Phone → customer oracle** | `action=customer_info` public; strips zalo/notes but returns stamps/name | Enumerate phones for stamp balances / names | Rate-limit, CAPTCHA, or return only after OTP/session |
| S6 | **Loose bank short-code match** | `isShortCodeInDescription` allows numeric form `"7"` for `"Q07"` | Wrong order marked paid if same amount | Require full short_code or order_id in transfer content; never amount-only |
| S7 | **VietQR bank account + name in public JS** | `order.js` BANK_QR | Owner identity + account public (expected for QR pay, but repo amplifies) | Accept for payment UX; ensure repo visibility intentional; no extra PII in comments/tests |
| S8 | **Spreadsheet ID in `QUAN.yaml`** | `data_source.sheet_id` | Targeted sheet attacks if sharing misconfigured | Confirm Sheets ACLs; consider not committing ID if repo public |
| S9 | **Admin sessions in CONFIG cell JSON** | `ADMIN_SESSIONS` | Concurrent writes, no server-side revocation UX, 2h TTL OK | Move to PropertiesService only; single-session option |
| S10 | **Password KDF 1200× SHA-256** | `hashPassword` | Better than plain SHA; still weaker than bcrypt/scrypt; OK if sheet private | Accept for GAS; increase iterations if feasible |
| S11 | **CSP still `unsafe-inline` on control pages** | `src/ops.js` CONTROL_CSP | XSS → token theft from injected HTML | Long-term nonces; short-term strict input escaping (order.js has `esc`, use everywhere) |
| S12 | **Print server unauthenticated on LAN** | Flask routes open | Any LAN client can print spam | Bind 127.0.0.1 only (if not already) + optional shared secret |

### P2 — Medium

- `ALLOW_OPEN_API` migration escape hatch — ensure never true in prod.
- Exploration HTML under `web/` may be served on public worker unless blocked.
- Biometric/camera face path: PDPD (Nghị định 13) consent still open (SECURITY_DEPLOY notes).
- Cloudflare Google tag gateway residual injection (DONE review C.1) — privacy + perf.

### Security positives (credit)

- Fail-closed report token design.
- Public worker 404s control paths.
- Server-side pricing (eliminated free-order exploit).
- `customer_info` strips `zalo_id` + `notes`.
- UUID-based secrets (not Math.random) for tokens.
- Token not committed; injected at edge for KDS.

---

## 5. Performance & Scalability

### 5.1 Current scale assumptions

Single location, low concurrent cashiers, tens–low hundreds orders/day. **Architecture is appropriate.**

### 5.2 Observed / documented performance

| Surface | Status | Notes |
|---------|--------|-------|
| Landing LCP | ~6.8s throttled mobile after web-review | Still above ideal &lt;4s; hero/image path remains |
| Order app LCP | ~2.1s | Acceptable |
| SEO/A11y lighthouse | High after fixes | Evidence in DONE doc |
| GAS latency | Variable | Cold starts + Sheets; KDS poll sensitive |
| Print poll | 3s default | Acceptable kitchen latency |

### 5.3 Bottlenecks

1. **Full table scans** — `findOrderForReconciliation`, `getCustomerInfo`, idempotency key scan, short_code daily count.  
2. **`getTodayOrders` with per-customer stamp lookup** — O(orders × customer scan) with cache only per request.  
3. **`markOrderPaid` → `computeDailyMetrics`** — financial recompute on every payment may lengthen critical path.  
4. **LockService on all doPost** — good for consistency; under burst (promo rush) clients see “System busy”.  
5. **order.js payload size** — large client JS on mobile networks.  
6. **Sheets row growth** — no archival automation called out as always-on (Archive.gs exists; verify scheduled).

### 5.4 Scalability ceiling (honest)

| Orders/day | Outlook |
|------------|---------|
| &lt; 50 | Comfortable |
| 50–150 | Watch GAS timeouts + KDS poll errors |
| 150–300 | Need caching, indexed lookups, archive |
| 300+ multi-branch | **Migrate off Sheets** for ORDERS (keep Sheets as warehouse optional) |

Multi-location code (`Branches.gs`, `daily_rollup`) is premature optimization of structure without solving single-node performance.

---

## 6. UX / UI & Product Alignment

### 6.1 Product thesis

Mitsu is positioning as a branded kissaten experience (勤/律/創 bees, seal language) with serious local ops automation. Brand system in `brand-assets/` and landing is **above typical local cafe quality**.

### 6.2 Customer path

- QR → `/?t=NN` rewrite to ordering app — clean.
- Server-issued `short_code` (Q/M/G + seq) — excellent for counter communication.
- Active order tracking via public `active_orders` / `order_status` — good UX; privacy tradeoff managed by stripping totals from `active_orders`.
- Free drink + stamp display — product-aligned; server validates availability at order time.

### 6.3 Staff path

- KDS hardened after hang incident (diagnostic cards, no false success on mark_paid).
- Dashboard is dense “owner cockpit” — power-user, not new-hire friendly.
- Waste form useful but must not stay open on the public GAS URL.

### 6.4 Gaps vs CLAUDE state machine

Docs say labels at CONFIRMED; implementation polls pending labels for NEW-ish unpaid print path (poller). Recent docs updates improved alignment; still educate staff: **print timing is poller-driven, not pure state-machine pure.**

Loyalty / PDF invoice / some Zalo paths still partially stubbed in side-effects comments (`// Tier 2`).

### 6.5 Product risk

Building **AI company for one cafe** can starve **cafe operations** time. Agent map lists 15+ agent roles; one owner. Product priority should be: **reliable cup out the door**, then retention, then insight theater.

---

## 7. AI / Agent Layer Evaluation

### 7.1 Layers present

| Layer | Components | Maturity |
|-------|------------|----------|
| Claude Code skills/commands | cafe-manager, sang/tuan/roi/post… | High process, variable runtime truth |
| GAS agent endpoints | insights, decisions, marketing pulls | Wired |
| Hermes local insight | sheets_pull, insight_batch, memory, eval | Well designed |
| Eval harness | golden_core, golden_shop, FREEZE | **Best practice** |
| Camera AI | dual_camera_ai, traffic_ingest | Experimental / compliance-sensitive |
| Dispatcher | command queue from dashboard | Clever; depends on local Mac uptime |

### 7.2 What is good

- **Deterministic metrics before LLM** in `insight_batch.py` — reduces hallucination on revenue/AOV.
- **Quarantine + Telegram approval** — human-in-the-loop for memory writes.
- **Eval + FREEZE** — quality regression can stop automatic learning.
- **KB split core vs shop** — reusable F&B knowledge vs local.
- **Token efficiency playbook** — self-aware cost control for agent work.

### 7.3 What is weak / risky

1. **Unclear business ROI** — no closed loop showing “insight → action → revenue delta” as a KPI dashboard default.  
2. **Model ops burden** — Ollama tags, Modelfile, installer fragility (already patched once).  
3. **Agent map overclaims** — marks modules ✅ that are partial or embedded.  
4. **Camera face recognition** — high compliance cost, low core revenue leverage for launch.  
5. **Eval depends on local Ollama** — not in CI; quality can rot unnoticed if Mac off.  
6. **Two “truth systems”** — Sheets live vs `local/data/latest` snapshots; staleness is a first-class bug class (freshness_check helps).

### 7.4 AI strategy recommendation

Treat local insight as **v0.9 internal tool**, not customer-facing product. Success metric: *≥2 owner decisions/month that cite the brief and change promo/menu/staffing with measured result.* If not hit in 60 days, freeze feature work on AI and harvest only morning brief.

---

## 8. Bugs & Defects (severity-ranked)

| Sev | Bug / defect | Location | Notes |
|-----|--------------|----------|-------|
| **P0** | Bank webhook open without secret | `Code.gs` bank_notification | Config-dependent landmine |
| **P0** | GAS 403 when OAuth Testing expires | Platform + deploy | Mitigated by watchdog; root fix is GCP console |
| **P1** | Waste submit unauthenticated | `Code.gs` / `Waste.gs` | Data integrity |
| **P1** | order_id collision possible | `generateOrderId` Math.random 4 digits | ~1/9000; no uniqueness check under race edge |
| **P1** | Free-drink race | validate at order; debit at pay | Two concurrent free orders can both pass validate |
| **P1** | Doc claims vs missing Loyalty/Inventory files | agent-map, CLAUDE | Agent mis-implementation risk |
| **P2** | Bank match empty content never pays | `findOrderForReconciliation` | Safe but ops may expect amount-only |
| **P2** | Short-code numeric looseness | Payment.gs | False positive risk |
| **P2** | Side-effect stubs | DELIVERED PDF/Zalo invoice commented | Feature incomplete vs docs |
| **P2** | README build status outdated | README.md | Onboarding confusion |
| **P2** | Schema docs missing `idempotency_key`, short_code cols | sheets-schema.md | Drift |
| **P3** | Magic indices brittle if columns reorder | Orders/Utils | Use header maps everywhere |
| **P3** | Exploration pages in `web/` | multiple HTML | Accidental publish risk |
| **P3** | Default admin credentials on init | CameraAI.gs | Expected for bootstrap |

---

## 9. Expert Recommendations

### 9.1 Backend / API Expert

**Priority actions**

1. Split `Code.gs` into `Routes.gs` + thin `doGet/doPost` (auth middleware table: action → {auth: token|session|public|bank, handler}).
2. Extract `Loyalty.gs` from Orders (credit/redeem/getCustomerInfo).
3. **Bank webhook: fail-closed always**; log unauthorized attempts to ERROR_LOG + Telegram.
4. Add uniqueness check on `order_id` before append; prefer `Utilities.getUuid()` suffix or sequence under lock.
5. Free-drink: reserve (`free_drinks_reserved`) at order create; commit/release on pay/cancel.
6. Replace magic indices with `ORDERS_HEADERS.indexOf` consistently (already partial).
7. Archive job scheduled & monitored (ORDERS older than N days → ARCHIVE sheet).

**Effort:** 3–6 days for middleware + loyalty extract + bank fail-closed.

### 9.2 Frontend / Mobile Expert

1. Modularize `order.js` into modules (menu, cart, checkout, tracking, api client) even if still bundled without build step — or introduce minimal Vite build.
2. Single `config.js` / runtime config for `GAS_URL` (injected by Worker) — stop 6-file hardcode.
3. KDS: keep diagnostic UX; add offline banner + last-success timestamp always visible.
4. Remove or `noindex` + Worker-block design exploration HTML from production assets.
5. Continue LCP work: hero compression, order.js dual-logo load (DONE review C.3).
6. A11y: contrast + cart badge aria (known leftovers).

**Effort:** 1–2 weeks for modularization; 1–2 days for config injection + asset hygiene.

### 9.3 AI/ML & Agent Engineer

1. Define **north-star metric** for insight system (decisions accepted × outcome hit rate).
2. Run eval on schedule only if Ollama up; else alert — never silent skip without FREEZE policy clarity.
3. Freeze camera biometrics until legal consent UX exists.
4. Reduce agent map to **truthful status** (✅ partial 🟡 missing 🔴).
5. Prefer deterministic tools (SQL-like metrics over Sheets) for ROI/menu-eng; LLM for narrative only.
6. Cap concurrent local models; document single recommended model tag in QUAN.yaml.

**Effort:** 2–4 days metric wiring; ongoing discipline.

### 9.4 DevOps & Infrastructure

1. Keep dual-worker CI; add **smoke workflow** (curl menu, unauthorized orders, health).
2. Document and automate GAS deploy via `ops/gas_push.py` with version pin + rollback notes.
3. Ensure launchd plists for print poller + gas_health installed on Mac Mini (checklist in ONBOARDING).
4. Clean `.claude/worktrees` periodically; exclude from backups if duplicated.
5. Turn off CF Google tag gateway if still injecting (DONE C.1).
6. Backup: Sheets version history ≠ disaster recovery plan — weekly CSV export already partial via sheets_pull; verify offsite.

**Effort:** 2–3 days for smoke CI + deploy runbook enforcement.

### 9.5 Security Engineer

1. Execute SECURITY_DEPLOY remaining items as checklist with dates.
2. Secret rotation playbook: REPORT_API_TOKEN, BANK_WEBHOOK_SECRET, admin password, Meta tokens.
3. Threat model one-pager: public GAS, LAN print, MacroDroid phone, stolen Mac Mini.
4. Rate limiting: Cloudflare WAF on mitsu.cafe; for GAS rely on lock + monitoring (limited control).
5. PDPD: customer phone + stamps = personal data — privacy policy page + retention (WEB_HITS 90d prune exists; ORDERS forever?).

**Effort:** 1 day threat model + 2 days hard gates.

### 9.6 Product & Business Alignment

1. **90-day freeze** on net-new modules (no multi-location, no new social pullers).
2. Define operational SLOs: order accept success &gt;99%, label print &lt;60s p95, KDS error rate &lt;1%.
3. Measure promo ROI with existing `roi_data` before building more marketing automation.
4. Staff training uses real SOP PDFs, not agent map.
5. Decide: is Mitsu a cafe with software leverage, or a software product with a cafe testbed? Resource allocation follows.

**Effort:** Strategy session (half day) + SLO dashboard (2 days using existing metrics).

---

## 10. Roadmap

### Short term (1–3 months) — Stabilize & Harvest

| Item | Priority | Effort | Owner type |
|------|----------|--------|------------|
| Bank webhook fail-closed + secret set in prod | P0 | 0.5d | Backend |
| Confirm OAuth app Production + gas_health green | P0 | 0.5d | Ops |
| Change default admin password; enforce policy | P0 | 0.5d | Security |
| Auth on waste/review forms | P0 | 1d | Backend |
| Doc drift sprint (README, agent-map, sheets-schema, CLAUDE naming) | P1 | 1–2d | Product/eng |
| Nightly E2E smoke (menu → order mock → token gates) | P1 | 2d | DevOps |
| order_id uniqueness + free-drink reserve | P1 | 2d | Backend |
| Asset hygiene (block/remove explorations from public) | P2 | 0.5d | Frontend |
| LCP residual fixes | P2 | 1–2d | Frontend |
| AI insight ROI log (decision → 14d result) only | P2 | 2d | AI |
| **Feature freeze** multi-branch / new pulls | P1 | policy | CTO |

### Medium term (3–6 months) — Selective depth

| Item | Priority | Effort | Condition |
|------|----------|--------|-----------|
| Split Code.gs routing + Loyalty.gs extract | P1 | 1w | After freeze |
| Modularize order.js (± light build) | P1 | 1–2w | If still editing weekly |
| ORDERS archive + metrics on sheet size | P1 | 3d | If rows &gt;5k |
| Indexed customer cache (ScriptCache) | P2 | 2d | If KDS slow |
| Consider Supabase/Postgres **only if** multi-branch or &gt;150 o/day | P2 | 4–8w | Business trigger |
| PDPD-compliant camera or kill feature | P2 | 1–3w | Legal decision |
| CSP nonces for ops pages | P3 | 1w | After XSS audit |
| Real integration tests for Payment reconcile | P1 | 3d | Always valuable |

### Explicit non-goals (next 6 months)

- New business line modules
- Full multi-location HQ productization
- Replacing Sheets “because modern”
- Points system (already correctly rejected)
- Expanding agent roster without killing unused skills

---

## 11. Effort × Priority Matrix (summary)

| Priority | Items | Total effort (eng days) |
|----------|-------|-------------------------|
| P0 | Bank secret, OAuth, admin pwd, waste auth | ~2.5 |
| P1 | Docs, E2E smoke, order_id/free-drink, Code split start, payment tests | ~10–12 |
| P2 | Frontend modules, LCP, AI ROI, archive, camera decision | ~15–20 |
| P3 | CSP nonces, cleanup, polish | ~5 |

**Suggested sequencing:** P0 week 1 → doc+smoke week 2 → reliability money-path week 3–4 → only then AI/frontend refactors.

---

## 12. Final CTO Judgment

You have built **a real store operating system**, not a toy. The launch-hardening work shows the project is entering the adult phase: incidents → root cause → code + monitoring.

The strategic failure mode is not “bad code.” It is **infinite horizontal expansion** (agents, channels, cameras, multi-branch) while the critical path still depends on a fragile GAS deployment and a single Mac Mini.

**Operate like a CTO of a 1-location F&B business with software superpowers:**

1. Protect the money and the cup (order, print, pay, stamp).  
2. Instrument SLOs.  
3. Harvest insight only when it changes owner decisions.  
4. Say no to new surfaces until the old ones are boringly reliable.

**Composite: 7.2/10 — recommend merge launch-hardening after P0 security config verification, then freeze features for 90 days.**

---

*Generated from full-repo static review of source, docs, and recent git history (2026-07-11). Runtime production secrets and live Sheet contents were not accessed.*
