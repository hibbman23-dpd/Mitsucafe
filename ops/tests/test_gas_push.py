#!/usr/bin/env python3
"""test_gas_push.py — unit test cho deploy() trong ops/gas_push.py (smoke-test + rollback).

Đối xứng với ops/tests/deploy_rollback.test.js (bản Node cho deploy_gas.js) — cùng
kịch bản test, khác cú pháp vì đây là Python. stdlib only: unittest + unittest.mock.

Chạy: python3 -m unittest ops/tests/test_gas_push.py -v
"""
import importlib.util
import io
import json
import os
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

# ops/ không phải Python package (không có __init__.py) và gas_push.py có logic
# thật trong if __name__ == '__main__' nên import thẳng bằng importlib theo đường
# dẫn file — an toàn (không kích hoạt main(), không cần sys.path hack toàn cục).
_GAS_PUSH_PATH = os.path.join(os.path.dirname(__file__), '..', 'gas_push.py')
_spec = importlib.util.spec_from_file_location('gas_push', _GAS_PUSH_PATH)
gas_push = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gas_push)

SCRIPT_ID = 'SCRIPT_X'
DEPLOYMENT_ID = 'AKfycbynDqbg-Xn9hEbUyhsZl_MF0dGsCqLpfTgJ-Us3QHiGqkrKV3hwZD'
WEBAPP_URL = 'https://script.google.com/macros/s/%s/exec' % DEPLOYMENT_ID
TOKEN = 'TOKEN_ABC'


class FakeResponse:
    """Giả http.client.HTTPResponse — chỉ cần .status + .read() vì api()/http_get()
    trong gas_push.py không dùng context manager."""
    def __init__(self, status, body):
        self.status = status
        self._body = body.encode() if isinstance(body, str) else body

    def read(self):
        return self._body


def deployments_payload(old_ver):
    """Payload GET /deployments — 1 deployment khớp PROD_DEPLOYMENT_URL_KEY."""
    return {
        'deployments': [{
            'deploymentId': DEPLOYMENT_ID,
            'deploymentConfig': {'versionNumber': old_ver},
            'entryPoints': [{
                'entryPointType': 'WEB_APP',
                'webApp': {'url': WEBAPP_URL},
            }],
        }],
    }


def make_urlopen_stub(old_ver, new_ver=42, smoke_sequence=None, rollback_retarget_fail=None,
                       old_files=None, content_restore_get_fails=False):
    """
    Dựng side_effect cho urllib.request.urlopen dùng chung cho mọi test case.

    smoke_sequence: list[(status, body)] — trả lần lượt mỗi lần gọi ?action=ping.
                     Hết danh sách thì mặc định xanh.
    rollback_retarget_fail: None hoặc (status, body) — PUT retarget LẦN 2 (lùi về
                             old_ver) trả lỗi HTTP thay vì 200.
    old_files: nội dung trả về bởi GET content?versionNumber=old_ver (khôi phục HEAD
               lúc rollback). Mặc định 1 file giả lập.
    content_restore_get_fails: True → GET content?versionNumber=old_ver trả lỗi HTTP.
    Trả (stub_fn, calls) — calls ghi lại (method, url, body_json) theo thứ tự để assert,
    body_json là dict đã parse (None nếu request không có data, vd GET).
    """
    smoke_sequence = smoke_sequence or []
    old_files = old_files if old_files is not None else [
        {'name': 'Code', 'type': 'SERVER_JS', 'source': '// noi dung v%s' % old_ver}]
    state = {'put_n': 0, 'smoke_n': 0}
    calls = []

    def _urlopen(req, timeout=None):
        if isinstance(req, str):
            url, method, body_json = req, 'GET', None
        else:
            url = req.full_url
            method = req.get_method()
            body_json = json.loads(req.data) if req.data else None
        calls.append((method, url, body_json))

        # Check TRƯỚC nhánh '/content' PUT chung vì URL này cũng chứa '/content'.
        if method == 'GET' and '/content?versionNumber=' in url:
            if content_restore_get_fails:
                raise urllib.error.HTTPError(url, 500, 'err', None,
                                              io.BytesIO(b'boom doc noi dung version cu'))
            return FakeResponse(200, json.dumps({'files': old_files}))
        if method == 'PUT' and url.endswith('/content'):
            return FakeResponse(200, '{}')
        if method == 'GET' and url.endswith('/deployments'):
            return FakeResponse(200, json.dumps(deployments_payload(old_ver)))
        if method == 'POST' and url.endswith('/versions'):
            return FakeResponse(200, json.dumps({'versionNumber': new_ver}))
        if method == 'PUT' and '/deployments/' in url:
            state['put_n'] += 1
            if state['put_n'] == 2 and rollback_retarget_fail is not None:
                status, body = rollback_retarget_fail
                raise urllib.error.HTTPError(url, status, 'err', None, io.BytesIO(body.encode()))
            return FakeResponse(200, '{}')
        if 'action=ping' in url:
            idx = state['smoke_n']
            state['smoke_n'] += 1
            status, body = smoke_sequence[idx] if idx < len(smoke_sequence) else (200, '{"ok":true}')
            if status != 200:
                raise urllib.error.HTTPError(url, status, 'err', None, io.BytesIO(body.encode()))
            return FakeResponse(status, body)
        raise AssertionError('urlopen ngoài dự kiến: %s %s' % (method, url))

    return _urlopen, calls


