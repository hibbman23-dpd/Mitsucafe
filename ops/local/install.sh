#!/bin/bash
# -*- coding: utf-8 -*-
# install.sh — Script cài đặt chuẩn hóa hệ thống Hermes Insight cục bộ trên macOS (Tier Done-With-You).
# Đảm bảo chạy từ thư mục root của repo.

set -e

echo "=== BẮT ĐẦU CÀI ĐẶT HỆ THỐNG HERMES LOCAL INSIGHT ==="

# 1. Kiểm tra môi trường macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "❌ Lỗi: Hệ thống này chỉ hỗ trợ hệ điều hành macOS!"
  exit 1
fi

# 2. Kiểm tra Homebrew
if ! command -v brew &> /dev/null; then
  echo "⚠️ Homebrew chưa được cài đặt. Đang cài đặt Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# 3. Cài đặt các gói Brew cần thiết
echo "Installing Node.js & Ollama via Homebrew..."
brew install node || true
brew install --cask ollama || true

# Khởi động Ollama nếu chưa chạy
if ! pgrep -x "Ollama" &> /dev/null; then
  echo "Starting Ollama app..."
  open -a Ollama
  sleep 10
fi

# 4. Kéo các mô hình AI cần thiết
echo "Pulling models from Ollama registry..."
ollama pull bge-m3 || echo "Warning: bge-m3 pull failed. Please pull manually later."
ollama pull gemma4:12b-it-qat || echo "Warning: gemma4:12b-it-qat pull failed. Please pull manually later."

# 5. Cấu hình thư mục bí mật và thông tin cấu hình
mkdir -p local/secrets local/data local/memory

if [ ! -f "QUAN.yaml" ]; then
  echo "⚠️ Không tìm thấy QUAN.yaml ở thư mục gốc."
  echo "Vui lòng copy file QUAN.yaml của quán vào đây rồi nhấn Enter để tiếp tục..."
  read -r
fi

if [ ! -f "local/secrets/sa.json" ]; then
  echo "⚠️ Không tìm thấy key Service Account local/secrets/sa.json."
  echo "Hãy tải JSON key của Service Account và lưu vào local/secrets/sa.json."
  echo "Nhấn Enter để tiếp tục sau khi hoàn tất..."
  read -r
fi

chmod 600 local/secrets/sa.json || true

# 6. Thiết lập Python Virtual Environment và cài đặt thư viện
echo "Setting up Python virtual environment..."
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r ops/local/requirements.txt

# 7. Xây dựng index RAG ban đầu
echo "Building initial shop corpus and KB RAG index..."
.venv/bin/python3 ops/local/build_shop_corpus.py
node ops/local/kb_build.js

# 8. Cấu hình LaunchAgents giám sát tự động (Cron)
echo "Installing LaunchAgents..."
mkdir -p ~/Library/LaunchAgents

# Sao chép và thay thế đường dẫn Repo thật vào plist
REPO_PATH=$(pwd)
PLIST_NAME="cafe.local.pull.plist"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME"

cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>cafe.local.pull</string>
  <key>ProgramArguments</key><array>
    <string>$REPO_PATH/.venv/bin/python3</string>
    <string>$REPO_PATH/ops/local/sheets_pull.py</string>
  </array>
  <key>StartCalendarInterval</key><array>
    <dict><key>Hour</key><integer>23</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>23</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Hour</key><integer>0</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>StandardErrorPath</key><string>$REPO_PATH/local/pull.err.log</string>
  <key>StandardOutPath</key><string>$REPO_PATH/local/pull.out.log</string>
</dict></plist>
EOF

# Load Agent
launchctl unload "$PLIST_PATH" &> /dev/null || true
launchctl load "$PLIST_PATH"
echo "Loaded LaunchAgent: cafe.local.pull (Chạy kéo đơn lúc 23:00 hằng ngày)"

echo "=== HOÀN TẤT CÀI ĐẶT HỆ THỐNG ==="
echo "Mẹo: Bạn có thể chạy thử 'launchctl start cafe.local.pull' để kéo dữ liệu ngay lập tức."
echo "Kiểm tra kết quả trong local/data/latest/."
