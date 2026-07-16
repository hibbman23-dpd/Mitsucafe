# HANDOFF — phiên 2026-07-16 · self-healing + vá bảo mật prod

> **Đọc hết file này trước khi làm gì.** Viết cho model tiếp nhận (Sonnet/Haiku).
> Xưng **"em"**, gọi user **"anh iu"** (luật global CLAUDE.md).

---

## ⛔ LUẬT AN TOÀN — vi phạm là hỏng quán thật

Quán cà phê **đang bán hàng thật**. Không phải sandbox.

1. **KHÔNG BAO GIỜ chạy `python3 ops/gas_push.py`** — kể cả **không** có `--deploy`. Plain push `PUT /content` → **ghi đè HEAD script prod NGAY**. 18 time-driven trigger chạy HEAD (không chạy version pin) → ăn code mới tức thì. Docstring cũ ghi "an toàn, chưa ảnh hưởng prod" — **SAI**, một model đang cố ý cẩn thận đã tin dòng đó và mutate prod thật trong phiên này. Docstring đã sửa.
2. **KHÔNG chạy `node ops/deploy_gas.js`** thiếu `--dry-run`.
3. **KHÔNG `git add -A` / `git add .` / `git commit -a` / `git stash` / `git checkout`** trong `/Users/dpd/Projects/lamha-kissaten` — cây làm việc của anh iu có **~55 file WIP** không liên quan. Chỉ `git add <đường dẫn cụ thể>`, kiểm `git diff --cached --name-only` trước khi commit.
4. **`git fetch` TRƯỚC mọi so sánh `origin/*`.** Phiên này cả Opus lẫn Fable đều sập bẫy đọc ref cũ → lật sai hướng cả dự án. Chạy lại cùng lệnh trên cùng ref cũ **không phải** xác minh.
5. **Không đụng CONFIG sheet prod, không đăng nhập hộ, không sờ MacroDroid.**

---

## Bối cảnh 30 giây

Kissaten (Mitsu / Lâm Hà). GAS = event bus, Google Sheets = DB, không external DB. Đọc `CLAUDE.md` (index) + `docs/system/*` khi chạm mảng nào.

Phiên này định xây **self-healing**: lỗi → hàng đợi → Claude tự sửa → push. Kết quả: **đổi hướng lớn** + **vá 2 lỗ bảo mật đang sống trên prod** (không liên quan self-healing, tìm ra khi dựng threat model).

---

## 1. TRẠNG THÁI GIT — đọc kỹ, phiên này dính bẫy 2 lần

```
origin/main               c97781f   (PR #11 merged 12/07)
origin/launch-hardening   5b65676   ← ĐẦY ĐỦ, nguồn sự thật
local  launch-hardening   097a6be   ← PHÂN KỲ, tụt sau, đừng tin
```

**Local `launch-hardening` đang phân kỳ và tụt sau origin.** Hai commit local (`15d1459`, `097a6be`) **đã được cherry-pick** lên origin thành `6b2be9e`, `5b65676` — nội dung y hệt, SHA khác.

**Bẫy đã dính 2 lần:** commit vào local `launch-hardening` rồi tưởng nó lên PR. **Không.** Worktree/PR nhánh từ `origin/launch-hardening`.

**Cách push an toàn (đã dùng 2 lần, chạy tốt):**
```bash
cd /Users/dpd/Projects/lamha-kissaten-healer   # worktree riêng
git fetch -q origin
git checkout -q -B push-xxx origin/launch-hardening
git cherry-pick <sha-local>
node --test ops/test_logic.js                   # kiểm trước khi push
git push origin push-xxx:launch-hardening
```
KHÔNG `git rebase` trong cây chính — 55 file WIP chặn (và đó là điều tốt).

**PR đang mở:** `#13` launch-hardening → main (**việc của phiên này, chờ anh iu merge**). `#1 #2 #3` là PR cũ tồn đọng, không liên quan.

**Worktree:** `/Users/dpd/Projects/lamha-kissaten-healer`. Ledger: `.superpowers/sdd/progress.md`.

---

## 2. ĐÃ XONG

