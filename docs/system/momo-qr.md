# Mã QR thanh toán trên hóa đơn

> Index: `../../CLAUDE.md` · Đọc khi sửa `emvqr.py`, `printlib.build_momo_qr`, hoặc 2 route in bill.
> Kế hoạch gốc: `docs/superpowers/plans/2026-08-07-momo-qr-bill.md`

Bill của đơn **chưa thanh toán** chọn phương thức **MoMo** sẽ in kèm mã QR đã điền sẵn số tiền.
Khách quét là trả đúng số, không phải gõ tay.

## Không có đối soát tự động — cố ý

Quán dùng **loa MoMo báo tiền về**. Nhân viên nghe loa rồi bấm **Thu tiền** như bình thường.

Hệ thống **không** tự biết đơn đã trả. Đây là quyết định của chủ quán (2026-08-07), không phải
thiếu sót — đừng "bổ sung" webhook đối soát mà chưa hỏi.

## Mã động dựng từ mã tĩnh của quán

Tấm mica ở quầy mang mã **VietQR/EMVCo tĩnh**. Nó chứa **hai** đường nhận tiền cùng lúc:

| Trường | Nội dung |
|---|---|
| `26` | ví MoMo (`vn.momo` + mã AIO) |
| `38` | chuyển khoản ngân hàng qua napas (`QRIBFTTA`) |

Vì có cả hai, **khách trả bằng app ngân hàng nào cũng được**, không bắt buộc phải có ví MoMo.
Giữ nguyên cả hai trường khi dựng mã động — bỏ một cái là khách dùng app kia không trả được
(có test canh: `test_keeps_both_payment_rails`).

Biến tĩnh thành động (`emvqr.to_dynamic`):

1. Trường `01`: `11` (tĩnh) → `12` (động, dùng một lần)
2. Chèn `54` = số tiền, `62`→`08` = mã đơn
3. **Tính lại CRC** ở trường `63`

Không cần API, không cần đăng ký gì với MoMo.

### CRC là chỗ dễ sai nhất

`CRC-16/CCITT-FALSE`: init `0xFFFF`, đa thức `0x1021`, không đảo bit, không XOR cuối, in ra 4
ký tự hex hoa.

**Sai CRC thì mã vẫn quét ra được như một QR bình thường, nhưng app thanh toán từ chối** — nhìn
mắt thường không phát hiện nổi. Test chốt bằng vector công khai `crc16("123456789") == "29B1"`.

Thuật toán đã đối chiếu một lần với mã thật trên tấm mica (2026-08-07): tính lại mã kiểm tra của
chuỗi gốc ra đúng giá trị in trong chuỗi đó.

## Bốn điều kiện để in QR — thiếu một là không in

| Điều kiện | Vì sao |
|---|---|
| `show_total=True` | `show_total=False` là **phiếu pha chế cho bếp**. Mã thanh toán trên phiếu bếp vô nghĩa, tốn giấy. |
| Đơn **chưa** trả | Bill đã thu tiền mà mang QR là **mời khách trả lần hai**. |
| `payment_method == "momo"` | Đơn tiền mặt không cần. |
| Sinh QR thành công | Thiếu cấu hình thì in bill bình thường, không để ô trống khó hiểu. |

**Bàn gộp chỉ tính là đã trả khi MỌI đơn trong bàn đã trả.** Còn một đơn chưa trả mà coi cả bàn
là xong thì khách không có gì để quét.

## Phương thức thanh toán đi kèm lệnh in

Bảng `orders` ở máy quán **không có cột `payment_method`** (kiểm bằng `PRAGMA table_info`), nên
không tra ngược từ kho ra được. Phương thức là **quyết định của thu ngân lúc tính tiền**, nên
KDS gửi kèm trong body của `/bill/<id>/print` và `/bill/group/<id>/print`.

- Thiếu → mặc định `cash`. **Không bao giờ đoán `momo`**, kẻo bill tiền mặt mọc mã QR.
- Chuỗi lạ → trả `400`. Dict đó đi thẳng vào hàm dựng ảnh và vào print spool.

