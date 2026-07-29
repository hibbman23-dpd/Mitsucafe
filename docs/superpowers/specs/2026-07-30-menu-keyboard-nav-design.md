# Gọi món — điều hướng bằng bàn phím (category + món theo số)

**Date:** 2026-07-30
**Status:** Approved (brainstorming) → next: implementation plan
**Owner:** Chief (Sonnet 5)
**Depends on:** shipped size-overlay keyboard shortcuts (2026-07-29 plan, Task 4) — same `#size-overlay` keydown block, same `document.addEventListener('keydown', ...)` in `web/kds.html`.

## 1. Purpose

Counter staff on "➡️ Gọi món" (the main order-entry screen) currently pick a category then tap a menu card, then tap modifier chips — all touch. This adds a keyboard-number fast path on top (not a replacement): a digit picks the category, then a second key (digits + `0` + `-` + `=`) picks the exact item, landing straight in that item's modifier sheet (or straight in the cart if it has no modifiers). `Backspace` steps back one level; a successful add always lands back on the full "Tất cả" view. Touch/mouse behavior is unchanged — the number badges only appear once a category is entered via keyboard.

## 2. Scope

**In scope:**
- 8 keyboard-selectable buckets (7 real menu categories + a synthetic "Cacao" bucket carved out of all of them) mapped to digits `1`–`8`.
- Per-bucket item numbering using the 12-key sequence `1 2 3 4 5 6 7 8 9 0 - =`, with a visible number badge per item card while a bucket is active.
- `Backspace` to go back one level (modifier sheet → bucket item list → full menu); digits switch bucket directly from within a bucket, no need to back out first.
- Auto-return to the full "Tất cả" view after any successful add-to-cart (with or without a modifier sheet).
- Scope is `web/kds.html`'s main "➡️ Gọi món" screen only (`activeView === 'menu'`) — not the checkout "Thêm món" picker, not "Đổi món" swap picker (both separate overlays with their own item-list sheets; out of scope per the owner's explicit choice).

**Out of scope:** any change to the existing touch-driven category pills (`renderCatPills`/`setMenuCat`) or the existing `fam_cacao`/`fam_matcha` quick-filter pills — those stay exactly as they are today for mouse/touch use. This feature is a parallel, keyboard-only rendering path that does not modify or replace them.

## 3. Why a synthetic "Cacao" bucket

Real per-category item counts (available items, current menu):

| category (existing `subcategory` id) | items | items minus name-matches "CA CAO" |
|---|---|---|
| coffee | 13 | 11 |
| hot_drinks | 8 | 7 |
| latte | 17 | 11 |
| fruit_tea | 10 | 10 |
| milk_tea | 11 | 11 |
| yogurt | 9 | 8 |
| coldbrew | 5 | 5 |
| (cacao, cross-category) | — | 10 |

`latte` alone has 17 items today — far past what a single keypress-per-item scheme can address (max 12 slots: `1234567890-=`). Pulling every item whose name contains "CA CAO" out of its home category into its own bucket 8 brings every bucket down to ≤11, safely inside the 12-slot budget, confirmed against the live `web/menu-data.js` content (script-verified, not estimated). This exclusion is **specific to this keyboard feature's bucket computation** — it does not touch the existing `fam_cacao` pill (which stays a non-exclusive, additive filter, unaffected) or the `subcategory` field on any menu item.

## 4. Architecture

