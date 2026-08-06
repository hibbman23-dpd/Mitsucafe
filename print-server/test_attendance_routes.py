import os, sqlite3, tempfile, threading, time, unittest
from datetime import datetime, timedelta, timezone
import print_server
from attendance_store import AttendanceStore
from attendance_auth import StaffCache, RateLimiter, OwnerSessions

_VN = timezone(timedelta(hours=7))

_ROWS = [
    {"staff_id": "S001", "name": "Sương", "role": "barista", "active": True, "pin": "1234"},
    {"staff_id": "S000", "name": "Chủ",   "role": "owner",   "active": True, "pin": "9999"},
]


class AttendanceRouteCase(unittest.TestCase):
    def setUp(self):
        print_server.app.config["TESTING"] = True
        self.c = print_server.app.test_client()
        self._db = tempfile.mktemp(suffix=".db")
        conn = sqlite3.connect(self._db, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        # Rebind sang store tạm — nếu không, test sẽ ghi vào attendance.db thật.
        print_server.ATT_STORE = AttendanceStore(conn, threading.Lock())
        print_server.ATT_CACHE = StaffCache(tempfile.mktemp(suffix=".json"))
        print_server.ATT_CACHE.replace(_ROWS)
        print_server.ATT_SESSIONS = OwnerSessions(ttl_seconds=900)
        print_server.ATT_RL_STAFF = RateLimiter(5, 60)
        print_server.ATT_RL_IP = RateLimiter(15, 60)
        # ATT_RL_GLOBAL trước đây KHÔNG được reset ở đây (chỉ STAFF/IP) — hits
        # sai PIN cộng dồn xuyên suốt cả file test. Từ F7, vượt ngưỡng này gọi
        # một thread nền thật (_att_maybe_alert_brute_force); nếu để cộng dồn
        # tới >30 lần giữa các test khác nhau, một test không liên quan có thể
        # bất ngờ khởi một thread nền đúng lúc TestBruteForceAlertDebounce
        # đang monkeypatch print_server._gas_post — hai bên đua nhau ghi/đọc
        # cùng một hàm module-level. Reset mỗi test để cách ly hoàn toàn.
        print_server.ATT_RL_GLOBAL = RateLimiter(30, 60)

    def tearDown(self):
        if os.path.exists(self._db):
            os.remove(self._db)

    def _punch(self, staff_id="S001", pin="1234", nonce="n1", **extra):
        return self.c.post("/attendance/punch",
                           json={"staff_id": staff_id, "pin": pin, "nonce": nonce, **extra})

    def _owner_token(self):
        return self.c.post("/attendance/owner_login",
                           json={"staff_id": "S000", "pin": "9999"}).get_json()["session_token"]


class TestPunchRoute(AttendanceRouteCase):
    def test_punch_in_then_out(self):
        self.assertEqual(self._punch(nonce="a").get_json()["action"], "in")
        # Hai lần bấm cách nhau vài ms nên rơi vào cửa sổ quick-out -> phải xác nhận.
        d = self._punch(nonce="b", confirm_quick_out=True).get_json()
        self.assertEqual(d["action"], "out")
        self.assertEqual(d["row"]["status"], "CLOSED")

    def test_wrong_pin_gives_generic_error(self):
        r = self._punch(pin="0000")
        self.assertEqual(r.status_code, 401)
        body = r.get_json()
        self.assertEqual(body["error"], "PIN không đúng")
        self.assertNotIn("Sương", str(body))

    def test_unknown_staff_gives_same_error_as_wrong_pin(self):
        wrong = self._punch(pin="0000").get_json()
        unknown = self._punch(staff_id="S404").get_json()
        self.assertEqual(wrong["error"], unknown["error"])

    def test_staff_rate_limit_kicks_in(self):
        for _ in range(5):
            self._punch(pin="0000")
        r = self._punch(pin="0000")
        self.assertEqual(r.status_code, 429)

    def test_ip_rate_limit_catches_rotating_staff_ids(self):
        print_server.ATT_CACHE.replace(_ROWS + [
            {"staff_id": "S%03d" % i, "name": "N%d" % i, "role": "barista",
             "active": True, "pin": "5555"} for i in range(10, 20)])
        for i in range(10, 20):
            self._punch(staff_id="S%03d" % i, pin="0000")
        for _ in range(5):
            self._punch(staff_id="S001", pin="0000")
        r = self._punch(staff_id="S000", pin="0000")
        self.assertEqual(r.status_code, 429)

    def test_replayed_nonce_does_not_double_punch(self):
        self._punch(nonce="same")
        again = self._punch(nonce="same").get_json()
        self.assertTrue(again["replay"])
        self.assertEqual(again["action"], "in")

    def test_quick_out_asks_for_confirm_then_closes(self):
        self._punch(nonce="a")
        r = self._punch(nonce="b").get_json()
        self.assertEqual(r["action"], "confirm_needed")
        r2 = self._punch(nonce="c", confirm_quick_out=True).get_json()
        self.assertEqual(r2["action"], "out")

    def test_client_supplied_timestamp_is_ignored(self):
        """Điện thoại chỉnh giờ không được ảnh hưởng bảng công."""
        self._punch(nonce="a", clock_in_at="2020-01-01T00:00:00+07:00")
        rows = print_server.ATT_STORE.conn.execute(
            "SELECT clock_in_at FROM attendance").fetchall()
        self.assertFalse(rows[0]["clock_in_at"].startswith("2020"))


class TestStaffListRoute(AttendanceRouteCase):
    def test_staff_list_has_no_pin_or_hash(self):
        body = self.c.get("/attendance/staff").get_json()
        self.assertNotIn("pin", str(body))
        self.assertNotIn("hash", str(body))

    def test_inactive_staff_with_open_shift_still_listed(self):
        print_server.ATT_CACHE.replace(_ROWS + [
            {"staff_id": "S009", "name": "Nghỉ", "role": "barista",
             "active": True, "pin": "1111"}])
        self._punch(staff_id="S009", pin="1111", nonce="z")
        print_server.ATT_CACHE.replace(_ROWS + [
            {"staff_id": "S009", "name": "Nghỉ", "role": "barista",
             "active": False, "pin": "1111"}])
        ids = [s["staff_id"] for s in self.c.get("/attendance/staff").get_json()["staff"]]
        self.assertIn("S009", ids)

    def test_inactive_staff_with_open_shift_can_punch_out(self):
        print_server.ATT_CACHE.replace(_ROWS + [
            {"staff_id": "S009", "name": "Nghỉ", "role": "barista",
             "active": True, "pin": "1111"}])
        self._punch(staff_id="S009", pin="1111", nonce="z")
        print_server.ATT_CACHE.replace(_ROWS + [
            {"staff_id": "S009", "name": "Nghỉ", "role": "barista",
             "active": False, "pin": "1111"}])
        r = self._punch(staff_id="S009", pin="1111", nonce="z2",
                        confirm_quick_out=True)
        self.assertEqual(r.get_json()["action"], "out")

    def _departed_with_unclosed_shift(self):
        """Nhân viên vào ca, ca qua đợt quét 04:00 thành UNCLOSED, rồi nghỉ việc."""
        from datetime import datetime, timedelta, timezone
        vn = timezone(timedelta(hours=7))
        print_server.ATT_CACHE.replace(_ROWS + [
            {"staff_id": "S009", "name": "Nghỉ", "role": "barista",
             "active": True, "pin": "1111"}])
        self._punch(staff_id="S009", pin="1111", nonce="u1")
        print_server.ATT_STORE.sweep_unclosed(now=datetime.now(vn) + timedelta(days=1))
        print_server.ATT_CACHE.replace(_ROWS + [
            {"staff_id": "S009", "name": "Nghỉ", "role": "barista",
             "active": False, "pin": "1111"}])

    def test_departed_staff_stale_empty_pin_hash_rejected(self):
        """P2d: đường vòng "nhân viên đã nghỉ vẫn đóng được ca treo" tự so
        compare_digest, KHÔNG đi qua StaffCache.verify() nên thiếu guard định
        dạng của verify() (§F1). Một staff_cache.json ghi từ TRƯỚC khi guard
        đó tồn tại (hoặc từ chính __init__ load thẳng file cũ, không qua
        replace()) vẫn có thể còn giữ hash("") — nếu refresh_staff() đang lỗi
        giữa cửa sổ GAS 403 (không viết đè cache), PIN rỗng phải vẫn bị từ
        chối qua đường vòng này, không được khớp ngay hash("") đó."""
        self._departed_with_unclosed_shift()
        from attendance_auth import hash_pin
        stale_row = print_server.ATT_CACHE.get("S009")
        stale_row["pin_hash"] = hash_pin("", print_server.ATT_CACHE.salt)
        r = self._punch(staff_id="S009", pin="", nonce="u3")
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.get_json()["error"], "PIN không đúng")

    def test_departed_staff_with_unclosed_shift_still_listed(self):
        """Hồi quy: /attendance/staff từng lọc bằng today_open (chỉ OPEN) nên
        ca đã qua đợt quét biến mất khỏi lưới tên."""
        self._departed_with_unclosed_shift()
        ids = [s["staff_id"] for s in self.c.get("/attendance/staff").get_json()["staff"]]
        self.assertIn("S009", ids)

    def test_departed_staff_can_close_own_unclosed_shift(self):
        """Hồi quy: PIN đúng từng bị trả 401 y hệt PIN sai, ca treo vĩnh viễn.

        F2: trước fix, bấm ra trên một ca UNCLOSED sẽ ÂM THẦM đóng ngay theo
        giờ tường — đúng hành vi lỗi mà báo cáo review yêu cầu xoá (ca 5 tiếng
        có thể bị tính thành 19 tiếng). Sau fix, client phải nói rõ ý định;
        ở đây intent="close_late" vì người này đã nghỉ việc — xác nhận đã ra
        ca chứ không mở ca mới cho một người không còn đi làm."""
        self._departed_with_unclosed_shift()
        r = self._punch(staff_id="S009", pin="1111", nonce="u2", intent="close_late")
        self.assertEqual(r.status_code, 200)
        body = r.get_json()
        self.assertEqual(body["action"], "close_late")
        self.assertIsNone(body["row"]["minutes_worked"])
        rows = print_server.ATT_STORE.conn.execute(
            "SELECT status FROM attendance WHERE staff_id='S009'").fetchall()
        self.assertEqual(len(rows), 1)          # không đẻ ca rác thứ hai
        # P1: chuyển AWAIT_OWNER (không còn giữ UNCLOSED) — nếu không, lượt
        # bấm TIẾP THEO của chính người này lại nhận đúng câu hỏi UNCLOSED
        # một lần nữa thay vì mở ca mới bình thường.
        self.assertEqual(rows[0]["status"], "AWAIT_OWNER")  # chờ chủ nhập giờ ra thật

    def test_inactive_staff_without_open_shift_cannot_punch_in(self):
        print_server.ATT_CACHE.replace(_ROWS + [
            {"staff_id": "S009", "name": "Nghỉ", "role": "barista",
             "active": False, "pin": "1111"}])
        r = self._punch(staff_id="S009", pin="1111", nonce="z3")
        self.assertEqual(r.status_code, 401)


