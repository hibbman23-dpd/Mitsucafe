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

import json
import logging
import os
import socket
import threading
import time

from flask import Flask, jsonify, request, send_from_directory

# ── Config ────────────────────────────────────────────────────────────────────
RECEIPT_MODE        = os.getenv("RECEIPT_MODE",        "cups")
RECEIPT_PRINTER_IP  = os.getenv("RECEIPT_PRINTER_IP",  "192.168.1.50")
RECEIPT_PRINTER_PORT= int(os.getenv("RECEIPT_PRINTER_PORT", "9100"))
RECEIPT_SERIAL_PORT = os.getenv("RECEIPT_SERIAL_PORT", "/dev/cu.RPP02N")
RECEIPT_SERIAL_BAUD = int(os.getenv("RECEIPT_SERIAL_BAUD", "9600"))
RECEIPT_CUPS_PRINTER= os.getenv("RECEIPT_CUPS_PRINTER", "GEZHI_POS_Printer")

LABEL_MODE          = os.getenv("LABEL_MODE",          "cups")
LABEL_PRINTER_IP    = os.getenv("LABEL_PRINTER_IP",    "192.168.1.51")
LABEL_PRINTER_PORT  = int(os.getenv("LABEL_PRINTER_PORT",   "9100"))
LABEL_SERIAL_PORT   = os.getenv("LABEL_SERIAL_PORT",   "/dev/cu.XP365B")
LABEL_SERIAL_BAUD   = int(os.getenv("LABEL_SERIAL_BAUD",   "9600"))
LABEL_CUPS_PRINTER  = os.getenv("LABEL_CUPS_PRINTER",  "Xprinter_XP_365B")

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
from printlib import build_label_tspl, build_order_labels_tspl, build_receipt

app = Flask(__name__)

WEB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web"))

from flask import Flask, jsonify, request, send_from_directory, Response

@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin") or "*"
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
    return response

@app.route('/order', methods=['OPTIONS'])
@app.route('/print/label', methods=['OPTIONS'])
@app.route('/print/receipt', methods=['OPTIONS'])
def handle_options():
    return '', 204

def _resolve_server_auth_token():
    token = os.getenv("REPORT_API_TOKEN", "")
    if not token or token == "REPLACE_WITH_REPORT_API_TOKEN":
        try:
            auth_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".claude", ".dispatcher-auth.json"))
            if os.path.exists(auth_file):
                import json
                with open(auth_file, encoding="utf-8") as af:
                    token = json.load(af).get("report_api_token", "")
        except Exception:
            token = ""
    return token

# ── Gateway singleton (🔴 khôi phục — commit b3299dc xoá nhầm khiến /order NameError) ──
GATEWAY = Gateway(
    os.getenv("GATEWAY_DB", os.path.join(os.path.dirname(__file__), "outbox.db")),
    os.getenv("GAS_WEBAPP_URL", ""),
    _resolve_server_auth_token(),
)

# ── Durable print spool (Task 9) ───────────────────────────────────────────────
# Gated behind PRINT_ENGINE — default "legacy" giữ nguyên hành vi cũ hoàn toàn.
from print_spool import PrintSpool
from print_worker import PrintWorker
from transport import build_transport, probe_capabilities
from printlib import label_setup_preamble  # build_label_tspl/build_receipt đã import ở trên

PRINT_ENGINE = os.getenv("PRINT_ENGINE", "legacy")
LABEL_TRANSPORT   = os.getenv("LABEL_TRANSPORT", "cups")
RECEIPT_TRANSPORT = os.getenv("RECEIPT_TRANSPORT", "cups")

SPOOL = PrintSpool(GATEWAY._conn, GATEWAY._lock)

# ── Materialized orders store (Task 5) ─────────────────────────────────────────
from order_store import OrderStore, VersionConflict
import bill_engine
import eod_sync
STORE = OrderStore(GATEWAY._conn, GATEWAY._lock)

# ── Online-order inbox (Task 8) ────────────────────────────────────────────────
from online_inbox import OnlineInbox


def _gas_fetch_online():
    """Pull pending online orders from GAS mailbox. Returns [] on any failure so the
    inbox flags offline rather than raising into the poll loop's status."""
    d = GATEWAY._post_to_gas({"action": "pending_online_orders"})
    return d.get("orders", []) if isinstance(d, dict) else []


INBOX = OnlineInbox(STORE, fetch_fn=(lambda: []) if os.getenv("PRINT_ENGINE") == "noop"
                    else _gas_fetch_online)


@app.get("/inbox")
def inbox_list():
    return jsonify({"ok": True, "pending": INBOX.pending(), "status": INBOX.status()}), 200


@app.post("/inbox/<online_order_id>/accept")
def inbox_accept(online_order_id):
    p = request.get_json(force=True, silent=True) or {}
    minted = GATEWAY.mint_order({
        "idempotency_key": "online:" + online_order_id,
        "metadata": {"delivery_type": "pickup", "source": "online"},
        "table_id": p.get("table_id", ""),
        "customer_name": p.get("customer_name", ""),
        "items": p.get("items", []),
    })
    order_id, short_code = minted["order_id"], minted["short_code"]
    STORE.upsert_create({
        "order_id": order_id, "short_code": short_code, "delivery_type": "pickup",
        "table_id": p.get("table_id", ""), "source": "online",
        "items": p.get("items", []),
        "bill_meta": {"customer_name": p.get("customer_name", "")},
    })
    res = INBOX.accept(online_order_id, p)
    return jsonify({"ok": True, "order_id": order_id, "short_code": short_code,
                    "accepted": res["accepted"]}), 200


@app.get("/cloud/status")
def cloud_status():
    st = INBOX.status()
    return jsonify({"ok": True, **st}), 200

