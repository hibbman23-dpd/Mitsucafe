"""
print_poller.py — Mac Mini polling GAS cho receipt print jobs.

Kiến trúc: Mac Mini tự poll GAS mỗi vài giây qua HTTPS (GAS không thể push
về LAN vì chạy trên Google Cloud).

Gated behind PRINT_ENGINE (giống print_server.py /order route — Task 9), để
rollout đảo ngược được bằng 1 flag duy nhất:

  PRINT_ENGINE=legacy (default)
    1. GET {GAS_URL}?action=pending_print/pending_labels  → đơn chưa in
    2. Với mỗi đơn: build ESC/POS receipt / TSPL label → POST localhost:5001/print/*
    3. GET {GAS_URL}?action=mark_printed/mark_labels_printed  → đánh dấu đã in
    (poller tự render + tự mark GAS, như trước Task 10)

  PRINT_ENGINE=spool
    1. GET {GAS_URL}?action=pending_print/pending_labels  → đơn chưa in
    2. POST order JSON (nguyên) tới localhost:5001/enqueue/labels|receipt
    3. KHÔNG mark GAS ở đây — PrintWorker bên print_server.py in xong mới mark.

ENV vars:
  GAS_WEBAPP_URL      URL GAS Web App (bắt buộc)
  PRINT_SERVER_URL    URL Flask print server (default: http://127.0.0.1:5001)
  POLL_INTERVAL       Giây giữa 2 lần poll (default: 3)
  PRINT_ENGINE        legacy | spool  (default: legacy)
  RECEIPT_MODE        raster | text  (default: raster)
  RASTER_FONT         Đường dẫn tới file .ttf (default: auto-detect)
  RASTER_DOTS_WIDTH   Dot width của máy in (default: 384)
"""

import json
import logging
import os
import sqlite3
import ssl
import time
import urllib.error
import urllib.request

from printlib import (
    LABEL_DOTS_HEIGHT,
    LABEL_DOTS_WIDTH,
    RASTER_DOTS_WIDTH,
    RECEIPT_MODE,
    build_label_tspl,
    build_order_labels_tspl,
    build_receipt,
)

# ── Config ────────────────────────────────────────────────────────────────────
GAS_WEBAPP_URL    = os.getenv("GAS_WEBAPP_URL", "")
REPORT_API_TOKEN  = os.getenv("REPORT_API_TOKEN", "")
_TQ = ("&token=" + REPORT_API_TOKEN) if REPORT_API_TOKEN else ""
PRINT_SERVER_URL  = os.getenv("PRINT_SERVER_URL", "http://127.0.0.1:5001")
POLL_INTERVAL     = float(os.getenv("POLL_INTERVAL", "3"))


def _engine():
    return os.getenv("PRINT_ENGINE", "legacy")


_LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, _LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("print-poller")


# ── macOS SSL fix ─────────────────────────────────────────────────────────────
def _ssl_ctx():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def _printed_by_gateway_local(order_id: str) -> bool:
    try:
        db_path = os.getenv("GATEWAY_DB", "/Users/dpd/Projects/lamha-kissaten/print-server/outbox.db")
        if not os.path.exists(db_path):
            return False
        with sqlite3.connect(db_path, timeout=3) as conn:
            c = conn.cursor()
            c.execute("SELECT 1 FROM outbox WHERE order_id = ? LIMIT 1", (order_id,))
            return c.fetchone() is not None
    except Exception as exc:
        log.warning("_printed_by_gateway_local check error for %s: %s", order_id, exc)
        return False

# ── HTTP helpers ──────────────────────────────────────────────────────────────
def _get_json(url: str, timeout=25) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "PrintPoller/1.0"})
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_ctx()) as resp:
        return json.loads(resp.read().decode())


def _post_bytes(url: str, data: bytes, timeout=25) -> dict:
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/octet-stream", "User-Agent": "PrintPoller/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _post_json(url: str, obj: dict, timeout=25) -> dict:
    body = json.dumps(obj).encode()
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/json", "User-Agent": "PrintPoller/1.0"},
        method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


