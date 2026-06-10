# Campaign Promo (v2)
> Tách từ CLAUDE.md §12. Index: ../../CLAUDE.md · Đọc khi đụng checkAndRunCampaigns / isCampaignActiveNow / scheduling.

**Quan trọng**: Không còn trigger 8am mỗi ngày. Dùng 15-phút interval + `isCampaignActiveNow()`.

```
schedule_type values:
  one_time → Chạy 1 lần: start_date + start_time → end_time
  weekly   → Lặp theo thứ: days_of_week (Mon,Fri,Sat) + khung giờ
  daily    → Mỗi ngày trong date range + khung giờ

Ví dụ campaigns:
  Happy Hour T6-T7  | weekly | Fri,Sat | 14:00–17:00 | -15%
  Khai trương       | one_time | 2025-06-01 | 09:00–21:00 | -20%
  Combo sáng        | daily | * | 07:00–10:00 | BOGO croffle

GAS trigger: checkAndRunCampaigns() mỗi 15 phút
  → getActiveCampaigns() → filter is_active = TRUE
  → isCampaignActiveNow(c) → check date + day + time
  → shouldBeActive XOR currentlyRunning → startCampaign / endCampaign
```