def _print_engine():
    return os.getenv("PRINT_ENGINE", "legacy")

def _cups_from_items(order_items):
    cups = []
    for it in order_items:
        for _ in range(max(1, int(it.get("qty", 1)))):
            cups.append(it)
    return cups

def _render_job(job):
    payload = json.loads(job["payload_json"])
    if job["kind"] == "receipt":
        show_total = payload.get("show_total", False)
        # HÓA ĐƠN (show_total) → raster có logo Mitsu; PHIẾU PHA CHẾ → theo env (text).
        return build_receipt(payload["order"], is_cash=payload.get("is_cash", False),
                             show_total=show_total, prefer_raster=show_total)
    return build_label_tspl(payload["order"], payload["item"],
                            job["seq_in_order"], job["total_in_order"], include_header=False)

def _gas_mark(order_id, kind):
    action = "mark_labels_printed" if kind == "label" else "mark_printed"
    try:
        d = _gas_post({"action": action, "order_id": order_id})
        return bool(d.get("ok"))
    except Exception:
        return False

def _spool_alert(job, err):
    text = f"⚠️ In hỏng: {job.get('idempotency_key')} — {str(err)[:200]}"
    log.error("[SPOOL FAILED] %s", text)
    try:
        _gas_post({"action": "notify_admin", "text": text})
    except Exception:
        pass

def _reconcile_gas_marks_once():
    n = 0
    for pm in SPOOL.pending_gas_marks():
        if _gas_mark(pm["order_id"], pm["kind"]):
            SPOOL.set_gas_marked(pm["order_id"], pm["kind"])
            n += 1
    return n

def _start_workers():
    if PRINT_ENGINE != "spool":
        return
    def _spawn(printer, kind_transport, cfg, pacing_s):
        transport = build_transport(kind_transport, cfg)
        caps = probe_capabilities(transport, printer)
        preamble = label_setup_preamble() if printer == "label" else b""
        worker = PrintWorker(printer, SPOOL, transport, caps, _render_job,
                             setup_preamble=preamble, gas_mark=_gas_mark,
                             alert=_spool_alert, pacing_s=pacing_s)
        def _loop():
            while True:
                worked = False
                try:
                    worked = worker.process_one()
                except Exception as exc:
                    log.error("worker %s loop error: %s", printer, exc)
                time.sleep(0.0 if worked else 0.2)
        threading.Thread(target=_loop, daemon=True, name=f"printworker-{printer}").start()
        log.info("print worker started: printer=%s transport=%s caps=%s", printer, kind_transport, caps)

    _spawn("label", LABEL_TRANSPORT,
           {"cups_printer": LABEL_CUPS_PRINTER, "vid": LABEL_USB_VID, "pid": LABEL_USB_PID,
            "ep_out": LABEL_USB_EP, "ip": LABEL_PRINTER_IP, "port": LABEL_PRINTER_PORT,
            "serial_port": LABEL_SERIAL_PORT}, pacing_s=0.1)
    _spawn("receipt", RECEIPT_TRANSPORT,
           {"cups_printer": RECEIPT_CUPS_PRINTER, "vid": RECEIPT_USB_VID, "pid": RECEIPT_USB_PID,
            "ep_out": RECEIPT_USB_EP, "ip": RECEIPT_PRINTER_IP, "port": RECEIPT_PRINTER_PORT,
            "serial_port": RECEIPT_SERIAL_PORT}, pacing_s=0.05)

    def _reconcile_loop():
        last_purge = 0.0  # 0 → chạy purge ngay lần đầu, sau đó ~mỗi 24h
        while True:
            try:
                _reconcile_gas_marks_once()
            except Exception as exc:
                log.error("gas reconcile error: %s", exc)
            now = time.time()
            if now - last_purge >= 86400:
                last_purge = now
                try:
                    spool_n = SPOOL.purge_old(7)
                    outbox_n = GATEWAY.purge_synced(7)
                    log.info("retention purge: print_spool=%d row(s), outbox=%d row(s) deleted",
                             spool_n, outbox_n)
                    if spool_n > 5000 or outbox_n > 5000:
                        log.warning(
                            "retention purge deleted a large number of rows (spool=%d outbox=%d) — "
                            "consider running VACUUM on outbox.db manually during low-traffic window "
                            "(not done automatically: VACUUM locks the DB)", spool_n, outbox_n)
                except Exception as exc:
                    log.error("retention purge error: %s", exc)
            time.sleep(15)
    threading.Thread(target=_reconcile_loop, daemon=True, name="gas-reconciler").start()

_start_workers()


@app.post("/enqueue/labels")
def enqueue_labels_route():
    p = request.get_json(force=True, silent=True) or {}
    order = p.get("order") or {}
    cups = p.get("cups") or _cups_from_items(order.get("items", []))
    n = SPOOL.enqueue_labels(order, cups)
    return jsonify({"ok": True, "enqueued": n}), 200

@app.post("/enqueue/single_label")
def enqueue_single_label_route():
    p = request.get_json(force=True, silent=True) or {}
    order = p.get("order") or {}
    cup_item = p.get("cup_item") or {}
    cup_index = int(p.get("cup_index", 1))
    total_cups = int(p.get("total_cups", 1))
    n = SPOOL.enqueue_single_label(order, cup_item, cup_index, total_cups)
    return jsonify({"ok": True, "enqueued": n}), 200

@app.post("/enqueue/receipt")
def enqueue_receipt_route():
    p = request.get_json(force=True, silent=True) or {}
    order = p.get("order") or {}
    is_cash = bool(p.get("is_cash", False))
    copies = 1
    tag = p.get("tag", "receipt")
    force = bool(p.get("force", False))
    n = SPOOL.enqueue_receipt(order, is_cash, copies=copies, tag=tag, force=force)
    return jsonify({"ok": True, "enqueued": n}), 200


