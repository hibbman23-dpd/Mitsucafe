"""
print_server.py — Flask server trên Mac Mini/RPi.

Nhận ESC/POS raw bytes từ GAS → forward TCP 9100 tới Xprinter.

Hai endpoint:
  POST /print/label    → XP-365B  (tem dán cốc 40×30mm)
  POST /print/receipt  → POS-58L  (hóa đơn 58mm)
  POST /print          → backward-compat → /print/receipt
  GET  /health         → status cả 2 máy in

ENV vars (set trong launchd plist hoặc .env):
  LABEL_PRINTER_IP     IP của XP-365B trên LAN   (default: 192.168.1.51)
  LABEL_PRINTER_PORT   RAW TCP port XP-365B       (default: 9100)
  RECEIPT_PRINTER_IP   IP của POS-58L trên LAN    (default: 192.168.1.50)
  RECEIPT_PRINTER_PORT RAW TCP port POS-58L       (default: 9100)
  SERVER_PORT          Flask listen port          (default: 5000)
  SOCKET_TIMEOUT       Giây timeout TCP           (default: 5)

Chạy thử:
    python3 print_server.py

Test in tem:
    curl -X POST http://localhost:5000/print/label \
         --data-binary @test_label.bin

Test health:
    curl http://localhost:5000/health
"""

import logging
import os
import socket

from flask import Flask, jsonify, request

# ── Config từ env ─────────────────────────────────────────────────────────────
LABEL_PRINTER_IP   = os.getenv("LABEL_PRINTER_IP",   "192.168.1.51")   # XP-365B
LABEL_PRINTER_PORT = int(os.getenv("LABEL_PRINTER_PORT",   "9100"))

RECEIPT_PRINTER_IP   = os.getenv("RECEIPT_PRINTER_IP",   "192.168.1.50") # POS-58L
RECEIPT_PRINTER_PORT = int(os.getenv("RECEIPT_PRINTER_PORT", "9100"))

SERVER_PORT    = int(os.getenv("SERVER_PORT",    "5000"))
SOCKET_TIMEOUT = float(os.getenv("SOCKET_TIMEOUT", "5"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("print-server")

app = Flask(__name__)


# ── TCP helper ────────────────────────────────────────────────────────────────
def _send(ip: str, port: int, data: bytes) -> int:
    """Mở TCP socket tới máy in, gửi data, trả về số bytes."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(SOCKET_TIMEOUT)
        sock.connect((ip, port))
        sock.sendall(data)
    return len(data)


def _ping(ip: str, port: int) -> bool:
    """Kiểm tra máy in online (không gửi data)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(2.0)
            s.connect((ip, port))
        return True
    except OSError:
        return False


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    """Kiểm tra trạng thái cả 2 máy in."""
    label_ok   = _ping(LABEL_PRINTER_IP,   LABEL_PRINTER_PORT)
    receipt_ok = _ping(RECEIPT_PRINTER_IP, RECEIPT_PRINTER_PORT)
    return jsonify({
        "ok": True,
        "printers": {
            "label": {
                "model":  "XP-365B",
                "usage":  "tem dan coc 40x30mm",
                "ip":     LABEL_PRINTER_IP,
                "port":   LABEL_PRINTER_PORT,
                "online": label_ok,
            },
            "receipt": {
                "model":  "POS-58L",
                "usage":  "hoa don 58mm",
                "ip":     RECEIPT_PRINTER_IP,
                "port":   RECEIPT_PRINTER_PORT,
                "online": receipt_ok,
            },
        },
    }), 200


@app.post("/print/label")
def print_label():
    """
    XP-365B — tem dán cốc 40×30mm.
    Body: ESC/POS raw bytes từ GAS buildLabelEscPos365B().
    """
    data = request.get_data()
    if not data:
        return jsonify({"ok": False, "error": "empty payload"}), 400
    try:
        n = _send(LABEL_PRINTER_IP, LABEL_PRINTER_PORT, data)
        log.info("LABEL   %d bytes → %s:%d", n, LABEL_PRINTER_IP, LABEL_PRINTER_PORT)
        return jsonify({"ok": True, "printer": "label", "bytes": n}), 200
    except socket.timeout:
        log.error("LABEL   timeout %s:%d", LABEL_PRINTER_IP, LABEL_PRINTER_PORT)
        return jsonify({"ok": False, "error": "label printer timeout"}), 504
    except OSError as exc:
        log.error("LABEL   error: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.post("/print/receipt")
def print_receipt():
    """
    POS-58L — hóa đơn nhiệt 58mm.
    Body: ESC/POS raw bytes từ GAS buildReceiptEscPos().
    """
    data = request.get_data()
    if not data:
        return jsonify({"ok": False, "error": "empty payload"}), 400
    try:
        n = _send(RECEIPT_PRINTER_IP, RECEIPT_PRINTER_PORT, data)
        log.info("RECEIPT %d bytes → %s:%d", n, RECEIPT_PRINTER_IP, RECEIPT_PRINTER_PORT)
        return jsonify({"ok": True, "printer": "receipt", "bytes": n}), 200
    except socket.timeout:
        log.error("RECEIPT timeout %s:%d", RECEIPT_PRINTER_IP, RECEIPT_PRINTER_PORT)
        return jsonify({"ok": False, "error": "receipt printer timeout"}), 504
    except OSError as exc:
        log.error("RECEIPT error: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 502


@app.post("/print")
def print_compat():
    """Backward-compat: routes tới /print/receipt (POS-58L)."""
    log.info("COMPAT  /print → /print/receipt")
    return print_receipt()


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    log.info(
        "Print server :%d  |  label=%s:%d (XP-365B)  receipt=%s:%d (POS-58L)",
        SERVER_PORT,
        LABEL_PRINTER_IP, LABEL_PRINTER_PORT,
        RECEIPT_PRINTER_IP, RECEIPT_PRINTER_PORT,
    )
    app.run(host="0.0.0.0", port=SERVER_PORT)
