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
  order_id       TEXT PRIMARY KEY,
  parent_order_id TEXT,            -- set on split sub-orders (points at the SPLIT origin)
  short_code     TEXT,
  delivery_type  TEXT,             -- dine_in | pickup | delivery
  table_id       TEXT,
  status         TEXT,             -- NEW..DELIVERED..PAID..CANCELLED..SPLIT
  paid           INTEGER DEFAULT 0,
  source         TEXT,             -- 'staff' | 'online'
  items_json     TEXT,            -- CURRENT line items (post-edit) — print source of truth
  customer_note  TEXT,
  bill_meta_json TEXT,            -- {customer_name, show_price, vat, table_no, ...}
  total          INTEGER,         -- recomputed server-side on every edit
  bill_group_id  TEXT,            -- MERGE only: shared id linking whole orders into one bill; NULL = standalone
  version        INTEGER DEFAULT 1, -- optimistic lock; bumped on every mutation
  created_at     TEXT,
  updated_at     TEXT,
  synced_at      TEXT             -- set by EOD sync
)
```

- **Concurrency (multi-tablet):** open the SQLite connection with `PRAGMA journal_mode=WAL;` and `PRAGMA busy_timeout=5000;` so concurrent reads/writes from several LAN devices never hit `database is locked`.
- **Optimistic locking:** every mutating endpoint requires the client's last-seen `version`; the server rejects the write (409) if the row's `version` moved on, preventing two devices from silently overwriting each other. On success the server bumps `version` and `updated_at`.
- **Hourly snapshot:** a background thread copies `store.db` to a timestamped backup every hour (guards against sudden power loss before the 23:00 EOD sync — the shop has a history of unannounced reboots/power cuts).
- Every mutating operation: (1) update the `orders` row atomically, (2) append one event to the existing `outbox` table for audit trail. `outbox` and `print_spool` keep their current roles.
- UI list/filter reads directly from `orders` (replaces the GAS `loadOrders`/`callReportApi` read path).

### 4.2 bill_engine.py — customization + print accuracy (CORE)

**Accuracy principle:** the hóa đơn renders from the **current order record state at print time** — never from a stale browser cart. Every edit persists to `orders.items_json` first; the print job pulls from there. The printed bill can never diverge from what was edited.

Endpoints (names indicative; all mutations carry the client's `version` for optimistic locking):
- `PATCH /order/<id>/items` — set quantity, remove line, add line, per-item note. Server recomputes `total`.
- `PATCH /order/<id>/meta` — customer_note, bill_meta (customer name, show/hide price, VAT, table no).
- `POST /order/<id>/split` — **fork**: move selected line items from the origin order into new sub-orders. See split model below.
- `POST /bill/merge` — assign multiple whole orders/tables a shared `bill_group_id` → one combined hóa đơn.
- `POST /bill/<group_or_order>/print` — render + enqueue print; each print mints a **bill version tag** (idempotency). Re-editing then reprinting yields a new version → correct reprint, no duplicates.

**Split model (order forking).** `bill_group_id` alone cannot split ONE order's line items across two bills (a line can't belong to two groups). So **split forks the order into sub-orders**: line items are partitioned into new orders `#<id>-A`, `#<id>-B`, … each with its own `items_json`, `total`, and hóa đơn; the origin order's `status` becomes `SPLIT` (voided as a financial document, kept for audit), and each sub-order carries `parent_order_id`. Result: at EOD each sub-order is one clean Sheets row = one independent financial transaction with its own bill code — revenue and loyalty totals never double-count.

**Merge model.** Merge combines *whole* orders/tables (not partial lines), so the simpler order-level `bill_group_id` is sufficient: tag the orders with one shared id → print one combined hóa đơn summing them. No forking needed.

**Bill model.** A *bill* is what one payment settles: a standalone order, a split sub-order, or a merged `bill_group`. Printing is per-bill, and every bill renders from the current `orders.items_json` at print time.

