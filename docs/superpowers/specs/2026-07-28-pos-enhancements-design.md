# POS Enhancements — Cashier mode, add-from-table, custom label, batch-close, mobile order page

**Date:** 2026-07-28
**Status:** Approved (brainstorming) → next: implementation plan
**Owner:** Chief (Opus)
**Depends on:** the shipped GAS-free order backend + iPOS checkout + floor map (branch `launch-hardening`).

## 1. Purpose

Five additive features on top of the working internal POS. They make the counter/waiter workflow faster and cover a few real gaps the owner found in use. One deferred item (web-order intake) is out of this spec.

## 2. Scope

**In scope (this spec):**
- **A — Cashier mode (💰 Thu ngân):** a payment-focused view listing every table/order that still owes money, with one-tap pay.
- **C — Add item from the floor map:** a shortcut on a busy table tile to add another round without opening checkout.
- **D — Off-menu custom label:** print a cup label (tem) for an item not in the menu, without creating an order.
- **E — Batch close delivered:** a button that marks every PAID-but-not-yet-DELIVERED order as DELIVERED in one press (end-of-day board cleanup). **Only touches already-paid orders** — never marks an unpaid order paid.
- **F — Mobile staff order page (`web/order.html`):** a lightweight phone-first ordering page for waiters to take orders tableside.

**Out of scope (deferred):**
- **B — Web-order intake** (mitsu.cafe → GAS mailbox → local inbox): needs GAS + the public site; its own later spec. The inbox UI already exists and shows empty until then.

## 3. Architecture

- **A, C, E** are additions inside `web/kds.html` (reusing `allOrders`, `openCheckoutTable`, `api()`, `renderFloorMap`, `switchView`, `selectedTable`, `isCheckoutOrderPaid`).
- **D** adds one backend endpoint `POST /print/custom_label` in `print-server/print_server.py` (builds a TSPL label and prints via the existing label pipeline; creates no order) plus a small sheet in `kds.html`.
- **F** is a new standalone page `web/order.html`, served by the existing `print_server` route (`GET /order.html`), reusing `menu-data.js` + `order-api.js` + the order-submit flow. Phone-first, no KDS board.
- Money-path invariant preserved: A settles through the existing checkout (no new pay path); E only advances status of already-paid orders; D never touches orders or money.

## 4. Feature detail

### A — Cashier mode (💰 Thu ngân)
A view toggle alongside "📋 Danh sách" and "🗺️ Sơ đồ bàn" (or a header button). It lists every **dine-in table that owes money** and every **unpaid pickup order**, each as a row: table/short-code, số đơn, số tiền còn nợ, thời gian sớm nhất, and a large **💰 Thu tiền** button → `openCheckoutTable(tableId)` / `openCheckout(orderId)`. Sorted by oldest first. "Owes money" = has orders where `!isCheckoutOrderPaid(o)` and status not in `CANCELLED/VOIDED/SPLIT/DELIVERED` (same rule as the floor map / pay bar). Refreshes on the existing 4s poll.

### C — Add item from the floor map
On each **busy** table tile, add a small **➕** control (corner, doesn't trigger the tile's main tap). Tapping ➕ → `switchView('menu'); selectedTable = '<nn>'; renderTableGrid();` — i.e. jumps to Gọi món with that table preselected. Sending there creates a **new order for the table** (an additional round); the floor map already sums multiple orders per table. The tile's center tap still opens checkout. No new backend — reuses the order-create flow.

### D — Off-menu custom label
A sheet **🏷️ Tem món lạ** opened from a header/menu button: a free-text **tên món** input, size / đá / đường chips (reuse existing `ICE_LABEL`/`SUGAR_LABEL` values), a quantity stepper, and **🖨 In tem**. It calls a new endpoint:

`POST /print/custom_label` body `{name, modifiers:{size,ice,sugar}, qty}` → builds a TSPL cup label from a synthetic item `{name, modifiers, qty}` using the existing `build_order_labels_tspl`/label pipeline and prints it (respecting `PRINT_ENGINE`: spool enqueues, legacy prints synchronously, noop no-ops). Returns `{ok, printed}`. It creates **no order**, touches no money — just a label. Idempotency is not required (an operator explicitly asks to print).

### E — Batch close delivered
A button **✅ Xong hết đơn đã giao** (in the cashier mode / board header). On press, with a confirm dialog, it finds every order that is **paid** (`isCheckoutOrderPaid(o)`) but whose status is not yet a terminal state (`DELIVERED/CANCELLED/VOIDED/SPLIT`), and for each calls `api().setStatus(order_id, 'DELIVERED')`. It **never** calls `markPaid` and **never** touches an unpaid order — so it cannot turn an unpaid order into a settled one. Reports how many were closed; refreshes. This clears paid-but-lingering orders from the board at end of day.

### F — Mobile staff order page (`web/order.html`)
A new phone-first page: a compact header, a **table picker** (chips 01..20 + Mang đi), a scrollable **menu grid** grouped by category (from `menu-data.js`), tapping an item opens a quick modifier chooser (size/đá/đường/topping) and adds to a **cart**, a sticky cart bar with total and a **Gửi đơn** button that posts via `order-api.js` (`submitOrder`-equivalent → local `/order`). Large tap targets, single-column, no KDS board weight. It reads the gateway base from `location.origin` like `kds.html`. Optional **Gửi & Thu tiền** for takeaway quick-pay. Reuses the same modifier vocabulary and menu data so items/tem match the main system exactly.

## 5. Error handling

- A / cashier: if a table has no unpaid orders it isn't listed; a paid table disappears (consistent with the paid-exclusion rule).
- C: if the table already has orders, the new round is a separate order (by design); nothing overwrites.
- D: print failure surfaces a toast; no order/money affected. Under `noop`, the sheet reports "đã gửi (chế độ thử)".
- E: confirm before running; per-order `setStatus` failures are collected and reported ("N đơn chưa đóng được"); already-terminal orders are skipped.
- F: local-first submit like `kds.html`; on server-unreachable, show a retry banner and keep the cart.

## 6. Testing

- Backend: `POST /print/custom_label` — unit test (via `RouteTestBase`, `PRINT_ENGINE=noop`) asserts 200 + no order row created + no prod-DB write.
- JS: any extracted pure helper (e.g. cashier "owes money" filter, E's paid-not-terminal filter) gets a `node:test`.
- Browser (controller, test backend on a spare port): cashier list shows unpaid tables + pay opens checkout; ➕ on a busy tile jumps to Gọi món preselected; custom-label sheet posts to `/print/custom_label`; batch-close sets only paid orders DELIVERED; `order.html` loads on mobile viewport, picks a table, adds an item, sends an order.
- Never run the live-POS hardware suites; verify against a `noop` backend on a non-production port.

## 7. Open decisions (resolved)

- D meaning → off-menu custom cup label, no order created. ✅
- C location → shortcut from the floor map busy tile. ✅
- E semantics → batch-DELIVER only already-paid orders (never mark unpaid as paid). ✅
- F → new lightweight `web/order.html` phone-first page. ✅
- B (web-order intake) → deferred to its own spec. ✅
