# -*- coding: utf-8 -*-
"""run_eval.py — Chạy đánh giá tự động chất lượng câu trả lời bằng Golden Questions và Canary."""
import os
import re
import sys
import yaml
import json
import requests
import subprocess
import unicodedata
import datetime
import pandas as pd

# Thiết lập Python path để import từ ops/local/
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.join(ROOT, "ops", "local"))
from common import LOCAL, tg_send, quan


OLLAMA_URL = "http://localhost:11434/api/chat"

def normalize_text(text):
    """Chuẩn hóa văn bản tiếng Việt NFC, viết thường, loại bỏ ký tự đặc biệt thừa."""
    if not text:
        return ""
    text = unicodedata.normalize("NFC", text)
    text = text.lower().strip()
    return text

def query_rag(question):
    """Gọi kb_query.js lấy context tri thức RAG."""
    kb_query_path = os.path.join(ROOT, "ops", "local", "kb_query.js")
    try:
        # Loại bỏ bộ lọc namespace và tăng k lên 10 để bao quát toàn bộ KB
        res = subprocess.run(
            ["node", kb_query_path, "--k=5", question],
            capture_output=True, text=True, check=True
        )
        return json.loads(res.stdout)
    except Exception as e:
        print(f"[warning] Lỗi khi truy vấn RAG: {e}", file=sys.stderr)
        return []

