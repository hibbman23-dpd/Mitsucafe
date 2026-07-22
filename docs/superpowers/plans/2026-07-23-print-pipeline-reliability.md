# Print Pipeline Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make label + receipt printing exactly-once/durably-retried across the local and online workflows by inserting a transport-agnostic durable spool between order intake and the printer.

**Architecture:** Three layers — render (`printlib.py`, unchanged output), a durable per-output spool (`print_spool.py` + `print_worker.py`, one sequential worker thread per printer), and a swappable transport (`transport.py`: Cups/Usb/Tcp/Serial). Both `/order` (local) and the poller (online) become enqueue-only; a single worker per printer drains the spool, sends via the transport, confirms via the printer back-channel where available, and only then marks GAS.

**Tech Stack:** Python 3.13, Flask, sqlite3 (stdlib), pyusb, pyserial, PIL. Tests: `unittest` (stdlib), files `print-server/test_*.py`, run with `python3 -m unittest <module>` from `print-server/`.

## Global Constraints

- No external DB. State lives in `outbox.db` (SQLite). New table `print_spool`, kept separate from `outbox`. — verbatim from spec §1/§4.
- Do not change the GAS/Sheets schema or the KDS UI. — spec §2.
- New engine is reversible: everything behind env `PRINT_ENGINE ∈ {legacy, spool}`, default `legacy`. Rollback = set `legacy` + restart launchd `printserver`. — spec §9.
- `CupsTransport` is the always-available default; direct transports fall back to it on open failure. — spec §5.1/§9.
- Honor commit `ef7bca3`: never resend `SIZE/GAP/DENSITY/SPEED/DIRECTION` per label. Send once per worker session; per-label emits `CLS … PRINT` only (`build_label_tspl(..., include_header=False)`). — spec §6.1.
- Preserve receipt raster chunking `CHUNK_H = 96` + `\n` after each `GS v 0` band. — spec §3.1.
- One spool job = one physical output (one cup, or one receipt). `idempotency_key = f"{order_id}:{kind}:{seq}"`, UNIQUE. — spec §3.1/§4.
- Cash-drawer kick is embedded in the receipt bytes **before the cut**, gated by `is_cash`; no separate kick job. — spec §3.1.
- Tests use `unittest`, mirror `test_gateway.py` style (tempfile db, `setUp`/`tearDown`). Modules import directly (`from print_spool import PrintSpool`). Worker runs from `print-server/` as cwd.

---

### Task 1: `print_spool` schema + enqueue with dedup

**Files:**
- Create: `print-server/print_spool.py`
- Test: `print-server/test_print_spool.py`

