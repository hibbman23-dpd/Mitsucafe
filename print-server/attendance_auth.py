"""attendance_auth.py — PIN, chống dò, phiên của chủ.

PIN gốc nằm ở sheet STAFF. Bản trên đĩa CHỈ giữ SHA-256(salt+pin), file 0600.
Không ghi PIN thô xuống đĩa, vào log, hay vào response — bất kỳ đâu.
"""
import hashlib
import json
import os
import re
import secrets
import time
from collections import defaultdict, deque

_PIN_RE = re.compile(r"^\d{4}$")


def _looks_like_pin(pin):
    """4 chữ số, không rỗng, không None — kiểm tra TRƯỚC khi băm (§F1).

    Nếu không có bước này, một PIN rỗng gửi lên ("") sẽ được băm và so với
    pin_hash rỗng — nếu pin_hash rỗng từng lỡ lọt vào cache (staff mới thêm,
    chưa ai gõ PIN), verify() sẽ coi đó là khớp và trả về danh tính đầy đủ.
    """
    if pin is None or pin == "":
        return False
    return bool(_PIN_RE.match(str(pin)))


def load_or_create_salt(path):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    salt = secrets.token_hex(16)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.chmod(path, 0o600)  # O_TRUNC on a pre-existing file keeps its old mode; force it
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(salt)
    return salt


def hash_pin(pin, salt):
    return hashlib.sha256((salt + str(pin)).encode("utf-8")).hexdigest()


def _write_600(path, text):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.chmod(path, 0o600)  # O_TRUNC on a pre-existing file keeps its old mode; force it
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)


def _is_active(value):
    """Chuẩn hoá cột `active` từ Sheets — không tin string tuỳ tiện.

    Chỉ coi là active khi: True (bool), số khác 0, hoặc string upper() == "TRUE".
    Mọi thứ khác (False, "FALSE", "false", "", None, 0, thiếu key) đều inactive.
    Không được dựa vào tầng Apps Script chuẩn hoá trước — module này phải tự vệ.
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().upper() == "TRUE"
    if isinstance(value, (int, float)):
        return value != 0
    return False


class StaffCache:
    """Bản sao STAFF trên đĩa để chấm công vẫn chạy khi mất mạng."""

    def __init__(self, path, salt_path=None):
        self.path = path
        self.salt = load_or_create_salt(salt_path or (path + ".salt"))
        self._rows = []
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                self._rows = json.load(f)

    def replace(self, staff_rows):
        """Ghi đè cache từ STAFF sheet. `pin` bị băm ngay, không bao giờ lưu thô.

        Row có `pin` rỗng bị BỎ QUA hoàn toàn (§F1): dòng STAFF mới thêm luôn
        rỗng PIN cho tới khi ai đó gõ vào — không cache nghĩa là staff đó
        không thể chấm công được cho tới khi có PIN thật, đúng trạng thái an
        toàn cần có (thay vì cache hash("") rồi verify("") lỡ khớp).
        """
        self._rows = [{
            "staff_id": str(r.get("staff_id", "")),
            "name": r.get("name", ""),
            "role": (r.get("role") or "").lower(),
            "active": _is_active(r.get("active")),
            "pin_hash": hash_pin(r.get("pin", ""), self.salt),
        } for r in staff_rows if r.get("staff_id") and r.get("pin")]
        _write_600(self.path, json.dumps(self._rows, ensure_ascii=False))

    def get(self, staff_id):
        """Trả về row nội bộ NGUYÊN VẸN, gồm cả `pin_hash` — chỉ dùng trong server.

        Lý do `pin_hash` không bị lược bỏ: nhân viên đã nghỉ (active=False) mà
        còn ca chưa đóng vẫn phải bấm PIN để clock out, và `verify()` đã tự
        chặn active=False đúng chỗ cần chặn. Kết quả của `get()` KHÔNG BAO GIỜ
        được serialize thẳng vào response HTTP — dùng `verify()` hoặc
        `list_visible()` cho bất kỳ thứ gì trả về client.
        """
        for r in self._rows:
            if r["staff_id"] == staff_id:
                return r
        return None

    def verify(self, staff_id, pin):
        # Chặn PIN rỗng/không đúng định dạng TRƯỚC khi băm (§F1) — không cho
        # nó có cơ hội khớp với một pin_hash rỗng nào đó lỡ lọt vào cache.
        if not _looks_like_pin(pin):
            return None
        r = self.get(staff_id)
        if r is None or not r["active"]:
            return None
        if not secrets.compare_digest(r["pin_hash"], hash_pin(pin, self.salt)):
            return None
        return {k: v for k, v in r.items() if k != "pin_hash"}

    def list_visible(self, open_staff_ids):
        """Nhân viên active, cộng người đã nghỉ mà còn ca chưa đóng — nếu không
        ca đó treo vĩnh viễn và chủ phải sửa tay."""
        keep = set(open_staff_ids or [])
        out = [{"staff_id": r["staff_id"], "name": r["name"], "role": r["role"]}
               for r in self._rows if r["active"] or r["staff_id"] in keep]
        return sorted(out, key=lambda r: r["staff_id"])


class RateLimiter:
    """Đếm số lần sai trong cửa sổ trượt. Dùng cho cả staff_id lẫn IP."""

    def __init__(self, max_hits, window_seconds):
        self.max_hits = max_hits
        self.window = window_seconds
        self._hits = defaultdict(deque)

    def hit(self, key, now=None):
        """Ghi 1 lần sai. Trả False nếu key đã vượt ngưỡng (tức là bị chặn)."""
        now = time.time() if now is None else now
        q = self._hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.max_hits:
            return False
        q.append(now)
        return True

    def blocked(self, key, now=None):
        """Số giây còn bị chặn, 0 nếu không bị chặn."""
        now = time.time() if now is None else now
        q = self._hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) < self.max_hits:
            return 0
        return max(0, self.window - (now - q[0]))


class OwnerSessions:
    """Token phiên ngắn hạn cho chủ. PIN KHÔNG BAO GIỜ ra khỏi server —
    client chỉ giữ token, lộ token chỉ lộ trong TTL."""

    def __init__(self, ttl_seconds=900):
        self.ttl = ttl_seconds
        self._live = {}

    def issue(self, staff_id, now=None):
        now = time.time() if now is None else now
        token = secrets.token_urlsafe(32)
        expires = now + self.ttl
        self._live[token] = (staff_id, expires)
        return token, expires

    def resolve(self, token, now=None):
        now = time.time() if now is None else now
        rec = self._live.get(token)
        if rec is None:
            return None
        staff_id, expires = rec
        if now > expires:
            self._live.pop(token, None)
            return None
        return staff_id