# ── Poll loops ───────────────────────────────────────────────────────────────
def poll_labels_once() -> bool:
    """Poll GAS lấy đơn cần in tem, in từng tem cho từng ly.
    Trả về True nếu có in tem, False nếu không có hoặc lỗi.
    """
    url = GAS_WEBAPP_URL + "?action=pending_labels" + _TQ
    try:
        result = _get_json(url)
    except Exception as exc:
        log.warning("GAS pending_labels error: %s", exc)
        return False

    orders = result.get("orders") or []
    if not orders:
        log.debug("No pending label orders")
        return False

    log.info("Found %d order(s) for labels", len(orders))
    printed_any = False

    if _engine() == "spool":
        for order in orders:
            order_id = order.get("order_id", "?")
            if order.get("label_printed_at"):
                continue  # Đã được đánh dấu in ở Google Sheets
            items = order.get("items") or []
            if not items:
                log.warning("Order %s: no items, skip labels", order_id)
                continue
            try:
                resp = _post_json(PRINT_SERVER_URL + "/enqueue/labels", {"order": order})
                if not resp.get("ok"):
                    raise RuntimeError(f"enqueue labels: {resp}")
                log.info("Labels enqueued for %s (%d new)", order_id, resp.get("enqueued", 0))
                printed_any = True
            except Exception as exc:
                log.error("Labels enqueue failed for %s: %s", order_id, exc)
        return printed_any

    # legacy: tự render + POST /print/label + tự mark GAS
    for order in orders:
        order_id = order.get("order_id", "?")
        if order.get("label_printed_at"):
            continue  # Đã được đánh dấu in ở Google Sheets

        # Chống in trùng: Nếu Gateway local đã mint/in đơn này tại quán -> chỉ mark GAS, không in trùng
        if _printed_by_gateway_local(order_id):
            log.info("Order %s already processed locally by Gateway; marking GAS label_printed_at", order_id)
            try:
                mark_url = GAS_WEBAPP_URL + f"?action=mark_labels_printed&order_id={order_id}" + _TQ
                _get_json(mark_url)
            except Exception as exc:
                log.warning("mark_labels_printed failed for local order %s: %s", order_id, exc)
            continue
        items    = order.get("items") or []

        cups = []
        for it in items:
            qty = max(1, int(it.get("qty", 1)))
            for _ in range(qty):
                cups.append(it)
        total = len(cups)

        if total == 0:
            log.warning("Order %s: no items, skip labels", order_id)
            continue

        all_ok = True
        try:
            labels_data = build_order_labels_tspl(order, cups)
            resp = _post_bytes(PRINT_SERVER_URL + "/print/label", labels_data)
            if not resp.get("ok"):
                raise RuntimeError(f"Print server: {resp}")
            log.info("Labels printed for %s (%d cup(s), %d bytes)", order_id, total, resp.get("bytes", 0))
            printed_any = True
        except Exception as exc:
            log.error("Labels failed for %s: %s", order_id, exc)
            all_ok = False

        if all_ok:
            try:
                mark_url = GAS_WEBAPP_URL + f"?action=mark_labels_printed&order_id={order_id}" + _TQ
                _get_json(mark_url)
                log.info("Labels marked: %s (%d cup(s))", order_id, total)
            except Exception as exc:
                log.warning("mark_labels_printed failed  %s: %s", order_id, exc)

    return printed_any


