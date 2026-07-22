"""transport.py — printer transport abstraction (send + optional status back-channel)."""
import subprocess
import time

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

def probe_capabilities(transport, printer_kind):
    try:
        if printer_kind == "receipt":
            transport.send(b"\x10\x04\x01")            # DLE EOT 1
            return {"dle_eot"} if transport.read_status(0.2) else set()
        else:  # label / TSPL
            transport.send(b"\r\n\r\n")
            return {"tspl_status"} if transport.read_status(0.2) else set()
    except Exception:
        return set()

def confirm(transport, caps, printer_kind, pacing_s):
    if caps & {"dle_eot", "tspl_status"}:
        deadline = time.time() + max(pacing_s, 2.0)
        while time.time() < deadline:
            st = transport.read_status(0.2)
            if st:
                return True
            time.sleep(0.05)
        return False
    time.sleep(pacing_s)
    return True
