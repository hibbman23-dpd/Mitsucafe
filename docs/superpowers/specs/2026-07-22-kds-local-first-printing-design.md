# KDS Local-First Printing + Status UX đơn giản hoá

> Design doc · 2026-07-22 · Kissaten Ordering System
> Nguồn liên quan: [labels-print.md](../../system/labels-print.md) · [offline-failover.md](../../system/offline-failover.md) · CLAUDE.md §1–§2 · [loyalty-stamp-spend-tier](2026-07-18-loyalty-stamp-spend-tier-design.md)

## 1. Bối cảnh & vấn đề

Đường đi hiện tại của 1 đơn tạo tại KDS (dine_in/pickup):

```
KDS (kds.html) --POST--> GAS doPost → ghi ORDERS Sheets        [round-trip #1, cần internet]
Mac Mini print_poller --poll 3–10s--> GAS ?action=pending_labels [round-trip #2]
   → build TSPL → POST 127.0.0.1:5001 (print_server.py) → in tem
   → GAS ?action=mark_labels_printed                            [round-trip #3]
```

Hệ quả:
- **Độ trễ in tem** = ghi GAS + chờ nhịp poll (tối đa 10s) + đọc GAS + in LAN.
- **Fail chung**: GAS 403 (chu kỳ 7 ngày, offline-failover §L5) hoặc rớt internet → tem KHÔNG in được, dù máy in nằm ngay trên LAN.

Mục tiêu: đơn tạo tại quầy **in tem tức thì qua LAN**, cloud sync sau. Đồng thời **giảm số nút** barista bấm để chuyển trạng thái.

## 2. Goals / Non-goals

**Goals**
- Đơn tạo tại KDS/quầy (dine_in, pickup) in tem tức thì, không phụ thuộc round-trip GAS.
- Sync lên GAS/Sheets bất đồng bộ, bền, exactly-once effect (không đếm đôi doanh thu / cấp đôi tem).
- Đơn quầy còn 1 nút [Xong] (+ toggle "Đang pha" ẩn), auto-CONFIRMED khi tạo.
- Giữ GAS = event bus + database duy nhất (CLAUDE.md §1). Không external DB mới ngoài outbox tạm trên box.

**Non-goals (phạm vi A đã chốt)**
- Đơn QR khách + remote (phone/maps/FB/IG/TikTok/delivery) **giữ nguyên** đường GAS→poller. Không đưa qua box.
- Không mở port box ra internet. Box chỉ nghe LAN.
- Không đổi luồng thanh toán VietQR/bank webhook. Không đổi receipt lúc DELIVERED cho đơn remote.

## 3. Kiến trúc tổng thể

Thành phần mới: **KDS Gateway** — **các route nhồi vào `print_server.py` sẵn có** (không tạo service mới; đã có daemon Python + launchd plist + printlib + logging → gom 1 process cho ops solo gọn, chốt Q3). Giữ code tách module trong file: `gateway_routes`, `outbox`, `syncer_thread`, `codeblocks` — để test độc lập và cô lập lỗi. In tem/receipt **in-process** (import printlib), không hop localhost. Chỉ bind LAN (`0.0.0.0` trong wifi quán, không expose internet). Poller (`print_poller.py`) **giữ nguyên process riêng** cho đơn remote/QR.

```
KDS (kds.html)
  │  thử box trước; timeout → fallback POST thẳng GAS (giữ đường L3 cũ)
  ▼
KDS Gateway (Mac Mini, LAN)
  1. mint order_id (random, format ORD-YYYYMMDD-XXXX) + short_code (rút từ block hi-lo)
  2. status = CONFIRMED ngay (auto-confirm đơn quầy)
  3. render + IN TEM in-process (import printlib dùng chung với poller)
  4. ghi outbox SQLite (bền, sống qua reboot)
  5. trả {order_id, short_code} cho KDS  ← khách/barista thấy mã tức thì
  │
  ▼ Syncer thread (nền)
  POST GAS ?action=ingest_order (token) → append ORDERS idempotent + Telegram alert
  ack 2xx → set synced_at trong outbox
```

