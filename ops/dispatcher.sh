#!/bin/bash
# dispatcher.sh — cầu nối Dashboard chat → Claude Code, tối ưu token.
#   1. curl dispatch_pull → heartbeat (đèn 🟢) + lấy lệnh pending  (0đ token)
#   2. CHỈ khi có lệnh → spawn `claude -p /inbox` (process MỚI, đọc CLAUDE.md+memory+/inbox,
#      KHÔNG đọc lại hội thoại dài → rẻ).
# Chạy mỗi 2 phút qua crontab. Idle = chỉ 1 curl.
#
# ⚠️ Dùng --dangerously-skip-permissions để chạy headless không bị hỏi duyệt.
#    An toàn dựa trên: hàng đợi chỉ admin (đăng nhập dashboard) ghi được + /inbox chỉ draft.

# cron có PATH tối thiểu → nạp đường dẫn cho claude/jq/curl
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

cd "$(dirname "$0")/.." || exit 1
URL="https://script.google.com/macros/s/AKfycbynDqbg-Xn9hEbUyhsZl_MF0dGsCqLpfTgJ-Us3QHiGqkrKV3hwZD__-fKW2kFJZzC7/exec"
AUTH=".claude/.dispatcher-auth.json"
LOG="ops/dispatcher.log"
LOCK="ops/.dispatcher.lock"

# Gỡ lock CŨ (stale) nếu quá 10 phút — phòng process bị kill cứng khiến trap không gỡ kịp
if [ -d "$LOCK" ] && [ -z "$(find "$LOCK" -maxdepth 0 -mmin -10 2>/dev/null)" ]; then
  echo "$(date '+%F %T') gỡ lock cũ (stale >10m)" >> "$LOG"
  rmdir "$LOCK" 2>/dev/null
fi

# Chống chạy chồng (lệnh trước chưa xong)
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "$(date '+%F %T') skip · đang chạy" >> "$LOG"; exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

TOKEN=""
[ -f "$AUTH" ] && TOKEN=$(jq -r '.report_api_token // ""' "$AUTH" 2>/dev/null)
Q=""; [ -n "$TOKEN" ] && Q="&token=$TOKEN"

RESP=$(curl -sL --max-time 30 "$URL?action=dispatch_pull$Q")
N=$(echo "$RESP" | jq '.commands | length' 2>/dev/null); [ -z "$N" ] && N=0
TS="$(date '+%F %T')"
echo "$TS heartbeat · pending=$N" >> "$LOG"

if [ "$N" -gt 0 ] 2>/dev/null; then
  echo "$TS → spawn claude /inbox ($N lệnh)" >> "$LOG"
  claude -p "/inbox" --dangerously-skip-permissions >> "$LOG" 2>&1
  echo "$(date '+%F %T') ← claude xong" >> "$LOG"
fi

tail -n 800 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
