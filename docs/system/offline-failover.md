# Offline & Failover (4 cấp)
> Tách từ CLAUDE.md §10. Index: ../../CLAUDE.md · Đọc khi xử lý SOP mất mạng / Mac crash / cúp điện.

## L1 — Mất mạng < 5 phút
```
Trigger: Router reset, chập chờn
Action:  Glide cache offline · Mac Mini queue in local · GAS auto-sync khi về
Fix:     Tự động — không cần can thiệp
```

## L2 — Mất mạng > 5 phút
```
Trigger: Cúp mạng, ISP lỗi
Action:  Chrome Form cache nhận đơn nội bộ
         In tem qua LAN (internet down nhưng LAN vẫn OK)
         Ghi tay giấy A5 nếu cần
Fix:     Sync Chrome Form → Sheets khi mạng về (< 5 phút)
```

## L3 — Mac Mini crash
```
Trigger: macOS crash, quá nhiệt
Action:  Tablet KDS thành thiết bị chính tạm
         In tem từ máy in cắm trực tiếp tablet (USB OTG)
         GAS vẫn online nếu mạng ổn (GAS = Google Cloud)
Fix:     Mac Mini auto-restart < 2 phút
Phòng:   Tắt auto-update macOS · Bật auto-restart after power failure
Long:    RPi 3+ thay Mac Mini (không bao giờ tự update)
```

## L4 — Cúp điện
```
Trigger: Mất điện hoàn toàn
Action:  Pin dự phòng cho tablet · Form giấy A5 laminated
         Gọi điện báo khách delivery đang chờ
Fix:     Nhập lại Sheets thủ công khi có điện
```

## SOP Offline (In laminated, dán tại quầy)
```
1. Mạng chết     → Chrome Form cache · In tem LAN
2. Không in được → Marker trên giấy A5 · Dán lên ly
3. Mạng về       → Sync Form → Sheets
4. Mac crash     → Tắt nguồn 10s → bật lại · Nhắn chủ qua Zalo
5. Tất cả crash  → Giấy A5 + bút · Gọi chủ ngay
```
