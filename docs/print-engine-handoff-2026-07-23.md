# Handoff — Print Engine mới (spool) + bug thiếu `sku`

**Ngày:** 2026-07-23 · **Nhánh:** `launch-hardening` · **Cho:** Antigravity (chạy stress test + plan fix)

Tài liệu này để một agent KHÔNG có context trước vẫn nắm được: (A) print engine mới đã build & đang chạy prod, (B) một bug sync riêng vừa phát hiện. Nhiệm vụ đề nghị ở §5 và §7.

---

## 1. TL;DR

- Đã thay pipeline in của quán bằng **spool bền, transport-agnostic**: đơn không in trực tiếp nữa mà **enqueue vào SQLite spool** (`print_spool` table trong `outbox.db`); **1 worker thread tuần tự / máy in** rút ra, render, gửi máy in, confirm, đánh dấu.
- Mục tiêu: hết **rớt đơn / thiếu ly / lặp tem** (XP-365B TSPL) và **bill đen / mất header / kẹt đơn dài** (POS-58L ESC/POS).
- **Đang CHẠY trên prod** (Mac Mini) ở chế độ `PRINT_ENGINE=spool`, transport `cups`. Đã verify live: tem + bill in, 0 failed.
- Gated sau cờ `PRINT_ENGINE` (mặc định `legacy`) → đảo ngược được. Transport tách lớp: USB hôm nay, TCP 9100 (máy mạng) mai chỉ thêm 1 class.
- 78 unit test xanh + smoke test live-server chạy được không cần phần cứng.
- **Bug riêng phát hiện tình cờ:** 40 đơn hôm qua kẹt sync lên Google Sheets vì GAS từ chối `item must have sku, qty`. Đã in local, chưa lên Sheets. KHÔNG do engine mới (§7).

---

## 2. Kiến trúc print engine mới

3 lớp, phụ thuộc 1 chiều (render không biết gì về transport/spool):

```
Render     printlib.py                         -> bytes (ESC/POS raster + text, TSPL)
              ^
Spooler    print_spool.py (table print_spool)  -> nguồn sự thật "đã in chưa"
           print_worker.py (1 thread/máy in)       claim -> render -> send -> confirm -> mark
              ^
Transport  transport.py                         -> Cups | Usb | Tcp | Serial (+ fallback Cups)
```

**Nguyên tắc cốt lõi:**
- **1 spool job = 1 output vật lý** (1 ly tem, hoặc 1 bill). Đơn 10 ly = 10 row. `idempotency_key = "{order_id}:{kind}:{seq}"`, UNIQUE → replay chỉ in lại đúng phần thiếu, không lặp; dedup local+online tự động.
- **1 worker tuần tự / máy in** = không đua cổng USB, gap-sensor không nghẽn.
- **Confirm adaptive:** transport có back-channel (USB EP-IN / TCP recv / ESC-POS `DLE EOT`) thì đọc trạng thái xác nhận; không thì pacing theo thời gian (label +0.8s cho gap-sensor XP-365B). Trên `cups` transport = pacing (caps rỗng).
- **Mark GAS chỉ sau khi in vật lý xong** (worker gọi `mark_labels_printed`/`mark_printed`); job `failed` KHÔNG bao giờ bị mark. Reconciler retry mark nếu GAS offline.
- **Cash drawer** nhúng trong bytes bill **trước lệnh cắt**, gate `is_cash` (VietQR không kích két).
- Cả đường **local `/order`** lẫn **online poller** cùng nạp 1 spool. Poller gate theo `PRINT_ENGINE` (legacy → POST `/print/*` + tự mark GAS; spool → POST order JSON tới `/enqueue/*`).

