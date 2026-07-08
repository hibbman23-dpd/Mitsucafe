<!-- ns: insight -->
# RFM Segmentation in F&B

RFM (Recency, Frequency, Monetary) là mô hình phân khúc khách hàng kinh điển dựa trên hành vi tiêu dùng thực tế. Trong ngành F&B (đặc biệt là quán cà phê như {{shop.name}}), RFM được áp dụng để chia khách hàng thành các nhóm nhằm thực hiện các chiến dịch chăm sóc, ưu đãi cá nhân hóa hiệu quả.

## Các chỉ số chính
- **Recency (R - Lần mua gần nhất):** Số ngày tính từ đơn hàng cuối cùng của khách đến hiện tại. R càng nhỏ chứng tỏ khách hàng càng gắn kết.
- **Frequency (F - Tần suất mua):** Tổng số đơn hàng khách đã mua. F càng cao chứng tỏ khách hàng càng trung thành.
- **Monetary (M - Tổng chi tiêu):** Tổng số tiền khách hàng đã thanh toán. M giúp xác định giá trị vòng đời của khách hàng.

## 5 Phân khúc khách hàng cốt lõi
1. **Champions (Khách hàng tinh hoa):**
   - *Đặc điểm:* Rất mới (R nhỏ), mua cực kỳ thường xuyên (F lớn) và chi tiêu nhiều (M lớn).
   - *Hành động:* Tặng quà tri ân đặc biệt, mời thử món mới miễn phí, làm đại sứ thương hiệu.
2. **Loyal (Khách hàng trung thành):**
   - *Đặc điểm:* Mua thường xuyên và chi tiêu tốt. R có thể vừa phải.
   - *Hành động:* Gửi chương trình tích điểm stamp card, gửi ưu đãi vào ngày vàng, khảo sát lấy ý kiến.
3. **Promising (Khách hàng tiềm năng):**
   - *Đặc điểm:* Khách hàng mới mua gần đây, tần suất chưa cao nhưng giá trị đơn hàng tốt.
   - *Hành động:* Tặng mã giảm giá cho đơn hàng tiếp theo để nâng tần suất mua (F), hướng dẫn theo dõi Zalo OA.
4. **Hibernating (Khách hàng ngủ đông):**
   - *Đặc điểm:* Đã rất lâu không quay lại (R lớn), trước đó tần suất và chi tiêu ở mức trung bình.
   - *Hành động:* Gửi chiến dịch "Winback" (Nhớ bạn) kèm voucher giảm giá mạnh trong thời gian ngắn để đánh thức.
5. **Lost (Khách hàng đã mất):**
   - *Đặc điểm:* Rất lâu không quay lại (R cực lớn), chi tiêu và tần suất cực thấp.
   - *Hành động:* Thường không ưu tiên chi phí tiếp thị trực tiếp, có thể gửi tin nhắn quảng bá diện rộng khi có sự kiện lớn.

## Kỷ luật hành động
- Chỉ cập nhật phân khúc RFM hàng tuần (curator loop) hoặc khi có yêu cầu đặc biệt.
- Mọi chiến dịch Winback nhắm vào nhóm **Hibernating** phải giới hạn số lần tiếp cận (tối đa 3 lần/năm) để tránh làm phiền khách và gây spam.
