# -*- coding: utf-8 -*-
"""golden_shop.py — Sinh 8 câu hỏi đánh giá động dựa trên dữ liệu thực tế tại quầy của quán."""
import os
import json
import datetime
import pandas as pd
from common import LOCAL, DATA_LATEST, quan

def load_data():
    """Đọc dữ liệu mới nhất từ local/data/latest/."""
    orders_path = os.path.join(DATA_LATEST, "ORDERS.csv")
    menu_path = os.path.join(DATA_LATEST, "MENU.csv")
    customers_path = os.path.join(DATA_LATEST, "CUSTOMERS.csv")
    
    orders = pd.read_csv(orders_path) if os.path.exists(orders_path) else pd.DataFrame()
    menu = pd.read_csv(menu_path) if os.path.exists(menu_path) else pd.DataFrame()
    customers = pd.read_csv(customers_path) if os.path.exists(customers_path) else pd.DataFrame()
    
    return orders, menu, customers

def get_dynamic_questions():
    """Tính toán đáp án động từ dữ liệu và sinh danh sách 8 câu hỏi."""
    orders, menu, customers = load_data()
    q = quan()
    
    questions = []
    today = datetime.date.today()
    yesterday = today - datetime.timedelta(days=1)
    
    # Chuẩn bị cột
    ts_col = q["data_mapping"]["ORDERS"].get("timestamp", "timestamp")
    status_col = q["data_mapping"]["ORDERS"].get("status", "status")
    total_col = q["data_mapping"]["ORDERS"].get("total", "total")
    
    # 1. Doanh thu hôm qua
    yest_rev = 0
    yest_count = 0
    if not orders.empty:
        orders[ts_col] = pd.to_datetime(orders[ts_col], errors='coerce')
        df_yest = orders[(orders[ts_col].dt.date == yesterday) & (orders[status_col] != "CANCELLED")]
        yest_rev = int(df_yest[total_col].sum())
        yest_count = len(df_yest)
        
    questions.append({
        "id": "shop-01",
        "q": f"Doanh thu tổng cộng của quán ngày hôm qua ({yesterday.isoformat()}) là bao nhiêu?",
        "must_include": [f"{yest_rev:,}" if yest_rev > 0 else "0"],
        "must_not": []
    })
    
    # 2. Số lượng đơn hàng thành công hôm qua
    questions.append({
        "id": "shop-02",
        "q": f"Có tổng cộng bao nhiêu đơn hàng thành công được ghi nhận vào ngày hôm qua ({yesterday.isoformat()})?",
        "must_include": [str(yest_count)],
        "must_not": []
    })
    
    # 3. Món nước/bánh bán chạy nhất hôm qua
    top_item_name = "Chưa có đơn"
    if yest_count > 0:
        item_counts = {}
        for items_raw in df_yest["items_json"].dropna():
            try:
                items = json.loads(items_raw)
                for it in items:
                    name = it.get("name")
                    qty = int(it.get("qty", 1))
                    if name:
                        item_counts[name] = item_counts.get(name, 0) + qty
            except:
                pass
        if item_counts:
            top_item_name = max(item_counts, key=item_counts.get)
            
    questions.append({
        "id": "shop-03",
        "q": f"Món ăn hoặc đồ uống nào được bán ra nhiều nhất (bán chạy nhất) vào ngày hôm qua ({yesterday.isoformat()})?",
        "must_include": [top_item_name] if top_item_name != "Chưa có đơn" else ["đơn", "không"],
        "must_not": []
    })
    
    # 4. Giá trị trung bình đơn hàng (AOV) hôm qua
    yest_aov = int(yest_rev / yest_count) if yest_count > 0 else 0
    questions.append({
        "id": "shop-04",
        "q": f"Giá trị đơn hàng trung bình (AOV) ngày hôm qua ({yesterday.isoformat()}) là bao nhiêu?",
        "must_include": [f"{yest_aov:,}" if yest_aov > 0 else "0"],
        "must_not": []
    })
    
    # 5. Món uống đắt nhất thực đơn đang hoạt động
    exp_drink_name = "Chưa có menu"
    exp_drink_price = 0
    if not menu.empty:
        # Lọc món khả dụng và là đồ uống
        # Giả định cột category chứa loại món, price_m chứa giá
        # Theo data_mapping trong QUAN.yaml
        sku_col = q["data_mapping"]["MENU"].get("sku", "sku")
        name_col = q["data_mapping"]["MENU"].get("name", "name")
        cat_col = q["data_mapping"]["MENU"].get("category", "category")
        price_col = q["data_mapping"]["MENU"].get("price", "price_m")
        
        df_active_drinks = menu[
            (menu["available"].astype(str).str.upper() == "TRUE") & 
            (menu[cat_col].astype(str).str.lower().str.contains("beverage|nước|drink", na=False))
        ]
        if not df_active_drinks.empty:
            df_active_drinks[price_col] = pd.to_numeric(df_active_drinks[price_col], errors='coerce')
            max_row = df_active_drinks.loc[df_active_drinks[price_col].idxmax()]
            exp_drink_name = max_row[name_col]
            exp_drink_price = int(max_row[price_col])
            
    questions.append({
        "id": "shop-05",
        "q": "Đồ uống (beverage) nào đắt nhất và có giá bao nhiêu trong thực đơn đang mở bán hiện tại?",
        "must_include": [exp_drink_name, f"{exp_drink_price:,}"] if exp_drink_price > 0 else ["menu", "chưa"],
        "must_not": []
    })
    
    # 6. Số lượng khách hàng đăng ký thành viên
    cust_count = len(customers) if not customers.empty else 0
    questions.append({
        "id": "shop-06",
        "q": "Tổng số lượng khách hàng thành viên đăng ký trong hệ thống tính đến hiện tại là bao nhiêu?",
        "must_include": [str(cust_count)],
        "must_not": []
    })
    
    # 7. Nhóm món ăn uống (category) nào có nhiều SKU nhất
    top_cat = "Chưa có menu"
    if not menu.empty:
        cat_col = q["data_mapping"]["MENU"].get("category", "category")
        cat_counts = menu[cat_col].value_counts()
        if not cat_counts.empty:
            top_cat = cat_counts.index[0]
            
    questions.append({
        "id": "shop-07",
        "q": "Phân loại nhóm món (category) nào có số lượng SKU nhiều nhất trong thực đơn của quán?",
        "must_include": [top_cat] if top_cat != "Chưa có menu" else ["menu", "chưa"],
        "must_not": []
    })
    
    # 8. Món bánh (pastry) có giá thấp nhất đang hoạt động
    cheap_pastry_name = "Chưa có menu"
    cheap_pastry_price = 999999
    if not menu.empty:
        cat_col = q["data_mapping"]["MENU"].get("category", "category")
        price_col = q["data_mapping"]["MENU"].get("price", "price_m")
        df_pastry = menu[
            (menu["available"].astype(str).str.upper() == "TRUE") & 
            (menu[cat_col].astype(str).str.lower().str.contains("pastry|bánh|cake", na=False))
        ]
        if not df_pastry.empty:
            df_pastry[price_col] = pd.to_numeric(df_pastry[price_col], errors='coerce')
            min_row = df_pastry.loc[df_pastry[price_col].idxmin()]
            cheap_pastry_name = min_row[name_col]
            cheap_pastry_price = int(min_row[price_col])
            
    questions.append({
        "id": "shop-08",
        "q": "Món bánh ngọt (pastry) nào có giá rẻ nhất và có giá bao nhiêu trong danh mục đang mở bán hiện tại?",
        "must_include": [cheap_pastry_name, f"{cheap_pastry_price:,}"] if cheap_pastry_price < 999999 else ["menu", "chưa"],
        "must_not": []
    })
    
    return questions
