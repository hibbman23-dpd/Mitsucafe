import sqlite3, tempfile, threading, unittest
from datetime import datetime, timedelta, timezone

from attendance_store import (AttendanceStore, QuickPunchConfirm, UnclosedChoice,
                              NotFound, NoShiftToClose, NonceConflict, new_punch_id)

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

    def test_shared_nonce_across_different_staff_do_not_collide(self):
        """F6: nonce trùng giữa hai máy khách của hai nhân viên khác nhau —
        mỗi người vẫn phải nhận đúng ca của mình, không ai bị trả nhầm kết quả
        "replay" của người kia và mất luôn ca của chính mình."""
        s = _store()
        r1 = s.punch("S001", "Sương", "dup-nonce", now=_at(2026, 8, 5, 7, 0))
        r2 = s.punch("S002", "Hà", "dup-nonce", now=_at(2026, 8, 5, 7, 5))
        self.assertEqual(r1["action"], "in")
        self.assertEqual(r2["action"], "in")
        self.assertFalse(r1.get("replay"))
        self.assertFalse(r2.get("replay"))
        self.assertNotEqual(r1["row"]["punch_id"], r2["row"]["punch_id"])
        rows = s.conn.execute("SELECT COUNT(*) c FROM attendance").fetchone()
        self.assertEqual(rows["c"], 2)

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

    def test_backward_clock_step_leaves_await_owner_not_zero_minute_closed(self):
        """P1 (3/3): thay thế test_backward_clock_step_clamps_minutes_to_zero
        cũ — test cũ khẳng định đồng hồ chạy lùi được ghi CLOSED/0 phút, đúng
        cái lỗi review yêu cầu xoá: một ca ĐẦY ĐỦ bị trả lương bằng không, và
        vì status=CLOSED nên nó rơi khỏi hẳn report()["unclosed"], chủ không
        bao giờ biết mà sửa. Hành vi ĐÚNG: để AWAIT_OWNER, giữ
        clock_out_at/minutes_worked NULL, ghi edit_note giải thích, và phải
        còn nằm trong report()["unclosed"] chờ chủ nhập giờ tay. Delta âm cũng
        rơi vào cửa sổ quick-out (âm < QUICK_OUT_SECONDS) nên phải
        confirm_quick_out=True để tái hiện đúng đường đi thật của bug."""
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 10, 0))
        r = s.punch("S001", "Sương", "n2", confirm_quick_out=True,
                    now=_at(2026, 8, 5, 9, 30))
        self.assertEqual(r["row"]["status"], "AWAIT_OWNER")
        self.assertIsNone(r["row"]["clock_out_at"])
        self.assertIsNone(r["row"]["minutes_worked"])
        self.assertIn("chạy lùi", r["row"]["edit_note"])
        rep = s.report("2026-08-01", "2026-08-31")
        self.assertEqual(len(rep["unclosed"]), 1)
        self.assertEqual(rep["unclosed"][0]["punch_id"], r["row"]["punch_id"])


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

    def test_evening_sweep_does_not_flag_shift_still_in_progress(self):
        """Canh công thức cutoff: sweep chạy nhầm vào buổi tối cũng KHÔNG được
        đánh dấu ca tối đang làm dở. Đây là nửa thứ nhất của bản vá ca đêm."""
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 18, 0))
        marked = s.sweep_unclosed(now=_at(2026, 8, 5, 22, 0))
        self.assertEqual(marked, 0)
        self.assertEqual(s.conn.execute(
            "SELECT status FROM attendance").fetchone()["status"], "OPEN")

    def test_sweep_marks_shift_from_previous_day(self):
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 7, 0))
        marked = s.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        self.assertEqual(marked, 1)
        row = s.conn.execute("SELECT * FROM attendance").fetchone()
        self.assertEqual(row["status"], "UNCLOSED")
        self.assertIsNone(row["minutes_worked"])

    def test_unclosed_shift_without_intent_raises_choice(self):
        """F2 — thay thế test_unclosed_shift_can_still_be_punched_out cũ:
        test cũ khẳng định bấm lại một ca UNCLOSED sẽ ÂM THẦM đóng nó và tính
        phút theo giờ tường (giờ hệ thống trừ giờ vào) — đúng cái hành vi lỗi
        mà F2 yêu cầu xoá bỏ (ca 19 tiếng ở báo cáo review là ca đêm ~5 tiếng
        bị đóng nhầm 1140 phút). Hành vi ĐÚNG: khi ca gần nhất là UNCLOSED mà
        caller chưa nói rõ ý định, server phải hỏi lại (raise UnclosedChoice),
        không tự đoán và không tự đóng ca."""
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 22, 0))
        s.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        with self.assertRaises(UnclosedChoice) as ctx:
            s.punch("S001", "Sương", "n2", now=_at(2026, 8, 6, 4, 30))
        self.assertEqual(ctx.exception.row["status"], "UNCLOSED")
        # Không được đẻ ca nào thêm và không được đụng vào ca cũ chỉ vì hỏi.
        row = s.conn.execute("SELECT COUNT(*) c FROM attendance").fetchone()
        self.assertEqual(row["c"], 1)
        self.assertEqual(s.conn.execute(
            "SELECT status FROM attendance").fetchone()["status"], "UNCLOSED")

    def test_19_hour_unclosed_shift_returns_choice_not_silent_close(self):
        """Tái hiện đúng kịch bản trong báo cáo review: ca vào 21:00 ngày 05,
        bị quét thành UNCLOSED lúc 04:00, rồi bị bấm lại lúc 16:00 ngày 06 —
        cách nhau 19 tiếng. Trước fix: server tự đóng với minutes_worked=1140
        và ẩn luôn khỏi report()["unclosed"]. Sau fix: phải hỏi lại."""
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 21, 0))
        s.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        with self.assertRaises(UnclosedChoice):
            s.punch("S001", "Sương", "n2", now=_at(2026, 8, 6, 16, 0))
        rep = s.report("2026-08-01", "2026-08-31")
        self.assertEqual(len(rep["unclosed"]), 1)
        self.assertEqual(rep["unclosed"][0]["minutes_worked"], None)

    def test_unclosed_intent_close_late_leaves_minutes_null_and_moves_to_await_owner(self):
        """P1 (thay thế bản cũ "...and_stays_unclosed"): intent="close_late"
        vẫn không bịa giờ ra — clock_out_at/minutes_worked phải NULL — nhưng
        status giờ chuyển AWAIT_OWNER thay vì giữ nguyên UNCLOSED. Test cũ
        khẳng định status ở lại UNCLOSED, đúng cái lỗi review yêu cầu xoá: giữ
        UNCLOSED khiến _open_shift tiếp tục khớp ca này, nên lượt bấm TIẾP
        THEO của chính người đó (ví dụ vào ca tối) lại nhận đúng câu hỏi
        UNCLOSED một lần nữa thay vì mở ca mới bình thường."""
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 21, 0))
        s.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        r = s.punch("S001", "Sương", "n2", intent="close_late",
                    now=_at(2026, 8, 6, 16, 0))
        self.assertEqual(r["action"], "close_late")
        self.assertEqual(r["row"]["status"], "AWAIT_OWNER")
        self.assertIsNone(r["row"]["clock_out_at"])
        self.assertIsNone(r["row"]["minutes_worked"])
        self.assertEqual(r["row"]["edit_note"],
                         "nhân viên xác nhận đã ra ca — chờ chủ nhập giờ")
        self.assertIsNone(r["row"]["synced_at"])
        rep = s.report("2026-08-01", "2026-08-31")
        self.assertEqual(len(rep["unclosed"]), 1)

    def test_after_close_late_next_tap_opens_evening_shift_normally(self):
        """P1 (1/3): tái hiện đúng kịch bản trong báo cáo review — nhân viên
        acknowledge lúc 10:00 ("Ra ca hôm qua"), rồi quay lại ca tối 17:00 bấm
        tên mình. Trước fix: _close_late giữ status UNCLOSED nên _open_shift
        vẫn khớp ca đó, người này nhận LẠI y hệt câu hỏi UNCLOSED, bấm "Ra ca
        hôm qua" lần nữa thì KHÔNG còn ca OPEN nào — làm việc cả buổi tối mà
        không có ca nào được ghi nhận. Sau fix: lượt bấm 17:00 phải mở ca mới
        bình thường, và ca đã acknowledge phải còn nguyên AWAIT_OWNER."""
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 21, 0))
        s.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        acked = s.punch("S001", "Sương", "n2", intent="close_late",
                        now=_at(2026, 8, 6, 10, 0))
        evening = s.punch("S001", "Sương", "n3", now=_at(2026, 8, 6, 17, 0))
        self.assertEqual(evening["action"], "in")
        self.assertEqual(evening["row"]["status"], "OPEN")
        # Ca đã acknowledge không bị đụng vào — vẫn AWAIT_OWNER, vẫn của người đó.
        acked_row = s.conn.execute(
            "SELECT status FROM attendance WHERE punch_id=?",
            (acked["row"]["punch_id"],)).fetchone()
        self.assertEqual(acked_row["status"], "AWAIT_OWNER")
        rows = s.conn.execute(
            "SELECT COUNT(*) c FROM attendance WHERE staff_id='S001'").fetchone()
        self.assertEqual(rows["c"], 2)   # ca cũ (acknowledge) + ca tối mới, không có ca ma

    def test_close_late_past_24h_window_raises_and_creates_no_row(self):
        """P1 (2/3): trước fix, acknowledge một ca đã rơi khỏi cửa sổ 24h
        (không còn khớp _open_shift) rơi qua nhánh `shift is None` và ÂM THẦM
        mở một ca clock-in MỚI ngay tại thời điểm acknowledge — một ca ma mà
        không ai làm việc thật. Verified trong báo cáo review: bấm "Ra ca hôm
        qua" lúc 21:10 tạo ra một dòng OPEN lúc 21:10. Sau fix: intent
        close_late không tìm thấy ca nào để đóng phải raise, tuyệt đối không
        được tạo dòng nào."""
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 7, 29, 7, 0))
        s.sweep_unclosed(now=_at(2026, 7, 30, 4, 0))
        with self.assertRaises(NoShiftToClose):
            s.punch("S001", "Sương", "n2", intent="close_late",
                    now=_at(2026, 8, 6, 21, 10))
        rows = s.conn.execute(
            "SELECT COUNT(*) c FROM attendance WHERE staff_id='S001'").fetchone()
        self.assertEqual(rows["c"], 1)   # chỉ ca UNCLOSED cũ, không có ca ma nào mới

    def test_fix_closes_an_await_owner_row(self):
        """P1: chủ phải sửa được ca AWAIT_OWNER y hệt UNCLOSED — fix() không
        được gate theo status hiện tại, chỉ cần chủ cung cấp clock_out_at."""
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 21, 0))
        s.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        acked = s.punch("S001", "Sương", "n2", intent="close_late",
                        now=_at(2026, 8, 6, 10, 0))
        self.assertEqual(acked["row"]["status"], "AWAIT_OWNER")
        row = s.fix(acked["row"]["punch_id"], owner_id="S000", note="chủ nhập tay",
                    clock_out_at="2026-08-06T02:00:00+07:00")
        self.assertEqual(row["status"], "CLOSED")
        self.assertEqual(row["minutes_worked"], 300)

    def test_sweep_and_staff_ids_with_open_shift_ignore_await_owner(self):
        """P1: AWAIT_OWNER không phải "ca treo cho nhân viên tự xử lý" nữa —
        sweep_unclosed không được đụng vào (không có gì để quét thêm), và
        staff_ids_with_open_shift không được liệt kê người này vào lưới tên
        chờ tự bấm ra (không còn gì cho họ làm với ca đó)."""
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 21, 0))
        s.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        s.punch("S001", "Sương", "n2", intent="close_late", now=_at(2026, 8, 6, 10, 0))
        swept = s.sweep_unclosed(now=_at(2026, 8, 7, 4, 0))
        self.assertEqual(swept, 0)
        self.assertEqual(s.staff_ids_with_open_shift(now=_at(2026, 8, 6, 11, 0)), [])
        row = s.conn.execute("SELECT status FROM attendance").fetchone()
        self.assertEqual(row["status"], "AWAIT_OWNER")   # sweep không đụng vào

    def test_unclosed_intent_close_late_nonce_replay(self):
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 21, 0))
        s.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        first = s.punch("S001", "Sương", "n2", intent="close_late",
                        now=_at(2026, 8, 6, 16, 0))
        again = s.punch("S001", "Sương", "n2", intent="close_late",
                        now=_at(2026, 8, 6, 16, 0))
        self.assertTrue(again["replay"])
        self.assertEqual(again["action"], "close_late")
        self.assertEqual(again["row"]["punch_id"], first["row"]["punch_id"])

    def test_unclosed_intent_new_shift_opens_second_row_leaves_first_unclosed(self):
        """§5.1.1 vẫn đúng, nhưng giờ qua intent rõ ràng thay vì tự đoán: mở
        ca mới, tuyệt đối không đụng ca UNCLOSED cũ."""
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 21, 0))
        s.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        r = s.punch("S001", "Sương", "n2", intent="new_shift",
                    now=_at(2026, 8, 6, 16, 0))
        self.assertEqual(r["action"], "in")
        self.assertEqual(r["row"]["status"], "OPEN")
        rows = s.conn.execute(
            "SELECT status FROM attendance ORDER BY clock_in_at").fetchall()
        self.assertEqual([row["status"] for row in rows], ["UNCLOSED", "OPEN"])

    def test_unclosed_intent_new_shift_nonce_replay(self):
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 21, 0))
        s.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        first = s.punch("S001", "Sương", "n2", intent="new_shift",
                        now=_at(2026, 8, 6, 16, 0))
        again = s.punch("S001", "Sương", "n2", intent="new_shift",
                        now=_at(2026, 8, 6, 16, 0))
        self.assertTrue(again["replay"])
        self.assertEqual(again["action"], "in")
        self.assertEqual(again["row"]["punch_id"], first["row"]["punch_id"])
        rows = s.conn.execute("SELECT COUNT(*) c FROM attendance").fetchone()
        self.assertEqual(rows["c"], 2)   # không đẻ thêm ca thứ ba vì replay

    def test_ordinary_same_day_open_punch_out_unaffected(self):
        """Đường OPEN bình thường (cùng ngày) phải giữ NGUYÊN như trước F2:
        đóng ca và tính phút, không cần intent."""
        s = _store()
        s.punch("S001", "Sương", "n1", now=_at(2026, 8, 5, 7, 0))
        r = s.punch("S001", "Sương", "n2", now=_at(2026, 8, 5, 15, 38))
        self.assertEqual(r["action"], "out")
        self.assertEqual(r["row"]["status"], "CLOSED")
        self.assertEqual(r["row"]["minutes_worked"], 518)

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

    def test_create_manual_nonce_replay_returns_existing_row(self):
        """F8: form chủ nhập tay double-submit (double tap, mạng chậm bấm
        lại lần hai) không được đẻ hai ca giống hệt nhau."""
        s = _store()
        first = s.create_manual("S001", "Sương",
                                "2026-08-05T07:00:00+07:00",
                                "2026-08-05T15:00:00+07:00",
                                owner_id="S000", note="quên cả hai", nonce="m1")
        again = s.create_manual("S001", "Sương",
                                "2026-08-05T07:00:00+07:00",
                                "2026-08-05T15:00:00+07:00",
                                owner_id="S000", note="quên cả hai", nonce="m1")
        self.assertEqual(first["punch_id"], again["punch_id"])
        rows = s.conn.execute("SELECT COUNT(*) c FROM attendance").fetchone()
        self.assertEqual(rows["c"], 1)

    def test_create_manual_nonce_replay_with_different_values_raises_conflict(self):
        """P2c: chủ sửa giờ sau một phản hồi mạng bị rớt (server đã lưu thành
        công lần đầu) rồi gửi lại với CÙNG nonce cũ (client chỉ đổi nonce SAU
        khi thấy phản hồi thành công, nên vẫn giữ nonce cũ khi tưởng lần đầu
        thất bại). Trả thẳng row CŨ với ok:True (hành vi trước fix) sẽ khiến
        chủ tưởng giờ MỚI đã lưu trong khi ca vẫn giữ giờ CŨ — không có gì báo
        hiệu sai lệch. Phải raise để route trả conflict rõ ràng."""
        s = _store()
        s.create_manual("S001", "Sương",
                        "2026-08-05T07:00:00+07:00", "2026-08-05T15:00:00+07:00",
                        owner_id="S000", note="lần đầu", nonce="m1")
        with self.assertRaises(NonceConflict) as ctx:
            s.create_manual("S001", "Sương",
                            "2026-08-05T07:00:00+07:00", "2026-08-05T16:00:00+07:00",
                            owner_id="S000", note="lần đầu", nonce="m1")
        self.assertEqual(ctx.exception.row["clock_out_at"], "2026-08-05T15:00:00+07:00")
        rows = s.conn.execute("SELECT COUNT(*) c FROM attendance").fetchone()
        self.assertEqual(rows["c"], 1)   # không đẻ ca thứ hai, cũng không âm thầm giữ ca cũ

    def test_create_manual_without_nonce_is_not_deduped(self):
        """Không truyền nonce (caller cũ) giữ nguyên hành vi trước — không có
        cách nào phân biệt hai lần gọi giống hệt là double-submit hay hai ca
        thật trùng giờ, nên không đoán."""
        s = _store()
        s.create_manual("S001", "Sương", "2026-08-05T07:00:00+07:00",
                        "2026-08-05T15:00:00+07:00", owner_id="S000", note="a")
        s.create_manual("S001", "Sương", "2026-08-05T07:00:00+07:00",
                        "2026-08-05T15:00:00+07:00", owner_id="S000", note="a")
        rows = s.conn.execute("SELECT COUNT(*) c FROM attendance").fetchone()
        self.assertEqual(rows["c"], 2)

    def test_today_open_lists_only_open_shifts(self):
        s = _store()
        s.punch("S001", "Sương", "a1", now=_at(2026, 8, 5, 7, 0))
        s.punch("S002", "Hà", "b1", now=_at(2026, 8, 5, 8, 0))
        s.punch("S002", "Hà", "b2", now=_at(2026, 8, 5, 12, 0))
        names = [r["staff_name"] for r in s.today_open(now=_at(2026, 8, 5, 13, 0))]
        self.assertEqual(names, ["Sương"])