def content_put_calls(calls):
    """PUT /content (không phải /content?versionNumber=...) — bước 1 (push ban đầu,
    luôn có) + bước khôi phục HEAD lúc rollback (nếu có)."""
    return [c for c in calls if c[0] == 'PUT' and c[1].endswith('/content')]


def put_retarget_calls(calls):
    return [c for c in calls if c[0] == 'PUT' and '/deployments/' in c[1]]


class DeploySmokeRollbackTest(unittest.TestCase):

    def test_old_ver_missing_aborts_before_any_retarget(self):
        """old_ver None → abort NGAY, zero retarget — đây là cái free-abort quan trọng nhất."""
        stub, calls = make_urlopen_stub(old_ver=None)
        with patch('urllib.request.urlopen', side_effect=stub):
            with self.assertRaises(SystemExit):
                gas_push.deploy(SCRIPT_ID, TOKEN)
        self.assertEqual(put_retarget_calls(calls), [], 'không được retarget khi chưa có old_ver')
        # không được có bất kỳ POST /versions nào — tức là script không hề động tới
        # việc tạo version mới, không chỉ riêng retarget.
        post_version_calls = [c for c in calls if c[0] == 'POST' and c[1].endswith('/versions')]
        self.assertEqual(post_version_calls, [], 'không được tạo version mới khi chưa có old_ver')

    def test_old_ver_missing_error_message_has_no_rollback_word(self):
        stub, _ = make_urlopen_stub(old_ver=None)
        with patch('urllib.request.urlopen', side_effect=stub):
            with patch('builtins.print') as mock_print:
                with self.assertRaises(SystemExit):
                    gas_push.deploy(SCRIPT_ID, TOKEN)
                printed = ' '.join(str(c.args[0]) for c in mock_print.call_args_list)
                self.assertNotIn('ROLLBACK', printed, 'chưa deploy gì thì không được nói ROLLBACK')

    def test_smoke_green_exactly_one_retarget_no_rollback_REGRESSION_GUARD(self):
        """LƯU Ý: đây là regression guard, KHÔNG phải bằng chứng RED→GREEN — test này đã
        PASS trước cả khi B1 được vá (đường happy-path smoke-xanh không đổi bởi bản vá
        rollback-khôi-phục-HEAD). Giữ lại để canh không ai lỡ tay phá path xanh."""
        stub, calls = make_urlopen_stub(old_ver=41, new_ver=42, smoke_sequence=[(200, '{"ok":true}')])
        with patch('urllib.request.urlopen', side_effect=stub):
            gas_push.deploy(SCRIPT_ID, TOKEN)  # không throw
        retargets = put_retarget_calls(calls)
        self.assertEqual(len(retargets), 1, 'smoke xanh chỉ retarget 1 lần sang version mới')
        self.assertEqual(retargets[0][2]['deploymentConfig']['versionNumber'], 42,
                          'retarget phải trỏ đúng version mới, không phải version cũ hay rác')

    def test_smoke_red_two_retargets_and_rollback_word(self):
        stub, calls = make_urlopen_stub(
            old_ver=41, new_ver=42,
            smoke_sequence=[(500, 'boom'), (200, '{"ok":true}')])  # đỏ lần 1, xanh sau khi lùi
        with patch('urllib.request.urlopen', side_effect=stub):
            with patch('builtins.print') as mock_print:
                with self.assertRaises(SystemExit):
                    gas_push.deploy(SCRIPT_ID, TOKEN)
                printed = ' '.join(str(c.args[0]) for c in mock_print.call_args_list)
                self.assertIn('ROLLBACK', printed)
        retargets = put_retarget_calls(calls)
        self.assertEqual(len(retargets), 2, 'smoke đỏ phải retarget 2 lần: sang mới rồi lùi về cũ')
        self.assertEqual(retargets[0][2]['deploymentConfig']['versionNumber'], 42, 'lần 1 sang version mới')
        self.assertEqual(retargets[1][2]['deploymentConfig']['versionNumber'], 41, 'lần 2 LÙI VỀ version cũ')

    def test_rollback_retarget_fails_message_has_status_and_body(self):
        stub, calls = make_urlopen_stub(
            old_ver=41, new_ver=42,
            smoke_sequence=[(500, 'boom')],
            rollback_retarget_fail=(403, 'permission denied'))
        with patch('urllib.request.urlopen', side_effect=stub):
            with patch('builtins.print') as mock_print:
                with self.assertRaises(SystemExit):
                    gas_push.deploy(SCRIPT_ID, TOKEN)
                printed = ' '.join(str(c.args[0]) for c in mock_print.call_args_list)
                self.assertIn('ROLLBACK THẤT BẠI', printed)
                self.assertIn('403', printed)
                self.assertIn('permission denied', printed)

    def test_rollback_succeeds_but_old_version_still_red(self):
        """Lùi retarget OK nhưng bản thân old_ver vẫn đỏ khi re-smoke — phải nói rõ
        đây là ca khác với 'ROLLBACK THẤT BẠI' (retarget thành công, chỉ là code cũ hỏng)."""
        stub, calls = make_urlopen_stub(
            old_ver=41, new_ver=42,
            smoke_sequence=[(500, 'boom mới'), (500, 'boom cũ')])  # đỏ cả 2 lần
        with patch('urllib.request.urlopen', side_effect=stub):
            with patch('builtins.print') as mock_print:
                with self.assertRaises(SystemExit):
                    gas_push.deploy(SCRIPT_ID, TOKEN)
                printed = ' '.join(str(c.args[0]) for c in mock_print.call_args_list)
                self.assertIn('vẫn đỏ', printed)
                self.assertNotIn('THẤT BẠI', printed, 'retarget lùi tự nó thành công — khác ca ROLLBACK THẤT BẠI')
        retargets = put_retarget_calls(calls)
        self.assertEqual(len(retargets), 2, 'vẫn phải retarget đủ 2 lần dù old_ver re-smoke đỏ')

    def test_old_ver_missing_message_does_not_claim_prod_untouched(self):
        """Bug cũ: message nói 'CHƯA đụng gì tới prod' — SAI, vì main() đã PUT /content
        (ghi đè HEAD) TRƯỚC KHI gọi deploy() rồi. deploy() tự nó không đụng /content,
        nhưng nói chung chung 'prod' (bao gồm cả HEAD) là chưa bị đụng thì sai."""
        stub, _ = make_urlopen_stub(old_ver=None)
        with patch('urllib.request.urlopen', side_effect=stub):
            with patch('builtins.print') as mock_print:
                with self.assertRaises(SystemExit):
                    gas_push.deploy(SCRIPT_ID, TOKEN)
                printed = ' '.join(str(c.args[0]) for c in mock_print.call_args_list)
                self.assertNotIn('CHƯA đụng gì tới prod', printed,
                                  'không được claim "CHƯA đụng gì tới prod" — HEAD đã bị main() ghi đè trước khi deploy() chạy')

    def test_rollback_fetches_and_puts_old_version_content(self):
        """B1: rollback phải khôi phục CẢ HEAD (không chỉ retarget /exec). Assert đúng
        payload PUT khôi phục khớp files lấy từ GET, không chỉ đếm số lần gọi."""
        old_files = [{'name': 'Code', 'type': 'SERVER_JS', 'source': '// noi dung THAT cua v41'}]
        stub, calls = make_urlopen_stub(
            old_ver=41, new_ver=42,
            smoke_sequence=[(500, 'boom'), (200, '{"ok":true}')],
            old_files=old_files)
        with patch('urllib.request.urlopen', side_effect=stub):
            with self.assertRaises(SystemExit):
                gas_push.deploy(SCRIPT_ID, TOKEN)

        content_gets = [c for c in calls if c[0] == 'GET' and '/content?versionNumber=41' in c[1]]
        self.assertEqual(len(content_gets), 1, 'phải GET content?versionNumber=41 để lấy nội dung version cũ')

        restores = content_put_calls(calls)
        self.assertEqual(len(restores), 1, 'deploy() tự nó chỉ PUT /content 1 lần: khôi phục HEAD lúc rollback')
        self.assertEqual(restores[0][2]['files'], old_files,
                          'PUT khôi phục phải gửi ĐÚNG files của version cũ lấy từ GET, không phải rác')

    def test_rollback_content_fetch_fails_is_loud_and_specific(self):
        """Fetch nội dung version cũ lỗi → không thể khôi phục HEAD. Phải nói to, rõ,
        không được im lặng bỏ qua — và vẫn phải cố retarget /exec (không để 1 thất bại
        chặn nỗ lực cứu cái còn lại)."""
        stub, calls = make_urlopen_stub(
            old_ver=41, new_ver=42,
            smoke_sequence=[(500, 'boom'), (200, '{"ok":true}')],
            content_restore_get_fails=True)
        with patch('urllib.request.urlopen', side_effect=stub):
            with patch('builtins.print') as mock_print:
                with self.assertRaises(SystemExit):
                    gas_push.deploy(SCRIPT_ID, TOKEN)
                printed = ' '.join(str(c.args[0]) for c in mock_print.call_args_list)
                self.assertIn('HEAD', printed, 'phải nêu rõ HEAD không khôi phục được')
                self.assertIn('KHÔNG', printed, 'phải nói rõ đây là thất bại, không im lặng bỏ qua')
                self.assertIn('500', printed, 'phải kèm chi tiết lỗi GET content để debug')

        # Vẫn phải cố retarget /exec dù HEAD không cứu được.
        retargets = put_retarget_calls(calls)
        self.assertEqual(len(retargets), 2, 'vẫn phải retarget /exec (sang mới rồi lùi về cũ) dù HEAD không cứu được')

        # Không có gì để PUT khi GET đã lỗi.
        self.assertEqual(content_put_calls(calls), [], 'GET nội dung version cũ lỗi thì không được PUT khôi phục')


