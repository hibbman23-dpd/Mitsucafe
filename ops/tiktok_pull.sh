#!/bin/bash
# tiktok_pull.sh — kéo metric video TikTok bằng yt-dlp (FREE, không cần API key)
#   yt-dlp --dump-json <profile> → jq chuẩn hoá → POST GAS doPost?action=tiktok_ingest
#   → upsertMarketingByExternalId('tt_<id>') (idempotent, giữ NGÀY ĐĂNG THẬT).
# Chạy 1 lần/ngày qua crontab (vd 7:10 sáng). yt-dlp lấy view/like/comment/repost + upload_date.
#
# Cài 1 lần trên Mac mini:  brew install yt-dlp jq
#   (brew bundle sẵn curl_cffi → hỗ trợ "impersonation" giúp né TikTok chặn bot.
#    Nếu cài bằng pip thì: pip install "yt-dlp[default,curl-cffi]" để có impersonation.)
# Crontab:                  10 7 * * *  /Users/dpd/Projects/lamha-kissaten/ops/tiktok_pull.sh
#
# ✅ ĐÃ TEST THẬT trên @mitsucafe83 (2026-06-20): trả đúng view/like/comment/share + ngày đăng thật.
# ⚠️ TikTok chặn bot không đều — nếu yt-dlp trả rỗng thì script bỏ qua (về nhập tay), KHÔNG ghi sai.
#    Khi TikTok đổi layout: `brew upgrade yt-dlp` (extractor vá rất nhanh).

# cron có PATH tối thiểu → nạp đường dẫn cho yt-dlp/jq/curl
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

cd "$(dirname "$0")/.." || exit 1

# Dùng CHUNG deployment + token với dispatcher (Mac mini đã xác thực được URL này).
URL="https://script.google.com/macros/s/AKfycbynDqbg-Xn9hEbUyhsZl_MF0dGsCqLpfTgJ-Us3QHiGqkrKV3hwZD__-fKW2kFJZzC7/exec"
AUTH=".claude/.dispatcher-auth.json"
LOG="ops/tiktok_pull.log"
PROFILE="${TIKTOK_PROFILE_URL:-https://www.tiktok.com/@mitsucafe83}"
LIMIT="${TIKTOK_LIMIT:-30}"   # số video gần nhất kéo mỗi lần

TS="$(date '+%F %T')"

TOKEN=""
[ -f "$AUTH" ] && TOKEN=$(jq -r '.report_api_token // ""' "$AUTH" 2>/dev/null)

# yt-dlp xuất NDJSON (1 object/video) → jq -s gom mảng + chuẩn hoá field.
# upload_date dạng YYYYMMDD → cắt chuỗi thành YYYY-MM-DD (không phụ thuộc strptime).
JSON=$(yt-dlp --skip-download --dump-json --ignore-errors \
        --playlist-end "$LIMIT" "$PROFILE" 2>>"$LOG" \
  | jq -s '[ .[] | {
      id: (.id | tostring),
      title: ((.title // .description // "") | tostring | .[0:80]),
      views: (.view_count // 0),
      likes: (.like_count // 0),
      comments: (.comment_count // 0),
      shares: (.repost_count // 0),
      date: ((.upload_date // "") | tostring
             | if length == 8 then "\(.[0:4])-\(.[4:6])-\(.[6:8])" else "" end)
    } ]' 2>>"$LOG")

CNT=$(echo "$JSON" | jq 'length' 2>/dev/null); [ -z "$CNT" ] && CNT=0

if [ "$CNT" -eq 0 ] 2>/dev/null; then
  echo "$TS · 0 video (yt-dlp rỗng/bị chặn) — bỏ qua, dùng nhập tay" >> "$LOG"
  tail -n 500 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
  exit 0
fi

BODY=$(jq -n --argjson v "$JSON" '{action:"tiktok_ingest", videos:$v}')
RESP=$(curl -sL --max-time 60 -X POST -H "Content-Type: application/json" \
        --data "$BODY" "$URL?action=tiktok_ingest&token=$TOKEN")
echo "$TS · pulled=$CNT · resp=$RESP" >> "$LOG"

tail -n 500 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
