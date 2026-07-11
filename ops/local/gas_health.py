# -*- coding: utf-8 -*-
"""gas_health.py — canh GAS /exec sống hay chết, báo Telegram khi đổi trạng thái.

Vì sao tồn tại: GAS web app đã chết 403 anonymous LẶP LẠI (2026-07-02 và ~2026-07-10).
Nguyên nhân gốc: script gắn GCP project chuẩn (cho GBP/AnalyticsData) mà OAuth consent
screen ở chế độ "Testing" → Google tự thu hồi ủy quyền của owner sau 7 ngày → mọi
request ẩn danh (KDS, đặt hàng online, poller in tem, signage) ăn trang 403 HTML.
Chết kiểu này IM LẶNG — KDS chỉ treo "Đang tải đơn hàng...". Script này phát hiện
trong ≤15 phút thay vì đợi nhân viên phát hiện ở quầy.

Cách fix khi báo đỏ (việc tay của chủ, tài khoản mitsucafe83):
  1. Mở script.google.com → project Kissaten → Run 1 hàm bất kỳ → cấp lại quyền.
  2. Hết tái phát: console.cloud.google.com → APIs & Services → OAuth consent screen
     → Publishing status: "Testing" → PUBLISH APP ("In production").
  3. Verify: curl '<GAS_URL>?action=ping' → phải trả JSON {"ok":true,...}.

Chạy: launchd mỗi 15 phút (ops/local/com.mitsu.gas-health.plist).
Test tay: python3 ops/local/gas_health.py --dry-run
Alert khi: sống→chết, chết→sống; nhắc lại mỗi 6h khi vẫn chết.
State: local/data/gas_health_state.json
"""
import json
import os
import sys
import time
import urllib.request

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import LOCAL, tg_send, ping, ssl_ctx

# URL /exec prod — không phải secret (nằm sẵn trong web/kds.html public).
GAS_URL = os.getenv(
    "GAS_WEBAPP_URL",
    "https://script.google.com/macros/s/AKfycbynDqbg-Xn9hEbUyhsZl_MF0dGsCqLpfTgJ-Us3QHiGqkrKV3hwZD__-fKW2kFJZzC7/exec",
)
STATE_PATH = os.path.join(LOCAL, "data", "gas_health_state.json")
REALERT_SECONDS = 6 * 3600  # vẫn chết → nhắc lại mỗi 6h

FIX_STEPS = (
    "🛠 Fix (tài khoản mitsucafe83):\n"
    "1. script.google.com → mở project → Run 1 hàm → cấp lại quyền\n"
    "2. Hết tái phát: Cloud Console → OAuth consent screen → PUBLISH APP (In production)\n"
    "3. Verify: curl '?action=ping' phải trả JSON"
)


def check_gas():
    """Trả (healthy: bool, detail: str)."""
    url = GAS_URL + "?action=ping"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "mitsu-gas-health/1.0"})
        with urllib.request.urlopen(req, timeout=45, context=ssl_ctx()) as r:
            body = r.read().decode("utf-8", "replace")
            code = r.status
    except urllib.error.HTTPError as e:
        return False, "HTTP %s (Google chặn — thường là grant owner hết hạn)" % e.code
    except Exception as e:
        return False, "không kết nối được: %s" % e
    try:
        data = json.loads(body)
    except ValueError:
        return False, "HTTP %s nhưng trả HTML thay vì JSON (trang chặn của Google)" % code
    if not data.get("ok"):
        return False, "JSON ok=false: %s" % data.get("error", "?")
    return True, "ok"


def load_state():
    try:
        with open(STATE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"status": "unknown", "since": 0, "last_alert": 0}


def save_state(state):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    with open(STATE_PATH, "w", encoding="utf-8") as f:
        json.dump(state, f)


def main():
    dry = "--dry-run" in sys.argv
    send = (lambda t: print("[dry-run] would send:\n" + t)) if dry else tg_send

    healthy, detail = check_gas()
    state = load_state()
    now = int(time.time())
    prev = state.get("status")

    if healthy:
        if prev == "down":
            mins = (now - state.get("since", now)) // 60
            send("✅ <b>[GAS Health]</b> API sống lại (đã chết ~%d phút). KDS/đặt hàng online hoạt động bình thường." % mins)
        state = {"status": "up", "since": now if prev != "up" else state.get("since", now), "last_alert": 0}
    else:
        first_down = prev != "down"
        if first_down:
            state = {"status": "down", "since": now, "last_alert": now}
            send(
                "🔴 <b>[GAS Health]</b> API CHẾT — KDS treo, đặt hàng online + in tem đứt.\n"
                "Lỗi: %s\n\n%s" % (detail, FIX_STEPS)
            )
        elif now - state.get("last_alert", 0) >= REALERT_SECONDS:
            state["last_alert"] = now
            hours = (now - state.get("since", now)) // 3600
            send("🔴 <b>[GAS Health]</b> API vẫn chết (%dh). Lỗi: %s\n\n%s" % (hours, detail, FIX_STEPS))

    save_state(state)
    if not dry:
        ping("gas_health")
    print("[gas_health] status=%s detail=%s" % ("up" if healthy else "down", detail))


if __name__ == "__main__":
    main()