### PR #12 → merged vào launch-hardening: lưới an toàn 2 cửa deploy

Bug: cả `ops/deploy_gas.js` lẫn `ops/gas_push.py --deploy` retarget deployment **rồi mới** smoke; đỏ thì `throw` bỏ đó → prod nằm trên version hỏng, không mốc để lùi. `gas_push.py` không smoke gì.

**Thứ suýt lọt:** `PUT /content` xảy ra **trước** → ghi đè HEAD. 18 trigger chạy HEAD → rollback bằng retarget chỉ cứu `/exec`, để prod ở trạng thái lai (`/exec`=v41, cron=v42 hỏng). 4 message khẳng định ngược lại.

Giờ, cả hai cửa: đọc version đang chạy **trước** retarget · không đọc được → **huỷ deploy** · smoke đỏ → `GET /content?versionNumber=N` → `PUT` lại HEAD → retarget lùi → smoke lại · `files` rỗng dù HTTP 200 → **không PUT** (PUT rỗng = xoá trắng project). Ba trạng thái: cứu cả hai · `ROLLBACK MỘT PHẦN` · không cứu được.

### Vá retry `doGet` (`6b2be9e`)

`_executeWithRetry(fn,3,1000)` chỉ retry khi `fn()` **ném**. `_doGetInternal` có `try/catch` bên trong nuốt hết → **retry là code chết**, dù comment quảng cáo nó chống blip Google API cho KDS/Web Order. Chuyển `catch` ra ngoài. Test RED thật trên code cũ: handler gọi **1 lần thay vì 3**.

### Vá 2 lỗ bảo mật SỐNG (không liên quan self-healing)

- **`5b65676`** — `gas/Zalo.gs:52` log nguyên văn `access_token` vào `ERROR_LOG`. ERROR_LOG là tab Sheets → ai đọc sheet là có token Zalo OA sống. Thay bằng `_tokenFingerprint()` = `len=28 …abcd`. 3 test khoá.
- **`chmod 600`** cho `~/.clasprc.json` (refresh token deploy prod) + `.claude/.dispatcher-auth.json` (mật khẩu admin dashboard) — cả hai đang 644. Đã kiểm: dispatcher-auth không bị git track, có trong `.gitignore:69`, chưa từng vào history (repo **PUBLIC**).

### Test hiện tại (chạy để xác nhận)

```bash
node --test ops/test_logic.js                  # 15 pass
node --test ops/tests/deploy_rollback.test.js  # 10 pass   (chỉ có trên origin/launch-hardening)
python3 -m unittest ops/tests/test_gas_push.py # 13 pass   (nt)
node ops/deploy_gas.js --dry-run               # sạch, không gọi API
```
`ops/tests/*` **không có** trong cây local `launch-hardening` — chúng ở `origin/launch-hardening`. Muốn chạy: dùng worktree healer.

---

## 3. VIỆC CHỜ ANH IU — không tự làm

| # | Việc | Vì sao không tự làm |
|---|---|---|
| **A** | **Kiểm `ERROR_LOG` xem đã có dòng chứa token Zalo chưa.** Nếu có → xoá dòng + **xoay token Zalo OA** | Cần mở Sheets. Vá chặn chỗ *sẽ ghi*; không biết *đã ghi* hay chưa |
| **B** | **Set `BANK_WEBHOOK_SECRET`** trong CONFIG + sửa MacroDroid gửi kèm field `secret` | Đụng tiền + điện thoại anh iu |
| **C** | **Gỡ Git integration của Worker `kaerukaphe`** trong dashboard Cloudflare | Đổi cấu hình tài khoản |
| **D** | **Merge PR #13** | Quyết định của anh iu |
| **E** | **Kiểm ACL Google Sheets** — ai edit được `ERROR_LOG`? | Không kiểm được từ repo. Nếu nhân viên edit được → họ gõ thẳng text vào ERROR_LOG, bỏ qua mọi khử trùng phía GAS |

### ③ bank webhook — đừng vá vội