@app.get("/token")
def get_token():
    token = _resolve_server_auth_token()
    return jsonify({"ok": True, "token": token}), 200

@app.get("/kds.html")
def serve_kds():
    file_path = os.path.join(WEB_DIR, "kds.html")
    if not os.path.exists(file_path):
        return jsonify({"ok": False, "error": "kds.html not found"}), 404
    with open(file_path, encoding="utf-8") as f:
        html = f.read()
    token = _resolve_server_auth_token()
    if token:
        html = html.replace("__REPORT_API_TOKEN__", token)
    return Response(html, mimetype="text/html")

@app.get("/order.html")
def serve_order():
    return send_from_directory(WEB_DIR, "order.html")

@app.get("/menu-data.js")
def serve_menu_data():
    return send_from_directory(WEB_DIR, "menu-data.js")

@app.get("/order-api.js")
def serve_order_api():
    return send_from_directory(WEB_DIR, "order-api.js")

@app.get("/checkout.js")
def serve_checkout():
    return send_from_directory(WEB_DIR, "checkout.js")

@app.get("/mitsu.css")
def serve_mitsu_css():
    return send_from_directory(WEB_DIR, "mitsu.css")

def _now_iso_server():
    from datetime import datetime, timezone, timedelta
    return datetime.now(timezone(timedelta(hours=7))).isoformat()

def _print_label_bytes(data: bytes) -> int:
    return _label_send(data)["bytes"]

# Máy in bill GEZHI clone MỞ KÉT bằng pin 48 (0x30), KHÔNG phải pin 0 chuẩn (đã test vật lý).
# Xung mạnh on=255,off=255 để solenoid throw chắc.
_DRAWER_KICK = b'\x1b\x70\x30\xff\xff'   # ESC p 0x30 0xff 0xff

def _kick_cash_drawer() -> None:
    """Mở két = 1 job raw RIÊNG (xung sạch, không nhúng vào bill raster để tránh bị nuốt)."""
    import subprocess
    try:
        subprocess.run(["lpr", "-P", RECEIPT_CUPS_PRINTER, "-o", "raw"],
                       input=_DRAWER_KICK, capture_output=True, check=True, timeout=8)
    except Exception as exc:
        log.warning("cash drawer kick failed: %s", exc)

def _print_receipt_bytes(data: bytes, open_drawer: bool = False) -> int:
    n = _send(RECEIPT_MODE, RECEIPT_PRINTER_IP, RECEIPT_PRINTER_PORT,
              RECEIPT_SERIAL_PORT, RECEIPT_SERIAL_BAUD, data,
              usb_vid=RECEIPT_USB_VID, usb_pid=RECEIPT_USB_PID,
              usb_ep=RECEIPT_USB_EP, cups_printer=RECEIPT_CUPS_PRINTER)
    if open_drawer:   # chỉ tiền mặt (gate ở caller) — VietQR không mở
        _kick_cash_drawer()
    return n

def _gas_post(payload: dict, timeout=8) -> dict:
    body = json.dumps({**payload, "token": GATEWAY.token}).encode()
    req = urllib.request.Request(GATEWAY.gas_url, data=body,
          headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_ctx()) as r:
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


_printer_locks = {}
_printer_locks_guard = threading.Lock()

def _get_printer_lock(printer_name: str) -> threading.Lock:
    with _printer_locks_guard:
        if printer_name not in _printer_locks:
            _printer_locks[printer_name] = threading.Lock()
        return _printer_locks[printer_name]


def _wait_cups_queue_empty(printer_name: str, max_wait: float = 15.0) -> bool:
    """Đợi cho đến khi hàng đợi CUPS của máy in rảnh 100% trước khi gửi đơn tiếp theo."""
    import time, subprocess
    start = time.time()
    while time.time() - start < max_wait:
        res = subprocess.run(["lpstat", "-o", printer_name], capture_output=True, text=True)
        if not res.stdout.strip():
            return True
        time.sleep(0.3)
    return False


def _send_cups(printer_name: str, data: bytes, drawer: bool = False) -> int:
    import subprocess
    lock = _get_printer_lock(printer_name or "default")
    with lock:
        # 1. Đợi hàng đợi CUPS rảnh 100% để tránh xung đột cổng USB giữa các đơn
        _wait_cups_queue_empty(printer_name, max_wait=15.0)

        # 2. Tự động gỡ kẹt queue nếu CUPS từng bị pause/stalled
        try:
            subprocess.run(["cupsenable", printer_name], capture_output=True, timeout=3)
            subprocess.run(["cupsaccept", printer_name], capture_output=True, timeout=3)
        except Exception:
            pass

        # 3. Gửi 1 luồng dữ liệu đơn hoàn chỉnh (Single Payload) per order cho máy in
        cmd = ["lpr", "-P", printer_name, "-o", "raw"]
        last_exc = None
        for attempt in range(2):
            try:
                proc = subprocess.run(cmd, input=data, capture_output=True, check=True, timeout=20)
                num_labels = data.count(b"PRINT ")
                if num_labels > 0:
                    wait_time = max(1.5, num_labels * 0.52 + 0.8)
                else:
                    wait_time = 1.0
                time.sleep(wait_time)
                log.info("[PRINT VERIFIED SUCCESS] printer=%s, bytes=%d, labels_cnt=%d",
                         printer_name, len(data), num_labels)
                return len(data)
            except Exception as exc:
                last_exc = exc
                log.warning("CUPS print attempt %d failed for %s: %s", attempt + 1, printer_name, exc)
                try:
                    subprocess.run(["cupsenable", printer_name], capture_output=True, timeout=3)
                except Exception:
                    pass
                time.sleep(0.8)
        raise last_exc


