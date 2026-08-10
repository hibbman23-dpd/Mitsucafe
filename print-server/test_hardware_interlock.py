"""Chốt an toàn: test KHÔNG BAO GIỜ được chạm máy in thật.

09/08/2026: một lượt `python3 -m unittest discover` chạy trên máy quán đẩy 17
job bill test vào hàng đợi CUPS. Máy in lúc đó offline nên chúng nằm im; sáng
hôm sau chủ quán bật máy in, CUPS xả hết ra giấy — bill toàn món trong fixture
test, không phải bill quán. CUPS backend giữ luôn USB nên print server thật
nhận [Errno 13] Access denied, bill khách in không được.

Trước đó guard PRINT_ENGINE=noop chỉ được đặt rải rác ở từng file test — ai
thêm file mới mà quên là thủng. Chốt phải nằm ở tầng chạm phần cứng.
"""
import os
import unittest

import print_server


class TestHardwareInterlock(unittest.TestCase):
    def test_detects_this_very_test_run(self):
        # Chính test này đang chạy dưới unittest -> phải bị chặn.
        self.assertTrue(print_server._under_test_runner())

    def test_send_refuses_to_touch_hardware(self):
        calls = []
        for fn in ("_send_cups", "_send_usb", "_send_serial", "_send_tcp"):
            setattr(print_server, fn, lambda *a, **k: calls.append(fn) or 999)
        n = print_server._send("cups", "1.2.3.4", 9100, "/dev/null", 9600, b"BILL TEST")
        self.assertEqual(n, 0, "phải trả 0 byte, không gửi gì")
        self.assertEqual(calls, [], "không transport nào được gọi")

    def test_drawer_kick_refuses(self):
        # _kick_cash_drawer dùng `import subprocess` CỤC BỘ trong thân hàm, nên vá
        # vào globals của module không ăn — phải vá subprocess.run thật. Chính lỗ
        # này đã bắn một xung mở két thật ra CUPS lúc 09:31 ngày 10/08 khi test
        # chạy trước lúc có chốt.
        import subprocess
        hits = []
        real = subprocess.run
        subprocess.run = lambda *a, **k: hits.append(1)
        try:
            print_server._kick_cash_drawer()
        finally:
            subprocess.run = real
        self.assertEqual(hits, [], "không được mở két thật trong test")

    def test_override_lets_hardware_validation_through(self):
        os.environ["ALLOW_REAL_PRINT_IN_TESTS"] = "1"
        try:
            self.assertFalse(print_server._under_test_runner())
        finally:
            del os.environ["ALLOW_REAL_PRINT_IN_TESTS"]


if __name__ == "__main__":
    unittest.main()
