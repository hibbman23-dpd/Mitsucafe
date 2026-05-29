# -*- coding: utf-8 -*-
"""
camera_ai.py — AI Agent chạy phân tích thị giác máy tính trên Mac Mini M4 cho Lâm Hà Kissaten.

Yêu cầu môi trường trên Mac Mini:
  1. Cài đặt Python 3.10+
  2. Cài đặt thư viện: pip install opencv-python ultralytics requests
  3. Tải model YOLOv8 (tự động tải lần đầu chạy): yolov8n.pt (nhẹ, nhanh, phù hợp thời gian thực)

Cách chạy ngầm khi khởi động macOS:
  Tạo file LaunchAgent hoặc add file script này vào System Settings -> General -> Login Items.
"""

import cv2
import time
import requests
import json
from datetime import datetime

# =====================================================================
# CẤU HÌNH HỆ THỐNG (Đồng bộ với Google Sheets CONFIG)
# =====================================================================
# Thay thế bằng Web App URL thực tế của Apps Script của bạn
API_URL = "https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec"

# API Key tĩnh để xác thực với Apps Script (lấy từ sheet CONFIG -> CAMERA_AI_SECRET)
# Bạn sẽ đổi giá trị này khớp với giá trị được sinh ra trong CONFIG sau khi chạy setup
CAMERA_AI_SECRET = "CHANGE_ME_TO_ACTUAL_SECRET_FROM_CONFIG"

# Luồng RTSP của các Camera IP trong quán (Thay thế bằng URL RTSP thực tế)
# Ví dụ RTSP Ezviz: "rtsp://admin:mật_khẩu@192.168.1.100:554/h264/ch1/main/av_stream"
CAMERAS = {
    "Cam_Quay_Bar": {
        "stream_url": 0,  # 0 đại diện cho webcam của Mac Mini để test thử, thay bằng RTSP URL khi chạy thật
        "staff_zone": [200, 100, 450, 320], # Tọa độ vùng đứng của nhân viên [x_min, y_min, x_max, y_max]
        "absence_threshold_sec": 300,        # Cảnh báo nếu nhân viên vắng mặt liên tục > 5 phút (300s)
    },
    "Cam_Sanh_Khach": {
        "stream_url": 0,  # Thay bằng RTSP URL của Camera sảnh khách
        "queue_zone": [50, 80, 450, 300],   # Tọa độ vùng khách hàng đứng xếp hàng
        "max_queue_allowed": 3,              # Cảnh báo nếu hàng đợi có từ 3 khách trở lên
        "queue_duration_sec": 180,           # Kéo dài liên tục > 3 phút (180s) thì cảnh báo
    }
}

# =====================================================================
# KHỞI TẠO AI MODEL (YOLOv8)
# =====================================================================
try:
    from ultralytics import YOLO
    model = YOLO("yolov8n.pt")  # Tải mô hình nhận diện vật thể YOLOv8 Nano siêu nhẹ
    print("[AI INFO] Khởi tạo mô hình YOLOv8 thành công.")
except Exception as e:
    print(f"[AI ERROR] Không thể load model YOLOv8. Hãy chắc chắn đã chạy 'pip install ultralytics': {e}")
    exit(1)


def is_inside_zone(box, zone):
    """
    Kiểm tra xem tọa độ hộp nhận diện của người (box) có nằm trong vùng giám sát (zone) hay không.
    box: [x1, y1, x2, y2]
    zone: [x_min, y_min, x_max, y_max]
    """
    px = (box[0] + box[2]) / 2  # Điểm tâm ngang của người
    py = box[3]                 # Điểm chân của người
    return zone[0] <= px <= zone[2] and zone[1] <= py <= zone[3]


def send_event_to_gas(camera_name, event_type, duration_sec, description, severity="WARNING"):
    """
    Gửi dữ liệu sự kiện AI về webhook của Google Apps Script.
    """
    payload = {
        "action": "log_camera_event",
        "secret": CAMERA_AI_SECRET,
        "event_data": {
            "camera_name": camera_name,
            "event_type": event_type,
            "duration_sec": duration_sec,
            "description": description,
            "severity": severity,
            "event_title": "Cảnh báo " + ("Vắng nhân viên" if event_type == "STAFF_ABSENT" else "Đông khách"),
            "snapshot_url": "" # Ảnh chụp chụp trực tiếp có thể upload lên Drive thông qua API riêng nếu cần
        }
    }
    
    try:
        headers = {'Content-Type': 'text/plain'} # Dùng text/plain để tránh các vấn đề CORS
        response = requests.post(API_URL, data=json.dumps(payload), headers=headers, timeout=10)
        res_data = response.json()
        if res_data.get("ok"):
            print(f"[WEBHOOK SUCCESS] Đã gửi sự kiện {event_type} thành công: {res_data.get('event_id')}")
        else:
            print(f"[WEBHOOK ERROR] Apps Script từ chối sự kiện: {res_data.get('error')}")
    except Exception as e:
        print(f"[WEBHOOK FAILED] Không thể kết nối Apps Script: {e}")


