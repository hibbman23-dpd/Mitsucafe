"""transport.py — printer transport abstraction (send + optional status back-channel)."""
import logging
import os
import socket
import subprocess
import time

log = logging.getLogger("transport")

_usb_handles = {}   # (vid,pid) -> pyusb device, module-level to survive GC/IOKit reclaim

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

class UsbTransport(Transport):
    CHUNK = 512
    CHUNK_DELAY = 0.02
    def __init__(self, vid, pid, ep_out, ep_in=0x81):
        self.vid, self.pid, self.ep_out, self.ep_in = vid, pid, ep_out, ep_in
        self._dev = None
    def open(self):
        os.environ.setdefault("DYLD_LIBRARY_PATH", "/opt/homebrew/lib")
        import usb.core
        dev = _usb_handles.get((self.vid, self.pid))
        if dev is not None:
            try:
                dev.is_kernel_driver_active(0); self._dev = dev; return
            except Exception:
                _usb_handles.pop((self.vid, self.pid), None)
        dev = usb.core.find(idVendor=self.vid, idProduct=self.pid)
        if dev is None:
            raise RuntimeError(f"USB printer {self.vid:#06x}:{self.pid:#06x} not found")
        try:
            if dev.is_kernel_driver_active(0):
                dev.detach_kernel_driver(0)
        except Exception:
            pass
        dev.set_configuration()
        _usb_handles[(self.vid, self.pid)] = dev
        self._dev = dev
    def send(self, data: bytes) -> int:
        if self._dev is None:
            self.open()

        def _write_all(payload: bytes) -> int:
            total = 0
            for i in range(0, len(payload), self.CHUNK):
                total += self._dev.write(self.ep_out, payload[i:i + self.CHUNK], timeout=10000)
                if i + self.CHUNK < len(payload):
                    time.sleep(self.CHUNK_DELAY)
            return total

        try:
            return _write_all(data)
        except Exception as exc:
            log.warning("USB write failed (%s), clearing handle and retrying...", exc)
            _usb_handles.pop((self.vid, self.pid), None)
            self._dev = None
            self.open()
            return _write_all(data)
    def read_status(self, timeout: float):
        try:
            arr = self._dev.read(self.ep_in, 64, timeout=int(timeout * 1000))
            return bytes(arr) if len(arr) else None
        except Exception:
            return None
    def close(self):
        self._dev = None   # keep module-level handle; just drop local ref

class TcpTransport(Transport):
    def __init__(self, ip, port=9100, timeout=5):
        self.ip, self.port, self.timeout = ip, port, timeout
        self._sock = None
    def open(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(self.timeout)
        try:
            sock.connect((self.ip, self.port))
        except Exception:
            sock.close()
            raise
        self._sock = sock
    def send(self, data: bytes) -> int:
        if self._sock is None:
            self.open()
        self._sock.sendall(data)
        return len(data)
    def read_status(self, timeout: float):
        try:
            self._sock.settimeout(timeout)
            b = self._sock.recv(64)
            return b or None
        except Exception:
            return None
    def close(self):
        if self._sock:
            try: self._sock.close()
            except Exception: pass
            self._sock = None

class SerialTransport(Transport):
    def __init__(self, port, baud=9600):
        self.port, self.baud = port, baud
        self._s = None
    def open(self):
        import serial
        self._s = serial.Serial(self.port, self.baud, timeout=10)
        time.sleep(1.0)
    def send(self, data: bytes) -> int:
        if self._s is None:
            self.open()
        n = self._s.write(data); self._s.flush(); time.sleep(0.5)
        return n
    def close(self):
        if self._s:
            try: self._s.close()
            except Exception: pass
            self._s = None

def build_transport(kind, cfg):
    try:
        if kind == "cups":
            return CupsTransport(cfg["cups_printer"])
        if kind == "usb":
            t = UsbTransport(cfg["vid"], cfg["pid"], cfg["ep_out"], cfg.get("ep_in", 0x81))
        elif kind == "tcp":
            t = TcpTransport(cfg["ip"], cfg.get("port", 9100))
        elif kind == "serial":
            t = SerialTransport(cfg["serial_port"], cfg.get("baud", 9600))
        else:
            return CupsTransport(cfg["cups_printer"])
        t.open()
        return t
    except Exception as exc:
        log.warning("transport %s open failed (%s) → CupsTransport fallback", kind, exc)
        return CupsTransport(cfg["cups_printer"])
