# Sổ bán hàng cho thuế

> Index: `../../CLAUDE.md` · Đọc khi sửa `gas/SoBanHang.gs` hoặc tab SO_BAN_HANG / TONG_THANG.

Hai tab dựng từ `ORDERS`, phục vụ việc kê khai thuế:

| Tab | Nội dung |
|---|---|
| `SO_BAN_HANG` | mỗi đơn một dòng: ngày, giờ, mã đơn, bàn, nội dung món, số ly, thành tiền, phương thức, kênh |
| `TONG_THANG` | mỗi tháng một dòng: số đơn, doanh thu, tiền mặt, chuyển khoản/QR, trung bình mỗi đơn |

## Vì sao KHÔNG sắp xếp lại chính tab ORDERS

`ORDERS` là bảng **append-only** — nguyên tắc bất biến trong `CLAUDE.md`. Toàn bộ hệ thống
đọc nó: in tem, in bill, poller Mac Mini, đối soát két, báo cáo tài chính, chấm công. Nhiều
chỗ còn đọc theo **số thứ tự cột** (`row[12]` = status, `row[20]` = label_printed_at). Đổi thứ
tự hay bỏ cột là gãy dây chuyền, và gãy im lặng.

Hai tab này là **bản đọc**, dựng lại được bất cứ lúc nào, không bao giờ là nguồn sự thật.

## Doanh thu tính đơn nào

Chỉ đơn **`status = DELIVERED`** và **`payment_status = PAID`** và **`total > 0`**.

Bỏ qua: đơn huỷ, đơn chưa thu tiền, đơn tách, và đơn rỗng (in sai bill rồi huỷ — quán có
khoảng 1-9 đơn dạng này mỗi ngày, không phải lỗi).

Số dòng bỏ qua được trả về trong `skipped` để đối chiếu.

## Cách chạy

Trong GAS editor, chạy `buildSoBanHang()` — dựng lại toàn bộ.

Lọc theo khoảng ngày:

```javascript
buildSoBanHang({ from: '2026-08-01', to: '2026-08-31' })
```

Hoặc qua route (cần token admin):

```
POST { "action": "so_ban_hang", "from": "2026-08-01", "to": "2026-08-31" }
```

Chạy lại bao nhiêu lần cũng ra kết quả như nhau — hàm xoá sạch tab rồi ghi lại từ đầu.

## Chi tiết dễ sai

- **Tra cột theo TÊN**, không theo số thứ tự. `ORDERS` có 24 cột và từng được thêm cột giữa
  chừng; hardcode chỉ số là lỗi âm thầm chờ sẵn. Thiếu cột bắt buộc thì hàm trả lỗi rõ ràng
  chứ không ghi sổ sai.
- Cột **Mã hệ thống** giữ `order_id` đầy đủ để đối chiếu ngược với `ORDERS`, nhưng được **ẩn**
  cho đỡ rối mắt. Cần thì bỏ ẩn.
- Múi giờ cố định `Asia/Ho_Chi_Minh` khi định dạng ngày/giờ/tháng.
- `items_json` hỏng thì ghi "(không đọc được danh sách món)" và đếm 0 ly — không ném lỗi làm
  hỏng cả sổ.
