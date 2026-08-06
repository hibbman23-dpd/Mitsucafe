import sqlite3, tempfile, threading, unittest
from datetime import datetime, timedelta, timezone

from attendance_store import AttendanceStore
from attendance_auth import StaffCache
from attendance_sync import AttendanceSync

_VN = timezone(timedelta(hours=7))


def _at(y, m, d, hh, mm=0):
    return datetime(y, m, d, hh, mm, tzinfo=_VN)


class FakeGas:
    def __init__(self, fail=False, ok_false=False, error="unknown_action"):
        self.calls = []
        self.fail = fail
        self.ok_false = ok_false
        self.error = error

    def __call__(self, payload):
        self.calls.append(payload)
        if self.fail:
            raise RuntimeError("GAS 403")
        if self.ok_false:
            # Apps Script trả HTTP 200 kèm {"ok": false} cho script-lock
            # timeout / unknown_action / unauthorized — KHÔNG phải exception.
            return {"ok": False, "error": self.error}
        return {"ok": True}


def _rig(fail=False, ok_false=False, error="unknown_action"):
    conn = sqlite3.connect(tempfile.mktemp(suffix=".db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    store = AttendanceStore(conn, threading.Lock())
    cache = StaffCache(tempfile.mktemp(suffix=".json"))
    gas = FakeGas(fail=fail, ok_false=ok_false, error=error)
    return store, cache, gas, AttendanceSync(store, cache, gas)


class TestPush(unittest.TestCase):
    def test_pushes_only_unsynced_rows(self):
        store, _, gas, sync = _rig()
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 7, 0))
        self.assertEqual(sync.push_once(), 1)
        self.assertEqual(sync.push_once(), 0)
        self.assertEqual(len(gas.calls), 1)

    def test_upsert_payload_carries_punch_id(self):
        store, _, gas, sync = _rig()
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 7, 0))
        sync.push_once()
        self.assertEqual(gas.calls[0]["action"], "attendance_upsert")
        self.assertTrue(gas.calls[0]["row"]["punch_id"].startswith("ATT-"))

    def test_closing_shift_marks_row_dirty_again(self):
        store, _, _, sync = _rig()
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 7, 0))
        sync.push_once()
        store.punch("S001", "Sương", "b", now=_at(2026, 8, 5, 15, 0))
        self.assertEqual(sync.push_once(), 1)

    def test_gas_failure_leaves_row_pending(self):
        store, _, _, sync = _rig(fail=True)
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 7, 0))
        self.assertEqual(sync.push_once(), 0)
        pending = store.conn.execute(
            "SELECT COUNT(*) c FROM attendance WHERE synced_at IS NULL").fetchone()
        self.assertEqual(pending["c"], 1)

    def test_ok_false_response_leaves_row_pending_and_logs(self):
        """F3: Apps Script trả HTTP 200 kèm {"ok": false} (script-lock timeout,
        unknown_action, unauthorized...) — KHÔNG phải exception nên trước fix
        push_once() coi đó là thành công, đánh dấu synced, ca biến mất khỏi
        hàng chờ mà chưa bao giờ thực sự lên Sheets."""
        store, _, gas, sync = _rig(ok_false=True, error="unknown_action")
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 7, 0))
        with self.assertLogs("attendance_sync", level="WARNING") as cm:
            self.assertEqual(sync.push_once(), 0)
        pending = store.conn.execute(
            "SELECT COUNT(*) c FROM attendance WHERE synced_at IS NULL").fetchone()
        self.assertEqual(pending["c"], 1)
        self.assertTrue(any("unknown_action" in m for m in cm.output))


