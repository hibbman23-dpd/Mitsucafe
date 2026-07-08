<!-- ns: sop -->
# Tem dán ly và Máy in (Labels & Printers)

Quy trình quản lý và vận hành máy in tem dán ly tại quán {{shop.name}}.

## Phần cứng vận hành
- **Mac Mini (hoặc Raspberry Pi):**
  - Đóng vai trò là Print Server nhận lệnh từ Google Apps Script và đẩy ra máy in qua cổng LAN (TCP 9100).
  - Phải luôn được bật 24/7, tắt chế độ Sleep và tắt cập nhật hệ điều hành tự động để tránh mất kết nối đột xuất.
- **Xprinter (máy in tem nhiệt):**
  - Sử dụng khổ tem cuộn 58mm hoặc 40x30mm để dán trực tiếp lên ly nước trước khi pha chế.

## Quy trình in tem dán ly
- Lệnh in tem tự động kích hoạt ngay khi đơn hàng chuyển sang trạng thái **CONFIRMED** (đã xác nhận).
- Nguyên tắc: **Mỗi ly tương ứng với 1 tem**. Nếu đơn hàng ghi số lượng (qty) = 2, máy in sẽ tự động in ra 2 tem giống nhau.
- Nhân viên pha chế bắt buộc phải dán tem lên ly trước khi bắt đầu làm đồ uống để tránh nhầm lẫn công thức/modifier.

## Xử lý sự cố máy in
- Nếu máy in không ra tem hoặc bị kẹt giấy, nhân viên pha chế sử dụng bút Marker để viết tay thông tin lên ly và tiến hành pha chế bình thường.
- Tuyệt đối không để khách hàng phải chờ đợi lâu vì sự cố máy in. Việc in lại (Reprint) có thể thực hiện thủ công từ Sheets khi máy in hoạt động bình thường trở lại.
