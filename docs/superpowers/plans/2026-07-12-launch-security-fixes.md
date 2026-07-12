# Launch Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vá 3 lỗi (signage iframe bị chặn, camera AI bị CSP chặn, master token rò vào Telegram link), review toàn bộ diff GAS chưa commit, rồi deploy live cả 2 Cloudflare Worker + GAS.

**Architecture:** Worker `mitsu-ops` (src/ops.js, sau Cloudflare Access) nới frame headers CHỈ cho `/signage`; trang public `web/index.html` thêm `http://localhost:5000` vào meta CSP connect-src + gate mọi call camera AI sau cờ thiết bị quầy; `gas/OpsTriggers.gs` bỏ fallback master token. Diff GAS uncommitted (Code.gs restructure 1100+ dòng của phiên Grok, chứa fix PII loyalty) phải qua review 2 lớp (reviewer agent + chief đọc tay file tiền/auth) trước khi `gas_push.py --deploy` vì gas_push đẩy NGUYÊN thư mục gas/.

**Tech Stack:** Cloudflare Workers (wrangler 4.x, 2 config: `wrangler.jsonc` = mitsucafe, `wrangler.ops.jsonc` = mitsu-ops), Google Apps Script (deploy bằng `python3 ops/gas_push.py --deploy`, KHÔNG dùng clasp — bị "Premature close"), test GAS bằng `node --test ops/test_logic.js`.

## Global Constraints

- KHÔNG commit file ngoài scope: chỉ `src/ops.js`, `web/index.html`, `web/order.js`, `gas/OpsTriggers.gs`, và (sau khi review pass) các file `gas/*.gs` còn lại + `web/mitsu.html` + 2 file web đã xóa. `eval/`, `learning/`, `docs/`, `ops/*.js` để nguyên uncommitted.
- Token/secret KHÔNG bao giờ nằm trong code — chỉ CONFIG sheet / wrangler secret. Việc xoay token do CHỦ QUÁN tự chạy (checklist ở Task 8), agent không đụng giá trị secret.
- `wrangler deploy` từ máy local đẩy NGUYÊN thư mục `web/` làm assets → mọi thay đổi uncommitted trong web/ sẽ LÊN LIVE. Vì vậy diff `web/mitsu.html` + 2 file xóa (`mitsu-kit.html`, `mitsu-menu-proto.html`) phải nằm trong scope review Task 5.
- Commit message kết thúc bằng `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Branch hiện tại: `launch-hardening`. Deploy live = wrangler local + gas_push, KHÔNG merge main trong plan này (CI deploy trên push main — ghi chú follow-up cho chủ quán để CI khỏi revert worker ở lần push main sau).
- Phân tầng model: Task 1–3 giao `caveman:cavecrew-builder` (sonnet); Task 4 chạy lệnh test trực tiếp; Task 5 = `caveman:cavecrew-reviewer` + chief tự đọc `gas/Code.gs`, `gas/Payment.gs`, `gas/Orders.gs` (file tiền/auth); Task 6–7 chief làm (deploy + verify = quyết định ship).

---

### Task 1: Nới frame headers cho /signage trên worker mitsu-ops

**Files:**
- Modify: `src/ops.js:76-80` (khối set headers cuối fetch handler)

**Interfaces:**
- Consumes: `SECURITY_HEADERS` (object, dòng 14–20), `CONTROL_CSP` (string joined, dòng 22–33) — đã có sẵn.
- Produces: response cho `/signage` + `/signage.html` có `X-Frame-Options: SAMEORIGIN` và CSP `frame-ancestors 'self'`; MỌI path khác giữ nguyên `DENY` / `'none'`.

- [ ] **Step 1: Sửa khối set headers**

Thay khối hiện tại (dòng 76–80):

```js
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    // Toàn bộ worker này là trang nội bộ → noindex + CSP cho tất cả.
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.headers.set('Content-Security-Policy', CONTROL_CSP);
    return res;
