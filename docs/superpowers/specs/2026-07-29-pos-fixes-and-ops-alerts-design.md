# POS fixes + shortcuts + operational alert banner

**Date:** 2026-07-29
**Status:** Approved (brainstorming) → next: implementation plan
**Owner:** Chief (Sonnet 5)
**Depends on:** shipped GAS-free order backend + iPOS checkout screen + cashier mode (branch `launch-hardening`).

## 1. Purpose

Three confirmed bugs found in the checkout/cancel/add-item flows shipped last session, plus three additive features the owner asked for after using the system: multi-item cancel, keyboard shortcuts for the size/ice/sugar/topping picker, and an operational alert banner for missed prints (out-of-labels, print failures). All investigated live against a `noop` test backend before writing this spec — root causes below are confirmed, not guessed.

## 2. Scope

**In scope (this spec):**
- **A — Fix: "Hủy món" `invalid itemindex`.** Root cause: `cancelItemPrompt`/`executeCancelItem` calls the legacy GAS action `cancel_order_item` directly, which reads the item list from the ORDERS Sheet (`items_json`, col J) via `_findOrderRow`. That Sheet row is written asynchronously by the realtime syncer, so its item array can be out of step (order/length) with the local `STORE` items the KDS card displays. Staff picks an item by position on screen; the position sent to GAS doesn't match the Sheet's array → `Invalid itemIndex`.
- **B — Fix: "Thêm món" not usable for items with modifiers (most drinks).** Root cause: `checkoutSelectAddItem()` (and the structurally identical `selectSwapNewItem()` used by "Đổi món") opens `#size-overlay` without closing the overlay it was opened from (`#checkout-add-overlay` / `#swap-overlay`). Both are `.overlay-bg` at the same `z-index:9999`; being later in DOM order, the picker sheet paints on top of the now-open size sheet, which becomes fully obscured and untappable. Confirmed live: `pendingCheckoutAdd=true`, `#size-overlay` has `hidden` removed and `display:flex`, but zero visible pixels reach the user.
- **C — Fix: cart not cleared unless "Đóng" is pressed.** Root cause: `submitStaffOrder()` on success only hides `#order-form` and shows `#submit-success`; `resetStaffCart()` (which clears `staffCart`) runs **only** from the success panel's "Đóng" button (`onclick="closeCartSheet();resetStaffCart()"`). Any other dismissal (tap outside, switch tab) leaves `staffCart` holding the already-submitted items; the next submit re-sends them merged with new items → duplicate order for items already placed.
- **D — Multi-item cancel.** Extend the (now-fixed, local-first) cancel flow so staff can check multiple lines and cancel them in one PIN confirmation instead of repeating the flow per item.
- **E — Keyboard shortcuts for the size/ice/sugar/topping picker (`#size-overlay`, kds.html only).** One shared sheet powers Gọi món (staff cart add), Thêm món (checkout add), and Đổi món (swap) — one fix covers all three entry points.
- **F — `order.html` default sugar → closest to 50%.** Currently defaults to the first array entry (100%). Change to the entry containing "50" when present.
- **G — Operational alert banner (missed prints).** A persistent banner on the "Đơn hôm nay" screen surfacing (1) real print failures already tracked by the spool, and (2) a new manual "⚠️ Tem không ra" flag staff can raise per order when a label silently didn't come out (labels have no physical print-confirm, unlike receipts' DLE EOT check — this is a hard hardware constraint, not a software gap: no software-detectable signal exists for "out of paper" on the current label path).

**Out of scope:** anything touching the realtime syncer / GAS write path, the VOIDED→Sheets gap, web-order intake — all pre-existing, unrelated follow-ups already tracked elsewhere.

## 3. Architecture

- **A, D** move from a GAS-direct call to the existing local endpoint `PATCH /order/<id>/items` (`bill_engine.apply_items_edit`, already wired to fire cancel tickets via `_enqueue_cancel_ticket` in `print_server.py`). No new backend route. The item list mutated is the same `o.items` array the KDS card renders — the index-mismatch class of bug is structurally eliminated, not just patched around.
- **B, C, E, F** are frontend-only fixes/additions inside `web/kds.html` (B, C, E) and `web/order.html` (F). No backend change.
- **G** adds one small new table `print_issues` in the existing print-server sqlite (same conn/lock as `outbox`/`orders`/`print_spool`), two small routes (`GET /print/issues`, `POST /print/issues/<id>/resolve`, `POST /print/issues/flag`), and a banner component in `kds.html`. The existing `_spool_alert(job, err)` hook (already fires on real terminal print failures, currently only sends a Telegram `notify_admin`) gets one more line: log the same event into `print_issues` so the banner and the Telegram alert stay in sync.
- Money-path invariant preserved: no change to the syncer, to `mark_paid`, or to how totals are computed. A and D produce the exact same server-side mutation checkout's own line-edit already produces (proven, tested code path) — just reached from a different UI trigger.

