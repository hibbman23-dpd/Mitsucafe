# -*- coding: utf-8 -*-
"""
ops/dual_camera_ai.py — Hệ thống AI phối hợp 2 Camera & Nhận diện Khách quen.

Tính năng:
  1. Quản lý 2 luồng camera: Cam_Order (Quầy Gọi Món) và Cam_Nhan_Hang (Quầy Nhận Đồ).
  2. Tự động chia đôi màn hình nếu chỉ có 1 webcam đầu vào để test.
  3. Trích xuất đặc trưng khuôn mặt (Face Recognition) và dáng vẻ cơ thể (Re-ID).
  4. Cơ sở dữ liệu SQLite cục bộ lưu trữ hồ sơ khách hàng và vector sinh trắc học.
  5. Flask Server nội bộ (Port 5000) nhận sự kiện thanh toán từ POS để tự động lưu đặc điểm khách hàng.
  6. API báo khách quen để POS tự động hiển thị gợi ý món nước ưa thích.
"""

import cv2
import numpy as np
import time
import sqlite3
import json
import os
import threading
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

# =====================================================================
# CẤU HÌNH HỆ THỐNG
# =====================================================================
DB_PATH = "ops/customer_reid.db"
STAFF_FACES_DIR = "ops/staff_faces"

# Cấu hình 2 camera
CAM_CONFIG = {
    "Cam_Order": {
        "stream_url": 0,           # 0 = webcam chính, đổi thành RTSP URL khi chạy thật
        "zone": [50, 50, 600, 450] # Vùng order cần quan sát [x_min, y_min, x_max, y_max]
    },
    "Cam_Nhan_Hang": {
        "stream_url": 0,           # Đổi thành RTSP URL camera 2 hoặc dùng webcam phụ
        "zone": [50, 50, 600, 450] # Vùng nhận đồ
    }
}

# Ngưỡng so khớp (Similarity Thresholds)
FACE_MATCH_THRESHOLD = 0.5  # Euclidean Distance (càng thấp càng giống, dlib thường dùng <= 0.6)
REID_MATCH_THRESHOLD = 0.8  # Cosine Similarity (càng cao càng giống, >= 0.8)

# Trạng thái người đứng tại quầy order gần đây
recent_order_visitors = []
lock = threading.Lock()

# =====================================================================
# KHỞI TẠO FLASK APP
# =====================================================================
app = Flask(__name__)
CORS(app)  # Cho phép gọi API từ trình duyệt POS (localhost/GitHub Pages)

# =====================================================================
# KHỞI TẠO CƠ SỞ DỮ LIỆU SQLITE
# =====================================================================
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Bảng lưu trữ khách hàng
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS customers (
        customer_id TEXT PRIMARY KEY,
        name TEXT,
        favorite_drink TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    """)
    
    # Bảng lưu trữ vector đặc trưng (embeddings)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS customer_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id TEXT,
        embedding_type TEXT, -- 'face' hoặc 'body_reid'
        embedding_data TEXT, -- Lưu mảng float dạng JSON String
        created_at TEXT,
        FOREIGN KEY (customer_id) REFERENCES customers (customer_id)
    )
    """)
    conn.commit()
    conn.close()
    print("[DB INFO] Đã khởi tạo cơ sở dữ liệu SQLite thành công.")

init_db()

# =====================================================================
# KHỞI TẠO THƯ VIỆN FACE RECOGNITION & YOLO
# =====================================================================
FACE_REC_AVAILABLE = False
try:
    import face_recognition
    FACE_REC_AVAILABLE = True
    print("[AI INFO] Khởi tạo thư viện face_recognition thành công.")
except ImportError:
    print("[AI WARNING] Chưa cài đặt face-recognition. Chỉ dùng nhận dạng Re-ID màu sắc/dáng người.")

try:
    from ultralytics import YOLO
    yolo_model = YOLO("yolov8n.pt") # Có thể dùng yolov8n-pose.pt nếu muốn lấy pose khớp xương
    print("[AI INFO] Khởi tạo mô hình YOLOv8 thành công.")
except Exception as e:
    print(f"[AI ERROR] Không thể tải model YOLOv8: {e}")
    exit(1)