class ReportTokenAuthSmokeTest(unittest.TestCase):
    """Parity với getReportToken() trong deploy_gas.js: đọc .claude/.dispatcher-auth.json,
    nếu có token thì smoke thêm ?action=orders (chạm CONFIG/Sheets thật, khác ?action=ping
    vốn trả hằng số hardcode — xem gas/Code.gs GET_ROUTES['ping'])."""

    def test_get_report_token_missing_file_returns_empty_string(self):
        # Worktree test này chạy trong không có .claude/.dispatcher-auth.json thật —
        # get_report_token() phải trả '' thay vì throw.
        missing_root = '/tmp/khong-ton-tai-vi-du-nay-chac-chan-khong-co-that'
        with patch.object(gas_push, 'ROOT', missing_root):
            self.assertEqual(gas_push.get_report_token(), '')

    def test_smoke_test_calls_action_orders_when_token_present(self):
        calls = []

        def fake_http_get(url):
            calls.append(url)
            if 'action=ping' in url:
                return 200, '{"ok":true}'
            if 'action=orders' in url:
                return 200, '{"ok":true,"orders":[]}'
            raise AssertionError('unexpected url: ' + url)

        with patch.object(gas_push, 'http_get', side_effect=fake_http_get):
            err = gas_push.smoke_test(WEBAPP_URL, report_token='TOK123')
        self.assertIsNone(err)
        self.assertTrue(any('action=orders' in u and 'token=TOK123' in u for u in calls),
                         'phải gọi thêm ?action=orders&token=... khi có report_token — action=ping không chạm CONFIG/Sheets thật')

    def test_smoke_test_skips_action_orders_when_no_token(self):
        calls = []

        def fake_http_get(url):
            calls.append(url)
            return 200, '{"ok":true}'

        with patch.object(gas_push, 'http_get', side_effect=fake_http_get):
            err = gas_push.smoke_test(WEBAPP_URL, report_token='')
        self.assertIsNone(err)
        self.assertFalse(any('action=orders' in u for u in calls),
                          'không có report_token thì không được gọi action=orders')


if __name__ == '__main__':
    unittest.main()