## 4. Feature detail

### A — Hủy món → local-first
`cancelItemPrompt`/multi-select flow (see D) builds `newItems` by removing the selected line(s) from the **local** `o.items` (same array the card renders), then calls the same client path checkout uses: `PATCH /order/<id>/items` with `{items: newItems, version: o.version, manager_pin}`. Server-side `bill_engine.apply_items_edit` diffs old vs new, fires a cancel ticket for the removed line(s) automatically (existing behavior, already tested). The staff-entered **reason** has no dedicated column today; it's passed as an extra `reason` field in the PATCH body and the server logs it (`log.info`) for a paper trail, without a schema migration. `GAS_URL`/`TQ` and the old `cancel_order_item` GAS action are no longer called from this flow (function stays in `gas/Orders.gs` for now — untouched, just unreferenced from this path).

### B — Fix overlay stacking (Thêm món + Đổi món)
In `checkoutSelectAddItem()` and `selectSwapNewItem()`, before showing `#size-overlay`, hide the sheet it was opened from (`closeCheckoutAddOverlay()` / `closeSwapOverlay()` — both already exist and just clear the container's `innerHTML`, cheap to call). `#size-overlay`'s own close/cancel path already knows how to return control correctly (`pendingCheckoutAdd`/`pendingSwap.isCustomizing` flags), so nothing else changes. One-line-per-call-site fix, same shape in both places.

### C — Clear cart right after submit
In `submitStaffOrder()`, immediately after a successful `submitOrder()` + `optimisticInsert()` (right where `pendingStaffSubmit = null` is set today), call the cart-clearing part of `resetStaffCart()` (splitting it if needed: `staffCart = []; selectedTable=''; orderMode='dine_in';` — the same lines the button already runs). The success panel (`#submit-success`) still shows and still has "Đóng" to dismiss it and reset the form fields (`staff-phone`/`staff-notes`), but the cart itself is empty the instant the order is confirmed sent — no window where a stray tap can duplicate it.

### D — Multi-item cancel
Step 1 of the cancel sheet changes from "tap one item to proceed" to a checklist: each line gets a checkbox (tap toggles selection, no auto-advance), plus a footer button `❌ Hủy N món đã chọn` (disabled at N=0). Confirming goes to the existing step 2 (reason chips + free text) unchanged, then one PIN confirmation applies to all selected lines in a single `PATCH /order/<id>/items` call (all selected lines removed from `newItems` at once — atomic, one version bump, one cancel-ticket batch instead of N separate calls).

### E — Keyboard shortcuts in `#size-overlay`
A `keydown` listener active only while `#size-overlay` is open and no `<input>`/`<textarea>` is focused (same `isInputFocused` guard pattern already used for the `M`/Enter/Escape shortcuts elsewhere in `kds.html`):
- `L` / `M` — select size L / M (`L` only acts if `item.price_l` exists, i.e. size L is offered).
- `↑` / `↓` — move one step toward more ice / less ice along `cz.ice` (array order from menu data, typically full→less→none); clamps at the ends, does not wrap.
- `1`–`5` — select `cz.sugar[0..4]` positionally (100/70/50/30/0%); a key beyond the item's actual option count is a no-op.
- `8`, `9`, `0` — toggle `cz.toppings[0]`, `[1]`, `[2]` on/off (menu data's max toppings-per-item is 3, exact fit); a key beyond the item's actual topping count is a no-op.
- `Enter` — same action as tapping the sheet's main confirm button (add to cart / add to order / confirm swap, whichever `pendingCheckoutAdd`/`pendingSwap` state is active).
All of these call the same `selSize`/`selIce`/`selSugar`/`selTopping`-equivalent state mutators the chips already use, then `renderCustomOptions()` — so the chip UI updates in lockstep with the keyboard, and touch still works identically.

### F — `order.html` default sugar
In `openItemSheet()`, `sugarSel` init changes from `cz.sugar[0]` to: the entry in `cz.sugar` containing `"50"` if one exists, else fall back to `cz.sugar[0]` (covers the one menu variant that only offers `('0%',)`).

### G — Operational alert banner
**Data:** new table `print_issues(id, order_id, kind, issue_type, note, created_at, resolved_at)` — `issue_type` is `auto_failed` (from `_spool_alert`) or `manual_flag` (staff-raised). Same sqlite file/conn/lock as the rest of `print-server` (no new DB file).

**Auto path:** `_spool_alert(job, err)` — already called once a job exhausts retries and is truly `failed` (not a transient offline/backoff case, which never reaches this hook) — gains one line inserting a row with the existing `job`/`err` info. No behavior change to printing itself, purely an additional log write next to the Telegram call already there.

**Manual path:** new small button `⚠️ Tem không ra` on each order card, next to the existing `↻ In lại tem` button. Tapping it opens a one-tap confirm ("Xác nhận: tem đơn #QX1 không ra?") and posts `POST /print/issues/flag {order_id, note}` — no PIN needed (it's a report, not a money-affecting action).

**Banner:** a dismissible-but-persistent-while-open strip at the top of "📋 Đơn hôm nay" (below the header, above the filter bar), shown only when `GET /print/issues` (polled on the existing 4s/15s cadence alongside cloud/printer badges) returns ≥1 unresolved row. Shows a count and expands to a short list; each row has two independent actions: **🏷️ In lại tem** re-enqueues the label (existing `/enqueue/single_label` call) **and then** marks the issue resolved on success (the reprint *is* the fix — one tap covers both); **✓ Đã xử lý** marks resolved **without** reprinting, for the case where staff already reprinted by hand or the issue turned out to be a false alarm.

## 5. Error handling

- A/D: same `VersionConflict`/404 handling `checkoutPatchItems` already has (stale-version reload + toast); PIN check unchanged (`locked_order_needs_pin` 403 only applies to paid/voided orders, same as today).
- B: no server call involved; purely a client-side visibility fix — nothing new to fail.
- C: unaffected by network failure — the cart is only cleared after `submitOrder()` already resolved successfully; the existing catch-block (order not sent → cart kept, alert shown) is untouched.
- E: out-of-range keys (e.g. `5` on a 2-option sugar item) are no-ops, never throw; arrow keys clamp instead of wrapping so staff can't "arrow past" into an invalid state.
- G: `/print/issues/flag` and `/resolve` are idempotent-safe (re-flagging the same order just adds another row; re-resolving an already-resolved id is a no-op 200). Banner fetch failure (server unreachable) just hides the banner rather than erroring — same fail-open pattern as the existing printer/cloud badges.

## 6. Testing

- Backend: `python3 -m unittest` additions — multi-line `apply_items_edit` removal (already covered by existing `bill_engine` tests, add a 2-line-at-once case); `print_issues` table CRUD (`flag`, `list`, `resolve`) via `RouteTestBase`-style temp DB, `PRINT_ENGINE=noop`.
- JS: any pure helper worth extracting (e.g. the sugar/topping key→index mapping) gets a `node:test`.
- Browser (test backend on a spare port, never prod 5001): reproduce all three original bugs against the fix (index-mismatch cancel no longer errors after a local edit; add-item/swap works for a modifier item, size sheet visible and tappable; cart empty immediately post-submit without touching "Đóng"); multi-cancel removes N lines in one PATCH; keyboard shortcuts select the right size/ice/sugar/topping and Enter confirms; banner appears after a flagged issue and clears after resolve.
- Never run the live-POS hardware suites; verify against a `noop` backend on a non-production port, exactly as done for prior sessions on this branch.

## 7. Open decisions (resolved)

- Hết-tem detection → manual staff flag + existing real spool-failure queue, not printer status-query research (hardware uncertain, deferred). ✅
- Cart-clear timing → immediately on successful submit, not gated on any button. ✅
- Sugar shortcut keys → `1`-`5` positional (not `1234` — five keys for five levels, no level dropped). ✅
- Ice arrow direction → `↑` = more ice, `↓` = less ice (intuitive direction, not raw array-index direction). ✅
- Shortcut scope → `kds.html` only (has a keyboard at the counter); `order.html` stays touch-only. ✅
