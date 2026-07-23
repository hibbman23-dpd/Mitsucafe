# Print Pipeline — Hardware Validation (on Mac Mini)

> **STATUS 2026-07-23: SHIPPED & LIVE.** The engine is running in production as
> `PRINT_ENGINE=spool` with **direct USB transport on BOTH printers** (CUPS is bypassed —
> it was the root cause of dropped orders: the macOS usb backend aborts jobs after `lpr`
> exit 0 when the clone won't answer the EP 0x81 back-channel). Plist env now:
> `LABEL_TRANSPORT=usb` VID 8137/PID 8214/EP 2, `RECEIPT_TRANSPORT=usb` VID 10473/PID 649/EP 1;
> receipt GEZHI answers `DLE EOT` → `caps={'dle_eot'}`. `CupsTransport` remains as a fallback
> only (now with verified-submit: scans CUPS error_log for per-job abort). The `cups`-transport
> steps below are kept for reference / rollback; the current deployed transport is `usb`.

Task 12 of the reliable-print-pipeline plan. The code is done and unit-tested
without hardware. This checklist is run ON THE MAC MINI with the real printers, to validate
the spool engine end-to-end and then flip `PRINT_ENGINE=spool` in production.

Printers: POS-58L (GEZHI, receipt, ESC/POS, CUPS name `GEZHI_POS_Printer`) ·
XP-365B (Xprinter, label, TSPL, CUPS name `Xprinter_XP_365B`).

---

## ⚠️ PRE-FLIGHT — do these BEFORE flipping `PRINT_ENGINE=spool` (mandatory)

1. **Clear phantom test rows from the spool.** During development, unit tests wrote 3 test
   rows into the `print_spool` table of the real `outbox.db`
   (`ORD-20260723-0100:label:1`, `:label:2`, `ORD-20260723-0101:receipt:0`). If the spool
   worker starts with these present, it will print 3 ghost labels/receipt. Clear them:
   ```bash
   sqlite3 /Users/dpd/Projects/lamha-kissaten/print-server/outbox.db \
     "DELETE FROM print_spool WHERE order_id IN ('ORD-20260723-0100','ORD-20260723-0101');"
   # or, to start the spool completely empty:
   # sqlite3 .../outbox.db "DELETE FROM print_spool;"
   ```
   Verify: `sqlite3 .../outbox.db "SELECT COUNT(*) FROM print_spool;"` → expect 0 before first run.

2. **Deploy the poller and the engine flip TOGETHER (atomic).** The poller is gated on its own
   `PRINT_ENGINE` env (legacy → `/print/*` + marks GAS; spool → `/enqueue/*`, worker marks GAS).
   Set `PRINT_ENGINE=spool` in BOTH launchd plists
   (`com.lamha.kissaten.printserver.plist` AND `com.lamha.kissaten.printpoller.plist`) in the
   same deploy. If only the poller flips, orders enqueue but nothing prints; if only the server
   flips, online orders still print via the legacy `/print/*` path (safe, mixed) — but the
   intended state is both on spool.

3. **Decide the two open go/no-go items below.**

---

## Open decisions to confirm

- **(GO/NO-GO) `_gas_post` now works.** A module-level `import json` was missing in the deployed
  server (`ef7bca3`), so `_gas_post` always raised `NameError` and `/order/status` +
  `/order/mark_paid` always fell back to the offline sync queue (the syncer still delivered them,
  just never the immediate online POST). The fix (needed for the spool renderer) repairs this, so
  those two endpoints now POST to GAS synchronously (up to 8s) inside the request handler. This is
  the intended behavior, but it is a live behavior change on the current legacy default. Confirm
  acceptable, given the documented GAS 403/OAuth-revocation history (a slow/failing GAS now adds
  request latency where before it failed instantly to the queue).

- **(ACCEPT-BEFORE-FLIP) At-least-once duplicate window.** If `confirm()` times out AFTER the bytes
  physically printed (only possible when the printer's status back-channel is enabled and slow),
  the job requeues and reprints — for a cash receipt this reprints the receipt AND re-kicks the
  drawer. This is the inherent at-least-once edge (spec §13); there is no reliable ACK on these
  clones to prevent it. Accept, or keep receipts on pacing-only confirm (no `dle_eot`) to avoid it.

---

## Step 1 — Capture USB identifiers (needed for `usb` transport)

```bash
system_profiler SPUSBDataType | grep -iA8 "xprinter\|gezhi\|pos-58\|365\|thermal\|printer"
```

Record (fill in):

| Printer | Vendor ID | Product ID | EP OUT | Notes |
|---|---|---|---|---|
| XP-365B (label)   | 0x____ | 0x____ | 0x02? | |
| POS-58L (receipt) | 0x____ | 0x____ | 0x01? | |

---

## Step 2 — Logic de-risk over CUPS (no wiring change)

Set in the `printserver` plist: `PRINT_ENGINE=spool`, `LABEL_TRANSPORT=cups`, `RECEIPT_TRANSPORT=cups`.
(Leave the poller on its own flag until Step 5.) Restart:
```bash
launchctl kickstart -k gui/$(id -u)/com.lamha.kissaten.printserver
```
Confirm workers started: `curl -s localhost:5001/health | python3 -m json.tool` → shows a `spool`
block with `{pending, printing, failed}` per printer.

Run the five scenarios and record PASS/FAIL + notes:

| # | Scenario | Expected | Result |
|---|---|---|---|
| 1 | 5 back-to-back `/order` calls | all 5 orders' labels print, correct counts, none dropped | |
| 2 | one 10-cup order | exactly 10 labels, correct `[n/10]`, no dup, no missing cup | |
| 3 | one 50-item receipt | full header+logo, full body, tail, paper cut; no black background | |
| 4 | cold start (idle >30s, then 1 order) | first receipt/label prints clean (ESC @ wake fired) | |
| 5 | pull USB / `kill` server mid-print, then restart | on restart, replay prints ONLY the unprinted remainder; no duplicate of a confirmed one | |

Scenario 5 is the durability proof — the orphan-recovery + per-cup idempotency guarantee.

---

## Step 3 — Flip label transport to USB

Set `LABEL_TRANSPORT=usb`, `LABEL_USB_VID`/`LABEL_USB_PID`/`LABEL_USB_EP` from Step 1. Restart.
Re-run scenarios 1, 2, 5. Check the worker log line for `caps=` — if the XP-365B answers a TSPL
status query, `tspl_status` appears and confirm is real; otherwise it falls back to the 0.8s
gap-sensor pacing (both are acceptable — labels must still all print).

> ⚠️ Back-channel confirm needs on-device tuning (finding I2). `confirm()` re-sends the status
> query each poll and currently treats ANY status byte as "printed done". Real ESC/POS `DLE EOT`
> and TSPL status bytes carry idle/paper/error bits — if a status-capable printer double-prints or
> stalls under USB, the fix is to interpret those bits (idle+paper-ok) instead of "any byte". If in
> doubt, leave `*_TRANSPORT=cups` (pacing-only, no back-channel) — it is the validated default.

> Known caveat (spec §6.1 / carry from Task 8): the label setup preamble (SIZE/GAP/DENSITY/SPEED/
> DIRECTION) is sent once per worker session. If the printer is power-cycled WHILE the server keeps
> running, the worker will not re-send the preamble and labels may print at the wrong size until the
> server is restarted. If you power-cycle the label printer, restart the `printserver` agent too.

---

## Step 4 — Flip receipt transport to USB

Set `RECEIPT_TRANSPORT=usb` + its VID/PID/EP. Restart. Re-run scenarios 3, 4. Verify:
- Header/logo present on every receipt (no dropped first chunk).
- Full body + paper cut on the 50-item receipt; never a solid-black page.
- Cash order opens the drawer exactly once; VietQR/bank-transfer order does NOT open the drawer.

---

## Step 5 — Flip the poller to spool (complete the cutover)

Set `PRINT_ENGINE=spool` in `com.lamha.kissaten.printpoller.plist`, restart the poller agent.
Place a test order through the ONLINE path (GAS) and confirm it enqueues, prints, and GAS gets
marked (`label_printed_at` / `printed_at` set) only AFTER the physical print.

Rollback at any step: set `PRINT_ENGINE=legacy` in the relevant plist(s) and restart. The legacy
`/print/*` + synchronous-print path is fully preserved.

---

## Results log

(fill in date, who ran it, and PASS/FAIL per scenario)