**Kitchen cancellation ticket.** When `PATCH /order/<id>/items` removes a line or reduces its quantity *and that item was already printed to the bar/kitchen* (order past the label-print state), `bill_engine.py` auto-mints a **Cancellation/Adjustment ticket** (PHIẾU HỦY/ĐIỀU CHỈNH) straight into the bar/kitchen print spool, so staff stop making the voided drink. No cancel ticket is minted for edits on items never sent to the kitchen.

### 4.3 online_inbox.py — mitsu.cafe order intake

- Local polls the GAS mailbox every ~20s for new `source=online` orders (customers off-LAN post to GAS; local pulls).
- New online order → nav badge + chime notification on `kds.html`.
- Opening the notification shows a **prefilled cart** built from the customer payload (items, size, qty, notes). Staff review/edit → tap **Nhận** → becomes a real local order (`source=online`) + prints label.
- Idempotency keyed on the online order_id to prevent double-accept.
- **Internet-outage tolerance:** the LAN app keeps working when internet drops (Mac Mini still serves LAN). Only the GAS poll fails; on reconnect the inbox does a **catch-up pull** of all unaccepted online orders still sitting in the mailbox (nothing is lost — the mailbox holds them; online_order_id idempotency prevents duplicates). The UI shows a small **Cloud: Online / Offline** indicator so staff know online-order intake and EOD archive are temporarily paused.

### 4.4 eod_sync.py — nightly archive

- launchd job at ~23:00 (a first attempt), **but not time-dependent**: it selects `WHERE synced_at IS NULL AND status IN ('PAID','CANCELLED')` — only finalized orders — so late-night sales, an outage, or a failed run are simply picked up by the next run (later that night or the next morning). Open/unpaid carry-over orders stay unsynced until finalized.
- Batch `POST` to GAS `doPost` (append into Sheets ORDERS per legacy schema + credit loyalty stamps by net order value), then set `synced_at`.
- Retry with backoff on failure; safe to re-run (idempotent by order_id at GAS side, gated by `synced_at`).

### 4.5 UI rebuild (kds.html, iPOS-style)

- Remove all realtime GAS reads; point reads/writes at local endpoints.
- Keep existing tab layout (Đơn hôm nay / Gọi món / Khuyến mãi).
- Add a **Payment/checkout screen** (iPOS-style): select line items, edit quantities, split, merge, add notes/bill meta, issue hóa đơn.
- Add the **online-order inbox** notification surface + the **Cloud: Online/Offline** indicator.
- **Multi-device live refresh:** other LAN devices stay current via short-poll `GET /orders/changes?since=<ts>` every ~3–5s (returns rows changed since the timestamp). Short-poll is chosen over SSE deliberately — SSE holds open connections that can exhaust the threaded Flask dev server with several tablets, while short-poll is stateless and robust for this small deployment. (SSE remains a possible later optimization if device count grows.)

## 5. Data Flow — representative sequences

**Staff order → edit → bill:**
1. Staff builds cart → `POST /order` → row in `orders`, label prints (existing pipeline).
2. At payment, staff opens checkout → `PATCH /order/<id>/items` edits qty/removes item → server recomputes total, persists.
3. `POST /bill/<id>/print` → renders from current `items_json` → hóa đơn matches edits exactly.
4. Mark paid → drawer (existing).

**Split bill (fork):** order #101 with 4 lines → `POST /order/101/split` partitioning lines into `#101-A` (2 lines) + `#101-B` (2 lines); #101 → `SPLIT` → each sub-order `POST /bill/<id>/print` with its own total.

**Edit item already sent to kitchen:** staff removes a drink at payment → `PATCH /order/<id>/items` → cancellation ticket auto-prints to bar/kitchen + hóa đơn renders without that line.

**Online order:** customer posts on mitsu.cafe → GAS mailbox → local poll picks it up → notification → staff opens prefilled cart → **Nhận** → local order + label print.

