I'll follow the CTO review mission brief and systematically assess architecture, security, code quality, and strategic fit across the whole repo.Next I'll dig into the core event bus, auth surfaces, and the highest-risk operational paths.I have enough evidence from the core paths. Writing the full CTO assessment next.# CTO Full-Repository Review — Mitsu / Lâm Hà Kissaten

Full write-up saved at [`docs/cto-review-2026-07-11.md`](docs/cto-review-2026-07-11.md). Below is the executive version.

---

## Executive Summary

**Verdict: Ship-ready as a single-store ops OS — not as a multi-branch product platform.**

This is an unusually complete system for one cafe: order → labels → payment → KDS → loyalty → financials → marketing attribution → local LLM insight. Money-path engineering is serious (server-side pricing, idempotent `markOrderPaid`, dual Workers + Access). The main risk is not “bad code” — it is **scope explosion + GAS as SPOF** while one operator runs the shop.

| Domain | Score | One-line |
|--------|------:|----------|
| Architecture (1 store) | **8.5** | Sheets + GAS is the right call at this scale |
| Code quality / debt | **6.0** | God-files, doc drift, surface sprawl |
| Security | **6.5** | Hardened recently; residual open gates |
| Reliability | **7.5** | Watchdog + launch-hardening; OAuth fragility remains |
| Performance / scale | **6.0** | Fine now; Sheets is a cliff later |
| Product / UX | **7.5** | Strong brand + order UX; dense admin |
| AI / agents | **7.0** | Thoughtful RAG+eval; ROI still unproven |
| DevOps | **7.0** | Web CI solid; GAS still manual |

**Composite: 7.2 / 10**

---

## Architecture

```
Channels → GAS doPost/doGet (LockService) → Sheets
              ↓
     Telegram / Zalo / Print poller / KDS / Local Hermes
```

**Correct choices:** poll-based print (GAS can’t reach LAN), fail-closed report tokens, public vs ops Workers, server-side price recompute in `validateOrderPayload`.

**Structural risks:**
- `Code.gs` (~920 LOC) is a god-router for every `action=`
- Docs say “ORDERS append-only”; reality is lifecycle columns updated in place (OK if documented honestly)
- Claimed modules missing: no `Loyalty.gs` / `Inventory.gs` — loyalty lives in `Orders.gs` (`_creditStampsForOrder`)
- README still shows Day 1–7 unchecked while the system is far beyond that

---

## Security (act first)

### P0
| Issue | Where | Risk |
|-------|--------|------|
| **`bank_notification` open if `BANK_WEBHOOK_SECRET` unset** | `Code.gs` | Anyone can hit auto-pay reconcile |
| **GAS OAuth Testing → 7-day 403** | Platform (documented in launch-hardening) | Silent order death; menu still looks fine |
| **Default admin `123456`** | `CameraAI.gs` | Full dashboard if not rotated |
| **Waste form unauthenticated** | `waste_form` / `waste_submit` | Inventory sabotage |

### P1
- Public `customer_info` = phone → name/stamps oracle  
- Loose bank short-code match (`"7"` ≈ `"Q07"`)  
- Free-drink race (check at order, debit at pay)  
- `order_id` = 4 random digits, no uniqueness check  
- VietQR account + name hardcoded in public `order.js` (payment UX vs repo exposure)

### Already strong
Server-side pricing, KDS token injection via `mitsu-ops`, public worker 404 on control paths, salted admin KDF, `markOrderPaid` idempotency.

---

## Code quality & debt

| Gravity well | ~LOC | Problem |
|--------------|-----:|---------|
| `web/order.js` | 3,200 | Entire customer app in one file |
| `gas/Financials.gs` | 1,060 | Finance + forms + email |
| `gas/Code.gs` | 919 | Auth + every route |
| `web/kds.html` | 1,306 | Kitchen critical path as monolith HTML |

**Debt themes:** magic column indices (`row[19]`), doc/agent-map fiction, design explorations still under `web/`, limited CI on the money path (some `ops/test_logic.js` + web unit tests + LLM eval — not enough for payments).

---

## Performance & scale

- Landing LCP ~6.8s throttled (better than 10.4s baseline; still short of &lt;4s).  
- Order app ~2.1s — acceptable.  
- Full-sheet scans in reconcile/customer lookup are fine at tens of orders/day; painful past ~150–300.  
- Multi-location rollup code is **premature** relative to single-node reliability.

---

## AI / agent layer

**Well done:** deterministic metrics before LLM, quarantine + Telegram approve, eval + FREEZE, shop vs core KB.

**Weak:** agent-map overclaims ✅; camera biometrics = compliance cost with weak launch ROI; insight system needs a north-star (*decisions accepted × 14-day outcome*), not more skills.

---

## 90-day recommendation: Stabilize & Harvest

**Do not build more features.** Sequence:

1. **Week 1 (P0):** Force bank webhook secret fail-closed · confirm OAuth **In production** · rotate admin password · auth waste/review forms  
2. **Week 2:** Doc drift sprint (README, agent-map, sheets-schema, CLAUDE naming) · nightly smoke (menu / token gates / unauthorized)  
3. **Weeks 3–4:** `order_id` uniqueness · free-drink reserve · payment reconcile tests  
4. **Only then:** modularize `order.js` / split `Code.gs` · measure whether morning briefs change real decisions  

**Explicit non-goals (6 months):** multi-branch productization, new social pullers, replace Sheets “for modernity,” expand agent roster.

---

## Effort snapshot

| Priority | Focus | Eng days |
|----------|--------|----------|
| **P0** | Bank secret, OAuth, admin pwd, waste auth | ~2.5 |
| **P1** | Docs, smoke CI, money-path hardening | ~10–12 |
| **P2** | Frontend modules, LCP, AI ROI, archive | ~15–20 |

---

## Final judgment

You have a **real store operating system**, not a toy. Launch-hardening shows adult incident response. The strategic failure mode is infinite horizontal expansion (agents, cameras, HQ rollups) while the cup path still depends on fragile GAS deploy + one Mac Mini.

**Operate as CTO of a 1-location F&B business with software leverage:** protect order/print/pay/stamp → SLOs → only harvest AI when it changes owner decisions.

Full detail, expert sections, bug table, and roadmap: **`docs/cto-review-2026-07-11.md`**.

If useful next, I can turn the P0 list into a concrete fix PR on `launch-hardening` (bank fail-closed + waste auth + doc drift only).
