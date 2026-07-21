#!/bin/bash
# fix_dispatcher.sh — chạy TRÊN MÁY `_healer` (user macOS riêng, không credential
# deploy). Poll FIX_QUEUE qua HEALER_QUEUE_TOKEN (hẹp, chỉ 2 action) → spawn `claude -p
# /fix` khi có fix pending. KHÔNG BAO GIỜ deploy — xem docs/superpowers/specs/
# 2026-07-16-self-healing-v2-design.md §2, §4.
#
# Cài trên máy _healer: cron mỗi 2 phút, HOME=/Users/_healer.
# `_healer` dùng CLONE RIÊNG (không phải worktree lồng cây `dpd`) — xem plan
# docs/superpowers/plans/2026-07-16-self-healing-v2-plan.md Task 6.

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

REPO="$HOME/lamha-kissaten"
cd "$REPO" || exit 1

URL="https://script.google.com/macros/s/AKfycbynDqbg-Xn9hEbUyhsZl_MF0dGsCqLpfTgJ-Us3QHiGqkrKV3hwZD__-fKW2kFJZzC7/exec"
AUTH="$HOME/.claude/.healer-auth.json"
LOG="$HOME/fix_dispatcher.log"
LOCK="$HOME/.fix_dispatcher.lock"

if [ -d "$LOCK" ] && [ -z "$(find "$LOCK" -maxdepth 0 -mmin -10 2>/dev/null)" ]; then
  echo "$(date '+%F %T') gỡ lock cũ (stale >10m)" >> "$LOG"
  rmdir "$LOCK" 2>/dev/null
fi
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "$(date '+%F %T') skip · đang chạy" >> "$LOG"; exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

TOKEN=$(jq -r '.healer_queue_token // ""' "$AUTH" 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo "$(date '+%F %T') LỖI: thiếu healer_queue_token — dừng, không poll" >> "$LOG"
  exit 1
fi

RESP=$(curl -sL --max-time 30 "$URL?action=healer_pull&token=$TOKEN")
N=$(echo "$RESP" | jq '.fixes | length' 2>/dev/null); [ -z "$N" ] && N=0
echo "$(date '+%F %T') heartbeat · pending=$N" >> "$LOG"

if [ "$N" -gt 0 ] 2>/dev/null; then
  echo "$(date '+%F %T') → spawn claude /fix ($N fix)" >> "$LOG"
  claude -p "/fix" \
    --permission-mode dontAsk \
    --allowedTools "Read" "Edit" "Write($REPO/**)" "Bash(git *)" "Bash(node --test *)" "Bash(python3 -m unittest *)" \
    --disallowedTools "Bash(*gas_push*)" "Bash(*deploy_gas*)" "Bash(*clasprc*)" \
    >> "$LOG" 2>&1
  echo "$(date '+%F %T') ← claude xong" >> "$LOG"
fi

tail -n 800 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
