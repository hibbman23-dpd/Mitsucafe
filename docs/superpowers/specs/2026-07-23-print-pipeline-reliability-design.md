# Print Pipeline Reliability — Design

**Date:** 2026-07-23
**Status:** Approved design, pending implementation plan
**Scope:** `print-server/` — receipt (POS-58L, ESC/POS) + label (XP-365B, TSPL) printing on Mac Mini

---

## 1. Problem

Observed on real hardware:

**Label (XP-365B, TSPL):**
- Stress test of 5 back-to-back `/order` calls drops 1–2 orders.
- 10-cup order prints only 4–6 labels then stops, or reprints already-printed labels.

**Receipt (POS-58L, ESC/POS):**
- First order after idle/power-on prints garbled or is skipped.
- Store name / logo header missing on some receipts.
- Long receipts (8 items / 22 cups / raster >24KB) jam mid-print, lose the tail (no paper cut), or print a solid black background.

### Root causes (grounded in current code)

1. **`build_order_labels_tspl_batched()` (`printlib.py:833`) is dead code.** Both print paths use the un-batched `build_order_labels_tspl` (`print_poller.py:143`, `print_server.py:537`). A 10-cup order becomes one giant TSPL stream sent as a single `lpr` job.
2. **CUPS `lpr -o raw` is fire-and-forget and one-way.** It hides the printer back-channel and churns the USB session per job (`open → write → close`). Rapid jobs contend for the USB device claim → first-job loss / dropped orders.
3. **Buffer overrun.** Cheap firmware has a small receive buffer. When CUPS/usblp pushes bytes faster than the firmware drains:
   - Label: a dropped `CLS` merges the next label into the previous buffer → duplicate/merged label; a dropped `PRINT` → missing label.
   - Receipt raster (`GS v 0`): a dropped byte desyncs the declared length `(xL,xH,yL,yH)` from actual data → firmware consumes following ASCII commands as raster data → **solid black / garbage + no cut** (the signature symptom).
4. **`_wait_cups_queue_empty` (`print_server.py:314`) waits on `lpstat -o` = CUPS queue empty**, which marks a job done when bytes are handed to the backend, NOT when paper physically ejects. Order N+1 fires while the printer is still physically printing order N → collision.
5. **No cold-start wake.** First-after-idle receipt has no lead-in delay after `ESC @`.

### Constraints

- No external DB. `outbox.db` (SQLite) is the local store. GAS = event bus, Sheets = database (per project CLAUDE.md).
- POS-58L and XP-365B are "dumb" printers — no HTTP, cannot poll a server (CloudPRNT-style pull is not possible).
- Prod system handling real money (receipts, cash drawer). Rollout must be reversible and de-riskable without hardware changes.
- **Must not lock into USB.** A future network printer (raw TCP 9100) must reuse the same reliability logic without a rewrite.

---

## 2. Goals / Non-goals

**Goals:**
- Every label and every receipt prints exactly once, or is durably retried, or fails loudly (Telegram alert). No silent drops, no duplicates, no missing cups.
- One reliability implementation shared by both the local (`/order`) and online (poller) workflows.
- Transport-agnostic: swapping USB → TCP/serial is adding one class, no change to render or spool logic.
- Capability-adaptive "maximum" reliability: use the printer status back-channel where the hardware supports it; degrade cleanly to pacing where it does not; never hang waiting on an unsupported handshake.
- Reversible rollout: new engine behind an env flag; testable over legacy CUPS transport before touching hardware.

**Non-goals:**
- Printer-polls-server (CloudPRNT) model — hardware can't do it.
- Rewriting the render layer (`printlib.py` stays; only its call sites change).
- Changing the GAS/Sheets schema or the KDS UI.

---

## 3. Architecture — three layers

Dependencies point one direction (render knows nothing about transport or spool):

```
Render     printlib.py (unchanged)                → produces bytes
              ▲
Spooler    print_spool.py + table `print_spool`   → source of truth for "printed yet?"
              1 worker thread per printer, sequential claim → render → send → confirm → mark
              ▲
Transport  transport.py  (new)                     → the ONLY place that changes per printer
              UsbTransport | TcpTransport | SerialTransport | CupsTransport(legacy)
```

Flask (`print_server.py`) remains the single process that owns the physical printers. The poller (`print_poller.py`) never touches the device — it already forwards over HTTP to Flask, so both the local `/order` path and the online poller path funnel into the same in-process spool. One worker per printer = one device owner = no cross-path collision.