def _send(mode: str, ip: str, port: int, serial_port: str, baud: int, data: bytes,
          usb_vid: int = 0, usb_pid: int = 0, usb_ep: int = 0x01, cups_printer: str = "",
          drawer: bool = False) -> int:
    if mode == "cups":
        return _send_cups(cups_printer or RECEIPT_CUPS_PRINTER, data, drawer=drawer)
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


def _ping_cups(printer_name: str) -> bool:
    try:
        import subprocess
        res = subprocess.run(["lpstat", "-p", printer_name], capture_output=True, text=True, timeout=5)
        if res.returncode != 0:
            return False
        out = (res.stdout or "").lower()
        # returncode=0 CẢ khi queue bị disable → phải soi text. 'disabled'(EN)/'tắt'(VN) = offline.
        if "disabled" in out or "tắt" in out:
            return False
        return True
    except Exception:
        return False


def _ping(mode: str, ip: str, port: int, serial_port: str,
          usb_vid: int = 0, usb_pid: int = 0, cups_printer: str = "") -> bool:
    if mode == "cups":
        return _ping_cups(cups_printer)
    if mode == "usb":
        return _ping_usb(usb_vid, usb_pid)
    if mode == "serial":
        return _ping_serial(serial_port)
    return _ping_tcp(ip, port)


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    receipt_ok = _ping(RECEIPT_MODE, RECEIPT_PRINTER_IP, RECEIPT_PRINTER_PORT, RECEIPT_SERIAL_PORT,
                       usb_vid=RECEIPT_USB_VID, usb_pid=RECEIPT_USB_PID, cups_printer=RECEIPT_CUPS_PRINTER)
    label_ok   = _ping(LABEL_MODE,   LABEL_PRINTER_IP,   LABEL_PRINTER_PORT,   LABEL_SERIAL_PORT,
                       usb_vid=LABEL_USB_VID, usb_pid=LABEL_USB_PID, cups_printer=LABEL_CUPS_PRINTER)

    def _conn_str(mode, serial_port, ip, port, vid, pid, cups_printer):
        if mode == "cups":   return cups_printer
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
                                    RECEIPT_PRINTER_PORT, RECEIPT_USB_VID, RECEIPT_USB_PID, RECEIPT_CUPS_PRINTER),
                "online": receipt_ok,
            },
            "label": {
                "model":  "XP-365B",
                "usage":  "tem dan coc 50x30mm",
                "mode":   LABEL_MODE,
                "conn":   _conn_str(LABEL_MODE, LABEL_SERIAL_PORT, LABEL_PRINTER_IP,
                                    LABEL_PRINTER_PORT, LABEL_USB_VID, LABEL_USB_PID, LABEL_CUPS_PRINTER),
                "online": label_ok,
            },
        },
        "spool": {"label": SPOOL.stats("label"), "receipt": SPOOL.stats("receipt")},
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
                  cups_printer=RECEIPT_CUPS_PRINTER, drawer=True)
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
                  usb_vid=LABEL_USB_VID, usb_pid=LABEL_USB_PID, usb_ep=LABEL_USB_EP,
                  cups_printer=LABEL_CUPS_PRINTER)
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
        "total": payload.get("total", 0),
        "payment": payload.get("payment") or {"method": "cash", "status": payload.get("payment_status", "PENDING")},
        "payment_status": payload.get("payment_status") or (payload.get("payment") or {}).get("status") or "PENDING",
        "metadata": {"short_code": short_code,
                     "delivery_type": (payload.get("metadata") or {}).get("delivery_type", "dine_in"),
                     "notes": (payload.get("metadata") or {}).get("notes", "")},
        "items": payload.get("items", []),
    }

    is_paid = bool((payload.get("payment") or {}).get("status") == "PAID" or payload.get("payment_status") == "PAID")

    # Materialize into the daytime orders store (Task 5) — read routes (/orders,
    # /order/<id>, /orders/changes) serve off this, independent of the outbox log.
    STORE.upsert_create({
        "order_id": order_id,
        "short_code": short_code,
        "delivery_type": order["metadata"]["delivery_type"],
        "table_id": order["table_id"],
        "source": (payload.get("metadata") or {}).get("source", "staff"),
        "items": order["items"],
        "total": order.get("total", 0),
        "paid": is_paid,
        "customer_note": order["metadata"].get("notes", ""),
        "bill_meta": {},
    })

    cups = []
    for it in order["items"]:
        for _ in range(max(1, int(it.get("qty", 1)))):
            cups.append(it)

    # Đơn đã được ghi vào outbox trong GATEWAY.mint_order (atomic, trước khi in).
    # Ở đây chỉ in tem; in lỗi KHÔNG mất đơn (record đã có, syncer vẫn đẩy lên GAS).
    printed_ok, warning = True, None
    # PHIẾU PHA CHẾ (tag=prep) in MỌI đơn lúc tạo — vé cho bar pha, KHÔNG mở két.
    # HÓA ĐƠN (tag=bill) chỉ in khi đơn đã thanh toán ngay (quickPay) — mở két nếu tiền mặt.
    # 2 tag khác nhau => key idempotency khác => KHÔNG bị dedup nuốt, cả hai đều ra.
    if _print_engine() == "noop":
        pass  # tests: skip physical enqueue entirely (no hardware, no spool)
    elif _print_engine() == "spool":
        if cups:
            SPOOL.enqueue_labels(order, cups)
        SPOOL.enqueue_receipt(order, is_cash=False, tag="prep")
        if is_paid:
            SPOOL.enqueue_receipt(order, is_cash=True, tag="bill")
    else:
        if cups:
            def _async_print_labels():
                try:
                    all_labels = build_order_labels_tspl(order, cups)
                    n = _print_label_bytes(all_labels)
                    log.info("order_create LABELS (%d cups, %d bytes) for %s", len(cups), n, order_id)
                except Exception as exc:
                    log.error("label print failed %s: %s", order_id, exc)
            threading.Thread(target=_async_print_labels, daemon=True).start()
        try:
            _print_receipt_bytes(build_receipt(order), open_drawer=False)
        except Exception as exc:
            log.error("prep ticket print failed %s: %s", order_id, exc)
        if is_paid:
            try:
                _print_receipt_bytes(build_receipt(order, show_total=True), open_drawer=True)
            except Exception as exc:
                log.error("bill print failed %s: %s", order_id, exc)

    return jsonify({"ok": True, "order_id": order_id, "short_code": short_code,
                    "printed": True, "warning": None}), 200

