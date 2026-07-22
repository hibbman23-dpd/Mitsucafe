import unittest
from transport import Transport, FakeTransport

class TestFakeTransport(unittest.TestCase):
    def test_records_sends(self):
        t = FakeTransport()
        t.open()
        self.assertEqual(t.send(b"AAA"), 3)
        self.assertEqual(t.send(b"BB"), 2)
        self.assertEqual(t.sent, [b"AAA", b"BB"])
        t.close()

    def test_drop_after(self):
        t = FakeTransport(drop_after=1)
        t.send(b"one")                          # ok (1st)
        with self.assertRaises(RuntimeError):
            t.send(b"two")                      # 2nd exceeds drop_after=1

    def test_read_status_scripted(self):
        t = FakeTransport(status_replies=[b"\x00", None])
        self.assertEqual(t.read_status(0.2), b"\x00")
        self.assertIsNone(t.read_status(0.2))

    def test_base_defaults(self):
        t = Transport()
        self.assertIsNone(t.read_status(0.1))
        self.assertEqual(t.capabilities(), set())

import time
from transport import probe_capabilities, confirm

class TestProbeConfirm(unittest.TestCase):
    def test_probe_receipt_with_reply(self):
        t = FakeTransport(status_replies=[b"\x12"])
        caps = probe_capabilities(t, "receipt")
        self.assertIn("dle_eot", caps)
        self.assertEqual(t.sent[0], b"\x10\x04\x01")   # DLE EOT 1 was sent

    def test_probe_receipt_mute_printer(self):
        t = FakeTransport(status_replies=[])           # no reply
        self.assertEqual(probe_capabilities(t, "receipt"), set())

    def test_confirm_pacing_path_returns_true(self):
        t = FakeTransport()
        start = time.time()
        self.assertTrue(confirm(t, set(), "label", pacing_s=0.05))
        self.assertGreaterEqual(time.time() - start, 0.05)

    def test_confirm_status_path_true_on_reply(self):
        t = FakeTransport(status_replies=[b"\x00"])
        self.assertTrue(confirm(t, {"dle_eot"}, "receipt", pacing_s=0.05))

    def test_confirm_status_path_false_on_timeout(self):
        t = FakeTransport(status_replies=[])           # never replies
        self.assertFalse(confirm(t, {"dle_eot"}, "receipt", pacing_s=0.05))
