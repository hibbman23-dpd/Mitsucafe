"""
print_server.py — Flask server trên Mac Mini/RPi nhận lệnh in từ GAS.

GAS POST /print với body = ESC/POS raw bytes →
  forward TCP socket tới Xprinter POS-58L tại PRINTER_IP:9100.

Chạy:
    python3 print_server.py

Production (auto-start trên login): xem launchd.plist
"""
import logging
import os
import socket
import sys

from flask import Flask, request

PRINTER_IP = os.getenv("PRINTER_IP", "192.168.1.50")
PRINTER_PORT = int(os.getenv("PRINTER_PORT", "9100"))
SERVER_PORT = int(os.getenv("SERVER_PORT", "5000"))
SOCKET_TIMEOUT = 5.0

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("print-server")

app = Flask(__name__)


@app.get("/health")
def health():
    return {"ok": True, "printer_ip": PRINTER_IP, "printer_port": PRINTER_PORT}, 200


@app.post("/print")
def print_label():
    data = request.get_data()
    if not data:
        return {"ok": False, "error": "empty payload"}, 400

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(SOCKET_TIMEOUT)
            sock.connect((PRINTER_IP, PRINTER_PORT))
            sock.sendall(data)
        log.info("Sent %d bytes to %s:%s", len(data), PRINTER_IP, PRINTER_PORT)
        return {"ok": True, "bytes": len(data)}, 200
    except socket.timeout:
        log.error("Timeout connecting to printer %s:%s", PRINTER_IP, PRINTER_PORT)
        return {"ok": False, "error": "printer timeout"}, 504
    except OSError as exc:
        log.error("Printer error: %s", exc)
        return {"ok": False, "error": str(exc)}, 502


if __name__ == "__main__":
    log.info("Print server starting on :%s → %s:%s", SERVER_PORT, PRINTER_IP, PRINTER_PORT)
    app.run(host="0.0.0.0", port=SERVER_PORT)