@app.get("/order")
def order_lookup():
    key = request.args.get("key", "")
    found = GATEWAY.get_by_key(key) if key else None
    if not found:
        return jsonify({"ok": True, "found": False}), 200
    return jsonify({"ok": True, "found": True, **found}), 200

@app.get("/orders")
def orders_list():
    from gateway import _today_str
    return jsonify({"ok": True, "orders": STORE.list_orders(since_date=_today_str()),
                    "now": _now_iso_server()}), 200

@app.get("/order/<order_id>")
def order_get(order_id):
    o = STORE.get(order_id)
    if not o:
        return jsonify({"ok": False, "error": "not found"}), 404
    return jsonify({"ok": True, "order": o}), 200

@app.get("/orders/changes")
def orders_changes():
    since = request.args.get("since", "")
    now = _now_iso_server()
    changes = STORE.changes_since(since)
    return jsonify({"ok": True, "changes": changes, "now": now}), 200


def _enqueue_cancel_ticket(order, cancelled_lines):
    """Print a PHIẾU HỦY/ĐIỀU CHỈNH to the bar so staff stop making voided drinks."""
    if not cancelled_lines or _print_engine() == "noop":
        return
    cancel_order = dict(order)
    cancel_order["items"] = [{"name": c["name"], "sku": c["sku"], "qty": c["removed_qty"]}
                             for c in cancelled_lines]
    cancel_order.setdefault("metadata", {})["notes"] = "PHIẾU HỦY/ĐIỀU CHỈNH"
    if _print_engine() == "spool":
        SPOOL.enqueue_receipt(cancel_order, is_cash=False, tag="cancel")
    elif _print_engine() != "noop":  # legacy
        try:
            _print_receipt_bytes(build_receipt(cancel_order), open_drawer=False)
        except Exception as exc:
            log.error("cancel ticket print failed: %s", exc)


@app.patch("/order/<order_id>/items")
def order_patch_items(order_id):
    p = request.get_json(force=True, silent=True) or {}
    cur = STORE.get(order_id)
    _locked = cur and (cur.get("paid") or cur.get("status") == "VOIDED")
    if _locked and str(p.get("manager_pin") or "") not in ("1234", "9999"):
        return jsonify({"ok": False, "error": "locked_order_needs_pin"}), 403
    try:
        res = bill_engine.apply_items_edit(
            STORE, order_id, p.get("items", []), int(p.get("version", -1)))
    except VersionConflict:
        return jsonify({"ok": False, "error": "version_conflict"}), 409
    except KeyError:
        return jsonify({"ok": False, "error": "not found"}), 404
    _enqueue_cancel_ticket(res["order"], res["cancelled_lines"])
    return jsonify({"ok": True, "order": res["order"],
                    "cancelled_lines": res["cancelled_lines"]}), 200


@app.patch("/order/<order_id>/meta")
def order_patch_meta(order_id):
    p = request.get_json(force=True, silent=True) or {}
    try:
        o = STORE.set_meta(order_id, p.get("customer_note", ""),
                           p.get("bill_meta", {}), int(p.get("version", -1)))
    except VersionConflict:
        return jsonify({"ok": False, "error": "version_conflict"}), 409
    return jsonify({"ok": True, "order": o}), 200


@app.post("/order/<order_id>/split")
def order_split(order_id):
    p = request.get_json(force=True, silent=True) or {}
    try:
        subs = bill_engine.split_order(
            STORE, order_id, p.get("partitions", []), int(p.get("version", -1)))
    except VersionConflict:
        return jsonify({"ok": False, "error": "version_conflict"}), 409
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except KeyError:
        return jsonify({"ok": False, "error": "not found"}), 404
    return jsonify({"ok": True, "suborders": subs}), 200


@app.post("/order/<order_id>/void")
def order_void(order_id):
    p = request.get_json(force=True, silent=True) or {}
    if str(p.get("manager_pin") or "") not in ("1234", "9999"):
        return jsonify({"ok": False, "error": "bad_pin"}), 403
    o = STORE.void_order(order_id, p.get("reason", ""), p.get("staff", ""))
    if o is None:
        return jsonify({"ok": False, "error": "not found"}), 404
    STORE.apply_status(order_id, "VOIDED")  # ensure status mirrors even if void raced
    return jsonify({"ok": True, "order": o}), 200


@app.post("/bill/merge")
def bill_merge():
    p = request.get_json(force=True, silent=True) or {}
    try:
        res = bill_engine.merge_bill(STORE, p.get("order_ids", []))
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except KeyError as e:
        return jsonify({"ok": False, "error": "order not found: %s" % e}), 404
    return jsonify({"ok": True, **res}), 200


