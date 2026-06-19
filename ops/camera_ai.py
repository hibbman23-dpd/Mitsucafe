# -*- coding: utf-8 -*-
"""
camera_ai.py — AI Agent nâng cấp hỗ trợ Nhận diện khuôn mặt nhân viên & Phát hiện người lạ vào quầy bar.

Yêu cầu cài đặt bổ sung thư viện Nhận diện khuôn mặt:
  1. Cài đặt CMake (nếu chưa có trên Mac): brew install cmake
  2. Cài đặt thư viện: pip install face-recognition --break-system-packages

Thư mục lưu ảnh mặt nhân viên:
  Hệ thống sẽ tự động tạo thư mục `ops/staff_faces/`. Bạn chỉ cần lưu ảnh chân dung của nhân viên
  vào đây, đặt tên file dạng: `ten_nhan_vien.jpg` (ví dụ: `chiquan.jpg`, `nhanvienA.jpg`).
"""

import cv2
import time
import requests
import json
import os
from datetime import datetime

# =====================================================================
# CẤU HÌNH HỆ THỐNG
# =====================================================================
API_URL = "https://script.google.com/macros/s/AKfycbynDqbg-Xn9hEbUyhsZl_MF0dGsCqLpfTgJ-Us3QHiGqkrKV3hwZD__-fKW2kFJZzC7/exec"
CAMERA_AI_SECRET = "CHANGE_ME_TO_ACTUAL_SECRET_FROM_CONFIG"

# Thư mục lưu ảnh khuôn mặt nhân viên
STAFF_FACES_DIR = "ops/staff_faces"

CAMERAS = {
    "Cam_Quay_Bar": {
        "stream_url": 0,  # 0 = webcam để test, đổi thành RTSP URL khi chạy thật
        "staff_zone": [200, 100, 450, 320], # Tọa độ vùng quầy bar [x_min, y_min, x_max, y_max]
        
        # Ngưỡng thời gian
        "absence_threshold_sec": 300,        # Cảnh báo vắng mặt > 5 phút (300s)
        "intruder_threshold_sec": 15,        # Cảnh báo người lạ xâm nhập nếu đứng trong quầy > 15 giây
    }
}

# =====================================================================
# KHỞI TẠO THƯ VIỆN FACE RECOGNITION (CÓ FALLBACK NẾU CHƯA CÀI)
# =====================================================================
FACE_REC_AVAILABLE = False
known_face_encodings = []
known_face_names = []

try:
    import face_recognition
    FACE_REC_AVAILABLE = True
    print("[AI INFO] Khởi tạo thư viện face_recognition thành công.")
except ImportError:
    print("\n" + "="*80)
    print("[AI WARNING] Thư viện 'face_recognition' chưa được cài đặt.")
    print("Hệ thống sẽ chạy ở chế độ FALLBACK (chỉ cảnh báo người/chuyển động chung trong quầy bar).")
    print("Để kích hoạt Nhận diện khuôn mặt nhân viên, hãy chạy các lệnh sau:")
    print("  1. Cài cmake: brew install cmake")
    print("  2. Cài thư viện: pip install face-recognition --break-system-packages")
    print("="*80 + "\n")

# Tải model YOLOv8
try:
    from ultralytics import YOLO
    model = YOLO("yolov8n.pt")
    print("[AI INFO] Khởi tạo mô hình YOLOv8 thành công.")
except Exception as e:
    print(f"[AI ERROR] Không thể load model YOLOv8: {e}")
    exit(1)


# =====================================================================
# HÀM TẢI ẢNH KHUÔN MẶT NHÂN VIÊN ĐÃ ĐĂNG KÝ
# =====================================================================
def load_registered_staff():
    global known_face_encodings, known_face_names
    if not FACE_REC_AVAILABLE:
        return
        
    if not os.path.exists(STAFF_FACES_DIR):
        os.makedirs(STAFF_FACES_DIR)
        print(f"[AI INFO] Đã tạo thư mục lưu ảnh nhân viên tại: {STAFF_FACES_DIR}")
        print("--> Hãy copy ảnh chân dung nhân viên (.jpg) vào thư mục này để nhận diện.")
        return
        
    known_face_encodings = []
    known_face_names = []
    
    valid_extensions = ('.jpg', '.jpeg', '.png')
    for filename in os.listdir(STAFF_FACES_DIR):
        if filename.lower().endswith(valid_extensions):
            name = os.path.splitext(filename)[0].replace("_", " ").title()
            filepath = os.path.join(STAFF_FACES_DIR, filename)
            try:
                # Load ảnh và trích xuất mã băm khuôn mặt
                image = face_recognition.load_image_file(filepath)
                encodings = face_recognition.face_encodings(image)
                if encodings:
                    known_face_encodings.append(encodings[0])
                    known_face_names.append(name)
                    print(f"[STAFF LOADED] Đã đăng ký khuôn mặt nhân viên: {name}")
                else:
                    print(f"[STAFF WARNING] Không tìm thấy khuôn mặt trong file: {filename}")
            except Exception as e:
                print(f"[STAFF ERROR] Lỗi khi xử lý file {filename}: {e}")
                
    print(f"[AI INFO] Tổng số nhân viên đã nạp dữ liệu: {len(known_face_names)}")


