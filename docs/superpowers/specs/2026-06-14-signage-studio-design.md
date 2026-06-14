# Signage Customization Studio

> Spec · 2026-06-14 · Kissaten Ordering System
> Trạng thái: thiết kế đã duyệt (brainstorm). Tiếp theo: kế hoạch triển khai (/writing-plans).
> Lưu ý: user sẽ **tự triển khai sau** (đang sắp hết quota) — spec cần đủ chi tiết để cầm tay chỉ việc.

## 1. Mục tiêu & phạm vi

Biến signage mặt tiền từ mô hình "bật/tắt block cố định + gõ mã SKU phẩy-cách-nhau" thành **Studio dựng màn hình bằng danh sách cảnh**, dùng được **trên điện thoại** ngay trong Dashboard (worker nội bộ `kaeru-ops`). Tùy chỉnh **trong giới hạn khuôn mẫu** — KHÔNG phải trình tạo slide tự do kiểu PowerPoint.

**Trong phạm vi:**
- Danh sách cảnh **kéo để sắp xếp thứ tự**.
- Mỗi cảnh: **bật/tắt** + **thời lượng riêng**.
- Chọn món bằng cách **bấm từ danh sách (tên + ảnh)**, không gõ mã SKU.
- Sửa chữ (tiêu đề/story/caption/thông báo).
- **Tải ảnh lên** cho loại cảnh mới `image` (poster/ảnh tự chụp).
- **Nhiều video** (mỗi cảnh video = 1 link YouTube).
- **Xem trước** cảnh đang chọn (tái dùng renderer signage.js).
- **Tương thích ngược**: config cũ tự migrate sang schema mới, màn đang chạy không vỡ.

**Ngoài phạm vi (spec riêng sau):**
- Upload **file video** (nặng hạ tầng) — chỉ dùng link YouTube.
- Slide tự do kéo-thả tùy ý (PowerPoint-style).
- Lên lịch cảnh theo giờ/ngày/khung thời gian.

## 2. Quyết định đã chốt (qua brainstorm)

| Yếu tố | Chốt |
|--------|------|
| Mức tự do | **A — sửa trong khuôn mẫu có sẵn** (không freeform) |
| Nơi chỉnh | **Dashboard → tab "Màn hình"**, nâng thành Studio, **responsive điện thoại** |
| Mô hình | **Danh sách cảnh** (`scenes[]`) thay cho block-toggle; thứ tự mảng = thứ tự chiếu |
| Thời lượng | **Riêng từng cảnh** (`duration` giây) thay cho `rotateSeconds` chung |
| Auto-daypart | **Bỏ** — thứ tự do owner kéo tay (dễ đoán) |
| Video | **Link YouTube**, nhiều cảnh video = nhiều story |
| Ảnh upload — lưu | **Cloudflare R2 (chính)**; **Drive proxy (dự phòng khi R2 hết free 10GB)** |
| Xem trước | **Có** — nhúng signage.html chế độ preview, tái dùng renderer |

## 3. Mô hình dữ liệu — `SIGNAGE_CONFIG` v2 (vẫn 1 ô JSON trong CONFIG)

```jsonc
{
  "version": 2,
  "scenes": [                          // THỨ TỰ mảng = thứ tự chiếu
    { "id":"sc1", "type":"spotlight", "enabled":true,  "duration":12, "sku":"DR001" },
    { "id":"sc2", "type":"image",     "enabled":true,  "duration":8,
      "image":"https://kaerukaphe.kaerukaphe.workers.dev/sig-img/abc123.jpg",
      "caption":"Sale cuối tuần -10%" },
    { "id":"sc3", "type":"video",     "enabled":true,  "duration":45, "youtube_id":"AQBbF4V4wRg" },
    { "id":"sc4", "type":"menu",      "enabled":false, "duration":11 },
    { "id":"sc5", "type":"combo",     "enabled":true,  "duration":11,
      "items":["DR001","BK001"], "price":59000, "label":"Combo sáng" },
    { "id":"sc6", "type":"tem",       "enabled":true,  "duration":11 },
    { "id":"sc7", "type":"announcement","enabled":true,"duration":9, "text":"...", "until":"" }
  ],
  "theme":"auto",                      // 'auto' | 'day' | 'night' (giữ nguyên)
  "promoRibbon": true                  // ribbon khuyến mãi (đọc promo_info) — giữ nguyên cơ chế
}
```

