#!/usr/bin/env python3
"""
camera_count.py — Đếm khách VÀO cửa (ẩn danh) → POST GAS traffic_ingest → FOOT_TRAFFIC.
Cho conversion = đơn / khách-vào (mẫu số còn THIẾU của mọi ROI).

CHẾ ĐỘ:
  --count N        : gửi tay N lượt (chạy được NGAY, để test/đếm thủ công).
  --camera         : đếm bằng camera (POST-LAUNCH — cần camera + model, xem TODO).

Chạy thử:  python3 ops/camera_count.py --count 120
Cron (post-launch, chốt cuối ngày 23:55):
  55 23 * * *  python3 /Users/dpd/Projects/lamha-kissaten/ops/camera_count.py --camera

⚠️ Riêng tư: CHỈ đếm số người, KHÔNG lưu mặt/ảnh; treo biển báo có camera (Nghị định 13/2023).
"""
import argparse, json, os, sys, urllib.request, urllib.parse
from datetime import date

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec"

def token():
    try:
        with open(os.path.join(REPO, ".claude/.dispatcher-auth.json")) as f:
            return json.load(f).get("report_api_token", "")
    except Exception:
        return ""

def ingest(walk_ins, d=None, source="camera"):
    qs = urllib.parse.urlencode({
        "action": "traffic_ingest", "walk_ins": int(walk_ins),
        "date": d or date.today().isoformat(), "source": source, "token": token(),
    })
    # Apps Script GET 302→googleusercontent; urllib follow redirect mặc định.
    req = urllib.request.Request(URL + "?" + qs)
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read().decode("utf-8", "replace")
    print("→", body[:200])

def count_with_camera():
    """POST-LAUNCH TODO: đếm người băng qua vạch cửa bằng camera (chạy local, FREE).
    Gợi ý triển khai (tận dụng ops/camera_ai.py + GCP credit để hiệu chỉnh 1 lần):
      1. Lấy frame từ camera cửa (cv2.VideoCapture / RTSP).
      2. Phát hiện người: YOLO/MobileSSD on-device (KHÔNG gửi ảnh lên cloud → riêng tư + free).
      3. Đếm lượt băng qua 1 vạch ảo (line-crossing) trong ngày.
      4. Cuối ngày gọi ingest(total).
    Hiệu chỉnh độ chính xác có thể dùng credit Vertex 1 lần rồi inference local mãi.
    """
    raise SystemExit("Chế độ --camera là POST-LAUNCH (cần camera + model). Dùng --count N để gửi thủ công.")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, help="Gửi tay số lượt khách vào cửa")
    ap.add_argument("--date", help="yyyy-mm-dd (mặc định hôm nay)")
    ap.add_argument("--camera", action="store_true", help="Đếm bằng camera (post-launch)")
    a = ap.parse_args()
    if a.camera:
        count_with_camera()
    elif a.count is not None:
        ingest(a.count, a.date, "manual")
    else:
        ap.error("cần --count N hoặc --camera")
