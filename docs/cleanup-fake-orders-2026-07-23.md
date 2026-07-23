# Cleanup đơn test ảo trên Sheets — 2026-07-23

Stress test (Antigravity + Fable debug) đã sync đơn giả lên ORDERS sheet prod như đơn thật,
kèm mark_paid → doanh thu ảo + tem loyalty ảo. Toàn bộ đơn ORD-20260723-* tính đến 09:05 là TEST
(chưa có đơn khách thật hôm nay — đã đối chiếu từng dòng outbox local).

## Việc cần làm trên GAS/Sheets (cần chủ quán duyệt)
1. ORDERS sheet: xóa mọi row order_id ngày 2026-07-23 trong danh sách dưới (64 đơn, gồm cả ORD-20260723-2076 test kỹ thuật).
2. CUSTOMERS/loyalty: trừ lại tem đã cộng hôm nay cho 5 customer_id giả:
   0901234567 · 0909090909 · 0912345678 · 0944556677 · 0988776655
   (đơn 'UBND Huyện Lâm Hà' giá trị cao — kiểm cả voucher ly free bậc 490k nếu đã phát).
3. Kiểm INVENTORY nếu ingest có trừ kho; báo cáo ngày 23/07 phải về 0 sau dọn.
4. 3 đơn 2026-07-22 failed-terminal (sku DR090/thiếu sku) — đã in vật lý, quyết bỏ hay backfill.

## Danh sách order_id (từ outbox local, op=ingest_order đã synced)
```
ORD-20260723-5035  (test)
ORD-20260723-2992  (test)
ORD-20260723-1138  Anh Tuấn (Bàn 02)
ORD-20260723-8282  Chị Thảo (Mang đi)
ORD-20260723-6530  Nguyễn Hoàng Nam (Agribank)
ORD-20260723-5222  Bàn 08 (Gia đình chị Hạnh)
ORD-20260723-6376  UBND Huyện Lâm Hà (Đoàn tiệc)
ORD-20260723-4641  Anh Tuấn (Bàn 02)
ORD-20260723-6088  Chị Thảo (Mang đi)
ORD-20260723-9415  Nguyễn Hoàng Nam (Agribank)
ORD-20260723-7015  Bàn 08 (Gia đình chị Hạnh)
ORD-20260723-5184  UBND Huyện Lâm Hà (Đoàn tiệc)
ORD-20260723-8187  (test)
ORD-20260723-4032  Anh Tuấn (Bàn 02)
ORD-20260723-6316  Chị Thảo (Mang đi)
ORD-20260723-2580  Nguyễn Hoàng Nam (Agribank)
ORD-20260723-4837  Bàn 08 (Gia đình chị Hạnh)
ORD-20260723-8116  UBND Huyện Lâm Hà (Đoàn tiệc)
ORD-20260723-7024  Anh Tuấn (Bàn 02)
ORD-20260723-6634  Chị Thảo (Mang đi)
ORD-20260723-4339  Nguyễn Hoàng Nam (Agribank)
ORD-20260723-6311  Bàn 08 (Gia đình chị Hạnh)
ORD-20260723-4562  UBND Huyện Lâm Hà (Đoàn tiệc)
ORD-20260723-2466  Anh Tuấn (Bàn 02)
ORD-20260723-8883  Chị Thảo (Mang đi)
ORD-20260723-8430  Nguyễn Hoàng Nam (Agribank)
ORD-20260723-1207  Bàn 08 (Gia đình chị Hạnh)
ORD-20260723-9919  UBND Huyện Lâm Hà (Đoàn tiệc)
ORD-20260723-2889  Anh Tuấn (Bàn 02)
ORD-20260723-5889  Chị Thảo (Mang đi)
ORD-20260723-9806  Nguyễn Hoàng Nam (Agribank)
ORD-20260723-9012  Bàn 08 (Gia đình chị Hạnh)
ORD-20260723-7110  UBND Huyện Lâm Hà (Đoàn tiệc)
ORD-20260723-6928  Anh Tuấn (Bàn 02)
ORD-20260723-7916  Chị Thảo (Mang đi)
ORD-20260723-4333  Nguyễn Hoàng Nam (Agribank)
ORD-20260723-2127  Bàn 08 (Gia đình chị Hạnh)
ORD-20260723-4839  UBND Huyện Lâm Hà (Đoàn tiệc)
ORD-20260723-1746  Anh Tuấn (Bàn 02)
ORD-20260723-4680  Chị Thảo (Mang đi)
ORD-20260723-9696  Nguyễn Hoàng Nam (Agribank)
ORD-20260723-5904  Bàn 08 (Gia đình chị Hạnh)
ORD-20260723-6486  Anh Tuấn (Bàn 02)
ORD-20260723-9584  UBND Huyện Lâm Hà (Đoàn tiệc)
ORD-20260723-5553  Chị Thảo (Mang đi)
ORD-20260723-8192  Nguyễn Hoàng Nam (Agribank)
ORD-20260723-8425  Bàn 08 (Gia đình chị Hạnh)
ORD-20260723-8551  UBND Huyện Lâm Hà (Đoàn tiệc)
ORD-20260723-3305  Anh Tuấn (Bàn 02)
ORD-20260723-6265  Chị Thảo (Mang đi)
ORD-20260723-1952  Nguyễn Hoàng Nam (Agribank)
ORD-20260723-8869  Bàn 08 (Gia đình chị Hạnh)
ORD-20260723-3348  UBND Huyện Lâm Hà (Đoàn tiệc)
ORD-20260723-9711  Anh Tuấn (Bàn 02)
ORD-20260723-5375  Chị Thảo (Mang đi)
ORD-20260723-2514  Nguyễn Hoàng Nam (Agribank)
ORD-20260723-9834  Bàn 08 (Gia đình chị Hạnh)
ORD-20260723-1118  UBND Huyện Lâm Hà (Đoàn tiệc)
ORD-20260723-4328  Anh Tuấn (Bàn 02)
ORD-20260723-5957  Chị Thảo (Mang đi)
ORD-20260723-7391  Nguyễn Hoàng Nam (Agribank)
ORD-20260723-9064  Bàn 08 (Gia đình chị Hạnh)
ORD-20260723-4314  UBND Huyện Lâm Hà (Đoàn tiệc)
ORD-20260723-2076  TEST-FABLE-XOA (đã xóa local, còn trên Sheets)
```

## Phòng tái diễn
Stress test sau này PHẢI chặn syncer: dùng DB tạm (như smoke_spool.py) hoặc GAS_WEBAPP_URL trỏ endpoint giả — KHÔNG chạy real_workflow_stress_test.py thẳng vào server prod đang bật syncer.