**Quy ước:**
- `id`: chuỗi ngắn duy nhất trong config (VD `sc`+timestamp/đếm) — dùng cho React-less DOM keying + reorder.
- `duration`: số giây ≥ 5 (validate). Video cho phép tới ~120s.
- Field theo `type` (xem §4). Field thừa khi đổi type → bỏ qua khi render.

### 3.1 Migration v1 → v2 (bắt buộc, một chiều)
Khi `normalizeConfig` nhận config **không có `version:2`** (tức schema cũ `blocks`/`featured`/`combos`/`announcement`/`video`/`rotateSeconds`):
1. Dựng `scenes[]` theo thứ tự daypart hiện tại của code cũ (afternoon order mặc định: announcement → spotlight → combo → tem → menu → video → brand), CHỈ thêm cảnh có block tương ứng đang bật:
   - `announcement` nếu `announcement.active && announcement.text` → 1 cảnh announcement.
   - mỗi SKU trong `featured` (đã resolve) → 1 cảnh `spotlight`.
   - `combos[0]` (nếu có ≥2 items) → 1 cảnh `combo`.
   - `tem`, `menu`, `video` (youtube_id) → mỗi cái 1 cảnh nếu block bật.
2. `duration` mặc định = `rotateSeconds` cũ (hoặc 11) cho mọi cảnh; cảnh video = 45.
3. Giữ `theme`. Đặt `version:2`.
4. Kết quả này dùng để render NGAY; lần owner Lưu kế tiếp sẽ ghi đè config v2 vào CONFIG.

## 4. Loại cảnh (scene types)

| type | Field riêng | Render |
|------|-------------|--------|
| `spotlight` | `sku` | 1 món nổi bật + giá + story (renderSpotlight hiện có, nhận item theo sku) |
| `menu` | — | 3 cột thực đơn (renderMenu) |
| `combo` | `items[]`, `price`, `label` | combo gộp giá (renderCombo) |
| `tem` | — | thẻ tích tem (renderTem) |
| `video` | `youtube_id` | 1 video YouTube (renderVideo). Nhiều cảnh video = nhiều story |
| `announcement` | `text`, `until` | 1 dòng thông báo (renderAnnouncement) |
| `image` ⭐MỚI | `image` (URL), `caption?` | Ảnh full khung 16:9/9:16 + caption tùy chọn (renderImage MỚI) |
| `brand` | — | fallback khi queue rỗng/ảnh hỏng (renderBrand) |

`renderImage` mới: `<section class="scene show">` chứa `<img>` cover toàn khung + overlay caption (nếu có), có `onerror` → thay bằng renderBrand để màn không trống khi ảnh lỗi.

## 5. Studio UI — Dashboard tab "Màn hình" (responsive điện thoại)

Thay thế form hiện tại (`#v-signage` / `signageLoad`/`signageSave` trong dashboard.html) bằng Studio:

**5.1 Danh sách cảnh**
- Mỗi cảnh = 1 thẻ: `☰` kéo · icon theo type · tên gợi (VD "Spotlight — Trà sữa Kaeru") · badge `<duration> giây` · nút bật/tắt (●/○).
- Kéo ☰ đổi thứ tự (reorder mảng `scenes`). Dùng thư viện kéo-thả nhẹ hoặc HTML5 drag (không thêm dependency nặng; ưu tiên vanilla pointer-based reorder).
- Nút **＋ Thêm cảnh** → chọn loại từ bảng (spotlight/image/video/menu/combo/tem/announcement) → thêm cảnh mới `enabled:true, duration mặc định`.
- Nút xóa cảnh (icon thùng rác trên thẻ hoặc trong ô sửa). Xóa cảnh `image` → kèm xóa ảnh R2 (xem §6.3).

**5.2 Ô sửa cảnh** (bấm thẻ → mở panel/sheet)
- `spotlight`/`combo`: **chọn món từ danh sách có tên + ảnh thumbnail** (đọc MENU_DATA của dashboard), không gõ mã. combo chọn nhiều món + nhập giá + nhãn.
- `announcement`: ô chữ + ô hạn (until) + (đang active = enabled).
- `image`: **nút Tải ảnh lên** (xem §6) + ô caption.
- `video`: ô dán link/ID YouTube (parse ra youtube_id).
- Mọi cảnh: ô/slider **thời lượng** (giây).