`gas/Code.gs:39`: `if (!_bws) return true` → webhook báo tiền vào **nhận mọi request ẩn danh**. `cto-review-2026-07-11.md:174` (S1) bắt từ 11/07.

**KHÔNG gỡ dòng đó trước khi anh iu xong bước B.** Route dẫn tới `handleBankNotification` → parse SMS VCB → đánh dấu đơn PAID. Fail-closed khi MacroDroid chưa gửi `secret` = **mọi báo tiền bị từ chối** → khách chuyển khoản mà đơn không PAID. Vá bảo mật làm hỏng khâu thu tiền.

Thứ tự đúng: anh set CONFIG → sửa MacroDroid → kiểm 1 giao dịch thật → *rồi* Claude gỡ back-compat.

### Con ma Cloudflare (C)

Mail "Deployment failed" anh iu thấy = **con ma**, không phải hỏng:

| | Đường thật | Con ma |
|---|---|---|
| Ở đâu | `.github/workflows/cloudflare.yml` (trong repo) | Dashboard Cloudflare (ngoài repo) |
| Deploy gì | `mitsucafe` + `mitsu-ops` | `kaerukaphe` — **tên trước rebrand** |
| Khi nào | push `main`, lọc path | **mọi commit, mọi PR** |
| Kết quả | **xanh 100%** (`gh run list` xác nhận) | **đỏ liên tục từ 07/06** |

`wrangler.jsonc` ghi `"name": "mitsucafe"`; Workers Builds phía dashboard vẫn nhắm `kaerukaphe` → tên không khớp → chết. Tàn dư lúc đổi tên repo. **Cloudflare đang tự động và xanh — anh iu không hề làm tay khoản này.**

---

## 4. SELF-HEALING — quyết định + cạm bẫy

### Chốt: bỏ tầng auto-push khỏi v1. **Mọi** fix chờ duyệt Telegram.

**Lý do ĐÚNG (giá trị, KHÔNG phải an toàn):** 7 file "xanh" (Insight, Reviews, WebHits, WebTraffic, Maintenance, Dashboard, Signage) toàn analytics/cron, không chạm khách đang mua. `cronRollupWebHitsYesterday` gãy 5:50 — tự sửa 5:52 vs chủ duyệt 8:00 chênh **bằng 0** (data re-pull từ GA4). Đổi lấy số 0 đó phải nuôi vĩnh viễn: GREEN_LIST + call-graph verify + cổng A grep + ngoại lệ test + dispatcher enforcement. **Nhiều máy móc nhất cho lớp fix ít giá trị nhất.** Đúng lý lẽ §11 của chính spec (cắt `web:*`) — spec viết ra nguyên tắc rồi không tự áp cho §6.

### ⚠️ Spec cũ `docs/superpowers/specs/2026-07-16-self-healing-design.md` (`c491ae9`) CÓ 3 LUẬN ĐIỂM SAI. Đừng chép.

| Luận điểm | Phán |
|---|---|
| C1 "healer khởi `origin/main` sẽ revert hardening khỏi prod" | ❌ **KHÔNG TỒN TẠI.** Đọc ref chưa fetch. Thật: `gas/` lệch `launch-hardening` **đúng 1 file**. Cơ chế (deploy = PUT trọn gói, sai base = mất code) đúng nguyên lý → giữ làm invariant "base == prod" |
| C2 "injection qua `it.sku` chạm tầng auto-push" | ❌ **XẾP NHẦM CỘT.** `Orders.gs:75` → `Code.gs:661` `logError('doPost')` → context `doPost` ở `Code.gs` = RED → cổng A chặn. **Nhưng C2 vẫn là finding SỐNG** — xem dưới |
| §10.2 "v1 tự thoả, không ai ngoài chèn vào được" | ❌ **SAI.** Ingest ẩn danh đã tồn tại hôm nay |

Plan `docs/superpowers/plans/2026-07-16-self-healing-p1-safety-net.md` có header ghi đổi hướng; Task 3–6 (gate, GREEN_LIST) **đã HỦY**, phần dưới là bản nháp chết.

### C2 — finding sống, thuộc Plan 2. **Đây là thứ chặn đường.**

