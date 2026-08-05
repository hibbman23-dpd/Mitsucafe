import sqlite3, tempfile, threading, unittest
from datetime import datetime, timedelta, timezone

from attendance_store import AttendanceStore, QuickPunchConfirm, new_punch_id

_VN = timezone(timedelta(hours=7))


def _store():
    conn = sqlite3.connect(tempfile.mktemp(suffix=".db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return AttendanceStore(conn, threading.Lock())


def _at(y, m, d, hh, mm=0):
    return datetime(y, m, d, hh, mm, tzinfo=_VN)


class TestPunch(unittest.TestCase):
    def test_first_punch_opens_shift(self):
        s = _store()
        r = s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 7, 2))
        self.assertEqual(r["action"], "in")
        self.assertEqual(r["row"]["status"], "OPEN")
        self.assertEqual(r["row"]["date"], "2026-08-05")
        self.assertEqual(r["row"]["source"], "staff")
        self.assertIsNone(r["row"]["clock_out_at"])

    def test_second_punch_closes_shift_and_counts_minutes(self):
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 7, 0))
        r = s.punch("S001", "Sương", "n2", now=_at(2026, 8, 5, 15, 38))
        self.assertEqual(r["action"], "out")
        self.assertEqual(r["row"]["status"], "CLOSED")
        self.assertEqual(r["row"]["minutes_worked"], 518)

    def test_replayed_nonce_returns_original_result(self):
        s = _store()
        first = s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 7, 0))
        again = s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 7, 0, ))
        self.assertTrue(again["replay"])
        self.assertEqual(again["action"], "in")
        self.assertEqual(again["row"]["punch_id"], first["row"]["punch_id"])
        rows = s.conn.execute("SELECT COUNT(*) c FROM attendance").fetchone()
        self.assertEqual(rows["c"], 1)

    def test_quick_out_needs_confirm(self):
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 7, 0))
        with self.assertRaises(QuickPunchConfirm):
            s.punch("S001", "Sương", "n2", now=_at(2026, 8, 5, 7, 1))

    def test_quick_out_closes_when_confirmed(self):
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 7, 0))
        r = s.punch("S001", "Sương", "n2", confirm_quick_out=True,
                    now=_at(2026, 8, 5, 7, 1))
        self.assertEqual(r["row"]["status"], "CLOSED")
        self.assertEqual(r["row"]["minutes_worked"], 1)

    def test_two_staff_do_not_interfere(self):
        s = _store()
        s.punch("S001", "Sương", "a1", now=_at(2026, 8, 5, 7, 0))
        r = s.punch("S002", "Hà", "b1", now=_at(2026, 8, 5, 7, 5))
        self.assertEqual(r["action"], "in")

    def test_shift_after_close_opens_new_one(self):
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 7, 0))
        s.punch("S001", "Sương", "n2", now=_at(2026, 8, 5, 12, 0))
        r = s.punch("S001", "Sương", "n3", now=_at(2026, 8, 5, 17, 0))
        self.assertEqual(r["action"], "in")

    def test_punch_id_unique_across_1000_calls(self):
        now = _at(2026, 8, 5, 7, 0)
        ids = {new_punch_id(now) for _ in range(1000)}
        self.assertEqual(len(ids), 1000)


if __name__ == "__main__":
    unittest.main()
