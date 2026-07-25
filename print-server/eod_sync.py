"""eod_sync.py — push finalized (PAID/CANCELLED) orders to GAS for archival, once
finalized. Time-independent: any run picks up all unsynced-finalized rows, so a late
run, an outage, or a crash simply catches up next time. Re-runnable (synced_at gate).
"""
import shutil
from datetime import datetime, timedelta, timezone

_VN = timezone(timedelta(hours=7))


def sync_finalized(store, post_fn):
    """For each finalized-unsynced order, call post_fn(order) -> {ok: bool}.
    On ok, mark synced. Returns {pushed, failed}."""
    pushed, failed = 0, 0
    for order in store.unsynced_finalized():
        try:
            d = post_fn(order)
        except Exception:
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
