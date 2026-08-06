import json, os, stat, tempfile, unittest

from attendance_auth import (StaffCache, RateLimiter, OwnerSessions,
                             hash_pin, load_or_create_salt, _write_600)

_ROWS = [
    {"staff_id": "S001", "name": "Sương", "role": "barista", "active": True, "pin": "1234"},
    {"staff_id": "S000", "name": "Chủ",   "role": "owner",   "active": True, "pin": "9999"},
    {"staff_id": "S009", "name": "Nghỉ",  "role": "barista", "active": False, "pin": "1111"},
]


def _cache():
    c = StaffCache(tempfile.mktemp(suffix=".json"))
    c.replace(_ROWS)
    return c


class TestStaffCache(unittest.TestCase):
    def test_file_is_owner_only(self):
        c = _cache()
        mode = stat.S_IMODE(os.stat(c.path).st_mode)
        self.assertEqual(mode, 0o600)

    def test_file_never_contains_raw_pin(self):
        c = _cache()
        with open(c.path, encoding="utf-8") as f:
            blob = f.read()
        self.assertNotIn("1234", blob)
        self.assertNotIn("9999", blob)
        stored = c.get("S001")["pin_hash"]
        self.assertEqual(stored, hash_pin("1234", c.salt))
        self.assertEqual(len(stored), 64)
        self.assertEqual(stored, stored.lower())
        self.assertTrue(all(ch in "0123456789abcdef" for ch in stored))

    def test_verify_accepts_right_pin(self):
        c = _cache()
        self.assertEqual(c.verify("S001", "1234")["name"], "Sương")

    def test_verify_rejects_wrong_pin(self):
        self.assertIsNone(_cache().verify("S001", "0000"))

    def test_verify_rejects_unknown_staff(self):
        self.assertIsNone(_cache().verify("S404", "1234"))

    def test_verify_rejects_inactive_staff(self):
        self.assertIsNone(_cache().verify("S009", "1111"))

    def test_list_visible_hides_inactive_by_default(self):
        ids = [s["staff_id"] for s in _cache().list_visible([])]
        self.assertEqual(ids, ["S000", "S001"])

    def test_list_visible_includes_inactive_with_open_shift(self):
        """Nhân viên nghỉ việc còn ca chưa đóng vẫn phải bấm ra được."""
        ids = [s["staff_id"] for s in _cache().list_visible(["S009"])]
        self.assertIn("S009", ids)

    def test_list_visible_never_leaks_hash(self):
        for s in _cache().list_visible(["S009"]):
            self.assertNotIn("pin", s)
            self.assertNotIn("pin_hash", s)

    def test_survives_reload_from_disk(self):
        c = _cache()
        again = StaffCache(c.path)
        self.assertIsNotNone(again.verify("S001", "1234"))

    def test_same_pin_different_salt_differs(self):
        self.assertNotEqual(hash_pin("1234", "a"), hash_pin("1234", "b"))

    def test_salt_file_is_owner_only_and_stable(self):
        p = tempfile.mktemp()
        first = load_or_create_salt(p)
        self.assertEqual(stat.S_IMODE(os.stat(p).st_mode), 0o600)
        self.assertEqual(load_or_create_salt(p), first)


