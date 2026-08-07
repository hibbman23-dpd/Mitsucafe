"""emvqr.py — biến mã VietQR/EMVCo tĩnh thành mã động có sẵn số tiền.

Mã trên tấm mica của quán là mã TĨNH (trường 01 = 11): không có ô số tiền nên
khách phải tự gõ. Chuẩn EMVCo có sẵn ô đó, nên chỉ cần chèn thêm và tính lại
mã kiểm tra là ra mã động — không cần API, không cần đăng ký gì với MoMo.

Mã của quán mang HAI đường nhận tiền cùng lúc: ví MoMo (trường 26) và chuyển
khoản ngân hàng qua napas (trường 38). Giữ nguyên cả hai thì khách trả bằng
app ngân hàng nào cũng được.
"""

MAX_REF_LEN = 25


def crc16(s: str) -> str:
    """CRC-16/CCITT-FALSE, 4 ký tự hex hoa — đúng chuẩn EMVCo dùng ở trường 63.

    Đã đối chiếu với mã thật trên tấm mica của quán (ra đúng C4F6). Sai hàm này
    thì mã sinh ra nhìn y như thật nhưng app từ chối, mắt thường không thấy.
    """
    crc = 0xFFFF
    for ch in s.encode("utf-8"):
        crc ^= ch << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return f"{crc:04X}"


def parse(s: str):
    """Tách chuỗi TLV thành [(tag, value), ...]. Không đệ quy — trường lồng thì
    gọi parse() lần nữa trên value."""
    out, i = [], 0
    while i + 4 <= len(s):
        tag = s[i:i + 2]
        try:
            ln = int(s[i + 2:i + 4])
        except ValueError:
            raise ValueError(f"độ dài không phải số ở vị trí {i + 2}")
        val = s[i + 4:i + 4 + ln]
        if len(val) < ln:
            raise ValueError(f"trường {tag} thiếu dữ liệu")
        out.append((tag, val))
        i += 4 + ln
    return out


def _tlv(tag: str, val: str) -> str:
    return f"{tag}{len(val):02d}{val}"


def _clean_ref(ref) -> str:
    """Nội dung chuyển khoản: chỉ ASCII, bỏ dấu tiếng Việt, cắt còn MAX_REF_LEN.

    Dấu tiếng Việt là ký tự nhiều byte — lọt vào đây làm lệch độ dài trường và
    app đọc sai cả phần sau."""
    s = "".join(c for c in str(ref or "") if 32 <= ord(c) < 127)
    return s.strip()[:MAX_REF_LEN]


def to_dynamic(static_payload: str, amount, ref=None) -> str:
    """Mã tĩnh -> mã động có số tiền. Ném ValueError nếu đầu vào không dùng được."""
    try:
        fields = dict(parse(static_payload))
    except ValueError as exc:
        raise ValueError(f"mã tĩnh không đọc được: {exc}")
    if "00" not in fields or "53" not in fields:
        raise ValueError("mã tĩnh thiếu trường bắt buộc (00/53) — không phải mã EMVCo")

    try:
        amt = int(round(float(amount)))
    except (TypeError, ValueError):
        raise ValueError(f"số tiền không hợp lệ: {amount!r}")
    if amt <= 0:
        raise ValueError(f"số tiền phải lớn hơn 0, nhận {amt}")

    fields.pop("63", None)          # CRC cũ vứt đi, tính lại ở dưới
    fields["01"] = "12"             # 12 = mã động, dùng một lần
    fields["54"] = str(amt)
    cleaned = _clean_ref(ref)
    if cleaned:
        fields["62"] = _tlv("08", cleaned)

    # EMVCo yêu cầu trường xếp theo thứ tự tag tăng dần.
    body = "".join(_tlv(t, fields[t]) for t in sorted(fields)) + "6304"
    return body + crc16(body)
