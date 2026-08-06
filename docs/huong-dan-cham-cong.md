# Hướng dẫn chấm công — Kissaten

Dành cho nhân viên và chủ quán. Không cần cài app.
(Tài liệu kỹ thuật cho người sửa code: `docs/system/attendance.md`)

---

# PHẦN 1 — NHÂN VIÊN

## Mở app

1. **Bật Wifi quán trước.** Dùng 4G sẽ không vào được, trình duyệt quay vòng rồi báo lỗi.
2. Quét QR dán ở quầy, hoặc mở trình duyệt gõ: `192.168.1.19:5001/cham-cong.html`
3. Muốn có icon ngoài màn hình chính: bấm Chia sẻ → "Thêm vào màn hình chính". Vẫn không phải cài app.

## Chấm công

Chạm tên mình → bấm 4 số PIN. **Đủ 4 số là tự gửi**, không có nút OK.

Màn hình báo lại:

| Thấy gì | Nghĩa là |
|---|---|
| `✅ Vào ca 07:02 · chào Sương` | Đã vào ca, giờ được ghi |
| `✅ Ra ca 15:40 · hôm nay 8h38` | Đã ra ca, hôm nay làm 8 tiếng 38 phút |

**Chỉ có một thao tác.** Hệ thống tự biết bạn đang vào ca hay ra ca, không bấm nhầm được.

Sau 3 giây màn hình tự quay về danh sách tên để người kế tiếp bấm luôn.

## Đầu màn hình

`Đang trong ca: 2` kèm tên — ai đang làm. Tự cập nhật 20 giây một lần.

## Ba tình huống hay gặp

**Băng đỏ "Mất kết nối máy quán"**
→ Bạn **CHƯA** chấm công được. Kiểm tra wifi. Nếu vẫn đỏ, báo chủ ngay, đừng bỏ qua.

**Hỏi "Ca ngày ... chưa đóng. Bạn muốn?"**
Hôm trước bạn quên bấm ra ca. Hai nút:
- **Ra ca hôm qua** — xác nhận ca hôm đó đã xong. Hệ thống **không tự đoán giờ**, chủ sẽ nhập giờ ra thật. Bấm xong bạn vẫn cần chạm tên lần nữa để vào ca hôm nay.
- **Vào ca mới** — bắt đầu ca hôm nay, ca cũ để chủ xử lý.

Chọn đúng thực tế. Màn này tự đóng sau 30 giây, người sau không bấm nhầm dưới tên bạn được.

**Hỏi "Mới vào ca vài phút trước. Ra ca luôn?"**
Bạn vừa vào ca chưa tới 3 phút. Chống chạm nhầm. Bấm nhầm tên người khác thì chọn có để đóng lại.

## Quên bấm ra ca

Báo chủ. Chủ nhập giờ ra thật giúp. **Hệ thống không bao giờ tự đoán giờ** — thà để trống chờ chủ còn hơn ghi số sai.

---

# PHẦN 2 — CHỦ QUÁN

## Mở bảng công

Cùng trang đó → bấm **Chủ quán** góc trên phải → nhập PIN của mình → hiện tab **Bảng công**.

Phiên tự hết sau 15 phút, và tự thoát nếu 10 phút không thao tác. PIN không bao giờ lưu trên máy.

## Đọc bảng công

Chọn kỳ: **Hôm nay / Tuần này / Tháng này**.

Bảng chính `tên · số ca · tổng giờ` — **chỉ đếm ca đã có giờ đầy đủ**. Không có giờ đoán, không có giờ ma.

Bảng dưới **Ca chưa đóng** (hàng đỏ) — những ca cần bạn nhập giờ:

| Ghi chú trên hàng | Nghĩa |
|---|---|
| (trống) | Nhân viên quên bấm ra, chưa nói gì |
| `nhân viên xác nhận đã ra ca — chờ chủ nhập giờ` | Nhân viên đã xác nhận, đang chờ bạn |
| `đồng hồ máy bị lùi` | Máy sai giờ, cần bạn nhập lại |

**Ca nằm trong bảng này chưa được tính công.** Nhập giờ xong nó mới vào tổng.

## Nhập giờ ra

Chạm **Nhập giờ ra** trên hàng đỏ → chọn **ngày** và **giờ** → ghi lý do → lưu.

