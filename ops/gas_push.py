#!/usr/bin/env python3
"""gas_push.py — đẩy gas/*.gs + appsscript.json lên Apps Script, KHÔNG cần clasp.

Ra đời 2026-07-02 vì `clasp push` (v3.3.0) chết ở bước refresh token trên máy này
("Premature close" — bug fetch/undici), còn clasp v2 không đọc được ~/.clasprc.json
định dạng v3. Script này dùng thẳng Apps Script API với credentials sẵn có của clasp.

Dùng:  python3 ops/gas_push.py            # chỉ push code (an toàn, chưa ảnh hưởng prod)
       python3 ops/gas_push.py --deploy   # push + tạo version mới + trỏ deployment
                                          # prod (/exec giữ nguyên URL) — LÀ DEPLOY THẬT,
                                          # tương đương editor → Manage deployments → New version.

Yêu cầu: đã từng `clasp login` (có ~/.clasprc.json) + Apps Script API bật.
"""
import json, os, random, sys, urllib.request, urllib.parse, urllib.error

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


def api(script_id, token, path, method='GET', body=None):
    req = urllib.request.Request(
        'https://script.googleapis.com/v1/projects/%s%s' % (script_id, path),
        data=json.dumps(body).encode() if body is not None else None, method=method,
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        return json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        die('%s %s fail HTTP %s: %s' % (method, path, e.code, e.read()[:400]))


# Deployment prod /exec mà web (order.js) + KDS + poller đang gọi — chỉ update deployment
# này, không đụng @HEAD hay deployment cũ.
PROD_DEPLOYMENT_URL_KEY = 'AKfycbynDqbg'


def http_get(url):
    """GET không die() — smoke test và rollback cần tự đọc status/body để dựng
    message riêng thay vì thoát ngay như die() làm."""
    try:
        res = urllib.request.urlopen(url, timeout=30)
        return res.status, res.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')[:400]
    except urllib.error.URLError as e:
        return 0, str(e.reason)


def smoke_test(webapp_url):
    """Gọi ?action=ping kèm cache-buster, đòi HTTP 200 + "ok":true trong body.
    Trả None nếu xanh, chuỗi mô tả lỗi nếu đỏ."""
    cb = random.randint(0, 10**9)
    sep = '&' if '?' in webapp_url else '?'
    status, body = http_get('%s%saction=ping&_cb=%d' % (webapp_url, sep, cb))
    if status != 200 or '"ok":true' not in body:
        return 'smoke fail: HTTP %s - %s' % (status, body[:120])
    return None


def retarget(script_id, token, deployment_id, version_number):
    """PUT retarget sang version_number — trả (ok, status, body) thay vì die(), vì lúc
    lùi (rollback) tự nó hỏng thì cần status/body riêng cho message ROLLBACK THẤT BẠI."""
    req = urllib.request.Request(
        'https://script.googleapis.com/v1/projects/%s/deployments/%s' % (script_id, deployment_id),
        data=json.dumps({'deploymentConfig': {
            'scriptId': script_id, 'versionNumber': version_number,
            'manifestFileName': 'appsscript',
            'description': 'v%s via gas_push.py' % version_number,
        }}).encode(), method='PUT',
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, timeout=60)
        return True, 200, ''
    except urllib.error.HTTPError as e:
        return False, e.code, e.read().decode('utf-8', 'replace')[:400]


def deploy(script_id, token):
    deps = api(script_id, token, '/deployments')
    target = None
    webapp_url = None
    for d in deps.get('deployments', []):
        for e in d.get('entryPoints', []):
            if e.get('entryPointType') == 'WEB_APP' and PROD_DEPLOYMENT_URL_KEY in e['webApp']['url']:
                target = d
                webapp_url = e['webApp']['url']
    if not target:
        die('Không tìm thấy deployment prod (URL chứa %s) — redeploy tay trong editor.' % PROD_DEPLOYMENT_URL_KEY)

    old_ver = target['deploymentConfig'].get('versionNumber')
    if old_ver is None:
        # Fail-closed: CHƯA tạo version mới, CHƯA retarget gì — hủy ở đây miễn phí,
        # tốt hơn retarget mù rồi kẹt không có đường lùi nếu smoke đỏ.
        die('DEPLOY HỦY: deployment prod thiếu versionNumber hiện tại — CHƯA đụng gì tới '
            'prod. Kiểm tra deployment trong editor rồi thử lại.')

    ver = api(script_id, token, '/versions', 'POST',
              {'description': 'gas_push.py auto-version'})
    new_ver = ver['versionNumber']

    api(script_id, token, '/deployments/' + target['deploymentId'], 'PUT', {
        'deploymentConfig': {
            'scriptId': script_id,
            'versionNumber': new_ver,
            'manifestFileName': 'appsscript',
            'description': 'v%s via gas_push.py' % new_ver,
        }})
    print('✅ Deployment prod: v%s → v%s (URL /exec giữ nguyên).' % (old_ver, new_ver))

    # Retarget đã xảy ra → prod ĐANG chạy version mới. Đỏ = phải lùi ngay.
    smoke_err = smoke_test(webapp_url)
    if not smoke_err:
        print('   🎉 smoke OK (?action=ping).')
        return

    print('❌ %s' % smoke_err)
    print('   ↩︎  đang lùi về v%s…' % old_ver)
    ok, status, body = retarget(script_id, token, target['deploymentId'], old_ver)
    if not ok:
        die('ROLLBACK THẤT BẠI: %s — retarget về v%s không xong (HTTP %s %s), prod ĐANG '
            'HỎNG ở v%s. Vào editor lùi tay NGAY.' % (smoke_err, old_ver, status, body, new_ver))

    after_err = smoke_test(webapp_url)
    if after_err:
        die('ROLLBACK xong nhưng v%s vẫn đỏ: %s — prod HỎNG, cần người.' % (old_ver, after_err))

    print('   ✓ ROLLBACK thành công về v%s. Prod đã sống. Version hỏng: v%s.' % (old_ver, new_ver))
    die('ROLLBACK: deploy v%s smoke đỏ (%s), đã lùi về v%s. Prod ổn, fix cần người xem.'
        % (new_ver, smoke_err, old_ver))


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
    if '--deploy' in sys.argv:
        deploy(script_id, token)
    else:
        print('   Chưa deploy — chạy `python3 ops/gas_push.py --deploy` hoặc redeploy trong editor.')


if __name__ == '__main__':
    main()