@app.post("/bill/<order_id>/print")
def bill_print(order_id):
    o = STORE.get(order_id)
    if not o:
        return jsonify({"ok": False, "error": "not found"}), 404
    if _print_engine() == "noop":
        return jsonify({"ok": True, "printed": False, "engine": "noop"}), 200
    recp = {"order_id": o["order_id"], "items": o["items"], "total": o["total"],
            "metadata": {"short_code": o["short_code"], "notes": o["customer_note"]},
            "table_id": o["table_id"], "bill_meta": o["bill_meta"]}
    if _print_engine() == "spool":
        SPOOL.enqueue_receipt(recp, is_cash=False, tag="bill")
    else:  # legacy
        try:
            _print_receipt_bytes(build_receipt(recp, show_total=True), open_drawer=False)
        except Exception as exc:
            log.error("bill print failed %s: %s", order_id, exc)
    return jsonify({"ok": True, "printed": True}), 200


@app.post("/bill/group/<group_id>/print")
def bill_group_print(group_id):
    try:
        bill = bill_engine.build_group_bill(STORE, group_id)
    except KeyError:
        return jsonify({"ok": False, "error": "group not found"}), 404
    if _print_engine() == "noop":
        return jsonify({"ok": True, "printed": False, "order_ids": bill["order_ids"]}), 200
    recp = {"order_id": group_id, "items": bill["items"], "total": bill["total"],
            "metadata": {"short_code": group_id, "notes": ""}}
    if _print_engine() == "spool":
        SPOOL.enqueue_receipt(recp, is_cash=False, tag="bill")
    else:  # legacy
        try:
            _print_receipt_bytes(build_receipt(recp, show_total=True), open_drawer=False)
        except Exception as exc:
            log.error("group bill print failed %s: %s", group_id, exc)
    return jsonify({"ok": True, "printed": True, "order_ids": bill["order_ids"]}), 200


@app.post("/order/status")
def order_status():
    p = request.get_json(force=True, silent=True) or {}
    order_id, status = p.get("order_id"), p.get("status")
    is_batch = bool(order_id and "," in order_id)
    action = "batch_update_status" if is_batch else "update_status"
    payload = {"action": action, "status": status}
    if is_batch:
        payload["order_ids"] = order_id
    else:
        payload["order_id"] = order_id

    # Local-first: ghi outbox rồi trả NGAY, KHÔNG chờ GAS. Syncer nền (3s) đẩy lên GAS.
    # Bỏ _gas_post đồng bộ (block ≤8s) — đó là nguồn delay của nút Xong.
    GATEWAY.enqueue("status", order_id, f"{order_id}:{status}", payload)
    for _oid in (order_id.split(",") if is_batch else [order_id]):
        STORE.apply_status(_oid.strip(), status)
    return jsonify({"ok": True, "queued": True}), 200

@app.post("/order/mark_paid")
def order_mark_paid():
    p = request.get_json(force=True, silent=True) or {}
    order_id = p.get("order_id")
    # Dựng order cho receipt: ưu tiên outbox (đơn local-first có items+total); else dùng p['order'] KDS gửi.
    recp = GATEWAY.get_create_payload(order_id) or p.get("order")
    if recp:
        # get_create_payload trả payload đã mint (có gateway_order_id/gateway_short_code, KHÔNG có
        # order_id/metadata.short_code). enqueue_receipt lấy order_id từ recp để tạo idempotency_key —
        # thiếu order_id => key ':receipt:0' cho MỌI bill => UNIQUE nuốt hết bill trừ cái đầu. Chuẩn hóa:
        recp = dict(recp)
        recp["order_id"] = order_id or recp.get("gateway_order_id") or recp.get("order_id", "")
        meta = dict(recp.get("metadata") or {})
        if not meta.get("short_code"):
            meta["short_code"] = recp.get("gateway_short_code", "")
        recp["metadata"] = meta
    # skip_receipt: dùng khi Xong gộp bàn (finishTableGroup) — bill tổng đã in riêng,
    # mỗi đơn con chỉ đánh PAID, KHÔNG in bill lẻ (tránh in N+1 bill).
    skip_receipt = bool(p.get("skip_receipt"))
    receipt_printed = False
    if recp and recp.get("items") and not skip_receipt:
        # Mở két CHỈ khi tiền mặt. VietQR/chuyển khoản không có tiền mặt để bỏ két → không kick.
        method = ((recp.get("payment") or {}).get("method")) or p.get("payment_method") or "cash"
        is_cash = str(method).lower() in ("cash", "tien_mat", "tienmat")
        if _print_engine() == "spool":
            SPOOL.enqueue_receipt(recp, is_cash, tag="bill"); receipt_printed = True
        elif _print_engine() != "noop":  # legacy path; noop (tests) must NOT touch the live printer
            try:
                _print_receipt_bytes(build_receipt(recp, show_total=True), open_drawer=is_cash); receipt_printed = True
            except Exception as exc:
                log.error("local receipt failed: %s", exc)
    # Local-first: in bill local xong thì ghi outbox + trả NGAY, KHÔNG chờ GAS (bỏ _gas_post
    # đồng bộ block ≤8s = nguồn delay). Syncer nền đẩy GAS với receipt_printed_local=True để
    # GAS KHÔNG in lần 2. Đây là gốc rễ 45 đơn kẹt: batch cũ gọi GAS trần, hiccup là mất PAID.
    GATEWAY.enqueue("mark_paid", order_id, f"{order_id}:paid",
                    {"action": "mark_paid", "order_id": order_id, "receipt_printed_local": True})
    STORE.apply_paid(order_id, True)
    return jsonify({"ok": True, "queued": True, "receipt_printed_local": receipt_printed}), 200


