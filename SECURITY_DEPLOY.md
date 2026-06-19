# 🔐 Runbook triển khai vá bảo mật

> **Hệ thống đang chạy thật + CI auto-deploy `web/` mỗi khi push.**
> Làm **đúng thứ tự dưới đây** để không làm gãy KDS / máy in / nhận đơn.

---

## ⚠️ Trước khi push bất cứ gì — hiểu sự phụ thuộc

- **`web/`** auto-deploy lên Cloudflare Workers + GitHub Pages khi push `main`.
- **`gas/`** deploy **thủ công** qua `clasp push` + redeploy Web App (KHÔNG qua CI).
- KDS giờ gửi `&token=__REPORT_API_TOKEN__`. Token thật do **Worker tiêm** lúc serve.
  - Nếu Worker chưa tiêm → KDS gửi placeholder → **GAS từ chối** (fail-closed, không lộ data).

---

## Thứ tự triển khai (làm tuần tự, không nhảy bước)

### Bước 0 — Sinh token
Tạo 1 chuỗi ngẫu nhiên mạnh (vd `openssl rand -hex 24`). Gọi là `<TOKEN>`. Dùng **cùng giá trị** ở Bước 1 và Bước 3.

### Bước 1 — Set token bên Google Apps Script (CONFIG sheet)
- Mở CONFIG sheet → thêm/sửa key **`REPORT_API_TOKEN`** = `<TOKEN>`.
- (Tuỳ chọn migration) set **`ALLOW_OPEN_API`** = `true` tạm thời nếu cần giữ endpoint mở trong lúc cập nhật client. **XOÁ ngay sau khi xong.**

### Bước 2 — Deploy GAS
```
cd gas && clasp push
```
Rồi Apps Script editor → **Deploy → Manage deployments → Edit → New version**.
- Test: `curl "<GAS_URL>?action=orders"` → phải trả `{"ok":false,"error":"unauthorized"}`.
- Test: `curl "<GAS_URL>?action=orders&token=<TOKEN>"` → phải trả danh sách đơn.

### Bước 3 — Set Worker secret (Cloudflare)
```
npx wrangler secret put REPORT_API_TOKEN
# dán <TOKEN> giống hệt Bước 1
```

### Bước 4 — Deploy web (push hoặc thủ công)
```
git add -A && git commit && git push    # CI tự deploy
# hoặc: npx wrangler deploy
```
- Test: mở `https://mitsucafe.mitsucafe.workers.dev/kds` → KDS load đơn bình thường (token đã được tiêm).
- View Source `/kds` → KHÔNG còn `__REPORT_API_TOKEN__`, KHÔNG thấy token thật trong file `web/kds.html` trên git.

### Bước 5 — Cập nhật Mac Mini poller
Script polling trên Mac Mini gọi `pending_print` / `pending_labels` / `mark_printed` / `mark_labels_printed` / `mark_paid` → **thêm `&token=<TOKEN>`** vào mọi URL. Restart poller. Kiểm tra in tem/bill chạy lại.

### Bước 6 — Cloudflare Access (gate trang điều khiển)
Zero Trust dashboard → **Access → Applications → Add → Self-hosted**:
- Application domain: `mitsucafe.mitsucafe.workers.dev` path `/dashboard*`, thêm app cho `/kds*`, `/camera*`.
- Policy: Allow → emails cụ thể (chủ + nhân viên), hoặc One-time PIN.
- Sau khi bật: mở `/dashboard` ở trình duyệt lạ → phải hỏi đăng nhập Access trước.

### Bước 7 — Xử lý GitHub Pages (BẮT BUỘC)
GitHub Pages KHÔNG chạy Worker → bản `hibbman23-dpd.github.io/mitsucafe/dashboard.html` **vẫn hở** dù đã làm hết các bước trên. Chọn 1:
- **(Khuyến nghị) Tắt hẳn Pages**: xoá `.github/workflows/deploy.yml` + tắt Pages trong repo Settings. Chỉ còn 1 origin Cloudflare (đã được bảo vệ).
- Hoặc giữ Pages nhưng **loại 3 file control khỏi artifact** (cần thêm bước build lọc file) — phức tạp hơn, dễ quên.

### Bước 8 — Đổi mật khẩu admin mặc định
Mật khẩu mặc định là `123456`. Vào dashboard → đổi mật khẩu ngay (CameraAI.gs `update_admin_password`).
Hash giờ có **salt + 1200 vòng SHA-256**; hash cũ tự nâng cấp ngay lần đăng nhập đúng đầu tiên.

