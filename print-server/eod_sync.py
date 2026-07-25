"""eod_sync.py — push finalized (PAID/CANCELLED) orders to GAS for archival, once
finalized. Time-independent: any run picks up all unsynced-finalized rows, so a late
run, an outage, or a crash simply catches up next time. Re-runnable (synced_at gate).
"""
import logging
import shutil
from datetime import datetime, timedelta, timezone

_VN = timezone(timedelta(hours=7))

log = logging.getLogger("eod_sync")


def sync_finalized(store, post_fn):
    """For each finalized-unsynced order, call post_fn(order) -> {ok: bool}.
    On ok, mark synced. Returns {pushed, failed}."""
    pushed, failed = 0, 0
    for order in store.unsynced_finalized():
        try:
            d = post_fn(order)
        except Exception as exc:
            log.error("EOD push failed for %s: %s", order.get("order_id"), exc)
            d = {"ok": False}
        if d and d.get("ok"):
            store.mark_synced(order["order_id"])
            pushed += 1
        else:
            failed += 1
    return {"pushed": pushed, "failed": failed}


def snapshot_db(db_path, backup_dir):
    """Copy the SQLite file to backup_dir/store-YYYYMMDD-HHMM.db, returns the path."""
    stamp = datetime.now(_VN).strftime("%Y%m%d-%H%M")
    dest = f"{backup_dir.rstrip('/')}/store-{stamp}.db"
    shutil.copy2(db_path, dest)
    return dest


def build_gas_payload(order):
    """Map a materialized order row to the GAS ingest_order contract for EOD archive."""
    return {
        "action": "ingest_order",
        "order_id": order["order_id"],
        "gateway_order_id": order["order_id"],
        "gateway_short_code": order.get("short_code", ""),
        "metadata": {"short_code": order.get("short_code", ""),
                     "delivery_type": order.get("delivery_type", "dine_in"),
                     "source": order.get("source", "staff")},
        "table_id": order.get("table_id", ""),
        "customer_name": (order.get("bill_meta") or {}).get("customer_name", ""),
        "items": order.get("items", []),
        "total": order.get("total", 0),
        "payment_status": "PAID" if order.get("paid") else "UNPAID",
        "receipt_printed_local": True,
    }