```

bằng:

```js
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    // Toàn bộ worker này là trang nội bộ → noindex + CSP cho tất cả.
    res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.headers.set('Content-Security-Policy', CONTROL_CSP);
    // Riêng signage: dashboard (cùng origin) nhúng iframe preview → cho phép
    // frame cùng origin. Mọi path khác giữ DENY / 'none'.
    if (url.pathname === '/signage' || url.pathname === '/signage.html') {
      res.headers.set('X-Frame-Options', 'SAMEORIGIN');
      res.headers.set(
        'Content-Security-Policy',
        CONTROL_CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'")
      );
    }
    return res;
```

- [ ] **Step 2: Build check**

Run: `npx wrangler deploy --dry-run --outdir /tmp/wr-ops-check -c wrangler.ops.jsonc`
Expected: `Total Upload: ... KiB` + không error. (Không có unit test infra cho worker — verify thật bằng curl ở Task 7.)

- [ ] **Step 3: Commit**

```bash
git add src/ops.js
git commit -m "fix(ops-worker): cho phép dashboard nhúng iframe preview /signage (SAMEORIGIN + frame-ancestors 'self', chỉ 2 path signage)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: CSP camera AI + gate thiết bị quầy trên trang đặt hàng

**Files:**
- Modify: `web/index.html:6` (meta CSP, thêm connect-src)
- Modify: `web/order.js:2380-2389` (associate_order), `web/order.js:3092-3093` (khởi động poll), thêm helper `isPosDevice()` ngay trên dòng 3096 (trước block `// ─── CAMERA AI INTEGRATION`)

**Interfaces:**
- Consumes: `pollActiveCustomer()` (order.js:3101), `customerPollTimer` (order.js:3098) — đã có.
- Produces: `isPosDevice()` → boolean; camera AI (poll + associate_order) CHỈ chạy khi thiết bị đã bật cờ POS. Bật: mở trang 1 lần với `?pos=1` (lưu localStorage `lhk_pos`). Tắt: `?pos=0`.

- [ ] **Step 1: Thêm localhost:5000 vào connect-src trong meta CSP index.html**

Trong `web/index.html:6`, thay đoạn:

```
connect-src 'self' https://script.google.com https://script.googleusercontent.com https://cloudflareinsights.com;
```

bằng:

```
connect-src 'self' https://script.google.com https://script.googleusercontent.com https://cloudflareinsights.com http://localhost:5000;
```

(CHỈ sửa `connect-src`, không đụng directive khác.)

- [ ] **Step 2: Thêm helper isPosDevice() vào order.js**

Chèn ngay TRƯỚC dòng `// ─── CAMERA AI INTEGRATION (ACTIVE CUSTOMER POLLING) ─...` (hiện ở dòng 3096):

```js
// Cờ thiết bị quầy (POS): camera AI chỉ chạy trên máy quầy, không chạy trên máy khách.
// Bật 1 lần: mở trang với ?pos=1 (lưu localStorage). Tắt: ?pos=0.
function isPosDevice() {
  try {
    const p = new URLSearchParams(location.search).get('pos');
    if (p === '1') localStorage.setItem('lhk_pos', '1');
    if (p === '0') localStorage.removeItem('lhk_pos');
    return localStorage.getItem('lhk_pos') === '1';
  } catch (_) { return false; }
}
```

- [ ] **Step 3: Gate 2 chỗ gọi camera AI**

(a) Dòng khởi động poll (hiện 3092–3093):

```js
  // Khởi chạy vòng lặp kiểm tra khách quen từ Camera AI (3 giây/lần)
  customerPollTimer = setInterval(pollActiveCustomer, 3000);
```

thành:

```js
  // Khởi chạy vòng lặp kiểm tra khách quen từ Camera AI (3 giây/lần) — chỉ máy quầy
  if (isPosDevice()) customerPollTimer = setInterval(pollActiveCustomer, 3000);
```

(b) Khối associate_order (hiện 2380–2389):

```js
    // Tích hợp lưu đặc điểm khách hàng quen qua camera AI nội bộ
    fetch('http://localhost:5000/api/associate_order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_phone: display.normPhone,
        customer_name: display.name || 'Khách Quen',
        items: display.itemsSummary
      })
    }).catch(err => console.log('Không kết nối được Camera AI local:', err));
```

