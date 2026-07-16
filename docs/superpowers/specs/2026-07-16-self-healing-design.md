# Self-Healing System — Design Spec

**Ngày:** 2026-07-16 · **Trạng thái:** chờ duyệt → plan
**Nguồn:** brainstorm session 2026-07-16, hợp nhất góp ý Grok Build (`self_healing_assessment.md`) sau khi chief kiểm chứng lại bằng code.

---

## 1. Vấn đề

Hiện tại: lỗi nổ trong GAS → `logError()` ghi `ERROR_LOG` + bắn Telegram → **người đọc, người sửa, người deploy**. Chủ quán phải mở máy, đọc log, chẩn đoán, sửa, push. Ban đêm hoặc lúc bận bán hàng thì lỗi nằm đó.

Mục tiêu: lỗi tự chảy vào một vòng sửa có kiểm soát. Lỗi lành thì tự sửa + tự push. Lỗi chạm tiền/auth thì Claude chuẩn bị sẵn fix + diff, chủ bấm duyệt trên Telegram. Lỗi không sửa được bằng code thì báo ngược Telegram cho người làm tay.

**Không phải mục tiêu:** thay thế người. Vòng này rút ngắn khâu chẩn đoán + soạn fix, không rút ngắn khâu quyết định.

---

## 2. Hạ tầng đã có (không xây lại)

| Thành phần | Vị trí | Vai trò trong vòng healer |
|---|---|---|
| `logError(context, err)` | `gas/Utils.gs:101` | Điểm bắt lỗi duy nhất. Đã ghi ERROR_LOG + throttle Telegram 6h/context. |
| `sendTelegramAlert(message)` | `gas/Notify.gs:5` | Gửi Telegram một chiều. HTML parse_mode. |
| `COMMAND_QUEUE` + `dispatch_pull` | `gas/Commands.gs` | Hàng đợi lệnh chat. Healer **không** dùng chung tab này, nhưng dùng chung `dispatch_pull`. |
| `ops/dispatcher.sh` | cron 2 phút | Poller + lock. Healer bám vào đây. |
| `ops/gas_push.py --deploy` | | Push + tạo version + retarget deployment prod. |
| `ops/deploy_gas.js` | | Deploy fan-out đa chi nhánh + smoke test. **Có bug, xem §9.** |
| `ops/test_logic.js` | | 8 test, `node:test` + GAS mock qua `vm`. Mỏng. |

**Ghi chú sửa sai:** memory `project_gas_deploy.md` ghi "redeploy version vẫn làm tay trong editor" — **sai/cũ**. `gas_push.py --deploy` và `deploy_gas.js` đều tạo version + retarget qua Apps Script API. Cần cập nhật memory.

---

## 3. Quyết định đã chốt

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **Phân tầng theo loại lỗi**, không phải all-auto hay all-manual | Lỗi lành tự chạy, lỗi chạm tiền phải có người. |
| D2 | **Hai cổng AND**: nhãn lỗi ∈ whitelist **VÀ** diff chỉ chạm file green | Nhãn lỗi không dự đoán được fix chạm gì. Lỗi nổ ở `Insight.gs` có thể phải sửa `Payment.gs`. |
| D3 | **Gate là script deterministic**, không phải Claude tự phán | Gate mềm = model tự thuyết phục mình rằng "chạm Payment.gs nhỏ thôi". |
| D4 | **v1 chỉ GAS**. Web (`web:*`) hoãn v2 | Xem §11. |
| D5 | **Telegram 2 chiều**, secret riêng `HEALER_WEBHOOK_SECRET` | Duyệt từ điện thoại. Không dùng chung `REPORT_API_TOKEN`. |
| D6 | **Smoke live + auto-rollback + mỗi fix phải kèm 1 test trượt-trước-fix** | Test suite hiện mỏng; rollback bù cho nó. Test bắt buộc làm lưới dày dần. |
| D7 | **Kiến trúc B**: `FIX_QUEUE` riêng, dùng chung tiến trình + lock dispatcher | State machine sạch, mà vẫn 1 process Claude tại 1 thời điểm → không race git/deploy API. |
| D8 | **Healer chạy trong git worktree riêng** | Xem §8. |
| D9 | **Green list đóng, mọi thứ khác mặc định RED** | Fail-closed. Không có file "chưa phân loại". |

---

## 4. Luồng