`printlib` đọc `payment_method` phẳng, có dự phòng `payment.method` lồng (payload cũ kiểu GAS).
Chỉ đọc một dạng thì bill MoMo in ra chữ "Thanh toán" chung chung thay vì "MoMo".

## Cấu hình ở máy quán

Một biến duy nhất, đặt trong plist **đang chạy** ở `~/Library/LaunchAgents/`:

```xml
<key>MOMO_STATIC_PAYLOAD</key>
<string>…chuỗi quét được từ tấm mica ở quầy…</string>
```

Bản plist trong repo để chỗ trống `REPLACE_WITH_MOMO_STATIC_PAYLOAD`. **Không commit giá trị
thật** — chuỗi đó chứa số tài khoản ngân hàng của quán. Mất thì quét lại tấm mica là có.

Đọc từ **biến môi trường**, không đọc CONFIG trên GAS: đường in phải chạy được khi GAS chết, mà
GAS ở quán có tiền sử 403 theo chu kỳ 7 ngày.

Đổi giá trị xong phải restart thì mới có hiệu lực:

```bash
launchctl kickstart -k gui/$(id -u)/com.lamha.kissaten.printserver
```

Chỉnh cỡ mã: `MOMO_QR_DOTS` (mặc định 270). Giấy 58mm cho vùng in **368 dot**; mã 35.000đ kèm
nội dung ra 41 module, phóng 6 lần thành 246 dot — vừa và đủ to để điện thoại bắt.

## Lỗi sinh QR không được làm hỏng tờ bill

`build_momo_qr` trả `None` khi có bất kỳ vấn đề gì và **không bao giờ ném lỗi**. Mất mã QR là
phiền; mất tờ bill là mất khách. Có test ném lỗi giả để chứng minh bill vẫn in ra.

## Chạy test

**🚫 KHÔNG chạy `python3 -m unittest discover`** — `test_routes_spool.py` đặt
`PRINT_ENGINE=legacy` lúc import và `test_routes.py` gọi `lpr` thật; việc này đã hai lần bắn job
rác ra máy in của quán, lần gần nhất 47 job.

```bash
cd print-server
PRINT_ENGINE=noop python3 -m unittest test_printlib_qr test_emvqr test_printlib test_printlib_drawer test_bill_engine
PRINT_ENGINE=legacy python3 -m unittest test_routes_billqr
```

`test_routes_billqr` dùng `legacy` **cố ý**: `noop` thoát sớm trước khi dựng dữ liệu in nên test
sẽ không chứng minh được gì. `setUp` đã thay `build_receipt` và `_print_receipt_bytes` bằng hàm
giả, không có gì chạm máy in.

Xem thành phẩm mà không tốn giấy — dựng ảnh bill rồi quét trên màn hình:

```bash
cd print-server && MOMO_STATIC_PAYLOAD="<chuỗi từ tấm mica>" python3 -c "
import sys, datetime; sys.path.insert(0,'.')
import printlib
from PIL import Image
grab={}
_o=printlib._img_to_raster_bytes
printlib._img_to_raster_bytes=lambda img:(grab.setdefault('p',[]).append(img.copy()), _o(img))[1]
don={'order_id':'ORD-TEST','short_code':'QX7','table_id':'B3','total':94000,
 'payment_method':'momo','paid':0,'timestamp':datetime.datetime.now().isoformat(),
 'items':[{'sku':'DR001','name':'CA PHE MITSU','qty':1,'price':94000,'modifiers':{}}],
 'metadata':{'short_code':'QX7','notes':''}}
printlib.build_receipt_raster(don, show_total=True)
ps=grab['p']; W=ps[0].width; H=sum(p.height for p in ps)
s=Image.new('L',(W,H),255); y=0
for p in ps: s.paste(p,(0,y)); y+=p.height
s.resize((W*2,H*2),Image.NEAREST).save('/tmp/bill.png'); print('/tmp/bill.png')
"
```
