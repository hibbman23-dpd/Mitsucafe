"""online_inbox.py — pull mitsu.cafe orders from the GAS mailbox, hold them for
staff to accept. Internet-outage tolerant: on fetch failure it flags offline and
keeps pending items so the next successful poll catches up. Dedupe by online_order_id.
"""
import threading


class OnlineInbox:
    def __init__(self, store, fetch_fn):
        self.store = store
        self.fetch_fn = fetch_fn
        self._pending = {}          # online_order_id -> payload
        self._accepted = set()      # online_order_ids already accepted (idempotency)
        self._online = False
        self._lock = threading.Lock()

    def poll(self):
        try:
            payloads = self.fetch_fn() or []
            with self._lock:
                self._online = True
                for p in payloads:
                    oid = p.get("online_order_id")
                    if oid and oid not in self._accepted:
                        self._pending.setdefault(oid, p)
        except Exception:
            with self._lock:
                self._online = False
        return self.status()

    def pending(self):
        with self._lock:
            return list(self._pending.values())

    def accept(self, online_order_id, order_dict):
        """Consume a pending online order. Idempotent: accepting an id that is not
        currently pending (already accepted, or never polled) is a no-op returning
        accepted=False and does NOT blacklist it — so an id the mailbox delivers
        later still surfaces via poll()."""
        with self._lock:
            if online_order_id not in self._pending:
                return {"accepted": False}
            self._pending.pop(online_order_id, None)
            self._accepted.add(online_order_id)
        return {"accepted": True}

    def status(self):
        with self._lock:
            return {"online": self._online, "pending_count": len(self._pending)}