GAS vẫn là database + event bus. Chỉ **tạo-đơn + in tem** là local-first. **Status update / mark_paid / receipt DELIVERED giữ đi thẳng GAS** (không gấp về độ trễ, cần cloud sẵn) — trừ phần auto-CONFIRMED nằm ở box lúc tạo.

## 4. KDS Gateway — chi tiết

Ngôn ngữ: Python (đồng bộ hệ sinh thái print-server hiện có). Có thể là service mới `kds_gateway.py` hoặc route thêm vào `print_server.py`. Chạy bằng launchd plist (theo mẫu `com.lamha.kissaten.printpoller.plist`).

**Endpoints (LAN-only):**
| Method | Path | Việc |
|---|---|---|
| POST | `/order` | Nhận payload đơn từ KDS → mint id/code → in tem → enqueue outbox → trả `{order_id, short_code, printed, warning?}`. Dedup theo `idempotency_key`: gọi lại cùng key → trả kết quả cũ, không in lại |
| GET | `/order?key=<idempotency_key>` | Tra cứu kết quả đơn theo key (cho client confirm-before-fallback, §5a) |
| POST | `/order/status` | Chuyển trạng thái (MAKING/READY/DELIVERED). Online → đẩy thẳng GAS; offline → enqueue outbox, sync sau. Đóng đơn 100% offline (R4) |
| POST | `/order/mark_paid` | [Xong] cash: online→GAS `mark_paid`; offline→in receipt local (build_receipt) + enqueue mark_paid. Đóng tiền 100% offline (R4) |
| GET | `/health` | Trạng thái: block hi-lo còn lại, outbox backlog, printer OK, GAS reachable |

**Outbox (SQLite trên đĩa Mac Mini)** — hàng đợi op tổng quát (create / status / mark_paid), sync theo thứ tự FIFO **per order** (status không được vượt create):
```sql
CREATE TABLE outbox (
  seq           INTEGER PRIMARY KEY AUTOINCREMENT,  -- thứ tự FIFO toàn cục
  op            TEXT NOT NULL,   -- 'ingest_order' | 'status' | 'mark_paid'
  order_id      TEXT NOT NULL,
  idempotency_key TEXT,          -- create: UNIQUE; status/mark_paid: khoá op riêng
  payload       TEXT NOT NULL,   -- JSON gửi GAS
  short_code    TEXT,
  printed_at    TEXT,            -- create: lúc box in tem; mark_paid: lúc in receipt local
  synced_at     TEXT,            -- NULL = chưa lên GAS
  attempts      INTEGER DEFAULT 0,
  last_error    TEXT
);
CREATE UNIQUE INDEX ux_outbox_key ON outbox(op, idempotency_key);
CREATE TABLE code_blocks (       -- block hi-lo đã giữ
  date TEXT, letter TEXT, next_seq INTEGER, block_to INTEGER, emergency INTEGER DEFAULT 0
);
```

Syncer: chọn op `synced_at IS NULL` theo `seq` tăng dần → POST GAS → 2xx+ack set `synced_at`; lỗi → `attempts++`, backoff (2^n giây, trần 60s). **Chặn status vượt create**: op `status`/`mark_paid` của 1 order chỉ sync sau khi op `ingest_order` của order đó đã `synced_at` (nếu không GAS chưa có row để update). At-least-once phía box + idempotent phía GAS = **exactly-once effect**.

## 5. Luồng dữ liệu

**a. Tạo + in (đường nóng, hoàn toàn LAN):**
1. KDS sinh `idempotency_key` (UUID) **1 lần/đơn, giữ lại để mọi retry dùng chung**.
2. KDS POST `/order` (payload + key).
3. Gateway: nếu `idempotency_key` đã có trong outbox → trả kết quả cũ, KHÔNG in lại.
4. Mint `order_id` + `short_code` (§6). Build order status=CONFIRMED, `confirmed_at`=now, `label_printed_at`=now (poller bỏ qua).
5. In tem (printlib). In lỗi → vẫn enqueue, trả `warning:"print_failed"` → KDS hiện "in lại".
6. Insert outbox. Trả `{order_id, short_code}`. KDS **Optimistic UI insert** ngay (§5c).