```
GAS logError(context, err, snapshot?)
  ├→ ERROR_LOG (+ cột snapshot đã che PII)          [như cũ + 1 cột]
  ├→ Telegram throttle 6h/context                    [như cũ]
  └→ enqueueFix(context, error_id)                   [MỚI]
       ├ dedup: context đã có fix mở → bỏ qua
       ├ attempts >= 2 → status=manual + Telegram → DỪNG
       └ deploy cooldown: >3 auto-deploy/giờ → status=manual

ops/dispatcher.sh (cron 2', lock dùng chung)
  → dispatch_pull
      ├ có fix pending/approved? → claude -p "/fix"
      └ có lệnh chat pending?    → claude -p "/inbox"     [như cũ]

/fix skill — chạy trong worktree ops/.healer-wt (tạo sạch từ origin/main):
  1. git fetch origin && git checkout -b fix/ERR-xxx origin/main
  2. đọc ERROR_LOG row (context, message, stack, snapshot)
  3. superpowers:systematic-debugging → root cause
  4. viết test TRƯỢT tái hiện lỗi (mock dựng từ snapshot)      [bắt buộc]
  5. viết fix → test XANH
  6. GATE (ops/healer_gate.js, deterministic):
       context ∈ context_whitelist  AND  git diff --name-only ⊆ GREEN_LIST ?
         ├ CÓ  → merge vào main → push → deploy → smoke live
         │        ├ smoke xanh → status=pushed  → Telegram "vN đã sửa"
         │        └ smoke đỏ  → retarget vN-1   → status=rolled_back
         │                    → Telegram "ĐÃ ROLLBACK, cần người"
         └ KHÔNG → commit + push nhánh fix/ERR-xxx lên remote
                   worktree về main (sạch cho fix kế tiếp)
                   status=awaiting_approval
                   Telegram: context + message + diff + kết quả test
                             + inline button [DUYỆT] [BỎ]
  7. không tìm ra root cause / test không xanh sau bước 5
       → status=manual + Telegram "cần người, đây là những gì em biết: ..."

Telegram webhook (doPost, verify secret_token + chat_id chủ)
  [DUYỆT] → FIX_QUEUE status=approved
            → kỳ dispatcher sau: checkout fix/ERR-xxx → merge main → deploy → smoke
  [BỎ]    → status=rejected, xoá nhánh remote
```

---

## 5. `FIX_QUEUE` schema

Tab mới trên Sheets. Cột:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `fix_id` | string | `FIX-YYYYMMDD-XXXX` |
| `error_id` | string | trỏ về dòng ERROR_LOG |
| `context` | string | copy từ logError — khoá dedup |
| `error_message` | string | |
| `stack_trace` | string | |
| `snapshot` | string | JSON đã che PII (§7) |
| `status` | enum | `pending` `fixing` `awaiting_approval` `approved` `rejected` `pushed` `rolled_back` `manual` |
| `git_branch` | string | `fix/ERR-xxx`, rỗng nếu chưa tạo |
| `gate_result` | string | `green` / `red:<file vi phạm>` — audit trail |
| `deployed_version` | number | versionNumber sau deploy, để rollback |
| `attempts` | number | trần = 2 |
| `created_at` / `updated_at` | ISO | |

**Trạng thái "mở"** (chặn dedup): `pending` `fixing` `awaiting_approval` `approved`.
**Trạng thái "đóng"**: `pushed` `rejected` `rolled_back` `manual`.

---

## 6. Gate — `ops/healer_gate.js`

Script node độc lập. Không có Claude trong đó. Input: `context` + `git diff --name-only origin/main...HEAD`. Output: exit 0 (green) / exit 1 + lý do (red).

### 6.0 Hai cổng, cả hai đều cơ học

**Cổng A — nhãn lỗi.** `context` trong `logError` là **tên hàm**, không phải tên file (`gbp.fetch`, `markOrderPaid.loyalty`, `doPost.telegram`). Nên không liệt kê tay danh sách context — nó sẽ trôi lệch mỗi lần đổi code.

Gate **tự suy**: grep `logError('<context>'` trong `gas/` → tìm file khai báo → file đó phải ∈ GREEN_LIST.

- Context xuất hiện ở **nhiều** file → tất cả phải green, không thì red
- Context **không tìm thấy** (sinh động lúc chạy) → **red** (fail-closed)
- `trim()` hai đầu trước khi so khớp — trong code thật đang có context dính khoảng trắng đuôi (`_runStateSideEffects `, `meta.get `)

**Cổng B — file diff chạm.** `git diff --name-only origin/main...HEAD` ⊆ GREEN_LIST.