**File map:**
| File | Vai trò |
|---|---|
| `print-server/print_spool.py` | schema + enqueue + state machine (claim/mark/requeue/orphan-recovery/stats) + GAS-mark bookkeeping |
| `print-server/print_worker.py` | `PrintWorker.process_one()` — vòng đời 1 job |
| `print-server/transport.py` | `Transport` base + Cups/Usb/Tcp/Serial + `build_transport` + `probe_capabilities` + `confirm` |
| `print-server/printlib.py` | render (đã sửa: gate drawer `is_cash`, `label_setup_preamble()`, xóa dead `build_order_labels_tspl_batched`) |
| `print-server/print_server.py` | wire Flask: routes `/enqueue/labels` `/enqueue/receipt`, `_render_job`, `_gas_mark`, `_reconcile_gas_marks_once`, `_start_workers`, `/health` spool stats, gate `/order` + `/order/mark_paid` theo `_print_engine()` |
| `print-server/print_poller.py` | poller gate theo `PRINT_ENGINE` |

---

## 3. Trạng thái deploy hiện tại (PROD — Mac Mini)

- launchd `com.lamha.kissaten.printserver.plist` → `EnvironmentVariables`: `PRINT_ENGINE=spool`, `LABEL_TRANSPORT=cups`, `RECEIPT_TRANSPORT=cups`, `GATEWAY_DB=/Users/dpd/Projects/lamha-kissaten/print-server/outbox.db`, `SERVER_PORT=5001`.
- Máy in: `Xprinter_XP_365B` (tem, TSPL) + `GEZHI_POS_Printer` (bill, ESC/POS) qua CUPS.
- `poller` plist CHƯA set `PRINT_ENGINE=spool` (vẫn legacy) → online path còn đi `/print/*`. Local `/order` đã qua spool.
- Restart đúng cách (env mới cần load lại): `launchctl bootout gui/$(id -u)/com.lamha.kissaten.printserver` rồi `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.lamha.kissaten.printserver.plist`. (Bài học: `kickstart -k` đôi khi không áp env mới → process cũ chạy legacy; luôn verify `ps eww $(pgrep -f print_server.py) | tr ' ' '\n' | grep PRINT_ENGINE`.)
- Rollback: đổi `PRINT_ENGINE=legacy` trong plist, bootout+bootstrap. Đường in cũ nguyên vẹn.
- Log: `/tmp/print_server.log`. `curl -s localhost:5001/health` có block `spool: {label/receipt: {pending,printing,failed}}`.

---

## 4. Cách chạy test (không cần máy in)

```bash
cd /Users/dpd/Projects/lamha-kissaten/print-server

# 1) Toàn bộ unit test (kỳ vọng: Ran 78 tests ... OK)
python3 -m unittest discover -s . -p 'test_*.py'

# 2) Smoke live-server: tự dựng server tạm + DB tạm, POST /order + mark_paid, in PASS/FAIL
python3 smoke_spool.py     # kỳ vọng: "SMOKE RESULT: ALL PASS", exit 0

# 3) E2E route (đóng lỗ integration): test_order_spool_e2e (nằm trong bộ ở #1)
```

`smoke_spool.py` + `test_order_spool_e2e.py` KHÔNG đụng `outbox.db` prod (dùng DB tạm) và không cần máy in.

---

## 5. NHIỆM VỤ 1 cho Antigravity — Stress test spool

Mục tiêu: chứng minh đảm bảo **in đúng-một-lần / durable-retry** dưới tải, tìm race/regression per-task review có thể sót.

**Cách drive (server đang chạy spool ở :5001):** POST đơn qua `/order`, mark_paid qua `/order/mark_paid`; đọc trạng thái từ `print_spool` table.

```bash
DB=/Users/dpd/Projects/lamha-kissaten/print-server/outbox.db
# trạng thái job:
sqlite3 "$DB" "SELECT idempotency_key,status,attempts,last_error FROM print_spool ORDER BY id;"
sqlite3 "$DB" "SELECT status,COUNT(*) FROM print_spool GROUP BY status;"
```

