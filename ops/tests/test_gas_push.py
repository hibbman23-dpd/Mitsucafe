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


def make_urlopen_stub(old_ver, new_ver=42, smoke_sequence=None, rollback_retarget_fail=None):
    """
    Dựng side_effect cho urllib.request.urlopen dùng chung cho mọi test case.

    smoke_sequence: list[(status, body)] — trả lần lượt mỗi lần gọi ?action=ping.
                     Hết danh sách thì mặc định xanh.
    rollback_retarget_fail: None hoặc (status, body) — PUT retarget LẦN 2 (lùi về
                             old_ver) trả lỗi HTTP thay vì 200.
    Trả (stub_fn, calls) — calls ghi lại (method, url, body_json) theo thứ tự để assert,
    body_json là dict đã parse (None nếu request không có data, vd GET).
    """
    smoke_sequence = smoke_sequence or []
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

    def test_smoke_green_exactly_one_retarget_no_rollback(self):
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


if __name__ == '__main__':
    unittest.main()
