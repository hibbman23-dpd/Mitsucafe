# Internal Order UI Rebuild (iPOS-style checkout) — Design

**Date:** 2026-07-26
**Status:** Approved (brainstorming) → next: implementation plan
**Owner:** Chief (Opus)
**Depends on:** the GAS-free order backend + activation (both shipped on `launch-hardening`).

## 1. Purpose

Rebuild the internal staff ordering UI (`web/kds.html`) so it (a) reads all order state from the local Flask server instead of Google Apps Script during business hours, and (b) gains an **iPOS-style checkout screen** where staff freely customize a bill before printing — edit quantities, remove/add items, add notes, split and merge bills — with the printed hóa đơn matching the edited state exactly. The visual style stays consistent with the current Mitsu look; iPOS influence is functional, concentrated on the checkout surface.

## 2. Scope

**In scope:**
- Refactor `kds.html`: extract order-server calls into `web/order-api.js` and checkout logic into `web/checkout.js`; keep the proven menu/cart/modifier/promo/TTS/chime/order-render code in place. (Quick modifier chips already exist — size/ice/sugar/toppings via `.kds-chip`/`opt-chips`; the checkout "+ Thêm món" reuses that existing modifier UI.)
- Replace every realtime GAS *order read* (`callReportApi` for orders) with local endpoints; switch order polling to short-poll `GET /orders/changes?since=` for multi-device live refresh.
- Checkout screen: table-scoped for dine_in (tap a table → all its orders), order-scoped for pickup/takeaway. Line editor (qty ±, remove, add, per-item note), order note / customer name / VAT toggle, split, merge, combined print, print-bill + take-payment.
- **Void / post-payment-edit authorization (anti-fraud):** editing lines, removing lines, or voiding an order that is already `paid=1` requires a **manager PIN** (reuse the existing `verifyManagerPin`) plus a **void/adjustment reason**. See §4b.
- Online-order inbox surface (nav badge + chime + prefilled accept, with a late-order flag) and a Cloud Online/Offline indicator; a printer-status badge.

**Out of scope (unchanged):**
- The **Khuyến mãi (promo)** tab keeps its existing GAS `callReportApi` calls — low-frequency, not part of the order hot path.
- Manual price override / per-item discount (promo handles discounts).
- Backend changes — all consumed endpoints already exist and are tested.
- Activating the shelved EOD path.

## 3. Architecture

`kds.html` stays a single page but its JavaScript is split into focused modules:

- `web/order-api.js` — thin client over the local Flask server. One responsibility: HTTP to the order endpoints. Functions:
  - `listOrders()` → `GET /orders`
  - `pollChanges(sinceIso)` → `GET /orders/changes?since=`
  - `getOrder(id)` → `GET /order/<id>`
  - `patchItems(id, items, version)` → `PATCH /order/<id>/items`
  - `patchMeta(id, {customer_note, bill_meta}, version)` → `PATCH /order/<id>/meta`
  - `splitOrder(id, partitions, version)` → `POST /order/<id>/split`
  - `mergeBill(orderIds)` → `POST /bill/merge`
  - `printBill(id)` → `POST /bill/<id>/print`
  - `printGroup(groupId)` → `POST /bill/group/<groupId>/print`
  - `setStatus(id, status)` → `POST /order/status`
  - `markPaid(id, order, skipReceipt)` → `POST /order/mark_paid`
  - `inbox()` → `GET /inbox`; `acceptOnline(id, payload)` → `POST /inbox/<id>/accept`
  - `cloudStatus()` → `GET /cloud/status`
  - Every mutating call returns the JSON; callers handle `409` (version conflict) by refetching.
- `web/checkout.js` — checkout screen state + interactions (line editing, split/merge builders, total display, print+pay orchestration). Depends on `order-api.js`. No direct fetch.
- `kds.html` — retains menu (73 items from `menu-data.js`), cart, modifiers, promo tab, TTS, chime, order-card render; loses the GAS order-read paths.

**Reads:** initial `listOrders()` on load, then `pollChanges()` every 3–5s, merging changed rows into the in-memory order list (replaces the current GAS order poll). The promo tab's GAS calls are untouched.

## 4. Checkout screen

**Entry:** tap a table in the orders view (dine_in → gathers every order on that table) or a **Tính tiền** button on a pickup/takeaway order card. Rendered as the existing full-screen / bottom-sheet pattern, Mitsu-styled.

**Layout (function is iPOS-like):**
- Header: table/order identity + order count.
- Line list: each line shows name + modifiers + qty + line subtotal, with inline `[− qty +]`, `[remove]`, `[note]`. An **+ Thêm món** entry opens the existing menu to append.
- Meta row: order note, customer name, VAT toggle (writes to `bill_meta`).
- Action row: **✂ Tách** (split) and **⊕ Gộp bàn** (merge).
- Footer: large **TỔNG** amount, payment method selector (**Tiền mặt** / **VietQR**), and **🖨 In bill + Thu tiền**.

**Operations → endpoints:**
- qty ± / remove / add / item note → `patchItems(id, items, version)`; server recomputes `total` and auto-prints a kitchen cancellation ticket when a kitchen-printed line is reduced/removed. A `409` → refetch the order + toast "đơn vừa đổi, xem lại".
- order note / customer name / VAT → `patchMeta(...)`.
- **Split:** pick lines into groups → `splitOrder(id, partitions, version)` → N sub-orders, each with its own print button.
- **Merge:** select multiple orders/tables → `mergeBill(orderIds)` → print via `printGroup(groupId)`.
- **In bill + Thu tiền:** `printBill(id)` (or `printGroup`) then `markPaid(...)` (cash opens the drawer; VietQR waits on the bank webhook), then mark the order(s) DELIVERED.

