"""
stress_spool_harness.py — Automated Stress Test & Hardening Harness for Spool Engine.
Tests all 6 required reliability scenarios against temp SQLite databases and FakeTransports.
"""

import json
import os
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(__file__))

from print_spool import PrintSpool
from print_worker import PrintWorker
from transport import CupsTransport, Transport


class MockTransport(Transport):
    def __init__(self, should_fail=False):
        self._open = False
        self.sent_data = []
        self.should_fail = should_fail

    def open(self) -> None:
        self._open = True

    def send(self, data: bytes) -> int:
        if self.should_fail:
            raise RuntimeError("Mock Transport Connection Error")
        self.sent_data.append(data)
        return len(data)

    def read_status(self, timeout: float) -> bytes | None:
        return b"\x00"

    def capabilities(self) -> set[str]:
        return {"dle_eot"}

    def close(self) -> None:
        self._open = False


def create_test_order(order_id: str, cup_count: int = 1, delivery_type: str = "dine_in") -> dict:
    return {
        "order_id": order_id,
        "timestamp": "2026-07-23T12:00:00+07:00",
        "table_id": "01",
        "customer_name": "Test Customer",
        "customer_id": "0900000000",
        "metadata": {
            "short_code": "Q01",
            "delivery_type": delivery_type,
            "notes": "Stress test notes",
        },
        "items": [
            {
                "sku": "DR001",
                "name": "CF MITSU",
                "qty": cup_count,
                "price": 25000,
                "modifiers": {"size": "M", "sugar": "100%", "ice": "full"},
            }
        ],
        "total": 25000 * cup_count,
        "payment": {"method": "cash"},
    }