- New module-level state in `web/kds.html`: `let numNavBucket = null;` (`null` = not in keyboard-nav mode i.e. showing the normal touch grid; `1`–`8` = which bucket is active).
- New function `computeNumNavBuckets()` — builds the 8 buckets fresh from `MENU_DATA` each time (same pattern as the existing `renderCatPills`'s inline `.filter()` calls, no caching needed at this data size): buckets 1–7 are `CATEGORIES[i]` items with `!name.toUpperCase().includes('CA CAO')`, sorted by `sort_order`; bucket 8 is every available item whose name contains "CA CAO", sorted by `sort_order`.
- New function `renderNumNavItems()` — renders bucket 8's (or 1–7's) items as a single unsectioned grid (visually modeled on the existing `fam_cacao` branch already inside `renderMenuGrid()`), each card carrying a new number-badge element showing its assigned key (`KEY_SEQUENCE[i]` where `KEY_SEQUENCE = ['1','2','3','4','5','6','7','8','9','0','-','=']`).
- `renderMenuGrid()` gets one new early-return branch: `if (numNavBucket) { renderNumNavItems(); return; }` — everything below it (the existing `fam_cacao`/category-sectioned rendering) is untouched and still runs exactly as today whenever `numNavBucket` is `null`.
- Keydown handling: extended inside the existing `document.addEventListener('keydown', ...)` in `web/kds.html` (the same listener Task 4's size-overlay shortcuts live in). Two new pieces:
  1. A new top-of-listener branch, active only when no overlay is open (`sizeOverlay` hidden, `cartOverlay` hidden — same checks already computed in the listener) **and** `activeView === 'menu'` **and** `!isInputFocused`: digits `1`–`8` call `enterNumNavBucket(n)`; `Backspace` (when `numNavBucket !== null`) calls `exitNumNavBucket()`; a digit/`0`/`-`/`=` key that matches a currently-visible item's badge (only reachable when `numNavBucket !== null`) calls the same handler `tapMenuItem(sku)` already used by a card's `onclick`.
  2. One line added to the **existing** `#size-overlay` branch (Task 4's, `web/kds.html` — the block that already handles `Enter`/`Escape`/`handleSizeOverlayShortcut`): `Backspace` there calls `closeSizeSheet()`, exactly like `Escape` already does. No new overlay-detection logic — reuses the branch verbatim.
- After a successful add — both paths that currently complete an add (`tapMenuItem`'s direct `addToStaffCart` call for no-option items, and `confirmCustomOrder`'s `addToStaffCart` call for items with options) — call a new tiny helper `exitNumNavBucket()` unconditionally (it's a no-op if `numNavBucket` is already `null`, i.e. the item was added via ordinary touch), which sets `numNavBucket = null` and re-renders the grid — landing on "Tất cả".

## 5. Interaction detail

- **Enter a bucket:** press `1`–`8` while on the plain "Tất cả" menu screen (or while already inside another bucket — switching buckets doesn't require backing out first). Sets `numNavBucket`, re-renders to the single filtered grid with number badges, scrolls to top.
- **Pick an item:** press the key matching a visible badge. Routes to the exact same code path a tap already uses (`tapMenuItem(sku)`) — no duplicated add-to-cart logic. Unmapped/no-op keys (e.g. pressing `9` in a 7-item bucket) do nothing, matching Task 4's existing no-op-on-out-of-range convention.
- **Back out one level:**
  - From the modifier sheet (`#size-overlay` open): `Backspace` closes it (same as `Escape`), landing back on the bucket's item grid (badges still showing, `numNavBucket` unchanged).
  - From a bucket's item grid (no overlay open): `Backspace` exits the bucket (`numNavBucket = null`), landing back on "Tất cả".
  - `Backspace` while `numNavBucket` is already `null` and no overlay is open: no-op (nothing to go back to).
- **After adding to cart:** regardless of whether the item had a modifier sheet, the view always returns to "Tất cả" (`numNavBucket = null`) — matches the stated requirement literally ("đặt món xong sẽ nhảy về màn hình tất cả món lại").
- **Search box / other tabs:** the whole feature is inert whenever `activeView !== 'menu'` or the search input (or the note textarea inside the modifier sheet) has focus — typing to search or typing a note is never hijacked, same guard pattern (`isInputFocused`) Task 4 already established. `renderNumNavItems()` does not consult `searchQuery` at all — entering a bucket shows that bucket's full item list regardless of any text currently sitting in the search box (the search box itself is untouched/not cleared, it simply has no effect while a bucket is active; typing in it while `numNavBucket` is set has no visible effect until the user backs out to "Tất cả", which is existing, unsurprising behavor since the search box only ever filtered the "Tất cả" sectioned view to begin with).
- **Touch category pills while a bucket is active:** the existing pill row (`#cat-pills`, `renderCatPills()`'s output) stays untouched/unaffected by `numNavBucket`, but showing it during a keyboard bucket view would visually contradict the filtered grid (pills still show "Tất cả" highlighted while the grid shows only Latte, say). `renderNumNavItems()` hides the pill row's container (adds a `hidden` class) while a bucket is active, and `exitNumNavBucket()` removes it — the row reappears exactly as it was (still showing whatever `activeCat` was last, untouched) once back on "Tất cả".

## 6. Visual

- Number badge: a new small CSS class (e.g. `.num-badge`), positioned top-left of the card (the existing `.cart-qty-badge` already occupies top-right for in-cart quantity, so no collision), circular, high-contrast, large enough to read at a glance — same "big enough for a busy counter" bar this branch has applied to every other on-screen number this week (STT ĐƠN, table number on the prep ticket, etc.).
- A short one-line strip above the bucket grid names the bucket and reminds staff of the `Backspace` key (e.g. "☕ Cà phê · 11 món — Backspace để quay lại"), styled consistently with the existing `.menu-cat-header` bar.
- Nothing about the ordinary "Tất cả" touch view changes — no badges, no strip — unless a bucket is currently entered via keyboard.

## 7. Error handling / edge cases

- A bucket temporarily having 0 items (e.g. everything in that category marked unavailable) — same empty-state pattern the existing `renderMenuGrid()` already shows, reused.
- Menu data changing between renders (item toggled unavailable mid-shift) — buckets are recomputed fresh on every `renderNumNavItems()` call (no stale cache), so a key press always maps against the currently-visible badge, never a stale one.
- Switching away from "➡️ Gọi món" tab while a bucket is active — `switchView()` doesn't need new logic; `numNavBucket` simply stays set in memory but is inert (the keydown guard requires `activeView === 'menu'`), and returning to the tab re-renders whatever `numNavBucket` was left at. To avoid confusing "I left mid-category, came back, why is it still filtered" behavior, `switchView(v)` gets one added line: reset `numNavBucket = null` whenever leaving `'menu'` (`v !== 'menu'`).
- `Backspace` is a browser-navigation key by default (history back) in some contexts — `e.preventDefault()` is called whenever this feature's listener acts on it (matching how Task 4 already `preventDefault()`s its recognized keys), so it never triggers a page navigation.

## 8. Testing

- No backend involved — this is 100% `web/kds.html` client logic, same as Task 4 (2026-07-29 plan), which shipped with pure browser-verification, no automated test file (kds.html has no JS test harness).
- Browser-verify on the `:5002` throwaway test backend (never prod 5001), same pattern used all week: confirm the bucket item counts computed match the table in §3 (script-check already done once above; re-confirm live by pressing each of `1`-`8` and counting rendered badges); confirm a multi-digit-adjacent bucket (`3`=latte, 11 items) shows badges through `0` and `-` correctly ordered; confirm pressing an item key opens the right item's modifier sheet with the right name; confirm `Backspace` from the sheet lands back on the same bucket (not "Tất cả"); confirm `Backspace` from the bucket grid lands on "Tất cả"; confirm adding an item both with and without modifiers lands on "Tất cả"; confirm switching to another tab and back clears the bucket; confirm typing in the search box or the modifier-sheet note field is never hijacked by a digit/`Backspace` press.

## 9. Open decisions (resolved)

- 2-digit item numbers → rejected in favor of a synthetic 8th "Cacao" bucket that keeps every bucket ≤11 items, fitting a single-keypress-per-item scheme (`1234567890-=`, 12 slots). ✅
- Scope → main "Gọi món" screen only, not "Thêm món"/"Đổi món" pickers. ✅
- Cacao bucket exclusivity → items pulled out of their home category for this feature's bucket math only; existing `fam_cacao` touch pill and `subcategory` data field untouched. ✅
