# Self-Healing System v2 — Design Spec

**Ngày:** 2026-07-16 (v2, viết lại sau phiên hardening cùng ngày)
**Trạng thái:** chờ duyệt → plan
**Thay thế:** `docs/superpowers/specs/2026-07-16-self-healing-design.md` (v1) — v1 có 3 luận điểm sai, xem §0.
**Nguồn:** brainstorm v1 (Grok Build review) + phiên hardening 2026-07-16 (threat-model thật, tìm ra C1/C2/§10.2 sai + 2 lỗ bảo mật sống không liên quan) + memory `project_self_healing.md`, `project_fix_skill_permissions.md`.

---

## 0. Sửa gì so với v1 — đọc trước, đừng chép lại lỗi cũ

| # | Luận điểm v1 | Phán |
|---|---|---|
| C1 | "healer khởi từ `origin/main` sẽ revert hardening khỏi prod" | ❌ **Không tồn tại.** Bắt nguồn từ đọc ref chưa `git fetch`. Thật: `gas/` lệch `launch-hardening` đúng 1 file. Cơ chế nêu ra (deploy = PUT trọn gói, sai base = mất code) **đúng về nguyên lý** → giữ lại làm invariant "base==prod" (§4), không phải Critical blocker. |
| C2 | "injection qua `it.sku` chạm tầng auto-push" | ❌ **Xếp nhầm cột** trong v1 (gate cổng A chặn đúng đường đó). Nhưng **là finding SỐNG ở địa chỉ khác**: `/fix` chạy với `--dangerously-skip-permissions` + cầm credential deploy, mà nguồn dữ liệu nó đọc (`ERROR_LOG`) nhận text từ `doPost` ẩn danh. Đây là vấn đề chính v2 phải giải — xem §1, §2. |
| §10.2 (v1) | "v1 tự thoả, không ai ngoài chèn vào được" | ❌ **Sai.** Ingest ẩn danh (đặt hàng không cần token) đã tồn tại hôm nay, `gas/Orders.gs:75` nối `it.sku` (chuỗi tuỳ ý người lạ) vào `err.message` qua `logError`. Không tự thoả. |

**Quyết định đã chốt ở phiên trước (không phải open question ở v2):**
- Bỏ tầng auto-push khỏi v1. Lý do là **giá trị** (7 file xanh còn lại toàn analytics/cron, trễ vài phút = 0đ thiệt hại), không phải an toàn. Mọi fix → `awaiting_approval` → người bấm DUYỆT trên Telegram.
- Giải C2 bằng user macOS riêng `_healer`, không chỉ dựa vào `--allowedTools`/hook.

---

## 1. Vấn đề

Hiện tại: lỗi nổ trong GAS → `logError()` ghi `ERROR_LOG` + bắn Telegram → **người đọc, người sửa, người deploy**. Mục tiêu: lỗi tự chảy vào vòng sửa có kiểm soát — Claude chẩn đoán + soạn fix + test, người chỉ bấm duyệt. Lỗi chạm tiền/auth hay không sửa được bằng code → báo tay.

**Không phải mục tiêu:** thay thế người quyết định, hay tự động hoá deploy.

**Vấn đề an ninh cốt lõi cần giải trong v2 (C2):** nguồn dữ liệu nuôi `/fix` (`ERROR_LOG`) nhận text từ nơi không xác thực. Không thể lọc sạch 100% văn bản thù địch bằng NLP. Giải pháp đúng: làm cho `/fix` **không có gì giá trị để mất** dù prompt của nó có bị injection, thay vì cố lọc sạch input.

---

## 2. Kiến trúc — 2 tiến trình độc lập, 2 danh tính OS