thành:

```js
    // Tích hợp lưu đặc điểm khách hàng quen qua camera AI nội bộ — chỉ máy quầy
    if (isPosDevice()) {
      fetch('http://localhost:5000/api/associate_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_phone: display.normPhone,
          customer_name: display.name || 'Khách Quen',
          items: display.itemsSummary
        })
      }).catch(err => console.log('Không kết nối được Camera AI local:', err));
    }
```

- [ ] **Step 4: Syntax check**

Run: `node --check web/order.js`
Expected: exit 0, không output.

- [ ] **Step 5: Commit**

```bash
git add web/index.html web/order.js
git commit -m "fix(order): mở CSP connect-src localhost:5000 cho Camera AI + gate toàn bộ camera call sau cờ POS (?pos=1)

Máy khách không còn fetch localhost; chỉ thiết bị quầy đã bật cờ mới poll/associate.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Bỏ fallback master token trong link nhắc waste form

**Files:**
- Modify: `gas/OpsTriggers.gs:53-54` + thêm 1 dòng cảnh báo trong message

**Interfaces:**
- Consumes: `getConfig(key)` (Utils), `sendTelegramAlert(html)` — đã có.
- Produces: link waste_form trong Telegram CHỈ mang STAFF_FORM_TOKEN; nếu CONFIG thiếu key này → link không token + dòng cảnh báo, KHÔNG BAO GIỜ rơi về REPORT_API_TOKEN.

- [ ] **Step 1: Sửa cronCloseChecklistReminder**

Thay (dòng 53–54):

```js
    var token = getConfig('STAFF_FORM_TOKEN') || getConfig('REPORT_API_TOKEN') || '';
    var linkSuffix = token ? '&token=' + token : '';
```

bằng:

```js
    // CHỈ dùng token quyền thấp cho link gửi vào group. Tuyệt đối không fallback
    // sang REPORT_API_TOKEN (master) — group chat không được thấy master token.
    var token = getConfig('STAFF_FORM_TOKEN') || '';
    var linkSuffix = token ? '&token=' + token : '';
    var tokenWarn = token ? '' : '\n⚠️ CONFIG thiếu STAFF_FORM_TOKEN — link form sẽ bị từ chối. Set key này trong CONFIG sheet.';
```

và nối `tokenWarn` vào cuối chuỗi message của `sendTelegramAlert(...)` (sau dòng `'<i>Nếu có sự cố...'` , trước dấu `)` đóng):

```js
      '<i>Nếu có sự cố/đánh giá xấu → gõ /handover hoặc /sang sáng mai.</i>' + tokenWarn
```

- [ ] **Step 2: Kiểm tra không còn chỗ nào khác leak master vào Telegram**

Run: `grep -n "REPORT_API_TOKEN" gas/OpsTriggers.gs gas/Waste.gs gas/Reviews.gs`
Expected: KHÔNG còn dòng nào ghép REPORT_API_TOKEN vào chuỗi gửi `sendTelegramAlert`. (`gas/Code.gs` dùng nó cho validator — hợp lệ.)

- [ ] **Step 3: Commit**

```bash
git add gas/OpsTriggers.gs
git commit -m "fix(gas): link waste form trong Telegram chỉ dùng STAFF_FORM_TOKEN, bỏ fallback master token

Thiếu STAFF_FORM_TOKEN thì gửi link không token + cảnh báo, không im lặng downgrade sang REPORT_API_TOKEN.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Chạy test gates (tầng máy móc)

**Files:** không sửa file nào.

- [ ] **Step 1: GAS logic tests**

Run: `node --test ops/test_logic.js`
Expected: tất cả `# pass`, `# fail 0`. Nếu fail → DỪNG, báo chief chẩn đoán (không tự sửa).

- [ ] **Step 2: Web unit tests**

Run: `node --test web/mitsu-menu.test.js web/mitsu-theme.test.js`
Expected: `# fail 0`.

- [ ] **Step 3: Build dry-run cả 2 worker**

