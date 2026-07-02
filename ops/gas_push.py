#!/usr/bin/env python3
"""gas_push.py — đẩy gas/*.gs + appsscript.json lên Apps Script, KHÔNG cần clasp.

Ra đời 2026-07-02 vì `clasp push` (v3.3.0) chết ở bước refresh token trên máy này
("Premature close" — bug fetch/undici), còn clasp v2 không đọc được ~/.clasprc.json
định dạng v3. Script này dùng thẳng Apps Script API với credentials sẵn có của clasp.

Dùng:  python3 ops/gas_push.py            # push toàn bộ gas/
Sau đó vẫn phải redeploy: Apps Script editor → Deploy → Manage deployments →
Edit → Version: New version → Deploy (giữ nguyên URL /exec).

Yêu cầu: đã từng `clasp login` (có ~/.clasprc.json) + Apps Script API bật.
"""
import json, os, sys, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAS_DIR = os.path.join(ROOT, 'gas')


def die(msg):
    print('❌ ' + msg); sys.exit(1)


def get_access_token():
    rc_path = os.path.expanduser('~/.clasprc.json')
    if not os.path.exists(rc_path):
        die('Không thấy ~/.clasprc.json — chạy `clasp login` trước.')
    rc = json.load(open(rc_path))
    # clasp v3: {"tokens":{"default":{client_id, client_secret, refresh_token,...}}}
    # clasp v2: {"token":{refresh_token,...},"oauth2ClientSettings":{clientId, clientSecret}}
    tok = (rc.get('tokens', {}) or {}).get('default') or rc.get('token') or {}
    cid = tok.get('client_id') or rc.get('oauth2ClientSettings', {}).get('clientId')
    csec = tok.get('client_secret') or rc.get('oauth2ClientSettings', {}).get('clientSecret')
    rt = tok.get('refresh_token')
    if not (cid and csec and rt):
        die('~/.clasprc.json thiếu client_id/client_secret/refresh_token — `clasp login` lại.')
    data = urllib.parse.urlencode({
        'client_id': cid, 'client_secret': csec,
        'refresh_token': rt, 'grant_type': 'refresh_token',
    }).encode()
    req = urllib.request.Request('https://oauth2.googleapis.com/token', data=data)
    try:
        body = json.load(urllib.request.urlopen(req, timeout=30))
    except urllib.error.HTTPError as e:
        die('Refresh token fail HTTP %s: %s — token có thể bị thu hồi, `clasp login` lại.' % (e.code, e.read()[:200]))
    return body['access_token']


def build_files():
    files = []
    for name in sorted(os.listdir(GAS_DIR)):
        path = os.path.join(GAS_DIR, name)
        if name == 'appsscript.json':
            files.append({'name': 'appsscript', 'type': 'JSON',
                          'source': open(path, encoding='utf-8').read()})
        elif name.endswith('.gs'):
            files.append({'name': name[:-3], 'type': 'SERVER_JS',
                          'source': open(path, encoding='utf-8').read()})
    if not any(f['name'] == 'appsscript' for f in files):
        die('Thiếu gas/appsscript.json — API bắt buộc có manifest.')
    return files


def main():
    clasp_cfg = json.load(open(os.path.join(GAS_DIR, '.clasp.json')))
    script_id = clasp_cfg['scriptId']
    token = get_access_token()
    files = build_files()
    payload = json.dumps({'files': files}).encode()
    req = urllib.request.Request(
        'https://script.googleapis.com/v1/projects/%s/content' % script_id,
        data=payload, method='PUT',
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        res = json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        die('Push fail HTTP %s: %s' % (e.code, e.read()[:400]))
    print('✅ Đã push %d file lên script %s…' % (len(res.get('files', [])), script_id[:12]))
    print('   Nhớ redeploy: Apps Script editor → Deploy → Manage deployments → Edit → New version.')


if __name__ == '__main__':
    main()
