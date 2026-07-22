import os, tempfile, unittest
from gateway import Gateway

def fake_reserve(dtype, n):
    fake_reserve.calls += 1
    start = fake_reserve.next
    fake_reserve.next += n
    return {"letter": "Q", "date": "20260722", "from": start, "to": start + n - 1}
fake_reserve.calls = 0; fake_reserve.next = 1

def payload(idem="idem-1"):
    return {"channel": "kds", "items": [{"name": "Bạc xỉu", "qty": 1,
            "modifiers": {}}], "metadata": {"delivery_type": "dine_in"},
            "idempotency_key": idem}

class TestGateway(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mktemp(suffix=".db")
        fake_reserve.calls = 0; fake_reserve.next = 1
        self.gw = Gateway(self.tmp, "http://gas", "tok", reserve_fn=fake_reserve, today="20260722")
    def tearDown(self):
        if os.path.exists(self.tmp): os.remove(self.tmp)

    def test_mint_assigns_orderid_and_shortcode(self):
        r = self.gw.mint_order(payload())
        self.assertTrue(r["order_id"].startswith("ORD-20260722-"))
        self.assertEqual(r["short_code"], "Q01")
        self.assertFalse(r["deduped"])

    def test_mint_dedup_same_key_returns_same_order(self):
        a = self.gw.mint_order(payload("k"))
        self.gw.enqueue("ingest_order", a["order_id"], "k", payload("k"), a["short_code"], "t")
        b = self.gw.mint_order(payload("k"))
        self.assertTrue(b["deduped"])
        self.assertEqual(a["order_id"], b["order_id"])
        self.assertEqual(a["short_code"], b["short_code"])

    def test_block_exhaustion_requests_new_block(self):
        for i in range(21):
            self.gw.mint_order(payload(f"k{i}"))
        self.assertEqual(fake_reserve.calls, 2)

    def test_offline_band_when_reserve_fails(self):
        def boom(dtype, n): raise RuntimeError("GAS down")
        gw = Gateway(tempfile.mktemp(suffix=".db"), "http://gas", "tok",
                     reserve_fn=boom, today="20260722")
        r = gw.mint_order(payload("kk"))
        self.assertIn("X", r["short_code"])       # offline band QX*
        self.assertTrue(r["short_code"].startswith("QX"))

    def test_get_by_key(self):
        a = self.gw.mint_order(payload("kx"))
        self.gw.enqueue("ingest_order", a["order_id"], "kx", payload("kx"),
                        short_code=a["short_code"], printed_at="t")
        got = self.gw.get_by_key("kx")
        self.assertEqual(got["order_id"], a["order_id"])

    def test_fifo_status_not_before_create(self):
        a = self.gw.mint_order(payload("kf"))
        self.gw.enqueue("ingest_order", a["order_id"], "kf", payload("kf"), a["short_code"], "t")
        self.gw.enqueue("mark_paid", a["order_id"], "kf-paid", {"order_id": a["order_id"]})
        pend = self.gw.unsynced()
        ops = [p["op"] for p in pend]
        self.assertEqual(ops[0], "ingest_order")
        self.gw.mark_synced(pend[0]["seq"])
        pend2 = self.gw.unsynced()
        self.assertTrue(any(p["op"] == "mark_paid" for p in pend2))

    def test_mint_records_atomically_get_by_key_before_enqueue(self):
        # 🟠6: mint ghi outbox NGAY → get_by_key thấy liền, không cần chờ enqueue.
        r = self.gw.mint_order(payload("atomic"))
        got = self.gw.get_by_key("atomic")
        self.assertIsNotNone(got)
        self.assertEqual(got["order_id"], r["order_id"])

    def test_unique_order_id_no_self_collision(self):
        ids = set()
        for i in range(200):
            ids.add(self.gw.mint_order(payload(f"u{i}"))["order_id"])
        self.assertEqual(len(ids), 200)   # không trùng order_id trong outbox

    def test_unsynced_remote_status_not_starved(self):
        # 🟠7: op status cho đơn KHÔNG do gateway tạo (không có ingest row) → phải gửi, không kẹt.
        self.gw.enqueue("status", "ORD-REMOTE-0001", "r:MAKING",
                        {"action": "update_status", "order_id": "ORD-REMOTE-0001", "status": "MAKING"})
        pend = self.gw.unsynced()
        self.assertTrue(any(p["order_id"] == "ORD-REMOTE-0001" for p in pend))

    def test_midnight_rollover_flushes_old_block(self):
        self.gw.mint_order(payload("d1"))          # Q01 ngày 20260722
        self.gw.today = "20260723"                 # sang ngày mới
        fake_reserve.next = 1
        r = self.gw.mint_order(payload("d2"))
        self.assertEqual(r["short_code"], "Q01")    # reset theo ngày, xin block mới
        self.assertEqual(fake_reserve.calls, 2)

    def test_get_create_payload_returns_items(self):
        self.gw.mint_order({"items":[{"name":"CF","qty":1,"price":30000,"modifiers":{}}],
              "total":30000,"metadata":{"delivery_type":"dine_in"},"idempotency_key":"rp1"})
        oid = self.gw.get_by_key("rp1")["order_id"]
        pl = self.gw.get_create_payload(oid)
        self.assertIsNotNone(pl); self.assertEqual(pl["items"][0]["name"], "CF")
        self.assertIsNone(self.gw.get_create_payload("ORD-REMOTE-9"))  # đơn không do gateway tạo

    def test_poison_pill_error_stops_retries(self):
        seq = self.gw.enqueue("status", "ORD-1", "k:1", {"order_id": "ORD-1", "status": "DELIVERED"})
        self.gw.mark_error(seq, "Invalid transition: NEW → DELIVERED")
        pend = self.gw.unsynced()
        self.assertFalse(any(p["seq"] == seq for p in pend))

if __name__ == "__main__":
    unittest.main()
