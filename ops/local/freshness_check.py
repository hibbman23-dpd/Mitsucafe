# -*- coding: utf-8 -*-
"""freshness_check.py — Kiểm tra tính tươi mới và toàn vẹn của dữ liệu đồng bộ từ Google Sheets."""
import os
import sys
import datetime
import pandas as pd
from common import LOCAL, DATA_LATEST, quan, tg_send, ping

def main():
    q = quan()
    today = datetime.date.today()
    yesterday = today - datetime.timedelta(days=1)
    
    # 1. Pipeline-level check (Kiểm tra kỹ thuật - Alert cứng)
    latest_dir = DATA_LATEST
    
    # Check 1.1: Symlink latest tồn tại
    if not os.path.exists(latest_dir):
        msg = "🚨 <b>[PIPELINE NGHẼN]</b> Symlink <code>local/data/latest</code> không tồn tại hoặc bị hỏng!"
        tg_send(msg)
        sys.exit(1)
        
    # Check 1.2: Check xem latest trỏ vào thư mục hôm qua hoặc hôm nay
    real_path = os.path.realpath(latest_dir)
    dir_name = os.path.basename(real_path)
    try:
        real_date = datetime.date.fromisoformat(dir_name)
        if real_date not in (today, yesterday):
            msg = f"🚨 <b>[PIPELINE NGHẼN]</b> Dữ liệu mới nhất thuộc ngày {dir_name}, không phải hôm qua hoặc hôm nay!"
            tg_send(msg)
            sys.exit(1)
    except ValueError:
        msg = f"🚨 <b>[PIPELINE NGHẼN]</b> Thư mục dữ liệu mới nhất <code>{dir_name}</code> không đúng định dạng YYYY-MM-DD!"
        tg_send(msg)
        sys.exit(1)
        
    # Check 1.3: Thiếu các file CSV quy định trong tabs
    for tab in q["data_source"]["tabs"]:
        csv_file = os.path.join(latest_dir, f"{tab}.csv")
        if not os.path.exists(csv_file):
            msg = f"🚨 <b>[PIPELINE NGHẼN]</b> Thiếu file dữ liệu bắt buộc <code>{tab}.csv</code> trong snapshot!"
            tg_send(msg)
            sys.exit(1)
            
    # Check 1.4: Số dòng giảm so với snapshot ngày trước (nếu có ngày trước)
    # Lấy danh sách snapshot ngày, tìm ngày liền kề trước ngày của snapshot hiện tại
    all_snaps = sorted([
        n for n in os.listdir(os.path.join(LOCAL, "data"))
        if os.path.isdir(os.path.join(LOCAL, "data", n)) and n != "latest"
    ])
    
    if len(all_snaps) >= 2:
        try:
            curr_idx = all_snaps.index(dir_name)
            if curr_idx > 0:
                prev_snap_name = all_snaps[curr_idx - 1]
                prev_orders_path = os.path.join(LOCAL, "data", prev_snap_name, "ORDERS.csv")
                curr_orders_path = os.path.join(latest_dir, "ORDERS.csv")
                
                if os.path.exists(prev_orders_path) and os.path.exists(curr_orders_path):
                    prev_len = len(pd.read_csv(prev_orders_path))
                    curr_len = len(pd.read_csv(curr_orders_path))
                    if curr_len < prev_len:
                        msg = f"🚨 <b>[PIPELINE NGHẼN]</b> Số lượng đơn hàng trong <code>ORDERS.csv</code> bị giảm! Hôm trước: {prev_len} dòng, Hôm nay: {curr_len} dòng."
                        tg_send(msg)
                        sys.exit(1)
        except Exception as e:
            print(f"[warning] Lỗi khi kiểm tra số dòng giảm: {e}")

    # 2. Data-level check (Kiểm tra nghiệp vụ - Alert mềm)
    try:
        orders_df = pd.read_csv(os.path.join(latest_dir, "ORDERS.csv"))
        ts_col = q["data_mapping"]["ORDERS"].get("timestamp", "timestamp")
        status_col = q["data_mapping"]["ORDERS"].get("status", "status")
        
        # Chuyển đổi timestamp
        orders_df[ts_col] = pd.to_datetime(orders_df[ts_col], errors='coerce')
        # Lọc các đơn hàng không bị CANCELLED
        valid_orders = orders_df[orders_df[status_col] != "CANCELLED"]
        
        # Tìm ngày có đơn hàng mới nhất
        if not valid_orders.empty:
            max_ts = valid_orders[ts_col].max()
            max_date = max_ts.date()
        else:
            max_date = None
            
        # Kiểm tra nếu ngày cuối cùng có đơn trước ngày hôm qua
        if max_date is None or max_date < yesterday:
            # Kiểm tra xem hôm qua có phải ngày nghỉ quy định trong QUAN.yaml không
            closed_days = q["shop"].get("closed_days", [])
            yesterday_weekday_str = yesterday.strftime("%A") # e.g. "Monday", "Tuesday"...
            
            # Kiểm tra xem yesterday_weekday_str hoặc ngày định dạng YYYY-MM-DD có nằm trong closed_days không
            is_closed = (yesterday_weekday_str in closed_days) or (yesterday.isoformat() in closed_days)
            
            if not is_closed:
                msg = f"ℹ️ <b>[Cảnh báo đơn hàng]</b> Hôm qua ({yesterday.isoformat()}) không ghi nhận đơn hàng mới nào. Quán nghỉ đột xuất hay hệ thống order/đồng bộ gặp lỗi?"
                tg_send(msg)
            else:
                print(f"Hôm qua là ngày nghỉ của quán ({yesterday_weekday_str}), bỏ qua cảnh báo 0 đơn.")
    except Exception as e:
        msg = f"🚨 <b>[PIPELINE NGHẼN]</b> Không thể phân tích dữ liệu <code>ORDERS.csv</code>: {e}"
        tg_send(msg)
        sys.exit(1)
        
    print("Freshness check PASSED.")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FAIL: {e}", file=sys.stderr)
        sys.exit(1)
    ping("freshness")
