# Reference — Birthday & Special Occasions

> Triggered outreach cho dịp đặc biệt của khách. Optional layer — chỉ active khi user thu thập birthday.

## Khi nào ghi nhận birthday

- Khách tự cung cấp khi register (Glide form)
- Khách tham gia Loyalty stamp campaign — birthday optional field
- Khách comment "hôm nay sinh nhật" trong DM/Zalo → ghi note thủ công

`CUSTOMERS.birthday` format: `MM-DD` (không lưu year — privacy + đủ trigger)

## Birthday workflow (Phase D scheduled task — optional)

`cronBirthdayCheck` 09:00 daily:
1. Quét CUSTOMERS where `birthday` matches today MM-DD
2. Draft Zalo birthday message (template)
3. Save `docs/birthday-drafts/YYYY-MM-DD.md`
4. Ping Telegram chủ quán: "X khách sinh nhật hôm nay, draft ready"
5. KHÔNG tự gửi — user duyệt + paste

## Birthday message template

```
🎂 Sinh nhật vui vẻ, [Tên]!

Mitsu dành tặng bạn 1 ly miễn phí (size M) hôm nay khi ghé quán — 
かえる muốn cùng bạn mừng một chuyến trở về nhỏ.

Hiệu lực: 24h hôm nay
Ghi: "BD-[YYYYMMDD]" khi order

— Team Mitsu 🐸
```

## Other occasions

| Occasion | Trigger | Message gist |
|---|---|---|
| Anniversary follow (1 năm sau first_order) | `first_order` = today - 365d | Cảm ơn "1 năm cùng かえる" + free drink |
| Customer milestone (10/50/100 orders) | `total_orders` chạm mốc | Milestone congrats + exclusive merch |
| Stamp redemption ready | Loyalty.gs đã handle | Notify ngay khi đạt 10 stamps |
| New baby / wedding (manual) | User note thủ công | Custom message |

## Workflow trigger từ skill

User nói "hôm nay sinh nhật chị Linh" hoặc paste customer_id:
1. Skill confirm: "Có muốn mark birthday cho Chị Linh + draft message?"
2. Nếu OK → update `CUSTOMERS.birthday` row
3. Draft message + output

## Compliance

- Chỉ gửi cho khách opt-in Zalo OA
- KHÔNG bao giờ public birthday lên social
- Birthday data PII — không export ra file public

## Anti-patterns

- ❌ Hỏi birthday qua form bắt buộc (impolite)
- ❌ Gửi birthday 1 tuần trước (mất surprise)
- ❌ Voucher birthday >50% (over-generous, mất chân giá trị)
- ❌ Public happy birthday post tag khách chưa xin phép
