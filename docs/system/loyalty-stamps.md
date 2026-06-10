# Loyalty Stamps (v2)
> Tách từ CLAUDE.md §11. Index: ../../CLAUDE.md · Đọc khi đụng addStamp / redeem / Zalo stamp template.

```
Quy tắc:
  Mua 1 ly (beverage) = 1 tem
  Chỉ beverage — không áp dụng pastry/retail
  10 tem = 1 ly miễn phí (tier 2 trở xuống trong menu)
  Tem không hết hạn (review sau 12 tháng)

Flow khi DELIVERED:
  item.category_type === "beverage"?
    YES → addStamp(customer_id) × item.qty
          stamp_count >= 10?
            YES → stamp_count -= 10, free_drinks_earned += 1
                  Zalo: "🎉 Đủ 10 tem! Bạn được 1 ly miễn phí lần sau"
            NO  → Zalo: "🎟️ X/10 tem. Còn Y tem nữa là free!"
    NO  → bỏ qua

Zalo templates:
  Tích: "☕ Vừa tích 1 tem! [X]/10 🎟️ · Còn [Y] tem nữa là free!"
  Đủ:   "🎉 Đủ 10 tem rồi! Lần sau ghé nhắc nhân viên để lấy 1 ly free nhé!"
  Đổi:  "✅ 1 ly miễn phí đã dùng. Tem bắt đầu từ 0. Cảm ơn! ❤️"
```
