# -*- coding: utf-8 -*-
"""Kéo các tab Sheets → local/data/YYYY-MM-DD/*.csv + symlink latest. Chạy 23:00."""
import csv
import datetime
import os
import sys
from common import LOCAL, quan, ping, get_google_creds

def main():
    q = quan()
    gc = get_google_creds()
    sh = gc.open_by_key(q["data_source"]["sheet_id"])
    day = datetime.date.today().isoformat()
    outdir = os.path.join(LOCAL, "data", day)
    os.makedirs(outdir, exist_ok=True)
    
    for tab in q["data_source"]["tabs"]:
        rows = sh.worksheet(tab).get_all_values()
        with open(os.path.join(outdir, f"{tab}.csv"), "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerows(rows)
        print(f"{tab}: {len(rows)} rows")
        
    latest = os.path.join(LOCAL, "data", "latest")
    if os.path.islink(latest):
        os.unlink(latest)
    elif os.path.exists(latest):
        # Tránh trường hợp latest là thư mục thật do lỗi trước đó
        import shutil
        shutil.rmtree(latest)
        
    os.symlink(outdir, latest)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FAIL: {e}", file=sys.stderr)
        sys.exit(1)
    ping("sheets_pull")