class TestStaffIdsWithOpenShift(unittest.TestCase):
    """staff_ids_with_open_shift = 'ai còn ca bấm ra được', khác today_open
    = 'ai đang trong ca'. Hai câu hỏi khác nhau, đừng gộp."""

    def test_includes_open_shift(self):
        s = _store()
        s.punch("S001", "Sương", "a1", now=_at(2026, 8, 5, 7, 0))
        self.assertEqual(s.staff_ids_with_open_shift(now=_at(2026, 8, 5, 13, 0)), ["S001"])

    def test_includes_unclosed_while_today_open_does_not(self):
        """Chốt khác biệt cố ý giữa hai hàm. Nếu gộp lại, người đã nghỉ có ca
        qua đợt quét 04:00 sẽ không bao giờ tự đóng được ca của mình."""
        s = _store()
        s.punch("S001", "Sương", "a1", now=_at(2026, 8, 5, 20, 0))
        s.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        later = _at(2026, 8, 6, 5, 0)
        self.assertEqual(s.staff_ids_with_open_shift(now=later), ["S001"])
        self.assertEqual(s.today_open(now=later), [])

    def test_excludes_closed_shift(self):
        s = _store()
        s.punch("S001", "Sương", "a1", now=_at(2026, 8, 5, 7, 0))
        s.punch("S001", "Sương", "a2", now=_at(2026, 8, 5, 12, 0))
        self.assertEqual(s.staff_ids_with_open_shift(now=_at(2026, 8, 5, 13, 0)), [])

    def test_excludes_unclosed_older_than_window(self):
        s = _store()
        s.punch("S001", "Sương", "a1", now=_at(2026, 7, 29, 7, 0))
        s.sweep_unclosed(now=_at(2026, 7, 30, 4, 0))
        self.assertEqual(s.staff_ids_with_open_shift(now=_at(2026, 8, 5, 7, 0)), [])


class TestMeta(unittest.TestCase):
    def test_missing_key_returns_none(self):
        s = _store()
        self.assertIsNone(s.get_meta("last_daily_run"))

    def test_set_then_get_round_trips(self):
        s = _store()
        s.set_meta("last_daily_run", "2026-08-05")
        self.assertEqual(s.get_meta("last_daily_run"), "2026-08-05")

    def test_setting_same_key_twice_overwrites(self):
        s = _store()
        s.set_meta("last_daily_run", "2026-08-05")
        s.set_meta("last_daily_run", "2026-08-06")
        self.assertEqual(s.get_meta("last_daily_run"), "2026-08-06")
        rows = s.conn.execute(
            "SELECT COUNT(*) c FROM attendance_meta WHERE key='last_daily_run'").fetchone()
        self.assertEqual(rows["c"], 1)


if __name__ == "__main__":
    unittest.main()