class TestStaffRefresh(unittest.TestCase):
    def test_refresh_writes_cache_without_raw_pin(self):
        _, cache, _, sync = _rig()
        sync.poster = lambda payload: {"ok": True, "staff": [
            {"staff_id": "S001", "name": "Sương", "role": "barista",
             "active": True, "pin": "1234"}]}
        self.assertEqual(sync.refresh_staff(), 1)
        with open(cache.path, encoding="utf-8") as f:
            self.assertNotIn("1234", f.read())
        self.assertIsNotNone(cache.verify("S001", "1234"))

    def test_refresh_failure_keeps_old_cache(self):
        _, cache, _, sync = _rig(fail=True)
        cache.replace([{"staff_id": "S001", "name": "Sương", "role": "barista",
                        "active": True, "pin": "1234"}])
        self.assertEqual(sync.refresh_staff(), 0)
        self.assertIsNotNone(cache.verify("S001", "1234"))

    def test_refresh_ok_false_keeps_old_cache_and_logs(self):
        _, cache, gas, sync = _rig(ok_false=True, error="unauthorized")
        cache.replace([{"staff_id": "S001", "name": "Sương", "role": "barista",
                        "active": True, "pin": "1234"}])
        with self.assertLogs("attendance_sync", level="WARNING") as cm:
            self.assertEqual(sync.refresh_staff(), 0)
        self.assertIsNotNone(cache.verify("S001", "1234"))
        self.assertTrue(any("unauthorized" in m for m in cm.output))


class TestEod(unittest.TestCase):
    def test_eod_text_built_from_sqlite_not_sheets(self):
        store, _, gas, sync = _rig()
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 7, 0))
        store.punch("S001", "Sương", "b", now=_at(2026, 8, 5, 15, 0))
        text = sync.eod_text("2026-08-05")
        self.assertIn("Sương", text)
        self.assertIn("8h00", text)
        self.assertEqual(gas.calls, [])   # dựng text không cần gọi Sheets

    def test_eod_text_flags_unclosed(self):
        store, _, _, sync = _rig()
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 7, 0))
        store.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        self.assertIn("chưa đóng", sync.eod_text("2026-08-05"))

    def test_eod_text_surfaces_edit_note_for_acknowledged_shift(self):
        """P1: acknowledge (AWAIT_OWNER) trước đây vô hình với chủ — edit_note
        tồn tại trong DB nhưng không hiện ở đâu cả, chủ không cách nào phân
        biệt dòng nào nhân viên đã confirm với dòng UNCLOSED thô chưa ai đụng
        vào. eod_text phải in ra edit_note để chủ biết vì sao/ai đã xác nhận."""
        store, _, _, sync = _rig()
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 21, 0))
        store.sweep_unclosed(now=_at(2026, 8, 6, 4, 0))
        store.punch("S001", "Sương", "b", intent="close_late", now=_at(2026, 8, 6, 10, 0))
        text = sync.eod_text("2026-08-05")
        self.assertIn("xác nhận đã ra ca", text)

    def test_send_eod_goes_through_gas_relay(self):
        store, _, gas, sync = _rig()
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 7, 0))
        store.punch("S001", "Sương", "b", now=_at(2026, 8, 5, 15, 0))
        self.assertTrue(sync.send_eod("2026-08-05"))
        alert = [c for c in gas.calls if c["action"] == "attendance_alert"]
        self.assertEqual(len(alert), 1)
        self.assertIn("Sương", alert[0]["text"])

    def test_send_eod_ok_false_returns_false_and_logs(self):
        store, _, gas, sync = _rig(ok_false=True, error="unknown_action")
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 7, 0))
        with self.assertLogs("attendance_sync", level="WARNING") as cm:
            self.assertFalse(sync.send_eod("2026-08-05"))
        self.assertTrue(any("unknown_action" in m for m in cm.output))

    def test_run_daily_sweeps_then_alerts(self):
        store, _, gas, sync = _rig()
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 7, 0))
        out = sync.run_daily(now=_at(2026, 8, 6, 4, 0))
        self.assertEqual(out["swept"], 1)
        self.assertTrue(out["alerted"])
        self.assertFalse(out["skipped"])