**Kịch bản (chạy trên máy thật hoặc qua `smoke_spool.py` mở rộng — KHÔNG cần in giấy nếu chỉ kiểm trạng thái enqueue/DB):**
1. **Burst:** 20–50 đơn `/order` liên tiếp, nhiều delivery_type (dine_in/take_away/delivery) → mọi ly có đúng số label job, không rớt, không lặp key.
2. **Đơn nhiều ly:** 1 đơn 20–50 ly → đúng N label job `[i/N]`, không thiếu/lặp.
3. **Song song:** nhiều client POST đồng thời (label + receipt xen kẽ) → không corrupt state (connection sqlite chia sẻ dưới 1 lock; kiểm không có row lạ/thiếu).
4. **Durability:** đang in giữa chừng `launchctl kill SIGKILL ...printserver`, đợi KeepAlive respawn → worker replay **chỉ in ly còn `pending`/mồ côi**, không lặp ly `printed`.
5. **Máy in lỗi:** disable CUPS (`cupsdisable Xprinter_XP_365B`) rồi đặt đơn → job `printing`→retry→`failed` sau `max_attempts`, có Telegram alert; enable lại + đặt đơn mới → in bình thường. Verify job `failed` KHÔNG bị mark GAS (invariant §8.1).
6. **mark_paid nhiều bill liên tiếp:** N đơn cash/vietqr → **N receipt job order_id KHÁC nhau** (regression: bug cũ tạo `:receipt:0` cho mọi bill → UNIQUE nuốt hết trừ cái đầu; đã fix commit 8c39ff4, giữ test).

**Tiêu chí đạt:** cuối mỗi kịch bản `SELECT status,COUNT(*)` chỉ có `printed` (+ `failed` ở kịch bản 5) — 0 job biến mất, 0 key trùng, số label = tổng ly.

**Giới hạn đã biết cần test/quyết (đọc `print-server/HARDWARE_VALIDATION.md`):**
- Confirm-timeout resend có thể in bill + kích két 2 lần (at-least-once, không ACK trên clone) — chỉ khi bật transport có back-channel.
- USB back-channel `confirm()` hiện coi "any status byte = done" — cần interpret bit idle/paper thật khi bật `LABEL_TRANSPORT/RECEIPT_TRANSPORT=usb` (finding I2).
- `_setup_done` không reset khi transport reconnect → tem sai size nếu máy tem cúp điện giữa phiên (restart printserver để chữa).
- Hai cache `_usb_handles` (transport.py vs print_server.py legacy) — chỉ va nếu chạy đồng thời legacy USB path + spool cho cùng VID/PID.

---

## 6. Ghi chú vận hành đã kiểm chứng live

- Gốc lỗi "response `printed:true` nhưng không in": (1) process cũ chạy **legacy** vì restart chưa áp env plist; (2) máy tem bị **CUPS disabled** → job kẹt hàng đợi. Fix: restart sạch (bootout+bootstrap) + `cupsenable`.
- CupsTransport (khi `*_TRANSPORT=cups`) đã port lại `_wait_queue_empty` + `cupsenable`/`cupsaccept` trước `lpr` (khớp legacy `_send_cups`).

---

## 7. NHIỆM VỤ 2 cho Antigravity — Bug thiếu `sku` (sync đơn kẹt)

**Hiện tượng:** 40 đơn ngày **2026-07-22** kẹt trong `outbox` (`synced_at IS NULL`), syncer đẩy hoài không lên GAS/Sheets. Đơn **đã in tại quán** (local-first in trước sync), chỉ thiếu ở Sheets → hụt báo cáo/loyalty.

**Bằng chứng (`last_error` trên các row `ingest_order` kẹt):**
```
Error: item must have sku, qty
Error: Món không tồn tại hoặc đã ngừng bán: DR090
```
Xem lại:
```bash
sqlite3 /Users/dpd/Projects/lamha-kissaten/print-server/outbox.db \
 "SELECT order_id, substr(last_error,1,80) FROM outbox WHERE synced_at IS NULL AND op='ingest_order' LIMIT 40;"
```

**Chẩn đoán sơ bộ (cần Antigravity xác minh):**
- GAS `ingest_order` (xem `gas/Orders.gs`, hàm ingest/validate) **bắt buộc mỗi item có `sku` + `qty`**. Các đơn kẹt có item **thiếu `sku`** → GAS reject `item must have sku, qty`.
- Đường tạo đơn (KDS `web/kds.html` / `web/order.html` → POST `/order` → `gateway.mint_order` → outbox → syncer POST GAS) **không đính `sku`** vào item ở một số luồng. Item từ `web/menu-data.js` có `sku`; luồng nào tạo item thiếu sku cần tìm.
- `DR090` = SKU đã ngừng bán → cả validation "món không tồn tại" (menu GAS không còn SKU đó).

