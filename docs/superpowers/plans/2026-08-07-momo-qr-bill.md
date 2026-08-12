# In mã QR MoMo lên hóa đơn — Implementation Plan

> **For agentic workers:** dùng superpowers:subagent-driven-development hoặc executing-plans. Các bước dùng checkbox `- [ ]`.

**Goal:** Khi in hóa đơn cho đơn thanh toán MoMo, in kèm mã QR đã điền sẵn số tiền, để khách quét là trả đúng số, không phải gõ tay.

**Architecture:** Sinh QR ngay trong `printlib.build_receipt_raster()` bằng thư viện `qrcode` + PIL, chèn vào luồng dựng ảnh sẵn có. Không gọi mạng, không phụ thuộc GAS — máy in phải chạy được cả khi mất internet.

**Đối soát:** Không làm. Quán có loa MoMo báo tiền về; nhân viên nghe rồi bấm **Thu tiền** như hiện tại. Hệ thống **không** tự biết đơn đã trả — đây là quyết định của chủ quán, không phải thiếu sót.

## Global Constraints

- `unittest`, KHÔNG phải pytest (máy này chưa cài). Chạy từ thư mục `print-server/`.
- **Lỗi khi sinh QR TUYỆT ĐỐI không được làm hỏng việc in bill.** Bọc try/except: QR hỏng thì in bill không có QR, không bao giờ ném lỗi lên trên. Mất mã QR là phiền; mất tờ bill là mất khách.
- Cấu hình MoMo đọc từ **biến môi trường tại máy quán**, không đọc CONFIG trên GAS. Đường in là local-first và GAS ở quán có tiền sử 403 theo chu kỳ 7 ngày.
- Không thêm phụ thuộc mới ngoài `qrcode` + `Pillow` (đã cài sẵn nhưng **chưa khai báo** trong `requirements.txt` — task 1 bổ sung).
- **🚫 KHÔNG chạy `python3 -m unittest discover`** — `test_routes_spool.py` đặt `PRINT_ENGINE=legacy` lúc import và `test_routes.py` gọi `lpr` thật; việc này đã hai lần bắn job rác ra máy in của quán, lần gần nhất 47 job.
- **Máy in đang phục vụ khách.** Mọi thử nghiệm dùng `PRINT_ENGINE=noop` hoặc server cổng 5002. Chỉ in thật **một** tờ ở bước cuối cùng, khi mọi thứ đã xanh.

---

## Task 0 — ĐÃ XONG (2026-08-07): chốt cách sinh mã

Không dùng `nhantien.momo.vn` như bản Antigravity đề xuất. Mã trên tấm mica của quán là
**mã EMVCo/VietQR chuẩn**, và dựng mã động từ chính nó được — không cần đăng ký gì với MoMo,
không cần API, không cần đổi tài khoản.

### Đọc được gì từ mã tĩnh của quán

| Trường | Giá trị | Nghĩa |
|---|---|---|
| `00` | `01` | phiên bản EMVCo |
| `01` | `11` | **mã tĩnh** — không có ô số tiền, khách phải tự gõ |
| `26` | `vn.momo` + `3549416` | ví MoMo (mã AIO trên tấm mica) |
| `38` | `A000000727` … `QRIBFTTA` | chuyển khoản ngân hàng qua napas |
| `53` | `704` | VND |
| `58` | `VN` | Việt Nam |
| `63` | `C4F6` | mã kiểm tra CRC |

Mã mang **hai** đường nhận tiền cùng lúc: ví MoMo **và** chuyển khoản ngân hàng. Nên khách trả
bằng app ngân hàng nào cũng được, không bắt buộc phải có ví MoMo — rộng hơn hẳn hướng ban đầu.

### Cách biến mã tĩnh thành mã động

Ba bước, không hơn:

1. Đổi trường `01` từ `11` (tĩnh) sang `12` (động, dùng một lần).
2. Chèn trường `54` = số tiền, và `62`→`08` = nội dung chuyển khoản (mã đơn).
3. **Tính lại CRC** ở trường `63`.

### Đã kiểm thật

- Thuật toán CRC được kiểm bằng cách tính lại mã kiểm tra của **chính mã tĩnh của quán** — ra
  đúng `C4F6`. Đây là phép thử bắt buộc: CRC sai thì mã sinh ra trông vẫn giống thật nhưng app
  từ chối, mà nhìn mắt thường không phát hiện được.
