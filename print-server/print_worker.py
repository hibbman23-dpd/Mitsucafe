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
        jobs = self.spool.claim_next_batch(self.printer, max_jobs=30)
        if not jobs:
            return False
        try:
            if self.printer == "label":
                tspl_payload = (self.setup_preamble or b"") + b"".join(self.render(j) for j in jobs)
                self.transport.send(tspl_payload)
            else:
                for j in jobs:
                    data = self.render(j)
                    self.transport.send(data)
            self._last_send = time.time()
            total_items = len(jobs)
            if self.printer == "label":
                pacing = max(1.5, total_items * 0.60 + 0.5)
            else:
                pacing = max(1.5, self.pacing_s)
            if not confirm(self.transport, self.caps, self.printer, pacing):
                raise RuntimeError("confirm timeout")
            for j in jobs:
                self.spool.mark_printed(j["id"])
        except Exception as exc:
            for j in jobs:
                self.spool.requeue(j["id"], exc)
                if self.spool.get_status(j["id"]) == "failed" and self.alert:
                    self.alert(j, exc)
            return True

        processed_orders = set()
        for j in jobs:
            try:
                key = (j["order_id"], j["kind"])
                if key not in processed_orders and self.gas_mark and self.spool.order_kind_all_printed(j["order_id"], j["kind"]):
                    processed_orders.add(key)
                    if self.gas_mark(j["order_id"], j["kind"]):
                        self.spool.set_gas_marked(j["order_id"], j["kind"])
            except Exception as exc:
                log.warning("gas-mark failed for %s (%s); reconciler will retry", j["idempotency_key"], exc)
        return True