### 3.1 Unit of work

**One spool job = one physical output:** one label (one cup) or one receipt. A 10-cup order enqueues 10 label jobs. This makes "missing cup" structurally impossible to lose silently and makes replay surgical (reprint only the specific cup that failed).

Cash-drawer kick is **not** a separate job. It rides on the receipt job: after the receipt confirms `printed` and only when the order is cash, the worker sends the drawer kick as a trailing raw pulse (keeps the existing `_kick_cash_drawer` behavior, gated on payment method).

---

## 4. Data model — new table `print_spool`

Added to `outbox.db` via `Gateway._SCHEMA` (or a dedicated `PrintSpool` schema string). Kept **separate** from `outbox` (which owns GAS-sync semantics: `ingest_order` / `status` / `mark_paid`). Do not overload `outbox`.

```sql
CREATE TABLE IF NOT EXISTS print_spool (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT UNIQUE NOT NULL,   -- 'ORD-20260723-0007:label:3' = order:kind:index
  order_id        TEXT NOT NULL,
  printer         TEXT NOT NULL,          -- 'label' | 'receipt'
  kind            TEXT NOT NULL,          -- 'label' | 'receipt'
  seq_in_order    INTEGER NOT NULL,       -- cup number for labels; 0 for receipt
  total_in_order  INTEGER NOT NULL,       -- total cups (for '[3/10]' rendering)
  payload_json    TEXT NOT NULL,          -- order + item slice to RE-RENDER (not raw bytes)
  status          TEXT NOT NULL DEFAULT 'pending',   -- pending|printing|printed|failed
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  gas_marked      INTEGER NOT NULL DEFAULT 0,  -- 1 once GAS mark_printed succeeded
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  claimed_at      TEXT,                    -- for orphan-recovery of stuck 'printing'
  last_error      TEXT
);
CREATE INDEX IF NOT EXISTS ix_spool_ready ON print_spool(printer, status, id);
```

**Design decisions:**
- **Store payload, not bytes.** Rendering is deterministic and cheap. Storing the order slice keeps the DB small and lets a render bug be fixed without stuck bytes clogging the queue.
- **`idempotency_key` UNIQUE** dedupes across the local mint path and the online poller path for the same order (see §7). This replaces the fragile `_printed_by_gateway_local` check in the poller.
- **`gas_marked`** separates "physically printed" from "GAS told". Worker marks GAS after confirm; if the GAS call fails, the job stays `printed` + `gas_marked=0` and a lightweight reconciler retries the GAS mark.

`payload_json` for a label job contains exactly what `build_label_tspl(order, item, cup_num, total_cups)` needs: the order metadata (short_code, delivery_type, table_id, timestamp, notes, customer) and the single item slice. For a receipt job it is the full order (what `build_receipt(order)` needs) plus the resolved payment method.

---

## 5. Transport layer (`transport.py`)

```python
class Transport(Protocol):
    def open(self) -> None: ...
    def send(self, data: bytes) -> int: ...              # blocking; chunks internally
    def read_status(self, timeout: float) -> bytes | None: ...  # None if no back-channel
    def capabilities(self) -> set[str]: ...              # {'dle_eot','tspl_status','flow_dtr'}
    def close(self) -> None: ...
```

| Impl | send | back-channel (`read_status`) | selected when |
|---|---|---|---|
| `UsbTransport` (pyusb) | EP OUT, 512B chunks + ~20ms delay | read EP IN | USB (today) |
| `TcpTransport` (socket) | `sendall` to `:9100` | `recv()` on same socket | network printer (future) |
| `SerialTransport` (pyserial) | `write` + drain | `read` + DTR/DSR | Bluetooth/serial |
| `CupsTransport` (legacy) | `lpr -o raw` (existing `_send_cups`) | `None` | safe fallback / logic testing |

Selected per printer via env: `LABEL_TRANSPORT` / `RECEIPT_TRANSPORT` ∈ `{usb,tcp,serial,cups}`. Existing per-printer env (`*_USB_VID/PID/EP`, `*_PRINTER_IP/PORT`, `*_SERIAL_PORT`) is reused. The persistent-USB-handle logic already in `print_server.py` (`_get_or_open_usb`, module-level handle cache to survive macOS IOKit reclaim) moves into `UsbTransport`.

### 5.1 Capability probe (once per printer at worker start)

This is the "option-3 adaptive maximum": attempt real status, degrade cleanly, never block.