Green = A **AND** B. Trượt bất kỳ cổng nào → red → đường duyệt tay.

### Luật để một file được GREEN — phải đủ cả 3

1. Không đọc bất kỳ `*_TOKEN` / `*_SECRET` nào
2. Không **ghi** vào `ORDERS` / `CUSTOMERS` / `PROMOTIONS` (đọc thì được)
3. Thao tác huỷ (`clearContent` / `deleteRow`) chỉ trên tab của chính nó, và tab đó kéo lại được từ nguồn ngoài

### GREEN_LIST (11 file — danh sách ĐÓNG, hardcode trong gate)

```
gas/Insight.gs        gas/Reviews.gs       gas/Marketing.gs
gas/WebHits.gs        gas/WebTraffic.gs    gas/GbpPerf.gs
gas/RFM.gs            gas/Maintenance.gs   gas/Dashboard.gs
gas/Signage.gs        gas/TikTokScrape.gs
```

Cộng thêm **một** ngoại lệ hẹp cho test (§6.1).

**Suy ra từ code, không đoán từ tên file:**
- `Marketing.gs` có `getSheetByName('ORDERS')` ở dòng 143 và 423 — kiểm chứng: **chỉ đọc**, không có `oSheet.appendRow/setValue/deleteRow` → green.
- `WebHits.gs` / `WebTraffic.gs` có `clearContent()` — trên tab WEB_HITS / traffic của chính nó, re-pull được từ GA4 → green.
- `Maintenance.gs` = lịch bảo trì thiết bị espresso/máy đá (Grok mô tả nhầm là "dọn dẹp dữ liệu cũ") → green, nhưng vì lý do đúng.

### RED = mọi thứ còn lại. Không liệt kê, mặc định từ chối.

Tự động bao gồm: 10 file Grok bỏ sót (`Archive` `Branches` `CameraAI` `Financials` `LabelPrint` `Menu` `Meta` `Notify` `Waste` `Zalo`), `appsscript.json` (manifest + OAuth scopes), toàn bộ `ops/` (**healer không được sửa cổng của chính nó**), và **mọi file mới** healer tạo ra.

`Archive.gs` đáng chú ý: nó *cắt* dòng khỏi `Orders` dán sang `ORDERS_ARCHIVE` — huỷ dữ liệu đơn hàng. Cả hai bản đánh giá ban đầu đều bỏ quên. Default-deny bắt được nó mà không cần ai nhớ ra.

### 6.1 Ngoại lệ test — chỉ thêm mới, không sửa cũ

D6 bắt mỗi fix kèm 1 test trượt-trước-fix. Nhưng test sống ở `ops/test_logic.js`, mà `ops/` là red. Mâu thuẫn.

**Giải (chốt, không hoãn sang plan):** healer **không bao giờ** sửa file test có sẵn. Mỗi fix tạo **file test mới**:

```
ops/tests/healer/<fix_id>.test.js        ← đường dẫn DUY NHẤT healer được tạo file
```

Luật gate:
- File mới khớp đúng `ops/tests/healer/<fix_id>.test.js` với `fix_id` của chính phiên đó → green
- Mọi đường dẫn khác trong `ops/` (kể cả `ops/test_logic.js`, kể cả `ops/tests/` ngoài `healer/`) → red
- File **có sẵn** trong `ops/tests/healer/` mà bị **sửa hay xoá** → red

Vì sao chặt vậy: nếu healer sửa được test cũ, nó gỡ được chính cái lưới đang chặn nó. Chỉ-thêm-mới giữ D6 mà không mở đường tự nới lỏng. Đổi lại `ops/tests/healer/` sẽ đầy dần theo lỗi thật — dọn tay định kỳ, chấp nhận được.

---

## 7. Snapshot + che PII

`logError(context, err, snapshot)` — thêm param 3, optional, backward-compatible.

**Vì sao cần:** stack trace không đủ để dựng test trượt khi lỗi do dữ liệu thật trên Sheet. Claude cần biết dòng dữ liệu / payload gây lỗi để mock đúng. (Grok bắt đúng.)

**Vì sao phải che:** `customer_id` = số điện thoại. Payload đơn hàng chứa tên, SĐT, địa chỉ giao. Đổ nguyên vào ERROR_LOG rồi nhét vào context model = rò PII ra log + ra model. Cả Grok lẫn chief đều trượt điểm này ở vòng đầu.

