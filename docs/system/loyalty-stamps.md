# Loyalty Stamps (v3 — spend-tier)
> Tách từ CLAUDE.md §11. Index: ../../CLAUDE.md · Đọc khi đụng _computeStampAward / _creditStampsForOrder / _freeDrinkBaseMDiscount / redeem / Zalo stamp template.

## Quy tắc tích tem (theo giá trị đơn NET, gồm mọi món)
| Đơn net (order.total) | Tem | Thưởng thêm |
|---|---|---|
| < 66.000đ | 0 | — |
| ≥ 66.000đ, < 100.000đ | 1 | — |
| ≥ 100.000đ, < 490.000đ | 2 (cap) | — |
| ≥ 490.000đ | 0 | +1 ly free cộng thẳng free_drinks_earned (dùng đơn sau) |

- Ngưỡng ở CONFIG: STAMP_THRESHOLD_1=66000, STAMP_THRESHOLD_2=100000, STAMP_THRESHOLD_SPECIAL=490000 (fallback hardcode trong _computeStampAward).
- Net = sau giảm giá toàn quán + sau trừ ly đổi thưởng.
- Tem không hết hạn (review sau 12 tháng).

## Đổi thưởng
- 10 tem = 1 ly nước size M cơ bản (chỉ nước, KHÔNG topping, KHÔNG chênh size L).
- Giảm trừ = giá M SAU promo của ly đắt nhất trong giỏ (bỏ bánh BK*). Server _freeDrinkBaseMDiscount + client getCartDiscount phải khớp từng đồng (bank reconcile).
- Ly free tích được chỉ dùng cho ĐƠN SAU (free_drinks_earned − free_drinks_used − reserved).

## Flow khi DELIVERED (_creditStampsForOrder)
```
award = _computeStampAward(order.total)
guard: stampsEarned===0 && !use_free_drink && !specialFreeDrink → return
load cust → xử lý use_free_drink (decrement) → _applyStampAward(cust, award) → ghi row
notifyStampUpdate(..., specialFreeDrink)
```

## Zalo templates
```
Tích:    "🐝 Tích [N] tem! [X]/10 🎟️ · Đơn ≥66k +1 · ≥100k +2"
Special: "🎁 Đơn ≥490k — tặng ngay 1 ly nước miễn phí (dùng lần sau)!"
Đủ ly:   "👉 Hãy chọn 'Đổi ly nước miễn phí' trong lần đặt đơn tới nhé!"
```

## KHÔNG làm
```
❌ cooldown chống tách đơn (phạt khách quay lại thật — đã loại)
❌ hardcode ngưỡng ngoài _computeStampAward fallback
❌ trừ ly free theo giá gốc niêm yết (trừ lấn món khác) — luôn dùng giá sau promo
```
