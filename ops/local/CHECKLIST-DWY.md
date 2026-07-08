# Sổ Tay Nghiệm Thu & Vận Hành Hermes Local (Tier DWY)

Tài liệu này cung cấp checklist 12 điểm giúp kỹ thuật viên nghiệm thu hệ thống sau khi setup xong trên máy macOS của khách hàng.

## Nhóm 1: Pipeline & Dữ liệu (P1)
- [ ] **1. Kéo dữ liệu (Pull OK):** Thư mục `local/data/latest/` được tạo và chứa đầy đủ 5 file CSV (`ORDERS.csv`, `WASTE_LOG.csv`, `CUSTOMERS.csv`, `MENU.csv`, `CONFIG.csv`).
- [ ] **2. Tính toàn vẹn (Freshness OK):** Chạy `python3 ops/local/freshness_check.py` không báo lỗi, và nhận diện đúng ngày nghỉ/ngày hoạt động dựa trên `QUAN.yaml`.
- [ ] **3. Cronjob tự động:** LaunchAgent `cafe.local.pull.plist` được đăng ký trong hệ thống (`launchctl list | grep cafe.local.pull`) và tự động ghi đè log lỗi vào `local/pull.err.log`.

## Nhóm 2: RAG & Trích xuất Tri thức (P2)
- [ ] **4. Phân tách Corpus:** Các tài liệu core thuộc về F&B chung (`kb/core/`) không chứa thông tin riêng tư của quán, các tài liệu shop (`kb/shop/`) đã được render đúng thông tin của quán lấy từ `QUAN.yaml` và `MENU.csv`.
- [ ] **5. Indexing Nguyên tử (Atomic Build):** Chạy `node ops/local/kb_build.js` thành công dưới 10 phút, ghi đè an toàn vào `local/kb-index.json` mà không gây gián đoạn cho truy vấn song song.
- [ ] **6. Tìm kiếm Ngữ nghĩa (Query OK):** Chạy `node ops/local/kb_query.js "Món Stars"` trả về kết quả khớp với độ tương tự (similarity score) > 0.6 từ tài liệu `menu-engineering.md`.

## Nhóm 3: Phân tích & Duyệt quyết định (P3 & P4)
- [ ] **7. Xác thực dữ liệu phân tích (Evidence Validation):** File brief gửi Telegram sáng 07:00 chứa đầy đủ cỡ mẫu `n` và trace nguồn dữ liệu cụ thể dạng `(n=..., nguồn=ORDERS:...)` chứ không phỏng đoán tự do.
- [ ] **8. Chống Injection:** Đã thử nghiệm chèn text độc hại (Prompt Injection) vào cột ghi chú của đơn hàng và xác nhận LLM không bị dắt mũi làm thay đổi luật chơi.
- [ ] **9. Vòng lặp phê duyệt (Approval Loop):** Bấm nút `👍 Đồng ý` hoặc `👎 Từ chối` trên Telegram làm thay đổi trạng thái tin nhắn gốc và ghi nhận đồng bộ kết quả về Cloudflare Worker KV.
- [ ] **10. Chuyển đổi bộ nhớ (Staged Memory):** Khi chạy `pull_approvals.py`, các quyết định đồng ý được chuyển vào `decision_log.jsonl`, và các pattern được đẩy lên `confirmed_patterns.jsonl` để đưa vào chu kỳ re-index RAG tiếp theo.

## Nhóm 4: Đo lường & An toàn (P5 & P6)
- [ ] **11. Kiểm thử tự động (Eval OK):** Chạy `python3 eval/run_eval.py` đạt 100% tỷ lệ đỗ ở nhóm Canary (Hallucination Guard) và >= 90% ở nhóm Core/Shop.
- [ ] **12. Dead-Man Switch Alert:** Giả lập tắt mạng hoặc làm nghẽn job trong 26 giờ, Cloudflare Worker tự động bắn cảnh báo im lặng lên Telegram: `🚨 [Mac Mini Cảnh báo im lặng]`.