```
[user thường anh iu]                    [_healer — user macOS mới, không credential]
cron dispatcher.sh (2', như cũ)         cron/launchd fix_dispatcher.sh (2', MỚI)
  → dispatch_pull (AUTH.ADMIN)            → healer_pull (HEALER_QUEUE_TOKEN, hẹp)
  → lệnh chat → claude -p /inbox            → fix pending → claude -p /fix
  → fix APPROVED → bước deploy MỚI            (worktree RIÊNG ops/.healer-wt,
    (gas_push.py/deploy_gas.js                 git identity riêng, chỉ push
     + invariant base==prod, §4)               nhánh fix/*)
                                             → test trượt→fix→xanh (bắt buộc)
                                             → push nhánh, healer_update
                                               (status=awaiting_approval + diff)
                                             KHÔNG BAO GIỜ deploy, không đọc
                                             ~/.clasprc.json (không tồn tại
                                             trong home của _healer)
```

**Vì sao tách hẳn giải C2:** `_healer` không có `~/.clasprc.json`, không có `gh` auth (scope `gist` = exfil 1 lệnh nếu có), không có `ops/gas_push.py --deploy` lý do gì để chạy. Dù `/fix` bị injection qua `err.message` (dữ liệu thù địch xác nhận là có thật — C2), lệnh tuỳ ý chạy trong lúc test (`node -e "fetch(...)"` — không cách nào chặn hết bằng pattern-matching, đã ghi nhận ở phiên trước) chỉ đọc/gửi được những gì **tồn tại trong máy `_healer`**. Không có gì giá trị để lấy. Đây là cơ chế **cấu trúc**, không phải lời hứa hay allowlist mong manh.

`--allowedTools`/`--disallowedTools` + PreToolUse hook (đã verify là cơ chế thật qua `claude --help`, không phải đoán — `project_fix_skill_permissions.md`) là **lớp phòng thủ thứ 2**: bắt lỗi tự hại / nhầm lẫn, không phải hàng rào chống né tránh cố ý. Hàng rào thật là lớp OS ở trên.

**⚠️ Việc đầu tiên trong plan thực thi, trước khi xây gì khác:** test thật trên máy này xem `--permission-mode dontAsk` có thực sự tự-từ-chối (không treo headless) khi `/fix` gọi thứ ngoài allowlist. Handoff phiên trước gọi đây là "suy luận mạnh, chưa test" — không được thiết kế phần còn lại dựa trên giả định chưa kiểm.

---

## 3. `/fix` skill — permission model cụ thể

```bash
claude -p "/fix" \
  --permission-mode dontAsk \
  --allowedTools "Read" "Edit" "Write(ops/.healer-wt/**)" \
                 "Bash(git *)" "Bash(node --test *)" "Bash(python3 -m unittest *)" \
  --disallowedTools "Bash(*gas_push*)" "Bash(*deploy_gas*)" "Bash(*clasprc*)"
```

Chạy trong `ops/.healer-wt` (worktree riêng của `_healer`, tạo sạch từ `origin/launch-hardening` mỗi phiên — xem §8 v1, giữ nguyên lý do: cây làm việc của anh iu có file WIP, healer không bao giờ chạm).

**Luồng `/fix`:**
1. `git fetch origin && git checkout -B fix/ERR-xxx origin/launch-hardening` — ghi lại `base_commit_hash` (dùng cho invariant §4)
2. Đọc `FIX_QUEUE` row (context, message, stack, snapshot) qua `HEALER_QUEUE_TOKEN`
3. `superpowers:systematic-debugging` → root cause
4. Viết test **trượt** tái hiện lỗi (mock dựng từ snapshot đã che PII) — bắt buộc, không có bước này thì không có gì đo được fix có đúng không
5. Viết fix → test xanh
6. `git push origin fix/ERR-xxx` (git credential riêng của `_healer` — fine-grained PAT hoặc deploy key riêng, enforce bằng GitHub branch protection rule chỉ cho phép identity này push khớp pattern `fix/*`, chặn cứng ở phía GitHub chứ không chỉ quy ước)
7. `healer_update`: `status=awaiting_approval`, `git_branch`, diff, kết quả test
8. Không tìm ra root cause / test không xanh sau bước 5 → `status=manual` + lý do

