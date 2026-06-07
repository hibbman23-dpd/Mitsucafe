#!/bin/bash
# heartbeat.sh — chỉ ghi nhịp tim để đèn dashboard luôn 🟢. KHÔNG gọi Claude.
# An toàn tuyệt đối (chỉ curl), 0đ token. Chạy mỗi 2 phút qua crontab.
# Xử lý lệnh thực tế: chạy `/inbox` tay khi cần (xem dispatcher.sh nếu muốn auto).

cd "$(dirname "$0")/.." || exit 1
URL="https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec"
TOKEN=""
[ -f ".claude/.dispatcher-auth.json" ] && TOKEN=$(jq -r '.report_api_token // ""' .claude/.dispatcher-auth.json 2>/dev/null)
Q=""; [ -n "$TOKEN" ] && Q="&token=$TOKEN"

RESP=$(curl -sL --max-time 30 "$URL?action=dispatch_pull$Q")
N=$(echo "$RESP" | jq '.commands | length' 2>/dev/null); [ -z "$N" ] && N=0
echo "$(date '+%F %T') heartbeat · pending=$N" >> ops/dispatcher.log
tail -n 500 ops/dispatcher.log > ops/dispatcher.log.tmp 2>/dev/null && mv ops/dispatcher.log.tmp ops/dispatcher.log
