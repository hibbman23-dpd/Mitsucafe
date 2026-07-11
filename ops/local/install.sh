#!/bin/bash
# -*- coding: utf-8 -*-
# install.sh — Cài đặt chuẩn hóa Hermes Local Insight trên macOS (Tier Done-With-You).
# Chạy TỪ THƯ MỤC ROOT của repo: bash ops/local/install.sh
#
# Model: mitsu-insight = gemma4:12b-it-qat + Modelfile.mitsu-a (đúng cấu hình đã pass eval 100%).
#   (Biến thể QAT gemma4:12b-it-qat để dành cho A/B eval sau — guardrail #2 plan; chưa kích hoạt.)
# Embed: nomic-embed-text:latest (khớp EMBED_MODEL trong kb_build.js / kb_query.js).

set -e

REPO_PATH=$(pwd)
PY="$REPO_PATH/.venv/bin/python3"
LA="$HOME/Library/LaunchAgents"

echo "=== CÀI ĐẶT HERMES LOCAL INSIGHT ==="
echo "Repo: $REPO_PATH"

# 0. Sanity: đúng thư mục root repo?
if [ ! -f "ops/local/build_shop_corpus.py" ] || [ ! -f "eval/run_eval.py" ]; then
  echo "❌ Chạy sai chỗ. Vào thư mục root repo rồi chạy: bash ops/local/install.sh"
  exit 1
fi

# 1. macOS?
if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "❌ Chỉ hỗ trợ macOS."
  exit 1
fi

# 2. Homebrew
if ! command -v brew &> /dev/null; then
  echo "⚠️ Cài Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# 3. Node + Ollama
echo "Cài Node.js & Ollama..."
brew install node || true
brew install --cask ollama || true

if ! pgrep -x "Ollama" &> /dev/null; then
  echo "Khởi động Ollama..."
  open -a Ollama
  sleep 10
fi

# 4. Pull model (khớp code) + tạo mitsu-insight
echo "Pull base model + embed model..."
ollama pull gemma4:12b-it-qat
ollama pull nomic-embed-text

echo "Tạo model chat 'mitsu-insight' từ Modelfile.mitsu-a..."
ollama create mitsu-insight -f ops/local/Modelfile.mitsu-a
ollama list | grep -q "mitsu-insight" || { echo "❌ Tạo mitsu-insight thất bại."; exit 1; }

# 5. Thư mục + secrets
mkdir -p local/secrets local/data local/memory

if [ ! -f "QUAN.yaml" ]; then
  echo "⚠️ Thiếu QUAN.yaml ở root. Copy QUAN.yaml của quán vào rồi Enter..."
  read -r
fi

if [ ! -f "local/secrets/sa.json" ]; then
  echo "⚠️ Thiếu local/secrets/sa.json (Service Account key)."
  echo "   Tải JSON key SA (đã share Sheet view-only cho email SA) vào local/secrets/sa.json rồi Enter..."
  read -r
fi
[ -f "local/secrets/sa.json" ] && chmod 600 local/secrets/sa.json

# 6. venv + libs
echo "Python venv + requirements..."
python3 -m venv .venv
"$REPO_PATH/.venv/bin/pip" install --upgrade pip
"$REPO_PATH/.venv/bin/pip" install -r ops/local/requirements.txt

# 7. Kéo data lần đầu (nếu có SA hợp lệ) — corpus/eval cần MENU.csv + ORDERS.csv
if [ -f "local/secrets/sa.json" ]; then
  echo "Kéo dữ liệu Sheets lần đầu..."
  "$PY" ops/local/sheets_pull.py || echo "⚠️ Pull lần đầu lỗi — kiểm sa.json / sheet_id / share quyền. Sẽ tự chạy lại 23:00."
fi

# 8. Corpus shop + RAG index
echo "Build corpus shop + RAG index..."
"$PY" ops/local/build_shop_corpus.py
node ops/local/kb_build.js