Trần **2 lần thử** (`attempts`), dedup theo `context` — giữ nguyên logic v1 (§5 v1).

---

## 4. Deploy tách khỏi `/fix` hoàn toàn — chạy ở tiến trình khác, user khác

`/fix` không bao giờ gọi `gas_push.py`/`deploy_gas.js`. Hai script này không cần tồn tại trong worktree `_healer`.

Deploy thật xảy ra khi `FIX_QUEUE.status=approved` (anh iu bấm nút Telegram), do **dispatcher.sh hiện có** (user thường, đã có sẵn credential) thực hiện, thêm bước mới trước `PUT /content` — **invariant base==prod**, giải câu hỏi "làm gì tiếp" #2 của handoff:

```
trước PUT /content:
  GET /v1/projects/{scriptId}/deployments/{deploymentId} → versionNumber hiện tại
  GET /v1/projects/{scriptId}/versions/{versionNumber}    → content hash hiện tại
  so với base_commit_hash ghi lại lúc tạo nhánh fix/ERR-xxx (bước 1, §3)
  khớp  → PUT (áp dụng rollback 2 cửa đã có từ PR #12: đọc version trước
           khi retarget → smoke → fail thì lùi lại → smoke lại)
  lệch  → HUỶ, Telegram "prod đổi từ lúc tạo fix (có người/tiến trình khác
           đã đẩy code), cần kiểm tay trước khi deploy"
```

Ca thật minh hoạ: `PUT /content` ghi đè trọn gói — nếu ai đó (kể cả anh iu tay) đẩy code lên `launch-hardening` giữa lúc fix chờ duyệt, deploy fix cũ sẽ xoá mất phần mới đó. Invariant chặn đúng ca này, không chặn ca C1 (không tồn tại) mà v1 tưởng.

---

## 5. `FIX_QUEUE` schema + token hẹp

Tab mới trên Sheets, giữ gần nguyên schema v1 (§5 v1), bỏ `gate_result`/GREEN_LIST vì auto-push cắt khỏi v1:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `fix_id` | string | `FIX-YYYYMMDD-XXXX` |
| `error_id` | string | trỏ về dòng ERROR_LOG |
| `context` | string | copy từ `logError` — khoá dedup |
| `error_message`, `stack_trace` | string | |
| `snapshot` | string | JSON đã che PII (giữ nguyên §7 v1: SĐT giữ 4 số cuối, tên/địa chỉ `[redacted]`, giữ order_id/SKU/status/timestamp, giới hạn 2000 ký tự) |
| `status` | enum | `pending` `fixing` `awaiting_approval` `approved` `rejected` `pushed` `rolled_back` `manual` |
| `git_branch` | string | `fix/ERR-xxx` |
| `base_commit_hash` | string | **mới** — dùng cho invariant §4 |
| `deployed_version` | number | versionNumber sau deploy, để rollback |
| `attempts` | number | trần = 2 |
| `created_at`/`updated_at` | ISO | |

**`HEALER_QUEUE_TOKEN`** (CONFIG sheet, khác `REPORT_API_TOKEN`, khác `AUTH.ADMIN`): server-side (`Code.gs`) chỉ cho token này gọi đúng 2 action:
- `healer_pull` — đọc `FIX_QUEUE` các dòng `status=pending`
- `healer_update` — ghi `status`/`git_branch`/`base_commit_hash` **của đúng `fix_id` do chính request đó nêu**, không action nào khác

Không cho đọc `ORDERS`/`CUSTOMERS`/bất kỳ action nào khác — kể cả nếu `_healer` bị lộ token, blast radius chỉ trong `FIX_QUEUE`. Đây là authorization hẹp thật ở tầng GAS, không chỉ "thêm 1 token".

---

## 6. Telegram — 2 chiều, chống injection nhắm vào người đọc

