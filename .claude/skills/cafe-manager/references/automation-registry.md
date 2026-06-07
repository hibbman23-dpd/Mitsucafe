# Reference — Automation Registry (Source of truth cho tất cả scheduled jobs)

> Mở file này để xem NGAY hệ thống đang chạy gì, lúc nào, làm gì.
> Bật/tắt qua GAS UI (Triggers panel) hoặc `mcp__scheduled-tasks__update_scheduled_task`.

## Layer A — GAS Time-Triggers (server-side Apps Script)

### Existing (giữ nguyên — đã có sẵn)
| Job | When | Handler | Action | Status |
|---|---|---|---|---|
| Daily financials | 23:00 daily | `cronDailyFinancials` | Pull revenue/COGS + email báo cáo | ✅ Active |
| Campaign promo poller | mỗi 15' | `checkAndRunCampaigns` | Bật/tắt promo theo lịch | ✅ Active |

### Phase C — registered qua `setupOpsTriggers()`
| Job | When | Handler | Action | Status |
|---|---|---|---|---|
| Opening checklist | 06:00 daily | `cronOpenChecklist` | Telegram checklist mở quán | 🆕 Need register |
| Inventory low | 08:00 daily | `cronInventoryLow` | Quét INVENTORY < min_stock → Telegram | 🆕 Need register |
| FIFO check | 17:00 daily | `cronFifoCheck` | Cảnh báo lô nguyên liệu approaching shelf-life | 🆕 Need register |
| Close checklist + waste reminder | 21:30 daily | `cronCloseChecklistReminder` | Telegram nhắc log waste + cash close | 🆕 Need register |
| Equipment maintenance | 22:00 daily | `cronEquipmentMaintReminder` | Daily digest overdue/due maintenance | 🆕 Need register |
| Weekly ops digest | 06:30 Fri | `cronWeeklyOpsDigest` | Tổng hợp tuần qua (waste + cash + maint) | 🆕 Need register |

**Setup**: chạy thủ công `setupOpsTriggers()` qua GAS editor 1 lần.

## Layer B — Claude Scheduled Tasks (AI/intelligence)

Qua `mcp__scheduled-tasks__create_scheduled_task` — chạy Claude Code remote agent theo cron.

### Phase D — recommend setup

| Job name | Cron expr | Action | Files generated |
|---|---|---|---|
| `cafe_morning_brief` | `0 7 * * *` | Run `/sang` → ping Telegram tóm tắt + save brief | `docs/briefs/YYYY-MM-DD-morning.md` |
| `cafe_morning_content_draft` | `30 7 * * *` | Dispatch skill draft 1 IG/FB post cho hôm nay | `docs/content-drafts/YYYY-MM-DD.md` |
| `cafe_friday_weekly` | `30 6 * * 5` | Run `/tuan` (Friday) → save weekly brief | `docs/briefs/YYYY-WW-weekly.md` |
| `cafe_friday_content_plan` | `0 9 * * 5` | Brainstorm 7 ý tưởng tuần sau | `docs/content-plans/YYYY-WW.md` |
| `cafe_monday_rfm_refresh` | `0 8 * * 1` | Subagent `cafe-research` recompute RFM + draft winback/thank-you | `docs/winback-drafts/YYYY-MM-DD.md`, `docs/champions-thanks/...` |
| `cafe_monthly_competitor` | `0 10 1 * *` | Subagent quét 5 đối thủ Lâm Hà/Bảo Lộc | `docs/competitor-scan/YYYY-MM.md` |
| `cafe_monthly_menu_engineering` | `0 11 1 * *` | Compute matrix Stars/Plowhorses/Puzzles/Dogs | `docs/menu-engineering/YYYY-MM.md` |
| `cafe_quarterly_strategy` | `0 9 1 1,4,7,10 *` | Run `/mo-rong` → expansion brainstorm | `docs/strategy/QX-YYYY.md` |
| `cafe_reviews_monitor` | `0 */6 * * *` | Subagent quét Google Maps/FB review pending → draft response | append REVIEWS_LOG |

### Setup command (paste vào Claude khi cần register)
```
/schedule "cafe_morning_brief" "0 7 * * *" "Run /sang for KaeruKàphê. Save brief to docs/briefs/. Ping Telegram chủ quán."
```