**Chống split-brain khi client timeout (R1 — bác cách ghi đè PK của Antigravity):**
- KDS **phân biệt lỗi**: `connection refused`/DNS fail (box chết thật, nhanh) ≠ response timeout (box có thể còn sống, wifi chậm).
- Timeout → **KHÔNG fallback ngay**. Retry `GET /order?key=<idempotency_key>`. Box còn sống → trả record đã in → dùng `order_id/short_code` của box (box = truth), **không** đụng GAS, **không** đôi tem.
- Chỉ khi box **thật sự không reach** (refused/hết retry) → fallback `POST GAS` cùng `idempotency_key`.
- GAS dedup **first-writer-wins**: row đầu tiên mang key đó thắng; op tới sau (box sync sau fallback, hoặc double-submit) → trả `order_id` sẵn có, **không append row 2, không cấp lại tem/tiền, KHÔNG ghi đè PK**.
- Vì sao bác ghi đè PK: order_id là khoá gốc + ORDERS append-only (§4); lúc fallback poller đã in tem Q13 và board/financials đã tham chiếu Q13 → ghi đè sang Q12 tạo THÊM bất nhất. Confirm-before-fallback đã chặn ca blip thường gặp (box sống, chỉ chậm). Ca sót duy nhất: box in xong RỒI chết trước khi client confirm → mới có tem thừa; cực hiếm, chấp nhận + ghi rõ §11.

**b. Sync (đường nguội, nền):** §4 syncer. GAS `ingest_order` append verbatim (không re-mint), dedup, Telegram NEW-alert, set `label_printed_at` = box gửi.

**c. Board read — Optimistic UI (phase 1, thay merge `/pending`):** KDS vẫn `GET ?action=orders` từ GAS làm nguồn nền. Ngay khi POST `/order` thành công + nhận `{order_id, short_code}`, JS `kds.html` **chèn đơn thẳng vào state mảng orders** → ticket nảy lên màn 0ms cùng lúc tem ra. Lượt `?action=orders` kế về → dedup theo `order_id` (đơn optimistic đã có, không nhân đôi). Không cần merge backend. `/pending` hoãn phase 2.

## 6. short_code hi-lo + watermark refactor

Vấn đề: `short_code` = chữ (Q/M/G) + số chạy trong ngày, hiện tính bằng **đếm số dòng ORD-hôm-nay** ([Orders.gs:223 buildShortCode](../../gas/Orders.gs)). Hai nơi mint (box + GAS) đếm độc lập → đụng mã.

**Đổi sang bộ đếm watermark (bắt buộc):**
- GAS giữ watermark per-day-per-letter trong `PropertiesService` (hoặc 1 vùng CONFIG), là **nguồn sự thật duy nhất** cho số chạy, thay cho đếm dòng.
- `buildShortCode(letter)` (mint thường, đơn GAS-origin): dưới `LockService` → `seq = ++watermark[date][letter]`.
- **Khởi tạo watermark = `MAX(seq)` của mã hôm đó, KHÔNG phải `COUNT(rows)`** (R3): đơn bị huỷ/xoá không làm tụt số → không tái cấp mã đã in.
- Endpoint mới `?action=reserve_codes&type=<dine_in|pickup>&n=<N>` (token, dưới `LockService`): `from = watermark+1; watermark += N`; trả `{letter, date, from, to}`. Box phát Q<from..to> local, không round-trip mỗi đơn.
- Box giữ sẵn ≥1 block; block gần cạn → xin block kế (làm nền, không chặn đường nóng nếu còn dư).

**Midnight rollover (R3):** block hi-lo + emergency band **gắn `date`**. Trước khi phát mã, Gateway check `date` hiện tại:
- Sang ngày mới → **flush** block dư của ngày cũ (không dùng lại), xin block mới cho ngày mới.
- Emergency band `QX*` **reset về QX1 theo ngày**.
- GAS watermark cũng theo `date` key → tự nhiên reset khi ngày đổi.

