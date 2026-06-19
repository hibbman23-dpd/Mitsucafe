# Reference — Menu Engineering (Stars / Plowhorses / Puzzles / Dogs)

> Classic restaurant matrix. Cho monthly review SKU performance + decision keep/promote/remove.

## 2x2 matrix

```
                 LOW POPULARITY      HIGH POPULARITY
                 (< median qty)      (>= median qty)
              ┌──────────────────┬──────────────────┐
HIGH MARGIN   │   PUZZLES        │   STARS ⭐       │
(>= median    │   "Promote heavier│   "Protect, keep │
 contrib %)   │    or remove"     │    quality high"  │
              ├──────────────────┼──────────────────┤
LOW MARGIN    │   DOGS 🐕        │   PLOWHORSES 🐎  │
(< median     │   "Remove or     │   "Reprice or    │
 contrib %)   │    redesign"     │    cost-cut"     │
              └──────────────────┴──────────────────┘
```

## Compute metrics

For each SKU 30-day:
- `qty_sold` = Σ items.qty in ORDERS DELIVERED
- `revenue` = `qty_sold × price`
- `cogs` = `qty_sold × (cost_nl + cost_packaging)` from MENU
- `contribution_margin` = `revenue - cogs`
- `contribution_margin_pct` = `contribution_margin / revenue × 100`

Median across all active SKUs → split matrix.

## Decision per quadrant

### ⭐ Stars
**Action**: Protect quality (consistent recipe, never out-of-stock), feature trên landing hero, mascot photo
**Pricing**: Hold OR test +5-10% (xem demand elastic)
**Stock**: Min stock buffer cao hơn (3-5 ngày)

### 🐎 Plowhorses (popular, low margin)
**Action**:
- Try recipe portion cut nhẹ (giảm sữa 10ml, giảm topping default)
- Reprice +5-10% nếu market chấp nhận
- Cross-sell upgrade ("+5k để upgrade size L")
- Negotiate vendor giảm cost nguyên liệu chính

### 🧩 Puzzles (high margin, low popularity)
**Action**:
- Promote heavier: feature trên IG story, sample free taste
- Rename / restyle nếu name khó hiểu
- Pair với star trong combo
- Remove sau 60 ngày nếu vẫn không pop

### 🐕 Dogs (low margin, low popularity)
**Action**:
- Remove khỏi menu để giảm complexity
- (Optional) replace với SKU mới
- Exception: keep nếu là "story SKU" (loss-leader cho brand narrative)

## Workflow monthly review

`cronMonthlyMenuEngineering` 1st mỗi tháng 11:00 (Claude scheduled task):
1. Dispatch skill `cafe-manager` mode menu-engineering
2. Pull ORDERS 30d via GAS doGet
3. Lookup MENU costs
4. Compute matrix → markdown table
5. Save `docs/menu-engineering/YYYY-MM.md`
6. Telegram chủ quán: top 3 action items

## Output format

```markdown
# Menu Engineering — Tháng MM/YYYY

## Matrix

### ⭐ STARS (N items)
| SKU | Name | Qty 30d | Revenue | Margin % | Action |
|---|---|---|---|---|---|
| DR011 | Trà sữa Ô Long Lâm Đồng | 247 | 9.4M | 60% | Hold, feature IG |

### 🐎 PLOWHORSES (N items)
...

### 🧩 PUZZLES (N items)
...

### 🐕 DOGS (N items)
...

## Top 3 actions tháng tới
1. Remove [SKU dog] (low qty, low margin, lasted >60d)
2. Reprice [SKU plowhorse] +8% test
3. Promote [SKU puzzle] qua IG story + sample free
```

## 80/20 SKU analysis (bonus)

Pareto chart: top 20% SKU contribute X% revenue?

Mitsu targeting: top 20% SKU = 60-70% revenue.

Nếu >80% → menu too concentrated, vulnerable nếu star out-of-stock
Nếu <50% → menu too flat, không có hero clear → confusing brand

## Compose với skill khác

- `small-business:margin-analyzer` — deep margin work
- `data:create-viz` — Pareto chart, matrix scatter plot
- `marketing:performance-report` — bundle monthly menu insight

## Anti-patterns

- ❌ Remove SKU dog mà ko thay → menu shrink ko strategy
- ❌ Reprice plowhorse +20% (shock pricing)
- ❌ Keep dog vì "sentimental" (mất focus)
- ❌ Add puzzle mới mỗi tháng (menu bloat)
- ❌ Đánh giá <30 ngày (data noisy)
- ❌ Ignore seasonal SKU theo mùa (cần tách analysis)
