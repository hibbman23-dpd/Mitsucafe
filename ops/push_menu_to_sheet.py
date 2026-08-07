#!/usr/bin/env python3
"""push_menu_to_sheet.py — đồng bộ tab MENU trên Google Sheets từ seed/menu_items.json.

    python3 ops/push_menu_to_sheet.py            # chạy thử, KHÔNG ghi
    python3 ops/push_menu_to_sheet.py --write    # ghi thật (hỏi xác nhận)

Vì sao cần: sheet MENU đã tích tụ nhiều đời menu chồng lên nhau (171 dòng cho
72 mã), số hiệu SKU lệch hẳn so với repo — repo DR050 là "Trà Mitsu" còn sheet
DR050 là "Trà sữa truyền thống". `gas/Orders.gs` tính lại giá theo SKU từ sheet
này, và `gas/Financials.gs` tra giá vốn cũng theo SKU, nên lệch mã = báo cáo
lãi gán nhầm chi phí món này sang món kia.

Sheet cũng KHÔNG có cột cost_nl/cost_packaging, nên giá vốn = 0 với mọi món.
Bản đồng bộ này thêm hai cột đó từ repo.

Promo đang chạy (on_promo/promo_price) được giữ nguyên theo sku — đồng bộ menu
không được làm chiến dịch khuyến mãi đang diễn ra biến mất.
"""
import argparse
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "print-server"))

SEED = os.path.join(ROOT, "seed", "menu_items.json")
AUTH = os.path.join(ROOT, ".claude", ".dispatcher-auth.json")


def load_items():
    with open(SEED, encoding="utf-8") as f:
        items = json.load(f)
    return [i for i in items if i.get("sku")]


def gas_call(payload, timeout=60):
    from gateway import _ssl_ctx
    url = os.getenv("GAS_WEBAPP_URL", "")
    token = os.getenv("REPORT_API_TOKEN", "")
    if (not token or token.startswith("REPLACE_")) and os.path.exists(AUTH):
        with open(AUTH, encoding="utf-8") as f:
            token = json.load(f).get("report_api_token", "")
    if not url:
        sys.exit("Thiếu GAS_WEBAPP_URL. Lấy từ tiến trình prod:\n"
                 "  ps eww $(lsof -nP -iTCP:5001 -sTCP:LISTEN | tail -1 | awk '{print $2}') "
                 "| tr ' ' '\\n' | grep GAS_WEBAPP_URL")
    body = json.dumps({**payload, "token": token}).encode()
    req = urllib.request.Request(url, data=body,
                                 headers={"Content-Type": "application/json"},
                                 method="POST")
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_ctx()) as r:
        return json.loads(r.read().decode())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true",
                    help="ghi thật lên sheet (mặc định chỉ chạy thử)")
    args = ap.parse_args()

    items = load_items()
    have_cost = sum(1 for i in items if i.get("cost_nl") is not None)
    print(f"seed/menu_items.json: {len(items)} món, {have_cost} món có giá vốn")

    res = gas_call({"action": "menu_sync", "items": items, "dry_run": True})
    if not res.get("ok"):
        sys.exit(f"GAS từ chối: {res.get('error')}")

    print(f"sheet MENU hiện tại : {res.get('current_rows')} dòng")
    print(f"sẽ ghi đè thành     : {res.get('would_write')} dòng")
    print(f"promo giữ lại       : {res.get('promo_kept')} món")

    if not args.write:
        print("\n(chạy thử — chưa ghi gì). Ghi thật:  python3 ops/push_menu_to_sheet.py --write")
        return

    print("\n⚠️  GHI ĐÈ toàn bộ tab MENU. Dữ liệu cũ KHÔNG khôi phục được từ script này.")
    print("   Sao lưu trước: mở Sheets → chuột phải tab MENU → Nhân bản.")
    if not sys.stdin.isatty():
        sys.exit("Phải chạy trong Terminal thật để xác nhận.")
    if input('Gõ đúng chữ  GHI DE  để tiếp tục: ').strip() != "GHI DE":
        sys.exit("Đã huỷ, không ghi gì.")

    res = gas_call({"action": "menu_sync", "items": items})
    if not res.get("ok"):
        sys.exit(f"Ghi thất bại: {res.get('error')}")
    print(f"✓ Đã ghi {res.get('written')} món, giữ {res.get('promo_kept')} promo.")


if __name__ == "__main__":
    main()
