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


class TestNightShiftAndSweep(unittest.TestCase):
    def test_night_shift_crossing_midnight_closes_same_row(self):
        """Ca 21:00 ngày 05 → 02:00 ngày 06. date=05 nhưng hôm nay là 06.
        Phải đóng đúng ca cũ, không mở ca mới."""
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 21, 0))
        r = s.punch("S001", "Sương", "n2", now=_at(2026, 8, 6, 2, 0))
        self.assertEqual(r["action"], "out")
        self.assertEqual(r["row"]["date"], "2026-08-05")
        self.assertEqual(r["row"]["minutes_worked"], 300)
        self.assertEqual(s.conn.execute(
            "SELECT COUNT(*) c FROM attendance").fetchone()["c"], 1)

    def test_sweep_at_0400_leaves_completed_night_shift_alone(self):
        """Ca đêm chạy trọn 21:00 -> 02:00 đã CLOSED trước lúc sweep,
        nên job 04:00 không được đụng vào nó."""
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 21, 0))
        s.punch("S001", "Sương", "n2", now=_at(2026, 8, 6, 2, 0))
        marked = s.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        self.assertEqual(marked, 0)
        self.assertEqual(s.conn.execute(
            "SELECT status FROM attendance").fetchone()["status"], "CLOSED")

    def test_sweep_marks_shift_from_previous_day(self):
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 7, 0))
        marked = s.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        self.assertEqual(marked, 1)
        row = s.conn.execute("SELECT * FROM attendance").fetchone()
        self.assertEqual(row["status"], "UNCLOSED")
        self.assertIsNone(row["minutes_worked"])

    def test_unclosed_shift_can_still_be_punched_out(self):
        """Hồi quy bug §5.1.1: ca UNCLOSED bị bấm ra phải đóng chính nó,
        tuyệt đối không mở ca mới."""
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 22, 0))
        s.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        r = s.punch("S001", "Sương", "n2", now=_at(2026, 8, 6, 4, 30))
        self.assertEqual(r["action"], "out")
        self.assertEqual(r["row"]["status"], "CLOSED")
        self.assertEqual(r["row"]["edit_note"], "nhân viên bấm ra muộn")
        self.assertEqual(s.conn.execute(
            "SELECT COUNT(*) c FROM attendance").fetchone()["c"], 1)

    def test_week_old_unclosed_is_not_reopened(self):
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 7, 29, 7, 0))
        s.sweep_unclosed(now=_at(2026, 7, 30, 4, 0))
        r = s.punch("S001", "Sương", "n2", now=_at(2026, 8, 5, 7, 0))
        self.assertEqual(r["action"], "in")


class TestReportAndOwnerEdits(unittest.TestCase):
    def test_report_sums_closed_only(self):
        s = _store()
        s.punch("S001", "Sương", "a1", now=_at(2026, 8, 5, 7, 0))
        s.punch("S001", "Sương", "a2", now=_at(2026, 8, 5, 12, 0))   # 300'
        s.punch("S001", "Sương", "a3", now=_at(2026, 8, 6, 7, 0))    # còn mở
        rep = s.report("2026-08-01", "2026-08-31")
        by = {r["staff_id"]: r for r in rep["by_staff"]}
        self.assertEqual(by["S001"]["minutes"], 300)
        self.assertEqual(by["S001"]["shifts"], 1)
        self.assertEqual(len(rep["unclosed"]), 0)   # ca hôm nay vẫn OPEN, chưa phải UNCLOSED

    def test_report_lists_unclosed_separately(self):
        s = _store()
        s.punch("S001", "Sương", "a1", now=_at(2026, 8, 5, 7, 0))
        s.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        rep = s.report("2026-08-01", "2026-08-31")
        self.assertEqual(len(rep["unclosed"]), 1)
        self.assertEqual(rep["by_staff"], [])

    def test_report_respects_date_range(self):
        s = _store()
        s.punch("S001", "Sương", "a1", now=_at(2026, 7, 31, 7, 0))
        s.punch("S001", "Sương", "a2", now=_at(2026, 7, 31, 12, 0))
        rep = s.report("2026-08-01", "2026-08-31")
        self.assertEqual(rep["by_staff"], [])

    def test_fix_closes_unclosed_and_records_audit(self):
        s = _store()
        s.punch("S001", "Sương", "a1", now=_at(2026, 8, 5, 7, 0))
        s.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        pid = s.conn.execute("SELECT punch_id FROM attendance").fetchone()["punch_id"]
        row = s.fix(pid, owner_id="S000", note="quên bấm",
                    clock_out_at="2026-08-05T15:00:00+07:00")
        self.assertEqual(row["status"], "CLOSED")
        self.assertEqual(row["minutes_worked"], 480)
        self.assertEqual(row["edited_by"], "S000")
        self.assertEqual(row["edit_note"], "quên bấm")
        self.assertIsNotNone(row["edited_at"])
        self.assertIsNone(row["synced_at"])

    def test_fix_rejects_out_before_in(self):
        s = _store()
        s.punch("S001", "Sương", "a1", now=_at(2026, 8, 5, 7, 0))
        pid = s.conn.execute("SELECT punch_id FROM attendance").fetchone()["punch_id"]
        with self.assertRaises(ValueError):
            s.fix(pid, owner_id="S000", note="sai",
                  clock_out_at="2026-08-05T06:00:00+07:00")

    def test_fix_unknown_punch_id_raises(self):
        from attendance_store import NotFound
        s = _store()
        with self.assertRaises(NotFound):
            s.fix("ATT-nope", owner_id="S000", note="x",
                  clock_out_at="2026-08-05T15:00:00+07:00")

    def test_create_manual_marks_source_and_audit(self):
        s = _store()
        row = s.create_manual("S001", "Sương",
                              "2026-08-05T07:00:00+07:00",
                              "2026-08-05T15:00:00+07:00",
                              owner_id="S000", note="quên cả vào lẫn ra")
        self.assertEqual(row["source"], "owner_manual")
        self.assertEqual(row["status"], "CLOSED")
        self.assertEqual(row["minutes_worked"], 480)
        self.assertEqual(row["date"], "2026-08-05")
        self.assertEqual(row["edited_by"], "S000")

    def test_today_open_lists_only_open_shifts(self):
        s = _store()
        s.punch("S001", "Sương", "a1", now=_at(2026, 8, 5, 7, 0))
        s.punch("S002", "Hà", "b1", now=_at(2026, 8, 5, 8, 0))
        s.punch("S002", "Hà", "b2", now=_at(2026, 8, 5, 12, 0))
        names = [r["staff_name"] for r in s.today_open(now=_at(2026, 8, 5, 13, 0))]
        self.assertEqual(names, ["Sương"])


if __name__ == "__main__":
    unittest.main()