def poll_once() -> bool:
    """Poll GAS lấy đơn cần in hoá đơn, in trực tiếp.
    Trả về True nếu có in hoá đơn, False nếu không có hoặc lỗi.
    """
    url = GAS_WEBAPP_URL + "?action=pending_print" + _TQ
    try:
        result = _get_json(url)
    except Exception as exc:
        log.warning("GAS pending_print error: %s", exc)
        return False

    orders = result.get("orders") or []
    if not orders:
        log.debug("No pending print orders")
        return False

    log.info("Found %d order(s) to print", len(orders))
    printed_any = False

    if _engine() == "spool":
        for order in orders:
            order_id = order.get("order_id", "?")
            method = ((order.get("payment") or {}).get("method") or "cash")
            is_cash = str(method).lower() in ("cash", "tien_mat", "tienmat")
            try:
                # tag='bill' BẮT BUỘC. Máy quán in hoá đơn lúc thanh toán với key
                # '<order_id>:bill:0'; không gửi tag thì route mặc định 'receipt',
                # ra key khác, dedup không bắt và in thêm tờ thứ hai. Tờ thừa đó lại
                # không có tổng tiền (show_total chỉ bật khi tag=='bill') nên nhìn
                # y hệt phiếu bếp. Đơn online chưa in tại quán vẫn in bình thường —
                # key ':bill:0' của nó chưa tồn tại.
                resp = _post_json(PRINT_SERVER_URL + "/enqueue/receipt",
                                  {"order": order, "is_cash": is_cash, "tag": "bill"})
                if not resp.get("ok"):
                    raise RuntimeError(f"enqueue receipt: {resp}")
                log.info("Receipt enqueued for %s (%d new)", order_id, resp.get("enqueued", 0))
                printed_any = True
            except Exception as exc:
                log.error("Receipt enqueue failed for %s: %s", order_id, exc)
        return printed_any

    # legacy: tự render ESC/POS + POST /print/receipt + tự mark GAS
    for order in orders:
        order_id = order.get("order_id", "?")
        # Chống in trùng hoá đơn: Nếu Gateway local đã mint/in đơn này tại quán -> chỉ mark GAS, không in trùng
        if _printed_by_gateway_local(order_id):
            log.info("Order %s already processed locally by Gateway; marking GAS printed_at", order_id)
            try:
                mark_url = GAS_WEBAPP_URL + f"?action=mark_printed&order_id={order_id}" + _TQ
                _get_json(mark_url)
            except Exception as exc:
                log.warning("mark_printed failed for local order %s: %s", order_id, exc)
            continue
        try:
            esc = build_receipt(order)
            resp = _post_bytes(PRINT_SERVER_URL + "/print/receipt", esc)
            if not resp.get("ok"):
                raise RuntimeError(f"Print server error: {resp}")
            log.info("Printed receipt for %s (%d bytes, mode=%s)",
                     order_id, resp.get("bytes", 0), RECEIPT_MODE)
            printed_any = True

            mark_url = GAS_WEBAPP_URL + f"?action=mark_printed&order_id={order_id}" + _TQ
            _get_json(mark_url)
            log.info("Marked printed: %s", order_id)

        except Exception as exc:
            log.error("Failed to print %s: %s", order_id, exc)

    return printed_any


def main():
    if not GAS_WEBAPP_URL:
        log.error("GAS_WEBAPP_URL is not set. Set the env var and restart.")
        return

    log.info(
        "Print poller started | GAS=%s... | server=%s | interval=%.1fs | receipt=%s | label=%dx%d",
        GAS_WEBAPP_URL[:60],
        PRINT_SERVER_URL,
        POLL_INTERVAL,
        RECEIPT_MODE,
        LABEL_DOTS_WIDTH,
        LABEL_DOTS_HEIGHT,
    )

    current_interval = POLL_INTERVAL
    while True:
        had_work = False
        try:
            if poll_labels_once():
                had_work = True
        except Exception as exc:
            log.error("poll_labels_once unhandled: %s", exc)
        try:
            if poll_once():
                had_work = True
        except Exception as exc:
            log.error("poll_once unhandled: %s", exc)

        if had_work:
            current_interval = POLL_INTERVAL
        else:
            current_interval = min(10.0, current_interval + 1.0)

        time.sleep(current_interval)


if __name__ == "__main__":
    main()