**Accuracy invariant:** the printed bill renders from the server's current order state at print time — never a stale browser cart — so it always matches the just-edited lines.

## 4b. Void / post-payment edit authorization (anti-fraud)

Fraud vector: a cashier takes cash, then quietly reduces or voids the order locally to pocket the difference. The current backend `patch_items` has no guard against editing an already-paid order. To close this:

- **UI rule:** any of {reduce qty, remove line, void order} on an order whose `paid=1` prompts the existing manager-PIN dialog **and** a required reason (a short chip list — "khách trả lại", "gọi nhầm", "hết hàng", "khác…"). Editing an unpaid order stays friction-free.
- **Void ≠ cancel-line:** voiding a whole order sets a distinct **`VOIDED`** status (separate from `CANCELLED`), carrying `void_reason` and `voided_by`.
- **Backend dependency (small, folded into this plan):** the order store gains `void_reason` / `voided_by` columns and a `void_order(order_id, reason, staff, manager_pin)` path that (a) requires a valid manager PIN, (b) refuses to silently edit a `paid=1` order without it, (c) sets status `VOIDED`. Post-payment `patch_items` likewise requires the PIN. VOIDED orders still reach Google Sheets (via the existing realtime syncer's status push) so the owner can audit them; only non-voided paid orders count toward revenue.
- Reuses the existing manager-PIN mechanism (`MANAGER_PIN`/`verifyManagerPin`, already used for item swap and cancel).

## 5. Online inbox + Cloud indicator

- Nav badge polls `inbox()` ~every 20s; a new online order shows a count badge + chime.
- Tapping the badge lists mitsu.cafe orders; opening one shows a **prefilled cart** (items/size/qty/notes from the customer payload). Staff review/edit → **Nhận** → `acceptOnline(id, payload)` → real local order + label print.
- **Late-order flag:** on each inbox item, compare the customer `created_at` to now; if it lags by more than ~15 minutes (e.g. it queued during an internet outage), show a red "ĐƠN TRỄ [X] PHÚT" badge with a distinct chime so staff prioritize / phone-confirm before accepting.
- A **Cloud indicator** reads `cloudStatus()`: 🟢 Online / 🟡 Offline (local-only) — offline means internet is down (LAN still up); shows "đang chạy nội bộ — đơn online tạm dừng, sẽ tự nhận lại khi có mạng".
- A **Printer-status badge** reuses the existing `GET /health` (reports both printers). 🟢 both ready / 🔴 a printer is unreachable — shown as a **soft warning** (does NOT hard-lock the pay/print button, because the spool pipeline is designed to queue and retry; a hard lock would block legitimate sales on a transient blip).
- The inbox is empty until the GAS `pending_online_orders` mailbox action exists (separate task); the UI is built to display it correctly whenever orders arrive.

## 6. Error handling

- **Local server unreachable:** a red connection banner with a retry action; order creation keeps its existing local-first behavior, so in-progress ordering isn't lost.
- **409 version conflict on a checkout edit:** refetch the order, re-render, toast "đơn vừa đổi" — no silent overwrite.
- **Print failure:** handled by the backend spool retry pipeline; the UI surfaces status, does not block.
- **Poll failure:** the next poll retries; a transient miss doesn't drop state (server holds it).

## 7. Testing

- Unit (JS): `order-api.js` against a mocked `fetch` (correct URLs/methods/bodies, 409 surfaced); `checkout.js` total math, split/merge partition building, 409 refetch handling.
- E2E (Playwright against a local dev server with the Flask backend in `PRINT_ENGINE=noop`): create order → open checkout → edit qty → split → print (noop) → mark paid; assert the rendered bill reflects the edited state.
- Verification via `preview_start` dev server + screenshots. **Never** exercises the live POS — the backend runs under `noop`/mock so no physical print or drawer kick.

## 8. Open decisions (resolved)

- Priority → the checkout/edit-bill screen. ✅
- Checkout entry/scope → table-scoped for dine_in, order-scoped for pickup. ✅
- Rebuild approach → refactor `kds.html` in place, consistent Mitsu look (Approach A). ✅
- Promo tab → stays on GAS (out of scope for the local move). ✅
- Void/anti-fraud → manager-PIN + reason on post-payment edit/void; VOIDED status. ✅ (design-review add)
- Online late-order flag + printer-status badge (via `/health`, soft warning). ✅ (design-review add)

## 9. Deferred / rejected (design-review, with reasons)

- **Deferred — cashier/kitchen mode split (`?mode=cashier|kitchen`):** a reasonable iPOS pattern (payment-focused vs big-text hide-price KDS), but it expands scope beyond the approved "add a checkout screen" and Approach A's single cohesive UI. Revisit as its own enhancement if a dedicated kitchen display is wanted.
- **Rejected — relational `order_items` table replacing `items_json`:** premature optimization at this scale (100–300 orders/day; a JSON parse over the day's orders is milliseconds) and would rewrite the already-proven, tested `order_store`/`bill_engine`/split/merge and their whole test suite. Local reporting is not a goal (reporting lives in Sheets). YAGNI.
- **Rejected — EOD sync auto-recovery (attempts/backoff):** the EOD path is shelved, and the live realtime syncer already implements attempts / `last_error` / backoff. N.A.
- **Already present (no work):** quick modifier chips (`.kds-chip`), cash-drawer kick only on cash payment + manager PIN, shift/cash reconciliation (existing `chot-ca` skill).