**Offline band (GAS chết + block cạn):** box dùng dải khẩn cấp GAS **không bao giờ mint** — hậu tố `X`: `QX1, QX2…` (nhìn biết đơn offline). `reserve_codes`/`buildShortCode` không bao giờ sinh mã có `X`. Nối mạng lại: các đơn `X` sync bù bình thường (tem đã in), GAS lưu verbatim.

## 7. Status UX — phương án đã chốt (1 nút + toggle "pha" ẩn)

Đơn quầy: `NEW→CONFIRMED→MAKING→READY→DELIVERED` (4 bấm) → rút còn:

- **Auto-CONFIRMED khi tạo** (box đặt status=CONFIRMED). 0 thao tác barista.
- **Bỏ nút MAKING** khỏi mặc định. `making_at` tự điền lúc bấm nút kế (xấp xỉ, giữ analytics prep-time không lủng).
- **Toggle "Đang pha" ẩn**: nút phụ (ẩn sau icon/long-press) cho ca đông muốn hiện đang-làm → set MAKING + `making_at` thật. Không bắt buộc.
- **1 nút [Xong]** = đóng đơn.
- **READY chỉ giữ cho pickup (chốt Q1: pickup 2 nút, dine-in 1 nút)**: đơn pickup hiện thêm nút [Sẵn sàng] (READY + ping Zalo "ra lấy") trước [Xong]. Dine_in ẩn nút này (khách ngồi tại chỗ, không cần ping). Giá trị vận hành thật: pickup khách đi xa cần ping ra lấy.

## 8. Ngữ nghĩa nút [Xong] (đụng 2 track — thiết kế cẩn thận)

Sự thật code: **tiền + tem + receipt + financials cấp ở `markOrderPaid`** ([Orders.gs:406](../../gas/Orders.gs)), idempotent (guard `payment_status=PAID`), bypass transition. `status=DELIVERED` là track riêng cho board.

[Xong] payment-aware:
- **Cash (mặc định đơn quầy):** [Xong] = `mark_paid` (ghi PAID + `_creditStampsForOrder` + receipt + `computeDailyMetrics`) **và** set `status=DELIVERED`. 1 tap đóng trọn.
- **VietQR:** payment do bank webhook lo (`Payment.gs` → `markOrderPaid`). [Xong] của barista = set `status=DELIVERED` (giao ly). Nếu webhook chưa về, đơn DELIVERED nhưng `payment_status=PENDING` tới khi khớp CK — không cấp tem/không tính doanh thu tới lúc PAID (đúng như hiện tại).

**[Xong] + status đi qua Gateway để offline 100% (R4):** KDS gọi `POST box/order/mark_paid` (cash) hoặc `POST box/order/status` — **không** gọi thẳng GAS. Gateway:
- Online → đẩy thẳng GAS (`mark_paid`/`update_status`), trả kết quả.
- Offline → **in receipt local** ngay (cash, dùng `build_receipt` có sẵn) + enqueue op vào outbox → sync khi mạng về. Barista đóng đơn/thu tiền được cả khi rớt internet.
- Stamp cấp lúc op `mark_paid` sync tới GAS (trễ nếu offline) — `chot-ca` cuối ca cần chờ outbox cạn trước khi đối soát (ghi ở §10.7).

**Chốt Q2 — set DELIVERED qua nới `VALID_TRANSITIONS`** (`CONFIRMED→DELIVERED`), giữ state machine minh bạch, không path bypass ngoại lệ.

Idempotency đầu-cuối: `idempotency_key` từ KDS → outbox → GAS. `markOrderPaid` guard PAID. Retry ở bất kỳ tầng nào không cấp đôi tem/tiền/receipt.

## 9. Thay đổi GAS