**Vấn đề thật không phải injection nghe đáng sợ. Là: nút DUYỆT không nằm trên đường deploy.**

Anh iu chốt "mọi fix chờ duyệt". Nhưng session `/fix` chạy `--dangerously-skip-permissions` và **tự nó cầm `~/.clasprc.json`** → không gì chặn nó gọi thẳng `gas_push.py --deploy`. Việc nó *chờ* bấm nút là **model tự giác, không phải cơ chế**. Quyết định của anh iu hiện **chưa được thứ gì cưỡng chế**.

**`ops/dispatcher.sh:8-9` tự khai mô hình an toàn của `/inbox`:**
> *"An toàn dựa trên: hàng đợi chỉ admin (đăng nhập dashboard) ghi được + /inbox chỉ draft."*

Đúng — `queue_command` = `AUTH.ADMIN` (`Code.gs:530`). **`/fix` phá vỡ đúng giả định đó**: nguồn nó là `ERROR_LOG`, mà ERROR_LOG ăn text từ `doPost` **ẩn danh** (`Code.gs:640`, không qua `_authorize`). Có **10 chỗ** `throw new Error('...' + biến)` trong `gas/*.gs`; vd `Orders.gs:75` nối `it.sku` (chuỗi tuỳ ý người lạ). `logError` (`Utils.gs:101`) ghi thô, không lọc.

**Điểm mấu chốt: KHÔNG contain được `/fix` bằng allowlist tool.** Nó **bắt buộc phải chạy test → chạy code = thực thi tuỳ ý**. `node -e "fetch(...)"` hợp lệ với mọi luật cho phép chạy test. **Chỉ lấy đi được thứ nó có thể ăn cắp.**

**Anh iu chốt hướng: user macOS riêng `_healer` + `dontAsk`.**
- Đổi `HOME` **KHÔNG đủ** — `credential.helper=osxkeychain` và `gh` token gắn *user session*.
- `gh` token có scope **`repo, gist, workflow`** → `gist` = exfil công khai 1 lệnh.
- Đã kiểm (không đoán API): `claude` CLI có `--allowedTools`/`--disallowedTools` nhận pattern `Bash(git *)`; doc permissions nói *"enforced by Claude Code, **not by the model**"*; có `--permission-mode dontAsk` (tự từ chối trừ khi allow sẵn — **không treo headless, thay được `--dangerously-skip-permissions`**); `permissions.disableBypassPermissionsMode: "disable"` khoá cứng.
- **CHƯA XÁC MINH:** `deny` có thắng `bypassPermissions` không. Suy luận mạnh, chưa test. Thiết kế **không được dựa vào** nó.
- Doc cảnh báo: Bash pattern ràng buộc tham số là **mong manh** → allowlist là **lớp 2**, không phải hàng rào.

### Chỗ phương pháp GÃY — ghi ra không thì gãy lại

**Bán kính sự cố là ĐỒ THỊ LỜI GỌI. Cổng lại là ĐƯỜNG DẪN FILE.**
`Marketing.gs:219` (xanh) gọi `extendCustomersSchema()` ở `RFM.gs:27` (đỏ) → ghi CUSTOMERS. Diff chỉ chạm file xanh → cổng mù. **Sửa GREEN_LIST 11→7 KHÔNG vá lỗ này.**

Nếu sau này bật tầng xanh: GREEN_LIST đúng = 7 file (bỏ **RFM** ghi CUSTOMERS `:123`/`:315`, **TikTokScrape** giữ `FIRECRAWL_API_KEY:12`, **GbpPerf** gọi `ScriptApp.getOAuthToken():45`, **Marketing** ghi gián tiếp). Gate còn 2 lỗ: cổng A grep HEAD (sau fix) → fix tự thêm `logError('<context xanh>')` vào file xanh là qua; `--diff-filter=MD` bỏ sót status `R` → rename phá luật chỉ-thêm-mới.

### Đường tấn công chưa đóng (Fable nêu)