# 9. Git repo riêng cho memory (memory_store.snapshot cần)
if [ ! -d "local/memory/.git" ]; then
  echo "Khởi tạo git repo local/memory..."
  git -C local/memory init -q
  git -C local/memory config user.name "mitsu-local" || true
  git -C local/memory config user.email "local@mitsu.cafe" || true
  git -C local/memory commit -q --allow-empty -m "init memory store"
fi

# 10. LaunchAgents — cài đủ 6 job theo Nhịp chạy plan
mkdir -p "$LA"

# write_plist LABEL SCRIPT "<calendar-xml-fragment>"
write_plist() {
  local label="$1" script="$2" calendar="$3"
  local p="$LA/$label.plist"
  cat > "$p" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array>
    <string>$PY</string>
    <string>$REPO_PATH/ops/local/$script</string>
  </array>
  <key>StartCalendarInterval</key><array>$calendar</array>
  <key>StandardErrorPath</key><string>$REPO_PATH/local/$label.err.log</string>
  <key>StandardOutPath</key><string>$REPO_PATH/local/$label.out.log</string>
</dict></plist>
EOF
  plutil -lint "$p" >/dev/null || { echo "❌ plist lỗi: $label"; exit 1; }
  launchctl unload "$p" &> /dev/null || true
  launchctl load "$p"
  echo "  loaded: $label"
}

# hourly 08–21 cho pull_approvals
APPROVE_CAL=""
for h in 8 9 10 11 12 13 14 15 16 17 18 19 20 21; do
  APPROVE_CAL="$APPROVE_CAL<dict><key>Hour</key><integer>$h</integer><key>Minute</key><integer>0</integer></dict>"
done

echo "Cài LaunchAgents..."
write_plist "cafe.local.pull"      "sheets_pull.py" \
  "<dict><key>Hour</key><integer>23</integer><key>Minute</key><integer>0</integer></dict><dict><key>Hour</key><integer>23</integer><key>Minute</key><integer>30</integer></dict><dict><key>Hour</key><integer>0</integer><key>Minute</key><integer>0</integer></dict>"
write_plist "cafe.local.freshness" "freshness_check.py" \
  "<dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>30</integer></dict>"
write_plist "cafe.local.insight"   "insight_batch.py" \
  "<dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>"
write_plist "cafe.local.approval-send" "send_approval.py" \
  "<dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>5</integer></dict>"
write_plist "cafe.local.approvals" "pull_approvals.py" "$APPROVE_CAL"
write_plist "cafe.local.weekly"    "weekly_digest.py" \
  "<dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>30</integer></dict>"

# 11. Eval kiểm chất lượng (chỉ khi đã có data)
if [ -f "local/data/latest/ORDERS.csv" ]; then
  echo "Chạy eval nghiệm thu..."
  "$PY" eval/run_eval.py || echo "⚠️ Eval báo fail — xem log, KHÔNG bàn giao khi core/canary chưa đạt."
else
  echo "ℹ️ Chưa có data (chưa pull được) — bỏ qua eval. Sau khi pull thành công, chạy: $PY eval/run_eval.py"
fi

echo ""
echo "=== HOÀN TẤT CÀI ĐẶT LOCAL ==="
echo "Việc TAY còn lại (ngoài script này):"
echo "  1. Deploy Cloudflare Worker duyệt:"
echo "       cd workers/approve"
echo "       npx wrangler kv namespace create APPROVE   # thay id vào wrangler.jsonc (bỏ PLACEHOLDER_KV_ID)"
echo "       npx wrangler secret put TG_TOKEN / TG_CHAT / TG_WEBHOOK_SECRET / OPS_KEY"
echo "       npx wrangler deploy"
echo "       curl \"https://api.telegram.org/bot\$TG_TOKEN/setWebhook?url=<worker>/tg&secret_token=\$TG_WEBHOOK_SECRET&allowed_updates=[\\\"callback_query\\\"]\""
echo "     rồi điền worker_url vào QUAN.yaml (mục ops:)."
echo "  2. Kiểm tra: launchctl list | grep cafe.local"
echo "  3. Chạy thử pull ngay: launchctl start cafe.local.pull  (xem local/data/latest/)"