| Hạng mục | File | Việc |
|---|---|---|
| `action=ingest_order` (POST) | Code.gs + Orders.gs | Auth token. Append đơn pre-minted **verbatim** (không re-mint id/code). Dedup `idempotency_key` + `order_id`. Gửi Telegram NEW-alert. Set `label_printed_at` từ payload. KHÔNG enqueue label (đã in). |
| `action=reserve_codes` | Code.gs + Orders.gs | Dưới `LockService`, cấp dải hi-lo, đẩy watermark. |
| `buildShortCode` refactor | Orders.gs | Đếm dòng → watermark (PropertiesService/CONFIG). Caller: doPost create ([Code.gs:679](../../gas/Code.gs)). |
| `VALID_TRANSITIONS` | Orders.gs:21 | Nới `CONFIRMED→DELIVERED` (chốt Q2 — đường [Xong]). Không mở transition sai khác. |
| Chống double-receipt | Orders.gs:311 + Orders.gs:424 | Verify `printThermalReceipt` idempotent qua `printed_at` khi cả DELIVERED-side-effect lẫn markOrderPaid cùng gọi. |
| `mark_paid`/`update_status` nhận từ Gateway | Code.gs | Giữ nguyên endpoint; Gateway là caller mới (proxy khi online, outbox khi offline). Không đổi logic GAS. |

## 10. Bán kính sự cố — workflow bị đụng (điểm anh iu dặn plan kỹ)

Mỗi mục = 1 hạng mục kiểm thử bắt buộc:

1. **VALID_TRANSITIONS** — nới `CONFIRMED→DELIVERED`. Kiểm: đơn remote đi full flow vẫn hợp lệ; không mở transition sai (vd DELIVERED→*).
2. **Double receipt** — `_runStateSideEffects(DELIVERED)` và `markOrderPaid` đều gọi `printThermalReceipt`. Kiểm `printed_at` dedup thật; [Xong] cash chạy cả hai không in 2 lần.
3. **buildShortCode watermark** — mọi caller (doPost create) chuyển sang watermark; migration khởi tạo watermark từ max seq hôm nay để không tụt số.
4. **Board KDS** (`action=orders`, [Code.gs:142](../../gas/Code.gs) lọc theo status) — auto-CONFIRMED nghĩa là gần như không còn đơn NEW cho đơn quầy; verify board vẫn hiện đúng, không lọc rớt.
5. **pending_labels / label_printed_at** — box set `label_printed_at` lúc tạo → poller `poll_labels_once` bỏ qua (không in đôi). Đơn remote/QR vẫn có `label_printed_at` rỗng → poller vẫn in. Kiểm cả hai nhánh.
6. **Financials** (`computeDailyMetrics` qua markOrderPaid) — [Xong] cash gọi đúng 1 lần; đơn VietQR tính lúc webhook như cũ.
7. **Cash reconciliation** (CashRecon.gs, skill `chot-ca`) — đọc đơn cash PAID. [Xong] cash set PAID → vào recon. Kiểm không lệch két.
8. **Zalo notify** (Notify.gs `buildZaloStatusMessage`/`sendZaloNotify`) — dine_in bỏ MAKING/READY ping; pickup giữ READY ping. Verify không gửi ping thừa cho khách đang đứng quầy.
9. **Free-drink pending count** ([Orders.gs:524](../../gas/Orders.gs), đếm đơn UNPAID chưa cancel) — [Xong]=PAID đổi tập UNPAID. Giao với lỗi double-spend ly free đang treo (task_d28049e3) — kiểm kỹ.
10. **Idempotency đầu-cuối** — box retry + webhook + KDS double-submit không cấp đôi tem/tiền.
11. **Fallback L3** — box chết → KDS POST thẳng GAS như cũ, poller in. Kiểm timeout→fallback hoạt động; đơn không mint 2 lần (nếu box in rồi mới chết trước khi trả response, KDS fallback GAS → có thể đôi; dùng `idempotency_key` để GAS/box dedup khi box sống lại đẩy outbox — chốt reconciliation ở implementation).

## 11. Failure modes

