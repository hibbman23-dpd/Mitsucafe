# -*- coding: utf-8 -*-
"""build_shop_corpus.py — Tự động tạo tri thức riêng của quán trong kb/shop/ từ QUAN.yaml và dữ liệu Sheets."""
import os
import sys
import csv
import pandas as pd
from common import ROOT, quan, LOCAL

def build_quan_info(q):
    """Tạo kb/shop/quan-info.md từ QUAN.yaml."""
    out_path = os.path.join(ROOT, "kb", "shop", "quan-info.md")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    
    content = f"""<!-- ns: insight -->
# Thông tin cấu hình và vận hành của quán {q['shop']['name']}

Đây là tri thức vận hành thực tế được trích xuất từ file cấu hình `QUAN.yaml` của quán {q['shop']['name']}.

## Thông tin cơ bản
- **ID quán:** {q['shop']['id']}
- **Tên quán:** {q['shop']['name']}
- **Vị trí/Chi nhánh:** {q['shop']['location_id']}

## Quy luật vận hành
- **Giờ cao điểm:** {", ".join(q['operating_rules']['peak_hours'])}
- **Mùa thấp điểm:** {q['operating_rules']['low_season']}
- **Mùa cao điểm:** {q['operating_rules']['high_season']}

## Ngưỡng phân tích dữ liệu
- **Mẫu tối thiểu cho 1 pattern:** {q['analysis']['min_sample_per_pattern']} giao dịch/pattern
- **Thời hạn bộ nhớ tạm (Quarantine TTL):** {q['analysis']['quarantine_ttl_days']} ngày
"""
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Generated: kb/shop/quan-info.md")

def build_menu_hien_tai():
    """Tạo kb/shop/menu-hien-tai.md từ local/data/latest/MENU.csv."""
    menu_csv = os.path.join(LOCAL, "data", "latest", "MENU.csv")
    out_path = os.path.join(ROOT, "kb", "shop", "menu-hien-tai.md")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    
    if not os.path.exists(menu_csv):
        # Tạo file nháp nếu chưa có dữ liệu kéo về
        content = """<!-- ns: insight -->
# Danh mục thực đơn của quán (Chờ đồng bộ)
Dữ liệu thực đơn chưa được đồng bộ từ Google Sheets. Hãy chạy `sheets_pull.py` trước.
"""
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(content)
        print("Warning: local/data/latest/MENU.csv missing. Placeholder generated for menu-hien-tai.md")
        return
        
    try:
        df = pd.read_csv(menu_csv)
        # Sử dụng các cột có sẵn trong MENU schema (sku, name, category, price_m, available...)
        required_cols = ["sku", "name", "category", "price_m", "available"]
        for col in required_cols:
            if col not in df.columns:
                df[col] = "N/A" # Fallback nếu cột bị thiếu
                
        # Lọc danh sách món đang bán
        df_active = df[df["available"].astype(str).str.upper() == "TRUE"]
        
        content = """<!-- ns: insight -->
# Danh mục thực đơn (Menu) hiện tại của quán

Đây là thực đơn các món đang được mở bán của quán, được cập nhật từ hệ thống quản lý.

| Mã món (SKU) | Tên món | Phân loại | Giá size M |
| --- | --- | --- | --- |
"""
        for _, row in df_active.iterrows():
            content += f"| {row['sku']} | {row['name']} | {row['category']} | {row['price_m']} |\n"
            
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(content)
        print("Generated: kb/shop/menu-hien-tai.md")
    except Exception as e:
        print(f"Error building menu corpus: {e}", file=sys.stderr)

def build_brand_voice():
    """Tạo kb/shop/brand-voice.md từ docs/brand-voice.md."""
    src_path = os.path.join(ROOT, "docs", "brand-voice.md")
    out_path = os.path.join(ROOT, "kb", "shop", "brand-voice.md")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    
    if not os.path.exists(src_path):
        content = """<!-- ns: insight -->
# Hướng dẫn Brand Voice của quán
Chưa cấu hình file tài liệu docs/brand-voice.md. Sử dụng phong cách viết lịch sự và thân thiện mặc định.
"""
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(content)
        print("Warning: docs/brand-voice.md missing. Placeholder generated for brand-voice.md")
        return
        
    try:
        with open(src_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            
        # Lấy tối đa 150 dòng đầu tiên của brand voice để đưa vào tri thức RAG (tránh tràn token)
        content = "<!-- ns: insight -->\n" + "".join(lines[:150])
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(content)
        print("Generated: kb/shop/brand-voice.md")
    except Exception as e:
        print(f"Error copying brand voice: {e}", file=sys.stderr)

def main():
    q = quan()
    build_quan_info(q)
    build_menu_hien_tai()
    build_brand_voice()

if __name__ == "__main__":
    main()
