# print-server/print_worker.py
"""print_worker.py — one sequential worker per printer draining the spool.

Durability contract: a batch is claimed per-order (claim_next_batch), but each
label/receipt is sent, paced and marked 'printed' INDIVIDUALLY. If a send fails
partway through a batch, only the jobs that were NOT yet marked printed are
requeued — an already-printed label is never re-sent on replay.
"""
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
        self.cold_seconds = cold_seconds   # kept for back-compat; no cold-wake logic uses it (USB is always-on)
        self.pacing_s = pacing_s
        self.orphan_s = orphan_s

    def process_one(self):
        self.spool.recover_orphans(self.printer, self.orphan_s)
        jobs = self.spool.claim_next_batch(self.printer, max_jobs=30)
        if not jobs:
            return False

        if self.printer == "label":
            printed = self._send_label_batch(jobs)
        else:
            printed = self._send_receipt_batch(jobs)

        self._gas_mark_batch(printed)
        return True

    def _requeue_from(self, jobs, exc):
        for k in jobs:
            self.spool.requeue(k["id"], exc)
            if self.spool.get_status(k["id"]) == "failed" and self.alert:
                self.alert(k, exc)

    def _send_label_batch(self, jobs):
        # Setup preamble (SIZE/GAP/DENSITY/SPEED/DIRECTION) is sent ONCE per batch
        # (per order) — that is fine per ef7bca3 (that rule is per-LABEL, not per-order).
        if self.setup_preamble:
            try:
                self.transport.send(self.setup_preamble)
            except Exception as exc:
                # Nothing sent yet — requeue the whole batch.
                self._requeue_from(jobs, exc)
                return []

        printed = []
        for i, j in enumerate(jobs):
            try:
                self.transport.send(self.render(j))          # one label (CLS..PRINT, include_header=False)
                time.sleep(self.pacing_s)                      # gap-sensor spacing — replaces batch-level confirm
                self.spool.mark_printed(j["id"])                # mark IMMEDIATELY after this label is sent
                printed.append(j)
            except Exception as exc:
                # Requeue only this job and everything after it; jobs[:i] stay 'printed'.
                self._requeue_from(jobs[i:], exc)
                break
        return printed

    def _send_receipt_batch(self, jobs):
        printed = []
        for i, j in enumerate(jobs):
            try:
                self.transport.send(self.render(j))   # render already embeds ESC @ init
                if not confirm(self.transport, self.caps, "receipt", self.pacing_s):
                    raise RuntimeError("confirm timeout")
                self.spool.mark_printed(j["id"])
                printed.append(j)
            except Exception as exc:
                self._requeue_from(jobs[i:], exc)
                break
        return printed

    def _gas_mark_batch(self, printed_jobs):
        # gas-mark is best-effort and must NEVER revert a printed job (reconciler retries it)
        processed_orders = set()
        for j in printed_jobs:
            try:
                key = (j["order_id"], j["kind"])
                if (key not in processed_orders and self.gas_mark
                        and self.spool.order_kind_all_printed(j["order_id"], j["kind"])):
                    processed_orders.add(key)
                    if self.gas_mark(j["order_id"], j["kind"]):
                        self.spool.set_gas_marked(j["order_id"], j["kind"])
            except Exception as exc:
                log.warning("gas-mark failed for %s (%s); reconciler will retry", j["idempotency_key"], exc)