def is_inside_zone(box, zone):
    px = (box[0] + box[2]) / 2
    py = box[3]
    return zone[0] <= px <= zone[2] and zone[1] <= py <= zone[3]


def send_event_to_gas(camera_name, event_type, duration_sec, description, severity="WARNING"):
    payload = {
        "action": "log_camera_event",
        "secret": CAMERA_AI_SECRET,
        "event_data": {
            "camera_name": camera_name,
            "event_type": event_type,
            "duration_sec": duration_sec,
            "description": description,
            "severity": severity,
            "event_title": "Cảnh báo " + ("Người lạ vào quầy" if event_type == "UNUSUAL_BEHAVIOR" else "Vắng nhân viên"),
            "snapshot_url": ""
        }
    }
    try:
        headers = {'Content-Type': 'text/plain'}
        response = requests.post(API_URL, data=json.dumps(payload), headers=headers, timeout=10)
        res_data = response.json()
        if res_data.get("ok"):
            print(f"[WEBHOOK SUCCESS] Đã gửi sự kiện {event_type} thành công: {res_data.get('event_id')}")
        else:
            print(f"[WEBHOOK ERROR] Apps Script từ chối sự kiện: {res_data.get('error')}")
    except Exception as e:
        print(f"[WEBHOOK FAILED] Không thể kết nối Apps Script: {e}")


# =====================================================================
# HÀM PHÂN TÍCH KHUÔN MẶT CỦA NGƯỜI TRONG QUẦY BAR
# =====================================================================
def identify_person_in_bar(frame, box):
    """
    Cắt vùng ảnh chứa người (box) và thực hiện nhận diện khuôn mặt.
    Trả về: (is_staff, name)
    """
    if not FACE_REC_AVAILABLE or len(known_face_encodings) == 0:
        return False, "Unknown (Chưa cài FaceID)"
        
    x1, y1, x2, y2 = map(int, box[:4])
    
    # Mở rộng vùng cắt một chút để lấy trọn vẹn phần đầu/mặt
    h, w, _ = frame.shape
    pad_y = int((y2 - y1) * 0.1)
    pad_x = int((x2 - x1) * 0.1)
    
    crop_y1 = max(0, y1 - pad_y)
    crop_y2 = min(h, y2 + pad_y)
    crop_x1 = max(0, x1 - pad_x)
    crop_x2 = min(w, x2 + pad_x)
    
    crop_img = frame[crop_y1:crop_y2, crop_x1:crop_x2]
    
    # Chuyển sang định dạng RGB cho thư viện face_recognition
    rgb_crop = cv2.cvtColor(crop_img, cv2.COLOR_BGR2RGB)
    
    # Tìm khuôn mặt trong vùng cắt
    face_locations = face_recognition.face_locations(rgb_crop)
    if not face_locations:
        return False, "Unknown (Không thấy mặt)"
        
    # Trích xuất mã khuôn mặt
    face_encodings = face_recognition.face_encodings(rgb_crop, face_locations)
    
    for face_encoding in face_encodings:
        # So khớp với danh sách nhân viên đã biết
        matches = face_recognition.compare_faces(known_face_encodings, face_encoding, tolerance=0.5)
        name = "Stranger"
        
        if True in matches:
            first_match_index = matches.index(True)
            name = known_face_names[first_match_index]
            return True, name
            
    return False, "Stranger"


