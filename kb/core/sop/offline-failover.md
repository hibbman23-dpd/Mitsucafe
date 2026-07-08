<!-- ns: sop -->
# Quy trình xử lý sự cố mất mạng và mất điện (Offline & Failover)

Quy trình ứng phó 4 cấp độ khi gặp sự cố kỹ thuật tại quầy của {{shop.name}}.

## Cấp độ 1: Mạng chập chờn (dưới 5 phút)
- **Triệu chứng:** Tablet hiển thị KDS quay vòng tròn, load chậm.
- **Hành động:** Hệ thống tự động lưu cache ngoại tuyến (Glide Cache). Nhân viên tiếp tục pha chế bình thường và đợi thiết bị tự kết nối lại.

## Cấp độ 2: Mất mạng hoàn toàn (trên 5 phút)
- **Triệu chứng:** Mất kết nối Internet từ nhà mạng.
- **Hành động:** 
  - Nhân viên mở **Chrome Form** (đã được lưu cache offline trên tablet) để tiếp tục nhập đơn hàng mới cho khách.
  - Máy in LAN vẫn có thể in tem nếu mạng nội bộ LAN còn hoạt động. Nếu không, viết tay thông tin lên ly.
- **Khôi phục:** Khi mạng có lại, nhân viên nhấn nút đồng bộ (Sync) trên Chrome Form để đẩy đơn lên Google Sheets.

## Cấp độ 3: Máy chủ Mac Mini bị crash
- **Triệu chứng:** Máy in tem dán ly không hoạt động, KDS không cập nhật trạng thái mới.
- **Hành động:** 
  - Tablet KDS sẽ trở thành thiết bị chính để xem đơn hàng.
  - Sử dụng dây USB OTG cắm trực tiếp từ máy in vào tablet để in tem nếu cần, hoặc viết tay thông tin lên giấy dán ly.
- **Khôi phục:** Tắt nguồn Mac Mini, đợi 10 giây rồi bật lại. Máy chủ được thiết lập tự khởi động Web server cùng hệ thống.

## Cấp độ 4: Cúp điện hoàn toàn
- **Hành động:**
  - Sử dụng pin dự phòng để duy trì tablet KDS.
  - Chuyển hoàn toàn sang ghi đơn bằng giấy A5 viết tay.
  - Điện thoại báo cho khách hàng đặt ship/delivery về sự cố chậm trễ do mất điện.
- **Khôi phục:** Nhập lại toàn bộ đơn hàng từ giấy A5 vào Google Sheets khi có điện trở lại.