class TestOwnerRoutes(AttendanceRouteCase):
    def test_owner_login_returns_token(self):
        d = self.c.post("/attendance/owner_login",
                        json={"staff_id": "S000", "pin": "9999"}).get_json()
        self.assertTrue(d["session_token"])

    def test_staff_pin_cannot_get_owner_token(self):
        r = self.c.post("/attendance/owner_login",
                        json={"staff_id": "S001", "pin": "1234"})
        self.assertEqual(r.status_code, 403)

    def test_report_requires_session_header(self):
        r = self.c.get("/attendance/report?from=2026-08-01&to=2026-08-31")
        self.assertEqual(r.status_code, 401)

    def test_report_works_with_session_header(self):
        r = self.c.get("/attendance/report?from=2026-08-01&to=2026-08-31",
                       headers={"X-Owner-Session": self._owner_token()})
        self.assertEqual(r.status_code, 200)
        self.assertIn("by_staff", r.get_json())

    def test_expired_session_gives_401(self):
        print_server.ATT_SESSIONS = OwnerSessions(ttl_seconds=-1)
        token, _ = print_server.ATT_SESSIONS.issue("S000")
        r = self.c.get("/attendance/report?from=2026-08-01&to=2026-08-31",
                       headers={"X-Owner-Session": token})
        self.assertEqual(r.status_code, 401)

    def test_create_manual_then_shows_in_report(self):
        tok = self._owner_token()
        self.c.post("/attendance/create_manual",
                    headers={"X-Owner-Session": tok},
                    json={"staff_id": "S001",
                          "clock_in_at": "2026-08-05T07:00:00+07:00",
                          "clock_out_at": "2026-08-05T15:00:00+07:00",
                          "note": "quên bấm cả hai"})
        rep = self.c.get("/attendance/report?from=2026-08-05&to=2026-08-05",
                         headers={"X-Owner-Session": tok}).get_json()
        self.assertEqual(rep["by_staff"][0]["minutes"], 480)

    def test_create_manual_response_has_no_pin_hash(self):
        """staff = ATT_CACHE.get(...) trả nguyên row nội bộ (gồm pin_hash) —
        route không được serialize thẳng cái đó vào response."""
        tok = self._owner_token()
        r = self.c.post("/attendance/create_manual",
                        headers={"X-Owner-Session": tok},
                        json={"staff_id": "S001",
                              "clock_in_at": "2026-08-05T07:00:00+07:00",
                              "clock_out_at": "2026-08-05T15:00:00+07:00",
                              "note": "quên bấm cả hai"})
        self.assertNotIn("pin_hash", str(r.get_json()))
        self.assertNotIn("pin", str(r.get_json()))

    def test_fix_rejects_out_before_in(self):
        tok = self._owner_token()
        self._punch(nonce="a")
        pid = print_server.ATT_STORE.conn.execute(
            "SELECT punch_id FROM attendance").fetchone()["punch_id"]
        r = self.c.post("/attendance/fix", headers={"X-Owner-Session": tok},
                        json={"punch_id": pid, "note": "sai",
                              "clock_out_at": "2020-01-01T00:00:00+07:00"})
        self.assertEqual(r.status_code, 400)

    def test_fix_rejects_naive_timestamp_with_400_not_500(self):
        """clock_in_at của ca (do server sinh) luôn có offset +07:00 -> aware.
        Nếu chủ gõ clock_out_at KHÔNG offset, so sánh aware-vs-naive ném
        TypeError chứ không phải ValueError — route phải bắt cả hai, trả 400."""
        tok = self._owner_token()
        self._punch(nonce="a")
        pid = print_server.ATT_STORE.conn.execute(
            "SELECT punch_id FROM attendance").fetchone()["punch_id"]
        r = self.c.post("/attendance/fix", headers={"X-Owner-Session": tok},
                        json={"punch_id": pid, "note": "sai",
                              "clock_out_at": "2026-08-05T15:00:00"})
        self.assertEqual(r.status_code, 400)

    def test_create_manual_rejects_naive_timestamp_with_400_not_500(self):
        tok = self._owner_token()
        r = self.c.post("/attendance/create_manual",
                        headers={"X-Owner-Session": tok},
                        json={"staff_id": "S001",
                              "clock_in_at": "2026-08-05T07:00:00+07:00",
                              "clock_out_at": "2026-08-05T15:00:00",
                              "note": "thiếu offset"})
        self.assertEqual(r.status_code, 400)

    def test_today_route_lists_open_shifts(self):
        self._punch(nonce="a")
        d = self.c.get("/attendance/today").get_json()
        self.assertEqual(len(d["open"]), 1)
        self.assertEqual(d["open"][0]["staff_name"], "Sương")

    def test_create_manual_nonce_replay_returns_same_row(self):
        """F8 qua HTTP: form chủ double-submit không được đẻ hai ca."""
        tok = self._owner_token()
        body = {"staff_id": "S001",
                "clock_in_at": "2026-08-05T07:00:00+07:00",
                "clock_out_at": "2026-08-05T15:00:00+07:00",
                "note": "quên bấm cả hai", "nonce": "manual-1"}
        r1 = self.c.post("/attendance/create_manual",
                         headers={"X-Owner-Session": tok}, json=body).get_json()
        r2 = self.c.post("/attendance/create_manual",
                         headers={"X-Owner-Session": tok}, json=body).get_json()
        self.assertEqual(r1["row"]["punch_id"], r2["row"]["punch_id"])
        rows = print_server.ATT_STORE.conn.execute(
            "SELECT COUNT(*) c FROM attendance").fetchone()
        self.assertEqual(rows["c"], 1)

    def test_create_manual_nonce_replay_with_different_times_returns_409(self):
        """P2c qua HTTP: phản hồi lần đầu bị rớt mạng (server đã lưu), chủ sửa
        giờ rồi gửi lại CÙNG nonce cũ — không được trả ok:True kèm row CŨ,
        phải báo xung đột rõ ràng."""
        tok = self._owner_token()
        first = {"staff_id": "S001",
                 "clock_in_at": "2026-08-05T07:00:00+07:00",
                 "clock_out_at": "2026-08-05T15:00:00+07:00",
                 "note": "lần đầu", "nonce": "manual-conflict"}
        r1 = self.c.post("/attendance/create_manual",
                         headers={"X-Owner-Session": tok}, json=first)
        self.assertEqual(r1.status_code, 200)
        second = dict(first, clock_out_at="2026-08-05T16:00:00+07:00")
        r2 = self.c.post("/attendance/create_manual",
                         headers={"X-Owner-Session": tok}, json=second)
        self.assertEqual(r2.status_code, 409)
        self.assertFalse(r2.get_json()["ok"])
        rows = print_server.ATT_STORE.conn.execute(
            "SELECT COUNT(*) c FROM attendance").fetchone()
        self.assertEqual(rows["c"], 1)   # không đẻ ca thứ hai, cũng không âm thầm giữ ca cũ