class TestEmptyPinNeverAuthenticates(unittest.TestCase):
    """F1: một PIN rỗng không bao giờ được coi là khớp — dù ở nguồn nào."""

    def test_replace_skips_rows_with_empty_pin(self):
        """Dòng STAFF mới thêm luôn rỗng PIN cho tới khi ai đó gõ vào — không
        cache nghĩa là nhân viên đó CHƯA chấm công được, đúng trạng thái an
        toàn cần có."""
        c = StaffCache(tempfile.mktemp(suffix=".json"))
        c.replace([{"staff_id": "S010", "name": "Mới", "role": "barista",
                    "active": True, "pin": ""}])
        self.assertIsNone(c.get("S010"))
        self.assertIsNone(c.verify("S010", ""))

    def test_replace_skips_rows_with_missing_pin_key(self):
        c = StaffCache(tempfile.mktemp(suffix=".json"))
        c.replace([{"staff_id": "S011", "name": "Mới2", "role": "barista",
                    "active": True}])
        self.assertIsNone(c.get("S011"))

    def test_verify_rejects_empty_pin_against_real_staff(self):
        self.assertIsNone(_cache().verify("S001", ""))

    def test_verify_rejects_non_4digit_pin(self):
        c = _cache()
        self.assertIsNone(c.verify("S001", "12"))
        self.assertIsNone(c.verify("S001", "12345"))
        self.assertIsNone(c.verify("S001", "abcd"))
        self.assertIsNone(c.verify("S001", None))

    def test_verify_still_accepts_real_pin(self):
        """Guard mới không được chặn nhầm PIN thật hợp lệ."""
        self.assertEqual(_cache().verify("S001", "1234")["name"], "Sương")

    def test_verify_rejects_empty_pin_even_against_empty_stored_hash(self):
        """Tái hiện đúng bug gốc trong báo cáo review: nếu một pin_hash rỗng
        LỠ lọt vào cache (bỏ qua bước skip ở replace(), ví dụ dữ liệu cũ từ
        trước khi có fix), verify("") vẫn phải bị chặn ở bước kiểm định dạng
        TRƯỚC KHI so hash — không được để nó khớp hash("") == hash("")."""
        p = tempfile.mktemp(suffix=".json")
        salt_path = p + ".salt"
        salt = load_or_create_salt(salt_path)
        rows = [{"staff_id": "S010", "name": "Mới", "role": "barista",
                 "active": True, "pin_hash": hash_pin("", salt)}]
        _write_600(p, json.dumps(rows, ensure_ascii=False))
        c = StaffCache(p, salt_path=salt_path)
        self.assertIsNone(c.verify("S010", ""))


class TestActiveNormalization(unittest.TestCase):
    """Finding 1: string/number `active` values từ Sheets phải được chuẩn hoá
    trong replace() — không được dựa vào Apps Script chuẩn hoá trước."""

    def _row(self, active_value):
        return [{"staff_id": "S001", "name": "Sương", "role": "barista",
                  "active": active_value, "pin": "1234"}]

    def test_string_TRUE_is_active(self):
        c = StaffCache(tempfile.mktemp(suffix=".json"))
        c.replace(self._row("TRUE"))
        self.assertTrue(c.get("S001")["active"])
        self.assertIsNotNone(c.verify("S001", "1234"))

    def test_string_true_lowercase_is_active(self):
        c = StaffCache(tempfile.mktemp(suffix=".json"))
        c.replace(self._row("true"))
        self.assertTrue(c.get("S001")["active"])
        self.assertIsNotNone(c.verify("S001", "1234"))

    def test_string_FALSE_is_inactive(self):
        c = StaffCache(tempfile.mktemp(suffix=".json"))
        c.replace(self._row("FALSE"))
        self.assertFalse(c.get("S001")["active"])
        self.assertIsNone(c.verify("S001", "1234"))

    def test_string_false_lowercase_is_inactive(self):
        c = StaffCache(tempfile.mktemp(suffix=".json"))
        c.replace(self._row("false"))
        self.assertFalse(c.get("S001")["active"])
        self.assertIsNone(c.verify("S001", "1234"))

    def test_empty_string_is_inactive(self):
        c = StaffCache(tempfile.mktemp(suffix=".json"))
        c.replace(self._row(""))
        self.assertFalse(c.get("S001")["active"])
        self.assertIsNone(c.verify("S001", "1234"))

    def test_none_is_inactive(self):
        c = StaffCache(tempfile.mktemp(suffix=".json"))
        c.replace(self._row(None))
        self.assertFalse(c.get("S001")["active"])
        self.assertIsNone(c.verify("S001", "1234"))

    def test_missing_key_is_inactive(self):
        c = StaffCache(tempfile.mktemp(suffix=".json"))
        c.replace([{"staff_id": "S001", "name": "Sương", "role": "barista",
                     "pin": "1234"}])
        self.assertFalse(c.get("S001")["active"])
        self.assertIsNone(c.verify("S001", "1234"))