**5.3 Xem trước**
- Khung tỉ lệ màn (ngang) nhúng `signage.html` ở **chế độ preview**: signage.js nhận tham số (VD `?preview=1` + postMessage cảnh) để render đúng 1 cảnh đang chọn, không auto-rotate, không poll. Tái dùng renderer — KHÔNG vẽ lại UI.
- Cập nhật preview khi sửa (debounce).

**5.4 Lưu**
- `apiPost({action:'set_signage', token, device_id, config})` — endpoint đã có sẵn, gate session+device, KHÔNG cần thêm gì ở GAS. `config` = object v2 ở §3.

## 6. Đường ảnh (phần "không được lỗi")

**Hợp đồng cố định (không đổi dù backend nào):** ảnh phục vụ tại URL công khai ổn định
`https://kaerukaphe.kaerukaphe.workers.dev/sig-img/<key>` — same-origin với signage (public), CSP `img-src 'self'` chấp nhận, cache tại edge. Lưu URL này vào `scene.image`.

### 6.1 Chính — Cloudflare R2
- **Bật R2 1 lần** trong Cloudflare (free 10GB; có thể yêu cầu thẻ thanh toán). Tạo bucket (VD `kaeru-signage-img`). Bind vào **cả hai** worker:
  - `wrangler.jsonc` (public) + `wrangler.ops.jsonc` (nội bộ) thêm `r2_buckets: [{ binding:"SIGN_IMG", bucket_name:"kaeru-signage-img" }]`.
- **Upload (ghi — có bảo vệ):** route `POST /sig-img` trên **ops worker** (`src/ops.js`):
  - Gate: đã sau Cloudflare Access; thêm kiểm tra session token + device (đồng bộ pattern set_signage) — hoặc tối thiểu Access + header token. (Plan sẽ chốt cơ chế đọc token ở worker; hiện ops chỉ tiêm token, chưa validate — cần thêm.)
  - Client **nén/resize ảnh trước khi gửi** (canvas → JPEG/WebP, cạnh dài ≤1600px, ≤~800KB) để nhẹ + nhanh + tránh giới hạn.
  - Validate ở worker (KHÔNG tin client): content-type ∈ {jpeg,png,webp}, size ≤ ~3MB.
  - Sinh key ngẫu nhiên (`crypto.randomUUID()` + đuôi) → `SIGN_IMG.put(key, body)` → trả `{ ok, url:"/sig-img/<key>" }`.
- **Serve (đọc — công khai):** route `GET /sig-img/<key>` trên **public worker** (`src/index.js`):
  - **KHÔNG bị chặn** bởi BLOCKED_PATHS (chỉ chặn dashboard/kds/camera).
  - `SIGN_IMG.get(key)` → trả body kèm `Content-Type` đúng + `Cache-Control: public, max-age=604800, immutable` (key bất biến).
  - 404 nếu không có.
- **Dọn rác:** xóa/đổi ảnh 1 cảnh → gọi `DELETE /sig-img/<key>` (ops) xóa key cũ. Cân nhắc nút "dọn ảnh mồ côi" (liệt kê key R2 không còn trong config) — optional v1.

### 6.2 Dự phòng — Google Drive proxy (khi R2 hết free)
- GAS `uploadSignageImage(p)`: nhận base64 → `DriveApp.createFile` trong 1 folder cố định → `setSharing(ANYONE_WITH_LINK)` → trả fileId.
- Public worker `GET /sig-img/<id>`: fetch ảnh từ Drive (`https://drive.google.com/uc?export=view&id=<id>` hoặc lh3) → **cache** (Cache API) → trả về. Cùng URL contract → đổi backend chỉ sửa route serve + đường upload, scene.image giữ format `/sig-img/<...>`.
- Vì cùng contract, code đọc/ghi scene KHÔNG phân biệt backend.

### 6.3 Vì sao không chọn Drive-link-trực-tiếp
Drive hay chặn hotlink/rate-limit → trả trang HTML thay vì ảnh → **hỏng ảnh trên màn 24/7**. Loại bỏ.

## 7. Thay đổi `signage.js`

