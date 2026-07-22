"""
print_server.py — Flask server trên Mac Mini/RPi.

Nhận ESC/POS raw bytes từ GAS → forward tới Xprinter.

Endpoints:
  POST /print/label    → XP-365B  (tem dán cốc 50×30mm)
  POST /print/receipt  → POS-58L  (hóa đơn 58mm)
  POST /print          → backward-compat → /print/receipt
  GET  /health         → status cả 2 máy in
  GET  /test/receipt   → in test page cứng (dùng để debug BT)
  GET  /test/label     → in test label cứng (dùng để debug TCP)

Mỗi printer hỗ trợ 2 mode kết nối — chọn bằng env:
  MODE=tcp     → TCP socket LAN (mặc định, cần IP)
  MODE=serial  → Bluetooth hoặc USB serial port

ENV vars:
  --- POS-58L (receipt) ---
  RECEIPT_MODE           tcp | serial | usb    (default: serial)
  RECEIPT_PRINTER_IP     IP LAN của POS-58L    (tcp mode, default: 192.168.1.50)
  RECEIPT_PRINTER_PORT   RAW port              (tcp mode, default: 9100)
  RECEIPT_SERIAL_PORT    /dev/cu.RPP02N        (serial mode)
  RECEIPT_SERIAL_BAUD    9600                  (serial mode, default: 9600)

  --- XP-365B (label) ---
  LABEL_MODE             tcp | serial          (default: tcp)
  LABEL_PRINTER_IP       IP LAN của XP-365B    (tcp mode, default: 192.168.1.51)
  LABEL_PRINTER_PORT     RAW port              (tcp mode, default: 9100)
  LABEL_SERIAL_PORT      /dev/cu.XP365B        (serial mode)
  LABEL_SERIAL_BAUD      9600                  (serial mode, default: 9600)

  --- Server ---
  SERVER_PORT            Flask listen port     (default: 5001)
  SOCKET_TIMEOUT         TCP timeout giây      (default: 5)
  SERIAL_CONNECT_WAIT    Giây chờ BT handshake (default: 3.0)
  SERIAL_DRAIN_WAIT      Giây chờ sau write    (default: 2.0)

Chạy thử:
    SERVER_PORT=5001 RECEIPT_MODE=serial RECEIPT_SERIAL_PORT=/dev/cu.RPP02N python3 print_server.py

Test debug:
    curl http://localhost:5001/test/receipt
    curl http://localhost:5001/health
"""

import logging
import os
import socket
import time

from flask import Flask, jsonify, request

# ── Config ────────────────────────────────────────────────────────────────────
RECEIPT_MODE        = os.getenv("RECEIPT_MODE",        "cups")
RECEIPT_PRINTER_IP  = os.getenv("RECEIPT_PRINTER_IP",  "192.168.1.50")
RECEIPT_PRINTER_PORT= int(os.getenv("RECEIPT_PRINTER_PORT", "9100"))
RECEIPT_SERIAL_PORT = os.getenv("RECEIPT_SERIAL_PORT", "/dev/cu.RPP02N")
RECEIPT_SERIAL_BAUD = int(os.getenv("RECEIPT_SERIAL_BAUD", "9600"))
RECEIPT_CUPS_PRINTER= os.getenv("RECEIPT_CUPS_PRINTER", "GEZHI_POS_Printer")

LABEL_MODE          = os.getenv("LABEL_MODE",          "tcp")
LABEL_PRINTER_IP    = os.getenv("LABEL_PRINTER_IP",    "192.168.1.51")
LABEL_PRINTER_PORT  = int(os.getenv("LABEL_PRINTER_PORT",   "9100"))
LABEL_SERIAL_PORT   = os.getenv("LABEL_SERIAL_PORT",   "/dev/cu.XP365B")
LABEL_SERIAL_BAUD   = int(os.getenv("LABEL_SERIAL_BAUD",   "9600"))

SERVER_PORT          = int(os.getenv("SERVER_PORT",          "5001"))
SOCKET_TIMEOUT       = float(os.getenv("SOCKET_TIMEOUT",      "5"))
SERIAL_CONNECT_WAIT  = float(os.getenv("SERIAL_CONNECT_WAIT", "3.0"))
SERIAL_DRAIN_WAIT    = float(os.getenv("SERIAL_DRAIN_WAIT",   "2.0"))

# USB Printer class (mode=usb) — VID:PID của RPP02N khi cắm USB
RECEIPT_USB_VID      = int(os.getenv("RECEIPT_USB_VID", "10473"))   # 0x28E9
RECEIPT_USB_PID      = int(os.getenv("RECEIPT_USB_PID", "649"))     # 0x0289
LABEL_USB_VID        = int(os.getenv("LABEL_USB_VID",   "0"))
LABEL_USB_PID        = int(os.getenv("LABEL_USB_PID",   "0"))
RECEIPT_USB_EP       = int(os.getenv("RECEIPT_USB_EP",  "1"))   # EP OUT cho POS-58L
LABEL_USB_EP         = int(os.getenv("LABEL_USB_EP",    "2"))   # EP OUT cho XP-365B

_LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, _LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("print-server")

import urllib.request
import ssl
from gateway import Gateway
from printlib import build_label_tspl, build_receipt

app = Flask(__name__)

GATEWAY = Gateway(
    os.getenv("GATEWAY_DB", os.path.join(os.path.dirname(__file__), "outbox.db")),
    os.getenv("GAS_WEBAPP_URL", ""),
    os.getenv("REPORT_API_TOKEN", ""),
)

def _now_iso_server():
    from datetime import datetime, timezone, timedelta
    return datetime.now(timezone(timedelta(hours=7))).isoformat()

def _print_label_bytes(data: bytes) -> int:
    return _label_send(data)["bytes"]

def _print_receipt_bytes(data: bytes) -> int:
    return _send(RECEIPT_MODE, RECEIPT_PRINTER_IP, RECEIPT_PRINTER_PORT,
                 RECEIPT_SERIAL_PORT, RECEIPT_SERIAL_BAUD, data,
                 usb_vid=RECEIPT_USB_VID, usb_pid=RECEIPT_USB_PID,
                 usb_ep=RECEIPT_USB_EP, cups_printer=RECEIPT_CUPS_PRINTER)

def _gas_post(payload: dict, timeout=8) -> dict:
    body = json.dumps({**payload, "token": GATEWAY.token}).encode()
    req = urllib.request.Request(GATEWAY.gas_url, data=body,
          headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context()) as r:
        return json.loads(r.read().decode())


