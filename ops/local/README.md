# Hermes Local Self-Improving Insight System (macOS)

Hệ thống phân tích dữ liệu F&B và tự học cục bộ (chạy bằng Ollama + RAG 2 lớp + Staged Memory duyệt qua Telegram).

## Cấu trúc thư mục vận hành
```
lamha-kissaten/
├── QUAN.yaml                 # Cấu hình chính của quán (ngưỡng phân tích, closed days, v.v.)
├── local/                    # Chứa dữ liệu cục bộ (được gitignore trừ secrets)
│   ├── secrets/
│   │   └── sa.json           # Google Service Account Key (chỉ đọc)
│   ├── data/
│   │   ├── YYYY-MM-DD/       # Bản lưu dữ liệu kéo về theo ngày
│   │   └── latest/           # Symlink trỏ đến ngày mới nhất (ORDERS.csv, MENU.csv, v.v.)
│   ├── memory/               # Git repo riêng quản lý bộ nhớ
│   │   ├── quarantine.jsonl  # Bộ nhớ tạm chờ duyệt
│   │   ├── confirmed_patterns.jsonl # Tri thức đã xác nhận (được đưa vào RAG)
│   │   └── decision_log.jsonl # Nhật ký quyết định đã duyệt và đối soát sau 14 ngày
│   └── kb-index.json         # Chỉ mục vector RAG cục bộ
├── kb/                       # Nguồn tri thức dạng Markdown
│   ├── core/                 # Tri thức chung F&B (RFM, Menu Engineering...)
│   │   └── sop/              # SOP quy trình quầy pha chế
│   └── shop/                 # Tri thức riêng của quán (render tự động từ QUAN.yaml + MENU)
├── eval/                     # Tập đánh giá kiểm thử chất lượng (Golden Questions)
└── ops/local/                # Mã nguồn kịch bản vận hành
```

## Luồng vận hành hằng ngày (Daily Cron)

1. **23:00 - Kéo dữ liệu:** `sheets_pull.py` kéo các bảng tính từ Google Sheets về `local/data/YYYY-MM-DD/` và tạo symlink `latest`.
2. **00:00 - Kiểm tra freshness:** `freshness_check.py` kiểm tra xem dữ liệu có được đồng bộ đầy đủ và không bị giảm dòng bất thường.
3. **07:00 - Phân tích & Gửi báo cáo sáng:** `insight_batch.py` chạy phân tích RAG + dữ liệu hôm qua, gửi brief lên Telegram. Các quyết định đề xuất được đưa vào quarantine.
4. **07:05 - Gửi yêu cầu duyệt:** `send_approval.py` quét quarantine và gửi tối đa 3 đề xuất duyệt lên Telegram của chủ quán kèm nút chọn 👍/👎.
5. **Hằng giờ (08:00 - 21:00) - Đồng bộ duyệt:** `pull_approvals.py` kéo ý kiến phản hồi của chủ từ Cloudflare Worker KV, chuyển trạng thái duyệt vào `decision_log` hoặc `confirmed_patterns`.

## Luồng vận hành hằng tuần (Weekly Cron)

- **Thứ Hai 07:30 - Tổng kết tuần & Tối ưu:** `weekly_digest.py` thực hiện:
  - Decay bộ nhớ (loại bỏ quarantine hết hạn, hạ cấp confirmed ít hits).
  - Đối soát hiệu quả tài chính các quyết định duyệt từ 14 ngày trước (so sánh doanh thu trước/sau).
  - Viết tóm tắt tuần bằng LLM gửi Telegram.
  - Re-build index RAG cục bộ.
  - Chạy `run_eval.py` kiểm định an toàn và tự động FREEZE nếu chất lượng đi xuống.

## Lệnh vận hành tay (Manual)

### Re-build chỉ mục RAG cục bộ:
```bash
node ops/local/kb_build.js
```

### Tìm kiếm ngữ nghĩa trong KB:
```bash
node ops/local/kb_query.js "Ngưỡng Stars" --ns=insight --k=3
```

### Chạy đánh giá kiểm thử chất lượng hệ thống:
```bash
.venv/bin/python3 eval/run_eval.py
```