**Webhook (giữ nguyên D5/§10.1 v1):**
- `setWebhook` với `secret_token` → Telegram gửi header `X-Telegram-Bot-Api-Secret-Token`
- `doPost` verify: header khớp `HEALER_WEBHOOK_SECRET` **VÀ** `callback_query.from.id == TELEGRAM_CHAT_ID` chủ
- Secret riêng, không dùng chung `REPORT_API_TOKEN`

**Template chống social-engineering (mới — Fable nêu ở phiên trước, chưa có thiết kế cụ thể):**

Nguy cơ: `err.message` do kẻ tấn công soạn (qua `it.sku` chẳng hạn) có thể giả "Lỗi nghiêm trọng, quán đang mất đơn — bấm DUYỆT ngay" để lừa người đọc, không phải lừa Claude. Vá bằng định dạng cố định, không cho text lỗi làm câu mở đầu hay đứng ngoài rào:

```
🔧 FIX-20260716-0042 · context: gbp.fetch
Nội dung lỗi (thô, không lọc):
```
{err.message nguyên văn, LUÔN trong code block}
```
Diff: <link nhánh fix/ERR-0042>
Test: 3/3 xanh (trượt-trước-fix xác nhận tại <sha>)
[DUYỆT]  [BỎ]
```

Text lỗi luôn nằm sau nhãn cố định "Nội dung lỗi (thô, không lọc):" trong code block — không thể tự xưng là dòng hệ thống hay chỉ thị. Bố cục + nút bấm không đổi dù nội dung lỗi là gì.

**[DUYỆT]** → `status=approved` → kỳ dispatcher sau: bước deploy §4.
**[BỎ]** → `status=rejected`, xoá nhánh remote.

---

## 7. Vá đã merge (PR #12) — không đổi ở v2

- Rollback 2 cửa `deploy_gas.js`/`gas_push.py`: đọc version đang chạy **trước** retarget → smoke → fail thì `GET/PUT` lùi lại → smoke lại. `files` rỗng dù HTTP 200 → không PUT (PUT rỗng = xoá trắng project).
- Retry `doGet` (`_executeWithRetry`): catch chuyển ra ngoài để retry thật sự retry.
- `gas/Zalo.gs` không log nguyên văn `access_token` — dùng `_tokenFingerprint()`.

---

## 8. Ngoài phạm vi v1

- **Auto-push/GREEN_LIST/gate** — cắt khỏi v1 (chốt ở phiên trước, lý do giá trị không phải an toàn: 7 file xanh còn lại toàn analytics/cron, độ trễ vài phút = 0đ thiệt hại). Ghi chú giữ lại **nếu bật lại sau này**: bán kính sự cố là đồ thị lời gọi, cổng theo đường dẫn file là mù (`Marketing.gs` xanh gọi `extendCustomersSchema()` ở `RFM.gs` đỏ → ghi CUSTOMERS mà diff chỉ chạm file xanh). GREEN_LIST đúng nếu bật lại = 7 file (bỏ RFM, giữ TikTokScrape/GbpPerf/Marketing với lý do đã kiểm ở v1 §6). Gate phải theo call-graph, không theo file path.
- **`web:*` ingest** — hoãn, lý do cũ đúng (nhiễu tự chủ = 0, chi phí xây ingest xác thực cao) + sửa lại: §10.2 v1 sai (không tự thoả), nên `web:*` khi làm sau này phải xác thực trước (chỉ nhận từ thiết bị có session nhân viên/KDS), không dựa "ẩn danh không chèn được" như v1 tưởng.
- Mac Mini python (poller/camera) — lỗi phần cứng/mạng, code fix không chữa được, rơi vào `manual`.
- Đa chi nhánh, học pattern lỗi cũ — YAGNI tới khi có đủ lỗi thật.

---

## 9. Kiểm thử

