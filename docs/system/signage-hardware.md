# Signage Hardware Runbook
> Tài liệu này: cài đặt Android box kiosk + TV cho màn quảng cáo mặt tiền (`/signage`).
> Index: ../../CLAUDE.md

## Mục tiêu

Màn hình 16:9 (TV Full HD/4K) chạy liên tục 6:00–23:00, hiển thị trang `/signage`.
Page tự động xoay cảnh, poll config mỗi 60s, render được offline từ cache.

---

## Phần cứng khuyến nghị

| Thiết bị | Gợi ý | Ghi chú |
|----------|-------|---------|
| Android TV Box | Xiaomi Mi Box S / NVIDIA Shield / bất kỳ Android 8+ | RAM ≥ 2 GB |
| TV | Full HD hoặc 4K, HDMI-CEC hỗ trợ | Tắt sleep/screensaver |
| Smart plug (tuỳ chọn) | TP-Link Kasa EP25 / Sonoff | Lịch bật/tắt tự động |
| WiFi | 2.4 GHz hoặc 5 GHz, kết nối ổn định | Page tolerate offline |

---

## A. Cài đặt Fully Kiosk Browser (Android Box)

1. Tải **Fully Kiosk Browser** từ Google Play (hoặc APK chính thức: fullykiosk.com).
2. Mở app → vào **Settings** (biểu tượng ≡).

### Web Content
| Setting | Giá trị |
|---------|---------|
| Start URL | `https://kaerukaphe.kaerukaphe.workers.dev/signage` |
| Reload on URL error | **ON** (tự reload khi mất kết nối) |
| Auto Reload Page (seconds) | `3600` (reload mỗi 1 giờ — phòng memory leak) |

### Device Management
| Setting | Giá trị |
|---------|---------|
| Start on Boot | **ON** |
| Launch on Intent | **ON** |
| Relaunch on Crash | **ON** |
| Keep Screen On | **ON** |
| Keep Screen On While Plugged | **ON** |
| Screensaver | **OFF** |

### Kiosk Mode
| Setting | Giá trị |
|---------|---------|
| Enable Kiosk Mode | **ON** |
| Hide Navigation Bar | **ON** |
| Hide Status Bar | **ON** |
| Show Home Button | **OFF** |
| Allow screen off on power button | **OFF** |

### Multimedia
| Setting | Giá trị |
|---------|---------|
| Allow Autoplay Media | **ON** (cần cho video YouTube scene) |
| Mute | **ON** (màn hình mặt tiền không cần âm thanh) |

---

## B. Cài đặt TV

1. **HDMI-CEC**: Bật (`Anynet+` trên Samsung / `Simplink` trên LG / `BRAVIA Sync` trên Sony).
   Cho phép Android box bật/tắt TV qua lệnh phần mềm nếu cần.
2. **Sleep / Auto-off**: Tắt hoàn toàn (`Settings → General → Auto Power Off → OFF`).
3. **Screensaver**: Tắt.
4. **Độ sáng**: Tối đa (màn ngoài trời / mặt tiền cần sáng để thấy sau kính).
5. **Picture Mode**: `Vivid` hoặc `Dynamic` cho ánh sáng ban ngày; `Standard` buổi tối.

---

## C. Smart Plug (tuỳ chọn)

Nếu muốn TV + box tự tắt sau giờ đóng cửa và bật trước khi mở cửa:

```
Lịch gợi ý:
  05:45  ON  — khởi động trước 6:00
  23:15  OFF — tắt sau đóng cửa 23:00
```

Dùng app TP-Link Kasa / Sonoff eWeLink để đặt lịch.
Lưu ý: Android box sẽ boot và tự mở Fully Kiosk khi có điện (Start on Boot = ON).

---

## D. WiFi & Offline

- Kết nối box cùng mạng WiFi quán (hoặc dây LAN nếu có).
- Page `/signage` cache config vào `localStorage` → **render được offline** khi mất mạng tạm thời.
- Khi online trở lại, trang tự poll lại GAS config.
- `window.online` event trigger reload nếu queue trống (xử lý kịch bản cold-start offline).
- **4:00 sáng**: page tự `location.reload()` — làm sạch memory và lấy config mới.

---

## E. Kiểm tra sau khi cài

```
1. Bật box → Fully Kiosk tự mở → xem URL bar biến mất (Kiosk Mode)
2. Màn hình hiển thị ukiyo-e stage, xoay cảnh sau ~11s
3. QR góc phải dưới: quét bằng điện thoại → mở trang đặt món
4. Thử ngắt WiFi → trang vẫn hiện cảnh từ cache
5. Cắm lại WiFi → sau 60s, trang poll lại config
6. Tắt nguồn box → cắm lại → Fully Kiosk tự mở (Start on Boot)
```

---

## F. Điều chỉnh nội dung

Mọi thay đổi nội dung (cảnh, combo, thông báo, video YouTube) thực hiện qua **Dashboard → tab Màn hình**.
Màn quảng cáo cập nhật trong vòng 60 giây mà không cần chạm vào box.