**EOD:** any run (23:00 or later) → `eod_sync.py` pushes `synced_at IS NULL AND status IN (PAID,CANCELLED)` → Sheets append + loyalty credit → mark synced.

## 6. Error Handling

- **Local server down:** order create already has local-first + existing fallback; this design keeps the local path primary. If Flask is unreachable, staff cannot use the daytime app — mitigation: same launchd resiliency as today's print server (auto-restart plist).
- **Print failure:** unchanged — existing spool retry + DLE EOT confirmation pipeline (81 passing tests) is reused, not replaced.
- **Concurrent edit (multi-device):** optimistic `version` check returns 409 on a stale write; the client refetches and re-applies, so no device silently overwrites another's edit. WAL + `busy_timeout` prevent `database is locked` under concurrent access.
- **Internet outage (LAN alive):** online poll and EOD sync pause; `Cloud: Offline` indicator shows; on reconnect the inbox catch-up pulls queued online orders and EOD retries — nothing lost.
- **Power loss before EOD:** hourly `store.db` snapshot bounds data loss to ≤1 hour; unsynced orders still push on the next EOD run after reboot.
- **EOD sync failure:** retries with backoff; `synced_at` gating makes re-runs safe; unsynced orders carry over and retry.
- **Edit/print race:** bill version tag ensures a reprint after edit supersedes the prior version; print pulls current state atomically.

## 7. Testing

- Unit tests per new module: `order_store.py`, `bill_engine.py`, `online_inbox.py`, `eod_sync.py`.
- E2E chain test: create → edit items → split (fork) → print → mark paid → EOD sync (continuation of the existing 81-test suite).
- Print-accuracy assertion: rendered receipt bytes reflect post-edit `items_json`, not the pre-edit cart.
- Split correctness: sub-order totals sum to the origin; origin marked `SPLIT`; each sub-order syncs as one Sheets row (no double-count).
- Cancellation ticket: reducing/removing a kitchen-printed line emits a cancel ticket; editing a never-printed line does not.
- Concurrency: two clients editing one order → second write with stale `version` gets 409.
- Idempotency: double online-accept, reprint-after-edit, EOD re-run.

## 8. Rollout

- Module split keeps `print_server.py` from bloating (currently 1654 lines).
- Ship behind the existing local-first path; keep GAS fallback wiring available during transition, then remove realtime GAS reads once local read path is verified in production.
- No change to the proven print pipeline or cash drawer.

## 8b. Deferred / future (out of this rebuild's scope)

- **Dynamic VietQR at payment:** since `total` is already recomputed accurately post-edit, a dynamic VietQR (correct amount + order_id as transfer memo) shown on the checkout screen or printed on a provisional bill is a clean future add. Deferred to keep this rebuild focused and because it touches money handling — do it as its own spec once the local checkout is proven.
- **Realtime revenue reporting UI:** data is local; a report view can follow later.
- **SSE live push:** replace short-poll if device count grows enough to warrant it.

## 9. Open decisions (resolved)

- Scope of GAS removal → all order flow local, GAS = EOD archive + online mailbox. ✅
- Customization set → edit qty/remove/add, split/merge, notes/bill meta; **no** manual price/discount. ✅
- Architecture → extend Flask (Approach A). ✅
- Online orders → prefill + one-tap accept. ✅
- Loyalty → credit at EOD, no local engine. ✅
- Split bill → **order forking into sub-orders** (not order-level `bill_group_id`); merge stays order-level grouping. ✅ (design-review revision)
- Multi-device → optimistic `version` locking + short-poll change feed (SSE deferred). ✅ (design-review revision)
- Kitchen cancel ticket on removing/reducing an already-printed line. ✅ (design-review revision)
- SQLite WAL + `busy_timeout` + hourly snapshot. ✅ (design-review revision)
- EOD gated by `synced_at IS NULL AND status IN (PAID,CANCELLED)`, time-independent. ✅ (design-review revision)
- Dynamic VietQR → deferred to its own future spec. ✅ (design-review revision)
