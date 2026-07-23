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

    def test_confirm_resends_query_each_poll(self):
        # I2 regression: confirm() must re-send the status query on every poll,
        # not just rely on the initial probe's solicited reply.
        t = FakeTransport(status_replies=[None, None, b"\x01"])
        self.assertTrue(confirm(t, {"dle_eot"}, "receipt", pacing_s=0.05))
        sent_query_count = sum(1 for s in t.sent if s == b"\x10\x04\x01")
        self.assertGreaterEqual(sent_query_count, 2)


class TestCupsVerifiedSubmit(unittest.TestCase):
    """CupsTransport phải phát hiện job bị CUPS abort (backend USB stall) thay vì tin lpr exit 0."""
    def _make(self, tmp_log_lines):
        import tempfile, os as _os
        from transport import CupsTransport
        t = CupsTransport("TESTP")
        self._log = tempfile.mktemp(suffix=".log")
        with open(self._log, "w") as f:
            f.write("\n".join(tmp_log_lines) + "\n")
        t.error_log_path = self._log
        self.addCleanup(lambda: _os.path.exists(self._log) and _os.remove(self._log))
        return t

    def _patch_subprocess(self, transport_mod, job_id="TESTP-42"):
        calls = []
        class R:
            def __init__(self, out=b""):
                self.stdout = out; self.returncode = 0
        def fake_run(cmd, **kw):
            calls.append(cmd)
            if cmd[0] == "lp":
                return R(f"request id is {job_id} (1 file(s))".encode())
            if cmd[0] == "lpstat":
                return R(b"")          # queue trống ngay
            return R()
        self._orig_run = transport_mod.subprocess.run
        transport_mod.subprocess.run = fake_run
        self.addCleanup(lambda: setattr(transport_mod.subprocess, "run", self._orig_run))
        return calls

    def test_clean_job_returns_bytes(self):
        import transport as tm
        t = self._make(["I [x] normal line"])
        self._patch_subprocess(tm)
        self.assertEqual(t.send(b"DATA"), 4)

    def test_aborted_job_raises(self):
        import transport as tm
        t = self._make([
            "D [23/Jul/2026] [Job 42] Got USB pipe stalled during write",
            "E [23/Jul/2026] [Job 42] Job aborted due to backend errors; please consult...",
        ])
        self._patch_subprocess(tm, job_id="TESTP-42")
        with self.assertRaises(RuntimeError):
            t.send(b"DATA")

    def test_other_jobs_abort_does_not_affect_this_job(self):
        import transport as tm
        t = self._make(["E [x] [Job 41] Job aborted due to backend errors"])
        self._patch_subprocess(tm, job_id="TESTP-42")
        self.assertEqual(t.send(b"DATA"), 4)   # job 41 abort, job 42 sạch