Ô ngày quan trọng với ca qua đêm: ca vào 21:00 ngày 5, ra 02:00 thì phải chọn **ngày 6**.

## Thêm ca tay

Dùng khi nhân viên quên bấm **cả vào lẫn ra** (hoặc máy quán chết, chấm giấy).

Chọn tên → ngày vào + giờ vào → ngày ra + giờ ra → ghi lý do → lưu.

Ca qua đêm thì hai ô ngày khác nhau.

## Sửa của bạn đều có dấu vết

Mỗi lần sửa hoặc thêm tay đều ghi lại ai sửa, lúc nào, lý do gì. Không xoá được.

## Tin nhắn Telegram cuối ngày

Mỗi ngày một tin: tổng giờ từng người + danh sách ca chưa đóng. Số liệu lấy từ máy tại quán nên luôn đủ, kể cả lúc mạng đang chập chờn.

---

# PHẦN 3 — LẮP ĐẶT (làm một lần)

Bốn việc phải xong trước khi nhân viên dùng được:

### 1. Đặt IP tĩnh cho Mac Mini

Vào router, đặt DHCP reservation giữ `192.168.1.19` cho Mac Mini.

**Làm việc này TRƯỚC khi in QR.** Router cấp lại IP khác là QR chết, cả quán mất đường chấm công.

### 2. Cột `pin` trên sheet STAFF phải để định dạng TEXT

Chọn cột `pin` → Định dạng → Số → **Văn bản thuần tuý**.

Để định dạng Số thì Google Sheets nuốt số 0 đầu: PIN `0345` thành `345`, người đó **không đăng nhập được** và không hiểu tại sao.

### 3. Điền PIN cho từng người

Mỗi nhân viên một PIN 4 số trong cột `pin`. **Ô trống = người đó chưa chấm công được** (cố ý, để chặn tài khoản chưa cấu hình).

Cột `role` để `owner` cho chủ — chỉ người có `owner` mới mở được bảng công.

Đổi PIN thì sửa thẳng trên sheet, có hiệu lực sau tối đa 10 phút.

### 4. Đẩy code lên Google Apps Script

Chạy deploy, rồi chạy `ensureAttendanceSheet()` một lần trong GAS editor để tạo tab ATTENDANCE.

**Trước khi làm bước này**, chấm công vẫn chạy bình thường nhưng dữ liệu nằm trong máy tại quán, chưa lên Google Sheets. Không mất gì, chỉ là chưa xem được trên Sheets.

### In QR sticker

Link: `http://192.168.1.19:5001/cham-cong.html`

In kèm dòng chữ to: **"Bật Wifi quán trước khi quét"**

---

# PHẦN 4 — HỎNG THÌ LÀM SAO

| Hiện tượng | Xử lý |
|---|---|
| Băng đỏ "Mất kết nối máy quán" | Kiểm tra wifi điện thoại. Vẫn đỏ → Mac Mini có vấn đề, báo chủ |
| "Danh sách nhân viên chưa đồng bộ" | Máy quán chưa lấy được danh sách. Báo chủ kiểm tra mạng và token GAS |
| PIN đúng mà báo sai | Kiểm cột `pin` trên sheet có bị định dạng Số không (mất số 0 đầu) |
| "Nhập sai nhiều lần, thử lại sau" | Sai 5 lần trong 1 phút thì khoá 5 phút. Chờ hết giờ |
| Tên mình không có trên lưới | Chưa có PIN trên sheet, hoặc cột `active` để FALSE |
| Mac Mini chết cả ngày | Nhân viên ghi giờ ra giấy. Máy sống lại, chủ dùng **Thêm ca tay** nhập từng ca, ghi lý do "chấm giấy ngày ..." |
| Bảng công thiếu ngày gần nhất | Kiểm kỳ đang chọn. Nếu vẫn thiếu, báo người kỹ thuật |

## Ba điều hệ thống cố ý KHÔNG làm

1. **Không tự đoán giờ.** Quên bấm ra ca thì ca đó để trống chờ chủ, không lấy giờ đóng quán hay giờ đơn cuối làm giờ ra.
2. **Không nhận giờ từ điện thoại.** Mọi mốc giờ lấy từ máy tại quán. Chỉnh giờ điện thoại không ăn gian được.
3. **Không im lặng nuốt lỗi.** Chấm không được là báo băng đỏ ngay, không để nhân viên tưởng đã chấm xong.