# ── Send helpers ─────────────────────────────────────────────────────────────
def _send_tcp(ip: str, port: int, data: bytes) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(SOCKET_TIMEOUT)
        sock.connect((ip, port))
        sock.sendall(data)
    return len(data)


def _send_serial(port: str, baud: int, data: bytes) -> int:
    import serial  # pyserial — lazy import
    log.debug("SERIAL open %s @%d baud, %d bytes", port, baud, len(data))
    log.debug("SERIAL first 32 bytes: %s", data[:32].hex())
    with serial.Serial(port, baud, timeout=10, xonxoff=False, rtscts=False) as s:
        time.sleep(SERIAL_CONNECT_WAIT)   # chờ BT RFCOMM handshake ổn định
        log.debug("SERIAL writing %d bytes (CTS=%s DSR=%s)", len(data), s.cts, s.dsr)
        s.write(data)
        s.flush()
        time.sleep(SERIAL_DRAIN_WAIT)     # chờ BT stack flush hết data
    log.debug("SERIAL port closed OK")
    return len(data)


# ── Persistent USB handle ────────────────────────────────────────────────────
# Giữ device handle ở module-level để Python không GC → IOKit không reclaim.
# macOS: mỗi lần dev object bị GC, libusb release interface → IOKit claim ngay.
_usb_handles: dict = {}   # (vid, pid) → dev object


def _get_or_open_usb(vid: int, pid: int):
    """Trả về USB device handle, mở mới nếu chưa có hoặc bị mất kết nối."""
    import os
    os.environ.setdefault('DYLD_LIBRARY_PATH', '/opt/homebrew/lib')
    import usb.core

    key = (vid, pid)
    dev = _usb_handles.get(key)

    # Test nếu handle cũ còn alive
    if dev is not None:
        try:
            dev.is_kernel_driver_active(0)  # test call
            return dev  # still alive
        except Exception:
            log.debug("USB: handle expired, re-opening")
            _usb_handles.pop(key, None)
            dev = None

    # Mở mới
    dev = usb.core.find(idVendor=vid, idProduct=pid)
    if dev is None:
        raise RuntimeError(f"USB printer VID:{vid:#06x} PID:{pid:#06x} not found")

    log.debug("USB printer: %s / %s", dev.manufacturer, dev.product)

    try:
        if dev.is_kernel_driver_active(0):
            dev.detach_kernel_driver(0)
            log.debug("USB: detached kernel driver")
    except Exception:
        pass

    dev.set_configuration()
    _usb_handles[key] = dev  # ← giữ reference → không bị GC → IOKit không reclaim
    log.debug("USB: device handle stored, interface held")
    return dev


