<!-- ns: insight -->
# Quy tắc Quyết định: SCALE / KILL / ITERATE

Mọi quyết định hành động tại quán {{shop.name}} dựa trên dữ liệu phải tuân thủ nghiêm ngặt các quy tắc thống kê mẫu nhỏ để tránh rủi ro do nhiễu số liệu.

## Thang Đo Độ Tin Cậy (Confidence Level)
Trước khi đưa ra bất kỳ kết luận nào về hoạt động Marketing hay hiệu suất món ăn uống, hệ thống phải xác định độ tin cậy dựa trên kích thước mẫu (clicks và đơn được ghi nhận):
- **LOW (Thấp):** Số clicks < 30 HOẶC số đơn ghi công < 3.
  - *Giải nghĩa:* Tín hiệu quá mỏng để kết luận. Dữ liệu dễ bị nhiễu.
- **MEDIUM (Trung bình):** Số clicks 30–100 VÀ số đơn 3–10.
  - *Giải nghĩa:* Tín hiệu có giá trị tham khảo tốt.
- **HIGH (Cao):** Số clicks > 100 VÀ số đơn > 10.
  - *Giải nghĩa:* Tín hiệu cực kỳ rõ ràng, độ chính xác cao.

## Quy tắc Quyết định
1. **SCALE (Đẩy mạnh):**
   - *Áp dụng:* Đẩy thêm ngân sách quảng cáo, đưa lên trang nhất, nhập thêm nguyên liệu số lượng lớn.
   - *Điều kiện cứng:* Chỉ áp dụng khi `confidence` đạt mức `MEDIUM` hoặc `HIGH`. **TUYỆT ĐỐI CẤM SCALE KHI CONFIDENCE LÀ LOW.**
2. **KILL (Tạm bỏ/Dừng):**
   - *Áp dụng:* Dừng chiến dịch quảng cáo, gỡ món ra khỏi thực đơn, dừng khung giờ vàng hoạt động kém.
   - *Điều kiện cứng:* Chỉ đề xuất khi cỡ mẫu nghiên cứu `n >= min_sample_per_pattern` (mặc định n = 30 giao dịch hoặc 3 chu kỳ lặp lại liên tiếp). Nếu `n` chưa đạt ngưỡng, cấm dùng từ "KILL", chỉ được ghi nhận là "tín hiệu sớm để quan sát thêm".
3. **ITERATE (Sửa lại/Cải tiến):**
   - *Áp dụng:* Điều chỉnh nội dung bài đăng, thay đổi hình ảnh thiết kế, chỉnh sửa nhẹ công thức món.
   - *Điều kiện:* Áp dụng khi bài viết có tương tác rất tốt (like/share/save cao) nhưng tỷ lệ chuyển đổi ra đơn kém (do thời tiết bất lợi như mưa Lâm Hà hoặc do giá bán chưa hấp dẫn).

## Định nghĩa chỉ số tài chính
- **Giá trị đơn hàng trung bình (AOV - Average Order Value):**
  `AOV = Doanh thu tổng cộng / Số đơn hàng thành công`
  - *Ý nghĩa:* Dùng để đánh giá mức chi tiêu trung bình của một khách hàng trên một giao dịch thành công tại quán.