class TestUnclosedChoiceRoute(AttendanceRouteCase):
    """F2 qua HTTP: ca gần nhất UNCLOSED mà client chưa nói ý định phải được
    hỏi lại, không tự đóng/tự mở ca."""

    def _make_unclosed(self):
        self._punch(nonce="u1")
        self.assertIsNotNone(print_server.ATT_STORE.sweep_unclosed(
            now=datetime.now(_VN) + timedelta(days=1)))

    def test_punch_without_intent_on_unclosed_returns_choose_unclosed(self):
        self._make_unclosed()
        r = self._punch(nonce="u2")
        self.assertEqual(r.status_code, 200)
        body = r.get_json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["action"], "choose_unclosed")
        self.assertEqual(body["row"]["status"], "UNCLOSED")
        self.assertIn("message", body)

    def test_intent_close_late_leaves_minutes_null(self):
        self._make_unclosed()
        body = self._punch(nonce="u2", intent="close_late").get_json()
        self.assertEqual(body["action"], "close_late")
        self.assertIsNone(body["row"]["minutes_worked"])
        # P1: AWAIT_OWNER (không phải UNCLOSED) — vẫn phải hiện trong danh
        # sách ca chưa đóng của chủ (report()["unclosed"]) bên dưới.
        self.assertEqual(body["row"]["status"], "AWAIT_OWNER")
        tok = self._owner_token()
        rep = self.c.get("/attendance/report?from=2026-08-01&to=2026-12-31",
                        headers={"X-Owner-Session": tok}).get_json()
        self.assertEqual(len(rep["unclosed"]), 1)

    def test_intent_close_late_then_evening_punch_opens_normally(self):
        """P1 qua HTTP: sau khi acknowledge (close_late), lượt bấm TIẾP THEO
        của chính người đó phải mở ca mới bình thường, không nhận lại câu hỏi
        UNCLOSED (hồi quy đúng ca 2 trong 3 lỗi báo cáo review)."""
        self._make_unclosed()
        acked = self._punch(nonce="u2", intent="close_late").get_json()
        self.assertEqual(acked["action"], "close_late")
        evening = self._punch(nonce="u3").get_json()
        self.assertEqual(evening["action"], "in")
        self.assertEqual(evening["row"]["status"], "OPEN")

    def test_close_late_with_no_matching_shift_returns_409_not_new_shift(self):
        """P1: intent=close_late khi server không còn ca nào khớp (ví dụ đã
        acknowledge từ trước, hoặc rơi khỏi cửa sổ 24h) không được âm thầm mở
        ca mới thay thế — đây chính là cách ca ma được tạo ra (bấm "Ra ca hôm
        qua" ngoài cửa sổ tạo một dòng OPEN ngay lúc đó, verified trong báo
        cáo review). Phải trả lỗi rõ ràng."""
        self._make_unclosed()
        acked = self._punch(nonce="u2", intent="close_late").get_json()
        self.assertEqual(acked["action"], "close_late")
        r = self._punch(nonce="u4", intent="close_late")
        self.assertEqual(r.status_code, 409)
        self.assertFalse(r.get_json()["ok"])
        rows = print_server.ATT_STORE.conn.execute(
            "SELECT COUNT(*) c FROM attendance WHERE staff_id='S001'").fetchone()
        self.assertEqual(rows["c"], 1)   # không đẻ ca mới nào

    def test_intent_new_shift_opens_second_row(self):
        self._make_unclosed()
        body = self._punch(nonce="u2", intent="new_shift").get_json()
        self.assertEqual(body["action"], "in")
        rows = print_server.ATT_STORE.conn.execute(
            "SELECT status FROM attendance WHERE staff_id='S001'").fetchall()
        self.assertEqual(sorted(row["status"] for row in rows), ["OPEN", "UNCLOSED"])

    def test_invalid_intent_rejected_with_400(self):
        self._make_unclosed()
        r = self._punch(nonce="u2", intent="do_something_else")
        self.assertEqual(r.status_code, 400)

    def test_intent_ignored_for_normal_open_shift(self):
        """Truyền intent trên một ca OPEN bình thường (không phải UNCLOSED)
        không được phá đường đóng ca hiện có."""
        self._punch(nonce="a")
        r = self._punch(nonce="b", confirm_quick_out=True,
                        intent="close_late").get_json()
        self.assertEqual(r["action"], "out")
        self.assertEqual(r["row"]["status"], "CLOSED")