- **Response bên thứ ba vào `logError`**: `Zalo.gs:29`, `Meta.gs:74`/`:302`, `LabelPrint.gs:145` — text ngoài tầm kiểm soát → prompt.
- **Con người là mục tiêu injection**: tin Telegram chứa error message do kẻ tấn công soạn — *"Lỗi nghiêm trọng, quán đang mất đơn — bấm DUYỆT ngay"*. Anh iu là người đọc. Chưa ai mô hình hoá.
- **`snapshot` (§7 spec cũ)**: Fable khuyên **GIỮ nhưng đổi hình dạng** — chứa *schema* không chứa *giá trị* (`{"qty":{"type":"string","len":3,"expected":"number"}}`). Che PII **không** giải C2 (injection cần *text*, không cần PII). Bỏ `snapshot` **không** sửa C2 — `err.message` đã cõng text kẻ tấn công hôm nay rồi.

---

## 5. LÀM VIỆC THẾ NÀO — bài học đắt của phiên này

**Em kiểm chứng thứ người khác viết kỹ hơn thứ chính em viết.** Bắt Grok "đoán từ tên file"; bắt implementer "test vacuous"; rồi tự: chưa `fetch` mà tuyên bố lệch 878+/770−, "verify" bằng cách chạy lại đúng lệnh hỏng, xếp C2 nhầm cột — và **lật hướng cả dự án dựa trên đó**.

Fable cũng sập đúng bẫy, còn đóng dấu "đã kiểm và SẠCH" cho 2 claim sai. **Không phải chuyện gọi model xịn hơn.** Hai model đọc cùng ref cũ ra cùng số sai, và sự trùng khớp đó **trông y hệt xác nhận**.

Cái cứu được: **chạy lệnh KHÁC đi.** `gh run list` lòi ra "PR #11 merged" → mọi thứ đổ.

**Luật rút ra:**
1. Xác minh = chạy **đường khác**, không phải lặp cùng lệnh.
2. Nghi ngờ chính mình ngang nghi ngờ agent.
3. Test phải **RED thật** trên code cũ. Pass sẵn = regression guard, **khai ra**, đừng gọi là TDD.
4. Comment/docstring **không phải bằng chứng** — đọc code. Docstring `gas_push.py` lừa được model đang cố ý cẩn thận.
5. "Model sẽ cư xử đúng" **không phải cơ chế**.

**Phân tầng model (luật global):** việc này (implement theo spec chốt) = **Sonnet**. Chẩn đoán root-cause, review kiến trúc, quyết ship, đụng **tiền/auth/dữ liệu prod** = chief. Việc B/③ chạm tiền → **đừng tự quyết, hỏi anh iu**.

---

## 6. LÀM GÌ TIẾP

**Nếu anh iu bảo làm tiếp self-healing** → viết spec v2 (`brainstorming` skill trước). Bắt buộc giải:
1. **C2** — `/fix` credential-less: user `_healer` + `dontAsk`. Xem §4. **Test thật `deny` vs `bypass` trước khi thiết kế dựa vào nó.**
2. **Invariant "base == prod"** — verify content hash prod khớp base trước `PUT /content` trọn gói.
3. Nếu bật tầng xanh sau này: gate theo **call-graph**, không theo file path.

**Nếu anh iu ưu tiên khác** → memory ghi **ƯU TIÊN SỐ 1 từ 12/07** là Track A "Quán Tự Chạy" (`docs/monetization-master-plan-2026-07-12.md`), và **"KHÔNG mở plan mới khi chưa qua gate"**. Self-healing không nằm trong đó. Hỏi anh iu trước khi tự chọn.

**Memory liên quan** (`~/.claude/projects/-Users-dpd-Projects-lamha-kissaten/memory/`):
`project_self_healing.md` · `project_fix_skill_permissions.md` · `project_live_security_holes.md` · `project_gas_deploy_head_vs_version.md` · `project_gas_deploy.md` · `project_gas_oauth_7day.md`

**Đã khép trong phiên:** OAuth 7 ngày — anh iu **đã revoke + re-auth**, ngòi nổ ~18/07 tháo. `/exec?action=ping` trả `{"ok":true,"message":"pong"}`.
