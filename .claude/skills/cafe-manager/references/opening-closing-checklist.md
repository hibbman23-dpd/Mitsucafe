# Reference — Checklist mở quán & đóng quán

> Output: checklist printable / Telegram-able. KHÔNG tự gửi — chỉ render.

## Mở quán (06:00 — 30 phút)

```
☐ Bật điện tổng + đèn signage (mặt tiền + biển hiệu)
☐ Bật POS / Glide tablet — verify GAS endpoint OK
☐ Mở Wi-Fi router (kiểm 4G backup nếu cần)
☐ Bật máy pha cà phê — flush 3s mỗi group head (xóa condensate)
☐ Bật máy nước nóng / boiler trà
☐ Bật máy đá — kiểm mực đá
☐ Tủ lạnh — kiểm nhiệt độ <5°C (sữa, milk foam)
☐ Tủ đông — kiểm nhiệt độ <-18°C
☐ Pha mẻ trà đầu tiên (matcha + hojicha base) — đánh dấu thời gian batch
☐ Pha mẻ trân châu đầu (60' shelf life ideal)
☐ Setup quầy: ly, ống hút, túi, napkin
☐ Vệ sinh nhanh quầy + bàn (khăn sạch + cồn 70%)
☐ Mở Bluetooth/loa — playlist quán
☐ Bật AC (nếu cần)
☐ Kiểm phòng vệ sinh — xà phòng, giấy, đèn
☐ Đặt biển "OPEN" + bảng menu chalk
☐ Mở app Telegram + nhận đơn online queue (nếu có order overnight)
☐ Đếm tiền float đầu ca (default 500.000đ) — gọi /chot-ca start
☐ Quick check: maintenance overdue qua `/bao-tri`
```

## Đóng quán (22:00 — 45 phút)

```
☐ Đóng order channels — ngừng nhận online qua Glide
☐ Hoàn tất các đơn còn lại
☐ Cộng dồn ca tối — gọi `/chot-ca close` nhập closing_actual
☐ Quan trọng: /huy nhập waste — trân châu, milk foam, trà ủ thừa
☐ Tủ lạnh:
   ☐ Đánh dấu lô mở (date + initial)
   ☐ Vứt items hết hạn (xem food-safety.md shelf-life table)
   ☐ FIFO: lô cũ ra trước
☐ Máy pha cà phê:
   ☐ Backflush mỗi group head — chemical (Cafiza or Pulycaff) 5 cycles
   ☐ Tháo basket + portafilter — rửa nóng
   ☐ Lau steam wand sạch tuyệt đối
   ☐ Lau panel ngoài (không xịt trực tiếp)
☐ Máy đá: kiểm đá thừa, đổ bớt nếu sắp full để tránh ép motor
☐ Blender: rinse + tháo blade rửa
☐ Quầy + bàn + ghế: lau cồn 70%
☐ Sàn: quét + lau, đặc biệt khu pha (đường dính)
☐ Rác: bỏ rác, thay túi
☐ Tắt máy pha cà phê (giữ boiler nếu power cycle gây stress)
☐ Tắt máy nước nóng, máy đá, blender
☐ Tắt loa, đèn trang trí
☐ Tắt AC
☐ Đếm két cuối ca — verify variance qua /chot-ca
☐ Cất tiền vào két lock / safe — chụp ảnh log nếu trên 5tr
☐ Tắt POS / Glide (giữ Wi-Fi)
☐ Khóa cửa sau + trước
☐ Lock biển hiệu / đặt biển "CLOSED"
☐ Gửi note bàn giao qua Telegram (nếu có ca sau / nhân viên khác)
```

## Frequency-based extras

### Mỗi T2 (Mon, đầu tuần)
- Tháo group head screen + gasket → ngâm cleaning solution 30'
- Lau inside fridge sâu
- Vứt thùng rác bin trong nhà bếp

### Mỗi T5 (Thu)
- Inventory mid-week — verify stock vs sheet
- Test máy đá: kiểm tốc độ sản xuất

### Mỗi T7 (Sat)
- Deep clean phòng vệ sinh
- Sạch sàn dùng máy chà
- Lau cửa kính (front)

### Mỗi tháng (ngày 1)
- Descale máy pha (nếu nước >5°dH)
- Vệ sinh máy đá toàn diện (gọi /bao-tri để check)
- Check filter lọc nước — log date

### Mỗi quý
- Professional service máy pha cà phê
- Thay filter lọc nước (3-6 tháng/lần tuỳ volume)

### Mỗi 6 tháng
- Thay group gasket + dispersion screen

## Adapt theo solo vs có staff

**Solo (current)**: 
- Mở quán + close quán cùng 1 người = ~75 phút/ngày tổng
- Khuyến nghị làm prep batch (pearl, tea base) trước giờ mở 30'
- Skip "shift handover" — chỉ note vào Telegram nếu cần nhớ mai

**Có staff (tương lai)**:
- Người mở khác người đóng → MUST gọi `shift-handover.md`
- Cash float đầu ca cho mỗi shift riêng
- 1 shift = 1 row CASH_LOG

## Output cho `/sang` integration

`/sang` chỉ load REMIND ngắn:
```
🌅 Checklist mở quán: [link reference]
⚠️ Skip nếu hôm qua đã làm: [3 task ẩn]
```

`/sang` KHÔNG render full 20-item list mỗi ngày — chỉ remind 3-5 item dễ quên.

## Telegram-able render

Khi user nói "Gửi checklist mở quán qua Telegram":
1. Render full list dạng `☐ task\n☐ task`
2. Cuối thêm dòng "Reply DONE khi hoàn thành" (optional follow-up)
3. KHÔNG tự gọi `sendTelegramAlert()` — output để user paste