### Bước 9 — Cấp quyền thiết bị (device approval)
Sau khi deploy, MỌI thiết bị đều **chưa được duyệt** → KDS hiện màn "Chờ cấp quyền", Dashboard sau khi đăng nhập hiện màn pending. Cách duyệt:

- **Dashboard (máy chủ quán):** đăng nhập mật khẩu → màn pending → bấm **"Duyệt thiết bị này"** (tự duyệt vì đã xác thực mật khẩu). Sau đó vào tab **📱 Thiết bị** để duyệt các tablet KDS (chúng hiện PENDING sau khi mở trang + tự đăng ký).
- **KDS tablet:** mở `/kds` → màn chờ hiện **device_id**. Duyệt từ tab Thiết bị của Dashboard, HOẶC Mac Mini curl:
  ```
  # liệt kê thiết bị
  curl "<GAS_URL>?action=device_list&token=<TOKEN>"
  # duyệt 1 thiết bị (device_id lấy từ màn chờ KDS)
  curl "<GAS_URL>?action=device_approve&token=<TOKEN>&device_id=<DEVICE_ID>"
  # thu hồi khi mất/đổi máy
  curl "<GAS_URL>?action=device_revoke&token=<TOKEN>&device_id=<DEVICE_ID>"
  ```
- Thu hồi quyền bất cứ lúc nào ở tab Thiết bị → thiết bị đó lập tức không vào được.

> Bootstrap không tự khóa: endpoint `device_list/approve/revoke` KHÔNG bị device-gate — chỉ cần mật khẩu (session) hoặc REPORT_API_TOKEN (Mac Mini).

---

## Đã sửa trong code (commit này)

| File | Thay đổi |
|------|----------|
| `gas/Code.gs` | `_requireTokenIfSet` fail-closed; bọc token `orders`/`mark_paid`/`set_promo`/`pending_*`/`mark_*`/`setup_financials`/`send_daily_report`/`compute_cogs`; `customer_info` lọc `zalo_id`+`notes`; **device-gate** cho orders/set_promo + dashboard data + admin writes; route `device_*` |
| `gas/CameraAI.gs` | Token/secret bằng `Utilities.getUuid()`; **password salt + 1200-vòng SHA-256** + auto-migrate hash cũ |
| `gas/Devices.gs` | **MỚI** — DEVICES sheet + register/check/list/approve/revoke/label |
| `web/kds.html` | Gửi `&token=`+`&device_id=`; **cổng chờ duyệt thiết bị** |
| `web/dashboard.html` | `device_id` vào mọi request; **màn pending + self-approve**; **tab 📱 Thiết bị** |
| `web/{dashboard,kds,camera}.html` | `<meta robots noindex>` |
| `web/robots.txt` | Disallow 3 trang control + Sitemap → workers.dev |
| `wrangler.jsonc` | `main` + assets `binding`+`run_worker_first` |
| `src/index.js` | **MỚI** — Worker: security headers + **CSP cho control pages** + tiêm token + X-Robots-Tag |

## Smoke-test sau deploy (làm trên browser thật)
- Mở `/dashboard` + `/kds` → mở DevTools Console: **không có lỗi CSP** (nếu có "Refused to … because it violates CSP" → báo lại để nới directive tương ứng).
- KDS thiết bị mới → màn chờ → duyệt → tự mở + load đơn.
- Dashboard máy mới → login → pending → "Duyệt thiết bị này" → vào được.

## Còn lại cần cân nhắc (chưa làm)
- **camera.html / face recognition** (giữ nguyên theo yêu cầu): dữ liệu sinh trắc học khách → cần đồng ý rõ ràng (Nghị định 13/2023 PDPD). Mixed-content `http://localhost:5000` bị chặn khi trang chạy HTTPS.
- **CSP của index.html / mitsu.html** (trang marketing) còn `'unsafe-inline' 'unsafe-eval'` — chưa siết để không gãy embed YouTube/social. CSP chặt đã áp cho 3 trang control.

## Rollback
Mọi thay đổi đều trong git. `git revert <commit>` cho web/Worker. GAS: redeploy version cũ trong Manage deployments. Gỡ Worker secret nếu cần: `wrangler secret delete REPORT_API_TOKEN`.
