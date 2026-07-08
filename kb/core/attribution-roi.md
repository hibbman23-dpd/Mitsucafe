<!-- ns: insight -->
# Đối soát và Tính toán ROI (Attribution & ROI)

Để đo lường hiệu quả thực tế của các chiến dịch Marketing, quán {{shop.name}} áp dụng mô hình đối soát đơn hàng (Attribution) để ghi nhận doanh thu và tính toán lợi nhuận thu về trên từng chi phí đầu tư.

## 2 Phương thức đối soát đơn hàng (Attribution)
1. **UTM Last-Click (Khung thời gian 72 giờ):**
   - *Nguyên tắc:* Nếu đơn hàng có chứa mã `utm_campaign` trùng khớp với `utm_tag` hoặc `campaign_id` của bài đăng trong vòng 72 giờ kể từ khi khách bấm link đến khi tạo đơn, ghi nhận toàn bộ doanh thu đơn hàng cho bài đăng đó.
   - *Độ ưu tiên:* Đây là phương thức có độ ưu tiên cao nhất vì nó chứng minh trực tiếp hành vi bấm link mua hàng.
2. **Phone-Match Attribution (Khung thời gian 7 ngày):**
   - *Nguyên tắc:* Sử dụng bảng đối chiếu khách hàng (`customers_social`) để khớp Số điện thoại khách mua (`customer_id` của đơn hàng) với ID mạng xã hội của họ (`fb_psid`, `ig_igsid`, `zalo_id`). Nếu khách hàng có tương tác với bài đăng trên cùng nền tảng trong vòng 7 ngày trước ngày tạo đơn, ghi công doanh thu cho bài đăng tương tác gần nhất đó.
   - *Độ ưu tiên:* Sử dụng làm fallback nếu đơn hàng không có mã UTM.

## Cách tính toán Tài chính
- **Lợi nhuận gộp (Lãi gộp):**
  `Lãi gộp = Doanh thu đơn hàng - COGS (Giá vốn nước/bánh) - Discount (Số tiền giảm giá/khuyến mãi)`
- **Lãi ròng chiến dịch (Campaign Net Profit):**
  `Lãi ròng chiến dịch = Tổng Lãi gộp của các đơn hàng được ghi công - Chi phí chạy bài viết (cost_vnd)`
- **ROI Chiến dịch (Return on Investment):**
  `ROI = (Lãi ròng chiến dịch / Chi phí chạy bài viết) * 100%`
  - Nếu chi phí chạy bài viết bằng 0 (organic post) và lãi gộp > 0, ROI được ghi nhận là vô cực (chỉ số hiệu quả tuyệt đối).