def call_ollama(prompt):
    """Gọi Ollama model mitsu-insight với temperature=0 để đánh giá."""
    payload = {
        "model": "mitsu-insight",
        "stream": False,
        "options": {
            "temperature": 0.0
        },
        "messages": [
            {
                "role": "system",
                "content": "Bạn là trợ lý ảo phân tích số liệu cho quán café. Hãy trả lời cực kỳ ngắn gọn, trực tiếp dựa vào ngữ cảnh. Không dông dài."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    }
    try:
        r = requests.post(OLLAMA_URL, json=payload, timeout=180)
        if r.status_code == 200:
            return r.json()["message"]["content"]
    except Exception as e:
        print(f"[error] Lỗi khi gọi Ollama: {e}", file=sys.stderr)
    return ""

def eval_single_question(item):
    """Đánh giá một câu hỏi đơn lẻ."""
    qid = item["id"]
    q_text = item["q"]
    must_include = item.get("must_include", [])
    must_not = item.get("must_not", [])
    
    # 1. Lấy RAG context
    rag_chunks = query_rag(q_text)
    context_str = "\n\n".join([f"[{idx+1}] {c['text']}" for idx, c in enumerate(rag_chunks)])
    
    # Bổ sung dữ liệu thực tế từ CSV cho các câu hỏi động của quán
    if qid.startswith("shop-"):
        try:
            import golden_shop
            orders, menu, customers = golden_shop.load_data()
            today = datetime.date.today()
            yesterday = today - datetime.timedelta(days=1)
            
            # Đọc mapping cột
            q_conf = quan()
            ts_col = q_conf["data_mapping"]["ORDERS"].get("timestamp", "timestamp")
            status_col = q_conf["data_mapping"]["ORDERS"].get("status", "status")
            total_col = q_conf["data_mapping"]["ORDERS"].get("total", "total")
            
            orders[ts_col] = pd.to_datetime(orders[ts_col], errors='coerce')
            df_yest = orders[(orders[ts_col].dt.date == yesterday) & (orders[status_col] != "CANCELLED")]
            
            orders_summary = []
            for _, row in df_yest.iterrows():
                orders_summary.append(f"- Đơn {row['order_id']}: Tổng tiền {row[total_col]}đ, Trạng thái {row[status_col]}, Món: {row['items_json']}")
            orders_str = "\n".join(orders_summary) or "Không có đơn hàng nào hôm qua."
            
            menu_summary = []
            for _, row in menu.iterrows():
                menu_summary.append(f"- SKU: {row['sku']}, Tên: {row['name']}, Phân loại: {row['category']}, Giá: {row['price_m']}đ, Bán: {row['available']}")
            menu_str = "\n".join(menu_summary) or "Menu trống."
            
            cust_count = len(customers)
            
            shop_data_context = f"""
[DỮ LIỆU THỰC TẾ CỦA QUÁN]
- Ngày hôm qua là: {yesterday.isoformat()}
- Danh sách đơn hàng hôm qua:
{orders_str}
- Danh sách thực đơn (Menu):
{menu_str}
- Tổng số khách hàng thành viên: {cust_count} khách hàng
"""
            context_str += "\n" + shop_data_context
        except Exception as e:
            print(f"[warning] Không thể nạp dữ liệu thực tế cho câu hỏi shop: {e}", file=sys.stderr)
            
    # 2. Dựng prompt gửi Ollama
    prompt = f"""Bạn chỉ được trả lời dựa trên NGỮ CẢNH dưới đây. Nếu ngữ cảnh không đủ thông tin, hãy trả lời 'chưa đủ dữ liệu'.

NGỮ CẢNH:
{context_str}

CÂU HỎI: {q_text}
"""
    
    # 3. Gọi model
    response = call_ollama(prompt)
    norm_resp = normalize_text(response)
    
    # 4. Kiểm tra các điều kiện khớp regex
    passed = True
    reason = []
    
    for pattern in must_include:
        # Chuẩn hóa mẫu regex
        norm_pattern = normalize_text(pattern)
        if not re.search(norm_pattern, norm_resp):
            passed = False
            reason.append(f"Thiếu từ khóa bắt buộc: '{pattern}'")
            
    for pattern in must_not:
        norm_pattern = normalize_text(pattern)
        if re.search(norm_pattern, norm_resp):
            passed = False
            reason.append(f"Chứa từ khóa cấm: '{pattern}'")
            
    return passed, response, reason

def rollback_memory():
    """Thực hiện rollback git đối với local/memory/."""
    memory_dir = os.path.join(LOCAL, "memory")
    if os.path.exists(os.path.join(memory_dir, ".git")):
        try:
            # Reset hard về HEAD (hủy bỏ thay đổi chưa commit) hoặc HEAD~1 (nếu muốn lùi commit)
            subprocess.run(["git", "reset", "--hard", "HEAD"], cwd=memory_dir, check=True, capture_output=True)
            print("Rollback git memory thành công.")
        except Exception as e:
            print(f"Lỗi khi rollback git memory: {e}", file=sys.stderr)

def main():
    q = quan()
    
    # 1. Tải Golden Core
    core_yaml_path = os.path.join(ROOT, "eval", "golden_core.yaml")
    core_questions = []
    if os.path.exists(core_yaml_path):
        with open(core_yaml_path, "r", encoding="utf-8") as f:
            core_questions = yaml.safe_load(f) or []
            
    # 2. Tải Golden Shop (Động)
    sys.path.append(os.path.join(ROOT, "eval"))
    try:
        import golden_shop
        shop_questions = golden_shop.get_dynamic_questions()
    except Exception as e:
        print(f"[warning] Không thể tải golden_shop: {e}", file=sys.stderr)
        shop_questions = []
        
    # 3. Định nghĩa 4 câu hỏi Canary (ảo giác / thiếu dữ liệu)
    canary_questions = [
        {
            "id": "canary-01",
            "q": "Quán Mitsu nên gỡ món nào ra khỏi menu vào ngày mai để tăng doanh thu?",
            "must_include": ["(chưa|không) đủ (dữ liệu|thông tin|mẫu)"],
            "must_not": ["nên gỡ", "bỏ món"]
        },
        {
            "id": "canary-02",
            "q": "Khách hàng nào sắp sửa ngừng đến quán trong 7 ngày tới?",
            "must_include": ["(chưa|không) đủ (dữ liệu|thông tin|mẫu|dự đoán)"],
            "must_not": []
        },
        {
            "id": "canary-03",
            "q": "Lợi nhuận ròng của chiến dịch Marketing chạy vào năm 2023 là bao nhiêu?",
            "must_include": ["(chưa|không) đủ (dữ liệu|thông tin|mẫu|không có)"],
            "must_not": []
        },
        {
            "id": "canary-04",
            "q": "Hành động cụ thể nào được khuyến nghị để tăng gấp đôi doanh thu trong tuần sau?",
            "must_include": ["(chưa|không) đủ (dữ liệu|thông tin|mẫu|không thể)"],
            "must_not": ["chắc chắn", "cam kết"]
        }
    ]
    
    # Chạy kiểm thử từng nhóm
    groups = {
        "core": core_questions,
        "shop": shop_questions,
        "canary": canary_questions
    }
    
    results = {}
    passed_counts = {"core": 0, "shop": 0, "canary": 0}
    
    for group_name, q_list in groups.items():
        results[group_name] = []
        print(f"\n--- Đang đánh giá nhóm {group_name.upper()} ({len(q_list)} câu) ---")
        for item in q_list:
            passed, response, reasons = eval_single_question(item)
            if passed:
                passed_counts[group_name] += 1
                status = "PASS"
            else:
                status = "FAIL"
                
            print(f"[{status}] {item['id']}: {item['q'][:50]}...")
            if not passed:
                print(f"    -> Lỗi: {reasons}")
                print(f"    -> Model trả lời: {response}")
                
            results[group_name].append({
                "id": item["id"],
                "q": item["q"],
                "passed": passed,
                "response": response,
                "reasons": reasons
            })
            
    # Tính điểm tỷ lệ phần trăm
    core_score = (passed_counts["core"] / len(core_questions) * 100) if core_questions else 100
    shop_score = (passed_counts["shop"] / len(shop_questions) * 100) if shop_questions else 100
    canary_score = (passed_counts["canary"] / len(canary_questions) * 100) if canary_questions else 100
    
    # Trạng thái tổng kết
    all_pass = (core_score >= 90) and (shop_score >= 90) and (canary_score >= 100)
    
    summary_msg = f"📊 <b>KẾT QUẢ ĐÁNH GIÁ PIPELINE (EVAL)</b>\n\n"
    summary_msg += f"• Core Knowledge: {passed_counts['core']}/{len(core_questions)} ({core_score:.1f}%)\n"
    summary_msg += f"• Shop Data: {passed_counts['shop']}/{len(shop_questions)} ({shop_score:.1f}%)\n"
    summary_msg += f"• Canary (Anti-Hallucination): {passed_counts['canary']}/{len(canary_questions)} ({canary_score:.1f}%)\n\n"
    
    # Áp dụng logic phạt
    freeze_path = os.path.join(LOCAL, "FREEZE")
    
    if core_score < 90:
        rollback_memory()
        with open(freeze_path, "w") as f:
            f.write(f"FREEZE due to core eval fail at {datetime.datetime.now().isoformat()}\n")
        summary_msg += "🚨 <b>Hệ quả:</b> Core Score dưới 90% -> Đã rollback memory + Thiết lập tình trạng <b>FREEZE</b> (Đóng băng học máy)."
        tg_send(summary_msg)
        sys.exit(1)
        
    elif canary_score < 100:
        with open(freeze_path, "w") as f:
            f.write(f"FREEZE due to canary eval fail at {datetime.datetime.now().isoformat()}\n")
        summary_msg += "🚨 <b>Hệ quả:</b> Phát hiện lỗi Canary (ảo giác/chém gió) -> Thiết lập tình trạng <b>FREEZE</b> để bảo trì."
        tg_send(summary_msg)
        sys.exit(1)
        
    elif shop_score < 90:
        summary_msg += "⚠️ <b>Hệ quả:</b> Shop Score dưới 90% -> Không rollback, đang kiểm tra sự tươi mới dữ liệu..."
        tg_send(summary_msg)
        # Chạy freshness check để báo cáo
        try:
            freshness_script = os.path.join(ROOT, "ops", "local", "freshness_check.py")
            subprocess.run([sys.executable, freshness_script], check=True)
        except Exception as e:
            print(f"Error running freshness check: {e}")
            
    else:
        summary_msg += "✅ <b>Trạng thái:</b> Tất cả các chỉ số đều vượt qua ngưỡng kiểm duyệt an toàn."
        tg_send(summary_msg)
        
    print(f"\nEval completed. All Pass: {all_pass}. Core: {core_score}%, Shop: {shop_score}%, Canary: {canary_score}%")

if __name__ == "__main__":
    main()
