# Campaign Promo (v2)
> Split from CLAUDE.md §12. Index: ../../CLAUDE.md · Read when touching checkAndRunCampaigns / isCampaignActiveNow / scheduling.

**Important**: No more fixed 8am daily trigger. Use 15-minute interval + `isCampaignActiveNow()`.

```
schedule_type values:
  one_time → Run once: start_date + start_time → end_time
  weekly   → Repeat by day: days_of_week (Mon,Fri,Sat) + time window
  daily    → Every day in date range + time window

Example campaigns:
  Happy Hour Fri-Sat  | weekly | Fri,Sat | 14:00–17:00 | -15%
  Grand opening       | one_time | 2025-06-01 | 09:00–21:00 | -20%
  Morning combo       | daily | * | 07:00–10:00 | BOGO croffle

GAS trigger: checkAndRunCampaigns() every 15 minutes
  → getActiveCampaigns() → filter is_active = TRUE
  → isCampaignActiveNow(c) → check date + day + time
  → shouldBeActive XOR currentlyRunning → startCampaign / endCampaign
```
