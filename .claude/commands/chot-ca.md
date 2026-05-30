---
description: Cash reconciliation — mở/đóng ca, Z-report, variance alert
---

Invoke skill `cafe-manager` với chế độ **cash-reconciliation**.

Workflow:
1. Skill load `references/cash-reconciliation.md`
2. Phát hiện mode từ `$ARGUMENTS`:
   - `open` / `start` → mở ca (gọi `startShift`)
   - `close` / không có / default → đóng ca (gọi `endShift`)
3. **Mở ca**:
   - Hỏi: shift (sang/chieu/toi), staff_id, opening_cash (default 500.000đ từ CONFIG)
   - Tạo CASH_LOG row mới
   - Output log_id + opened_at
4. **Đóng ca**:
   - Hỏi: closing_cash_actual (tiền thực đếm trong két)
   - Skill tính expected = opening + cash_orders - cash_expenses
   - variance = actual - expected
   - status: ok / warn / alert (threshold từ CONFIG)
   - Update CASH_LOG row
   - Output Z-report style summary:
     ```
     🧾 Đối soát ca <chieu> - 25/11/2026
     Tiền float đầu ca:    500.000đ
     + Cash orders (X đơn): X.XXX.000đ
     - Cash expenses:        XX.000đ
     ─────────────────────
     Expected closing:    X.XXX.XXXđ
     Actual count:        X.XXX.XXXđ
     ─────────────────────
     VARIANCE:               ±X.XXXđ  <ok/warn/alert>
     ```
5. Nếu **alert** (>50k) → Telegram chủ quán tự gửi qua `logError` throttle pattern

Mặc định:
- Date = today
- Shift auto-detect theo giờ hiện tại:
  - 6:00-14:00 → sang
  - 14:00-18:00 → chieu
  - 18:00-0:00 → toi
- Threshold từ CONFIG: CASH_VARIANCE_WARN_VND, CASH_VARIANCE_ALERT_VND
- Float default: DEFAULT_CASH_FLOAT_VND

Validation:
- KHÔNG mở ca trùng (date + shift) khi ca cũ chưa close
- closing_cash_actual >= 0
- Variance ngoài ±200.000đ → suggest verify trước khi confirm

User input optional: `$ARGUMENTS` có thể là "open sang 500000", "close 1700000", hoặc free-form.