Run:
```bash
npx wrangler deploy --dry-run --outdir /tmp/wr-main-check
npx wrangler deploy --dry-run --outdir /tmp/wr-ops-check -c wrangler.ops.jsonc
```
Expected: cả 2 build OK, không error.

---

### Task 5: Review gate — toàn bộ diff sẽ lên live

**Files:** không sửa (chỉ đọc). Scope review = MỌI THỨ deploy đẩy đi:
- GAS (gas_push đẩy nguyên thư mục): `gas/Code.gs` (~1100 dòng restructure), `gas/Orders.gs` (+63), `gas/Payment.gs` (+50), `gas/CameraAI.gs` (+8), `gas/Reviews.gs`, `gas/Waste.gs`, `gas/OpsTriggers.gs`
- Web assets (wrangler đẩy nguyên web/): `web/mitsu.html` (+26), 2 file xóa `web/mitsu-kit.html` + `web/mitsu-menu-proto.html`, và diff Task 1–2
- `src/ops.js` diff Task 1

- [ ] **Step 1: Reviewer agent quét toàn bộ diff** — dispatch `caveman:cavecrew-reviewer`: `git diff HEAD -- gas/ web/ src/` + 3 commit mới. Output: findings theo severity.

- [ ] **Step 2: Chief tự đọc file tiền/auth** — `git diff HEAD -- gas/Code.gs gas/Payment.gs gas/Orders.gs`. Checklist chief:
  - Route table AUTH.* : route nào PUBLIC có trả PII/tiền không? `customer_info` phải qua `toPublicLoyaltyView`.
  - `_requireStaffToken` / `_requireTokenIfSet`: fail-closed? `ALLOW_OPEN_API` không bật mặc định?
  - `mark_paid` idempotent còn nguyên? (commit b979d2d)
  - ORDERS vẫn append-only, không update-in-place.
  - 2 file web xóa: grep không còn chỗ nào link tới (`grep -rn "mitsu-kit\|mitsu-menu-proto" web/ src/ docs/system/`).
- [ ] **Step 3: Phán quyết** — mọi finding CRITICAL/HIGH phải sửa xong + re-test mới qua gate. Finding kiểu style bỏ qua. Nếu diff Code.gs có logic đáng ngờ không tự tin → DỪNG, hỏi chủ quán, KHÔNG deploy.

- [ ] **Step 4: Commit phần gas hardening còn lại (sau khi pass)**

```bash
git add gas/Code.gs gas/Orders.gs gas/Payment.gs gas/CameraAI.gs gas/Reviews.gs gas/Waste.gs
git commit -m "fix(gas): PII loyalty view + AUTH route table + staff form token (đợt hardening pre-launch)

customer_info chỉ còn trả stamp/free-drink qua toPublicLoyaltyView — không tên/SĐT/zalo_id.
waste/review form nhận STAFF_FORM_TOKEN quyền thấp.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git add web/mitsu.html
git rm web/mitsu-kit.html web/mitsu-menu-proto.html 2>/dev/null || git add -A web/mitsu-kit.html web/mitsu-menu-proto.html
git commit -m "chore(web): dọn proto pages + chỉnh mitsu.html

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Deploy live (chief)

- [ ] **Step 1: Probe trạng thái GAS live TRƯỚC khi đẩy** (biết baseline)

```bash
GAS_URL='https://script.google.com/macros/s/AKfycbynDqbg-Xn9hEbUyhsZl_MF0dGsCqLpfTgJ-Us3QHiGqkrKV3hwZD__-fKW2kFJZzC7/exec'
curl -sL "$GAS_URL?action=customer_info&phone=0000000000" | head -c 300
```
Ghi nhận: response có field `name` không (biết bản PII fix đã live chưa).

- [ ] **Step 2: Deploy GAS**

Run: `python3 ops/gas_push.py --deploy`
Expected: push OK + version mới + deployment prod trỏ version mới, URL /exec giữ nguyên.

- [ ] **Step 3: Deploy 2 worker**

```bash
npx wrangler deploy
npx wrangler deploy -c wrangler.ops.jsonc
```
Expected: cả 2 in `Deployed <name> ... Current Version ID`.

- [ ] **Step 4: Push branch backup**

Run: `git push origin launch-hardening`
(KHÔNG merge main ở đây. Ghi chú cho chủ quán: lần merge main kế tiếp CI sẽ redeploy worker — đã cùng nội dung nên an toàn; đừng push main từ bản cũ hơn.)

---

### Task 7: Verify live (chief)

- [ ] **Step 1: Headers signage vs dashboard**

```bash
curl -sI https://ops.mitsu.cafe/signage | grep -i 'x-frame-options\|content-security-policy'
curl -sI https://ops.mitsu.cafe/dashboard | grep -i 'x-frame-options'
```
Expected: signage → `SAMEORIGIN` + `frame-ancestors 'self'`; dashboard → `DENY`. (Lưu ý: sau Cloudflare Access có thể trả 302 login — nếu vậy headers đọc từ response redirect không đủ, kiểm bằng `curl -sIL` hoặc chấp nhận verify qua browser của chủ quán.)

- [ ] **Step 2: CSP index.html live**

```bash
curl -s https://mitsu.cafe/index.html | grep -o 'connect-src[^;]*'
```
Expected: chứa `http://localhost:5000`.

