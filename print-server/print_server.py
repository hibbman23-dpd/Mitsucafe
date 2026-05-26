"""
print_server.py — Flask server trên Mac Mini/RPi.

Nhận ESC/POS raw bytes từ GAS → forward tới Xprinter.

Hai endpoint:
  POST /print/label    → XP-365B  (tem dán cốc 50×30mm)
  POST /print/receipt  → POS-58L  (hóa đơn 58mm)
  POST /print          → backward-compat → /print/receipt
  GET  /health         → status cả 2 máy in

Mỗi printer hỗ trợ 2 mode kết nối — chọn bằng env:
  MODE=tcp     → TCP socket LAN (mặc định, cần IP)
  MODE=serial  → Bluetooth hoặc USB serial port

ENV vars:
  --- POS-58L (receipt) ---
  RECEIPT_MODE           tcp | serial          (default: tcp)
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
  SERIAL_CONNECT_WAIT    Giây chờ BT handshake (default: 1.5)

Chạy thử:
    SERVER_PORT=5001 RECEIPT_MODE=serial RECEIPT_SERIAL_PORT=/dev/cu.RPP02N python3 print_server.py

Test health:
    curl http://localhost:5001/health
"""

import logging
import os
import socket
import time

from flask import Flask, jsonify, request

# ── Config ────────────────────────────────────────────────────────────────────
RECEIPT_MODE        = os.getenv("RECEIPT_MODE",        "serial")
RECEIPT_PRINTER_IP  = os.getenv("RECEIPT_PRINTER_IP",  "192.168.1.50")
RECEIPT_PRINTER_PORT= int(os.getenv("RECEIPT_PRINTER_PORT", "9100"))
RECEIPT_SERIAL_PORT = os.getenv("RECEIPT_SERIAL_PORT", "/dev/cu.RPP02N")
RECEIPT_SERIAL_BAUD = int(os.getenv("RECEIPT_SERIAL_BAUD", "9600"))

LABEL_MODE          = os.getenv("LABEL_MODE",          "tcp")
LABEL_PRINTER_IP    = os.getenv("LABEL_PRINTER_IP",    "192.168.1.51")
LABEL_PRINTER_PORT  = int(os.getenv("LABEL_PRINTER_PORT",   "9100"))
LABEL_SERIAL_PORT   = os.getenv("LABEL_SERIAL_PORT",   "/dev/cu.XP365B")
LABEL_SERIAL_BAUD   = int(os.getenv("LABEL_SERIAL_BAUD",   "9600"))

SERVER_PORT          = int(os.getenv("SERVER_PORT",          "5001"))
SOCKET_TIMEOUT       = float(os.getenv("SOCKET_TIMEOUT",      "5"))
SERIAL_CONNECT_WAIT  = float(os.getenv("SERIAL_CONNECT_WAIT", "1.5"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("print-server")

app = Flask(__name__)


# ── Send helpers ─────────────────────────────────────────────────────────────
def _send_tcp(ip: str, port: int, data: bytes) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(SOCKET_TIMEOUT)
        sock.connect((ip, port))
        sock.sendall(data)
    return len(data)


def _send_serial(port: str, baud: int, data: bytes) -> int:
    import serial  # pyserial — lazy import
    with serial.Serial(port, baud, timeout=5) as s:
        time.sleep(SERIAL_CONNECT_WAIT)  # chờ BT handshake ổn định
        s.write(data)
        s.flush()
        time.sleep(0.5)
    return len(data)


def _send(mode: str, ip: str, port: int, serial_port: str, baud: int, data: bytes) -> int:
    if mode == "serial":
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


def _ping(mode: str, ip: str, port: int, serial_port: str) -> bool:
    if mode == "serial":
        return _ping_serial(serial_port)
    return _ping_tcp(ip, port)


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    receipt_ok = _ping(RECEIPT_MODE, RECEIPT_PRINTER_IP, RECEIPT_PRINTER_PORT, RECEIPT_SERIAL_PORT)
    label_ok   = _ping(LABEL_MODE,   LABEL_PRINTER_IP,   LABEL_PRINTER_PORT,   LABEL_SERIAL_PORT)
    return jsonify({
        "ok": True,
        "printers": {
            "receipt": {
                "model":  "POS-58L",
                "usage":  "hoa don 58mm",
                "mode":   RECEIPT_MODE,
                "conn":   RECEIPT_SERIAL_PORT if RECEIPT_MODE == "serial" else f"{RECEIPT_PRINTER_IP}:{RECEIPT_PRINTER_PORT}",
                "online": receipt_ok,
            },
            "label": {
                "model":  "XP-365B",
                "usage":  "tem dan coc 50x30mm",
                "mode":   LABEL_MODE,
                "conn":   LABEL_SERIAL_PORT if LABEL_MODE == "serial" else f"{LABEL_PRINTER_IP}:{LABEL_PRINTER_PORT}",
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
                  RECEIPT_SERIAL_PORT, RECEIPT_SERIAL_BAUD, data)
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
                  LABEL_SERIAL_PORT, LABEL_SERIAL_BAUD, data)
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
