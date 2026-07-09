# Loyalty Stamps (v2)
> Split from CLAUDE.md §11. Index: ../../CLAUDE.md · Read when touching addStamp / redeem / Zalo stamp template.

```
Rules:
  1 beverage purchase = 1 stamp
  Beverages only — pastry/retail excluded
  10 stamps = 1 free drink (tier 2 or below on the menu)
  Stamps do not expire (review after 12 months)

Flow on DELIVERED:
  item.category_type === "beverage"?
    YES → addStamp(customer_id) × item.qty
          stamp_count >= 10?
            YES → stamp_count -= 10, free_drinks_earned += 1
                  Zalo: "🎉 Đủ 10 tem! Bạn được 1 ly miễn phí lần sau"
            NO  → Zalo: "🎟️ X/10 tem. Còn Y tem nữa là free!"
    NO  → skip

Zalo templates (keep Vietnamese — production copy sent to customers):
  Stamp: "☕ Vừa tích 1 tem! [X]/10 🎟️ · Còn [Y] tem nữa là free!"
  Full:  "🎉 Đủ 10 tem rồi! Lần sau ghé nhắc nhân viên để lấy 1 ly free nhé!"
  Redeem:"✅ 1 ly miễn phí đã dùng. Tem bắt đầu từ 0. Cảm ơn! ❤️"
```