@app.post("/order/swap_item")
def order_swap_item():
    payload = request.get_json(force=True, silent=True) or {}
    order_id = payload.get("order_id")
    item_index = payload.get("item_index")
    new_item = payload.get("new_item")
    pin = str(payload.get("manager_pin") or "").strip()

    if not order_id or item_index is None or not new_item:
        return jsonify({"ok": False, "error": "Missing order_id, item_index or new_item"}), 400
    if pin not in ("1234", "9999"):
        return jsonify({"ok": False, "error": "Mã PIN Quản lý không đúng!"}), 400

    order_payload = None
    with GATEWAY._lock:
        row = GATEWAY._conn.execute(
            "SELECT payload_json FROM outbox WHERE order_id = ? AND op = 'ingest_order'",
            (order_id,)
        ).fetchone()
        if row:
            p = json.loads(row[0])
            items = p.get("items", [])
            item_idx = int(item_index)
            if 0 <= item_idx < len(items):
                old_item = items[item_idx]
                old_name = old_item.get("name") or old_item.get("sku") or "Món cũ"
                if not new_item.get("modifiers"): new_item["modifiers"] = {}
                new_item["modifiers"]["swap_from"] = old_name
                items[item_idx] = new_item
                p["items"] = items
                p["total"] = sum((float(it.get("price") or 0)) * (int(it.get("qty") or 1)) for it in items)
                GATEWAY._conn.execute(
                    "UPDATE outbox SET payload_json = ? WHERE order_id = ? AND op = 'ingest_order'",
                    (json.dumps(p), order_id)
                )
                GATEWAY._conn.commit()
                order_payload = p

    try:
        if _print_engine() == "spool" and order_payload:
            items = order_payload.get("items", [])
            item_idx = int(item_index)
            SPOOL.enqueue_single_label(order_payload, new_item, item_idx + 1, len(items))
    except Exception as exc:
        log.warning("swap_item single_label print failed: %s", exc)

    swap_key = f"{order_id}:swap:{item_index}:{int(time.time() * 1000)}"
    GATEWAY.enqueue("swap_order_item", order_id, swap_key,
                    {"action": "swap_order_item", "order_id": order_id, "item_index": item_index, "new_item": new_item, "manager_pin": pin})

    return jsonify({"ok": True, "order_id": order_id}), 200



# ── Debug / test endpoints ─────────────────────────────────────────────────────
def _build_test_receipt() -> bytes:
    """Xây dựng hoá đơn Mitsu Café chuẩn (logo, phông chữ, ngắt dòng thông minh) để test máy in."""
    from printlib import build_receipt
    test_order = {
        "order_id": "ORD-TEST-0001",
        "timestamp": _now_iso_server(),
        "table_id": "03",
        "customer_name": "Anh Minh (Khách quen)",
        "customer_id": "0901234567",
        "metadata": {
            "short_code": "Q01",
            "delivery_type": "dine_in",
            "notes": "Ly nắp tim, lấy 2 ống hút bọc kiếng",
        },
        "items": [
            {
                "name": "Trà Sữa Ô Long Nướng Kem Trứng Nướng Sương Sáo",
                "qty": 2,
                "price": 45000,
                "modifiers": {
                    "size": "L",
                    "sugar": "50%",
                    "ice": "less",
                    "toppings": "Trân châu đen, Thạch dừa, Kem cheese",
                },
            },
            {
                "name": "Cà Phê Muối Kem Béo Lâm Hà Đặc Biệt Cốt Dừa",
                "qty": 1,
                "price": 35000,
                "modifiers": {
                    "size": "M",
                    "sugar": "30%",
                    "ice": "full",
                },
            },
        ],
        "total": 125000,
        "payment": {"method": "cash"},
    }
    return build_receipt(test_order)


def _build_test_label(scenario: str = "dine_in") -> bytes:
    """TSPL test label cho XP-365B.
    Chạy: curl http://localhost:5001/test/label?type=dine_in|take_away|delivery|long_name
    """
    import sys, os
    sys.path.insert(0, os.path.dirname(__file__))
    from printlib import build_label_tspl

    fake_order = {
        "order_id": "ORD-TEST-0001",
        "timestamp": _now_iso_server(),
        "table_id":  "03",
        "customer_name": "Anh Minh (Khách quen)",
        "customer_id": "0901234567",
        "metadata":  {"short_code": "Q01", "delivery_type": "dine_in", "notes": "Ly nắp tim, thêm 2 ống hút kiếng"},
        "items": [],
    }
    fake_item = {
        "name":      "Trà Sữa Ô Long Nướng Kem Trứng Nướng Sương Sáo",
        "qty":       1,
        "modifiers": {"size": "L", "sugar": "50%", "ice": "less", "toppings": "Trân châu đen, Kem cheese"},
    }

    if scenario == "take_away":
        fake_order["metadata"]["delivery_type"] = "take_away"
        fake_order["table_id"] = ""
    elif scenario == "delivery":
        fake_order["metadata"]["delivery_type"] = "delivery"
        fake_order["table_id"] = ""
        fake_order["metadata"]["delivery_address"] = "938 Đường Hùng Vương, Lâm Hà"
    elif scenario == "long_name":
        fake_item["name"] = "Trà Sữa Matcha Trân Châu Đường Đen Đặc Biệt"
        fake_item["modifiers"]["toppings"] = "Trân châu hoàng kim, Kem phô mai, Thạch dừa"

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
              usb_vid=LABEL_USB_VID, usb_pid=LABEL_USB_PID, usb_ep=LABEL_USB_EP,
              cups_printer=LABEL_CUPS_PRINTER)
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