- **Receipt / ESC/POS:** send `DLE EOT 1` (`10 04 01`, transmit printer status — processed in real time). Read 1 byte within 200ms.
  - byte received → capability `dle_eot`.
  - timeout → no back-channel; fall to pacing.
- **Label / TSPL:** attempt a status query (`<ESC>!?` and/or `~!@`). XP-365B clones usually don't answer → capability `tspl_status` absent → pacing.
- Result cached for the process lifetime. Probe timeout is bounded (200ms) so a mute clone never hangs the worker.

---

## 6. Confirm ladder (per job)

After `transport.send(data)`, confirm the physical print using the best available mechanism:

```
1. dle_eot / tspl_status present  → poll read_status until printer reports
                                     idle + paper-present (or bounded timeout). Real confirm.
2. flow_dtr present / TCP fully drained → blocking send + computed pacing delay.
3. CupsTransport (no back-channel) → pacing + _wait_cups_queue_empty (current behavior).
```

Pacing delay for label jobs derives from label size/speed (~0.5s/label baseline, already used). For receipts, from raster height. A confirm timeout counts as a failed attempt (job returns to `pending` with backoff), NOT a success — so a stuck printer never silently loses the job.

---

## 7. Worker loop (one thread per printer)

```
worker(printer):
  transport = build_transport(printer); transport.open()
  caps = probe(transport)
  loop forever:
    recover_orphans(printer)                    # 'printing' with claimed_at older than 30s → 'pending'
    job = claim_next(printer)                    # atomic: UPDATE ... SET status='printing',
                                                 #   claimed_at=now WHERE id=(SELECT ... status='pending'
                                                 #   ORDER BY id LIMIT 1) RETURNING *
    if not job: sleep(idle_backoff); continue    # idle_backoff grows 0.2s→2s while empty
    try:
       data = render(job)                        # printlib, from payload_json
       if printer_cold(printer):                 # idle > COLD_SECONDS since last send
          transport.send(ESC_INIT); sleep(0.3)   # wake — fixes garbled first order
       transport.send(data)
       confirm(job, transport, caps)             # §6 ladder; raises on timeout
       mark_printed(job)
       if job.kind == 'receipt' and job.is_cash: transport.send(DRAWER_KICK)
       gas_mark(job)                             # §8; on failure leave gas_marked=0
    except Exception as e:
       job.attempts += 1
       if job.attempts >= job.max_attempts:
          mark_failed(job, e); telegram_alert(job, e)
       else:
          requeue(job, e)                        # → 'pending', backoff before next claim
```

- **Single worker per printer** ⇒ strictly sequential ⇒ gap sensor never overrun, no USB session collision.
- **Orphan recovery** makes crash/power-loss safe: a job stuck in `printing` (worker died mid-send) is reclaimed after 30s and reprinted. Worst case is one duplicate of the exact in-flight label on a hard crash — acceptable and far better than the current silent multi-drop.
- **`claim_next` is atomic** via SQLite `UPDATE ... RETURNING` under the gateway lock, so even if two workers ever ran, no job is claimed twice.

---

## 8. Integration — local + online unified

Both paths become **enqueue-only**; the worker does all printing.

- **Local `/order` (`print_server.py:505`):** replace the `_async_print_labels` thread with `spool.enqueue_labels(order, cups)` — one row per cup, `idempotency_key = f"{order_id}:label:{i}"`. Returns immediately (order already durably in `outbox` from `mint_order`).
- **`/order/mark_paid`:** replace the direct `_print_receipt_bytes` call with `spool.enqueue_receipt(order)` — `idempotency_key = f"{order_id}:receipt:0"`, carrying the resolved payment method (for the cash-drawer gate).
- **Online poller:** add server endpoints `POST /enqueue/labels` and `POST /enqueue/receipt` that accept **order JSON** (not pre-rendered bytes) and enqueue the same way. The poller switches its two POSTs to these endpoints and sends the order JSON. This keeps a single render path inside the server and lets the server split labels per cup.
  - The old `/print/label` and `/print/receipt` byte endpoints are kept temporarily for back-compat behind the legacy flag, removed after cutover.
- **Cross-path dedup:** when an order is both minted locally and later seen by the poller, both compute identical `idempotency_key`s → `UNIQUE` insert-or-ignore means the second enqueue is a no-op. Replaces `_printed_by_gateway_local`.

### 8.1 GAS mark_printed — decision (a): worker-mark-on-confirm

