# Repo sweep 2026-07-23 (Fable) — lỗi mới + task nâng cấp

Quét toàn bộ thay đổi CHƯA COMMIT (Antigravity/user sửa sau các commit engine, mtime 07:34–08:37).
Service prod đang chạy đúng code mới này (process start 09:03). 81 unit test xanh.
Task đánh dấu **[SONNET]** = giao model thấp làm theo spec; **[USER]** = chủ quán quyết.

---

## TRẠNG THÁI FIX (cập nhật cuối phiên)
- **A1 ✅ FIXED** `d833e84` — same-status noop + bỏ DELIVERED→CANCELLED; 6/6 node test (gồm test no-op thật). ⚠️ CHỜ USER push GAS.
- **A2 ✅ FIXED** `7c01e33` — sku lạ→UNKNOWN+log (bỏ DR001 im lặng), giữ SKU ngừng bán; 18/18.
- **A3 ✅ FIXED** `a4ec784` — surgical replay khôi phục (mark từng ly, fail chỉ requeue chưa in); 88/88 full suite.
- **A5 ✅ FIXED** `2116d7c` — test chặn DLE DC4 pulse mọi path.
- **A4 / C1-C4 ⏳ CHƯA** (enhancement, không phải bug — làm sau nếu muốn). **C5 [USER]**.
- ⚠️ Fix nằm trên disk; prod process (start 09:03) chạy code CŨ tới khi restart. Print-server: `bootout`+`bootstrap`. GAS (A1): `gas_push.py`.

---

## A. LỖI PHẢI SỬA (xếp theo độ nặng)

### A1. 🔴 Orders.gs: transition nới lỏng quá tay → side effect bắn lặp [SONNET, cần review kỹ]
File `gas/Orders.gs`. Thay đổi hiện tại: mọi state đi tắt được (NEW→DELIVERED ok — chấp nhận được cho vận hành), NHƯNG:
- `isValidTransition` giờ cho `from === to` → `updateOrderStatus` chạy `_runStateSideEffects` VÔ ĐIỀU KIỆN → POST status lặp (KDS bấm 2 lần, offline queue replay) = **spam Zalo khách (MAKING→MAKING) + re-print bill (DELIVERED→DELIVERED set pending_print → poller in lại)**. Trước đây các lệnh lặp bị chặn bởi "Invalid transition".
- `DELIVERED→CANCELLED` giờ hợp lệ — hủy đơn ĐÃ thanh toán+cộng tem, không có flow hoàn tem/tiền đi kèm.

**Spec fix:**
1. Trong `updateOrderStatus`: nếu `newStatus === currentStatus` → return sớm `{ok:true, noop:true}` TRƯỚC khi ghi sheet + side effects (idempotent thật sự, không re-fire).
2. Bỏ `'CANCELLED'` khỏi `VALID_TRANSITIONS['DELIVERED']` (muốn hủy đơn đã trả tiền = flow riêng có duyệt, chưa build).
3. Cập nhật `ops/test_transitions.js`: same-status → ok nhưng assert noop (không side effect — mock Zalo/print đếm 0 call); DELIVERED→CANCELLED → false.
4. ⚠️ [USER] xác nhận `Orders.gs` bản sửa này ĐÃ push GAS chưa (`python3 ops/gas_push.py` — nhớ: không `--deploy` vẫn đụng HEAD/cron). Sửa xong phải push lại.

### A2. 🔴 gateway.normalize_order_payload: fallback SKU sai âm thầm [SONNET]
File `print-server/gateway.py` (+52 mới). Item thiếu `sku` → gán **`DR001`** (một món THẬT); SKU ngừng bán DR083/85/87/90 → cũng ép về `DR001`. Hệ quả: doanh thu + trừ kho tính vào NHẦM MÓN, không ai biết. Kèm map hardcode rác ("test q24"/"test q25").

**Spec fix:**
1. Không fallback về món thật. Item không resolve được → giữ nguyên, thêm `sku="UNKNOWN"` + log WARNING kèm order_id/name; GAS-side quyết reject hay nhận (phối hợp A1 §4 — nếu GAS vẫn đòi sku hợp lệ thì thêm SKU `UNKNOWN` vào MENU sheet dạng inactive-0đ, hoặc GAS chấp nhận UNKNOWN và đánh dấu cột cần-soát).
2. Xóa entries hardcode test khỏi `_MENU_MAP`.
3. Map ngừng-bán: KHÔNG ép DR001; giữ SKU gốc (GAS báo "ngừng bán" là đúng nghiệp vụ) hoặc bảng remap tường minh do chủ quán duyệt.
4. Thêm unittest: item thiếu sku → UNKNOWN + có log; item sku ngừng bán → giữ nguyên.

