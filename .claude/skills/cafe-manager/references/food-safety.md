# Reference — Food Safety (HACCP-lite, FIFO, Shelf-life)

> Áp dụng HACCP-lite cho bubble tea / cà phê quán nhỏ.
> KHÔNG cấp giấy chứng nhận (cần audit chuyên nghiệp riêng).

## Shelf-life table (chính)

Research-backed (xem plan §Context):

| Nguyên liệu | Room temp | Fridge (≤5°C) | Freezer | Ghi chú |
|---|---|---|---|---|
| **Trân châu cooked** | 2-4h | vài giờ (cứng) | — | Ideal 30-60' sau pha. FIFO bắt buộc |
| **Trà ủ — matcha** | 4h | 24h | — | Hâm lại → chất lượng drop |
| **Trà ủ — hojicha** | 4h | 24h | — | Same |
| **Trà ủ — sencha** | 4h | 24h | — | |
| **Trà nhài** | 6h | 48h | — | |
| **Milk foam** | 2h | 4h | KHÔNG | Đông lạnh phá texture |
| **Sữa tươi chưa mở** | — | Date in bao bì | — | |
| **Sữa tươi mở (chai/hộp)** | — | 3-5 ngày | — | Đánh dấu date khi mở |
| **Sữa đặc mở** | — | 7 ngày | — | |
| **Whipping cream mở** | — | 5-7 ngày | — | |
| **Trà sữa pha sẵn (có boba)** | 0 | 12-24h | KHÔNG | Same-day consume khuyến nghị |
| **Trà sữa pha sẵn (không boba)** | 0 | 24-48h | KHÔNG | Same |
| **Pudding/Thạch** | 2h | 3-5 ngày | KHÔNG | Lid sealed |
| **Bánh croissant** | 24h | 3 ngày | 1 tuần | Reheat trước serve |
| **Bánh flan** | 4h | 3 ngày | KHÔNG | |
| **Trái cây cắt** | 2h | 24h | — | Cam, đào, vải |
| **Syrup mở** | 1 tuần | 1 tháng | — | |
| **Espresso bean (open bag)** | 14 ngày | KHÔNG | — | Vacuum-sealed only |
| **Ice (đá viên)** | — | — | (in machine) | Clean machine weekly |

## FIFO (First-In-First-Out) labeling

Mỗi lô sản xuất/mở → label:
```
[Item] · [Batch ID] · Mở/Pha: HH:MM DD/MM · Bỏ trước: HH:MM DD/MM
```

VD:
```
Trân châu đường đen · BATCH-04 · Pha 06:45 · Bỏ trước 10:45
```

Vị trí label: dán cốc/tô đựng → người sau biết FIFO order.

## Temperature monitoring

3 zone cần monitor:

| Zone | Range | Frequency check |
|---|---|---|
| **Fridge** (sữa, milk foam, pudding) | 0-5°C | Mỗi sáng + chiều |
| **Freezer** (bánh đông) | -18 đến -22°C | Mỗi sáng |
| **Hot holding** (trà ủ giữ ấm) | 60-65°C | Mỗi 2h khi serve |
| **Cold holding** (trà sữa cold-brew) | <5°C | Mỗi 2h khi serve |

Nếu out of range >30': discard + ghi WASTE_LOG reason="expiry" hoặc "spillage".

## Cross-contamination prevention

| Loại | Rule |
|---|---|
| Allergens | Sữa, hạt, trứng, đậu nành — đánh dấu trên MENU.allergens (đã có) |
| Tools | Riêng dao/thớt cho fruit vs dairy |
| Hand wash | Sau mỗi 30' hoặc sau mỗi task khác loại |
| Glove | Đeo glove khi xử lý ready-to-eat (boba scoop, fruit) |

## Cleaning chemical inventory

| Chemical | Dùng cho | Frequency |
|---|---|---|
| Cafiza / Pulycaff | Espresso machine backflush | Daily |
| Food-safe sanitizer (quaternary ammonium) | Counter, tools | Daily |
| Cồn 70% | Hand sanitize, surface quick | Continuous |
| Cleaning solution 5% (descale) | Espresso boiler, ice maker | Monthly |
| Glass cleaner | Display case | Weekly |
| Floor disinfectant | Floor | Daily |

## Pest control

- Quanh quầy sạch tuyệt đối — không để food residue qua đêm
- Trap kiến / chuột monthly
- Đậy kín rác chuồng
- Inspect quarterly professional

## HACCP-lite checkpoints (đưa vào opening-closing-checklist)

### Opening (6:00)
- Fridge temp 0-5°C
- Freezer temp <-18°C
- Counter sạch + sanitized
- Hand wash before prep
- Pha mẻ trà → label batch ID + bỏ-trước time

### Mid-day (12:00, 18:00)
- Hot holding temp check
- Discard items beyond shelf life
- Wipe spill ngay
- Sanitize tools 2-3h

### Closing (22:00)
- Discard all batches expired
- Deep clean counter
- Sanitize all tools
- Floor mop
- Log WASTE_LOG

## Khi user nói "có khách bị đau bụng / phàn nàn vệ sinh"

CRITICAL escalation:
1. Stop serving liên quan SKU/batch nghi vấn ngay
2. Identify batch (FIFO label)
3. Quarantine batch còn lại
4. Document: tên khách, SKU, batch ID, time, symptoms
5. Trace back: ingredient batch, supplier, opening date
6. Contact nhà cung cấp nếu nghi nguyên liệu lỗi
7. Insurance + legal advisor nếu cần (>2 khách cùng symptom)
8. KHÔNG public response trên social → riêng tư handle

KHÔNG auto-draft response trên skill — escalate manually.

## Compose với existing GAS

- `gas/Inventory.gs` đã có `deductInventoryForOrder` — Phase C extend với batch tracking
- `gas/Loyalty.gs` không cần đụng
- WASTE_LOG (Phase C) → cập nhật INVENTORY thực tế

## Anti-patterns

- ❌ Quên label batch → không FIFO được
- ❌ Pha mẻ trà tối qua dùng sáng nay
- ❌ Trân châu fridge qua đêm → cứng → vẫn serve
- ❌ Skip temp check vì "máy chạy ổn"
- ❌ Dùng tay không scoop boba (cross-contamination)
- ❌ Wipe counter bằng khăn ướt cùng để lau bàn khách
- ❌ Đậy ly trà sữa qua đêm thay vì discard
