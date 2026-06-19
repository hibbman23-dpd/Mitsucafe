# Reference — Inventory FIFO + Reorder cycle

> Mục tiêu: cảnh báo lô cũ approach hết hạn + suggest order khi stock thấp.

## INVENTORY schema (đã có)

```
ingredient_id | name | unit | current_stock | min_stock |
cost_per_unit | supplier | last_updated
```

Phase C extend (optional, không bắt buộc Phase C):
- `batch_id` — nếu user track theo lô
- `batch_received_at` — ngày nhận lô
- `shelf_life_days` — tham chiếu food-safety.md table
- `vendor_phone` — quick reorder

## FIFO check logic

`cronFifoCheck` (Phase C, 17:00 mỗi ngày):

For each row in INVENTORY:
1. Compute age = today - last_updated (proxy cho "lô vào")
2. Lookup shelf_life from food-safety table (qua name match)
3. If age >= shelf_life × 0.8 → warning "lô sắp hết hạn"
4. If current_stock <= min_stock → warning "stock low"
5. If current_stock < expected_usage_tomorrow → critical "có nguy cơ stockout ngày mai"

Output Telegram:
```
🥡 FIFO + stock alert — DD/MM/YYYY 17:00

🟡 SHELF-LIFE WARNING:
- Milk foam: lô ngày 2026-05-29 — còn 6h tới hạn (12h fridge)
- Trà hojicha: ủ 08:00 — còn 5h tới 21:00 expire

🔴 STOCK LOW (dưới min_stock):
- Trân châu đường đen: 1.5kg / min 3kg
- Sữa tươi: 2L / min 5L

📋 SUGGEST ORDER cho ngày mai:
- Trân châu đường đen: 5kg (vendor: ...)
- Sữa tươi: 10L (vendor: ...)
```

## Expected usage estimation

`expected_usage_tomorrow` cho ingredient X:
```
avg_daily_usage_7d = sum(ingredient X consumed last 7 days) / 7
```

Lookup từ ORDERS hôm qua → items_json → MENU lookup recipe_id (nếu có) → ingredient breakdown. Hoặc fallback: dùng INVENTORY.last_updated diff trong 7 ngày.

## Min stock setting

`min_stock` per ingredient = `avg_daily_usage_7d × buffer_days`

Buffer days recommend:
- Trân châu, sữa: 2 ngày (fresh, fast turnover)
- Trà khô, syrup: 14 ngày (long shelf life, weekly order OK)
- Bột matcha hộp: 30 ngày (premium, slow turnover)

User update min_stock trong INVENTORY sheet theo experience tháng đầu.

## Reorder workflow

User nói "draft đơn order" (manual hoặc auto từ /sang trigger):
1. Pull all INVENTORY rows current_stock <= min_stock × 1.2 (buffer order)
2. Group by supplier
3. Output per supplier:

```
📦 ORDER DRAFT — Supplier "Thành Lộc Tea Supply"

| Ingredient | Current | Min | Suggest order | Unit cost | Subtotal |
|---|---|---|---|---|---|
| Trân châu đường đen | 1.5kg | 3kg | 5kg | 120.000đ/kg | 600.000đ |
| Sữa tươi | 2L | 5L | 10L | 25.000đ/L | 250.000đ |

Tổng: 850.000đ

Contact: 09xxxx (lưu trong CONFIG)

Message draft:
"Chào anh/chị, Mitsu đặt: 5kg trân châu đường đen + 10L sữa tươi.
Giao trước 8:00 mai được không ạ?"
```

User copy message → gửi vendor → khi receive nhập vào INVENTORY.

## Anti-stockout safety

Critical SKU (top 3 doanh thu): KHÔNG bao giờ để current_stock = 0 trong giờ mở quán.

Auto-pause SKU khi stockout:
```
gas/Menu.gs:setSkuAvailable(sku, false)
```
→ Glide/landing tự ẩn SKU đó tới khi restock.

## Receive shipment workflow

Khi vendor giao hàng:
1. Verify qty + quality
2. Update INVENTORY:
   - current_stock += received_qty
   - last_updated = today
   - (optional) batch_id += new
3. Log EXPENSE row (đã có form)
4. Take photo invoice → DriveApp.createFile → link receipt_url trong EXPENSES

## Quarterly inventory audit

Mỗi quý 1 lần:
- Đếm tay 100% items
- So với INVENTORY sheet
- Discrepancy >5% → suggest waste log retro + review FIFO discipline

## Anti-patterns

- ❌ Order >2× expected need (waste shelf-life)
- ❌ Order khi current_stock vừa < min (lúc đó đã stress)
- ❌ Skip update INVENTORY khi receive
- ❌ Mix lô cũ + lô mới cùng container (không FIFO được)
- ❌ Bỏ qua alert shelf-life vì "chắc còn dùng được"
- ❌ Chỉ dựa current_stock, không nhìn trend usage