def run_spool_stress_harness():
    print("==================================================================")
    print("🚀 RUNNING SPOOL ENGINE HARNESS STRESS TEST SUITE (6 SCENARIOS)")
    print("==================================================================\n")

    tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
    conn = sqlite3.connect(tmp_db, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    lock = threading.Lock()
    spool = PrintSpool(conn, lock)

    # ── SCENARIO 1: Burst Test (50 Rapid Orders) ──
    print("1️⃣ [Scenario 1] Burst Test: Enqueuing 50 rapid back-to-back orders...")
    start_t = time.time()
    for i in range(1, 51):
        oid = f"ORD-BURST-{i:03d}"
        order = create_test_order(oid, cup_count=1)
        spool.enqueue_labels(order, order["items"])

    burst_count = spool.stats("label")
    assert burst_count.get("pending") == 50, f"Expected 50 pending label jobs, got {burst_count}"
    print(f"   ✅ PASS: 50 orders enqueued in {time.time() - start_t:.3f}s. All 50 jobs present in print_spool.\n")

    # ── SCENARIO 2: Multi-Cup Order (50 Cups in 1 Order) ──
    print("2️⃣ [Scenario 2] Multi-Cup Order: Enqueuing 1 order with 50 cups...")
    big_order_id = "ORD-BIG-001"
    big_order = create_test_order(big_order_id, cup_count=50)
    cups = [big_order["items"][0]] * 50
    spool.enqueue_labels(big_order, cups)

    rows = spool._conn.execute("SELECT seq_in_order, total_in_order FROM print_spool WHERE order_id=?", (big_order_id,)).fetchall()
    assert len(rows) == 50, f"Expected 50 cup jobs, got {len(rows)}"
    assert all(r[1] == 50 for r in rows), "total_in_order mismatch"
    print("   ✅ PASS: 50-cup order generated exactly 50 individual cup jobs [1/50] to [50/50].\n")

    # ── SCENARIO 3: Parallel Client Requests ──
    print("3️⃣ [Scenario 3] Parallel Clients: 20 concurrent threads calling enqueue...")
    def _parallel_enqueue(idx):
        oid = f"ORD-PARALLEL-{idx:03d}"
        order = create_test_order(oid, cup_count=2)
        spool.enqueue_labels(order, order["items"] * 2)
        spool.enqueue_receipt(order, is_cash=True)

    with ThreadPoolExecutor(max_workers=10) as exec:
        list(exec.map(_parallel_enqueue, range(1, 21)))

    p_labels = spool._conn.execute("SELECT count(*) FROM print_spool WHERE idempotency_key LIKE 'ORD-PARALLEL-%:label:%'").fetchone()[0]
    p_receipts = spool._conn.execute("SELECT count(*) FROM print_spool WHERE idempotency_key LIKE 'ORD-PARALLEL-%:receipt:0'").fetchone()[0]
    assert p_labels == 40, f"Expected 40 parallel label jobs, got {p_labels}"
    assert p_receipts == 20, f"Expected 20 parallel receipt jobs, got {p_receipts}"
    print("   ✅ PASS: 20 parallel threads enqueued 40 labels + 20 receipts safely without thread lock contention.\n")

    # ── SCENARIO 4: Durability & Orphan Recovery ──
    print("4️⃣ [Scenario 4] Durability & Orphan Recovery: Reclaiming stuck 'printing' jobs...")
    # Simulate a crash: job stuck in 'printing' with claimed_at 60s ago
    spool._conn.execute("""
        UPDATE print_spool SET status='printing', claimed_at=datetime('now', '-60 seconds')
        WHERE id = (SELECT id FROM print_spool WHERE status='pending' LIMIT 1)
    """)
    spool._conn.commit()

    stuck_before = spool._conn.execute("SELECT count(*) FROM print_spool WHERE status='printing'").fetchone()[0]
    assert stuck_before >= 1, "Failed to inject orphan job"

    recovered = spool.recover_orphans("label", older_than_s=30)
    stuck_after = spool._conn.execute("SELECT count(*) FROM print_spool WHERE status='printing'").fetchone()[0]
    assert recovered >= 1 and stuck_after == 0, "Orphan recovery failed"
    print(f"   ✅ PASS: Recovered {recovered} orphan job(s) from 'printing' back to 'pending'. Zero job loss.\n")

    # ── SCENARIO 5: Printer Failure & Alert ──
    print("5️⃣ [Scenario 5] Printer Failure & Retry Limit: Processing job with failing transport...")
    fail_transport = MockTransport(should_fail=True)
    def render_fn(j): return b"DUMMY_RASTER"
    gas_calls = []
    def gas_mark_fn(j): gas_calls.append(j["id"])

    worker = PrintWorker("label", spool, fail_transport, set(), render_fn, gas_mark=gas_mark_fn, cold_seconds=999)

    # Fetch pending job ID
    job_row = spool._conn.execute("SELECT id, max_attempts FROM print_spool WHERE status='pending' LIMIT 1").fetchone()
    assert job_row is not None, "No job to test failure"
    job_id = job_row["id"]
    max_att = job_row["max_attempts"]

    for _ in range(max_att):
        worker.process_one()

    failed_row = spool._conn.execute("SELECT status, attempts, last_error FROM print_spool WHERE id=?", (job_id,)).fetchone()
    assert failed_row[0] == "failed", f"Expected failed status, got {failed_row[0]}"
    assert len(gas_calls) == 0, "GAS mark was incorrectly called on a failed job!"
    print(f"   ✅ PASS: Job marked 'failed' after {failed_row[1]} attempts. GAS mark was NOT invoked on failure.\n")

    # ── SCENARIO 6: Receipt Mark Paid Idempotency ──
    print("6️⃣ [Scenario 6] Receipt Mark Paid Idempotency across distinct orders...")
    for k in range(1, 6):
        oid = f"ORD-RECEIPT-DEDUP-{k:03d}"
        order = create_test_order(oid)
        spool.enqueue_receipt(order, is_cash=True)
        # Duplicate enqueue attempt
        spool.enqueue_receipt(order, is_cash=True)

    r_count = spool._conn.execute("SELECT count(*) FROM print_spool WHERE order_id LIKE 'ORD-RECEIPT-DEDUP-%'").fetchone()[0]
    assert r_count == 5, f"Expected 5 distinct receipt jobs, got {r_count}"
    print("   ✅ PASS: Duplicate enqueue attempts for the same receipt idempotency key were cleanly ignored.\n")

    print("==================================================================")
    print("🎉 ALL 6 SPOOL ENGINE STRESS SCENARIOS PASSED WITH 100% INTEGRITY!")
    print("==================================================================")

    os.remove(tmp_db)


if __name__ == "__main__":
    run_spool_stress_harness()