class TestRunDailyMarkerOnlyOnSuccess(unittest.TestCase):
    """F4: marker `last_daily_run` không được đốt nếu cảnh báo cuối ngày gửi
    thất bại — nếu không, GAS đang ở cửa sổ 403 (project_gas_oauth_7day) sẽ
    làm chủ mất luôn thông báo ca UNCLOSED, không có cơ hội retry ở lần chạy
    tiếp theo trong cùng ngày."""

    def test_marker_not_set_when_alert_raises(self):
        store, _, gas, sync = _rig(fail=True)
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 7, 0))
        now = _at(2026, 8, 6, 4, 0)
        out = sync.run_daily(now=now)
        self.assertFalse(out["alerted"])
        self.assertFalse(out["skipped"])
        self.assertIsNone(store.get_meta(sync._DAILY_MARKER_KEY))

    def test_marker_not_set_on_ok_false_and_next_run_retries(self):
        store, _, gas, sync = _rig(ok_false=True, error="unauthorized")
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 7, 0))
        now = _at(2026, 8, 6, 4, 0)
        first = sync.run_daily(now=now)
        self.assertFalse(first["alerted"])
        # Marker chưa bị đốt -> lần chạy kế tiếp CÙNG ngày phải retry, không
        # bị skip (sweep vẫn idempotent nên chạy lại vô hại).
        second = sync.run_daily(now=now)
        self.assertFalse(second["skipped"])
        self.assertFalse(second["alerted"])

    def test_marker_set_once_alert_finally_succeeds(self):
        store, cache, gas, sync = _rig(ok_false=True, error="unauthorized")
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 7, 0))
        now = _at(2026, 8, 6, 4, 0)
        sync.run_daily(now=now)
        gas.ok_false = False   # GAS hồi phục
        out = sync.run_daily(now=now)
        self.assertTrue(out["alerted"])
        self.assertEqual(store.get_meta(sync._DAILY_MARKER_KEY),
                         now.strftime("%Y-%m-%d"))


class TestRunDailyOncePerDay(unittest.TestCase):
    """Marker phải sống trong SQLite, không phải biến in-memory: print_server
    restart thường xuyên (mỗi lần deploy) và một restart sau 04:00 KHÔNG được
    làm job 04:00 chạy lại — nếu không, cảnh báo Telegram cuối ngày gửi trùng
    lần 2 tới điện thoại chủ."""

    def test_second_call_same_day_is_skipped_no_double_alert(self):
        store, _, gas, sync = _rig()
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 7, 0))
        now = _at(2026, 8, 6, 4, 0)
        first = sync.run_daily(now=now)
        second = sync.run_daily(now=now)
        self.assertFalse(first["skipped"])
        self.assertTrue(second["skipped"])
        self.assertEqual(second["swept"], 0)
        alerts = [c for c in gas.calls if c["action"] == "attendance_alert"]
        self.assertEqual(len(alerts), 1)

    def test_restart_with_fresh_sync_over_same_store_still_skips(self):
        """Hồi quy đúng bug thật: quá trình restart mất biến in-memory
        `last_daily`, nhưng store (SQLite) sống sót — dựng AttendanceSync MỚI
        trên CÙNG connection để mô phỏng restart, gọi lại run_daily cùng
        `now` và phải bị skip."""
        store, cache, gas, sync = _rig()
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 7, 0))
        now = _at(2026, 8, 6, 4, 0)
        sync.run_daily(now=now)

        restarted_sync = AttendanceSync(store, cache, gas)   # process "restart"
        out = restarted_sync.run_daily(now=now)

        self.assertTrue(out["skipped"])
        alerts = [c for c in gas.calls if c["action"] == "attendance_alert"]
        self.assertEqual(len(alerts), 1)

    def test_next_day_is_not_skipped_and_alerts_again(self):
        store, _, gas, sync = _rig()
        store.punch("S001", "Sương", "a", now=_at(2026, 8, 5, 7, 0))
        sync.run_daily(now=_at(2026, 8, 6, 4, 0))

        # F2: sau sweep, ca "a" là UNCLOSED — bấm lại KHÔNG có intent giờ raise
        # UnclosedChoice thay vì âm thầm đóng/mở lại (đúng lỗi báo cáo review
        # yêu cầu xoá). Test này vốn muốn mở CA MỚI của ngày 06, nên nêu rõ
        # intent="new_shift" — không phải xác nhận ca cũ.
        store.punch("S001", "Sương", "b", now=_at(2026, 8, 6, 7, 0), intent="new_shift")
        out = sync.run_daily(now=_at(2026, 8, 7, 4, 0))

        self.assertFalse(out["skipped"])
        self.assertTrue(out["alerted"])
        alerts = [c for c in gas.calls if c["action"] == "attendance_alert"]
        self.assertEqual(len(alerts), 2)


if __name__ == "__main__":
    unittest.main()
