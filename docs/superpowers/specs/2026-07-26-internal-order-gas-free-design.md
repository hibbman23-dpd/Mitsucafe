# Internal Order System — GAS-Free Daytime Rebuild (iPOS-style)

**Date:** 2026-07-26
**Status:** Approved (brainstorming) → next: implementation plan
**Owner:** Chief (Opus)

## 1. Purpose

Rebuild the internal staff ordering website (`web/kds.html`) so the **entire order flow runs locally** on the Mac Mini Flask server during the day, with **no realtime dependency on Google Apps Script (GAS)**. GAS is demoted to two roles only:

1. **Inbound mailbox** for online orders placed by customers on `mitsu.cafe`.
2. **End-of-day (EOD) archive sink** — the day's finalized orders are pushed to GAS/Sheets once at ~23:00.

Primary goal driving the rebuild: **print accuracy** — the printed hóa đơn (bill) must exactly match the order after staff freely customize it (edit quantities, remove items, split/merge bills, add notes) at payment time, iPOS-style.

## 2. Scope

**In scope (daytime = 100% local):**
- Create order, list/filter "today's orders", read order state — all from local SQLite.
- Bill customization: edit line quantity, remove/add line items, item + order notes, bill meta (customer name, show/hide price, VAT, table number).
- Split bill (one table → multiple bills) and merge bill (multiple orders/tables → one bill).
- Print labels + hóa đơn from local state (reuse existing tested pipeline).
- Online-order inbox: notification of `mitsu.cafe` orders, prefilled cart, one-tap staff accept.
- EOD sync job pushing finalized orders to GAS (append-only into Sheets ORDERS + loyalty stamp credit).

**Out of scope (intentionally deferred / unchanged):**
- Manual price override / per-item discounting — **not needed** (promo module already handles discounts).
- Local loyalty engine — **loyalty stamps credit at EOD** via GAS, no realtime local stamp/redeem.
- Zalo/Telegram customer notifications — unchanged (remain GAS-side, fire on EOD push or existing triggers).
- Realtime revenue reporting UI — deferred (data is local; a report view can come later).

## 3. Architecture

New daytime principle: **local Flask = single source of truth**. Remove all realtime `callReportApi` (GAS read) calls from `kds.html`.

```
[Staff tablets/PCs on LAN]  ──►  [Flask print_server on Mac Mini]
  kds.html (iPOS-style UI)         ├── order_store.py   (SQLite: materialized `orders` table)
  reads/writes 100% local          ├── bill_engine.py   (edit qty/remove/add/split/merge/notes)
                                    ├── online_inbox.py  (poll GAS mailbox → notify → accept)
                                    ├── print pipeline   (EXISTING — spool, labels, receipts)
                                    └── cash drawer      (EXISTING)
                                           │
                                    [23:00 EOD] eod_sync.py ──► GAS doPost (batch) ──► Sheets ORDERS
                                                                 (+ loyalty stamp credit)

[Customer on mitsu.cafe] ──► GAS (inbound mailbox) ◄── local polls every ~20s
```

**Guardrail reconciliation.** The legacy guardrails "ORDERS append-only" and "no external DB / Sheets is the only database" applied when GAS/Sheets was the live authority. Under this design:
- Local SQLite updates in-place during the day (required for bill editing) — it is **daytime scratch state**, not the archive.
- When pushing to GAS at EOD, records are written **append-only** into Sheets, honoring the original guardrail. Sheets remains append-only.
- This is an explicit, chief-approved evolution of the guardrail for the internal daytime path, not a violation.

## 4. Components

### 4.1 order_store.py — materialized order table

Single row per order, updated in place during the day.

```
orders(
  order_id      TEXT PRIMARY KEY,
  short_code    TEXT,
  delivery_type TEXT,              -- dine_in | pickup | delivery
  table_id      TEXT,
  status        TEXT,              -- NEW..DELIVERED..CANCELLED
  paid          INTEGER DEFAULT 0,
  source        TEXT,              -- 'staff' | 'online'
  items_json    TEXT,             -- CURRENT line items (post-edit) — print source of truth
  customer_note TEXT,
  bill_meta_json TEXT,            -- {customer_name, show_price, vat, table_no, ...}
  total         INTEGER,          -- recomputed server-side on every edit
  bill_group_id TEXT,             -- for split/merge; NULL = standalone
  created_at    TEXT,
  updated_at    TEXT,
  synced_at     TEXT              -- set by EOD sync
)
```

- Every mutating operation: (1) update the `orders` row atomically, (2) append one event to the existing `outbox` table for audit trail. `outbox` and `print_spool` keep their current roles.
- UI list/filter reads directly from `orders` (replaces the GAS `loadOrders`/`callReportApi` read path).

### 4.2 bill_engine.py — customization + print accuracy (CORE)

**Accuracy principle:** the hóa đơn renders from the **current order record state at print time** — never from a stale browser cart. Every edit persists to `orders.items_json` first; the print job pulls from there. The printed bill can never diverge from what was edited.