- [ ] **Step 3: PII đã bịt**

```bash
curl -sL "$GAS_URL?action=customer_info&phone=0000000000"
```
Expected: JSON không có `name`/`phone`/`zalo_id` — chỉ stamp/free-drink fields (hoặc `customer: null`).

- [ ] **Step 4: Waste form fail-closed**

```bash
curl -sL "$GAS_URL?action=waste_form" | head -c 200
curl -sL "$GAS_URL?action=waste_form&token=sai-token" | head -c 200
```
Expected: cả 2 bị từ chối (không render form).

- [ ] **Step 5: Manual (chủ quán, không tự động được)**
  - Mở dashboard (sau CF Access) → tab "📺 Màn hình" → iframe preview hiện nội dung signage.
  - Trên máy quầy: mở trang order với `?pos=1` một lần → console thấy poll camera chạy; đặt thử 1 đơn → `/api/associate_order` trả 200. Nếu máy quầy là Safari/iPad mà vẫn bị chặn → mixed content Safari, chuyển Chrome.

---

### Task 8: Checklist xoay token (chủ quán tự chạy — agent không đụng secret)

- [ ] Sinh 2 token mới (ví dụ `openssl rand -hex 24` chạy 2 lần): 1 cho `REPORT_API_TOKEN` (master), 1 cho `STAFF_FORM_TOKEN`.
- [ ] CONFIG sheet: cập nhật `REPORT_API_TOKEN`, thêm `STAFF_FORM_TOKEN`.
- [ ] `npx wrangler secret put REPORT_API_TOKEN -c wrangler.ops.jsonc` (ops worker tiêm vào kds.html).
- [ ] `npx wrangler secret put REPORT_API_TOKEN` (worker mitsucafe — dùng cho web_hit log).
- [ ] Cập nhật token trong config print poller trên Mac Mini + watchdog `gas_health.py` nếu có dùng.
- [ ] Xóa các message Telegram cũ trong group có chứa token (giữ group sạch — token cũ vô hiệu sau xoay nhưng vẫn nên xóa).
- [ ] Smoke: mở KDS (qua ops worker) thấy đơn; poller in tem bình thường; 21:30 message mới mang STAFF token.

## Self-Review

- Spec coverage: Fix 1 → Task 1; Fix 2 (+POS gate + Safari caveat) → Task 2 + Task 7.5; Fix 3 → Task 3; review Code.gs diff → Task 5; PII fix đã có sẵn trong working tree → verify Task 7.3 + commit Task 5.4; xoay token → Task 8; deploy live → Task 6. Đủ.
- Placeholder: không còn TBD/TODO.
- Type consistency: `isPosDevice()` định nghĩa Task 2 Step 2, dùng Step 3(a)(b) — khớp. `tokenWarn` khai báo + nối message cùng Task 3.