# =====================================================================
# TRÍCH XUẤT ĐẶC TRƯNG RE-ID (DÁNG NGƯỜI & MÀU SẮC) CƠ BẢN QUA OPENCV
# =====================================================================
def extract_appearance_reid(frame, box):
    """
    Trích xuất vector đặc trưng dáng người (Re-ID) dựa trên histogram màu sắc HSV của 3 phần thân.
    """
    x1, y1, x2, y2 = map(int, box[:4])
    h, w, _ = frame.shape
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return np.zeros(48, dtype=np.float32)
    
    # Chuyển đổi sang hệ màu HSV để trích xuất màu sắc trang phục ổn định
    hsv_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    ch = hsv_crop.shape[0]
    
    # Chia người làm 3 phần: Đầu/Vai (20%), Thân/Áo (50%), Chân/Quần (30%)
    sections = [
        hsv_crop[0:int(ch*0.2), :],
        hsv_crop[int(ch*0.2):int(ch*0.7), :],
        hsv_crop[int(ch*0.7):, :]
    ]
    
    feature_vector = []
    
    for sec in sections:
        if sec.size == 0:
            feature_vector.extend(np.zeros(16, dtype=np.float32))
            continue
        # Tính toán histogram cho 3 kênh H, S, V
        hist_h = cv2.calcHist([sec], [0], None, [8], [0, 180])
        hist_s = cv2.calcHist([sec], [1], None, [4], [0, 256])
        hist_v = cv2.calcHist([sec], [2], None, [4], [0, 256])
        
        # Chuẩn hóa histogram
        cv2.normalize(hist_h, hist_h)
        cv2.normalize(hist_s, hist_s)
        cv2.normalize(hist_v, hist_v)
        
        feature_vector.extend(hist_h.flatten())
        feature_vector.extend(hist_s.flatten())
        feature_vector.extend(hist_v.flatten())
        
    # Thêm tỷ lệ hình thể (Aspect Ratio) vào cuối vector
    aspect_ratio = (x2 - x1) / (y2 - y1 + 1e-5)
    feature_vector.append(aspect_ratio)
    
    return np.array(feature_vector, dtype=np.float32)

def cosine_similarity(v1, v2):
    dot_product = np.dot(v1, v2)
    norm_v1 = np.linalg.norm(v1)
    norm_v2 = np.linalg.norm(v2)
    if norm_v1 == 0 or norm_v2 == 0:
        return 0.0
    return dot_product / (norm_v1 * norm_v2)