Endpoints (names indicative):
- `PATCH /order/<id>/items` — set quantity, remove line, add line, per-item note. Server recomputes `total`.
- `PATCH /order/<id>/meta` — customer_note, bill_meta (customer name, show/hide price, VAT, table no).
- `POST /bill/split` — from a table's line items, produce N `bill_group`s, each a subset → each prints its own hóa đơn with its own total.
- `POST /bill/merge` — assign multiple orders/tables a shared `bill_group_id` → one combined hóa đơn.
- `POST /bill/<group_or_order>/print` — render + enqueue print; each print mints a **bill version tag** (idempotency). Re-editing then reprinting yields a new version → correct reprint, no duplicates.

**Bill model.** A *bill* is a set of line-item references selected for one payment. Standalone order = its own bill. `bill_group_id` links line items across orders/tables into one bill. Printing is per-bill (per `bill_group`), not strictly per-order.

### 4.3 online_inbox.py — mitsu.cafe order intake

- Local polls the GAS mailbox every ~20s for new `source=online` orders (customers off-LAN post to GAS; local pulls).
- New online order → nav badge + chime notification on `kds.html`.
- Opening the notification shows a **prefilled cart** built from the customer payload (items, size, qty, notes). Staff review/edit → tap **Nhận** → becomes a real local order (`source=online`) + prints label.
- Idempotency keyed on the online order_id to prevent double-accept.

### 4.4 eod_sync.py — nightly archive

- launchd job at ~23:00: select today's orders where `synced_at IS NULL`, batch `POST` to GAS `doPost` (append into Sheets ORDERS per legacy schema + credit loyalty stamps by net order value), mark `synced_at`.
- Retry with backoff on failure; safe to re-run (idempotent by order_id at GAS side).

### 4.5 UI rebuild (kds.html, iPOS-style)

- Remove all realtime GAS reads; point reads/writes at local endpoints.
- Keep existing tab layout (Đơn hôm nay / Gọi món / Khuyến mãi).
- Add a **Payment/checkout screen** (iPOS-style): select line items, edit quantities, split, merge, add notes/bill meta, issue hóa đơn.
- Add the **online-order inbox** notification surface.

## 5. Data Flow — representative sequences

**Staff order → edit → bill:**
1. Staff builds cart → `POST /order` → row in `orders`, label prints (existing pipeline).
2. At payment, staff opens checkout → `PATCH /order/<id>/items` edits qty/removes item → server recomputes total, persists.
3. `POST /bill/<id>/print` → renders from current `items_json` → hóa đơn matches edits exactly.
4. Mark paid → drawer (existing).

**Split bill:** table with 3 orders → `POST /bill/split` selecting subsets → 2 `bill_group`s → each `POST /bill/<group>/print`.

**Online order:** customer posts on mitsu.cafe → GAS mailbox → local poll picks it up → notification → staff opens prefilled cart → **Nhận** → local order + label print.

**EOD:** 23:00 → `eod_sync.py` pushes unsynced orders → Sheets append + loyalty credit → mark synced.

## 6. Error Handling

- **Local server down:** order create already has local-first + existing fallback; this design keeps the local path primary. If Flask is unreachable, staff cannot use the daytime app — mitigation: same launchd resiliency as today's print server (auto-restart plist).
- **Print failure:** unchanged — existing spool retry + DLE EOT confirmation pipeline (81 passing tests) is reused, not replaced.
- **Online poll failure:** poll retries next cycle; missed online orders remain in GAS mailbox until pulled (no loss).
- **EOD sync failure:** retries with backoff; `synced_at` gating makes re-runs safe; unsynced orders carry over and retry.
- **Edit/print race:** bill version tag ensures a reprint after edit supersedes the prior version; print pulls current state atomically.

## 7. Testing

- Unit tests per new module: `order_store.py`, `bill_engine.py`, `online_inbox.py`, `eod_sync.py`.
- E2E chain test: create → edit items → split bill → print → mark paid → EOD sync (continuation of the existing 81-test suite).
- Print-accuracy assertion: rendered receipt bytes reflect post-edit `items_json`, not the pre-edit cart.
- Idempotency: double online-accept, reprint-after-edit, EOD re-run.

## 8. Rollout

- Module split keeps `print_server.py` from bloating (currently 1654 lines).
- Ship behind the existing local-first path; keep GAS fallback wiring available during transition, then remove realtime GAS reads once local read path is verified in production.
- No change to the proven print pipeline or cash drawer.

## 9. Open decisions (resolved)

- Scope of GAS removal → all order flow local, GAS = EOD archive + online mailbox. ✅
- Customization set → edit qty/remove/add, split/merge, notes/bill meta; **no** manual price/discount. ✅
- Architecture → extend Flask (Approach A). ✅
- Online orders → prefill + one-tap accept. ✅
- Loyalty → credit at EOD, no local engine. ✅