- Sinh mã động 1.000đ và 35.000đ (kèm nội dung `QX1`), chủ quán quét thật bằng điện thoại:
  **số tiền tự điền đúng**. Xác nhận 2026-08-07.

### Cấu hình cần đặt ở máy quán

Chuỗi mã tĩnh **không đưa vào repo** — nó chứa số tài khoản ngân hàng của quán. Đặt trong biến
môi trường `MOMO_STATIC_PAYLOAD` ở plist (Task 4). Lấy lại bất cứ lúc nào bằng cách quét tấm
mica ở quầy.

---

## Task 1 — Sinh mã QR động (thuần logic, chưa đụng máy in)

**Files:**
- Create: `print-server/emvqr.py`
- Modify: `print-server/printlib.py`, `print-server/requirements.txt`
- Test: `print-server/test_emvqr.py`

**Interfaces:**
- Produces: `emvqr.crc16(s) -> str` · `emvqr.parse(s) -> list[(tag, value)]` ·
  `emvqr.to_dynamic(static_payload, amount, ref=None) -> str` ·
  `printlib.build_momo_qr(amount, ref) -> PIL.Image | None`

Tách `emvqr.py` thành file riêng thay vì nhét vào `printlib.py`: đây là logic chuỗi thuần,
không dính gì tới in ấn, và test được mà không cần PIL hay máy in.

- [ ] **Bước 1: Viết test trượt**

Tạo `print-server/test_emvqr.py`:

```python
import unittest
import emvqr

# Mã tĩnh dựng theo đúng cấu trúc mã của quán nhưng SỐ TÀI KHOẢN LÀ GIẢ.
# Không đưa mã thật vào repo — nó chứa số tài khoản ngân hàng của quán.
STATIC = ("000201010211"
          "26220007vn.momo02079999999"
          "38630010A000000727013300069710250119PMC00000000000000000208QRIBFTTA"
          "53037045802VN6304")
STATIC = STATIC + emvqr.crc16(STATIC)


class TestCrc(unittest.TestCase):
    def test_crc_is_ccitt_false_4_hex_upper(self):
        c = emvqr.crc16(STATIC[:-4])
        self.assertEqual(len(c), 4)
        self.assertEqual(c, c.upper())
        self.assertEqual(c, STATIC[-4:])

    def test_known_good_vector(self):
        """Chốt thuật toán là CRC-16/CCITT-FALSE (init FFFF, poly 1021, không đảo).

        Vector chuẩn của chuẩn này: crc16("123456789") == "29B1". Dùng vector công
        khai thay vì mã thật của quán — mã thật chứa số tài khoản, không đưa vào repo.

        Thuật toán đã được đối chiếu MỘT LẦN với mã trên tấm mica ngoài repo
        (2026-08-07): tính lại mã kiểm tra của chuỗi gốc ra đúng giá trị in trong
        chuỗi đó. CRC sai thì QR sinh ra nhìn y như thật nhưng app từ chối, mắt
        thường không phát hiện được — nên phải có test chốt."""
        self.assertEqual(emvqr.crc16("123456789"), "29B1")


class TestParse(unittest.TestCase):
    def test_reads_top_level_fields(self):
        d = dict(emvqr.parse(STATIC))
        self.assertEqual(d["00"], "01")
        self.assertEqual(d["01"], "11")
        self.assertEqual(d["53"], "704")
        self.assertEqual(d["58"], "VN")

    def test_roundtrip_unchanged(self):
        rebuilt = "".join(f"{t}{len(v):02d}{v}" for t, v in emvqr.parse(STATIC))
        self.assertEqual(rebuilt, STATIC)


class TestToDynamic(unittest.TestCase):
    def test_marks_payload_dynamic(self):
        d = dict(emvqr.parse(emvqr.to_dynamic(STATIC, 35000)))
        self.assertEqual(d["01"], "12")     # 12 = dùng một lần

    def test_inserts_amount(self):
        d = dict(emvqr.parse(emvqr.to_dynamic(STATIC, 35000)))
        self.assertEqual(d["54"], "35000")

    def test_amount_has_no_decimals(self):
        """'35000.0' là app từ chối."""
        d = dict(emvqr.parse(emvqr.to_dynamic(STATIC, 35000.0)))
        self.assertEqual(d["54"], "35000")

    def test_keeps_both_payment_rails(self):
        """Mã của quán mang CẢ ví MoMo (26) LẪN chuyển khoản ngân hàng (38).
        Mất một cái là khách dùng app kia không trả được."""
        d = dict(emvqr.parse(emvqr.to_dynamic(STATIC, 35000)))
        self.assertIn("vn.momo", d["26"])
        self.assertIn("QRIBFTTA", d["38"])

    def test_ref_goes_into_62_08(self):
        d = dict(emvqr.parse(emvqr.to_dynamic(STATIC, 35000, "QX1")))
        self.assertEqual(dict(emvqr.parse(d["62"]))["08"], "QX1")

    def test_no_62_when_no_ref(self):
        self.assertNotIn("62", dict(emvqr.parse(emvqr.to_dynamic(STATIC, 35000))))

    def test_crc_recomputed_and_valid(self):
        out = emvqr.to_dynamic(STATIC, 35000, "QX1")
        self.assertEqual(emvqr.crc16(out[:-4]), out[-4:])
        self.assertNotEqual(out[-4:], STATIC[-4:])   # phải khác CRC mã tĩnh

    def test_ref_too_long_is_trimmed(self):
        d = dict(emvqr.parse(emvqr.to_dynamic(STATIC, 35000, "X" * 60)))
        self.assertLessEqual(len(dict(emvqr.parse(d["62"]))["08"]), 25)

    def test_ref_strips_chars_outside_ascii(self):
        """Nội dung chuyển khoản chỉ nên là ASCII — dấu tiếng Việt làm lệch
        độ dài trường và app đọc sai."""
        d = dict(emvqr.parse(emvqr.to_dynamic(STATIC, 35000, "Bàn 4")))
        v = dict(emvqr.parse(d["62"]))["08"]
        self.assertTrue(all(ord(c) < 128 for c in v))

    def test_zero_and_negative_rejected(self):
        for bad in (0, -1000):
            with self.assertRaises(ValueError):
                emvqr.to_dynamic(STATIC, bad)

    def test_non_numeric_rejected(self):
        with self.assertRaises(ValueError):
            emvqr.to_dynamic(STATIC, "abc")

    def test_garbage_static_rejected(self):
        with self.assertRaises(ValueError):
            emvqr.to_dynamic("khong-phai-emv", 35000)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Bước 2: Chạy cho chắc là trượt**

```
python3 -m unittest test_emvqr -v
```
Kỳ vọng: FAIL — `No module named 'emvqr'`

- [ ] **Bước 3: Viết `print-server/emvqr.py`**

```python
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
```

- [ ] **Bước 4: Chạy cho chắc là xanh**

```
python3 -m unittest test_emvqr -v
```
Kỳ vọng: `Ran 16 tests` … `OK`

- [ ] **Bước 5: Nối vào printlib**

Thêm vào `print-server/printlib.py`, gần `_get_logo`:

```python
# ── Mã QR thanh toán ─────────────────────────────────────────────────────────
# Đọc từ BIẾN MÔI TRƯỜNG, không đọc CONFIG trên GAS: đường in phải chạy được
# khi GAS chết (GAS ở quán có tiền sử 403 theo chu kỳ 7 ngày).
# MOMO_STATIC_PAYLOAD = chuỗi trong mã QR trên tấm mica ở quầy. Không đưa vào
# repo — nó chứa số tài khoản ngân hàng của quán.
MOMO_STATIC_PAYLOAD = os.getenv("MOMO_STATIC_PAYLOAD", "")
MOMO_QR_DOTS        = int(os.getenv("MOMO_QR_DOTS", "270"))