def _send_usb(vid: int, pid: int, data: bytes, ep: int = 0x01) -> int:
    """USB Printer class (class=7) — ghi vào endpoint OUT chỉ định.

    Tự chunk nếu data > CHUNK bytes để tránh buffer overflow firmware.
    POS-58L: ep=0x01  |  XP-365B: ep=0x02
    """
    CHUNK       = 512    # bytes per USB write — khớp USB bulk packet size
    CHUNK_DELAY = 0.02   # 20ms giữa các chunk — cho firmware kịp xử lý

    def _write_all(dev, payload: bytes) -> int:
        total = 0
        for i in range(0, len(payload), CHUNK):
            n = dev.write(ep, payload[i:i + CHUNK], timeout=10000)
            total += n
            if i + CHUNK < len(payload):
                time.sleep(CHUNK_DELAY)
        return total

    dev = _get_or_open_usb(vid, pid)
    try:
        n = _write_all(dev, data)
        log.debug("USB: wrote %d bytes to EP 0x%02x (%d chunks)", n, ep,
                  -(-len(data) // CHUNK))
        time.sleep(0.3)
        return n
    except Exception as exc:
        log.warning("USB write failed (%s), clearing handle and retrying...", exc)
        _usb_handles.pop((vid, pid), None)
        dev2 = _get_or_open_usb(vid, pid)
        n = _write_all(dev2, data)
        log.debug("USB: retry wrote %d bytes to EP 0x%02x", n, ep)
        time.sleep(0.3)
        return n


def _send_cups(printer_name: str, data: bytes) -> int:
    import subprocess
    cmd = ["lpr", "-P", printer_name, "-o", "CashDrawer1Setting=1CashDrawer1BeforePrinting"]
    proc = subprocess.run(cmd, input=data, capture_output=True, check=True)
    return len(data)


def _send(mode: str, ip: str, port: int, serial_port: str, baud: int, data: bytes,
          usb_vid: int = 0, usb_pid: int = 0, usb_ep: int = 0x01, cups_printer: str = "") -> int:
    if mode == "cups":
        return _send_cups(cups_printer or RECEIPT_CUPS_PRINTER, data)
    elif mode == "usb":
        return _send_usb(usb_vid, usb_pid, data, ep=usb_ep)
    elif mode == "serial":
        return _send_serial(serial_port, baud, data)
    else:
        return _send_tcp(ip, port, data)


# ── Health helpers ────────────────────────────────────────────────────────────
def _ping_tcp(ip: str, port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(2.0)
            s.connect((ip, port))
        return True
    except OSError:
        return False


def _ping_serial(port: str) -> bool:
    return os.path.exists(port)


def _ping_usb(vid: int, pid: int) -> bool:
    try:
        _get_or_open_usb(vid, pid)
        return True
    except Exception:
        return False


def _ping(mode: str, ip: str, port: int, serial_port: str,
          usb_vid: int = 0, usb_pid: int = 0) -> bool:
    if mode == "usb":
        return _ping_usb(usb_vid, usb_pid)
    if mode == "serial":
        return _ping_serial(serial_port)
    return _ping_tcp(ip, port)


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    receipt_ok = _ping(RECEIPT_MODE, RECEIPT_PRINTER_IP, RECEIPT_PRINTER_PORT, RECEIPT_SERIAL_PORT,
                       usb_vid=RECEIPT_USB_VID, usb_pid=RECEIPT_USB_PID)
    label_ok   = _ping(LABEL_MODE,   LABEL_PRINTER_IP,   LABEL_PRINTER_PORT,   LABEL_SERIAL_PORT,
                       usb_vid=LABEL_USB_VID, usb_pid=LABEL_USB_PID)

    def _conn_str(mode, serial_port, ip, port, vid, pid):
        if mode == "usb":    return f"usb:{vid:#06x}:{pid:#06x}"
        if mode == "serial": return serial_port
        return f"{ip}:{port}"

    return jsonify({
        "ok": True,
        "printers": {
            "receipt": {
                "model":  "POS-58L",
                "usage":  "hoa don 58mm",
                "mode":   RECEIPT_MODE,
                "conn":   _conn_str(RECEIPT_MODE, RECEIPT_SERIAL_PORT, RECEIPT_PRINTER_IP,
                                    RECEIPT_PRINTER_PORT, RECEIPT_USB_VID, RECEIPT_USB_PID),
                "online": receipt_ok,
            },
            "label": {
                "model":  "XP-365B",
                "usage":  "tem dan coc 50x30mm",
                "mode":   LABEL_MODE,
                "conn":   _conn_str(LABEL_MODE, LABEL_SERIAL_PORT, LABEL_PRINTER_IP,
                                    LABEL_PRINTER_PORT, LABEL_USB_VID, LABEL_USB_PID),
                "online": label_ok,
            },
        },
    }), 200


@app.post("/print/receipt")
def print_receipt():
    """POS-58L — hóa đơn 58mm."""
    data = request.get_data()
    if not data:
        return jsonify({"ok": False, "error": "empty payload"}), 400
    try:
        n = _send(RECEIPT_MODE, RECEIPT_PRINTER_IP, RECEIPT_PRINTER_PORT,
                  RECEIPT_SERIAL_PORT, RECEIPT_SERIAL_BAUD, data,
                  usb_vid=RECEIPT_USB_VID, usb_pid=RECEIPT_USB_PID, usb_ep=RECEIPT_USB_EP,
                  cups_printer=RECEIPT_CUPS_PRINTER)
        log.info("RECEIPT %d bytes [%s]", n, RECEIPT_MODE)
        return jsonify({"ok": True, "printer": "receipt", "bytes": n}), 200
    except Exception as exc:
        log.error("RECEIPT error: %s", exc)
        code = 504 if "timeout" in str(exc).lower() else 502
        return jsonify({"ok": False, "error": str(exc)}), code


@app.post("/print/label")
def print_label():
    """XP-365B — tem dán cốc 50×30mm."""
    data = request.get_data()
    if not data:
        return jsonify({"ok": False, "error": "empty payload"}), 400
    try:
        n = _send(LABEL_MODE, LABEL_PRINTER_IP, LABEL_PRINTER_PORT,
                  LABEL_SERIAL_PORT, LABEL_SERIAL_BAUD, data,
                  usb_vid=LABEL_USB_VID, usb_pid=LABEL_USB_PID, usb_ep=LABEL_USB_EP)
        log.info("LABEL   %d bytes [%s]", n, LABEL_MODE)
        return jsonify({"ok": True, "printer": "label", "bytes": n}), 200
    except Exception as exc:
        log.error("LABEL error: %s", exc)
        code = 504 if "timeout" in str(exc).lower() else 502
        return jsonify({"ok": False, "error": str(exc)}), code


@app.post("/print")
def print_compat():
    """Backward-compat → /print/receipt."""
    return print_receipt()


# ── Gateway Order Routes ──────────────────────────────────────────────────────
@app.post("/order")
def order_create():
    payload = request.get_json(force=True, silent=True) or {}
    minted = GATEWAY.mint_order(payload)
    order_id, short_code = minted["order_id"], minted["short_code"]
    if minted["deduped"]:
        return jsonify({"ok": True, "order_id": order_id, "short_code": short_code,
                        "printed": True, "deduped": True}), 200

    order = {
        "order_id": order_id,
        "timestamp": payload.get("timestamp") or _now_iso_server(),
        "table_id": payload.get("table_id", ""),
        "customer_name": payload.get("customer_name", ""),
        "customer_id": payload.get("customer_id", ""),
        "metadata": {"short_code": short_code,
                     "delivery_type": (payload.get("metadata") or {}).get("delivery_type", "dine_in"),
                     "notes": (payload.get("metadata") or {}).get("notes", "")},
        "items": payload.get("items", []),
    }

    cups = []
    for it in order["items"]:
        for _ in range(max(1, int(it.get("qty", 1)))):
            cups.append(it)

    printed_ok, warning = True, None
    printed_at = _now_iso_server()
    for i, item in enumerate(cups, start=1):
        try:
            _print_label_bytes(build_label_tspl(order, item, i, len(cups)))
        except Exception as exc:
            log.error("label print failed %s: %s", order_id, exc)
            printed_ok, warning = False, "print_failed"

    ing = dict(payload)
    ing["gateway_order_id"] = order_id
    ing["gateway_short_code"] = short_code
    ing["printed_at"] = printed_at
    GATEWAY.enqueue("ingest_order", order_id, minted["idempotency_key"], ing,
                    short_code=short_code, printed_at=printed_at)
    return jsonify({"ok": True, "order_id": order_id, "short_code": short_code,
                    "printed": printed_ok, "warning": warning}), 200

@app.get("/order")
def order_lookup():
    key = request.args.get("key", "")
    found = GATEWAY.get_by_key(key) if key else None
    if not found:
        return jsonify({"ok": True, "found": False}), 200
    return jsonify({"ok": True, "found": True, **found}), 200

@app.post("/order/status")
def order_status():
    p = request.get_json(force=True, silent=True) or {}
    order_id, status = p.get("order_id"), p.get("status")
    try:
        d = _gas_post({"action": "update_status", "order_id": order_id,
                       "status": status})
        return jsonify(d), 200
    except Exception:
        GATEWAY.enqueue("status", order_id, f"{order_id}:{status}",
                        {"action": "update_status", "order_id": order_id, "status": status})
        return jsonify({"ok": True, "queued_offline": True}), 200

@app.post("/order/mark_paid")
def order_mark_paid():
    p = request.get_json(force=True, silent=True) or {}
    order_id = p.get("order_id")
    try:
        d = _gas_post({"action": "mark_paid", "order_id": order_id})
        return jsonify(d), 200
    except Exception:
        if p.get("order"):
            try: _print_receipt_bytes(build_receipt(p["order"]))
            except Exception as exc: log.error("offline receipt failed: %s", exc)
        GATEWAY.enqueue("mark_paid", order_id, f"{order_id}:paid",
                        {"action": "mark_paid", "order_id": order_id})
        return jsonify({"ok": True, "queued_offline": True}), 200


# ── Debug / test endpoints ─────────────────────────────────────────────────────
def _build_test_receipt() -> bytes:
    """Minimal ESC/POS receipt — dùng để test không cần GAS."""
    ESC = b'\x1b'
    GS  = b'\x1d'
    d = b''
    d += ESC + b'@'             # Init printer
    d += ESC + b'p\x00\x19\xfa' # Cash drawer kick pin 2
    d += ESC + b'p\x01\x19\xfa' # Cash drawer kick pin 5
    d += ESC + b'a\x01'        # Center
    d += ESC + b'!\x08'        # Bold
    d += b'--- TEST PRINT ---\r\n'
    d += ESC + b'!\x00'        # Normal
    d += ESC + b'a\x00'        # Left
    d += b'MITSU CAFE\r\n'
    d += b'Print server OK\r\n'
    d += b'BT serial test\r\n'
    d += b'---\r\n'
    d += ESC + b'd\x04'        # Feed 4 lines
    d += GS  + b'V\x42\x00'   # Full cut
    return d


def _build_test_label(scenario: str = "dine_in") -> bytes:
    """TSPL test label cho XP-365B.
    Chạy: curl http://localhost:5001/test/label?type=dine_in|take_away|delivery|long_name
    """
    import sys, os
    sys.path.insert(0, os.path.dirname(__file__))
    from printlib import build_label_tspl

    fake_order = {
        "order_id": "ORD-TEST-0001",
        "timestamp": "2026-05-27T08:10:00+07:00",
        "table_id":  "",
        "customer_name": "",
        "customer_id": "",
        "metadata":  {"short_code": "127", "delivery_type": "dine_in", "notes": ""},
        "items": [],
    }
    fake_item = {
        "name":      "Bạc xỉu",
        "qty":       1,
        "modifiers": {"sugar": "30%", "ice": "less"},
    }

    if scenario == "take_away":
        fake_order["metadata"]["delivery_type"] = "take_away"
        fake_order["customer_name"] = "Anh Minh"
        fake_order["customer_id"] = "0987654321"
    elif scenario == "delivery":
        fake_order["metadata"]["delivery_type"] = "delivery"
        fake_order["metadata"]["delivery_address"] = "938 Đường Hùng Vương, Lâm Hà"
        fake_order["customer_name"] = "Chị Vy"
        fake_order["customer_id"] = "0975087429"
        fake_order["metadata"]["notes"] = "Giao gấp trước 10h"
    elif scenario == "long_name":
        fake_order["table_id"] = "03"
        fake_order["metadata"]["delivery_type"] = "dine_in"
        fake_item["name"] = "Trà Sữa Matcha Trân Châu Đường Đen"
        fake_item["modifiers"]["toppings"] = "Trân châu hoàng kim"
    else: # dine_in
        fake_order["table_id"] = "03"
        fake_order["metadata"]["delivery_type"] = "dine_in"

    return build_label_tspl(fake_order, fake_item, 1, 2)


@app.get("/test/receipt")
def test_receipt():
    """In test page cứng cho POS-58L — debug mà không cần GAS."""
    data = _build_test_receipt()
    log.info("TEST RECEIPT %d bytes [%s]", len(data), RECEIPT_MODE)
    log.info("TEST hex: %s", data.hex())
    try:
        n = _send(RECEIPT_MODE, RECEIPT_PRINTER_IP, RECEIPT_PRINTER_PORT,
                  RECEIPT_SERIAL_PORT, RECEIPT_SERIAL_BAUD, data,
                  usb_vid=RECEIPT_USB_VID, usb_pid=RECEIPT_USB_PID, usb_ep=RECEIPT_USB_EP,
                  cups_printer=RECEIPT_CUPS_PRINTER)
        return jsonify({"ok": True, "printer": "receipt", "bytes": n, "hex": data.hex()}), 200
    except Exception as exc:
        log.error("TEST RECEIPT error: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 502


def _label_send(data: bytes) -> dict:
    """Gửi raw bytes tới label printer, trả về dict {ok, bytes}."""
    n = _send(LABEL_MODE, LABEL_PRINTER_IP, LABEL_PRINTER_PORT,
              LABEL_SERIAL_PORT, LABEL_SERIAL_BAUD, data,
              usb_vid=LABEL_USB_VID, usb_pid=LABEL_USB_PID, usb_ep=LABEL_USB_EP)
    return {"ok": True, "bytes": n, "tspl": data.decode(errors="replace")}


@app.get("/test/label")
def test_label():
    """In test label cứng cho XP-365B — debug mà không cần GAS."""
    scenario = request.args.get("type", "dine_in")
    data = _build_test_label(scenario)
    log.info("TEST LABEL (scenario=%s) %d bytes [%s]", scenario, len(data), LABEL_MODE)
    try:
        r = _label_send(data)
        return jsonify(r), 200
    except Exception as exc:
        log.error("TEST LABEL error: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 502


# ── Diagnostic endpoints — tìm syntax đúng cho XP-365B ───────────────────────

def _probe(mid_cmd: bytes, label: str) -> tuple:
    """Gửi 1 tem: BAR_đầu + mid_cmd + BAR_cuối + PRINT.
    Nếu cả 2 BAR in ra → mid_cmd hoạt động.
    Nếu chỉ BAR đầu (hoặc không gì) → mid_cmd phá parser.
    """
    data = (
        b"SIZE 50 mm,30 mm\r\n"
        b"GAP 3 mm,0\r\n"
        b"CLS\r\n"
        b"BAR 0,0,400,8\r\n"    # bar đầu — luôn in nếu PRINT chạy
        + mid_cmd + b"\r\n"
        + b"BAR 0,224,400,8\r\n"  # bar cuối — chỉ in nếu mid_cmd không phá parser
        b"PRINT 1\r\n"
    )
    log.info("PROBE [%s]: %d bytes", label, len(data))
    try:
        r = _label_send(data)
        r["probe"] = label
        return jsonify(r), 200
    except Exception as exc:
        return jsonify({"ok": False, "probe": label, "error": str(exc)}), 502


@app.get("/test/label/probe/bar")
def probe_bar():
    """Probe baseline — BAR ở giữa. Cả 3 bars phải in ra."""
    return _probe(b"BAR 0,112,400,8", "bar")


@app.get("/test/label/probe/qr")
def probe_qr():
    """Probe QRCODE — TSPL1 command, có quoted string."""
    return _probe(b'QRCODE 10,20,L,4,A,0,"TEST123"', "qrcode")


@app.get("/test/label/probe/barcode")
def probe_barcode():
    """Probe BARCODE CODE128 — TSPL1, quoted type name."""
    return _probe(b'BARCODE 10,30,"128",50,1,0,2,2,"12345"', "barcode")


@app.get("/test/label/probe/text-q")
def probe_text_q():
    """Probe TEXT font trong nháy kép: TEXT x,y,\"2\",r,sx,sy,\"data\"."""
    return _probe(b'TEXT 10,50,"2",0,1,1,"HELLO"', "text-quoted")


@app.get("/test/label/probe/text-nq")
def probe_text_nq():
    """Probe TEXT font KHÔNG nháy kép: TEXT x,y,2,r,sx,sy,\"data\"."""
    return _probe(b'TEXT 10,50,2,0,1,1,"HELLO"', "text-noquote")


@app.get("/test/label/probe/bitmap")
def probe_bitmap():
    """Probe BITMAP binary — gửi làm 3 phần với delay."""
    try:
        prefix = (
            b"SIZE 50 mm,30 mm\r\n"
            b"GAP 3 mm,0\r\n"
            b"CLS\r\n"
            b"BAR 0,0,400,8\r\n"
            b"BITMAP 0,20,2,10,0\r\n"   # 2×10=20 bytes
        )
        bmp  = bytes([0xFF] * 20)
        suffix = b"BAR 0,224,400,8\r\nPRINT 1\r\n"
        dev = _get_or_open_usb(LABEL_USB_VID, LABEL_USB_PID)
        n1 = dev.write(LABEL_USB_EP, prefix, timeout=10000); time.sleep(0.3)
        n2 = dev.write(LABEL_USB_EP, bmp,    timeout=10000); time.sleep(0.3)
        n3 = dev.write(LABEL_USB_EP, suffix, timeout=10000)
        return jsonify({"ok": True, "probe": "bitmap", "bytes": [n1, n2, n3]}), 200
    except Exception as exc:
        return jsonify({"ok": False, "probe": "bitmap", "error": str(exc)}), 502


@app.get("/test/label/bitmap-fullblack")
def test_label_bitmap_fullblack():
    """All-0xFF bitmap — nếu ra TRẮNG: BITMAP data bị ignore hoàn toàn.
                          nếu ra ĐEN:   BITMAP hoạt động, PIL rendering bị inverted.
    """
    bpr = 50   # 400 dots / 8
    H   = 240
    hdr = (
        b"SIZE 50 mm,30 mm\r\n"
        b"GAP 3 mm,0\r\n"
        b"DENSITY 15\r\n"
        b"CLS\r\n"
        + f"BITMAP 0,0,{bpr},{H},0\r\n".encode()
    )
    bmp = bytes([0xFF] * bpr * H)   # 12000 bytes — tất cả đen
    ftr = b"PRINT 1\r\n"
    data = hdr + bmp + ftr
    log.info("TEST bitmap-fullblack: hdr=%d bmp=%d ftr=%d total=%d",
             len(hdr), len(bmp), len(ftr), len(data))
    try:
        r = _label_send(data)
        return jsonify({**r, "info": "all-0xFF fullblack test"}), 200
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/bitmap-inverted")
def test_label_bitmap_inverted():
    """PIL label render nhưng invert tất cả bits (0↔1).
    Nếu ra đúng text tiếng Việt → bit order TSPL ngược với ESC/POS (0=dot, 1=blank).
    """
    import sys, os
    sys.path.insert(0, os.path.dirname(__file__))
    from printlib import build_label_tspl

    fake_order = {
        "order_id": "ORD-TEST-0001",
        "timestamp": "2026-05-27T08:10:00+07:00",
        "table_id": "03",
        "metadata": {"short_code": "127", "delivery_type": "dine_in", "notes": ""},
        "items": [],
    }
    fake_item = {
        "name": "Bạc xỉu",
        "qty": 1,
        "modifiers": {"sugar": "30%", "ice": "less"},
    }
    raw = build_label_tspl(fake_order, fake_item, 1, 2)

    # Tách header text (trước binary data) và footer
    bitmap_hdr_end = raw.index(b"\r\n", raw.index(b"BITMAP")) + 2
    print_start    = raw.rindex(b"PRINT 1")
    bmp_data       = raw[bitmap_hdr_end:print_start]

    inverted = bytes(b ^ 0xFF for b in bmp_data)
    data     = raw[:bitmap_hdr_end] + inverted + raw[print_start:]

    log.info("TEST bitmap-inverted: %d bytes (bmp=%d inverted)", len(data), len(bmp_data))
    try:
        r = _label_send(data)
        return jsonify({**r, "info": "inverted bits test"}), 200
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/selftest")
def test_label_selftest():
    """SELFTEST — máy in sẽ tự in trang cấu hình nếu hỗ trợ."""
    try:
        r = _label_send(b"SELFTEST\r\n")
        return jsonify(r), 200
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/bar")
def test_label_bar():
    """BAR only — xác nhận baseline vẫn hoạt động."""
    data = (
        b"SIZE 50 mm,30 mm\r\n"
        b"GAP 3 mm,0\r\n"
        b"CLS\r\n"
        b"BAR 0,0,400,8\r\n"      # thanh dày trên cùng
        b"BAR 0,116,400,8\r\n"    # thanh dày giữa
        b"BAR 0,232,400,8\r\n"    # thanh dày dưới cùng
        b"PRINT 1\r\n"
    )
    try:
        r = _label_send(data)
        return jsonify(r), 200
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/text-q")
def test_label_text_quoted():
    """TEXT với font name trong nháy kép — 'TEXT x,y,\"2\",0,1,1,\"data\"'."""
    data = (
        b"SIZE 50 mm,30 mm\r\n"
        b"GAP 3 mm,0\r\n"
        b"CLS\r\n"
        b"BAR 0,0,400,4\r\n"                        # thanh đầu (baseline)
        b'TEXT 10,10,"2",0,1,1,"FONT2-HELLO"\r\n'
        b'TEXT 10,40,"4",0,1,1,"FONT4-HI"\r\n'
        b"BAR 0,100,400,4\r\n"                      # thanh cuối (baseline)
        b"PRINT 1\r\n"
    )
    log.info("TEST text-q: %s", data)
    try:
        r = _label_send(data)
        return jsonify(r), 200
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/text-nq")
def test_label_text_noquote():
    """TEXT với font name KHÔNG có nháy kép — 'TEXT x,y,2,0,1,1,\"data\"'."""
    data = (
        b"SIZE 50 mm,30 mm\r\n"
        b"GAP 3 mm,0\r\n"
        b"CLS\r\n"
        b"BAR 0,0,400,4\r\n"
        b"TEXT 10,10,2,0,1,1,\"FONT2-HELLO\"\r\n"
        b"TEXT 10,40,4,0,1,1,\"FONT4-HI\"\r\n"
        b"BAR 0,100,400,4\r\n"
        b"PRINT 1\r\n"
    )
    log.info("TEST text-nq: %s", data)
    try:
        r = _label_send(data)
        return jsonify(r), 200
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/barcode")
def test_label_barcode():
    """BARCODE CODE128 — không cần font rendering."""
    data = (
        b"SIZE 50 mm,30 mm\r\n"
        b"GAP 3 mm,0\r\n"
        b"CLS\r\n"
        b"BAR 0,0,400,4\r\n"
        b'BARCODE 10,10,"128",80,1,0,2,2,"12345"\r\n'
        b"PRINT 1\r\n"
    )
    try:
        r = _label_send(data)
        return jsonify(r), 200
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/qr")
def test_label_qr():
    """QRCODE — không cần font, encode được tiếng Việt nếu scanner hỗ trợ."""
    data = (
        b"SIZE 50 mm,30 mm\r\n"
        b"GAP 3 mm,0\r\n"
        b"CLS\r\n"
        b"BAR 0,0,400,4\r\n"
        b'QRCODE 10,10,L,5,A,0,"BAC XIU - IT NGOT"\r\n'
        b"PRINT 1\r\n"
    )
    try:
        r = _label_send(data)
        return jsonify(r), 200
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/bitmap-small")
def test_label_bitmap_small():
    """BITMAP nhỏ (40 bytes all-0xFF) chia 3 lần write với delay."""
    hdr = (
        b"SIZE 50 mm,30 mm\r\n"
        b"GAP 3 mm,0\r\n"
        b"CLS\r\n"
        b"BAR 0,0,400,4\r\n"
        b"BITMAP 0,10,2,20,0\r\n"   # x=0,y=10, 2 bytes/row × 20 rows
    )
    bmp  = bytes([0xFF] * 40)
    foot = b"BAR 0,220,400,4\r\nPRINT 1\r\n"
    log.info("TEST bitmap-small: hdr=%d bmp=%d foot=%d", len(hdr), len(bmp), len(foot))
    try:
        dev = _get_or_open_usb(LABEL_USB_VID, LABEL_USB_PID)
        n1 = dev.write(LABEL_USB_EP, hdr, timeout=10000)
        time.sleep(0.3)
        n2 = dev.write(LABEL_USB_EP, bmp, timeout=10000)
        time.sleep(0.3)
        n3 = dev.write(LABEL_USB_EP, foot, timeout=10000)
        return jsonify({"ok": True, "bytes": n1+n2+n3, "splits": [n1, n2, n3]}), 200
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/bitmap-hex")
def test_label_bitmap_hex():
    """BITMAP với data hex-encoded trên cùng 1 dòng — không có binary data.

    Một số printer TSPL chấp nhận: BITMAP x,y,w,h,mode,FFFFFF...
    Nếu endpoint này in ra được → bitmap data cần encode hex.
    """
    hex_data = "FF" * 40   # 40 bytes all-0xFF dưới dạng hex string
    data = (
        b"SIZE 50 mm,30 mm\r\n"
        b"GAP 3 mm,0\r\n"
        b"CLS\r\n"
        b"BAR 0,0,400,4\r\n"
        + f"BITMAP 0,10,2,20,0,{hex_data}\r\n".encode()
        + b"BAR 0,220,400,4\r\n"
        b"PRINT 1\r\n"
    )
    log.info("TEST bitmap-hex: %d bytes", len(data))
    try:
        r = _label_send(data)
        return jsonify(r), 200
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/bitmap-lf")
def test_label_bitmap_lf():
    """BITMAP với LF only (\\n, không phải \\r\\n) trước binary data.

    Nếu printer đếm \\r là byte đầu tiên của binary data → LF-only sẽ fix.
    """
    hdr = (
        b"SIZE 50 mm,30 mm\r\n"
        b"GAP 3 mm,0\r\n"
        b"CLS\r\n"
        b"BAR 0,0,400,4\r\n"
        b"BITMAP 0,10,2,20,0\n"    # \n only — không có \r trước binary data
    )
    bmp  = bytes([0xFF] * 40)
    foot = b"BAR 0,220,400,4\r\nPRINT 1\r\n"
    data = hdr + bmp + foot
    log.info("TEST bitmap-lf: %d bytes", len(data))
    try:
        r = _label_send(data)
        return jsonify(r), 200
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/bitmap-extra")
def test_label_bitmap_extra():
    """BITMAP với 41 bytes thay vì 40 — nếu \\r bị đếm là byte 0 của data.

    Nếu parser đọc \\r\\n → data starts từ \\r, thì cần thêm 1 byte dummy ở đầu.
    """
    hdr = (
        b"SIZE 50 mm,30 mm\r\n"
        b"GAP 3 mm,0\r\n"
        b"CLS\r\n"
        b"BAR 0,0,400,4\r\n"
        b"BITMAP 0,10,2,20,0\r\n"
    )
    bmp  = bytes([0xFF] * 41)   # 1 extra byte — \r dummy + 40 actual
    foot = b"BAR 0,220,400,4\r\nPRINT 1\r\n"
    data = hdr + bmp + foot
    log.info("TEST bitmap-extra: %d bytes", len(data))
    try:
        r = _label_send(data)
        return jsonify(r), 200
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/bitmap-zero")
def test_label_bitmap_zero():
    """BITMAP all-0x00 (tất cả bits = 0) — chunked write như production.

    Kết quả:
      ĐEN  → bit=0 = black (polarity ngược), BITMAP hoạt động → fix bằng XOR raster
      TRẮNG → BITMAP bị ignore hoàn toàn (không phải vấn đề polarity)
    """
    bpr = 30; H = 400
    hdr = (
        b"SIZE 50 mm,30 mm\r\n"
        b"GAP 3 mm,0\r\n"
        b"CLS\r\n"
        + f"BITMAP 0,0,{bpr},{H},0\r\n".encode()
    )
    bmp = bytes([0x00] * bpr * H)   # 12000 bytes all-ZERO (opposite of fullblack)
    ftr = b"PRINT 1\r\n"
    data = hdr + bmp + ftr
    log.info("TEST bitmap-zero: all-0x00, bpr=%d H=%d total=%d", bpr, H, len(data))
    try:
        r = _label_send(data)   # chunked write — same as production
        return jsonify({**r, "note": "all-0x00: DEN=bit0=black fix XOR, TRANG=ignored"}), 200
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/text-landscape")
def test_label_text_landscape():
    """TEXT rotation=270 + DIRECTION 0 — layout thực tế tem 50×30mm.

    Portrait mode: x=0..239 (head=30mm), y=0..399 (feed=50mm)
    DIRECTION 0 + rotation=270: physical_lx = py, physical_ly = px
    Để đặt tại landscape (lx, ly): portrait px=ly, py=lx
    Text grows trong +y direction (rightward in landscape).
    """
    import unicodedata

    def sv(s: str) -> str:
        """Strip diacritics → ASCII uppercase (TSPL font chỉ support ASCII)."""
        s = s.replace("đ", "d").replace("Đ", "D")
        nfd = unicodedata.normalize("NFD", s)
        return "".join(c for c in nfd if unicodedata.category(c) != "Mn").upper()

    def T(px, py, text_str, font="4", sx=1, sy=1):
        return f'TEXT {px},{py},"{font}",0,{sx},{sy},"{sv(text_str)}"\r\n'.encode("ascii")

    # Center helper: x = (240 - charW * len) // 2, charW≈12 for font4, ≈9 for font3
    def cx(text, font="4"):
        w = (12 if font == "4" else 9) * len(sv(text))
        return max(2, (240 - w) // 2)

    lines = [
        b"SIZE 50 mm,30 mm\r\n",
        b"GAP 3 mm,0\r\n",
        b"DIRECTION 0\r\n",
        b"CODEPAGE UTF-8\r\n",
        b"CLS\r\n",
        T(5,         140, "#127  Ban 03"),            # Header trai: y=140
        T(175,       140, "[1/2]"),                   # Cup counter phai: y=140
        b"BAR 0,162,240,3\r\n",                       # Ngang day: y=162
        T(cx("Bac xiu"), 170, "Bac xiu", sy=2),      # Ten mon giua: y=170..202
        T(cx("It ngot / It da","3"), 212, "It ngot / It da", font="3"),  # Modifier: y=212
        b"BAR 0,232,240,2\r\n",                       # Ngang mong: y=232
        T(cx("08:10","3"), 240, "08:10", font="3"),   # Gio giua: y=240
        b"PRINT 1\r\n",
    ]
    data = b"".join(lines)
    log.info("TEST text-landscape (DIRECTION 0 rotation=270): %d bytes", len(data))
    log.info("data: %s", data.decode("ascii"))
    try:
        r = _label_send(data)
        return jsonify({**r, "note": "TEXT rotation=90 ASCII landscape layout"}), 200
    except Exception as exc:
        log.error("text-landscape: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/bitmap-portrait-black")
def test_label_bitmap_portrait_black():
    """BITMAP all-0xFF với bpr=30 (head=30mm=240dots), H=400 (feed=50mm), single write.

    Nếu ra ĐEN → bpr=30 đúng, BITMAP hoạt động!  Fix confirmed.
    Nếu vẫn TRẮNG → còn vấn đề khác với BITMAP command.
    """
    bpr = 30; H = 400   # portrait: head=240dots, feed=400dots
    data = (
        b"SIZE 50 mm,30 mm\r\n"
        b"GAP 3 mm,0\r\n"
        b"CLS\r\n"
        + f"BITMAP 0,0,{bpr},{H},0\r\n".encode()
        + bytes([0xFF] * bpr * H)       # 12000 bytes all-black
        + b"PRINT 1\r\n"
    )
    log.info("TEST bitmap-portrait-black: bpr=%d H=%d total=%d", bpr, H, len(data))
    try:
        dev = _get_or_open_usb(LABEL_USB_VID, LABEL_USB_PID)
        n   = dev.write(LABEL_USB_EP, data, timeout=60000)  # single write
        time.sleep(0.5)
        return jsonify({"ok": True, "bytes": n, "total": len(data),
                        "note": "bpr=30 portrait — ra DEN = BITMAP ok!"}), 200
    except Exception as exc:
        log.error("bitmap-portrait-black: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/debug-png")
def test_label_debug_png():
    """Render PIL label → save PNG → trả về thống kê pixel.

    Mở /tmp/test_label_debug.png bằng Preview để xác nhận nội dung.
    Nếu PNG trắng tinh → PIL render lỗi.
    Nếu PNG có text → PIL OK, vấn đề ở TSPL BITMAP.
    """
    import sys, os as _os
    sys.path.insert(0, _os.path.dirname(__file__))
    from printlib import build_label_tspl

    fake_order = {
        "order_id": "ORD-TEST-0001",
        "timestamp": "2026-05-27T08:10:00+07:00",
        "table_id": "03",
        "metadata": {"short_code": "127", "delivery_type": "dine_in", "notes": ""},
        "items": [],
    }
    fake_item = {"name": "Bạc xỉu", "qty": 1, "modifiers": {"sugar": "30%", "ice": "less"}}

    try:
        from PIL import Image, ImageDraw
        from printlib import (LABEL_DOTS_WIDTH, LABEL_DOTS_HEIGHT,
                                   _load_font, _SZ_LBL_HDR, _SZ_LBL_ITEM,
                                   _SZ_LBL_MOD, _SZ_LBL_TIME, _loc_label,
                                   _mods_line, _format_time_only)

        W, H, PAD = LABEL_DOTS_WIDTH, LABEL_DOTS_HEIGHT, 4
        f_hdr  = _load_font(_SZ_LBL_HDR)
        f_item = _load_font(_SZ_LBL_ITEM)
        f_mod  = _load_font(_SZ_LBL_MOD)
        f_time = _load_font(_SZ_LBL_TIME)

        img  = Image.new("L", (W, H), 255)
        draw = ImageDraw.Draw(img)

        # Render header
        meta = fake_order.get("metadata") or {}
        sc   = "#" + str(meta.get("short_code", "127"))
        loc  = _loc_label(fake_order)
        draw.text((PAD, PAD), f"{sc}  {loc}", font=f_hdr, fill=0)
        draw.text((W - PAD - 60, PAD), "[1/2]", font=f_hdr, fill=0)
        y = PAD + 22
        draw.line([(PAD, y), (W - PAD, y)], fill=0, width=2)
        y += 4
        # Item name
        draw.text((20, y), "Bạc xỉu", font=f_item, fill=0)
        y += 35
        # Mods
        draw.text((20, y), "Ít ngọt / Ít đá", font=f_mod, fill=0)
        y += 20
        draw.line([(PAD, y), (W - PAD, y)], fill=0, width=1)
        y += 4
        draw.text((170, y), "08:10", font=f_time, fill=0)

        png_path = "/tmp/test_label_debug.png"
        img.save(png_path)

        # Pixel stats
        pixels = list(img.getdata())
        dark   = sum(1 for p in pixels if p < 128)
        total  = len(pixels)
        pct    = round(100.0 * dark / total, 2)

        log.info("DEBUG PNG saved: %s | dark=%d/%d (%.1f%%)", png_path, dark, total, pct)
        return jsonify({
            "ok": True,
            "png": png_path,
            "dark_pixels": dark,
            "total_pixels": total,
            "dark_pct": pct,
            "note": "Mo /tmp/test_label_debug.png bang Preview de xem",
        }), 200
    except Exception as exc:
        log.error("debug-png error: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/bitmap-single")
def test_label_bitmap_single():
    """BITMAP fullblack, gửi TOÀN BỘ data trong 1 dev.write() — không chunking.

    Nếu ra đen: chunking + delay 20ms đang gây firmware timeout giữa BITMAP data.
    Nếu vẫn trắng: không phải vấn đề chunking.
    """
    bpr = 50; H = 240
    hdr = (
        b"SIZE 50 mm,30 mm\r\n"
        b"GAP 3 mm,0\r\n"
        b"CLS\r\n"
        + f"BITMAP 0,0,{bpr},{H},0\r\n".encode()
    )
    bmp  = bytes([0xFF] * bpr * H)   # 12000 bytes — tất cả đen
    ftr  = b"PRINT 1\r\n"
    data = hdr + bmp + ftr
    log.info("TEST bitmap-single: %d bytes → single dev.write()", len(data))
    try:
        dev = _get_or_open_usb(LABEL_USB_VID, LABEL_USB_PID)
        n   = dev.write(LABEL_USB_EP, data, timeout=60000)  # 1 write, no chunking
        time.sleep(0.5)
        return jsonify({"ok": True, "bytes": n, "total": len(data),
                        "note": "single USB write - no chunk delay"}), 200
    except Exception as exc:
        log.error("bitmap-single error: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/text-viet")
def test_label_text_viet():
    """TEXT command + CODEPAGE UTF-8 — thử in tiếng Việt dùng font ROM máy in.

    Nếu ra tiếng Việt đúng dấu → dùng TEXT thay BITMAP hoàn toàn (đơn giản hơn).
    Nếu ra dấu ??? → font ROM không hỗ trợ Unicode.
    Nếu ra ASCII không dấu → printer strip diacritics.
    """
    data = (
        b"SIZE 50 mm,30 mm\r\n"
        b"GAP 3 mm,0\r\n"
        b"CODEPAGE UTF-8\r\n"
        b"CLS\r\n"
        b"BAR 0,0,400,4\r\n"
        + "TEXT 10,10,\"4\",0,1,1,\"#127  Bàn 03  [1/2]\"\r\n".encode("utf-8")
        + "TEXT 10,35,\"4\",0,2,2,\"Bạc xỉu\"\r\n".encode("utf-8")
        + "TEXT 10,95,\"3\",0,1,1,\"It ngọt / It đá\"\r\n".encode("utf-8")
        + b"BAR 0,120,400,2\r\n"
        + "TEXT 150,125,\"3\",0,1,1,\"08:10\"\r\n".encode("utf-8")
        + b"PRINT 1\r\n"
    )
    log.info("TEST text-viet (CODEPAGE UTF-8): %d bytes", len(data))
    try:
        r = _label_send(data)
        return jsonify({**r, "note": "CODEPAGE UTF-8 + TEXT viet test"}), 200
    except Exception as exc:
        log.error("text-viet error: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.get("/test/label/bitmap-1row")
def test_label_bitmap_1row():
    """BITMAP 1 hàng duy nhất (50 bytes) — nếu ra 1 line đen → BITMAP hoạt động.

    BAR trên + BITMAP 1 row (all-black) + BAR dưới + PRINT.
    Nếu cả 3 đều ra → BITMAP OK với data nhỏ.
    Nếu chỉ 2 BAR → BITMAP bị ignore hoàn toàn.
    """
    bpr = 50  # 400 dots / 8
    hdr = (
        b"SIZE 50 mm,30 mm\r\n"
        b"GAP 3 mm,0\r\n"
        b"CLS\r\n"
        b"BAR 0,0,400,4\r\n"
        + f"BITMAP 0,10,{bpr},1,0\r\n".encode()   # 1 row only = 50 bytes
    )
    bmp  = bytes([0xFF] * bpr)                    # 50 bytes all-black
    foot = b"BAR 0,220,400,4\r\nPRINT 1\r\n"
    data = hdr + bmp + foot
    log.info("TEST bitmap-1row: hdr=%d bmp=%d foot=%d total=%d",
             len(hdr), len(bmp), len(foot), len(data))
    try:
        dev = _get_or_open_usb(LABEL_USB_VID, LABEL_USB_PID)
        n1 = dev.write(LABEL_USB_EP, hdr,  timeout=10000); time.sleep(0.1)
        n2 = dev.write(LABEL_USB_EP, bmp,  timeout=10000); time.sleep(0.1)
        n3 = dev.write(LABEL_USB_EP, foot, timeout=10000)
        return jsonify({"ok": True, "bytes": [n1, n2, n3],
                        "note": "BITMAP 1 row (50 bytes) — xem có line giữa 2 BAR"}), 200
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 502


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    log.info(
        "Print server :%d  |  receipt=%s[%s]  label=%s[%s]",
        SERVER_PORT,
        RECEIPT_SERIAL_PORT if RECEIPT_MODE == "serial" else f"{RECEIPT_PRINTER_IP}:{RECEIPT_PRINTER_PORT}",
        RECEIPT_MODE,
        LABEL_SERIAL_PORT if LABEL_MODE == "serial" else f"{LABEL_PRINTER_IP}:{LABEL_PRINTER_PORT}",
        LABEL_MODE,
    )
    app.run(host="0.0.0.0", port=SERVER_PORT)