def run_camera_analysis():
    print("[AI INFO] Bắt đầu tiến trình phân tích Camera AI...")
    
    # Ở đây mô tả luồng phân tích trên Camera 01 (Quầy Bar) làm ví dụ thực tế.
    cam_cfg = CAMERAS["Cam_Quay_Bar"]
    cap = cv2.VideoCapture(cam_cfg["stream_url"])
    
    if not cap.isOpened():
        print(f"[AI ERROR] Không thể kết nối luồng camera: {cam_cfg['stream_url']}")
        return
        
    staff_absent_start_time = None
    alert_sent = False
    
    print("[AI INFO] Đang đọc hình ảnh...")
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print("[AI WARNING] Mất khung hình từ Camera, đang thử kết nối lại...")
            time.sleep(2)
            cap = cv2.VideoCapture(cam_cfg["stream_url"])
            continue
            
        # 1. Chạy suy luận AI trên khung hình (Chỉ lọc lớp 0 đại diện cho 'person' trong bộ dữ liệu COCO)
        results = model(frame, classes=[0], verbose=False)
        
        staff_present = False
        persons_detected = results[0].boxes.data.tolist() if results[0].boxes else []
        
        # Lấy tọa độ Staff Zone
        sz = cam_cfg["staff_zone"]
        
        # Vẽ Staff Zone trên màn hình kiểm thử
        cv2.rectangle(frame, (sz[0], sz[1]), (sz[2], sz[3]), (0, 255, 0), 2)
        cv2.putText(frame, "STAFF ZONE", (sz[0], sz[1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
        
        for p in persons_detected:
            x1, y1, x2, y2, conf, cls = p
            # Vẽ hộp bounding box cho từng người phát hiện
            cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (255, 0, 0), 2)
            
            # Kiểm tra xem người này có đứng trong vùng Quầy Bar của nhân viên không
            if is_inside_zone([x1, y1, x2, y2], sz):
                staff_present = True
                cv2.putText(frame, "STAFF PRESENT", (int(x1), int(y1) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
                
        # 2. Xử lý logic vắng mặt
        if not staff_present:
            if staff_absent_start_time is None:
                # Bắt đầu tính giờ vắng mặt
                staff_absent_start_time = time.time()
                print(f"[AI STATE] Nhân viên rời quầy lúc: {datetime.now().strftime('%H:%M:%S')}")
            else:
                absent_duration = int(time.time() - staff_absent_start_time)
                # Nếu vắng mặt quá ngưỡng cấu hình và chưa gửi cảnh báo
                if absent_duration >= cam_cfg["absence_threshold_sec"] and not alert_sent:
                    desc = f"Quầy bar không có nhân viên trực liên tục trong {absent_duration} giây."
                    print(f"[AI ALERT] {desc}")
                    # Gửi webhook cảnh báo mức CRITICAL về Apps Script
                    send_event_to_gas("Cam_Quay_Bar", "STAFF_ABSENT", absent_duration, desc, severity="CRITICAL")
                    alert_sent = True
        else:
            # Nếu nhân viên quay lại quầy
            if staff_absent_start_time is not None:
                absent_duration = int(time.time() - staff_absent_start_time)
                print(f"[AI STATE] Nhân viên đã quay lại quầy. Thời gian vắng: {absent_duration}s")
                # Nếu trước đó đã gửi cảnh báo vắng mặt lâu, ghi nhận sự kiện kết thúc vắng mặt
                if alert_sent:
                    desc = f"Nhân viên đã quay lại quầy sau khi vắng mặt {absent_duration} giây."
                    send_event_to_gas("Cam_Quay_Bar", "STAFF_ABSENT", absent_duration, desc, severity="INFO")
                
                # Reset trạng thái
                staff_absent_start_time = None
                alert_sent = False
                
        # Hiển thị lên màn hình (chỉ hiển thị khi chạy trực tiếp có màn hình để setup vẽ zone)
        # Nhấn 'q' để thoát tiến trình
        cv2.imshow("KaeruCam AI — Setup Monitor", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
            
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    # Để kiểm tra thử khi viết code, chạy trực tiếp script này: python camera_ai.py
    # Bạn sẽ thấy màn hình camera hiện lên và nhận diện vùng Staff Zone.
    try:
        run_camera_analysis()
    except KeyboardInterrupt:
        print("\n[AI INFO] Đã dừng tiến trình AI theo yêu cầu.")