def build_momo_qr(amount, order_ref=""):
    """Ảnh QR động để dán lên bill. None nếu thiếu cấu hình hoặc sinh lỗi.

    KHÔNG BAO GIỜ ném lỗi: mất mã QR là phiền, mất tờ bill là mất khách.
    """
    if not MOMO_STATIC_PAYLOAD:
        return None
    try:
        import qrcode
        import emvqr
        from PIL import Image

        payload = emvqr.to_dynamic(MOMO_STATIC_PAYLOAD, amount, order_ref)
        qr = qrcode.QRCode(
            error_correction=qrcode.constants.ERROR_CORRECT_M,  # chịu giấy nhiệt mờ
            box_size=1, border=2,
        )
        qr.add_data(payload)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white").convert("L")
        # Phóng bằng NEAREST: mọi phép nội suy khác làm nhoè ô vuông, in ra
        # ở 203dpi là điện thoại không bắt được mã.
        side = max(120, min(int(MOMO_QR_DOTS), _CW))
        scale = max(1, side // img.width)
        return img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    except Exception:
        return None
```

Đo thật trên giấy của quán: mã 35.000đ kèm nội dung ra **41 module**, phóng 6 lần thành
**246 dot**, vùng in tối đa là **368 dot** (`_CW`) — vừa, và đủ to để điện thoại bắt.

- [ ] **Bước 6: Khai báo phụ thuộc**

Thêm vào `print-server/requirements.txt`:

```
qrcode>=7.4     # QR thanh toán trên bill
Pillow>=10.0    # dựng ảnh bill/tem (printlib) — trước đây dùng mà không khai báo
```

- [ ] **Bước 7: Commit**

```bash
git add print-server/emvqr.py print-server/test_emvqr.py print-server/printlib.py print-server/requirements.txt
git commit -m "feat(print): sinh mã VietQR/MoMo động có sẵn số tiền từ mã tĩnh của quán"
```

---

## Task 2 — Chèn QR vào hóa đơn, đúng chỗ và đúng lúc

**Files:**
- Modify: `print-server/printlib.py` (`build_receipt_raster`)
- Test: `print-server/test_printlib_qr.py` (thêm class)

**Interfaces:**
- Consumes: `build_momo_qr` (Task 1)

**Bốn điều kiện phải đúng ĐỦ CẢ BỐN thì mới in QR.** Thiếu một là in sai chỗ:

| Điều kiện | Vì sao |
|---|---|
| `show_total=True` | `show_total=False` là **phiếu pha chế cho bếp** (`print_server.py:1055` gọi `tag="prep"`). In mã thanh toán lên phiếu bếp là vô nghĩa và tốn giấy. |
| Đơn **chưa** thanh toán | Bill đã thu tiền mà mang QR là **mời khách trả lần hai**. |
| `payment_method` là `momo` | Đơn tiền mặt không cần QR. |
| Sinh QR thành công | Thiếu cấu hình thì in bill bình thường, không để ô trống khó hiểu. |

- [ ] **Bước 1: Viết test trượt**

Thêm vào `print-server/test_printlib_qr.py`, **trước** khối `if __name__`:

```python
class TestReceiptQrPlacement(unittest.TestCase):
    """QR chỉ được xuất hiện trên HÓA ĐƠN CHƯA TRẢ của đơn MoMo."""

    def setUp(self):
        # Mã tĩnh GIẢ theo đúng cấu trúc mã của quán — không đưa mã thật vào repo.
        import emvqr
        base = ("000201010211"
                "26220007vn.momo02079999999"
                "38630010A000000727013300069710250119PMC00000000000000000208QRIBFTTA"
                "53037045802VN6304")
        os.environ["MOMO_STATIC_PAYLOAD"] = base + emvqr.crc16(base)
        printlib.MOMO_STATIC_PAYLOAD = os.environ["MOMO_STATIC_PAYLOAD"]
        self.calls = []
        self._orig = printlib.build_momo_qr

        def spy(amount, ref=""):
            self.calls.append((amount, ref))
            return self._orig(amount, ref)

        printlib.build_momo_qr = spy

    def tearDown(self):
        printlib.build_momo_qr = self._orig

    def _order(self, **over):
        o = {"order_id": "ORD-20260807-0001", "total": 35000,
             "payment_method": "momo", "paid": 0,
             "items": [{"sku": "DR001", "name": "CF MITSU", "qty": 1, "price": 35000,
                        "modifiers": {}}],
             "metadata": {"short_code": "QX1"}}
        o.update(over)
        return o

    def test_qr_on_unpaid_momo_bill(self):
        printlib.build_receipt_raster(self._order(), show_total=True)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0][0], 35000)

    def test_no_qr_on_prep_ticket(self):
        """Phiếu pha chế cho bếp — hồi quy: QR từng lọt lên đây."""
        printlib.build_receipt_raster(self._order(), show_total=False)
        self.assertEqual(self.calls, [])

    def test_no_qr_when_already_paid(self):
        printlib.build_receipt_raster(self._order(paid=1), show_total=True)
        self.assertEqual(self.calls, [])

    def test_no_qr_when_payment_status_paid(self):
        printlib.build_receipt_raster(
            self._order(paid=0, payment_status="PAID"), show_total=True)
        self.assertEqual(self.calls, [])

    def test_no_qr_for_cash_order(self):
        printlib.build_receipt_raster(
            self._order(payment_method="cash"), show_total=True, is_cash=True)
        self.assertEqual(self.calls, [])

    def test_group_bill_uses_group_total_not_one_order(self):
        """Bill gộp bàn: print_server dựng dict có total là TỔNG CẢ BÀN và
        order_id là mã nhóm. Lấy nhầm total của một đơn = khách trả thiếu."""
        group = {"order_id": "BG-20260807-77", "total": 145000,
                 "payment_method": "momo", "paid": 0,
                 "items": [{"sku": "DR001", "name": "CF MITSU", "qty": 4,
                            "price": 35000, "modifiers": {}}],
                 "metadata": {"short_code": "BG-20260807-77", "notes": ""}}
        printlib.build_receipt_raster(group, show_total=True)
        self.assertEqual(self.calls[0][0], 145000)

    def test_qr_failure_does_not_break_receipt(self):
        """QR hỏng thì bill vẫn phải in ra."""
        printlib.build_momo_qr = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom"))
        data = printlib.build_receipt_raster(self._order(), show_total=True)
        self.assertTrue(data)
        self.assertGreater(len(data), 100)

    def test_receipt_still_builds_without_config(self):
        printlib.MOMO_STATIC_PAYLOAD = ""
        data = printlib.build_receipt_raster(self._order(), show_total=True)
        self.assertTrue(data)
