"""transport.py — printer transport abstraction (send + optional status back-channel)."""
import subprocess

class Transport:
    def open(self): ...
    def send(self, data: bytes) -> int:
        raise NotImplementedError
    def read_status(self, timeout: float):
        return None
    def capabilities(self):
        return set()
    def close(self): ...

class CupsTransport(Transport):
    def __init__(self, printer_name: str):
        self.printer_name = printer_name
    def send(self, data: bytes) -> int:
        subprocess.run(["lpr", "-P", self.printer_name, "-o", "raw"],
                       input=data, capture_output=True, check=True, timeout=20)
        return len(data)

class FakeTransport(Transport):
    def __init__(self, status_replies=None, drop_after=None):
        self.sent = []
        self._status = list(status_replies or [])
        self._drop_after = drop_after
        self._caps = set()
        self.opened = False
        self.closed = False
    def open(self):
        self.opened = True
    def send(self, data: bytes) -> int:
        if self._drop_after is not None and len(self.sent) >= self._drop_after:
            raise RuntimeError("simulated drop")
        self.sent.append(bytes(data))
        return len(data)
    def read_status(self, timeout: float):
        return self._status.pop(0) if self._status else None
    def capabilities(self):
        return set(self._caps)
    def close(self):
        self.closed = True
