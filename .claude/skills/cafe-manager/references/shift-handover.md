# Reference — Shift Handover (Bàn giao ca)

> Skip nếu solo operator (1 người mở + đóng). Active khi có nhân viên.

## Khi nào cần handover

- Có >1 ca/ngày với người khác nhau
- Chủ quán off → nhân viên đóng quán
- Sang ca có món/promo đặc biệt cần note
- Có incident cần follow up (review xấu, máy hỏng tạm, khách phàn nàn)

## Handover note template

```markdown
# Bàn giao ca <chieu→toi> - DD/MM/YYYY HH:MM

**Bàn giao**: <staff_id leaving>
**Nhận**: <staff_id incoming>

## 💰 Cash status
- Closing đếm: <X.XXX.XXXđ>
- Variance: <±X.XXXđ> (<ok/warn/alert>)
- Float bàn giao: <500.000đ default>

## 📦 Inventory low / out
- Trân châu đường đen: 1.5kg (vừa cảnh báo, đặt 5kg mai)
- Sữa tươi: 2L (mai 8h vendor giao)
- (none nếu OK)

## 🔧 Equipment status
- Máy pha cà phê: backflush done lúc 14:30
- Máy đá: chạy ổn
- (issues nếu có: "máy đá kêu lạ — vendor sẽ ghé thứ Sáu")

## 📋 Promo / Campaign hiện chạy
- Happy hour matcha -15% đến 17:00 hôm nay
- Loyalty stamp campaign ongoing

## 📝 Customer note / Incident
- Anh Khôi (0903xxx): đặt 5 ly trà sữa pickup 19:00 — chưa lấy
- Khách review 4⭐ phàn nàn trà loãng (đã ghi REVIEWS_LOG, response drafted)
- (Issue cần follow up)

## 🎯 Việc cần ca tới làm
1. Đón đơn pickup anh Khôi 19:00
2. Closing checklist (xem opening-closing-checklist.md)
3. Log waste cuối ngày (gọi /huy)
4. Đóng cash ca tối (gọi /chot-ca)
5. Trả lời 1 review pending (xem REVIEWS_LOG)
```

## Workflow `/handover` (Phase D tuỳ chọn)

User nói "/handover" hoặc "bàn giao ca":
1. Skill load reference này
2. Pull current shift state:
   - CASH_LOG (latest open shift)
   - INVENTORY low/out
   - MAINTENANCE_LOG due/overdue today
   - Active promo (PROMOTIONS currently_running=TRUE)
   - Pending orders (ORDERS status≠DELIVERED)
   - Pending review responses
3. Render template → output
4. Hỏi user: "Push tóm tắt qua Telegram team không?"

## Phase MVP — solo operator

Solo operator: handover skip. Thay bằng:
- Cuối ngày `/sang` + `/chot-ca` → tự log
- Note ngày mai cần làm → ghi vào TodoMVP qua Telegram self-message

## Phase Have-staff — multi shift

3 ca/ngày, mỗi ca handover:
- `sang → chieu` lúc 14:00
- `chieu → toi` lúc 18:00
- `toi → close` lúc 22:00 (toi đóng quán)

Mỗi handover → render template + gửi Telegram cả 2 staff.

## Permission model

| Role | Can update? |
|---|---|
| Owner | All |
| Staff (cashier/barista) | CASH_LOG own shift, WASTE_LOG own shift, MAINTENANCE_LOG task assigned, REVIEWS_LOG comment only |
| Read-only (intern) | View only |

Implementation: STAFF.role field — GAS functions check role trước khi write.

## Anti-patterns

- ❌ Verbal handover không có note ghi (sai sót truyền miệng)
- ❌ Skip handover khi solo "vì 1 mình rồi"
- ❌ Handover thiếu cash variance
- ❌ Push hết note ra Zalo public (PII)
- ❌ Quên transfer pending pickup orders
- ❌ Không log incident → ca sau không biết
