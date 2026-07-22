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
