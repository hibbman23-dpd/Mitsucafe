import sqlite3, tempfile, threading, unittest
from order_store import OrderStore, VersionConflict
import bill_engine


def _store():
    conn = sqlite3.connect(tempfile.mktemp(suffix=".db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return OrderStore(conn, threading.Lock())


def _seed(s):
    s.upsert_create({
        "order_id": "ORD-20260726-0001", "short_code": "Q01",
        "delivery_type": "dine_in", "table_id": "B1", "source": "staff",
        "items": [
            {"sku": "DR005", "name": "Cà phê muối", "qty": 2, "price": 30000},
            {"sku": "DR028", "name": "Trà sữa oolong", "qty": 1, "price": 25000},
        ],
    })


class TestBillEngine(unittest.TestCase):
    def test_diff_detects_removed_line(self):
        old = [{"sku": "DR005", "name": "Cà phê muối", "qty": 2}]
        new = []
        d = bill_engine.diff_removed_kitchen_lines(old, new)
        self.assertEqual(d[0]["sku"], "DR005")
        self.assertEqual(d[0]["removed_qty"], 2)

    def test_diff_detects_reduced_qty(self):
        old = [{"sku": "DR005", "name": "Cà phê muối", "qty": 2}]
        new = [{"sku": "DR005", "name": "Cà phê muối", "qty": 1}]
        d = bill_engine.diff_removed_kitchen_lines(old, new)
        self.assertEqual(d[0]["removed_qty"], 1)

    def test_diff_ignores_added_or_unchanged(self):
        old = [{"sku": "DR005", "name": "X", "qty": 1}]
        new = [{"sku": "DR005", "name": "X", "qty": 1}, {"sku": "DR028", "name": "Y", "qty": 3}]
        self.assertEqual(bill_engine.diff_removed_kitchen_lines(old, new), [])

    def test_apply_items_edit_recomputes_total_and_reports_cancels(self):
        s = _store(); _seed(s)
        res = bill_engine.apply_items_edit(
            s, "ORD-20260726-0001",
            new_items=[{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}],
            expected_version=1)
        self.assertEqual(res["order"]["total"], 30000)
        cancelled_skus = {c["sku"] for c in res["cancelled_lines"]}
        self.assertEqual(cancelled_skus, {"DR005", "DR028"})  # DR005 reduced, DR028 removed

    def test_diff_size_swap_reports_old_variant(self):
        old = [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "modifiers": {"size": "L"}}]
        new = [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "modifiers": {"size": "M"}}]
        d = bill_engine.diff_removed_kitchen_lines(old, new)
        self.assertEqual(len(d), 1)
        self.assertEqual(d[0]["removed_qty"], 1)
        self.assertEqual(d[0]["modifiers"], {"size": "L"})

    def test_apply_items_edit_missing_order_raises_keyerror(self):
        s = _store()
        with self.assertRaises(KeyError):
            bill_engine.apply_items_edit(s, "NOPE", new_items=[], expected_version=1)