**Luật che — chạy TRƯỚC khi ghi sheet:**
- SĐT / `customer_id`: giữ 4 số cuối → `****1234`
- Tên khách, địa chỉ giao, ghi chú khách: bỏ hẳn, thay `[redacted]`
- Giữ nguyên: `order_id`, SKU, số lượng, status, timestamp, tên field, kiểu dữ liệu — đủ dựng mock
- Giới hạn kích thước snapshot: 2000 ký tự, cắt phần thừa

---

## 8. Cách ly worktree

**Vấn đề (cả Grok lẫn chief vòng đầu đều trượt):** `dispatcher.sh` có `cd "$(dirname "$0")/.."` — chạy trong **cây làm việc của anh iu**. Ngay lúc viết spec này repo đang ở nhánh `launch-hardening` với ~40 file chưa commit. Cho healer `git checkout -b` + commit ở đó = nó commit WIP của anh, hoặc chết vì conflict, hoặc anh `git checkout` giữa chừng và healer deploy nửa vời.

Branch-per-fix (Grok đề) giải được xung đột *giữa các fix với nhau*, nhưng **không** giải được xung đột *giữa healer và người*.

**Giải:** healer chạy trong git worktree riêng.

```
git worktree add ops/.healer-wt origin/main    # tạo 1 lần, gitignore
```

- Mỗi phiên `/fix`: `cd ops/.healer-wt && git fetch origin && git checkout -B fix/ERR-xxx origin/main`
- Cây làm việc của anh iu: healer **không bao giờ** chạm.
- Worktree luôn khởi từ `origin/main` tươi → không cõng WIP của ai.
- Sau khi xử lý xong (push hoặc để nhánh chờ duyệt): `git checkout main` trong worktree, cây sạch cho fix kế tiếp.
- `ops/.healer-wt/` vào `.gitignore`.

---

## 9. Deploy · rollback · cooldown · version

### 9.1 Vá bug có sẵn TRƯỚC (chặn tiến độ)

`ops/deploy_gas.js:114` chạy smoke test **sau** khi đã retarget deployment, fail thì `throw` và bỏ đó. **Prod nằm nguyên trên version hỏng.** Không lưu version cũ ở đâu cả.

Bug này tồn tại độc lập với healer — healer chỉ làm nó chết người hơn (vì không có người ngồi đó để sửa tay). Vá trước, dù plan healer có chạy hay không:

1. Trước khi retarget: `GET /v1/projects/{scriptId}/deployments/{deploymentId}` → lưu `versionNumber` hiện tại
2. Retarget → smoke
3. Smoke fail → retarget về `versionNumber` cũ → smoke lại → báo cáo → *rồi mới* throw

### 9.2 Version — đếm, không dọn

Grok đề "Version Pruning: tích hợp lệnh dọn dẹp version cũ". **Bất khả thi.** Apps Script API chỉ có `projects.versions.create` / `.get` / `.list` — **không có `delete`**. Không xoá version được.

Con số "tối đa 200 versions" cũng chưa kiểm chứng được — coi như chưa biết.

**Thay bằng:** `versions.list` đếm số version, chạm ngưỡng (đặt trong CONFIG, khởi điểm 150) → bắn Telegram cảnh báo. Chạm trần thật thì phải tạo script project mới — đó là sự kiện thủ công, không tự động hoá được.

### 9.3 Cooldown

Tối đa **3 auto-deploy / giờ**. Vượt → mọi fix chuyển `manual`. Chặn spam Apps Script API và chặn kịch bản "vòng lặp fix sinh fix" đốt quota.

---

## 10. Bảo mật

### 10.1 Telegram webhook

- `setWebhook` với `secret_token` → Telegram gửi header `X-Telegram-Bot-Api-Secret-Token`
- `doPost` verify: header khớp `HEALER_WEBHOOK_SECRET` (CONFIG sheet) **VÀ** `callback_query.from.id` == `TELEGRAM_CHAT_ID` của chủ
- Secret **riêng**, không dùng chung `REPORT_API_TOKEN` (Grok đề — nhận)
- Không có hai điều kiện này thì ai biết URL `/exec` đều push được code lên quán

### 10.2 Green/Red KHÔNG phải ranh giới bảo mật — điểm quan trọng nhất mục này

Grok (R5) đề: "Claude chỉ đọc lỗi, tuyệt đối không thực thi code trong log". Đó là **lời hứa, không phải cơ chế** — không có gì cưỡng chế nó.

