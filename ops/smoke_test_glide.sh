#!/usr/bin/env bash
# Smoke test cho Day 4: gửi payload mô phỏng Glide tới GAS Web App.
# Usage: bash ops/smoke_test_glide.sh

set -euo pipefail

GAS_URL="https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec"
PAYLOAD="$(dirname "$0")/../seed/test_glide_payload.json"

echo "==> POST $GAS_URL"
echo "==> Payload: $PAYLOAD"
echo ""

# GAS redirects POST → follow redirect manually
REDIRECT=$(curl -sS -X POST "$GAS_URL" \
  -H "Content-Type: application/json" \
  -d @"$PAYLOAD" \
  -w "%{redirect_url}" -o /tmp/gas_step1.json)

if [ -n "$REDIRECT" ]; then
  echo "==> Following redirect: $REDIRECT"
  RESPONSE=$(curl -sS "$REDIRECT")
else
  RESPONSE=$(cat /tmp/gas_step1.json)
fi

echo "==> Response:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

# Test GET menu endpoint (GAS redirects GET cũng cần follow)
echo "==> GET ?action=menu (chỉ in count để khỏi spam):"
curl -sSL "$GAS_URL?action=menu" | python3 -c "
import json,sys
try:
    d = json.load(sys.stdin)
    print(f\"  ok={d.get('ok')} count={d.get('count')}\")
    if d.get('items'):
        print(f\"  first item: {d['items'][0]['sku']} - {d['items'][0]['name']}\")
except json.JSONDecodeError:
    print('  ERROR: Endpoint chưa được push (vẫn trả health-check cũ). Chạy clasp push trước.')
"