**Đề nghị plan:**
1. Xác định luồng nào POST `/order` với item thiếu `sku` (grep client build item; kiểm `gateway`/`print_server` có drop `sku` không).
2. Quyết chuẩn: item BẮT BUỘC có `sku` từ client, hay backfill `sku` theo `name` ở gateway/GAS trước ingest.
3. Xử 40 đơn kẹt: backfill `sku` cho payload trong outbox rồi cho sync lại, HOẶC đánh dấu FAILED để ngừng retry vô hạn (hiện `mark_error` chỉ set FAILED cho "Invalid transition"/"Order not found"/"unknown_action" — lỗi `item must have sku` retry mãi).
4. SKU ngừng bán (DR090…): quyết map sang SKU thay thế hay bỏ.

**KHÔNG liên quan print engine** — engine mới in đúng; đây là lỗi data/validation đường sync có từ trước.

---

## 8. Commit map (nhánh `launch-hardening`)

- Spec/plan: `docs/superpowers/specs/2026-07-23-print-pipeline-reliability-design.md`, `docs/superpowers/plans/2026-07-23-print-pipeline-reliability.md`.
- Rollout: `print-server/HARDWARE_VALIDATION.md`.
- Engine commits: `88ce298`..`4781939` (spool/worker/transport/wire/poller + review fixes). Bug receipt-drop fix: `8c39ff4`. Smoke: `4781939`.
- Chưa merge vào `main` (nhánh `launch-hardening` gồm cả loyalty/self-healing/security — chủ repo tự quản merge).

---

## 9. ADDENDUM 2026-07-23 sáng — root cause stress-test CONFIRMED + đã fix (Fable)

**Antigravity đúng.** Verify trực tiếp trên Mac Mini: `/var/log/cups/error_log` có `Job aborted due to backend errors` + `USB pipe stalled` — CUPS usb backend (Apple) đọc back-channel EP 0x81, clone không trả lời → stall → CUPS **tự hủy job SAU khi lpr exit 0** → spool mark `printed` ảo (đơn 3&4 mất). `usb-unidir=true` không ăn trên backend Apple.

**Fix đã ship (live trên prod):**
1. **Chuyển cả 2 máy sang `UsbTransport` trực tiếp (PyUSB)** — test claim/ghi thành công trên macOS, bỏ hẳn CUPS khỏi đường in. Plist: `LABEL_TRANSPORT=usb` (VID 8137/PID 8214/EP 2 = 0x1fc9:0x2016), `RECEIPT_TRANSPORT=usb` (VID 10473/PID 649/EP 1 = 0x28e9:0x0289). Poller cũng flip `PRINT_ENGINE=spool` (bắt buộc atomic: worker giữ claim USB độc quyền — mọi đường `lpr` legacy sẽ fail nếu còn chạy).
2. **Máy bill GEZHI trả lời `DLE EOT` qua USB trực tiếp** → worker receipt chạy confirm back-channel THẬT (`caps={'dle_eot'}`); label pacing. Ký tự rác đầu bill kỳ vọng hết (không còn CUPS mở/đóng cổng).
3. **CupsTransport (fallback) vá verified-submit** (commit `4db115f`): submit qua `lp` lấy job-id, đợi queue trống, soi error_log per-job — job abort → raise → worker requeue. Hết phantom-printed cả trên fallback. 81 test xanh.

**Sự cố vận hành phát hiện khi quét:** stress test chạy thẳng vào prod với syncer bật → **64 đơn ảo ngày 23/07 đã sync lên ORDERS sheet như đơn thật (kèm mark_paid = doanh thu + tem loyalty ảo cho 5 customer_id giả)**. Danh sách + việc cần làm: `docs/cleanup-fake-orders-2026-07-23.md`. Nhiệm vụ stress test §5 sau này: bọc DB tạm / GAS giả, KHÔNG bắn thẳng prod.