Và nguy hiểm hơn, R5 hiểu sai bản chất cổng file:

> Mọi file `.gs` chạy chung **một** runtime, chung **một** quyền, đều gọi được `getConfig()`. Một backdoor chèn vào `Insight.gs` — file GREEN, được auto-push — vẫn đọc được `TELEGRAM_BOT_TOKEN`, `BANK_WEBHOOK_SECRET`, toàn bộ CONFIG, và ghi được vào ORDERS. Việc nó "không nằm trong Payment.gs" **không chặn được gì cả**.

Kết luận phải khắc vào plan:

**Cổng file = kiểm soát bán kính sự cố do TAI NẠN. KHÔNG phải phòng tuyến trước kẻ tấn công.** Không được lẫn lộn hai thứ.

Suy ra: **cổng nhận lỗi bắt buộc phải xác thực. Không có ingest ẩn danh. Chấm.**

Trong v1 điều này tự thoả: nguồn lỗi duy nhất là `logError()` gọi từ trong GAS — không ai ngoài chèn vào được. Đây là một lý do nữa để hoãn `web:*` (§11).

---

## 11. Ngoài phạm vi v1

### `web:*` — hoãn v2

Ban đầu chốt "GAS + web". Đảo lại sau khi chính phân tích của Grok (R4 + R5) chỉ ra:

- Lỗi client-side **luôn phải đỏ** (AdBlock, mạng chập chờn, extension lạ chèn JS → fix cho lỗi không có thật) → **tự chủ thu được bằng 0**
- Đổi lại phải xây cả hệ con: endpoint ingest công cộng + xác thực + lọc `chrome-extension://` + chống injection + che PII
- Và §10.2: ingest công cộng ẩn danh mâu thuẫn trực tiếp với luật "không ingest ẩn danh"

Toàn bộ chi phí đó đổi lấy đúng một thứ: "Claude soạn sẵn diff cho anh duyệt". Không đáng ở v1.

**v2** (sau khi vòng GAS chạy ổn và anh iu đã tin nó): ingest chỉ nhận từ thiết bị có session nhân viên/KDS, không nhận từ trình duyệt khách ẩn danh. `web:*` cứng đỏ vĩnh viễn.

### Cũng không làm ở v1

- Mac Mini python (poller, camera): lỗi nhóm này hầu hết là phần cứng/mạng — code fix không chữa được, sẽ toàn rơi vào `manual`
- Auto-fix đa chi nhánh: v1 chỉ chi nhánh mặc định trong `branches.json`
- Học từ fix cũ / bộ nhớ pattern lỗi: YAGNI cho tới khi có đủ lỗi thật

---

## 12. Kiểm thử

| Lớp | Kiểm gì |
|---|---|
| Unit | `enqueueFix` dedup đúng; trần attempts chặn ở lần 3; redact PII đúng dạng `****1234`; cooldown đếm đúng |
| Gate | **Quan trọng nhất.** Bảng test đầy đủ ở §12.1 |
| Integration | Bơm 1 lỗi giả có context green → chạy hết vòng trên **script project staging**, không phải prod |
| Rollback | Cố ý deploy version hỏng lên staging → xác minh tự trỏ về version cũ + Telegram bắn |
| Webhook | Gửi callback sai `secret_token` → từ chối; đúng secret nhưng sai `chat_id` → từ chối |

Deploy thật lên prod chỉ sau khi toàn bộ vòng chạy sạch trên staging.

### 12.1 Bảng test gate — mọi dòng phải xanh trước khi bật bất kỳ tự động hoá nào