| Tình huống | Hành vi |
|---|---|
| Box up, GAS 403/down | Đơn quầy **vẫn in + [Xong]/thu tiền được** (receipt in local, op vào outbox); syncer tự đẩy khi GAS sống. Bán kính 403 co còn "sync trễ". |
| Box down (Mac crash) | KDS `connection refused` → fallback POST GAS; poller in (L3 cũ). Box sống lại → tiếp tục. |
| Box up nhưng response timeout | KDS **KHÔNG fallback ngay** → `GET /order?key` confirm; box còn sống trả record → dùng truth của box, không đôi tem (R1). |
| In lỗi (kẹt giấy) | Đơn vẫn vào outbox; trả warning; KDS hiện "in lại". Không nuốt đơn. |
| GAS chết + block hi-lo cạn | Box dùng offline band `QX*` (reset theo ngày); reconcile khi nối lại. |
| KDS double-submit | `idempotency_key` chặn ở box + GAS (first-writer-wins). |
| **Ca sót hiếm (R1):** box in tem RỒI chết trước khi client confirm | Client fallback GAS → có tem thừa (Q_box orphan) + tem GAS (Q_gas) là truth. Box sống lại sync → GAS thấy key tồn tại → **skip, không đôi row/tiền/tem loyalty**. Barista dùng mã trên màn (Q_gas). Cực hiếm, chấp nhận. |

## 12. Kiểm thử — gate 4 lớp (model rẻ chạy, chief đọc)

- **Unit:** hi-lo reserve+mint đồng thời không overlap; watermark init từ MAX (đơn huỷ không tụt số); **midnight rollover** flush block cũ + reset QX* (R3); ingest idempotent (dedup key+order_id, **first-writer-wins không ghi đè PK** — R1); offline band unique & không do GAS mint; markOrderPaid idempotent giữ nguyên; VALID_TRANSITIONS mới; **outbox FIFO chặn status vượt create**.
- **Syntax:** GAS + Python.
- **API smoke:** reserve → ingest → 1 dòng append, `label_printed_at` set, Telegram gửi 1 lần; mark_paid 2 lần → tem cấp 1 lần; **confirm-before-fallback: timeout rồi `GET /order?key` trả record cũ, không mint đôi** (R1).
- **E2E browser:** KDS tạo → tem in (LAN) + **ticket nảy UI 0ms** (Optimistic) → xuất hiện Sheets → [Xong] cash → PAID+DELIVERED+receipt+tem đúng 1 lần; pickup có ping READY; **rớt internet: [Xong] vẫn in receipt local + queue** (R4); đơn remote không đổi hành vi.

## 13. Rollout

1. Tách `printlib.py` khỏi `print_poller.py` (không đổi logic) — an toàn, làm trước.
2. GAS: watermark refactor (init từ MAX) + `reserve_codes` + `ingest_order` (deploy, chưa ai gọi → không phá gì).
3. Gateway routes nhồi vào `print_server.py` + outbox + syncer thread + codeblocks (module tách). Poller giữ process riêng cho remote/QR + receipt.
4. KDS: feature-flag `LOCAL_FIRST` — bật thì post box-first + confirm-before-fallback + Optimistic UI insert; tắt thì như cũ. Rollback tức thì.
5. Status UX (auto-CONFIRMED + [Xong] + toggle pha + pickup 2 nút) + route [Xong]/status qua Gateway — sau khi đường local-first ổn định, **tách PR riêng** để bán kính nhỏ.

## 14. Quyết định đã chốt (từ review Antigravity + Grok, chief thẩm định)

| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Pickup 1 hay 2 nút | **Pickup 2 nút** ([Sẵn sàng]+[Xong]), **dine-in 1 nút**. Pickup cần ping Zalo ra lấy (§7). |
| Q2 | [Xong] set DELIVERED qua đâu | **Nới `VALID_TRANSITIONS` `CONFIRMED→DELIVERED`**, giữ state machine minh bạch, không path bypass (§8–§9). |
| Q3 | Gateway service mới hay gộp | **Gộp routes vào `print_server.py`**, module tách trong file. Ops solo 1 process gọn (§4). |
| Q4 | Board merge `/pending` phase mấy | **Optimistic UI insert ở `kds.html` phase 1**; backend `/pending` hoãn phase 2 (§5c). |

**Đã hấp thụ 4 rủi ro review:** R1 split-brain (confirm-before-fallback + first-writer-wins, **bác ghi đè PK** — §5a, §11); R2 board lag (Optimistic UI — §5c); R3 midnight rollover + watermark MAX (§6); R4 [Xong] offline qua Gateway outbox + receipt local (§4, §8).