class TestModeEnforcedOnExistingFile(unittest.TestCase):
    """Finding 4: os.open's mode argument is ignored by the kernel when the
    path already exists (O_TRUNC reopen keeps the old mode) — both helpers
    must chmod explicitly after opening, not rely on the os.open mode arg."""

    def test_write_600_fixes_loose_preexisting_file(self):
        p = tempfile.mktemp(suffix=".json")
        with open(p, "w", encoding="utf-8") as f:
            f.write("stale")
        os.chmod(p, 0o644)
        self.assertEqual(stat.S_IMODE(os.stat(p).st_mode), 0o644)
        _write_600(p, "fresh")
        self.assertEqual(stat.S_IMODE(os.stat(p).st_mode), 0o600)
        with open(p, encoding="utf-8") as f:
            self.assertEqual(f.read(), "fresh")

    def test_load_or_create_salt_new_file_is_0600(self):
        # load_or_create_salt only takes the write branch when the path does
        # not yet exist, so there is no "pre-existing loose file" case to
        # reopen for this helper — the branch we're guarding is still fixed
        # defensively (matches _write_600's pattern), verified here on the
        # normal create path.
        p = tempfile.mktemp()
        load_or_create_salt(p)
        self.assertEqual(stat.S_IMODE(os.stat(p).st_mode), 0o600)


class TestRateLimiter(unittest.TestCase):
    def test_allows_up_to_limit(self):
        rl = RateLimiter(5, 60)
        for i in range(5):
            self.assertTrue(rl.hit("S001", now=1000 + i))

    def test_blocks_past_limit(self):
        rl = RateLimiter(5, 60)
        for i in range(5):
            rl.hit("S001", now=1000 + i)
        self.assertFalse(rl.hit("S001", now=1006))

    def test_window_expires(self):
        rl = RateLimiter(5, 60)
        for i in range(5):
            rl.hit("S001", now=1000 + i)
        self.assertTrue(rl.hit("S001", now=1200))

    def test_keys_are_independent(self):
        rl = RateLimiter(5, 60)
        for i in range(5):
            rl.hit("S001", now=1000 + i)
        self.assertTrue(rl.hit("S002", now=1006))

    def test_ip_limiter_catches_rotating_staff_ids(self):
        """Script thử 1234 cho từng nhân viên không chạm ngưỡng per-staff,
        nhưng phải chạm ngưỡng per-IP."""
        rl = RateLimiter(15, 60)
        for i in range(15):
            rl.hit("192.168.1.77", now=1000 + i)
        self.assertFalse(rl.hit("192.168.1.77", now=1016))

    def test_blocked_zero_under_limit(self):
        rl = RateLimiter(5, 60)
        for i in range(3):
            rl.hit("S001", now=1000 + i)
        self.assertEqual(rl.blocked("S001", now=1003), 0)

    def test_blocked_positive_once_limit_reached(self):
        rl = RateLimiter(5, 60)
        for i in range(5):
            rl.hit("S001", now=1000 + i)
        self.assertGreater(rl.blocked("S001", now=1006), 0)

    def test_blocked_zero_after_window_expires(self):
        rl = RateLimiter(5, 60)
        for i in range(5):
            rl.hit("S001", now=1000 + i)
        self.assertEqual(rl.blocked("S001", now=1200), 0)

    def test_blocked_agrees_with_hit(self):
        rl = RateLimiter(5, 60)
        for i in range(5):
            rl.hit("S001", now=1000 + i)
        self.assertGreater(rl.blocked("S001", now=1006), 0)
        self.assertFalse(rl.hit("S001", now=1006))


class TestOwnerSessions(unittest.TestCase):
    def test_issued_token_resolves(self):
        s = OwnerSessions(ttl_seconds=900)
        token, _ = s.issue("S000", now=1000)
        self.assertEqual(s.resolve(token, now=1100), "S000")

    def test_token_expires_after_ttl(self):
        s = OwnerSessions(ttl_seconds=900)
        token, _ = s.issue("S000", now=1000)
        self.assertIsNone(s.resolve(token, now=1901))

    def test_unknown_token_rejected(self):
        self.assertIsNone(OwnerSessions().resolve("nope", now=1000))

    def test_tokens_are_unique(self):
        s = OwnerSessions()
        a, _ = s.issue("S000", now=1000)
        b, _ = s.issue("S000", now=1000)
        self.assertNotEqual(a, b)


if __name__ == "__main__":
    unittest.main()