# =====================================================================
# HÀM SO KHỚP VỚI CƠ SỞ DỮ LIỆU SQLITE
# =====================================================================
def match_person_to_db(face_encoding=None, body_reid_vector=None):
    """
    So khớp sinh trắc học với Cơ sở dữ liệu SQLite.
    Trả về: (customer_id, name, favorite_drink) hoặc (None, None, None)
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 1. Ưu tiên so khớp khuôn mặt (FaceID) trước vì độ chính xác rất cao
    if FACE_REC_AVAILABLE and face_encoding is not None:
        cursor.execute("SELECT customer_id, embedding_data FROM customer_embeddings WHERE embedding_type = 'face'")
        rows = cursor.fetchall()
        
        best_match_id = None
        min_dist = float('inf')
        
        for cid, emb_str in rows:
            emb = np.array(json.loads(emb_str))
            # Tính khoảng cách Euclidean
            dist = np.linalg.norm(face_encoding - emb)
            if dist < dist and dist < min_dist:
                min_dist = dist
                best_match_id = cid
                
        if best_match_id and min_dist <= FACE_MATCH_THRESHOLD:
            cursor.execute("SELECT name, favorite_drink FROM customers WHERE customer_id = ?", (best_match_id,))
            cust = cursor.fetchone()
            conn.close()
            if cust:
                return best_match_id, cust[0], cust[1]
                
    # 2. Nếu không thấy mặt/FaceID không khớp, thử so khớp dáng người Re-ID
    if body_reid_vector is not None:
        cursor.execute("SELECT customer_id, embedding_data FROM customer_embeddings WHERE embedding_type = 'body_reid'")
        rows = cursor.fetchall()
        
        best_match_id = None
        max_sim = -1.0
        
        for cid, emb_str in rows:
            emb = np.array(json.loads(emb_str))
            sim = cosine_similarity(body_reid_vector[:-1], emb[:-1]) # bỏ aspect ratio cuối cùng để so màu
            if sim > max_sim:
                max_sim = sim
                best_match_id = cid
                
        if best_match_id and max_sim >= REID_MATCH_THRESHOLD:
            cursor.execute("SELECT name, favorite_drink FROM customers WHERE customer_id = ?", (best_match_id,))
            cust = cursor.fetchone()
            conn.close()
            if cust:
                return best_match_id, cust[0], cust[1]
                
    conn.close()
    return None, None, None

# =====================================================================
# TIẾN TRÌNH XỬ LÝ CAMERA CHÍNH
# =====================================================================
active_customer_info = {"detected": False}

def process_cameras():
    global recent_order_visitors, active_customer_info
    
    print("[AI INFO] Đang khởi động camera...")
    # Dùng 1 camera chính để test, chia 2 nửa nếu chỉ có 1 webcam
    cap_order = cv2.VideoCapture(CAM_CONFIG["Cam_Order"]["stream_url"])
    
    # Nếu dùng 2 camera thật, uncomment dòng dưới:
    # cap_pickup = cv2.VideoCapture(CAM_CONFIG["Cam_Nhan_Hang"]["stream_url"])
    cap_pickup = None 
    
    frame_count = 0
    
    while True:
        ret_order, frame_order = cap_order.read()
        if not ret_order:
            print("[AI WARNING] Mất kết nối camera. Đang thử lại...")
            time.sleep(2)
            continue
            
        frame_count += 1
        h, w, _ = frame_order.shape
        
        # MÔ PHỎNG 2 CAMERA NẾU CHỈ CÓ 1 WEBCAM (Chia đôi khung hình)
        if cap_pickup is None:
            # Nửa trái là Cam_Order, Nửa phải là Cam_Nhan_Hang
            half_w = w // 2
            cam_order_frame = frame_order[:, 0:half_w]
            cam_pickup_frame = frame_order[:, half_w:w]
        else:
            cam_order_frame = frame_order
            ret_pickup, cam_pickup_frame = cap_pickup.read()
            if not ret_pickup:
                cam_pickup_frame = np.zeros_like(cam_order_frame)
                
        # 1. XỬ LÝ CAMERA ORDER (Quầy Gọi Món)
        results_order = yolo_model(cam_order_frame, classes=[0], verbose=False)
        boxes_order = results_order[0].boxes.data.tolist() if results_order[0].boxes else []
        
        # Vẽ ranh giới khu vực Order
        cv2.rectangle(cam_order_frame, (10, 10), (cam_order_frame.shape[1]-10, cam_order_frame.shape[0]-10), (255, 128, 0), 2)
        cv2.putText(cam_order_frame, "CAM ORDER (GOI MON)", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 128, 0), 2)
        
        temp_visitors = []
        recognized_customer_detected = False
        
        for p in boxes_order:
            x1, y1, x2, y2, conf, cls = p
            
            # Trích xuất đặc trưng Re-ID dáng người
            body_vector = extract_appearance_reid(cam_order_frame, [x1, y1, x2, y2])
            
            # Trích xuất khuôn mặt (nếu có và nhìn rõ)
            face_enc = None
            if FACE_REC_AVAILABLE and frame_count % 3 == 0:
                crop = cam_order_frame[max(0, int(y1)):min(h, int(y2)), max(0, int(x1)):min(w, int(x2))]
                if crop.size > 0:
                    rgb_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
                    face_locs = face_recognition.face_locations(rgb_crop)
                    if face_locs:
                        face_encs = face_recognition.face_encodings(rgb_crop, face_locs)
                        if face_encs:
                            face_enc = face_encs[0]
            
            # So khớp trong Database xem có phải khách quen
            cid, name, fav_drink = match_person_to_db(face_enc, body_vector)
            
            label = "Khach moi"
            color = (0, 255, 255) # Màu vàng cho khách mới
            
            if cid:
                label = f"{name} (Khach quen)"
                color = (0, 255, 0) # Màu xanh cho khách quen
                # Cập nhật thông tin khách quen đang đứng tại quầy order để POS hiển thị
                active_customer_info = {
                    "detected": True,
                    "customer_id": cid,
                    "name": name,
                    "favorite_drink": fav_drink or "Chưa có"
                }
                recognized_customer_detected = True
            
            # Lưu tạm thời khách đang đứng ở quầy gọi đồ vào bộ nhớ đệm
            temp_visitors.append({
                "bbox": [x1, y1, x2, y2],
                "face_embedding": face_enc,
                "body_embedding": body_vector,
                "timestamp": time.time()
            })
            
            # Vẽ Bounding Box
            cv2.rectangle(cam_order_frame, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
            cv2.putText(cam_order_frame, label, (int(x1), int(y1) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
            if cid and fav_drink:
                cv2.putText(cam_order_frame, f"Mon: {fav_drink}", (int(x1), int(y2) + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
                
        # Cập nhật bộ nhớ đệm khách vừa gọi món
        with lock:
            if temp_visitors:
                recent_order_visitors = temp_visitors
            
        if not recognized_customer_detected:
            # Nếu không thấy khách quen nào đứng ở quầy order nữa, xóa trạng thái active
            active_customer_info = {"detected": False}
            
        # 2. XỬ LÝ CAMERA NHẬN HÀNG (Quầy Nhận Đồ)
        results_pickup = yolo_model(cam_pickup_frame, classes=[0], verbose=False)
        boxes_pickup = results_pickup[0].boxes.data.tolist() if results_pickup[0].boxes else []
        
        cv2.rectangle(cam_pickup_frame, (10, 10), (cam_pickup_frame.shape[1]-10, cam_pickup_frame.shape[0]-10), (0, 128, 255), 2)
        cv2.putText(cam_pickup_frame, "CAM NHAN HANG (PICKUP)", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 128, 255), 2)
        
        for p in boxes_pickup:
            x1, y1, x2, y2, conf, cls = p
            
            # Trích xuất đặc trưng Re-ID dáng người tại quầy nhận đồ
            body_vector_pk = extract_appearance_reid(cam_pickup_frame, [x1, y1, x2, y2])
            
            # Kiểm tra xem có khuôn mặt nào tại quầy nhận đồ không
            face_enc_pk = None
            if FACE_REC_AVAILABLE and frame_count % 3 == 0:
                crop_pk = cam_pickup_frame[max(0, int(y1)):min(h, int(y2)), max(0, int(x1)):min(w, int(x2))]
                if crop_pk.size > 0:
                    rgb_crop_pk = cv2.cvtColor(crop_pk, cv2.COLOR_BGR2RGB)
                    face_locs_pk = face_recognition.face_locations(rgb_crop_pk)
                    if face_locs_pk:
                        face_encs_pk = face_recognition.face_encodings(rgb_crop_pk, face_locs_pk)
                        if face_encs_pk:
                            face_enc_pk = face_encs_pk[0]
            
            # So khớp trong Database
            cid, name, fav_drink = match_person_to_db(face_enc_pk, body_vector_pk)
            
            label_pk = "Khach cho"
            color_pk = (255, 255, 0)
            if cid:
                label_pk = f"Giao do cho: {name}"
                color_pk = (0, 255, 0)
                
            cv2.rectangle(cam_pickup_frame, (int(x1), int(y1)), (int(x2), int(y2)), color_pk, 2)
            cv2.putText(cam_pickup_frame, label_pk, (int(x1), int(y1) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color_pk, 2)

        # Ghép 2 khung hình để hiển thị màn hình giám sát split-screen
        combined_monitor = np.hstack((cam_order_frame, cam_pickup_frame))
        
        # Vẽ đường ngăn cách ở giữa màn hình
        cv2.line(combined_monitor, (cam_order_frame.shape[1], 0), (cam_order_frame.shape[1], combined_monitor.shape[0]), (255, 255, 255), 2)
        
        cv2.imshow("Kaeru Dual-Cam AI Monitor", combined_monitor)
        
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
            
    cap_order.release()
    cv2.destroyAllWindows()

# =====================================================================
# CÁC API ENDPOINTS CỦA FLASK (DÀNH CHO POS & KDS)
# =====================================================================

@app.route('/api/associate_order', methods=['POST'])
def api_associate_order():
    """
    POS gọi API này khi hoàn thành một đơn hàng mới.
    Mục tiêu: Lấy đặc điểm của người đang đứng tại Cam_Order để lưu/cập nhật vào CSDL.
    """
    global recent_order_visitors
    data = request.json
    if not data:
        return jsonify({"ok": False, "error": "Missing JSON body"}), 400
        
    phone = data.get("customer_phone", "").strip()
    name = data.get("customer_name", "").strip() or "Khách Quen"
    items = data.get("items", "").strip()
    
    if not phone:
        # Nếu khách không để lại SĐT, tự tạo một ID dựa trên timestamp để bám đuôi dáng người trong ngày
        phone = f"ANON_{int(time.time())}"
        
    # Tìm xem có ai đang đứng ở quầy order trong 15 giây gần đây không
    best_candidate = None
    now = time.time()
    
    with lock:
        # Lọc các phát hiện người trong vòng 15 giây
        valid_candidates = [v for v in recent_order_visitors if now - v["timestamp"] < 15]
        
        if valid_candidates:
            # Chọn người ở gần trung tâm khung hình nhất (giả định là người đang order)
            # Hoặc đơn giản là người được cập nhật gần nhất
            best_candidate = valid_candidates[-1]
            
    if not best_candidate:
        return jsonify({"ok": False, "message": "Không tìm thấy khách hàng nào ở quầy order gần đây để liên kết."}), 200
        
    # Lưu vào SQLite
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # 1. Thêm hoặc cập nhật bảng customers
    # Tự động lưu món nước vừa uống làm món yêu thích (đơn giản hóa bằng cách ghi nhận món vừa mua)
    cursor.execute("""
    INSERT INTO customers (customer_id, name, favorite_drink, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(customer_id) DO UPDATE SET
        name = excluded.name,
        favorite_drink = excluded.favorite_drink,
        updated_at = excluded.updated_at
    """, (phone, name, items, now_str, now_str))
    
    # 2. Thêm vector đặc trưng khuôn mặt (nếu có)
    if best_candidate["face_embedding"] is not None:
        face_str = json.dumps(best_candidate["face_embedding"].tolist())
        # Xóa các face embedding cũ của khách hàng này để tránh trùng lặp
        cursor.execute("DELETE FROM customer_embeddings WHERE customer_id = ? AND embedding_type = 'face'", (phone,))
        cursor.execute("""
        INSERT INTO customer_embeddings (customer_id, embedding_type, embedding_data, created_at)
        VALUES (?, 'face', ?, ?)
        """, (phone, face_str, now_str))
        
    # 3. Thêm/Cập nhật vector đặc trưng Re-ID dáng người
    if best_candidate["body_embedding"] is not None:
        body_str = json.dumps(best_candidate["body_embedding"].tolist())
        cursor.execute("DELETE FROM customer_embeddings WHERE customer_id = ? AND embedding_type = 'body_reid'", (phone,))
        cursor.execute("""
        INSERT INTO customer_embeddings (customer_id, embedding_type, embedding_data, created_at)
        VALUES (?, 'body_reid', ?, ?)
        """, (phone, body_str, now_str))
        
    conn.commit()
    conn.close()
    
    print(f"[DB UPDATE] Đã lưu thông tin nhận dạng cho khách hàng: {name} ({phone}) - Món: {items}")
    return jsonify({
        "ok": True,
        "customer_id": phone,
        "name": name,
        "has_face": best_candidate["face_embedding"] is not None,
        "has_body": best_candidate["body_embedding"] is not None
    })

@app.route('/api/active_customer', methods=['GET'])
def api_active_customer():
    """
    POS gọi API này mỗi 3 giây để kiểm tra xem có khách quen đứng trước quầy gọi đồ không.
    """
    return jsonify(active_customer_info)

@app.route('/api/recent_customers', methods=['GET'])
def api_recent_customers():
    """
    Dashboard gọi API này để hiển thị danh sách khách hàng được lưu gần đây nhất.
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT customer_id, name, favorite_drink, updated_at 
            FROM customers 
            ORDER BY updated_at DESC 
            LIMIT 5
        """)
        rows = cursor.fetchall()
        conn.close()
        
        customers = []
        for r in rows:
            customers.append({
                "customer_id": r[0],
                "name": r[1],
                "favorite_drink": r[2],
                "updated_at": r[3]
            })
        return jsonify({"ok": True, "customers": customers})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

# =====================================================================
# KHỞI CHẠY HỆ THỐNG SONG SONG
# =====================================================================
def run_flask():
    print("[FLASK INFO] Đang khởi động local HTTP server trên cổng 5000...")
    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)

if __name__ == "__main__":
    # Chạy Flask Server trong một thread riêng biệt
    flask_thread = threading.Thread(target=run_flask)
    flask_thread.daemon = True
    flask_thread.start()
    
    # Chạy tiến trình phân tích Camera trên luồng chính (Main Thread)
    try:
        process_cameras()
    except KeyboardInterrupt:
        print("\n[AI INFO] Đã dừng toàn bộ hệ thống theo yêu cầu.")