The worker (not the poller) calls GAS `mark_labels_printed` / `mark_printed` **after** the job confirms `printed`, then sets `gas_marked=1`. Consequences:
- GAS/Sheets reflects physical truth: a `failed` job is never marked printed.
- Marking is per-order, not per-cup: the worker marks the order's GAS label state once the **last** cup of that order reaches `printed` (track remaining count, or check "no more pending/printing rows for this order_id+kind").
- If the GAS call fails (offline), the job stays `printed` + `gas_marked=0`; a reconciler pass retries the GAS mark. This reuses the existing offline-tolerant posture.
- The poller no longer marks GAS on enqueue — it only feeds the spool.

---

## 9. Rollout — reversible, hardware-last

1. Build `transport.py` + `print_spool.py` + endpoints behind env `PRINT_ENGINE ∈ {legacy, spool}`, default `legacy`. Legacy path (current synchronous `_send`) untouched and reachable.
2. Flip `PRINT_ENGINE=spool` with `*_TRANSPORT=cups` first: exercise the spool state machine, worker, orphan recovery, dedup, and replay **over the existing CUPS transport** — no hardware/wiring change, pure logic de-risk.
3. Once logic is proven, flip `*_TRANSPORT=usb` (needs real VID:PID from `system_profiler SPUSBDataType`; `LABEL_USB_VID/PID` are currently `0`) to gain the back-channel.
4. `TcpTransport` is written to interface parity but validated later when a network printer exists.

Rollback at any step = set `PRINT_ENGINE=legacy` and restart the launchd `printserver` agent.

---

## 10. Testing

- **Unit (no hardware):**
  - Spool state machine: claim → confirm → `printed`; failure → requeue with backoff; `attempts>=max` → `failed`.
  - Idempotency: duplicate enqueue of same key is a no-op.
  - `render(job)` from `payload_json` reproduces byte-for-byte what the current builders produce (regression pin).
  - Orphan recovery: a stale `printing` row is reclaimed.
- **`FakeTransport`:** records `send()` calls, scripts `read_status` replies, and can simulate a drop after N labels. Assert the worker replays and prints **only** the missing cups, never a duplicate of a confirmed one.
- **Hardware (real printers, after §9.3):**
  1. Stress: 5 back-to-back `/order` — all 5 print, correct counts.
  2. 10-cup order — exactly 10 labels, correct `[n/10]`, no dup.
  3. 50-item receipt — full header + logo + tail + paper cut, no black background.
  4. Cold start — first order after idle prints clean.
  5. Pull USB / kill process mid-print → restart → verify replay prints only the unprinted remainder.

---

## 11. Observability

- `failed` job → Telegram alert via existing Notify path (order_id, kind, cup, last_error).
- `GET /health` gains `spool: {pending, printing, failed}` per printer.
- Worker logs one line per job: `[SPOOL] order:kind:cup status=printed attempts=n via=usb confirm=dle_eot`.

---

## 12. File map

| File | Change |
|---|---|
| `print-server/transport.py` | **new** — Transport protocol + Usb/Tcp/Serial/Cups impls, capability probe |
| `print-server/print_spool.py` | **new** — schema, enqueue_labels/enqueue_receipt, claim_next, mark_*, worker loop, reconciler |
| `print-server/printlib.py` | remove dead `build_order_labels_tspl_batched`; expose a single-unit render helper used by the worker; keep builders |
| `print-server/print_server.py` | `/order` + `/mark_paid` enqueue; add `/enqueue/labels` `/enqueue/receipt`; start worker threads; `PRINT_ENGINE` flag; `/health` spool stats; USB handle logic → transport.py |
| `print-server/print_poller.py` | POST order JSON to `/enqueue/*`; drop local-dedup + GAS-mark-on-enqueue |
| `print-server/gateway.py` | (optional) share the sqlite connection/lock with the spool, or spool opens its own |
| tests | `test_print_spool.py`, `FakeTransport`, render-regression pin |

---

## 13. Open risks

- **Orphan window duplicate:** a hard crash exactly mid-send can reprint the one in-flight label. Accepted (single dup ≫ silent multi-drop). The 30s orphan timeout is tunable.
- **XP-365B mute back-channel:** if the clone answers nothing, label reliability rests on pacing (ladder step 2/3) — still strictly better than today because of batching-into-jobs + single sequential worker + durable replay.
- **USB VID:PID unknown:** step §9.3 blocked until captured on the Mac Mini. CUPS transport (§9.2) does not need it, so logic work is unblocked.
