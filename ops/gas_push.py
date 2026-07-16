#!/usr/bin/env python3
"""gas_push.py — đẩy gas/*.gs + appsscript.json lên Apps Script, KHÔNG cần clasp.

Ra đời 2026-07-02 vì `clasp push` (v3.3.0) chết ở bước refresh token trên máy này
("Premature close" — bug fetch/undici), còn clasp v2 không đọc được ~/.clasprc.json
định dạng v3. Script này dùng thẳng Apps Script API với credentials sẵn có của clasp.

Dùng:  python3 ops/gas_push.py            # chỉ push code — GHI ĐÈ HEAD NGAY LẬP TỨC.
                                          # HEAD là script SỐNG: mọi time-driven trigger
                                          # (18 cái — cronDailyFinancials, refreshZaloToken,
                                          # backupSpreadsheet, pullGa4Recent, …) chạy theo
                                          # HEAD, KHÔNG theo deployment version. Chỉ có
                                          # /exec (URL công khai, dùng bởi web/KDS/poller)
                                          # là CHƯA đổi cho tới khi chạy --deploy. KHÔNG
                                          # "an toàn tuyệt đối" — chỉ /exec là chưa động.
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


def get_report_token():
    """Đọc token dispatcher, giống getReportToken() trong deploy_gas.js — cho phép
    smoke_test() chạm CONFIG/Sheets thật qua ?action=orders thay vì chỉ dừng ở
    ?action=ping (hardcode, xem gas/Code.gs GET_ROUTES['ping']). Không throw nếu
    thiếu file — auth smoke là optional, caller tự quyết định báo bỏ qua hay không."""
    auth_path = os.path.join(ROOT, '.claude', '.dispatcher-auth.json')
    try:
        return json.load(open(auth_path, encoding='utf-8')).get('report_api_token') or ''
    except (OSError, ValueError, KeyError):
        return ''


def smoke_test(webapp_url, report_token=''):
    """Gọi ?action=ping kèm cache-buster, đòi HTTP 200 + "ok":true trong body.
    Nếu có report_token, gọi thêm ?action=orders — ping trả hằng số hardcode nên
    tự nó không chứng minh CONFIG/Sheets vẫn sống, orders thì có.
    Trả None nếu xanh, chuỗi mô tả lỗi nếu đỏ."""
    cb = random.randint(0, 10**9)
    sep = '&' if '?' in webapp_url else '?'
    status, body = http_get('%s%saction=ping&_cb=%d' % (webapp_url, sep, cb))
    if status != 200 or '"ok":true' not in body:
        return 'public smoke fail: HTTP %s - %s' % (status, body[:120])
    if report_token:
        status, body = http_get('%s%saction=orders&token=%s&_cb=%d' % (webapp_url, sep, report_token, cb))
        if status != 200 or '"ok":true' not in body:
            return 'auth smoke fail (token connectivity check): HTTP %s - %s' % (status, body[:120])
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


def get_version_content(script_id, token, version_number):
    """GET nội dung 1 version cũ — dùng để khôi phục HEAD lúc rollback (HEAD không tự
    lùi theo deployment retarget, phải PUT /content lại tay). Không die(): rollback
    cần tự dựng message riêng khi hỏng. Trả (ok, files_hoặc_mô_tả_lỗi)."""
    req = urllib.request.Request(
        'https://script.googleapis.com/v1/projects/%s/content?versionNumber=%s' % (script_id, version_number),
        headers={'Authorization': 'Bearer ' + token})
    try:
        res = json.load(urllib.request.urlopen(req, timeout=60))
        files = res.get('files') or []
        # HTTP 200 mà files rỗng thì KHÔNG khôi phục được. PUT bừa lên HEAD = xoá trắng
        # project, rồi vẫn in "✓ đã khôi phục" — tuyên bố thành công không kiểm chứng,
        # đúng cái tội cả file này sinh ra để diệt. Coi như GET hỏng.
        if not files:
            return False, 'HTTP 200 nhưng files rỗng/thiếu — KHÔNG PUT gì lên HEAD (PUT rỗng sẽ xoá trắng project)'
        return True, files
    except urllib.error.HTTPError as e:
        return False, 'HTTP %s %s' % (e.code, e.read().decode('utf-8', 'replace')[:400])


def put_content(script_id, token, files):
    """PUT nội dung — dùng lại lúc khôi phục HEAD về version cũ khi rollback.
    Không die(): rollback cần tự dựng message riêng khi hỏng."""
    req = urllib.request.Request(
        'https://script.googleapis.com/v1/projects/%s/content' % script_id,
        data=json.dumps({'files': files}).encode(), method='PUT',
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, timeout=60)
        return True, ''
    except urllib.error.HTTPError as e:
        return False, 'HTTP %s %s' % (e.code, e.read().decode('utf-8', 'replace')[:400])


def deploy(script_id, token, report_token=''):
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
        # Fail-closed: CHƯA tạo version mới, CHƯA retarget /exec — hủy ở đây miễn phí,
        # tốt hơn retarget mù rồi kẹt không có đường lùi nếu smoke đỏ. NHƯNG main() đã
        # PUT /content (ghi đè HEAD) TRƯỚC KHI gọi deploy() — không được nói chung
        # chung "chưa đụng gì tới prod": /exec thật sự chưa đổi, HEAD thì ĐÃ đổi rồi,
        # và không có version cũ nào ở đây để khôi phục lại HEAD tự động.
        die('DEPLOY HỦY: deployment prod thiếu versionNumber hiện tại — /exec CHƯA bị '
            'retarget (an toàn, vẫn phục vụ bản cũ), nhưng HEAD ĐÃ bị ghi đè bởi bước push '
            'content ở trên và KHÔNG có version cũ nào để khôi phục HEAD tự động — trigger '
            'cron sẽ chạy code mới (chưa qua smoke). Vào editor kiểm tra HEAD + deployment '
            'rồi xử lý tay.')

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

    # Retarget đã xảy ra → /exec ĐANG chạy version mới. Đỏ = phải lùi ngay.
    smoke_err = smoke_test(webapp_url, report_token)
    if not smoke_err:
        print('   🎉 smoke OK (?action=ping%s).' % (' + ?action=orders' if report_token else ''))
        return

    # Retarget deployment CHỈ lùi /exec — nó KHÔNG đụng tới HEAD, mà HEAD mới là thứ
    # trigger cron (cronDailyFinancials, refreshZaloToken, backupSpreadsheet,
    # pullGa4Recent, …) chạy theo. Rollback thật sự cần khôi phục CẢ HAI.
    #
    # Thứ tự: khôi phục HEAD TRƯỚC, retarget /exec SAU. Lý do — khôi phục HEAD (GET nội
    # dung version cũ rồi PUT lại) không phụ thuộc gì vào deployment nên làm trước
    # không mất gì; và nếu bước khôi phục HEAD thất bại, vẫn còn cơ hội cứu /exec bằng
    # retarget ở dưới — không để 1 thất bại chặn luôn nỗ lực cứu cái còn lại. Ngược lại
    # nếu retarget /exec làm trước và chính nó thất bại, code sẽ die() ngay (nhánh
    # ROLLBACK THẤT BẠI) và không bao giờ chạm bước khôi phục HEAD. Làm HEAD trước cũng
    # giúp mọi message dưới đây nói chính xác HEAD đã cứu được hay chưa.
    print('❌ %s' % smoke_err)
    print('   ↩︎  đang khôi phục v%s…' % old_ver)

    head_restored = False
    head_err = None
    ok_get, content_or_err = get_version_content(script_id, token, old_ver)
    if not ok_get:
        head_err = 'GET content?versionNumber=%s fail: %s' % (old_ver, content_or_err)
    else:
        ok_put, put_err = put_content(script_id, token, content_or_err)
        if not ok_put:
            head_err = 'PUT content (khôi phục v%s) fail: %s' % (old_ver, put_err)
        else:
            head_restored = True
            print('   ✓ HEAD đã khôi phục về nội dung v%s' % old_ver)

    if head_err:
        print('   ⚠️  KHÔNG khôi phục được HEAD: %s — trigger cron (cronDailyFinancials, '
              'refreshZaloToken, backupSpreadsheet, pullGa4Recent, …) vẫn chạy code MỚI '
              '(hỏng) dù /exec có lùi được ở bước dưới hay không. Vào editor sửa tay HEAD '
              'NGAY.' % head_err)

    ok, status, body = retarget(script_id, token, target['deploymentId'], old_ver)
    if not ok:
        die('ROLLBACK THẤT BẠI: %s — retarget /exec về v%s không xong (HTTP %s %s), /exec '
            'ĐANG HỎNG ở v%s%s. Vào editor lùi tay NGAY.' % (
                smoke_err, old_ver, status, body, new_ver,
                ' (HEAD đã khôi phục nhưng /exec thì chưa)' if head_restored
                else ' và HEAD CŨNG chưa khôi phục được'))

    after_err = smoke_test(webapp_url, report_token)
    if after_err:
        die('ROLLBACK xong nhưng v%s vẫn đỏ: %s — /exec đã lùi nhưng bản thân v%s tự nó '
            'hỏng, cần người.%s' % (old_ver, after_err, old_ver,
                '' if head_restored else ' HEAD cũng chưa khôi phục được — xem log phía trên.'))

    if head_restored:
        print('   ✓ ROLLBACK thành công: /exec VÀ HEAD đều đã về v%s. Trigger cron an '
              'toàn. Version hỏng: v%s.' % (old_ver, new_ver))
        die('ROLLBACK: deploy v%s smoke đỏ (%s), đã khôi phục CẢ /exec và HEAD về v%s — '
            'trigger cron cũng an toàn. Fix cần người xem.' % (new_ver, smoke_err, old_ver))

    print('   ⚠️  ROLLBACK MỘT PHẦN: /exec đã về v%s (an toàn cho khách) nhưng HEAD VẪN '
          'LÀ v%s (hỏng) — trigger cron sẽ CHẠY CODE HỎNG ở lần kế tiếp. Vào editor khôi '
          'phục HEAD tay NGAY: %s' % (old_ver, new_ver, head_err))
    die('ROLLBACK MỘT PHẦN: deploy v%s smoke đỏ (%s). /exec đã lùi về v%s nhưng HEAD '
        'KHÔNG khôi phục được (%s) — trigger cron vẫn chạy code hỏng. Vào editor sửa tay '
        'HEAD NGAY.' % (new_ver, smoke_err, old_ver, head_err))


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
    print('✅ Đã push %d file lên script %s… (HEAD đã đổi — trigger cron chạy code mới từ đây)'
          % (len(res.get('files', [])), script_id[:12]))
    if '--deploy' in sys.argv:
        report_token = get_report_token()
        if report_token:
            print('   Auth smoke bật: sẽ gọi thêm ?action=orders (chạm CONFIG/Sheets thật).')
        else:
            print('   ⚠️  Không thấy .claude/.dispatcher-auth.json — bỏ qua auth smoke, chỉ '
                  'test ?action=ping (hardcode, không chạm CONFIG/Sheets thật).')
        deploy(script_id, token, report_token)
    else:
        print('   Chưa deploy — chạy `python3 ops/gas_push.py --deploy` hoặc redeploy trong editor.')


if __name__ == '__main__':
    main()
