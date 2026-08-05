import os, stat, tempfile, unittest

from attendance_auth import (StaffCache, RateLimiter, OwnerSessions,
                             hash_pin, load_or_create_salt)

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
