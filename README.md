# Lâm Hà Kissaten — Ordering & Operations System

Hệ thống đặt hàng đa kênh + vận hành quán cà phê Kissaten ở Lâm Hà, Lâm Đồng.

**Stack**: Google Apps Script · Google Sheets (DB) · Glide (UI khách) · Xprinter POS-58L/XP-365B · Mac Mini Flask print server · Telegram Bot · Zalo OA · VietQR.

**Single source of truth**: [CLAUDE.md](./CLAUDE.md) — đọc file này trước khi làm bất kỳ task nào.

---

## Quick start

```bash
# 1. Install tooling
npm i -g @google/clasp                      # GAS deployment
python3 -m pip install -r print-server/requirements.txt

# 2. Login Google
clasp login

# 3. Liên kết với GAS project (sau khi đã tạo Sheets + bound Apps Script)
cd gas && clasp clone <SCRIPT_ID>
clasp push                                   # đẩy code lên GAS

# 4. Khởi động print server trên Mac Mini
cd ../print-server && python3 print_server.py

# 5. Seed menu vào Sheets (chạy 1 lần)
# Trong GAS editor: chọn function seedMenuFromJson() → Run
```

---

## Cấu trúc thư mục

```
lamha-kissaten/
├── CLAUDE.md                ← Spec đầy đủ (đọc đầu tiên)
├── ONBOARDING.md            ← Checklist user phải làm thủ công (Sheets, Telegram, Zalo)
├── docs/                    ← Architecture, SOP, menu reference
├── gas/                     ← Apps Script source (clasp push)
├── print-server/            ← Flask trên Mac Mini → Xprinter
├── seed/                    ← JSON: 27 món + 9 tea bases + ingredients
├── qr/                      ← Generator QR per bàn + sticker PDF
└── ops/                     ← SOP nhân viên, offline form A5
```

---

## Build status

- [x] Day 1 — Foundation: scaffold + CLAUDE.md + .gitignore
- [ ] Day 2 — Menu seed (27 món)
- [ ] Day 3 — Order intake + Telegram alert
- [ ] Day 4 — Glide app khách
- [ ] Day 5 — Print server + tem dán ly
- [ ] Day 6 — VietQR + state machine
- [ ] Day 7 — QR bàn + smoke test
- [ ] Phase 2 (Day 8–14) — Zalo + KDS + Offline
- [ ] Phase 3 (Day 15–21) — Payment đối soát + Invoice PDF
- [ ] Phase 4 (Day 22–28) — Campaign + Inventory + Launch

---

## Hardware deployment

| Thiết bị | Vai trò | IP / Port |
|---|---|---|
| Mac Mini M4 | Print server + GAS proxy 24/7 | 192.168.1.x (static) |
| Xprinter POS-58L | Tem dán ly + bill nhiệt 58mm | 192.168.1.50:9100 (set trong CONFIG) |
| Xprinter XP-365B | Label die-cut takeaway (optional) | 192.168.1.51:9100 |
| Tablet KDS | Hiển thị đơn cho bếp/bar | DHCP |

---

## Cách lấy giúp đỡ

- Đọc [CLAUDE.md §16 KHÔNG LÀM](./CLAUDE.md) — danh sách những điều cấm
- Sai sót log → check `ERROR_LOG` tab trong Sheets + Telegram
- Mất mạng → xem [SOP offline 4 cấp](./ops/offline-sop-a5.md)