class TestSplitMerge(unittest.TestCase):
    def setUp(self):
        self.s = _store(); _seed(self.s)  # ORD-...0001: DR005 x2, DR028 x1

    def test_split_forks_into_suborders(self):
        subs = bill_engine.split_order(
            self.s, "ORD-20260726-0001",
            partitions=[
                [{"sku": "DR005", "name": "Cà phê muối", "qty": 2, "price": 30000}],
                [{"sku": "DR028", "name": "Trà sữa oolong", "qty": 1, "price": 25000}],
            ],
            expected_version=1)
        ids = sorted(x["order_id"] for x in subs)
        self.assertEqual(ids, ["ORD-20260726-0001-A", "ORD-20260726-0001-B"])
        self.assertEqual(self.s.get("ORD-20260726-0001")["status"], "SPLIT")
        self.assertEqual(self.s.get("ORD-20260726-0001-A")["parent_order_id"], "ORD-20260726-0001")
        self.assertEqual(self.s.get("ORD-20260726-0001-A")["total"], 60000)
        self.assertEqual(self.s.get("ORD-20260726-0001-B")["total"], 25000)

    def test_split_rejects_incomplete_partition(self):
        with self.assertRaises(ValueError):
            bill_engine.split_order(
                self.s, "ORD-20260726-0001",
                partitions=[[{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]],
                expected_version=1)  # leaves DR005 x1 + DR028 x1 unaccounted

    def test_merge_tags_shared_group(self):
        self.s.upsert_create({
            "order_id": "ORD-20260726-0002", "short_code": "Q02",
            "delivery_type": "dine_in", "table_id": "B1", "source": "staff",
            "items": [{"sku": "DR005", "name": "Cà phê muối", "qty": 1, "price": 30000}]})
        res = bill_engine.merge_bill(self.s, ["ORD-20260726-0001", "ORD-20260726-0002"])
        g = res["group_id"]
        self.assertEqual(self.s.get("ORD-20260726-0001")["bill_group_id"], g)
        self.assertEqual(self.s.get("ORD-20260726-0002")["bill_group_id"], g)

    def test_merge_missing_order_rolls_back(self):
        # a second order to merge with, so we can see it is NOT tagged on failure
        self.s.upsert_create({"order_id": "ORD-20260726-0002", "short_code": "Q02",
                              "delivery_type": "dine_in", "table_id": "B1", "source": "staff",
                              "items": [{"sku": "DR005", "name": "X", "qty": 1, "price": 30000}]})
        with self.assertRaises(KeyError):
            bill_engine.merge_bill(self.s, ["ORD-20260726-0002", "ORD-NOPE"])
        self.assertIsNone(self.s.get("ORD-20260726-0002")["bill_group_id"])  # rolled back

    def test_split_stale_version_creates_no_orphans(self):
        with self.assertRaises(VersionConflict):
            bill_engine.split_order(
                self.s, "ORD-20260726-0001",
                partitions=[
                    [{"sku": "DR005", "name": "Cà phê muối", "qty": 2, "price": 30000}],
                    [{"sku": "DR028", "name": "Trà sữa oolong", "qty": 1, "price": 25000}]],
                expected_version=99)
        self.assertIsNone(self.s.get("ORD-20260726-0001-A"))
        self.assertIsNone(self.s.get("ORD-20260726-0001-B"))
        self.assertNotEqual(self.s.get("ORD-20260726-0001")["status"], "SPLIT")

    def test_split_too_many_partitions_rejected(self):
        with self.assertRaises(ValueError):
            bill_engine.split_order(self.s, "ORD-20260726-0001",
                                    partitions=[[] for _ in range(27)], expected_version=1)

    def test_split_atomic_rolls_back_partial_write_on_error(self):
        # Second sub-order has a non-numeric price -> compute_total raises mid-write.
        subs = [
            {"order_id": "ORD-20260726-0001-A", "parent_order_id": "ORD-20260726-0001",
             "items": [{"sku": "DR005", "name": "X", "qty": 1, "price": 30000}]},
            {"order_id": "ORD-20260726-0001-B", "parent_order_id": "ORD-20260726-0001",
             "items": [{"sku": "DR028", "name": "Y", "qty": 1, "price": "bad"}]},
        ]
        with self.assertRaises(Exception):
            self.s.split_atomic("ORD-20260726-0001", subs, expected_version=1)
        self.assertIsNone(self.s.get("ORD-20260726-0001-A"))            # rolled back, no orphan
        self.assertNotEqual(self.s.get("ORD-20260726-0001")["status"], "SPLIT")
        # must not resurrect on a later unrelated commit
        self.s.upsert_create({"order_id": "ORD-20260726-0009", "short_code": "Q09",
                              "delivery_type": "dine_in", "table_id": "B1", "source": "staff",
                              "items": [{"sku": "DR005", "name": "X", "qty": 1, "price": 30000}]})
        self.assertIsNone(self.s.get("ORD-20260726-0001-A"))

    def test_split_preexisting_suborder_id_rejected_no_orphan(self):
        self.s.upsert_create({"order_id": "ORD-20260726-0001-A", "short_code": "Q01A",
                              "delivery_type": "dine_in", "table_id": "B1", "source": "staff",
                              "items": [{"sku": "DR005", "name": "X", "qty": 1, "price": 30000}]})
        with self.assertRaises(ValueError):
            bill_engine.split_order(
                self.s, "ORD-20260726-0001",
                partitions=[
                    [{"sku": "DR005", "name": "Cà phê muối", "qty": 2, "price": 30000}],
                    [{"sku": "DR028", "name": "Trà sữa oolong", "qty": 1, "price": 25000}]],
                expected_version=1)
        self.assertIsNone(self.s.get("ORD-20260726-0001-B"))  # sibling never created
        self.assertNotEqual(self.s.get("ORD-20260726-0001")["status"], "SPLIT")
