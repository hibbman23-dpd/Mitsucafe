# CLAUDE.md — Kissaten Ordering System (Index)
# Master Workflow v2.3 · Drink & Pastry Shop · Lâm Hà

> **This file = map + core rules (read before every task).**
> Full details live in `docs/system/*`. When a task touches an area, **READ that file** —
> it is the source of truth for that area. Nothing was deleted, only split out to save context.
> (v2.2→v2.3: docs translated to English for token efficiency; language conventions added.)

---

## 0. LANGUAGE CONVENTIONS

- **Respond to the user in Vietnamese**, concise; don't re-echo file contents already shown.
- **All artifacts in English**: code, comments, commit messages, docs, internal notes.
- `docs/system/offline-failover.md` stays **Vietnamese** (staff-facing emergency SOP).
- Domain glossary (use these exact translations): tem dán ly = cup label · chốt ca = shift reconciliation · hao hụt = waste/shrinkage · két tiền mặt = cash drawer · hủy nguyên liệu = ingredient write-off · con dấu tích lũy = loyalty stamp · bill nhiệt = thermal receipt.

## 1. INDEX — which file to read when

| Area | File | Read when |
|------|------|---------|
| Event schema (canonical payload) | `docs/system/event-schema.md` | Editing doPost / validation / webhook payload |
| Google Sheets schema (7 tabs) | `docs/system/sheets-schema.md` | Touching Sheets columns, CONFIG keys |
| Cup labels + print hardware | `docs/system/labels-print.md` | ESC/POS, Xprinter, Flask print server |
| GAS function map + subagents | `docs/system/gas-functions.md` | Finding which .gs file holds a function, delegating tasks |
| API integrations | `docs/system/api-integrations.md` | Telegram / Zalo / VietQR / Google Docs |
| Offline & 4-level failover | `docs/system/offline-failover.md` | Network-loss / Mac-crash / power-cut SOP |
| Loyalty stamps | `docs/system/loyalty-stamps.md` | addStamp, redeem, Zalo stamp template |
| Campaign promos | `docs/system/campaign-promo.md` | checkAndRunCampaigns, scheduling |
| Payment watchdog | `docs/system/payment-watchdog.md` | Bank-app-killed Telegram alerts |
| Roadmap (module tiers + checklist) | `docs/system/roadmap.md` | Phase planning, module tier lookup |

Other docs: `docs/architecture.md` (detailed architecture) · `docs/agent-map.md` (shop-ops skills/agents) · `docs/TOKEN_EFFICIENCY.md` (token-lean working guide).

---

## 2. ARCHITECTURE (core)

```
[8 channels] web|qr|zalo|phone|maps|facebook|instagram|tiktok
   ↓ webhook POST / UTM link
[Google Apps Script — EVENT BUS]
   doPost() → validate → route → printLabel → track → invoice → promo → log
   ↓
[Google Sheets — DATABASE]
   ORDERS | MENU | INVENTORY | CUSTOMERS | STAFF | PROMOTIONS | CONFIG
   ↓
[Output] Xprinter POS-58L/XP-365B (label on CONFIRMED) · Telegram (owner alerts)
         Zalo OA (status+stamp+invoice) · KDS tab · thermal/PDF bill (on DELIVERED)
```

**Invariants:**
- GAS = the only event bus · Sheets = the only database · **no** external DB.
- ORDERS is **append-only** — never update in place; append status columns only.
- `order_id` = primary key throughout. `customer_id` = normalized phone (strip +84, keep 0xxx).
- Print cup label **immediately on CONFIRMED** — before brewing starts.

---

## 3. ORDER STATUS FLOW (state machine — core)

```
dine_in/pickup: NEW → CONFIRMED → MAKING → READY → DELIVERED
delivery:       NEW → CONFIRMED → MAKING → READY → DELIVERING → DELIVERED

Valid transitions: NEW→CONFIRMED · CONFIRMED→MAKING · MAKING→READY
                   READY→DELIVERED · READY→DELIVERING · DELIVERING→DELIVERED

Side effects per state:
NEW        → sendTelegramAlert()                  (owner alert immediately)
CONFIRMED  → printOrderLabels()                   ← PRINT CUP LABEL
MAKING     → sendZaloNotify("Đang pha chế ☕")
READY      → sendZaloNotify("Xong rồi! Mời ra lấy 🔔")
DELIVERING → sendZaloNotify("Shipper en route 🛵")
DELIVERED  → printThermalReceipt() · generatePDFInvoice() → sendInvoiceViaZalo()
             addStamp(customer_id) [beverage only] · notifyStampUpdate()
```

(Customer-facing Zalo strings stay Vietnamese — they are product copy, not docs.)

---

## 4. NAMING CONVENTIONS

```
GAS files:  Code.gs · Orders.gs · LabelPrint.gs · Invoice.gs · Payment.gs
            Promo.gs · Loyalty.gs · Inventory.gs · Notify.gs · Utils.gs
Sheets:     UPPERCASE (ORDERS, MENU, CUSTOMERS...)
Variables:  camelCase (orderId, stampCount)   Constants: UPPER_SNAKE (STAMPS_FOR_FREE)
Functions:  verbNoun (printLabel, addStamp, startCampaign)
order_id: ORD-YYYYMMDD-XXXX · event_id: EVT-YYYYMMDD-XXXXXX · campaign: promo-YYYYMMDD-XXX
SKU: DR001 (drink) · BK001 (pastry) · RT001 (retail)
```

---

## 5. NEVER DO (guardrails)

```
❌ External database — Sheets is enough
❌ Tokens/keys in code — always read from CONFIG sheet
❌ GAS trigger < 15 minutes — Google limit
❌ Update ORDERS in place — append only
❌ Hardcode location_id
❌ Skip logError()
❌ Print label after MAKING — must be at CONFIRMED
❌ Points system — replaced by stamp cards
❌ Fixed 8am promo trigger — use the 15-minute interval
❌ macOS auto-update on — causes unannounced reboots
❌ Stamps for pastry/retail — beverages only
```

---

*CLAUDE.md v2.3 (index) · Kissaten Ordering System · details: docs/system/*
