#!/usr/bin/env bash
# run_camera_ai.sh — Tiện ích khởi chạy Camera AI nội bộ của Mitsu Cafe.
# Hướng dẫn: Mở một cửa sổ Terminal mới trên màn hình chính và chạy lệnh:
#   bash ops/run_camera_ai.sh
# (Đảm bảo cửa sổ Terminal đã được cấp quyền truy cập Camera trong macOS Settings)

cd "$(dirname "$0")/.." || exit 1

echo "=== KHỞI CHẠY HỆ THỐNG CAMERA AI ==="

# 1. Tắt AirPlay Receiver để giải phóng cổng 5000
echo "[INFO] Đang giải phóng cổng 5000 (tắt AirPlay Receiver)..."
defaults -currentHost write com.apple.controlcenter.plist AirplayRecieverEnabled -bool false 2>/dev/null
defaults -currentHost write com.apple.controlcenter.plist AirplayReceiverEnabled -bool false 2>/dev/null
killall ControlCenter 2>/dev/null
sleep 1

# Kiểm tra lại cổng 5000
if lsof -i :5000 >/dev/null 2>&1; then
  echo "❌ Cảnh báo: Cổng 5000 vẫn đang bị chiếm dụng bởi tiến trình:"
  lsof -i :5000
  echo "Vui lòng tắt ứng dụng đang dùng cổng 5000 rồi thử lại."
  exit 1
fi

echo "🟢 Cổng 5000 đã sẵn sàng!"

# 2. Khởi chạy Camera AI
PYTHON_EXEC="/Library/Frameworks/Python.framework/Versions/3.14/bin/python3"
if [ ! -f "$PYTHON_EXEC" ]; then
  PYTHON_EXEC="python3"
fi

# CẤU HÌNH BẢO MẬT: Nhập mã CAMERA_AI_SECRET trùng với mã trong CONFIG sheet tại đây
export CAMERA_AI_SECRET="nhập_mã_secret_ở_đây"

echo "[INFO] Đang khởi động dual_camera_ai.py..."
"$PYTHON_EXEC" ops/dual_camera_ai.py