(Repeat per job — xem chi tiết `mcp__scheduled-tasks`.)

## Layer C — Manual cron (chạy on-demand)

| Job | Trigger | Action |
|---|---|---|
| Birthday check | `/khach birthday` | Quét CUSTOMERS.birthday = today, draft message |
| Anniversary check | `/khach anniversary` | Quét first_order = today - 365d |
| Stock low immediate | `/sang` includes this | Sub-check trong morning brief |
| Quarterly feedback synthesis | `/khach feedback Q` | Sub-agent tổng hợp REVIEWS_LOG 3 tháng |

## Monitoring + observability

### Khi job lỗi
1. `logError(context, err)` → ERROR_LOG sheet + Telegram (throttle 6h/context)
2. User mở Claude → `/sang` sẽ flag critical job lỗi

### Khi job KHÔNG fire (silent fail)
Edge case khó detect. Mitigation:
- `cronWeeklyOpsDigest` Friday sẽ implicitly verify mọi job chạy (nếu data thiếu → flag)
- Manual audit quarterly: `setupOpsTriggers()` list triggers qua `ScriptApp.getProjectTriggers()`

## Bật/tắt 1 job

### GAS triggers
1. Mở GAS editor → Triggers panel (icon clock)
2. Tìm handler → bấm xoá/edit
3. Hoặc gọi `setupOpsTriggers()` reset all

### Claude scheduled tasks
```
mcp__scheduled-tasks__list_scheduled_tasks
mcp__scheduled-tasks__update_scheduled_task name=cafe_morning_brief enabled=false
```

## Health check (manual quarterly)

Q1 mỗi năm, chủ quán chạy:
1. Liệt kê GAS triggers
2. Liệt kê Claude scheduled tasks
3. Verify ERROR_LOG 3 tháng qua → identify silent fails
4. Decommission jobs không dùng (mất compute không value)

## Anti-patterns

- ❌ Quá nhiều job → Telegram noise → user mute → miss critical
- ❌ Job chồng nhau cùng phút → race conditions
- ❌ Job depend job khác mà thứ tự ko đảm bảo
- ❌ Skip throttling → spam khi error cứng
- ❌ Tạo job mà ko document ở đây → orphan
- ❌ Xoá job ko cập nhật reference này

---

## Layer D — Agent Chains (chuỗi nối nhiều agent · xem `agent-chains.md`)

> Khác Layer B (job lẻ): mỗi chuỗi nối nhiều agent + 1 gate duyệt + đóng vòng /roi → log lên Dashboard.
> Mẫu **scheduled-to-gate**: scheduled task chạy chuỗi TỚI gate → tạo nháp → ping Telegram → chủ duyệt → bước cuối.

| Chuỗi | Lệnh | Nhịp đề xuất | Cron (chạy tới gate) | Bước đóng vòng |
|---|---|---|---|---|
| Winback Loop | `/winback-loop` | 2 tuần | `0 8 * * 1` (T2, tuần lẻ) | +14d `/roi winback-YYYYMM` |
| Trend-to-Test | `/trend-loop` | 2 tuần | `0 10 * * 3` (T4, tuần chẵn) | +7–14d `/roi` |
| Weekly Growth | `/tuan` (full) | tuần | `30 6 * * 5` | trong chính `/tuan` |
| Reputation | `/review` | 6h | `0 */6 * * *` | markReviewResponded + insight |
| Daily Pulse | `/sang` | ngày | `0 7 * * *` | không (chỉ báo cáo) |

### Đăng ký (paste khi muốn bật tự động)
```
/schedule "cafe_winback_loop" "0 8 * * 1" "Run /winback-loop tới gate. Ping Telegram chủ quán duyệt. KHÔNG tự gửi."
/schedule "cafe_trend_loop" "0 10 * * 3" "Run /trend-loop tới gate. Ping Telegram. KHÔNG tự triển khai."
```
> Lưu ý: chuỗi có gate → scheduled task chỉ tạo bản nháp + nhắc, KHÔNG hoàn tất khâu gửi/đăng/thêm SKU.