### A3. 🟠 print_worker batch: mất surgical replay (regression durability) [SONNET]
`print_worker.py` chuyển batch cả đơn (≤30 job) thành **1 send duy nhất** + mark cả loạt sau 1 confirm. Được: preamble/đơn (đúng ef7bca3), throughput tốt. Mất: **fail/crash giữa batch → CẢ batch requeue → in lại cả những tem ĐÃ ra** (đơn 22 ly có thể lặp tới 21 tem). Test `test_drop_then_replay_prints_only_missing` đã bị nới yếu (drop_after=0, chỉ test fail toàn phần) để hợp thức hóa.

**Spec fix (giữ batch claim, khôi phục mark từng ly):**
1. Giữ `claim_next_batch`. Trong nhánh label: gửi `setup_preamble` 1 lần đầu batch, rồi **loop từng job**: `send(render(j))` → `mark_printed(j)` ngay (USB không có overhead per-job như CUPS). Pacing per-label giữ ~0.6s (gap-sensor) — tổng thời gian tương đương bản batch.
2. Fail ở ly i → requeue CHỈ các job chưa mark (i..n), các ly đã mark giữ `printed`.
3. Khôi phục test drop-replay mạnh: `drop_after=2` (preamble+ly1 ok, ly2 fail) → replay chỉ in ly 2..3, không lặp ly 1. Sửa lại `test_prints_each_cup_once` đếm số send tương ứng.
4. Dọn dead code: field `_setup_done`, `cold_seconds` (bill đã có `ESC @` trong render), `claim_next` đơn lẻ nếu không còn ai dùng ngoài test (giữ trong PrintSpool nếu test cần).

### A4. 🟡 outbox.db phình 991KB + không có retention [SONNET]
670+ row `print_spool` printed + hàng trăm row outbox synced tích mãi. **Spec:** thêm hàm `purge_old(days=7)` vào PrintSpool + Gateway (DELETE row `printed`/`synced_at NOT NULL` cũ hơn N ngày, rồi `VACUUM` khi shrink >50%); gọi 1 lần lúc `_start_workers` + mỗi 24h trong reconciler loop. Unittest: row cũ bị xóa, row pending/chưa-sync KHÔNG bị xóa.

### A5. 🟡 Thiếu regression test cho DLE DC4 drawer pulse [SONNET]
Antigravity xóa đúng byte `\x10\x14\x01\x00\x05` (realtime drawer kick vô điều kiện trong `build_receipt_text` — đây là lý do thật khiến VietQR vẫn kích két trên text path; test drawer cũ của Fable chỉ đếm pattern `ESC p` nên lọt). **Spec:** thêm vào `test_printlib_drawer.py`: assert `b"\x10\x14"` không xuất hiện trong output text/raster bất kể is_cash.

---

## B. THAY ĐỔI TỐT — GIỮ (đã review, không cần làm gì)
- `ESC t \x20`→`\x00` (codepage PC437) — hợp `_viet_ascii`.
- Bỏ DLE DC4 pulse (xem A5 — giữ fix, bổ sung test).
- `CHUNK_H 96→48` — band nhỏ hơn, motor nhả đều hơn; vô hại.
- `_gas_post` timeout 10→25s — GAS chậm là có thật.
- `kds.html` override rank/expire logic — chống kẹt optimistic UI, hợp lý.
- `update_gas_seedsheets.py` marker fix; `stress_spool_harness.py` dùng temp DB + FakeTransport (ĐÚNG bài học, dùng cái này thay `real_workflow_stress_test.py` khi test logic).

## C. NÂNG CẤP KHUYẾN NGHỊ (sau khi A xong)
- **C1 [SONNET]** USB confirm interpret bit thật: receipt `dle_eot` — parse byte DLE EOT (bit 3 offline, bit 6 error...) thay vì "any byte = done" (finding I2). Spec trong HARDWARE_VALIDATION.md.
- **C2 [SONNET]** Commit toàn bộ working tree hiện tại sau khi A1-A3 fix (đang 10 file sửa dở trên prod — rủi ro lệch disk vs process khi restart). Kèm restart service.
- **C3 [SONNET]** HARDWARE_VALIDATION.md + handoff: cập nhật trạng thái "đã USB direct, cups=fallback" (một số đoạn còn nói cups là bước hiện tại).
- **C4 [SONNET]** `fix_outbox_stuck.py`: gắn guard chỉ-chạy-khi-có-cờ `--yes` + in preview trước khi UPDATE payload hàng loạt (tool này đã sửa data prod trực tiếp).
- **C5 [USER]** 3 đơn 2026-07-22 failed-terminal (sku) — quyết bỏ/backfill (nằm trong cleanup doc).

## D. NHẮC VẬN HÀNH
- Sau MỌI lần sửa code print-server: `launchctl bootout` + `bootstrap` (kickstart không áp env/plist mới) + verify `ps eww $(pgrep -f print_server.py) | tr ' ' '\n' | grep PRINT_ENGINE`.
- Stress test = `stress_spool_harness.py` (temp DB). `real_workflow_stress_test.py` CẤM chạy vào prod khi syncer bật (đã gây 64 đơn ảo — xem `docs/cleanup-fake-orders-2026-07-23.md`).