- `defaultConfig`/`normalizeConfig`: hỗ trợ schema v2 (`scenes[]`) + **migration v1→v2** (§3.1). Giữ `theme`, `promoRibbon`.
- `buildQueue(config, now, menu)`: trả `scenes.filter(enabled)` **giữ nguyên thứ tự mảng** (BỎ daypart sort, BỎ derive featured tự động — giờ scenes tường minh). Queue rỗng → `[{type:'brand'}]`.
- `advance()`: dwell = `scene.duration * 1000` (bỏ rotateSeconds chung; video không còn hardcode 45000 — lấy từ duration).
- `mountScene`: thêm nhánh `type==='image'` → `renderImage(scene)`.
- `renderImage(scene)` MỚI: ảnh cover + caption + `onerror`→brand.
- Poll `signage_config` vẫn 60s; cache localStorage; chế độ `?preview=1` (cho Studio): không poll/không auto-advance, render 1 cảnh nhận qua postMessage.

## 8. GAS & Bảo mật

- `getSignageConfig`/`setSignageConfig` (Signage.gs) **không đổi logic** — vẫn lưu/đọc 1 JSON; chỉ nội dung JSON đổi sang v2. (`_defaultSignageConfig` cập nhật sang v2 cho seed mới.)
- GAS chỉ tham gia **đường ảnh dự phòng** (`uploadSignageImage` Drive) — không đụng tới khi dùng R2.
- **Upload R2 gate:** Cloudflare Access (kaeru-ops) + token/device. Validate type/size **ở worker**. Serve công khai **chỉ-đọc** (GET), không cho ghi từ public worker.
- Ảnh là nội dung công khai (hiện trên signage mặt tiền) → không PII; chấp nhận public read.

## 9. Kiểm thử

- **Migration:** nạp config v1 cũ → signage tự dựng scenes v2, thứ tự + nội dung tương đương, không vỡ.
- **Render từng type:** preview + signage thật render đúng spotlight/menu/combo/tem/video/announcement/**image**.
- **Reorder/duration:** kéo đổi thứ tự + đổi duration → Lưu → signage cập nhật đúng thứ tự & thời lượng.
- **Upload ảnh:** chụp/chọn ảnh trên điện thoại → nén client → upload R2 → `scene.image=/sig-img/<key>` → ảnh hiện trên signage qua public worker; `Cache-Control` đúng.
- **Ảnh lỗi/offline:** URL hỏng → `onerror`→brand; offline → brand (như video hiện tại).
- **Bảo mật:** `POST /sig-img` thiếu token/Access → từ chối; `GET /sig-img/<key>` công khai OK; `GET /sig-img/<key-không-tồn-tại>` → 404.
- **Dọn rác:** xóa cảnh image → key R2 cũ bị xóa.

## 10. Đơn vị triển khai (gợi ý cho /writing-plans)

1. **signage.js v2**: schema v2 + migration v1→v2 + buildQueue theo thứ tự + duration mỗi cảnh + `renderImage` + chế độ preview. (Tự test bằng Node — signage.js đã có export CommonJS + test harness.)
2. **Signage.gs**: `_defaultSignageConfig` → v2 (giữ getter/setter).
3. **Hạ tầng ảnh R2**: tạo bucket + bind 2 worker; `POST/DELETE /sig-img` (ops) + `GET /sig-img/<key>` (public, ngoài BLOCKED_PATHS); validate + cache headers.
4. **Dashboard Studio UI**: danh sách cảnh (reorder/toggle/duration/xóa) + ô sửa từng type (dish picker, caption, youtube parse) + nút upload (nén client) + khung xem trước nhúng signage preview + Lưu set_signage.
5. **Kiểm thử + verify** theo §9 (Node test cho signage.js; preview cho UI; curl cho /sig-img).

## 11. Rủi ro & lưu ý

- **R2 cần bật + (có thể) thẻ thanh toán** — user làm khi tới bước 3; nếu vướng → dùng đường Drive dự phòng (§6.2) cùng contract URL.
- **Ops worker hiện chưa validate token** (chỉ tiêm) — bước 3 phải thêm xác thực cho `POST /sig-img` (không để ai sau Access cũng ghi được tùy ý; tối thiểu Access đã chặn người ngoài).
- **Drag-reorder trên điện thoại** cần pointer events mượt — chọn cách nhẹ, không kéo theo dependency lớn.
- Liên quan [[project-security-model]] (2 worker, public chặn nội bộ, ảnh serve qua public worker).