@app.route("/test/drawer", methods=["GET", "POST"])
def test_drawer():
    """Bật két tiền với các mã kick khác nhau.
    Chạy: curl http://192.168.1.19:5001/test/drawer?type=pin2|pin5|long|ascii0|ascii1|realtime|bel|star|all
    """
    kick_type = request.args.get("type", "pin2").lower()

    KICK_PATTERNS = {
        "pin2":     b"\x1b@\x1b\x70\x00\x19\xfa\n",
        "pin5":     b"\x1b@\x1b\x70\x01\x19\xfa\n",
        "long":     b"\x1b@\x1b\x70\x00\x32\xfa\x1b\x70\x01\x32\xfa\n",
        "ascii0":   b"\x1b@\x1b\x70\x30\x32\xfa\n",
        "ascii1":   b"\x1b@\x1b\x70\x31\x32\xfa\n",
        "realtime": b"\x1b@\x10\x14\x01\x00\x05\x10\x14\x01\x01\x05\n",
        "bel":      b"\x1b@\x07\n",
        "star":     b"\x1b@\x1b\x07\n",
        "all":      (
            b"\x1b@"
            b"\x1b\x70\x00\x19\xfa"
            b"\x1b\x70\x01\x19\xfa"
            b"\x1b\x70\x00\x32\xfa"
            b"\x1b\x70\x01\x32\xfa"
            b"\x1b\x70\x30\x32\xfa"
            b"\x1b\x70\x31\x32\xfa"
            b"\x10\x14\x01\x00\x05"
            b"\x10\x14\x01\x01\x05"
            b"\x07"
            b"\x1b\x07\n"
        )
    }

    drawer_kick = KICK_PATTERNS.get(kick_type, KICK_PATTERNS["pin2"])

    try:
        n = _send(RECEIPT_MODE, RECEIPT_PRINTER_IP, RECEIPT_PRINTER_PORT,
                  RECEIPT_SERIAL_PORT, RECEIPT_SERIAL_BAUD, drawer_kick,
                  usb_vid=RECEIPT_USB_VID, usb_pid=RECEIPT_USB_PID, usb_ep=RECEIPT_USB_EP,
                  cups_printer=RECEIPT_CUPS_PRINTER, drawer=True)
        log.info("TEST CASH DRAWER KICK SENT (type=%s, %d bytes)", kick_type, n)
        return jsonify({"ok": True, "type": kick_type, "bytes": n, "message": f"Da gui lenh kick type={kick_type} thanh cong."}), 200
    except Exception as exc:
        log.error("TEST CASH DRAWER error: %s", exc)
        return jsonify({"ok": False, "error": str(exc)}), 500


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


def _syncer_loop():
    import time
    interval = float(os.getenv("SYNC_INTERVAL", "3"))
    while True:
        try:
            done = GATEWAY.sync_once()
        except Exception as exc:
            log.error("syncer error: %s", exc)
            done = 0
        time.sleep(interval if done else min(30, interval * 2))


def _start_background_workers():
    """Poll loop + hourly snapshot loop, as daemon threads. No-op under
    PRINT_ENGINE=noop so the test client never spawns background threads."""
    if os.getenv("PRINT_ENGINE") == "noop":
        return

    def _poll_loop():
        while True:
            try:
                # ONLINE_POLL defaults OFF: the GAS-side `pending_online_orders`
                # mailbox action does not exist yet (tracked as a separate
                # follow-up task), so an on-by-default poll would error every
                # ~ONLINE_POLL_SEC seconds on the live server after deploy.
                if os.getenv("ONLINE_POLL", "0") == "1":
                    INBOX.poll()
            except Exception as e:
                log.error("inbox poll error: %s", e)
            time.sleep(int(os.getenv("ONLINE_POLL_SEC", "20")))

    def _snapshot_loop():
        db_path = GATEWAY.db_path
        outdir = os.getenv("BACKUP_DIR", os.path.join(os.path.dirname(__file__), "backups"))
        os.makedirs(outdir, exist_ok=True)
        while True:
            time.sleep(3600)
            try:
                eod_sync.snapshot_db(db_path, outdir)
            except Exception as e:
                log.error("snapshot error: %s", e)

    threading.Thread(target=_poll_loop, daemon=True).start()
    threading.Thread(target=_snapshot_loop, daemon=True).start()


def run_eod_sync():
    """EOD archive is the SOLE GAS pusher ONLY when the realtime syncer is disabled.
    While GATEWAY_SYNC is on, the syncer already archives every order live every 3s, so
    running EOD too would double-push to GAS (different idempotency keys) -> duplicate
    Sheets rows = phantom revenue/loyalty. EOD therefore refuses to run unless the
    operator has explicitly set GATEWAY_SYNC=0 (opting into EOD as the sole pusher)."""
    if os.getenv("GATEWAY_SYNC", "1") != "0":
        log.warning("run_eod_sync skipped: realtime syncer active (GATEWAY_SYNC!=0); EOD redundant")
        return {"skipped": "syncer_active", "pushed": 0, "failed": 0}
    def post(op):
        return GATEWAY._post_to_gas(op)
    return eod_sync.sync_finalized_2op(STORE, post_fn=post)


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__" and os.getenv("RUN_EOD") == "1":
    import sys
    print(run_eod_sync())
    sys.exit(0)

if __name__ == "__main__":
    if os.getenv("GATEWAY_SYNC", "1") == "1":
        threading.Thread(target=_syncer_loop, daemon=True).start()
        log.info("gateway syncer thread started")

    log.info(
        "Print server :%d  |  receipt=%s[%s]  label=%s[%s]",
        SERVER_PORT,
        RECEIPT_SERIAL_PORT if RECEIPT_MODE == "serial" else f"{RECEIPT_PRINTER_IP}:{RECEIPT_PRINTER_PORT}",
        RECEIPT_MODE,
        LABEL_SERIAL_PORT if LABEL_MODE == "serial" else f"{LABEL_PRINTER_IP}:{LABEL_PRINTER_PORT}",
        LABEL_MODE,
    )
    _start_background_workers()
    app.run(host="0.0.0.0", port=SERVER_PORT, threaded=True)
