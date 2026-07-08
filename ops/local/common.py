# -*- coding: utf-8 -*-
"""common.py — config, paths, telegram, ping. Mọi script ops/local import từ đây."""
import csv
import json
import os
import sys
import urllib.request
import urllib.parse
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOCAL = os.path.join(ROOT, "local")
DATA_LATEST = os.path.join(LOCAL, "data", "latest")
FREEZE = os.path.join(LOCAL, "FREEZE")

def quan():
    with open(os.path.join(ROOT, "QUAN.yaml"), encoding="utf-8") as f:
        return yaml.safe_load(f)

def config_value(key):
    """Đọc CONFIG tab từ snapshot local (guardrail #6: không hardcode secret)."""
    path = os.path.join(DATA_LATEST, "CONFIG.csv")
    with open(path, encoding="utf-8") as f:
        for row in csv.reader(f):
            if row and row[0] == key:
                return row[1]
    raise KeyError(f"CONFIG thiếu key {key} trong {path}")

def tg_send(text, reply_markup=None):
    q = quan()
    token = config_value("TELEGRAM_BOT_TOKEN")
    body = {"chat_id": q["alert"]["telegram_chat_id"], "text": text, "parse_mode": "HTML"}
    if reply_markup: body["reply_markup"] = reply_markup
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json.dumps(body).encode(), {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        print(f"[error] tg_send fail: {e}", file=sys.stderr)
        return {}

def ping(job):
    """Dead-man switch — gọi cuối MỌI job. Lỗi ping không được làm chết job."""
    try:
        q = quan()
        url = f"{q['ops']['worker_url']}/ping?job={job}&shop={q['shop']['id']}&key={config_value('OPS_WORKER_KEY')}"
        with urllib.request.urlopen(url, timeout=10) as response:
            return response.read()
    except Exception as e:
        print(f"[warn] ping fail: {e}", file=sys.stderr)

def get_google_creds():
    # Thử đọc sa.json trước
    sa_path = os.path.join(LOCAL, "secrets", "sa.json")
    if os.path.exists(sa_path):
        import gspread
        return gspread.service_account(filename=sa_path)
    
    # Fallback: đọc ~/.clasprc.json
    rc_path = os.path.expanduser('~/.clasprc.json')
    if os.path.exists(rc_path):
        import json
        from google.oauth2.credentials import Credentials
        import gspread
        with open(rc_path) as f:
            rc = json.load(f)
        tok = (rc.get('tokens', {}) or {}).get('default') or rc.get('token') or {}
        cid = tok.get('client_id') or rc.get('oauth2ClientSettings', {}).get('clientId')
        csec = tok.get('client_secret') or rc.get('oauth2ClientSettings', {}).get('clientSecret')
        rt = tok.get('refresh_token')
        acc_tok = tok.get('access_token')
        
        creds = Credentials(
            token=acc_tok,
            refresh_token=rt,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=cid,
            client_secret=csec
        )
        return gspread.Client(auth=creds)
    raise FileNotFoundError("Không tìm thấy sa.json hoặc ~/.clasprc.json để xác thực Google Sheets API.")

def frozen():
    return os.path.exists(FREEZE)
