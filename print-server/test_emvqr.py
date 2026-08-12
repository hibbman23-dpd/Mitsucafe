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
