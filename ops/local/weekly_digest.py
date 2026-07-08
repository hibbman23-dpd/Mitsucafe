# -*- coding: utf-8 -*-
"""weekly_digest.py — Tổng kết tuần, xử lý decay bộ nhớ và phân tích hiệu quả quyết định kinh doanh."""
import os
import sys
import json
import datetime
import subprocess
import pandas as pd
from common import LOCAL, ROOT, quan, tg_send, ping
import memory_store

def update_decision_outcomes():
    """Đo lường hiệu quả các hành động đã duyệt sau 14 ngày bằng dữ liệu ORDERS."""
    q = quan()
    dec_path = os.path.join(memory_store.MEMORY_DIR, "decision_log.jsonl")
    if not os.path.exists(dec_path):
        return
        
    decisions = memory_store.read_jsonl("decision_log.jsonl")
    orders_csv = os.path.join(LOCAL, "data", "latest", "ORDERS.csv")
    if not os.path.exists(orders_csv):
        print("[weekly] Không có ORDERS.csv để đo lường outcome.")
        return
        
    df_orders = pd.read_csv(orders_csv)
    ts_col = q["data_mapping"]["ORDERS"].get("timestamp", "timestamp")
    status_col = q["data_mapping"]["ORDERS"].get("status", "status")
    total_col = q["data_mapping"]["ORDERS"].get("total", "total")
    df_orders[ts_col] = pd.to_datetime(df_orders[ts_col], errors='coerce')
    
    today = datetime.date.today()
    updated = False
    
    for dec in decisions:
        if dec.get("outcome") is not None:
            continue
            
        app_date_str = dec.get("approved_at")
        if not app_date_str:
            continue
            
        app_date = datetime.date.fromisoformat(app_date_str)
        # Chỉ kiểm tra các quyết định đã duyệt từ 14 ngày trước trở lên
        if today - app_date < datetime.timedelta(days=14):
            continue
            
        # Lấy khoảng thời gian trước (14 ngày trước ngày duyệt) và sau (14 ngày kể từ ngày duyệt)
        before_start = app_date - datetime.timedelta(days=14)
        before_end = app_date - datetime.timedelta(days=1)
        after_start = app_date
        after_end = app_date + datetime.timedelta(days=13)
        
        # Tính doanh thu trước và sau
        rev_before = df_orders[
            (df_orders[ts_col].dt.date >= before_start) & 
            (df_orders[ts_col].dt.date <= before_end) & 
            (df_orders[status_col] != "CANCELLED")
        ][total_col].sum()
        
        rev_after = df_orders[
            (df_orders[ts_col].dt.date >= after_start) & 
            (df_orders[ts_col].dt.date <= after_end) & 
            (df_orders[status_col] != "CANCELLED")
        ][total_col].sum()
        
        pct_change = ((rev_after - rev_before) / rev_before * 100) if rev_before > 0 else 0
        dec["outcome"] = f"Doanh thu thay đổi {pct_change:.1f}% trong 14 ngày sau khi thực hiện (Trước: {int(rev_before):,}đ, Sau: {int(rev_after):,}đ)."
        updated = True
        
        # Nếu kết quả tốt hoặc trung hòa (ví dụ dừng campaign mà doanh thu không giảm), đưa thành tri thức lâu dài
        if pct_change >= -5:
            # Tạo 1 pattern mô tả kết quả
            pattern_text = f"Quyết định thực hiện: '{dec['text']}' đã dẫn tới hiệu quả tích cực/ổn định: {dec['outcome']}"
            memory_store.add_quarantine(pattern_text, kind="pattern", period_days=14)
            # Tự động duyệt vì đây là thực tế dữ liệu đo lường được
            q_items = memory_store.read_jsonl("quarantine.jsonl")
            for q_it in q_items:
                if q_it["text"] == pattern_text:
                    memory_store.promote(q_it["id"])
                    break
                    
    if updated:
        memory_store.write_jsonl("decision_log.jsonl", decisions)
        print("[weekly] Đã đo lường và cập nhật kết quả hành động.")

def compute_weekly_stats():
    """Tính toán thống kê doanh thu tuần qua so với tuần trước đó."""
    q = quan()
    orders_csv = os.path.join(LOCAL, "data", "latest", "ORDERS.csv")
    if not os.path.exists(orders_csv):
        return "Chưa có dữ liệu đơn hàng."
        
    df = pd.read_csv(orders_csv)
    ts_col = q["data_mapping"]["ORDERS"].get("timestamp", "timestamp")
    status_col = q["data_mapping"]["ORDERS"].get("status", "status")
    total_col = q["data_mapping"]["ORDERS"].get("total", "total")
    df[ts_col] = pd.to_datetime(df[ts_col], errors='coerce')
    
    today = datetime.date.today()
    
    # Tuần vừa qua (7 ngày gần nhất, không tính hôm nay)
    w_end = today - datetime.timedelta(days=1)
    w_start = today - datetime.timedelta(days=7)
    
    # Tuần trước đó nữa
    prev_w_end = today - datetime.timedelta(days=8)
    prev_w_start = today - datetime.timedelta(days=14)
    
    df_this_w = df[(df[ts_col].dt.date >= w_start) & (df[ts_col].dt.date <= w_end) & (df[status_col] != "CANCELLED")]
    df_prev_w = df[(df[ts_col].dt.date >= prev_w_start) & (df[ts_col].dt.date <= prev_w_end) & (df[status_col] != "CANCELLED")]
    
    rev_this = int(df_this_w[total_col].sum())
    rev_prev = int(df_prev_w[total_col].sum())
    
    pct_change = ((rev_this - rev_prev) / rev_prev * 100) if rev_prev > 0 else 0
    
    return f"""Doanh thu tuần qua ({w_start.isoformat()} đến {w_end.isoformat()}): {rev_this:,}đ.
Doanh thu tuần trước đó ({prev_w_start.isoformat()} đến {prev_w_end.isoformat()}): {rev_prev:,}đ.
Biến động: {pct_change:.1f}%."""

