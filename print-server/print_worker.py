# print-server/print_worker.py
"""print_worker.py — one sequential worker per printer draining the spool."""
import logging
import time
from transport import confirm

log = logging.getLogger("print-worker")

class PrintWorker:
    def __init__(self, printer, spool, transport, caps, render, *, setup_preamble=b"",
                 gas_mark=None, alert=None, cold_seconds=20, pacing_s=1.0, orphan_s=30):
        self.printer = printer
        self.spool = spool
        self.transport = transport
        self.caps = caps
        self.render = render
        self.setup_preamble = setup_preamble
        self.gas_mark = gas_mark
        self.alert = alert
        self.cold_seconds = cold_seconds
        self.pacing_s = pacing_s
        self.orphan_s = orphan_s
        self._setup_done = False
        self._last_send = 0.0

    def process_one(self):
        self.spool.recover_orphans(self.printer, self.orphan_s)
        job = self.spool.claim_next(self.printer)
        if job is None:
            return False
        try:
            if self.printer == "label" and self.setup_preamble and not self._setup_done:
                self.transport.send(self.setup_preamble)
                self._setup_done = True
            if self.printer == "receipt" and (time.time() - self._last_send) > self.cold_seconds:
                self.transport.send(b"\x1b@")   # ESC @ wake
                time.sleep(0.3)
            data = self.render(job)
            self.transport.send(data)
            self._last_send = time.time()
            if not confirm(self.transport, self.caps, self.printer, self.pacing_s):
                raise RuntimeError("confirm timeout")
            self.spool.mark_printed(job["id"])
        except Exception as exc:
            self.spool.requeue(job["id"], exc)
            if self.spool.get_status(job["id"]) == "failed" and self.alert:
                self.alert(job, exc)
            return True
        # gas-mark is best-effort and must NEVER revert a printed job (reconciler retries it)
        try:
            if self.gas_mark and self.spool.order_kind_all_printed(job["order_id"], job["kind"]):
                if self.gas_mark(job["order_id"], job["kind"]):
                    self.spool.set_gas_marked(job["order_id"], job["kind"])
        except Exception as exc:
            log.warning("gas-mark failed for %s (%s); reconciler will retry", job["idempotency_key"], exc)
        return True