| # | context | diff chạm | Kỳ vọng |
|---|---|---|---|
| 1 | `gbp.fetch` (ở GbpPerf.gs, green) | `gas/GbpPerf.gs` | **green** |
| 2 | `gbp.fetch` | `gas/Payment.gs` | red — cổng B |
| 3 | `gbp.fetch` | `gas/GbpPerf.gs` + `gas/Payment.gs` | red — một file đỏ là đỏ cả |
| 4 | `markOrderPaid.loyalty` (ở Orders.gs, red) | `gas/Insight.gs` | red — cổng A, dù diff sạch |
| 5 | `meta.get ` (dính khoảng trắng đuôi) | `gas/Insight.gs` | red — cổng A, Meta.gs đỏ; **và** phải trim rồi mới tra, không được crash |
| 6 | context bịa `khong.ton.tai` | `gas/Insight.gs` | red — không tra ra file, fail-closed |
| 7 | `gbp.fetch` | file mới `gas/Foo.gs` | red — file mới mặc định đỏ |
| 8 | `gbp.fetch` | `ops/healer_gate.js` | red — healer không sửa cổng của mình |
| 9 | `gbp.fetch` | `appsscript.json` | red — manifest + OAuth scopes |
| 10 | `gbp.fetch` | `gas/GbpPerf.gs` + `ops/tests/healer/FIX-20260716-0001.test.js` (mới, khớp fix_id phiên) | **green** — ngoại lệ §6.1 |
| 11 | `gbp.fetch` | `ops/tests/healer/FIX-20260101-9999.test.js` (fix_id phiên khác) | red — chỉ được tạo test của chính mình |
| 12 | `gbp.fetch` | `ops/test_logic.js` | red — không sửa test cũ |
| 13 | `gbp.fetch` | xoá `ops/tests/healer/FIX-cũ.test.js` | red — không xoá test cũ |
| 14 | `gbp.fetch` | diff rỗng | red — không có fix thì không deploy |

---

## 13. Rủi ro chấp nhận

| Rủi ro | Vì sao chấp nhận |
|---|---|
| Test suite mỏng (8 test) → fix green có thể lọt lỗi | Smoke live + auto-rollback bù. Luật "mỗi fix kèm 1 test" làm lưới dày dần theo lỗi thật. |
| Fix green vẫn có thể ghi sai dữ liệu analytics | Dữ liệu analytics kéo lại được từ GA4/GBP. Không phải tiền, không phải đơn. |
| Claude chẩn đoán sai root cause → fix vá triệu chứng | Test trượt-trước-fix bắt được phần lớn. Trần 2 lần thử chặn vòng lặp vô ích. |
| Số version GAS tăng đơn điệu, không xoá được | Cooldown 3/giờ + cảnh báo ngưỡng. Chạm trần = sự kiện thủ công hiếm. |

---

## 14. Thứ tự triển khai (phác — plan chi tiết ở bước sau)

1. **Vá `deploy_gas.js` rollback** (§9.1) — độc lập, làm trước, có giá trị ngay
2. Gate `ops/healer_gate.js` + bảng test của nó (§6, §12) — lõi an toàn, làm trước mọi thứ tự động
3. Worktree + `.gitignore` (§8)
4. `FIX_QUEUE` tab + `enqueueFix` + dedup + trần + cooldown (§5)
5. `logError` param snapshot + redact PII (§7)
6. Skill `/fix` (§4)
7. `dispatcher.sh` route fix (§4)
8. Telegram webhook + secret + nút duyệt (§10.1)
9. Chạy vòng đầy đủ trên staging (§12) → rồi mới bật prod

---

## 15. Phụ lục — góp ý Grok: nhận gì, sửa gì

**Nhận (3 chỗ chief bỏ sót):**
- R1 xung đột git khi fix chờ duyệt → nhận, và mở rộng thành worktree (§8)
- R3 bẫy mock Node.js → nhận, thêm snapshot (§7)
- R4 nhiễu `web:*` → nhận, và đẩy tới kết luận cắt hẳn khỏi v1 (§11)
- Kiến trúc B là đúng → xác nhận
- Tách `HEALER_WEBHOOK_SECRET` riêng → nhận (§10.1)
- Harden rollback `deploy_gas.js` → nhận, và phát hiện đó là bug đang sống (§9.1)

**Sửa (4 chỗ sai):**
1. **Version pruning bất khả thi** — Apps Script API không có `versions.delete`. Thay bằng đếm + cảnh báo (§9.2)
2. **R5 hiểu sai bản chất cổng file** — green/red không phải ranh giới bảo mật; backdoor trong file green vẫn đọc hết CONFIG. Cơ chế thật = xác thực ingest (§10.2)
3. **Green/Red đoán từ tên file, không đọc code** — bằng chứng: `Maintenance.gs` bị mô tả là "dọn dẹp dữ liệu cũ", thực tế là lịch bảo trì thiết bị. Verdict đúng, lý do bịa. Và **10 file không được phân loại**, trong đó `Archive.gs` huỷ dữ liệu đơn hàng. Thay bằng luật 3 điều kiện + default-deny (§6, D9)
4. **Trượt worktree** — cả Grok lẫn chief vòng đầu đều không thấy dispatcher chạy trong cây làm việc của người dùng (§8)

**Chief tự bổ sung:** che PII trong snapshot (§7) — không bên nào nêu.
