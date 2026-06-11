# Watchdog — cảnh báo điện thoại báo ngân hàng tắt app

> Listener thanh toán chạy trên **1 điện thoại Android riêng** (MacroDroid đọc thông báo OTT Vietcombank → webhook `bank_notification`). KHÔNG gộp với màn signage.
> Watchdog này phát hiện khi điện thoại tắt app / mất mạng và **báo Telegram cho chủ**, để đơn chuyển khoản không bị "ngừng tự gạch nợ trong âm thầm".

## Cơ chế

```
[Điện thoại] MacroDroid macro "mỗi 10 phút" → GET ?action=payment_heartbeat&token=<TOKEN>
        │                                              │
        │                                   GAS: recordPaymentHeartbeat()
        │                                   → CONFIG.PAYMENT_LISTENER_LAST_SEEN = now
        ▼
[GAS trigger 15 phút] checkPaymentListenerWatchdog()
   nếu (giờ 6:00–23:00) và (im > 25 phút) và (chưa báo)
   → Telegram "⚠️ điện thoại có thể đã tắt app…"  + đặt cờ ALERTED
   khi điện thoại ping lại → "✅ hoạt động lại" + xoá cờ
```

Code: `gas/Payment.gs` (recordPaymentHeartbeat · checkPaymentListenerWatchdog · installPaymentWatchdogTrigger · getPaymentListenerStatus). Route: `gas/Code.gs` action `payment_heartbeat`.
Tham số (sửa ở đầu khối WATCHDOG trong Payment.gs): `PAYMENT_HEARTBEAT_SILENCE_MIN=25`, giờ `6–23`.

## Cài đặt (làm 1 lần)

### 1. Deploy GAS
```
cd gas && clasp push
```
Apps Script editor → Deploy → Manage deployments → Edit → New version.

### 2. Cài trigger watchdog
Apps Script editor → chọn hàm `installPaymentWatchdogTrigger` → Run (cấp quyền nếu hỏi). Tạo trigger 15 phút/lần. Kiểm tra ở tab Triggers (đồng hồ) thấy `checkPaymentListenerWatchdog` mỗi 15 phút.

### 3. Macro nhịp tim trên điện thoại (MacroDroid)
Trên ĐÚNG điện thoại đang chạy listener:
- **Trigger:** Regular Interval → mỗi **10 phút**.
- **Action:** HTTP Request (GET) →
  `https://<GAS_URL>/exec?action=payment_heartbeat&token=<REPORT_API_TOKEN>`
  (TOKEN = đúng giá trị `CONFIG.REPORT_API_TOKEN`).
- Lưu, bật macro.

> Đây là macro THỨ HAI, độc lập với macro đọc thông báo ngân hàng đã có.

### 4. Chống MacroDroid bị Android giết (quan trọng)
Trên điện thoại: Settings → Battery → MacroDroid = **Không tối ưu pin / Unrestricted**; bật **persistent notification** của MacroDroid; whitelist khỏi mọi task-killer. (Cùng cấu hình áp cho cả macro đọc thông báo ngân hàng.)

## Kiểm thử

- Gọi tay: `curl "https://<GAS_URL>/exec?action=payment_heartbeat&token=<TOKEN>"` → `{"ok":true}`; CONFIG có `PAYMENT_LISTENER_LAST_SEEN` mới.
- Giả lập mất tín hiệu (trong giờ mở cửa): sửa tạm `PAYMENT_HEARTBEAT_SILENCE_MIN` xuống `0`, chạy tay `checkPaymentListenerWatchdog` trong editor → phải nhận Telegram cảnh báo. Trả lại `25` sau khi test.
- Ping lại 1 cái → lần chạy watchdog kế hoặc heartbeat kế phải gửi "✅ hoạt động lại".

## Lưu ý
- Trigger 15 phút tuân thủ luật "không trigger < 15 phút" (CLAUDE.md §4).
- Ngoài giờ 6:00–23:00 watchdog im (điện thoại có thể tắt khi đóng quán) → không báo nhầm ban đêm.
- Nâng cấp tương lai bỏ hẳn điện thoại: chuyển nguồn `bank_notification` sang webhook đám mây (SePay/Casso) — khi đó watchdog này không còn cần.