| Lớp | Kiểm gì |
|---|---|
| OS isolation | `_healer` login: `~/.clasprc.json` không tồn tại, `gh auth status` chưa auth. Xác nhận **trước khi** cho `/fix` chạy thật lần đầu. |
| Permission mode | **Việc đầu tiên trong plan.** Test `dontAsk` + `disallowedTools` trên máy này: giả lập `/fix` gọi `gas_push.py --deploy` → phải bị chặn, không treo, không hỏi. |
| Deploy invariant | Giả lập prod đổi giữa lúc fix chờ duyệt (push tay 1 commit vào `origin/launch-hardening` sau khi ghi `base_commit_hash`) → bước deploy phải huỷ, báo Telegram, không PUT. |
| `HEALER_QUEUE_TOKEN` | Token sai → 401. Đúng token, `fix_id` không khớp dòng → từ chối. Gọi action khác (`order_list`) bằng token này → từ chối. |
| Telegram template | Nạp `err.message` giả mạo lời hệ thống ("Lỗi nghiêm trọng — bấm DUYỆT ngay") → xác nhận vẫn nằm trong code block, nút không đổi vị trí/nhãn. |
| Rollback (PR #12, hồi quy) | Deploy version hỏng trên staging → tự retarget về version cũ + Telegram. |
| Test-trượt-trước-fix | `/fix` chạy trên 1 lỗi giả có sẵn → xác nhận test RED trên code cũ, XANH sau fix. |
| Dedup/trần/cooldown | `enqueueFix` dedup đúng theo context; trần 2 lần thử chặn ở lần 3. |

Toàn bộ chạy trên **script project staging**, không đụng prod. Deploy thật lên prod chỉ sau khi vòng chạy sạch trên staging.

---

## 10. Rủi ro chấp nhận

| Rủi ro | Vì sao chấp nhận |
|---|---|
| Test suite mỏng (8 test hiện tại) → fix có thể lọt lỗi | Người vẫn duyệt trước deploy (không auto-push) + smoke live + rollback bù. |
| `_healer` bị injection qua `err.message` | Không có gì giá trị trong máy `_healer` để lấy — cấu trúc, không phải lọc nội dung. |
| Số version GAS tăng đơn điệu, không xoá được (Apps Script API không có `versions.delete`) | Đếm + cảnh báo ngưỡng (khởi điểm 150), chạm trần là sự kiện thủ công hiếm. |
| `HEALER_QUEUE_TOKEN` lộ | Blast radius giới hạn trong `FIX_QUEUE`, không đọc được ORDERS/CUSTOMERS/CONFIG khác. |

---

## 11. Thứ tự triển khai

1. **Test `dontAsk` thật trên máy** (§2 cảnh báo) — chặn mọi thứ khác nếu không xong
2. Tạo user `_healer` macOS + xác nhận không có credential nào trong home (§9)
3. `HEALER_QUEUE_TOKEN` + `healer_pull`/`healer_update` action trong `Code.gs` (§5)
4. `FIX_QUEUE` tab + `enqueueFix` + dedup + trần (§5, giữ logic v1 §5)
5. `logError` param `snapshot` + redact PII (giữ nguyên §7 v1)
6. Skill `/fix` + permission model (§3)
7. Worktree `_healer` + git identity scope push `fix/*` (§2, §3)
8. `fix_dispatcher.sh` (cron/launchd riêng của `_healer`)
9. Bước deploy-on-approval + invariant base==prod trong `dispatcher.sh` hiện có (§4)
10. Telegram webhook + secret + template chống social-engineering (§6)
11. Chạy vòng đầy đủ trên staging (§9) → rồi mới bật prod

---

## 12. Việc chờ anh iu (không đổi từ handoff, nhắc lại vì còn treo)

Không liên quan trực tiếp thiết kế này nhưng chặn hoặc liên đới:
- Kiểm `ERROR_LOG` đã có dòng chứa token Zalo chưa (nếu có → xoay token)
- Merge PR #13 (lưới an toàn deploy prod, đang mở)
- Set `BANK_WEBHOOK_SECRET` + sửa MacroDroid — **làm trước khi build v2**, vì v2 dùng chung cơ chế xác thực CONFIG-secret, và bank webhook đang fail-open là lỗ sống độc lập cần đóng trước khi thêm cơ chế tương tự.