class TestBruteForceAlertDebounce(AttendanceRouteCase):
    """F7: một khi ngưỡng sai PIN toàn hệ thống bị vượt, cảnh báo phải debounce
    còn 1 lần/cửa sổ và KHÔNG được chặn request thread (_gas_post đồng bộ có
    thể mất tới 8s, cùng process còn phục vụ KDS + máy in)."""

    def test_alert_debounced_and_nonblocking(self):
        calls = []
        released = threading.Event()

        def slow_gas(payload, timeout=8):
            calls.append(payload)
            released.wait(2)   # nếu bị gọi đồng bộ trên request thread, test sẽ treo lâu
            return {"ok": True}

        orig_gas_post = print_server._gas_post
        orig_last_sent = print_server._ATT_ALERT_STATE["last_sent"]
        print_server._gas_post = slow_gas
        print_server._ATT_ALERT_STATE["last_sent"] = 0.0
        try:
            start = time.time()
            for _ in range(5):
                print_server._att_maybe_alert_brute_force()
            elapsed = time.time() - start
        finally:
            print_server._gas_post = orig_gas_post
            print_server._ATT_ALERT_STATE["last_sent"] = orig_last_sent
            released.set()
            time.sleep(0.05)   # để thread nền thoát trước khi test kế tiếp chạy
        self.assertLess(elapsed, 1.0)
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