```

- [ ] **Bước 2: Chạy cho chắc là trượt**

```
PRINT_ENGINE=noop python3 -m unittest test_printlib_qr -v
```
Kỳ vọng: FAIL ở `test_qr_on_unpaid_momo_bill` — `self.calls` rỗng vì chưa ai gọi.

- [ ] **Bước 3: Viết implementation**

Trong `build_receipt_raster`, thêm hàm dựng ngay **sau** `add_logo` (khoảng dòng 357), theo đúng khuôn lệnh sẵn có:

```python
    def add_momo_qr(amount, ref):
        """Chèn QR MoMo. Trả True nếu có in, False nếu bỏ qua.

        Bọc try/except toàn bộ: lỗi ở đây KHÔNG được làm hỏng tờ bill.
        """
        nonlocal y
        try:
            qimg = build_momo_qr(amount, ref)
        except Exception:
            qimg = None
        if qimg is None:
            return False
        qx = max(0, (W - qimg.width) // 2)
        cmds.append(("logo", qx, y, qimg))   # dùng lại lệnh dán ảnh sẵn có
        y += qimg.height
        return True
```

Rồi trong nhánh `if show_total:` (khối in tổng tiền, khoảng dòng 366+), **sau** dòng tổng tiền và **trước** dòng cảm ơn:

```python
        # QR MoMo: chỉ HÓA ĐƠN (show_total), chỉ đơn CHƯA trả, chỉ phương thức momo.
        # - phiếu pha chế: không liên quan thanh toán
        # - đơn đã trả:    in QR lên bill đã thu tiền = mời khách trả lần hai
        _paid = bool(order.get("paid")) or str(order.get("payment_status", "")).upper() == "PAID"
        _method = str(order.get("payment_method") or "").lower()
        if not _paid and _method == "momo":
            _amt = order.get("total")
            _ref = str((order.get("metadata") or {}).get("short_code")
                       or order.get("order_id") or "")
            add_gap(4)
            if add_momo_qr(_amt, _ref):
                # In số tiền bằng chữ cạnh mã: giấy nhiệt mờ hoặc đầu in mòn thì
                # mã khó quét, có số bằng chữ là nhân viên đọc và xử lý tay được.
                add_text("Quét MoMo trả " + _format_amount(_amt), f_norm, "center")
                add_gap(3)
```

Lưu ý: `order.get("total")` ở đây là total của **chính dict đang in**. Với bill gộp bàn, `print_server.py:1227` đã dựng sẵn dict có `total` là tổng cả bàn — nên đúng. Đừng đi tra ngược `STORE` để lấy total của một đơn.

- [ ] **Bước 4: Chạy cho chắc là xanh**

```
PRINT_ENGINE=noop python3 -m unittest test_printlib_qr -v
```
Kỳ vọng: `Ran 19 tests` … `OK`

- [ ] **Bước 5: Chạy các test in sẵn có, chắc không vỡ gì**

```
PRINT_ENGINE=noop python3 -m unittest test_printlib test_printlib_drawer test_bill_engine
```
Kỳ vọng: `OK`

- [ ] **Bước 6: Commit**

```bash
git add print-server/printlib.py print-server/test_printlib_qr.py
git commit -m "feat(print): in QR MoMo lên hóa đơn chưa trả, chặn phiếu bếp và bill đã thu"
```

---

## Task 3 — Đưa phương thức thanh toán tới chỗ in

**Files:**
- Modify: `print-server/print_server.py` (2 route in bill), `web/kds.html`
- Test: `print-server/test_routes_billqr.py`

### Vì sao cần task này — Task 2 hiện KHÔNG chạy trên máy thật

Task 2 chỉ in QR khi `payment_method == "momo"` và đơn chưa trả. Nhưng đã kiểm:

1. Hai route in bill (`print_server.py`, `/bill/<order_id>/print` và
   `/bill/group/<group_id>/print`) dựng `recp` **không có** `payment_method`, cũng không có
   `paid`. Cổng chặn không bao giờ mở → QR không bao giờ in.
2. Bảng `orders` ở máy quán **không có cột `payment_method`** (kiểm bằng
   `PRAGMA table_info(orders)`). Nên không tra ngược từ kho ra được.
3. KDS chỉ có hai nút thanh toán (`kds.html`, khoảng dòng 2592): Tiền mặt và VietQR. Không có
   đường nào đặt `momo`.

Phương thức thanh toán là **quyết định của thu ngân lúc tính tiền**, không phải thuộc tính lưu
sẵn của đơn. Nên nó phải đi kèm lệnh in, không tra ngược.

- [ ] **Bước 1: Viết test trượt**

Tạo `print-server/test_routes_billqr.py`:

```python
import json, os, sqlite3, tempfile, threading, unittest
import print_server
from order_store import OrderStore


class BillQrRouteCase(unittest.TestCase):
    def setUp(self):
        print_server.app.config["TESTING"] = True
        self.c = print_server.app.test_client()
        self._db = tempfile.mktemp(suffix=".db")
        conn = sqlite3.connect(self._db, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        print_server.STORE = OrderStore(conn, threading.Lock())
        self.sent = []
        # Chặn ở tầng dựng ảnh: không đụng máy in, chỉ xem recp mang gì.
        self._orig = print_server.build_receipt
        def spy(order, **kw):
            self.sent.append((order, kw))
            return b"FAKE"
        print_server.build_receipt = spy
        print_server._print_receipt_bytes = lambda data, open_drawer=False: len(data)

    def tearDown(self):
        print_server.build_receipt = self._orig
        if os.path.exists(self._db):
            os.remove(self._db)

    def _order(self, oid="ORD-T-1", **over):
        o = {"order_id": oid, "short_code": "QX1", "delivery_type": "dine_in",
             "table_id": "B1", "source": "staff",
             "items": [{"sku": "DR001", "name": "CF MITSU", "qty": 1, "price": 35000}],
             "customer_note": "", "bill_meta": {}}
        o.update(over)
        print_server.STORE.upsert_create(o)
        return o


class TestBillPrintCarriesPayment(BillQrRouteCase):
    def test_method_from_request_body_reaches_receipt(self):
        self._order()
        self.c.post("/bill/ORD-T-1/print", json={"payment_method": "momo"})
        recp = self.sent[0][0]
        self.assertEqual(recp["payment_method"], "momo")

    def test_defaults_to_cash_when_body_omits_method(self):
        """Không gửi gì thì KHÔNG được đoán là momo — mặc định tiền mặt, không in QR."""
        self._order()
        self.c.post("/bill/ORD-T-1/print", json={})
        self.assertEqual(self.sent[0][0].get("payment_method"), "cash")

    def test_paid_state_passed_through(self):
        self._order()
        print_server.STORE.apply_paid("ORD-T-1", True)
        self.c.post("/bill/ORD-T-1/print", json={"payment_method": "momo"})
        self.assertTrue(self.sent[0][0]["paid"])

    def test_unpaid_order_marked_unpaid(self):
        self._order()
        self.c.post("/bill/ORD-T-1/print", json={"payment_method": "momo"})
        self.assertFalse(self.sent[0][0]["paid"])

    def test_rejects_unknown_method(self):
        """Chuỗi lạ từ client không được lọt vào bill."""
        self._order()
        r = self.c.post("/bill/ORD-T-1/print", json={"payment_method": "<script>"})
        self.assertEqual(r.status_code, 400)


class TestGroupBillCarriesPayment(BillQrRouteCase):
    def _group(self):
        self._order("ORD-T-1")
        self._order("ORD-T-2")
        gid = "BG-TEST-1"
        print_server.STORE.set_bill_group(["ORD-T-1", "ORD-T-2"], gid)
        return gid

    def test_group_method_and_total(self):
        gid = self._group()
        self.c.post(f"/bill/group/{gid}/print", json={"payment_method": "momo"})
        recp = self.sent[0][0]
        self.assertEqual(recp["payment_method"], "momo")
        self.assertEqual(recp["total"], 70000)      # tổng CẢ BÀN, không phải 1 đơn

    def test_group_paid_only_when_every_order_paid(self):
        """Một đơn trong bàn đã trả, đơn kia chưa -> bàn CHƯA trả xong, vẫn cần QR."""
        gid = self._group()
        print_server.STORE.apply_paid("ORD-T-1", True)
        self.c.post(f"/bill/group/{gid}/print", json={"payment_method": "momo"})
        self.assertFalse(self.sent[0][0]["paid"])

    def test_group_paid_when_all_paid(self):
        gid = self._group()
        for oid in ("ORD-T-1", "ORD-T-2"):
            print_server.STORE.apply_paid(oid, True)
        self.c.post(f"/bill/group/{gid}/print", json={"payment_method": "momo"})
        self.assertTrue(self.sent[0][0]["paid"])


if __name__ == "__main__":
    unittest.main()
```

Chữ ký hai hàm dùng ở trên đã đối chiếu với `order_store.py`:
`apply_paid(order_id, paid=True)` và `set_bill_group(order_ids, group_id)` — `set_bill_group`
nhận **hai** tham số, mã nhóm do người gọi đặt chứ hàm không tự sinh.

- [ ] **Bước 2: Chạy cho chắc là trượt**

```
PRINT_ENGINE=legacy python3 -m unittest test_routes_billqr -v
```
Kỳ vọng: FAIL — `recp` chưa có `payment_method`.

(Dùng `legacy` chứ không `noop` vì `noop` thoát sớm trước khi dựng `recp`; `_print_receipt_bytes`
đã bị thay bằng hàm giả trong `setUp` nên không có gì chạm máy in.)

- [ ] **Bước 3: Sửa hai route**

Thêm hằng số gần đầu khối route:

```python
# Chỉ nhận đúng các phương thức đã biết. Chuỗi lạ từ client không được lọt vào
# bill — recp đi thẳng vào hàm dựng ảnh và vào spool.
_BILL_PAY_METHODS = ("cash", "momo", "vietqr", "bank_transfer")
```

Trong `bill_print`, sau khi lấy `o` và trước khi dựng `recp`:

```python
    _m = str((request.get_json(silent=True) or {}).get("payment_method") or "cash").lower()
    if _m not in _BILL_PAY_METHODS:
        return jsonify({"ok": False, "error": f"payment_method lạ: {_m}"}), 400
```

rồi thêm hai khoá vào `recp`:

```python
            "payment_method": _m, "paid": bool(o.get("paid")),
```

Trong `bill_group_print`, tương tự, nhưng `paid` phải tính trên **toàn bộ** đơn của bàn:

```python
    # Bàn coi như đã trả xong CHỈ KHI mọi đơn trong bàn đều đã trả. Còn một đơn
    # chưa trả thì bill vẫn cần QR, nếu không khách không có gì để quét.
    _orders = [STORE.get(oid) for oid in bill["order_ids"]]
    _all_paid = bool(_orders) and all(bool(x and x.get("paid")) for x in _orders)
```

và thêm vào `recp`: `"payment_method": _m, "paid": _all_paid,`

- [ ] **Bước 4: Chạy cho chắc là xanh**

```
PRINT_ENGINE=legacy python3 -m unittest test_routes_billqr -v
```
Kỳ vọng: `Ran 8 tests` … `OK`

- [ ] **Bước 5: Thêm nút MoMo trên KDS và gửi phương thức khi in**

Trong `web/kds.html`, cạnh hai nút sẵn có (khoảng dòng 2592):

```html
<div class="mode-btn ${checkoutState.paymentMethod === 'momo' ? 'active' : ''}" onclick="checkoutSetPayMethod('momo')">💗 MoMo</div>
```

Rồi sửa hai lời gọi in để **gửi kèm phương thức** — đây là mấu chốt, thiếu bước này thì mọi
thứ trên vô nghĩa. Tìm `printGroup(` và `printBill(` trong `web/order-api.js` và ở chỗ gọi
trong `kds.html`, cho chúng nhận và gửi `{payment_method}` theo `checkoutState.paymentMethod`.

Kiểm thêm: `finishOrder` (`kds.html`, khoảng dòng 2337) chỉ mở két và thu tiền mặt khi
`method === 'cash'`. `momo` **không** được rơi vào nhánh đó.

- [ ] **Bước 6: Kiểm bằng trình duyệt — cổng 5002, KHÔNG phải 5001**

```bash
cd print-server && PRINT_ENGINE=noop GATEWAY_SYNC=0 SERVER_PORT=5002 \
  GATEWAY_DB=/tmp/momo_ob.db ATTENDANCE_DB=/tmp/momo_att.db \
  ATTENDANCE_STAFF_CACHE=/tmp/momo_staff.json python3 print_server.py
```

Mở `http://localhost:5002/kds.html`. Kiểm: chọn MoMo thì nút sáng; bấm in bill thì request
`/bill/.../print` mang `payment_method: "momo"` (xem tab Network); bấm thu tiền **không** mở két.

- [ ] **Bước 7: Commit**

```bash
git add print-server/print_server.py print-server/test_routes_billqr.py web/kds.html
git commit -m "feat(bill): truyền phương thức thanh toán và trạng thái đã trả vào lệnh in bill"
```

---

## Task 4 — Cấu hình máy quán và in thử tờ thật

**Files:**
- Modify: `print-server/com.lamha.kissaten.printserver.plist`
- Create: `docs/system/momo-qr.md`

- [ ] **Bước 1: Thêm biến môi trường vào plist**

Trong `EnvironmentVariables` của `com.lamha.kissaten.printserver.plist`:

```xml
<key>MOMO_STATIC_PAYLOAD</key>
<string>DÁN_NGUYÊN_CHUỖI_QUÉT_ĐƯỢC_TỪ_TẤM_MICA_Ở_QUẦY</string>
```

- [ ] **Bước 2: In thử trên server test, KHÔNG phải máy quán**

Chạy server cổng 5002 như Task 3 nhưng đặt `PRINT_ENGINE=noop`, gọi in bill mẫu, và **lưu ảnh ra file** thay vì in:

```bash
cd print-server && MOMO_STATIC_PAYLOAD="<chuỗi từ tấm mica>" python3 -c "
import printlib
from PIL import Image
o = {'order_id':'ORD-TEST','total':35000,'payment_method':'momo','paid':0,
     'items':[{'sku':'DR001','name':'CF MITSU','qty':1,'price':35000,'modifiers':{}}],
     'metadata':{'short_code':'QX1'}}
img = printlib.build_momo_qr(35000,'QX1')
img.save('/tmp/momo_qr_test.png')
print('lưu /tmp/momo_qr_test.png —', img.width,'x',img.height,'dot')
"
```

- [ ] **Bước 3: Quét ảnh trên màn hình bằng điện thoại**

Mở `/tmp/momo_qr_test.png`, phóng to, quét bằng app MoMo. Phải ra đúng **35.000đ**. Đây là lần kiểm cuối trước khi tốn giấy.

- [ ] **Bước 4: Restart máy quán rồi in MỘT tờ thật**

```bash
launchctl kickstart -k gui/$(id -u)/com.lamha.kissaten.printserver
```

Tạo một đơn thật giá nhỏ, chọn MoMo, in bill. Kiểm trên tờ giấy:
- mã QR rõ nét, quét được bằng MoMo, hiện đúng số tiền
- có dòng chữ *"Quét MoMo trả 35.000đ"* dưới mã
- phiếu pha chế của cùng đơn đó **không** có QR

- [ ] **Bước 5: Viết `docs/system/momo-qr.md`**

Ghi lại: kết quả kiểm Task 0 (định dạng nào chạy), hai biến môi trường, bốn điều kiện in QR, và **vì sao không có đối soát tự động** (quán dùng loa MoMo báo tiền, nhân viên nghe rồi bấm Thu tiền — hệ thống không tự biết).

- [ ] **Bước 6: Commit**

```bash
git add print-server/com.lamha.kissaten.printserver.plist docs/system/momo-qr.md
git commit -m "ops(momo): cấu hình QR MoMo trên máy quán + tài liệu vận hành"
```

---

## Ghi chú cho người thực thi

- Task 0 là **cửa chặn**. Chưa có kết quả quét thật thì không viết code.
- Task 1 và 2 chạy được hoàn toàn ngoại tuyến, không cần máy in, không cần mạng.
- Chỉ Task 4 bước 4 mới đụng máy in thật, và chỉ **một** tờ.
- Nếu một test trượt bất ngờ, dừng lại và dùng `superpowers:systematic-debugging` thay vì sửa test cho vừa code.