# =====================================================================
# TIẾN TRÌNH XỬ LÝ CHÍNH
# =====================================================================
def run_camera_analysis():
    print("[AI INFO] Bắt đầu tiến trình phân tích Camera AI...")
    
    # Tải danh sách khuôn mặt nhân viên
    load_registered_staff()
    
    cam_cfg = CAMERAS["Cam_Quay_Bar"]
    cap = cv2.VideoCapture(cam_cfg["stream_url"])
    
    if not cap.isOpened():
        print(f"[AI ERROR] Không thể kết nối luồng camera: {cam_cfg['stream_url']}")
        return
        
    # Các biến trạng thái giám sát
    staff_absent_start_time = None
    absence_alert_sent = False
    
    intruder_start_time = None
    intruder_alert_sent = False
    
    frame_count = 0
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print("[AI WARNING] Mất kết nối camera, đang thử lại...")
            time.sleep(2)
            cap = cv2.VideoCapture(cam_cfg["stream_url"])
            continue
            
        frame_count += 1
        
        # 1. Chạy YOLOv8 để phát hiện người (class 0 = person)
        results = model(frame, classes=[0], verbose=False)
        persons_detected = results[0].boxes.data.tolist() if results[0].boxes else []
        
        # Vẽ Staff Zone quầy bar
        sz = cam_cfg["staff_zone"]
        cv2.rectangle(frame, (sz[0], sz[1]), (sz[2], sz[3]), (0, 255, 0), 2)
        cv2.putText(frame, "STAFF ZONE", (sz[0], sz[1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
        
        staff_present = False
        stranger_present = False
        stranger_name = "Stranger"
        
        for p in persons_detected:
            x1, y1, x2, y2, conf, cls = p
            
            # Kiểm tra xem người này có nằm trong vùng quầy pha chế không
            in_bar = is_inside_zone([x1, y1, x2, y2], sz)
            
            if in_bar:
                # Chạy nhận diện khuôn mặt (để tiết kiệm CPU, cứ mỗi 3 frames chạy 1 lần)
                if frame_count % 3 == 0:
                    is_staff, name = identify_person_in_bar(frame, [x1, y1, x2, y2])
                    if is_staff:
                        staff_present = True
                    else:
                        stranger_present = True
                        stranger_name = name
                else:
                    # Các frames khác giữ nguyên trạng thái phán đoán trước đó để tránh nhấp nháy
                    staff_present = staff_present or False # fallback tạm thời
            
            # Vẽ bounding box người
            color = (0, 255, 0) if staff_present else (255, 0, 0)
            if stranger_present:
                color = (0, 0, 255) # Màu đỏ cảnh báo người lạ đột nhập
                
            cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
            label = "Staff" if staff_present else ("Stranger!" if stranger_present else "Person")
            cv2.putText(frame, label, (int(x1), int(y1) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

        # 2. XỬ LÝ LOGIC 1: VẮNG MẶT NHÂN VIÊN (STAFF ABSENCE)
        if not staff_present and not stranger_present:
            if staff_absent_start_time is None:
                staff_absent_start_time = time.time()
                print(f"[AI STATE] Nhân viên rời quầy lúc: {datetime.now().strftime('%H:%M:%S')}")
            else:
                absent_duration = int(time.time() - staff_absent_start_time)
                if absent_duration >= cam_cfg["absence_threshold_sec"] and not absence_alert_sent:
                    desc = f"Quầy bar không có nhân viên trực liên tục trong {absent_duration} giây."
                    print(f"[AI ALERT] {desc}")
                    send_event_to_gas("Cam_Quay_Bar", "STAFF_ABSENT", absent_duration, desc, severity="WARNING")
                    absence_alert_sent = True
        else:
            # Nếu có bất kỳ ai đứng trong quầy (nhân viên hoặc người lạ)
            if staff_present and staff_absent_start_time is not None:
                absent_duration = int(time.time() - staff_absent_start_time)
                print(f"[AI STATE] Nhân viên đã quay lại quầy. Thời gian vắng: {absent_duration}s")
                if absence_alert_sent:
                    desc = f"Nhân viên đã quay lại quầy sau khi vắng mặt {absent_duration} giây."
                    send_event_to_gas("Cam_Quay_Bar", "STAFF_ABSENT", absent_duration, desc, severity="INFO")
                staff_absent_start_time = None
                absence_alert_sent = False

        # 3. XỬ LÝ LOGIC 2: NGƯỜI LẠ ĐỘT NHẬP QUẦY (UNAUTHORIZED INTRUSION)
        if stranger_present and not staff_present:
            if intruder_start_time is None:
                intruder_start_time = time.time()
                print(f"[AI STATE] Phát hiện người lạ vào quầy bar lúc: {datetime.now().strftime('%H:%M:%S')}")
            else:
                intrusion_duration = int(time.time() - intruder_start_time)
                # Nếu người lạ đứng trong quầy lâu hơn ngưỡng cho phép (15 giây)
                if intrusion_duration >= cam_cfg["intruder_threshold_sec"] and not intruder_alert_sent:
                    desc = f"🚨 CẢNH BÁO: Phát hiện người lạ ({stranger_name}) đứng trong quầy pha chế liên tục {intrusion_duration} giây mà không có nhân viên giám sát."
                    print(f"[AI ALERT] {desc}")
                    # Gửi webhook cảnh báo khẩn cấp cấp độ CRITICAL -> Gửi Gmail cho chủ quán ngay lập tức
                    send_event_to_gas("Cam_Quay_Bar", "UNUSUAL_BEHAVIOR", intrusion_duration, desc, severity="CRITICAL")
                    intruder_alert_sent = True
        else:
            # Nếu người lạ rời đi hoặc có nhân viên đi vào giám sát cùng
            if not stranger_present or staff_present:
                if intruder_start_time is not None:
                    intrusion_duration = int(time.time() - intruder_start_time)
                    print(f"[AI STATE] Người lạ đã rời quầy bar hoặc nhân viên đã xuất hiện.")
                    intruder_start_time = None
                    intruder_alert_sent = False

        # Hiển thị camera setup vẽ zone
        cv2.imshow("MitsuCam AI — Setup Monitor", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
            
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    try:
        run_camera_analysis()
    except KeyboardInterrupt:
        print("\n[AI INFO] Đã dừng tiến trình AI theo yêu cầu.")
