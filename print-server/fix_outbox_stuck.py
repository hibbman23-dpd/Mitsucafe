"""
fix_outbox_stuck.py — Repair payload data in outbox.db (add channel/sku/qty via
normalize_order_payload) and resync stuck rows to Google Sheets.

⚠️ TOUCHES PROD DATA. Guarded:
  - Default = DRY RUN: preview what would change, write nothing, no network.
  - `--yes` = actually rewrite payloads + run sync loop.
  - Refuses to run against a DB that a live print_server.py is holding, unless `--force`
    (running a second Gateway + syncer over the live DB races the service's own syncer).

Usage:
    python3 fix_outbox_stuck.py            # dry run (safe preview)
    python3 fix_outbox_stuck.py --yes      # apply (stop the live service first, or add --force)
"""

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))

from gateway import Gateway, normalize_order_payload

DB_PATH = os.environ.get("GATEWAY_DB", os.path.join(os.path.dirname(__file__), "outbox.db"))


def _live_server_running() -> bool:
    try:
        out = subprocess.run(["pgrep", "-f", "print_server.py"], capture_output=True, text=True)
        return bool(out.stdout.strip())
    except Exception:
        return False


def repair_and_resync_outbox(apply: bool, force: bool):
    import sqlite3
    mode = "APPLY" if apply else "DRY RUN (no writes, no network)"
    print("=" * 66)
    print(f"🔧 REPAIR & RESYNC OUTBOX — {mode}  ({DB_PATH})")
    print("=" * 66 + "\n")

    if apply and _live_server_running() and not force:
        print("🛑 REFUSING: a live print_server.py is running and holds this DB.")
        print("   Running a second Gateway + syncer here races the service's own syncer")
        print("   (double-sync / lock contention). Stop the service first:")
        print("     launchctl bootout gui/$(id -u)/com.lamha.kissaten.printserver")
        print("   then re-run with --yes, and bootstrap it again after. Or add --force to override.")
        sys.exit(2)

    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT seq, op, order_id, last_error, payload FROM outbox WHERE synced_at IS NULL"
    ).fetchall()
    print(f"Found {len(rows)} unsynced outbox rows.\n")

    changed = 0
    for r in rows:
        try:
            payload = json.loads(r["payload"])
            norm = normalize_order_payload(payload)
            if json.dumps(norm, sort_keys=True) == json.dumps(payload, sort_keys=True):
                continue  # nothing to repair
            changed += 1
            before_items = [(i.get("name"), i.get("sku"), i.get("qty")) for i in (payload.get("items") or [])]
            after_items = [(i.get("name"), i.get("sku"), i.get("qty")) for i in (norm.get("items") or [])]
            print(f"  seq={r['seq']} {r['op']} {r['order_id']}")
            print(f"    err : {str(r['last_error'])[:70]}")
            print(f"    from: {before_items}")
            print(f"    to  : {after_items}")
            if apply:
                conn.execute(
                    "UPDATE outbox SET payload=?, attempts=0, last_error=NULL WHERE seq=?",
                    (json.dumps(norm), r["seq"]))
        except Exception as exc:
            print(f"  ❌ seq={r['seq']} repair error: {exc}")

    print(f"\n{'Rewrote' if apply else 'Would rewrite'} {changed} payload(s).")

    if not apply:
        print("\nDRY RUN — nothing written, no sync. Re-run with --yes to apply.")
        print("=" * 66)
        return

    conn.commit()
    from print_server import _resolve_server_auth_token
    gas_url = os.getenv("GAS_WEBAPP_URL") or ""
    token = os.getenv("REPORT_API_TOKEN") or _resolve_server_auth_token()
    if not gas_url:
        print("⚠️ GAS_WEBAPP_URL not set — skipping sync. Payloads repaired; the live "
              "service syncer will pick them up on next restart.")
        print("=" * 66)
        return
    gw = Gateway(DB_PATH, gas_url, token)
    print("🚀 Gateway.sync_once() loop...")
    total = 0
    while True:
        try:
            n = gw.sync_once()
            if n == 0:
                break
            total += n
            print(f"   synced {n} (total {total})")
        except Exception as exc:
            print(f"   sync stop: {exc}")
            break
    remaining = conn.execute("SELECT count(*) FROM outbox WHERE synced_at IS NULL").fetchone()[0]
    print(f"✅ synced total {total}. Remaining unsynced: {remaining}")
    print("=" * 66)


if __name__ == "__main__":
    args = set(sys.argv[1:])
    repair_and_resync_outbox(apply="--yes" in args, force="--force" in args)