def generate_weekly_digest(stats_str):
    """Gọi Ollama viết tóm tắt tuần và những gì đã học."""
    url = "http://localhost:11434/api/chat"
    
    confirmed = memory_store.read_jsonl("confirmed_patterns.jsonl")
    decisions = memory_store.read_jsonl("decision_log.jsonl")
    
    confirmed_str = "\n".join([f"- {c['text']}" for c in confirmed[-5:]]) or "- Chưa có tri thức mới."
    decisions_str = "\n".join([f"- {d['text']}: {d.get('outcome', 'Chưa đối soát')}" for d in decisions[-5:]]) or "- Chưa thực hiện quyết định nào."
    
    prompt = f"""Bạn là trợ lý ảo Mitsu Café. Hãy viết một báo cáo tuần (Weekly Digest) ngắn gọn dưới 200 từ bằng tiếng Việt cho chủ quán.
Tóm tắt hiệu quả kinh doanh, những tri thức mới ghi nhận được, và kết quả đối soát các quyết định đã duyệt.

[THỐNG KÊ DOANH THU]
{stats_str}

[TRI THỨC MỚI (CONFIRMED)]
{confirmed_str}

[QUYẾT ĐỊNH ĐÃ THỰC THI (DECISION LOG)]
{decisions_str}
"""
    
    payload = {
        "model": "mitsu-insight",
        "stream": False,
        "options": {
            "temperature": 0.4
        },
        "messages": [
            {
                "role": "system",
                "content": "Bạn là trợ lý kinh doanh chuyên nghiệp. Hãy viết báo cáo cực kỳ cô đọng, khách quan, sử dụng markdown."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    }
    
    try:
        r = requests.post(url, json=payload, timeout=90)
        if r.status_code == 200:
            return r.json()["message"]["content"]
    except Exception as e:
        print(f"Error calling Ollama for weekly digest: {e}", file=sys.stderr)
    return "Không thể khởi tạo báo cáo tuần tự động."

def main():
    print("[weekly] Bắt đầu chạy chu kỳ tuần...")
    
    # 1. Snapshot pre-decay
    memory_store.snapshot("pre-decay")
    
    # 2. Xử lý decay (Hết hạn quarantine hoặc demote confirmed)
    memory_store.decay()
    
    # 3. Đo lường hiệu quả quyết định kinh doanh sau 14 ngày
    update_decision_outcomes()
    
    # 4. Snapshot post-decay
    memory_store.snapshot("post-decay")
    
    # 5. Tính toán doanh thu tuần
    stats = compute_weekly_stats()
    
    # 6. Viết digest bằng LLM
    digest = generate_weekly_digest(stats)
    
    # 7. Lưu học máy vào learning-log.md
    log_path = os.path.join(memory_store.MEMORY_DIR, "learning-log.md")
    today_str = datetime.date.today().isoformat()
    log_entry = f"\n## BÁO CÁO TUẦN {today_str}\n\n{digest}\n"
    
    with open(log_path, "a", encoding="utf-8") as lf:
        lf.write(log_entry)
    print(f"[weekly] Đã append báo cáo vào {log_path}")
    
    # 8. Gửi báo cáo lên Telegram
    tg_send(f"📊 <b>BÁO CÁO TỔNG KẾT TUẦN - {today_str}</b>\n\n{digest}")
    
    # 9. Re-build index RAG cục bộ
    print("[weekly] Re-building local KB index...")
    try:
        build_script = os.path.join(ROOT, "ops", "local", "kb_build.js")
        subprocess.run(["node", build_script], check=True)
    except Exception as e:
        print(f"[error] Lỗi re-build RAG: {e}", file=sys.stderr)
        
    # 10. Chạy eval kiểm định chất lượng hệ thống
    print("[weekly] Running system evaluation...")
    try:
        eval_script = os.path.join(ROOT, "eval", "run_eval.py")
        subprocess.run([sys.executable, eval_script], check=True)
    except Exception as e:
        print(f"[error] Lỗi chạy kiểm định eval: {e}", file=sys.stderr)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FAIL: {e}", file=sys.stderr)
        sys.exit(1)
    ping("weekly")