**Interfaces:**
- Consumes: a `sqlite3.Connection` (opened `check_same_thread=False`) and a `threading.Lock`, both owned by the caller (Task 9 passes the Gateway's connection + lock).
- Produces:
  - `PrintSpool(conn: sqlite3.Connection, lock: threading.Lock)` — constructor also creates the table.
  - `PrintSpool.enqueue_labels(order: dict, cups: list) -> int` — inserts one row per cup, returns count actually inserted (0 if all duplicates).
  - `PrintSpool.enqueue_receipt(order: dict, is_cash: bool) -> int` — inserts one receipt row, returns 1 or 0.
  - Row dict keys: `id, idempotency_key, order_id, printer, kind, seq_in_order, total_in_order, payload_json, status, attempts, max_attempts, gas_marked, created_at, updated_at, claimed_at, last_error`.
  - `kind ∈ {'label','receipt'}`, `printer` equals `kind` for now (`'label'`→XP-365B, `'receipt'`→POS-58L).
  - Label `payload_json` = `json.dumps({"order": <order minus items>, "item": <single cup item>, "is_cash": false})`. Receipt `payload_json` = `json.dumps({"order": <full order>, "is_cash": <bool>})`.

- [ ] **Step 1: Write the failing test**

```python
# print-server/test_print_spool.py
import os, json, sqlite3, tempfile, threading, unittest
from print_spool import PrintSpool

def _order(oid="ORD-20260723-0001", stype="dine_in"):
    return {"order_id": oid, "timestamp": "2026-07-23T08:00:00+07:00",
            "table_id": "03", "customer_name": "", "customer_id": "",
            "metadata": {"short_code": "Q01", "delivery_type": stype, "notes": ""},
            "items": [{"name": "Bac xiu", "qty": 2, "price": 30000, "modifiers": {}}]}

class SpoolBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mktemp(suffix=".db")
        self.conn = sqlite3.connect(self.tmp, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.spool = PrintSpool(self.conn, threading.Lock())
    def tearDown(self):
        self.conn.close()
        if os.path.exists(self.tmp): os.remove(self.tmp)

class TestEnqueue(SpoolBase):
    def test_enqueue_labels_one_row_per_cup(self):
        cups = [{"name": "Bac xiu", "qty": 1, "modifiers": {}},
                {"name": "Bac xiu", "qty": 1, "modifiers": {}}]
        n = self.spool.enqueue_labels(_order(), cups)
        self.assertEqual(n, 2)
        rows = self.conn.execute("SELECT idempotency_key, seq_in_order, total_in_order, printer, kind, status "
                                 "FROM print_spool ORDER BY seq_in_order").fetchall()
        self.assertEqual([r["idempotency_key"] for r in rows],
                         ["ORD-20260723-0001:label:1", "ORD-20260723-0001:label:2"])
        self.assertEqual(rows[0]["total_in_order"], 2)
        self.assertEqual(rows[0]["printer"], "label")
        self.assertEqual(rows[0]["status"], "pending")

    def test_enqueue_labels_dedup_is_noop(self):
        cups = [{"name": "Bac xiu", "qty": 1, "modifiers": {}}]
        self.assertEqual(self.spool.enqueue_labels(_order(), cups), 1)
        self.assertEqual(self.spool.enqueue_labels(_order(), cups), 0)  # same keys → ignored
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM print_spool").fetchone()[0], 1)

    def test_enqueue_receipt_carries_is_cash(self):
        self.assertEqual(self.spool.enqueue_receipt(_order(), is_cash=True), 1)
        row = self.conn.execute("SELECT idempotency_key, printer, kind, payload_json FROM print_spool").fetchone()
        self.assertEqual(row["idempotency_key"], "ORD-20260723-0001:receipt:0")
        self.assertEqual(row["printer"], "receipt")
        self.assertTrue(json.loads(row["payload_json"])["is_cash"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m unittest test_print_spool -v`
Expected: FAIL / ERROR — `ModuleNotFoundError: No module named 'print_spool'`.

- [ ] **Step 3: Write minimal implementation**

```python
# print-server/print_spool.py
"""print_spool.py — durable per-output print queue (one job = one label or one receipt)."""
import json
from datetime import datetime, timedelta, timezone

_VN = timezone(timedelta(hours=7))

def _now_iso():
    return datetime.now(_VN).isoformat()

_SCHEMA = """
CREATE TABLE IF NOT EXISTS print_spool (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT UNIQUE NOT NULL,
  order_id        TEXT NOT NULL,
  printer         TEXT NOT NULL,
  kind            TEXT NOT NULL,
  seq_in_order    INTEGER NOT NULL,
  total_in_order  INTEGER NOT NULL,
  payload_json    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  gas_marked      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  claimed_at      TEXT,
  last_error      TEXT
);
CREATE INDEX IF NOT EXISTS ix_spool_ready ON print_spool(printer, status, id);
"""

class PrintSpool:
    def __init__(self, conn, lock):
        self._conn = conn
        self._lock = lock
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    def _insert(self, key, order_id, printer, kind, seq, total, payload):
        now = _now_iso()
        cur = self._conn.execute(
            "INSERT OR IGNORE INTO print_spool"
            "(idempotency_key,order_id,printer,kind,seq_in_order,total_in_order,payload_json,"
            " status,created_at,updated_at) VALUES(?,?,?,?,?,?,?, 'pending',?,?)",
            (key, order_id, printer, kind, seq, total, json.dumps(payload), now, now))
        return cur.rowcount

    def enqueue_labels(self, order, cups):
        order_id = order.get("order_id", "")
        total = len(cups)
        order_meta = {k: v for k, v in order.items() if k != "items"}
        inserted = 0
        with self._lock:
            for i, item in enumerate(cups, start=1):
                key = f"{order_id}:label:{i}"
                payload = {"order": order_meta, "item": item, "is_cash": False}
                inserted += self._insert(key, order_id, "label", "label", i, total, payload)
            self._conn.commit()
        return inserted

    def enqueue_receipt(self, order, is_cash):
        order_id = order.get("order_id", "")
        with self._lock:
            key = f"{order_id}:receipt:0"
            payload = {"order": order, "is_cash": bool(is_cash)}
            n = self._insert(key, order_id, "receipt", "receipt", 0, 1, payload)
            self._conn.commit()
        return n
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m unittest test_print_spool -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add print-server/print_spool.py print-server/test_print_spool.py
git commit -m "feat(print): print_spool schema + per-output enqueue with idempotency dedup"
```

---

### Task 2: Spool state machine — claim, mark, requeue, orphan recovery, stats

**Files:**
- Modify: `print-server/print_spool.py`
- Test: `print-server/test_print_spool.py` (add a class)

**Interfaces:**
- Consumes: `PrintSpool` from Task 1.
- Produces:
  - `claim_next(printer: str) -> dict | None` — atomically moves the oldest `pending` row for `printer` to `printing` (sets `claimed_at`), returns it as a dict, or `None` if none.
  - `mark_printed(job_id: int) -> None` — status→`printed`.
  - `mark_failed(job_id: int, err: str) -> None` — status→`failed`, records `last_error`.
  - `requeue(job_id: int, err: str) -> None` — increments `attempts`; if `attempts >= max_attempts` → `failed` (with err), else → `pending` (clears `claimed_at`, records err). Returns nothing; caller reads status if needed.
  - `recover_orphans(printer: str, older_than_s: float = 30) -> int` — any `printing` row for `printer` with `claimed_at` older than `older_than_s` goes back to `pending`; returns count recovered.
  - `stats(printer: str) -> dict` — `{"pending": int, "printing": int, "failed": int}`.

- [ ] **Step 1: Write the failing test**

```python
# append to print-server/test_print_spool.py
import time

class TestStateMachine(SpoolBase):
    def _one_label(self):
        self.spool.enqueue_labels(_order(), [{"name": "X", "qty": 1, "modifiers": {}}])

    def test_claim_moves_pending_to_printing_and_returns_none_when_empty(self):
        self._one_label()
        job = self.spool.claim_next("label")
        self.assertEqual(job["status"], "printing")
        self.assertIsNotNone(job["claimed_at"])
        self.assertIsNone(self.spool.claim_next("label"))  # nothing left pending

    def test_mark_printed(self):
        self._one_label()
        job = self.spool.claim_next("label")
        self.spool.mark_printed(job["id"])
        row = self.conn.execute("SELECT status FROM print_spool WHERE id=?", (job["id"],)).fetchone()
        self.assertEqual(row["status"], "printed")

    def test_requeue_then_fail_after_max(self):
        self._one_label()
        job = self.spool.claim_next("label")
        jid = job["id"]
        self.conn.execute("UPDATE print_spool SET max_attempts=2 WHERE id=?", (jid,)); self.conn.commit()
        self.spool.requeue(jid, "boom")   # attempts 1 -> pending
        self.assertEqual(self.conn.execute("SELECT status,attempts FROM print_spool WHERE id=?", (jid,)).fetchone()["status"], "pending")
        job = self.spool.claim_next("label")
        self.spool.requeue(jid, "boom2")  # attempts 2 >= max -> failed
        row = self.conn.execute("SELECT status,attempts,last_error FROM print_spool WHERE id=?", (jid,)).fetchone()
        self.assertEqual(row["status"], "failed")
        self.assertEqual(row["attempts"], 2)
        self.assertIn("boom2", row["last_error"])

    def test_recover_orphans(self):
        self._one_label()
        job = self.spool.claim_next("label")
        # backdate claimed_at to simulate a crashed worker
        self.conn.execute("UPDATE print_spool SET claimed_at=? WHERE id=?",
                          ("2000-01-01T00:00:00+07:00", job["id"])); self.conn.commit()
        recovered = self.spool.recover_orphans("label", older_than_s=30)
        self.assertEqual(recovered, 1)
        self.assertEqual(self.conn.execute("SELECT status FROM print_spool WHERE id=?", (job["id"],)).fetchone()["status"], "pending")

    def test_stats(self):
        self.spool.enqueue_labels(_order(), [{"name":"X","qty":1,"modifiers":{}},
                                             {"name":"Y","qty":1,"modifiers":{}}])
        self.spool.claim_next("label")
        s = self.spool.stats("label")
        self.assertEqual(s, {"pending": 1, "printing": 1, "failed": 0})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m unittest test_print_spool.TestStateMachine -v`
Expected: FAIL — `AttributeError: 'PrintSpool' object has no attribute 'claim_next'`.

- [ ] **Step 3: Write minimal implementation**

```python
# add to print-server/print_spool.py, inside class PrintSpool

    def claim_next(self, printer):
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM print_spool WHERE printer=? AND status='pending' "
                "ORDER BY id LIMIT 1", (printer,)).fetchone()
            if not row:
                return None
            now = _now_iso()
            self._conn.execute(
                "UPDATE print_spool SET status='printing', claimed_at=?, updated_at=? WHERE id=?",
                (now, now, row["id"]))
            self._conn.commit()
            return dict(self._conn.execute("SELECT * FROM print_spool WHERE id=?", (row["id"],)).fetchone())

    def mark_printed(self, job_id):
        with self._lock:
            self._conn.execute("UPDATE print_spool SET status='printed', updated_at=? WHERE id=?",
                               (_now_iso(), job_id))
            self._conn.commit()

    def mark_failed(self, job_id, err):
        with self._lock:
            self._conn.execute("UPDATE print_spool SET status='failed', last_error=?, updated_at=? WHERE id=?",
                               (str(err)[:400], _now_iso(), job_id))
            self._conn.commit()

    def requeue(self, job_id, err):
        with self._lock:
            row = self._conn.execute("SELECT attempts, max_attempts FROM print_spool WHERE id=?",
                                     (job_id,)).fetchone()
            attempts = (row["attempts"] or 0) + 1
            now = _now_iso()
            if attempts >= (row["max_attempts"] or 5):
                self._conn.execute(
                    "UPDATE print_spool SET status='failed', attempts=?, last_error=?, updated_at=? WHERE id=?",
                    (attempts, str(err)[:400], now, job_id))
            else:
                self._conn.execute(
                    "UPDATE print_spool SET status='pending', attempts=?, last_error=?, claimed_at=NULL, updated_at=? WHERE id=?",
                    (attempts, str(err)[:400], now, job_id))
            self._conn.commit()

    def recover_orphans(self, printer, older_than_s=30):
        cutoff = (datetime.now(_VN) - timedelta(seconds=older_than_s)).isoformat()
        with self._lock:
            cur = self._conn.execute(
                "UPDATE print_spool SET status='pending', claimed_at=NULL, updated_at=? "
                "WHERE printer=? AND status='printing' AND claimed_at IS NOT NULL AND claimed_at < ?",
                (_now_iso(), printer, cutoff))
            self._conn.commit()
            return cur.rowcount

    def stats(self, printer):
        rows = self._conn.execute(
            "SELECT status, COUNT(*) c FROM print_spool WHERE printer=? "
            "AND status IN ('pending','printing','failed') GROUP BY status", (printer,)).fetchall()
        out = {"pending": 0, "printing": 0, "failed": 0}
        for r in rows:
            out[r["status"]] = r["c"]
        return out
```

> Note: `claimed_at` is stored as an ISO-8601 string in the same `+07:00` zone throughout, so lexical `<` comparison against `cutoff` is a valid time comparison (fixed offset, zero-padded fields).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m unittest test_print_spool -v`
Expected: PASS (all classes).

- [ ] **Step 5: Commit**

```bash
git add print-server/print_spool.py print-server/test_print_spool.py
git commit -m "feat(print): spool state machine — claim/mark/requeue/orphan-recovery/stats"
```

---

### Task 3: GAS-mark bookkeeping (per-order, after last cup)

**Files:**
- Modify: `print-server/print_spool.py`
- Test: `print-server/test_print_spool.py` (add a class)

**Interfaces:**
- Consumes: `PrintSpool`.
- Produces:
  - `order_kind_all_printed(order_id: str, kind: str) -> bool` — True when there are rows for `(order_id, kind)` and **none** are still `pending`/`printing` and **at least one** is `printed`.
  - `set_gas_marked(order_id: str, kind: str) -> None` — sets `gas_marked=1` for all `printed` rows of `(order_id, kind)`.
  - `pending_gas_marks() -> list[dict]` — distinct `{"order_id","kind"}` where some row is `printed` and `gas_marked=0` and `order_kind_all_printed` is True (i.e. ready to tell GAS but not yet told).

- [ ] **Step 1: Write the failing test**

```python
# append to print-server/test_print_spool.py
class TestGasMark(SpoolBase):
    def _print_all(self, cups_n):
        cups = [{"name": "X", "qty": 1, "modifiers": {}} for _ in range(cups_n)]
        self.spool.enqueue_labels(_order(), cups)
        for _ in range(cups_n):
            job = self.spool.claim_next("label")
            self.spool.mark_printed(job["id"])

    def test_all_printed_true_only_when_no_pending_or_printing(self):
        cups = [{"name": "X", "qty": 1, "modifiers": {}} for _ in range(2)]
        self.spool.enqueue_labels(_order(), cups)
        j1 = self.spool.claim_next("label"); self.spool.mark_printed(j1["id"])
        self.assertFalse(self.spool.order_kind_all_printed("ORD-20260723-0001", "label"))  # 1 still pending
        j2 = self.spool.claim_next("label"); self.spool.mark_printed(j2["id"])
        self.assertTrue(self.spool.order_kind_all_printed("ORD-20260723-0001", "label"))

    def test_pending_gas_marks_then_set(self):
        self._print_all(2)
        pend = self.spool.pending_gas_marks()
        self.assertEqual(pend, [{"order_id": "ORD-20260723-0001", "kind": "label"}])
        self.spool.set_gas_marked("ORD-20260723-0001", "label")
        self.assertEqual(self.spool.pending_gas_marks(), [])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m unittest test_print_spool.TestGasMark -v`
Expected: FAIL — `AttributeError: ... 'order_kind_all_printed'`.

- [ ] **Step 3: Write minimal implementation**

```python
# add to print-server/print_spool.py, inside class PrintSpool

    def order_kind_all_printed(self, order_id, kind):
        rows = self._conn.execute(
            "SELECT status, COUNT(*) c FROM print_spool WHERE order_id=? AND kind=? GROUP BY status",
            (order_id, kind)).fetchall()
        by = {r["status"]: r["c"] for r in rows}
        if not by:
            return False
        if by.get("pending", 0) or by.get("printing", 0):
            return False
        return by.get("printed", 0) > 0

    def set_gas_marked(self, order_id, kind):
        with self._lock:
            self._conn.execute(
                "UPDATE print_spool SET gas_marked=1, updated_at=? "
                "WHERE order_id=? AND kind=? AND status='printed'",
                (_now_iso(), order_id, kind))
            self._conn.commit()

    def pending_gas_marks(self):
        rows = self._conn.execute(
            "SELECT DISTINCT order_id, kind FROM print_spool "
            "WHERE status='printed' AND gas_marked=0 ORDER BY order_id, kind").fetchall()
        out = []
        for r in rows:
            if self.order_kind_all_printed(r["order_id"], r["kind"]):
                out.append({"order_id": r["order_id"], "kind": r["kind"]})
        return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m unittest test_print_spool -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add print-server/print_spool.py print-server/test_print_spool.py
git commit -m "feat(print): per-order GAS-mark bookkeeping (mark only after last cup printed)"
```

---

### Task 4: `printlib` — gate drawer kick on `is_cash`, drop dead code, add label preamble

**Files:**
- Modify: `print-server/printlib.py`
- Test: `print-server/test_printlib_drawer.py` (new)

**Interfaces:**
- Consumes: existing `build_receipt`, `build_receipt_raster`, `build_receipt_text`, `build_label_tspl`.
- Produces:
  - `build_receipt(order: dict, is_cash: bool = False) -> bytes` — new second arg, default `False`, forwarded to both raster and text builders.
  - `build_receipt_raster(order, is_cash=False)` / `build_receipt_text(order, is_cash=False)` — emit the `ESC p` drawer-kick bytes **only when `is_cash` is True**; the cut command (`GS V B 0`) placement is unchanged (kick already precedes it).
  - `label_setup_preamble() -> bytes` — returns `b"\r\n\r\nSIZE 50 mm,30 mm\r\nGAP 3 mm,0\r\nSPEED 4\r\nDENSITY 8\r\nDIRECTION 0\r\n"`.
  - `build_order_labels_tspl_batched` is **deleted** (dead code, spec §1).

- [ ] **Step 1: Write the failing test**

```python
# print-server/test_printlib_drawer.py
import unittest
import printlib

ESC_KICK_1 = b"\x1b\x70\x00\x19\xfa"   # ESC p 0 25 250
ESC_KICK_2 = b"\x1b\x70\x01\x19\xfa"   # ESC p 1 25 250

def _order(method="cash"):
    return {"order_id": "ORD-20260723-0009", "timestamp": "2026-07-23T08:00:00+07:00",
            "table_id": "03", "metadata": {"short_code": "Q09", "delivery_type": "dine_in", "notes": ""},
            "items": [{"name": "Bac xiu", "qty": 1, "price": 30000, "modifiers": {}}],
            "total": 30000, "payment": {"method": method}}

class TestDrawerGate(unittest.TestCase):
    def test_cash_receipt_has_exactly_one_kick_before_cut(self):
        data = printlib.build_receipt(_order(), is_cash=True)
        cut = data.index(b"\x1dV\x42\x00")            # GS V B 0
        self.assertEqual(data.count(ESC_KICK_1), 1)
        self.assertLess(data.index(ESC_KICK_1), cut)  # kick precedes cut

    def test_non_cash_receipt_has_no_kick(self):
        data = printlib.build_receipt(_order(method="vietqr"), is_cash=False)
        self.assertEqual(data.count(ESC_KICK_1), 0)
        self.assertEqual(data.count(ESC_KICK_2), 0)

    def test_label_setup_preamble_bytes(self):
        self.assertEqual(printlib.label_setup_preamble(),
                         b"\r\n\r\nSIZE 50 mm,30 mm\r\nGAP 3 mm,0\r\nSPEED 4\r\nDENSITY 8\r\nDIRECTION 0\r\n")

    def test_batched_helper_removed(self):
        self.assertFalse(hasattr(printlib, "build_order_labels_tspl_batched"))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m unittest test_printlib_drawer -v`
Expected: FAIL — cash test fails (kick currently unconditional so count may be 1 but non-cash test fails: kick present when it should be absent), `label_setup_preamble` missing, batched helper still present.

- [ ] **Step 3: Write minimal implementation**

In `printlib.py`, change the raster builder signature and gate its kick. Replace the `build_receipt_raster` header block that builds `DRAWER_KICK` (currently `printlib.py:409-415` + its use at `parts = [DRAWER_KICK]`):

```python
def build_receipt_raster(order: dict, is_cash: bool = False) -> bytes:
    # ... unchanged body until the ESC/GS section ...
    ESC = b"\x1b"
    GS  = b"\x1d"

    INIT = (
        ESC + b"@"                 # Initialize
        + ESC + b"2"               # Default line spacing
        + ESC + b"t\x00"           # Code table PC437
    )
    KICK = (ESC + b"p\x00\x19\xfa" + ESC + b"p\x01\x19\xfa\n") if is_cash else b""
    header = INIT + KICK

    CHUNK_H = 96
    bytes_per_row = (W + 7) // 8
    xL = bytes_per_row & 0xFF
    xH = (bytes_per_row >> 8) & 0xFF

    parts = [header]
    for y_offset in range(0, height, CHUNK_H):
        chunk_h = min(CHUNK_H, height - y_offset)
        slice_img = img.crop((0, y_offset, W, y_offset + chunk_h))
        slice_bytes = _img_to_raster_bytes(slice_img)
        yL = chunk_h & 0xFF
        yH = (chunk_h >> 8) & 0xFF
        parts.append(GS + b"v0\x00" + bytes([xL, xH, yL, yH]) + slice_bytes + b"\n")
    parts.append(b"\n\n\n\n" + GS + b"V\x42\x00")
    return b"".join(parts)
```

In `build_receipt_text`, add `is_cash: bool = False` and gate its two kick lines (`printlib.py:543-544`, the `ESC + b"p..."` appends) behind `if is_cash:`.

Update `build_receipt`:

```python
def build_receipt(order: dict, is_cash: bool = False) -> bytes:
    fmt = os.getenv("RECEIPT_FORMAT", os.getenv("RECEIPT_MODE", "raster"))
    if fmt != "text":
        try:
            return build_receipt_raster(order, is_cash)
        except Exception as exc:
            log.warning("Raster build failed (%s), fallback to text mode", exc)
    return build_receipt_text(order, is_cash)
```

Add the preamble helper near `build_order_labels_tspl` and delete `build_order_labels_tspl_batched` entirely:

```python
def label_setup_preamble() -> bytes:
    return b"\r\n\r\nSIZE 50 mm,30 mm\r\nGAP 3 mm,0\r\nSPEED 4\r\nDENSITY 8\r\nDIRECTION 0\r\n"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m unittest test_printlib_drawer test_printlib -v`
Expected: PASS (new drawer tests + existing `test_printlib` still green).

- [ ] **Step 5: Commit**

```bash
git add print-server/printlib.py print-server/test_printlib_drawer.py
git commit -m "fix(print): gate receipt drawer-kick on is_cash, add label preamble, drop dead batched helper"
```

---

### Task 5: Transport base + `CupsTransport` + `FakeTransport`

**Files:**
- Create: `print-server/transport.py`
- Test: `print-server/test_transport.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `class Transport` with methods `open()`, `send(data: bytes) -> int`, `read_status(timeout: float) -> bytes | None` (default `None`), `capabilities() -> set[str]` (default `set()`), `close()`.
  - `class CupsTransport(Transport)` — `__init__(self, printer_name: str)`. `send` shells `lpr -P <printer> -o raw` (moved from `print_server._send_cups`'s inner call, minus the queue-wait — the worker owns pacing). `read_status` returns `None`.
  - `class FakeTransport(Transport)` — `__init__(self, status_replies=None, drop_after=None)`. Records every `send` in `self.sent: list[bytes]`. `send` raises `RuntimeError("simulated drop")` once `len(self.sent) > drop_after` (when `drop_after` is set). `read_status` pops from `status_replies` list (or returns `None`). `capabilities` returns `self._caps` (settable).

- [ ] **Step 1: Write the failing test**

```python
# print-server/test_transport.py
import unittest
from transport import Transport, FakeTransport

class TestFakeTransport(unittest.TestCase):
    def test_records_sends(self):
        t = FakeTransport()
        t.open()
        self.assertEqual(t.send(b"AAA"), 3)
        self.assertEqual(t.send(b"BB"), 2)
        self.assertEqual(t.sent, [b"AAA", b"BB"])
        t.close()

    def test_drop_after(self):
        t = FakeTransport(drop_after=1)
        t.send(b"one")                          # ok (1st)
        with self.assertRaises(RuntimeError):
            t.send(b"two")                      # 2nd exceeds drop_after=1

    def test_read_status_scripted(self):
        t = FakeTransport(status_replies=[b"\x00", None])
        self.assertEqual(t.read_status(0.2), b"\x00")
        self.assertIsNone(t.read_status(0.2))

    def test_base_defaults(self):
        t = Transport()
        self.assertIsNone(t.read_status(0.1))
        self.assertEqual(t.capabilities(), set())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m unittest test_transport -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'transport'`.

- [ ] **Step 3: Write minimal implementation**

```python
# print-server/transport.py
"""transport.py — printer transport abstraction (send + optional status back-channel)."""
import subprocess

class Transport:
    def open(self): ...
    def send(self, data: bytes) -> int:
        raise NotImplementedError
    def read_status(self, timeout: float):
        return None
    def capabilities(self):
        return set()
    def close(self): ...

class CupsTransport(Transport):
    def __init__(self, printer_name: str):
        self.printer_name = printer_name
    def send(self, data: bytes) -> int:
        subprocess.run(["lpr", "-P", self.printer_name, "-o", "raw"],
                       input=data, capture_output=True, check=True, timeout=20)
        return len(data)

class FakeTransport(Transport):
    def __init__(self, status_replies=None, drop_after=None):
        self.sent = []
        self._status = list(status_replies or [])
        self._drop_after = drop_after
        self._caps = set()
        self.opened = False
        self.closed = False
    def open(self):
        self.opened = True
    def send(self, data: bytes) -> int:
        if self._drop_after is not None and len(self.sent) >= self._drop_after:
            raise RuntimeError("simulated drop")
        self.sent.append(bytes(data))
        return len(data)
    def read_status(self, timeout: float):
        return self._status.pop(0) if self._status else None
    def capabilities(self):
        return set(self._caps)
    def close(self):
        self.closed = True
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m unittest test_transport -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add print-server/transport.py print-server/test_transport.py
git commit -m "feat(print): Transport base + CupsTransport + FakeTransport"
```

---

### Task 6: Capability probe + confirm ladder

**Files:**
- Modify: `print-server/transport.py`
- Test: `print-server/test_transport.py` (add a class)

**Interfaces:**
- Consumes: `Transport`, `FakeTransport`.
- Produces:
  - `probe_capabilities(transport: Transport, printer_kind: str) -> set[str]` — for `receipt`: `send(b"\x10\x04\x01")` (DLE EOT 1) then `read_status(0.2)`; if bytes returned, include `'dle_eot'`. For `label`: `send(b"\r\n\r\n")` then attempt a status read; include `'tspl_status'` only if a reply comes back. Never raises on a mute printer (a `None` reply just omits the capability); if `send`/`read_status` raise, return `set()`.
  - `confirm(transport: Transport, caps: set[str], printer_kind: str, pacing_s: float) -> bool` — if `'dle_eot'` or `'tspl_status'` in caps: poll `read_status(0.2)` up to `max(pacing_s, 2.0)` seconds; return True as soon as a non-empty status byte arrives, else False on timeout. Otherwise (no back-channel): `time.sleep(pacing_s)` and return True.

- [ ] **Step 1: Write the failing test**

```python
# append to print-server/test_transport.py
import time
from transport import probe_capabilities, confirm

class TestProbeConfirm(unittest.TestCase):
    def test_probe_receipt_with_reply(self):
        t = FakeTransport(status_replies=[b"\x12"])
        caps = probe_capabilities(t, "receipt")
        self.assertIn("dle_eot", caps)
        self.assertEqual(t.sent[0], b"\x10\x04\x01")   # DLE EOT 1 was sent

    def test_probe_receipt_mute_printer(self):
        t = FakeTransport(status_replies=[])           # no reply
        self.assertEqual(probe_capabilities(t, "receipt"), set())

    def test_confirm_pacing_path_returns_true(self):
        t = FakeTransport()
        start = time.time()
        self.assertTrue(confirm(t, set(), "label", pacing_s=0.05))
        self.assertGreaterEqual(time.time() - start, 0.05)

    def test_confirm_status_path_true_on_reply(self):
        t = FakeTransport(status_replies=[b"\x00"])
        self.assertTrue(confirm(t, {"dle_eot"}, "receipt", pacing_s=0.05))

    def test_confirm_status_path_false_on_timeout(self):
        t = FakeTransport(status_replies=[])           # never replies
        self.assertFalse(confirm(t, {"dle_eot"}, "receipt", pacing_s=0.05))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m unittest test_transport.TestProbeConfirm -v`
Expected: FAIL — `ImportError: cannot import name 'probe_capabilities'`.

- [ ] **Step 3: Write minimal implementation**

```python
# add to print-server/transport.py
import time

def probe_capabilities(transport, printer_kind):
    try:
        if printer_kind == "receipt":
            transport.send(b"\x10\x04\x01")            # DLE EOT 1
            return {"dle_eot"} if transport.read_status(0.2) else set()
        else:  # label / TSPL
            transport.send(b"\r\n\r\n")
            return {"tspl_status"} if transport.read_status(0.2) else set()
    except Exception:
        return set()

def confirm(transport, caps, printer_kind, pacing_s):
    if caps & {"dle_eot", "tspl_status"}:
        deadline = time.time() + max(pacing_s, 2.0)
        while time.time() < deadline:
            st = transport.read_status(0.2)
            if st:
                return True
            time.sleep(0.05)
        return False
    time.sleep(pacing_s)
    return True
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m unittest test_transport -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add print-server/transport.py print-server/test_transport.py
git commit -m "feat(print): capability probe + adaptive confirm ladder (status-else-pacing)"
```

---

### Task 7: `UsbTransport` + `TcpTransport` + `SerialTransport` + `build_transport`

**Files:**
- Modify: `print-server/transport.py`
- Test: `print-server/test_transport_build.py` (new)

**Interfaces:**
- Consumes: `Transport`, existing USB handle logic in `print_server.py` (`_get_or_open_usb`, `_send_usb` chunking — port it, do not import from the Flask module).
- Produces:
  - `UsbTransport(vid:int, pid:int, ep_out:int, ep_in:int=0x81)` — `open()` finds device, detaches kernel driver on macOS (`is_kernel_driver_active(0)`→`detach_kernel_driver(0)`), `set_configuration()`, caches handle at module level to survive GC/IOKit reclaim. `send()` chunks 512B with 20ms gaps. `read_status()` reads `ep_in` with the given timeout, returns bytes or `None` on timeout. Raises on `open()` failure (caller falls back to Cups).
  - `TcpTransport(ip:str, port:int=9100, timeout:float=5)` — `send()` opens a socket, `sendall`, keeps it for `read_status()` `recv`. Minimal; validated later.
  - `SerialTransport(port:str, baud:int=9600)` — `send()` writes + drains (port existence gates health). Minimal.
  - `build_transport(kind: str, cfg: dict) -> Transport` where `kind ∈ {'cups','usb','tcp','serial'}`; on `'usb'/'tcp'/'serial'` open failure, log and return `CupsTransport(cfg['cups_printer'])`.

- [ ] **Step 1: Write the failing test** (build/fallback logic only — hardware paths are exercised on-device in Task 12)

```python
# print-server/test_transport_build.py
import unittest
from transport import build_transport, CupsTransport

class TestBuildTransport(unittest.TestCase):
    def test_cups_kind_returns_cups(self):
        t = build_transport("cups", {"cups_printer": "GEZHI_POS_Printer"})
        self.assertIsInstance(t, CupsTransport)
        self.assertEqual(t.printer_name, "GEZHI_POS_Printer")

    def test_usb_open_failure_falls_back_to_cups(self):
        # VID/PID 0:0 never resolves → UsbTransport.open() raises → fallback
        t = build_transport("usb", {"vid": 0, "pid": 0, "ep_out": 2, "ep_in": 0x81,
                                    "cups_printer": "Xprinter_XP_365B"})
        self.assertIsInstance(t, CupsTransport)
        self.assertEqual(t.printer_name, "Xprinter_XP_365B")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m unittest test_transport_build -v`
Expected: FAIL — `ImportError: cannot import name 'build_transport'`.

- [ ] **Step 3: Write minimal implementation**

```python
# add to print-server/transport.py
import logging, os, socket
log = logging.getLogger("transport")

_usb_handles = {}   # (vid,pid) -> pyusb device, module-level to survive GC/IOKit reclaim

class UsbTransport(Transport):
    CHUNK = 512
    CHUNK_DELAY = 0.02
    def __init__(self, vid, pid, ep_out, ep_in=0x81):
        self.vid, self.pid, self.ep_out, self.ep_in = vid, pid, ep_out, ep_in
        self._dev = None
    def open(self):
        os.environ.setdefault("DYLD_LIBRARY_PATH", "/opt/homebrew/lib")
        import usb.core
        dev = _usb_handles.get((self.vid, self.pid))
        if dev is not None:
            try:
                dev.is_kernel_driver_active(0); self._dev = dev; return
            except Exception:
                _usb_handles.pop((self.vid, self.pid), None)
        dev = usb.core.find(idVendor=self.vid, idProduct=self.pid)
        if dev is None:
            raise RuntimeError(f"USB printer {self.vid:#06x}:{self.pid:#06x} not found")
        try:
            if dev.is_kernel_driver_active(0):
                dev.detach_kernel_driver(0)
        except Exception:
            pass
        dev.set_configuration()
        _usb_handles[(self.vid, self.pid)] = dev
        self._dev = dev
    def send(self, data: bytes) -> int:
        if self._dev is None:
            self.open()
        total = 0
        for i in range(0, len(data), self.CHUNK):
            total += self._dev.write(self.ep_out, data[i:i + self.CHUNK], timeout=10000)
            if i + self.CHUNK < len(data):
                time.sleep(self.CHUNK_DELAY)
        return total
    def read_status(self, timeout: float):
        try:
            arr = self._dev.read(self.ep_in, 64, timeout=int(timeout * 1000))
            return bytes(arr) if len(arr) else None
        except Exception:
            return None
    def close(self):
        self._dev = None   # keep module-level handle; just drop local ref

class TcpTransport(Transport):
    def __init__(self, ip, port=9100, timeout=5):
        self.ip, self.port, self.timeout = ip, port, timeout
        self._sock = None
    def open(self):
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._sock.settimeout(self.timeout)
        self._sock.connect((self.ip, self.port))
    def send(self, data: bytes) -> int:
        if self._sock is None:
            self.open()
        self._sock.sendall(data)
        return len(data)
    def read_status(self, timeout: float):
        try:
            self._sock.settimeout(timeout)
            b = self._sock.recv(64)
            return b or None
        except Exception:
            return None
    def close(self):
        if self._sock:
            try: self._sock.close()
            except Exception: pass
            self._sock = None

class SerialTransport(Transport):
    def __init__(self, port, baud=9600):
        self.port, self.baud = port, baud
        self._s = None
    def open(self):
        import serial
        self._s = serial.Serial(self.port, self.baud, timeout=10)
        time.sleep(1.0)
    def send(self, data: bytes) -> int:
        if self._s is None:
            self.open()
        n = self._s.write(data); self._s.flush(); time.sleep(0.5)
        return n
    def close(self):
        if self._s:
            try: self._s.close()
            except Exception: pass
            self._s = None

def build_transport(kind, cfg):
    try:
        if kind == "cups":
            return CupsTransport(cfg["cups_printer"])
        if kind == "usb":
            t = UsbTransport(cfg["vid"], cfg["pid"], cfg["ep_out"], cfg.get("ep_in", 0x81))
        elif kind == "tcp":
            t = TcpTransport(cfg["ip"], cfg.get("port", 9100))
        elif kind == "serial":
            t = SerialTransport(cfg["serial_port"], cfg.get("baud", 9600))
        else:
            return CupsTransport(cfg["cups_printer"])
        t.open()
        return t
    except Exception as exc:
        log.warning("transport %s open failed (%s) → CupsTransport fallback", kind, exc)
        return CupsTransport(cfg["cups_printer"])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m unittest test_transport_build -v`
Expected: PASS (USB path raises without hardware → falls back to Cups).

- [ ] **Step 5: Commit**

```bash
git add print-server/transport.py print-server/test_transport_build.py
git commit -m "feat(print): Usb/Tcp/Serial transports + build_transport with Cups fallback"
```

---

### Task 8: `PrintWorker` loop (render callback, cold wake, confirm, GAS mark, alert)

**Files:**
- Create: `print-server/print_worker.py`
- Test: `print-server/test_print_worker.py`

**Interfaces:**
- Consumes: `PrintSpool` (Tasks 1–3), `Transport`/`FakeTransport`/`confirm`/`probe_capabilities` (Tasks 5–6), a `render(job: dict) -> bytes` callback, a `label_setup_preamble` bytes value, a `gas_mark(order_id, kind) -> bool` callback, an `alert(job, err)` callback.
- Produces:
  - `class PrintWorker` with `__init__(self, printer, spool, transport, caps, render, *, setup_preamble=b"", gas_mark=None, alert=None, cold_seconds=20, pacing_s=1.0, orphan_s=30)` and `process_one() -> bool` (claim+print exactly one job; returns True if a job was handled, False if queue empty). The run loop calling `process_one()` in a thread is added in Task 9; `process_one()` is the unit-testable core.
  - Behavior of `process_one()`:
    1. `spool.recover_orphans(printer, orphan_s)`.
    2. `job = spool.claim_next(printer)`; if `None` return False.
    3. On label printers, send `setup_preamble` once per worker instance (guard with `self._setup_done`).
    4. If cold (no send within `cold_seconds`), `transport.send(b"\x1b@")` then `sleep(0.3)` — receipt only.
    5. `data = render(job)`; `transport.send(data)`.
    6. `ok = confirm(transport, caps, printer, pacing_s)`; if not `ok` raise `RuntimeError("confirm timeout")`.
    7. `spool.mark_printed(job["id"])`.
    8. If `gas_mark` and `spool.order_kind_all_printed(order_id, kind)`: call `gas_mark`; on True → `spool.set_gas_marked(...)`.
    9. On exception: `spool.requeue(job["id"], err)`; if the row is now `failed`, call `alert(job, err)`. Return True (a job was handled either way).

- [ ] **Step 1: Write the failing test**

```python
# print-server/test_print_worker.py
import os, sqlite3, tempfile, threading, unittest
from print_spool import PrintSpool
from transport import FakeTransport
from print_worker import PrintWorker

def _order(oid="ORD-20260723-0001"):
    return {"order_id": oid, "timestamp": "2026-07-23T08:00:00+07:00", "table_id": "03",
            "metadata": {"short_code": "Q01", "delivery_type": "dine_in", "notes": ""}, "items": []}

class WorkerBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mktemp(suffix=".db")
        self.conn = sqlite3.connect(self.tmp, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.spool = PrintSpool(self.conn, threading.Lock())
    def tearDown(self):
        self.conn.close()
        if os.path.exists(self.tmp): os.remove(self.tmp)
    def _worker(self, transport, **kw):
        return PrintWorker("label", self.spool, transport, set(),
                           render=lambda job: b"RENDER:" + job["idempotency_key"].encode(),
                           pacing_s=0.01, **kw)

class TestWorker(WorkerBase):
    def test_prints_each_cup_once(self):
        cups = [{"name": "X", "qty": 1, "modifiers": {}} for _ in range(3)]
        self.spool.enqueue_labels(_order(), cups)
        t = FakeTransport()
        w = self._worker(t)
        while w.process_one():
            pass
        self.assertEqual(len(t.sent), 3)
        statuses = [r["status"] for r in self.conn.execute("SELECT status FROM print_spool").fetchall()]
        self.assertEqual(statuses, ["printed", "printed", "printed"])

    def test_drop_then_replay_prints_only_missing(self):
        cups = [{"name": "X", "qty": 1, "modifiers": {}} for _ in range(3)]
        self.spool.enqueue_labels(_order(), cups)
        t1 = FakeTransport(drop_after=2)   # 3rd send raises
        w1 = self._worker(t1)
        for _ in range(3):
            try: w1.process_one()
            except Exception: pass
        # 2 printed, 1 back to pending (attempts<max)
        printed = self.conn.execute("SELECT COUNT(*) FROM print_spool WHERE status='printed'").fetchone()[0]
        self.assertEqual(printed, 2)
        t2 = FakeTransport()
        w2 = self._worker(t2)
        while w2.process_one():
            pass
        self.assertEqual(len(t2.sent), 1)   # replay printed ONLY the missing cup
        self.assertEqual(t2.sent[0], b"RENDER:ORD-20260723-0001:label:3")

    def test_gas_mark_called_only_after_all_printed(self):
        calls = []
        cups = [{"name": "X", "qty": 1, "modifiers": {}} for _ in range(2)]
        self.spool.enqueue_labels(_order(), cups)
        t = FakeTransport()
        w = self._worker(t, gas_mark=lambda oid, kind: (calls.append((oid, kind)) or True))
        w.process_one()
        self.assertEqual(calls, [])                     # not after 1st cup
        w.process_one()
        self.assertEqual(calls, [("ORD-20260723-0001", "label")])   # after 2nd (last) cup

    def test_alert_on_final_failure(self):
        alerts = []
        self.spool.enqueue_labels(_order(), [{"name": "X", "qty": 1, "modifiers": {}}])
        self.conn.execute("UPDATE print_spool SET max_attempts=1"); self.conn.commit()
        t = FakeTransport(drop_after=0)   # every send raises
        w = self._worker(t, alert=lambda job, err: alerts.append(job["idempotency_key"]))
        w.process_one()
        self.assertEqual(alerts, ["ORD-20260723-0001:label:1"])
        self.assertEqual(self.conn.execute("SELECT status FROM print_spool").fetchone()["status"], "failed")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m unittest test_print_worker -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'print_worker'`.

- [ ] **Step 3: Write minimal implementation**

```python
# print-server/print_worker.py
"""print_worker.py — one sequential worker per printer draining the spool."""
import time
from transport import confirm

class PrintWorker:
    def __init__(self, printer, spool, transport, caps, render, *, setup_preamble=b"",
                 gas_mark=None, alert=None, cold_seconds=20, pacing_s=1.0, orphan_s=30):
        self.printer = printer
        self.spool = spool
        self.transport = transport
        self.caps = caps
        self.render = render
        self.setup_preamble = setup_preamble
        self.gas_mark = gas_mark
        self.alert = alert
        self.cold_seconds = cold_seconds
        self.pacing_s = pacing_s
        self.orphan_s = orphan_s
        self._setup_done = False
        self._last_send = 0.0

    def process_one(self):
        self.spool.recover_orphans(self.printer, self.orphan_s)
        job = self.spool.claim_next(self.printer)
        if job is None:
            return False
        try:
            if self.printer == "label" and self.setup_preamble and not self._setup_done:
                self.transport.send(self.setup_preamble)
                self._setup_done = True
            if self.printer == "receipt" and (time.time() - self._last_send) > self.cold_seconds:
                self.transport.send(b"\x1b@")   # ESC @ wake
                time.sleep(0.3)
            data = self.render(job)
            self.transport.send(data)
            self._last_send = time.time()
            if not confirm(self.transport, self.caps, self.printer, self.pacing_s):
                raise RuntimeError("confirm timeout")
            self.spool.mark_printed(job["id"])
            if self.gas_mark and self.spool.order_kind_all_printed(job["order_id"], job["kind"]):
                if self.gas_mark(job["order_id"], job["kind"]):
                    self.spool.set_gas_marked(job["order_id"], job["kind"])
        except Exception as exc:
            self.spool.requeue(job["id"], exc)
            row = self.spool._conn.execute(
                "SELECT status FROM print_spool WHERE id=?", (job["id"],)).fetchone()
            if row and row["status"] == "failed" and self.alert:
                self.alert(job, exc)
        return True
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m unittest test_print_worker -v`
Expected: PASS (4 tests). This is the spec §10 `FakeTransport` replay guarantee.

- [ ] **Step 5: Commit**

```bash
git add print-server/print_worker.py print-server/test_print_worker.py
git commit -m "feat(print): PrintWorker.process_one — claim/render/confirm/mark, drop-replay, gas-mark, alert"
```

---

### Task 9: Flask integration — enqueue endpoints, `/order` + `/mark_paid`, worker threads, `PRINT_ENGINE`, `/health`

**Files:**
- Modify: `print-server/print_server.py`
- Test: `print-server/test_routes_spool.py` (new)

**Interfaces:**
- Consumes: `PrintSpool`, `PrintWorker`, `build_transport`, `probe_capabilities`, `printlib.build_receipt`, `printlib.build_label_tspl`, `printlib.label_setup_preamble`.
- Produces:
  - Module-level `SPOOL = PrintSpool(GATEWAY._conn, GATEWAY._lock)` (reuses the Gateway's connection + lock — same db file, one writer path).
  - `_render_job(job: dict) -> bytes`:
    - `job["kind"] == "receipt"`: `payload = json.loads(job["payload_json"])`; `return build_receipt(payload["order"], is_cash=payload["is_cash"])`.
    - `job["kind"] == "label"`: `payload = json.loads(...)`; `return build_label_tspl(payload["order"], payload["item"], job["seq_in_order"], job["total_in_order"], include_header=False)`.
  - `_gas_mark(order_id, kind) -> bool`: posts `mark_labels_printed` (kind `label`) or `mark_printed` (kind `receipt`) to GAS via existing `_gas_post`; returns `d.get("ok", False)`; returns False on exception (reconciler retries).
  - New route `POST /enqueue/labels` — body `{"order": {...}, "cups": [...]}` (or `{"order": {...}}` with `items` → server expands to cups) → `SPOOL.enqueue_labels(order, cups)` → `{"ok": True, "enqueued": n}`.
  - New route `POST /enqueue/receipt` — body `{"order": {...}, "is_cash": bool}` → `SPOOL.enqueue_receipt(order, is_cash)` → `{"ok": True, "enqueued": n}`.
  - `/order` (existing): when `PRINT_ENGINE == "spool"`, replace the `_async_print_labels` thread with `SPOOL.enqueue_labels(order, cups)`; keep the legacy thread when `PRINT_ENGINE == "legacy"`.
  - `/order/mark_paid` (existing): when spool, replace direct `_print_receipt_bytes(build_receipt(recp), ...)` with `SPOOL.enqueue_receipt(recp, is_cash)`.
  - `_start_workers()` — when `PRINT_ENGINE == "spool"`, build a transport per printer via env (`LABEL_TRANSPORT`/`RECEIPT_TRANSPORT`, default `cups`), probe caps, spawn one daemon thread per printer running `while True: worked = worker.process_one(); time.sleep(0.2 if not worked else 0)`. Called once at import/startup.
  - `/health`: add `"spool": {"label": SPOOL.stats("label"), "receipt": SPOOL.stats("receipt")}`.

- [ ] **Step 1: Write the failing test**

```python
# print-server/test_routes_spool.py
import json, os, tempfile, unittest
os.environ["PRINT_ENGINE"] = "spool"
os.environ["GATEWAY_DB"] = tempfile.mktemp(suffix=".db")
os.environ.setdefault("GAS_WEBAPP_URL", "http://gas.invalid")
import print_server

class TestEnqueueRoutes(unittest.TestCase):
    def setUp(self):
        self.c = print_server.app.test_client()
    def test_enqueue_labels_route(self):
        order = {"order_id": "ORD-20260723-0100", "timestamp": "2026-07-23T08:00:00+07:00",
                 "metadata": {"short_code": "Q10", "delivery_type": "dine_in", "notes": ""},
                 "items": [{"name": "Bac xiu", "qty": 2, "modifiers": {}}]}
        r = self.c.post("/enqueue/labels", json={"order": order})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["enqueued"], 2)   # qty 2 → 2 cups
        # idempotent
        r2 = self.c.post("/enqueue/labels", json={"order": order})
        self.assertEqual(r2.get_json()["enqueued"], 0)
    def test_enqueue_receipt_route(self):
        order = {"order_id": "ORD-20260723-0101", "timestamp": "2026-07-23T08:00:00+07:00",
                 "metadata": {"short_code": "Q11", "delivery_type": "dine_in", "notes": ""},
                 "items": [{"name": "Bac xiu", "qty": 1, "price": 30000, "modifiers": {}}],
                 "total": 30000, "payment": {"method": "cash"}}
        r = self.c.post("/enqueue/receipt", json={"order": order, "is_cash": True})
        self.assertEqual(r.get_json()["enqueued"], 1)
    def test_health_has_spool_stats(self):
        r = self.c.get("/health")
        self.assertIn("spool", r.get_json())
        self.assertIn("label", r.get_json()["spool"])
    def test_render_job_label_uses_no_header(self):
        job = {"kind": "label", "seq_in_order": 1, "total_in_order": 2,
               "payload_json": json.dumps({"order": {"order_id": "ORD-X",
                   "metadata": {"short_code": "Q1", "delivery_type": "dine_in", "notes": ""},
                   "timestamp": "2026-07-23T08:00:00+07:00"},
                   "item": {"name": "Bac xiu", "qty": 1, "modifiers": {}}, "is_cash": False})}
        data = print_server._render_job(job)
        self.assertNotIn(b"SIZE 50 mm", data)   # header suppressed (preamble sent once by worker)
        self.assertIn(b"PRINT 1,1", data)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m unittest test_routes_spool -v`
Expected: FAIL — `/enqueue/labels` 404 / `_render_job` missing / no `spool` key.

- [ ] **Step 3: Write minimal implementation**

In `print_server.py`, after the `GATEWAY = Gateway(...)` block, add:

```python
from print_spool import PrintSpool
from print_worker import PrintWorker
from transport import build_transport, probe_capabilities
from printlib import build_label_tspl, build_receipt, label_setup_preamble

PRINT_ENGINE = os.getenv("PRINT_ENGINE", "legacy")
LABEL_TRANSPORT   = os.getenv("LABEL_TRANSPORT", "cups")
RECEIPT_TRANSPORT = os.getenv("RECEIPT_TRANSPORT", "cups")

SPOOL = PrintSpool(GATEWAY._conn, GATEWAY._lock)

def _cups_to_cups(order_items):
    cups = []
    for it in order_items:
        for _ in range(max(1, int(it.get("qty", 1)))):
            cups.append(it)
    return cups

def _render_job(job):
    payload = json.loads(job["payload_json"])
    if job["kind"] == "receipt":
        return build_receipt(payload["order"], is_cash=payload.get("is_cash", False))
    return build_label_tspl(payload["order"], payload["item"],
                            job["seq_in_order"], job["total_in_order"], include_header=False)

def _gas_mark(order_id, kind):
    action = "mark_labels_printed" if kind == "label" else "mark_printed"
    try:
        d = _gas_post({"action": action, "order_id": order_id})
        return bool(d.get("ok"))
    except Exception:
        return False
```

Add the routes (near the other `/order` routes):

```python
@app.post("/enqueue/labels")
def enqueue_labels_route():
    p = request.get_json(force=True, silent=True) or {}
    order = p.get("order") or {}
    cups = p.get("cups") or _cups_to_cups(order.get("items", []))
    n = SPOOL.enqueue_labels(order, cups)
    return jsonify({"ok": True, "enqueued": n}), 200

@app.post("/enqueue/receipt")
def enqueue_receipt_route():
    p = request.get_json(force=True, silent=True) or {}
    order = p.get("order") or {}
    is_cash = bool(p.get("is_cash", False))
    n = SPOOL.enqueue_receipt(order, is_cash)
    return jsonify({"ok": True, "enqueued": n}), 200
```

In `order_create` (`/order`), replace the `if cups:` print-thread block with:

```python
    if cups:
        if PRINT_ENGINE == "spool":
            SPOOL.enqueue_labels(order, cups)
        else:
            def _async_print_labels():
                try:
                    all_labels = build_order_labels_tspl(order, cups)
                    n = _print_label_bytes(all_labels)
                    log.info("order_create LABELS (%d cups, %d bytes) for %s", len(cups), n, order_id)
                except Exception as exc:
                    log.error("label print failed %s: %s", order_id, exc)
            threading.Thread(target=_async_print_labels, daemon=True).start()
```

In `order_mark_paid`, replace the receipt-print block:

```python
    if recp and recp.get("items"):
        method = ((recp.get("payment") or {}).get("method")) or p.get("payment_method") or "cash"
        is_cash = str(method).lower() in ("cash", "tien_mat", "tienmat")
        if PRINT_ENGINE == "spool":
            SPOOL.enqueue_receipt(recp, is_cash); receipt_printed = True
        else:
            try:
                _print_receipt_bytes(build_receipt(recp, is_cash), open_drawer=is_cash); receipt_printed = True
            except Exception as exc:
                log.error("local receipt failed: %s", exc)
```

Add the worker bootstrap + `/health` spool stats. After `SPOOL = ...`:

```python
def _start_workers():
    if PRINT_ENGINE != "spool":
        return
    def _spawn(printer, kind_transport, cfg, pacing_s):
        transport = build_transport(kind_transport, cfg)
        caps = probe_capabilities(transport, printer)
        preamble = label_setup_preamble() if printer == "label" else b""
        worker = PrintWorker(printer, SPOOL, transport, caps, _render_job,
                             setup_preamble=preamble, gas_mark=_gas_mark,
                             alert=_spool_alert, pacing_s=pacing_s)
        def _loop():
            while True:
                worked = False
                try:
                    worked = worker.process_one()
                except Exception as exc:
                    log.error("worker %s loop error: %s", printer, exc)
                time.sleep(0.0 if worked else 0.2)
        threading.Thread(target=_loop, daemon=True, name=f"printworker-{printer}").start()
        log.info("print worker started: printer=%s transport=%s caps=%s", printer, kind_transport, caps)

    _spawn("label", LABEL_TRANSPORT,
           {"cups_printer": LABEL_CUPS_PRINTER, "vid": LABEL_USB_VID, "pid": LABEL_USB_PID,
            "ep_out": LABEL_USB_EP, "ip": LABEL_PRINTER_IP, "port": LABEL_PRINTER_PORT,
            "serial_port": LABEL_SERIAL_PORT}, pacing_s=0.8)
    _spawn("receipt", RECEIPT_TRANSPORT,
           {"cups_printer": RECEIPT_CUPS_PRINTER, "vid": RECEIPT_USB_VID, "pid": RECEIPT_USB_PID,
            "ep_out": RECEIPT_USB_EP, "ip": RECEIPT_PRINTER_IP, "port": RECEIPT_PRINTER_PORT,
            "serial_port": RECEIPT_SERIAL_PORT}, pacing_s=1.0)

def _spool_alert(job, err):
    log.error("[SPOOL FAILED] %s: %s", job.get("idempotency_key"), err)
    # Task 11 wires Telegram here.

_start_workers()
```

In `health()`, add to the returned JSON dict:

```python
        "spool": {"label": SPOOL.stats("label"), "receipt": SPOOL.stats("receipt")},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m unittest test_routes_spool -v`
Expected: PASS. Then confirm legacy still green: `python3 -m unittest test_routes -v`.

- [ ] **Step 5: Commit**

```bash
git add print-server/print_server.py print-server/test_routes_spool.py
git commit -m "feat(print): spool engine wired into Flask — enqueue routes, workers, PRINT_ENGINE flag, health stats"
```

---

### Task 10: Poller switches to `/enqueue/*` (order JSON, no local-dedup, no GAS-mark-on-enqueue)

**Files:**
- Modify: `print-server/print_poller.py`
- Test: `print-server/test_poller_enqueue.py` (new)

**Interfaces:**
- Consumes: the `/enqueue/labels` and `/enqueue/receipt` routes (Task 9).
- Produces:
  - `_post_json(url: str, obj: dict, timeout=25) -> dict` — POSTs `application/json`.
  - `poll_labels_once()` and `poll_once()` rewritten: for each pending order, POST `{"order": order}` to `PRINT_SERVER_URL + "/enqueue/labels"` (labels) / `{"order": order, "is_cash": <bool>}` to `/enqueue/receipt` (receipt). They **no longer** call `_printed_by_gateway_local`, and **no longer** call GAS `mark_labels_printed`/`mark_printed` (the worker does that after physical print, spec §8.1). A non-200 from enqueue is logged and retried on the next poll (enqueue is idempotent).

- [ ] **Step 1: Write the failing test**

```python
# print-server/test_poller_enqueue.py
import unittest
from unittest import mock
import print_poller

class TestPollerEnqueue(unittest.TestCase):
    def test_labels_poll_posts_order_json_to_enqueue(self):
        order = {"order_id": "ORD-20260723-0200", "items": [{"name": "X", "qty": 2, "modifiers": {}}],
                 "metadata": {"delivery_type": "dine_in"}}
        posted = {}
        def fake_get_json(url, timeout=25):
            if "pending_labels" in url:
                return {"orders": [order]}
            posted["mark_called"] = True   # any GAS mark call would land here
            return {"ok": True}
        def fake_post_json(url, obj, timeout=25):
            posted["url"] = url; posted["obj"] = obj
            return {"ok": True, "enqueued": 2}
        with mock.patch.object(print_poller, "_get_json", fake_get_json), \
             mock.patch.object(print_poller, "_post_json", fake_post_json), \
             mock.patch.object(print_poller, "GAS_WEBAPP_URL", "http://gas"):
            print_poller.poll_labels_once()
        self.assertTrue(posted["url"].endswith("/enqueue/labels"))
        self.assertEqual(posted["obj"]["order"]["order_id"], "ORD-20260723-0200")
        self.assertNotIn("mark_called", posted)   # poller must NOT mark GAS anymore
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m unittest test_poller_enqueue -v`
Expected: FAIL — poller still calls `_post_bytes` + GAS mark; `_post_json` missing.

- [ ] **Step 3: Write minimal implementation**

Add `_post_json` next to `_post_bytes` in `print_poller.py`:

```python
def _post_json(url: str, obj: dict, timeout=25) -> dict:
    body = json.dumps(obj).encode()
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/json", "User-Agent": "PrintPoller/1.0"},
        method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())
```

Rewrite the body of the `for order in orders:` loop in `poll_labels_once()`:

```python
    for order in orders:
        order_id = order.get("order_id", "?")
        if order.get("label_printed_at"):
            continue
        items = order.get("items") or []
        if not items:
            log.warning("Order %s: no items, skip labels", order_id)
            continue
        try:
            resp = _post_json(PRINT_SERVER_URL + "/enqueue/labels", {"order": order})
            if not resp.get("ok"):
                raise RuntimeError(f"enqueue labels: {resp}")
            log.info("Labels enqueued for %s (%d new)", order_id, resp.get("enqueued", 0))
            printed_any = True
        except Exception as exc:
            log.error("Labels enqueue failed for %s: %s", order_id, exc)
    return printed_any
```

Rewrite the `for order in orders:` loop in `poll_once()`:

```python
    for order in orders:
        order_id = order.get("order_id", "?")
        method = ((order.get("payment") or {}).get("method") or "cash")
        is_cash = str(method).lower() in ("cash", "tien_mat", "tienmat")
        try:
            resp = _post_json(PRINT_SERVER_URL + "/enqueue/receipt",
                              {"order": order, "is_cash": is_cash})
            if not resp.get("ok"):
                raise RuntimeError(f"enqueue receipt: {resp}")
            log.info("Receipt enqueued for %s (%d new)", order_id, resp.get("enqueued", 0))
            printed_any = True
        except Exception as exc:
            log.error("Receipt enqueue failed for %s: %s", order_id, exc)
    return printed_any
```

Remove the now-unused `_printed_by_gateway_local` calls in both loops (the function may stay defined but is no longer called; delete its call sites only).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m unittest test_poller_enqueue -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add print-server/print_poller.py print-server/test_poller_enqueue.py
git commit -m "feat(print): poller enqueues order JSON to /enqueue/*, drops local-dedup and GAS-mark-on-enqueue"
```

---

### Task 11: GAS-mark reconciler + Telegram alert wiring

**Files:**
- Modify: `print-server/print_server.py`
- Test: `print-server/test_reconciler.py` (new)

**Interfaces:**
- Consumes: `SPOOL.pending_gas_marks`, `SPOOL.set_gas_marked`, `_gas_mark`, existing Telegram notify path (reuse `_gas_post`/whatever Notify hook exists; if none in this module, POST a `notify_admin` action to GAS).
- Produces:
  - `_reconcile_gas_marks_once() -> int` — for each `{order_id, kind}` in `SPOOL.pending_gas_marks()`, call `_gas_mark`; on True call `SPOOL.set_gas_marked`. Returns count reconciled. Runs in the worker bootstrap as a low-frequency loop (every ~15s) only when `PRINT_ENGINE == "spool"`.
  - `_spool_alert(job, err)` upgraded to POST `{"action": "notify_admin", "text": "..."}` to GAS via `_gas_post` (best-effort, swallow errors), replacing the Task-9 log-only stub.

- [ ] **Step 1: Write the failing test**

```python
# print-server/test_reconciler.py
import os, tempfile, unittest
os.environ["PRINT_ENGINE"] = "spool"
os.environ["GATEWAY_DB"] = tempfile.mktemp(suffix=".db")
os.environ.setdefault("GAS_WEBAPP_URL", "http://gas.invalid")
import print_server

def _order(oid): 
    return {"order_id": oid, "timestamp": "2026-07-23T08:00:00+07:00",
            "metadata": {"short_code": "Q1", "delivery_type": "dine_in", "notes": ""}, "items": []}

class TestReconciler(unittest.TestCase):
    def test_reconciler_marks_when_gas_ok(self):
        # a fully-printed order with gas_marked=0
        print_server.SPOOL.enqueue_labels(_order("ORD-REC-1"), [{"name": "X", "qty": 1, "modifiers": {}}])
        j = print_server.SPOOL.claim_next("label"); print_server.SPOOL.mark_printed(j["id"])
        marked = []
        print_server._gas_mark = lambda oid, kind: marked.append((oid, kind)) or True
        n = print_server._reconcile_gas_marks_once()
        self.assertEqual(n, 1)
        self.assertEqual(marked, [("ORD-REC-1", "label")])
        self.assertEqual(print_server.SPOOL.pending_gas_marks(), [])   # cleared
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd print-server && python3 -m unittest test_reconciler -v`
Expected: FAIL — `AttributeError: module 'print_server' has no attribute '_reconcile_gas_marks_once'`.

- [ ] **Step 3: Write minimal implementation**

```python
# add to print-server/print_server.py
def _reconcile_gas_marks_once():
    n = 0
    for pm in SPOOL.pending_gas_marks():
        if _gas_mark(pm["order_id"], pm["kind"]):
            SPOOL.set_gas_marked(pm["order_id"], pm["kind"])
            n += 1
    return n
```

Upgrade `_spool_alert`:

```python
def _spool_alert(job, err):
    text = f"⚠️ In hỏng: {job.get('idempotency_key')} — {str(err)[:200]}"
    log.error("[SPOOL FAILED] %s", text)
    try:
        _gas_post({"action": "notify_admin", "text": text})
    except Exception:
        pass
```

In `_start_workers()`, after spawning the two printer workers, add a reconciler loop:

```python
    def _reconcile_loop():
        while True:
            try:
                _reconcile_gas_marks_once()
            except Exception as exc:
                log.error("gas reconcile error: %s", exc)
            time.sleep(15)
    threading.Thread(target=_reconcile_loop, daemon=True, name="gas-reconciler").start()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd print-server && python3 -m unittest test_reconciler -v`
Expected: PASS. Full suite: `python3 -m unittest discover -s . -p 'test_*.py'` (from `print-server/`).

- [ ] **Step 5: Commit**

```bash
git add print-server/print_server.py print-server/test_reconciler.py
git commit -m "feat(print): GAS-mark reconciler loop + Telegram alert on failed spool jobs"
```

---

### Task 12: Hardware validation on the Mac Mini (manual, gated behind rollout)

**Files:**
- Create: `print-server/HARDWARE_VALIDATION.md` (checklist + results log)
- No test file — this task is on-device manual verification per spec §9/§10.

**Interfaces:**
- Consumes: everything above, running under launchd `printserver`.
- Produces: a filled-in results log proving the five spec §10.3 scenarios pass, and captured USB VID:PID values for the `usb` transport step.

- [ ] **Step 1: Capture USB identifiers**

Run on the Mac Mini:
```bash
system_profiler SPUSBDataType | grep -iA6 "xprinter\|gezhi\|pos-58\|365"
```
Record `Vendor ID` / `Product ID` for both printers into `HARDWARE_VALIDATION.md`.

- [ ] **Step 2: Logic de-risk over CUPS (no wiring change)**

Set env in the launchd `printserver` plist: `PRINT_ENGINE=spool`, `LABEL_TRANSPORT=cups`, `RECEIPT_TRANSPORT=cups`. Restart the agent:
```bash
launchctl kickstart -k gui/$(id -u)/com.lamha.kissaten.printserver
```
Run the five scenarios (§10.3) and record pass/fail: (1) 5 back-to-back `/order`, (2) 10-cup order, (3) 50-item receipt, (4) cold start, (5) pull USB mid-print then restart → replay prints only the remainder.

- [ ] **Step 3: Flip label transport to USB, re-run**

Set `LABEL_TRANSPORT=usb`, `LABEL_USB_VID`/`LABEL_USB_PID`/`LABEL_USB_EP` from Step 1. Restart agent, re-run the five scenarios. Confirm back-channel confirm engages (log line `caps=...` non-empty if the clone answers; otherwise pacing).

- [ ] **Step 4: Flip receipt transport to USB, re-run**

Set `RECEIPT_TRANSPORT=usb` + its VID/PID/EP. Restart, re-run. Verify header/logo present, tail + cut on the 50-item receipt, cash drawer opens on cash and stays shut on VietQR.

- [ ] **Step 5: Commit the results log**

```bash
git add print-server/HARDWARE_VALIDATION.md
git commit -m "docs(print): hardware validation results for spool engine rollout"
```

---

## Self-Review

**Spec coverage:**
- §1 dead-code batched → Task 4 deletes it. ✓
- §3 three layers → Tasks 1–3 (spool), 5–7 (transport), 8 (worker). ✓
- §3.1 one job/output, drawer before cut gated is_cash, CHUNK_H preserved → Tasks 1, 4. ✓
- §4 data model → Task 1. ✓
- §5 transport interface + kernel detach + cups fallback → Tasks 5, 7. ✓
- §5.1 capability probe → Task 6. ✓
- §6 confirm ladder; §6.1 TSPL gap 0.8s + preamble once → Tasks 6, 8, 9 (pacing_s=0.8 label; preamble sent once via worker `_setup_done`). ✓
- §7 worker loop + orphan recovery → Tasks 2, 8. ✓
- §8 local+online unified enqueue → Tasks 9, 10; §8.1 worker-mark-on-confirm → Tasks 8, 9, 11. ✓
- §9 rollout PRINT_ENGINE + cups-first → Tasks 9, 12. ✓
- §10 tests incl. FakeTransport replay + drawer gate → Tasks 4, 5, 8. ✓
- §11 observability (health stats + telegram alert) → Tasks 9, 11. ✓
- §12 file map matches created/modified files. ✓
- §13 risks (orphan dup, mute back-channel, USB VID unknown) handled by Tasks 2/6/12. ✓

**Placeholder scan:** no TBD/TODO; every code step shows full code; commands have expected output.

**Type consistency:** `PrintSpool` method names used identically across Tasks 2/3/8/9/11 (`claim_next`, `mark_printed`, `requeue`, `recover_orphans`, `order_kind_all_printed`, `set_gas_marked`, `pending_gas_marks`, `stats`, `enqueue_labels`, `enqueue_receipt`). `Transport.send/read_status/capabilities`, `confirm(transport, caps, printer_kind, pacing_s)`, `probe_capabilities(transport, printer_kind)`, `build_transport(kind, cfg)`, `PrintWorker.process_one`, `_render_job`, `_gas_mark`, `_reconcile_gas_marks_once` consistent across tasks. `build_receipt(order, is_cash)` and `build_label_tspl(..., include_header=False)` consistent Tasks 4/9.
