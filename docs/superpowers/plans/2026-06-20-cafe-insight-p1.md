# cafe-insight P1 (Nền tảng nhập tay) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép nhập số liệu từng bài đăng (mọi nền tảng) vào hệ thống và để subagent `cafe-insight` phân tích content→doanh số, không phụ thuộc API.

**Architecture:** Mở rộng tab `MARKETING_LOG` (nguồn DUY NHẤT, tránh JOIN dễ gãy) thêm cột engagement chiều sâu; thêm tab `DECISION_LOG`; thêm panel nhập tay trong `web/dashboard.html` gọi GAS qua `doPost`; thay agent `cafe-research` bằng `cafe-insight` chạy khung phân tích 4 tầng / 7 module trên `getRoiData()`.

**Tech Stack:** Google Apps Script (`.gs`, V8), Google Sheets, HTML/vanilla JS dashboard, Claude subagent (markdown).

> **Lưu ý môi trường:** Repo KHÔNG có clasp/test-runner local. GAS chạy bound với Spreadsheet → "test" = chạy hàm trong Apps Script editor rồi kiểm Sheet, hoặc `curl` endpoint deploy. Mỗi task nêu rõ bước verify thực tế. Sau khi sửa `.gs`, phải **đồng bộ code lên Apps Script project** (copy nội dung file vào editor tương ứng) trước khi verify endpoint.

**Spec:** `docs/superpowers/specs/2026-06-20-cafe-insight-subagent-design.md`
**Phạm vi plan này:** chỉ P1. P2 (Meta/GA4 auto), P3 (phone-match + incrementality), P4 (MMM) = plan riêng sau.

---

## File Structure

| File | Trách nhiệm | Hành động |
|---|---|---|
| `gas/Marketing.gs` | Schema + I/O `MARKETING_LOG`, ROI data | Modify: thêm cột engagement vào headers/log/read |
| `gas/Insight.gs` | Tab `DECISION_LOG`: init + ghi + truy vấn dòng tới hạn review | Create |
| `gas/Code.gs` | Routing `doPost` (`log_content`, `log_decision`) | Modify |
| `web/dashboard.html` | Panel nhập tay số post → `apiPost('log_content')` | Modify |
| `.claude/agents/cafe-insight.md` | Định nghĩa subagent (thay `cafe-research.md`) | Create + xoá file cũ |

---

## Task 1: Mở rộng schema MARKETING_LOG

**Files:**
- Modify: `gas/Marketing.gs:16-19` (headers), `gas/Marketing.gs:60-79` (`logMarketingActivity`), `gas/Marketing.gs:85-103` (`getMarketingLog`)

- [ ] **Step 1: Thêm 12 cột mới vào `MARKETING_LOG_HEADERS`**

Thay block `gas/Marketing.gs:16-19`:
```javascript
var MARKETING_LOG_HEADERS = [
  'activity_id', 'date', 'type', 'platform', 'campaign_id', 'title',
  'utm_tag', 'cost_vnd', 'effort_hours', 'reach', 'clicks', 'notes',
  // --- P1 engagement chiều sâu (append, index >= 12) ---
  'impressions', 'views', 'likes', 'comments', 'shares', 'saves',
  'watch_time_sec', 'avg_watch_pct', 'format', 'topic', 'sku_featured', 'data_source'
];
```

- [ ] **Step 2: Ghi 12 trường mới trong `logMarketingActivity()`**

Trong `gas/Marketing.gs`, thay mảng `sheet.appendRow([...])` (dòng 64-77) — giữ 12 phần tử cũ, thêm 12 phần tử mới ngay trước dấu `]);`:
```javascript
  sheet.appendRow([
    id,
    a.date || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd'),
    a.type || 'post',
    a.platform || '',
    a.campaign_id || '',
    a.title || '',
    a.utm_tag || '',
    Number(a.cost_vnd) || 0,
    Number(a.effort_hours) || 0,
    Number(a.reach) || 0,
    Number(a.clicks) || 0,
    a.notes || '',
    Number(a.impressions) || 0,
    Number(a.views) || 0,
    Number(a.likes) || 0,
    Number(a.comments) || 0,
    Number(a.shares) || 0,
    Number(a.saves) || 0,
    Number(a.watch_time_sec) || 0,
    Number(a.avg_watch_pct) || 0,
    a.format || '',
    a.topic || '',
    a.sku_featured || '',
    a.data_source || 'manual',
  ]);
```

- [ ] **Step 3: Đọc 12 trường mới trong `getMarketingLog()`**

Thay object `rows.push({...})` (dòng 95-100):
```javascript
    rows.push({
      activity_id: r[0], date: date, type: r[2], platform: r[3],
      campaign_id: r[4], title: r[5], utm_tag: r[6],
      cost_vnd: Number(r[7]) || 0, effort_hours: Number(r[8]) || 0,
      reach: Number(r[9]) || 0, clicks: Number(r[10]) || 0, notes: r[11],
      impressions: Number(r[12]) || 0, views: Number(r[13]) || 0,
      likes: Number(r[14]) || 0, comments: Number(r[15]) || 0,
      shares: Number(r[16]) || 0, saves: Number(r[17]) || 0,
      watch_time_sec: Number(r[18]) || 0, avg_watch_pct: Number(r[19]) || 0,
      format: r[20] || '', topic: r[21] || '', sku_featured: r[22] || '',
      data_source: r[23] || '',
    });
```

- [ ] **Step 4: Thêm hàm migrate cột cho sheet đang tồn tại**

Thêm vào cuối `gas/Marketing.gs` (vì `initMarketingLog` không sửa sheet đã có):
```javascript
/**
 * P1: thêm các cột engagement mới vào MARKETING_LOG đang tồn tại.
 * Idempotent — chỉ thêm cột header còn thiếu, không đụng data.
 */
function migrateMarketingLogP1() {
  var sheet = _marketingSheet();
  if (!sheet) { initMarketingLog(); sheet = _marketingSheet(); }
  var lastCol = sheet.getLastColumn();
  var existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var added = 0;
  for (var i = 0; i < MARKETING_LOG_HEADERS.length; i++) {
    if (existing.indexOf(MARKETING_LOG_HEADERS[i]) === -1) {
      sheet.getRange(1, lastCol + 1 + added).setValue(MARKETING_LOG_HEADERS[i])
        .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
      added++;
    }
  }
  Logger.log('migrateMarketingLogP1: added ' + added + ' columns.');
  return added;
}
```

- [ ] **Step 5: Verify (Apps Script editor)**

Đồng bộ `Marketing.gs` lên project. Trong editor chạy `migrateMarketingLogP1`.
Expected: log `added 12 columns` (lần đầu) / `added 0 columns` (chạy lại). Mở Sheet → tab MARKETING_LOG có đủ 24 cột header, không mất data cũ.

- [ ] **Step 6: Verify round-trip ghi/đọc**

Trong editor chạy đoạn tạm:
```javascript
function _tmpTestP1() {
  var id = logMarketingActivity({ platform:'tiktok', title:'test reel', utm_tag:'tt-test',
    reach:1000, views:800, saves:40, shares:12, format:'reel', topic:'mon-spotlight',
    sku_featured:'DR001', data_source:'manual' });
  var rows = getMarketingLog(null, null);
  Logger.log(JSON.stringify(rows[rows.length-1]));
}
```
Expected: log object cuối có `saves:40, format:"reel", sku_featured:"DR001", data_source:"manual"`. Sau đó **xoá dòng test** khỏi Sheet + xoá hàm `_tmpTestP1`.

- [ ] **Step 7: Commit**
```bash
git add gas/Marketing.gs
git commit -m "feat(insight): extend MARKETING_LOG with engagement columns (P1)"
```

---

## Task 2: getRoiData surface cột engagement mới

**Files:**
- Modify: `gas/Marketing.gs` (`getRoiData`, đoạn gộp marketing)

- [ ] **Step 1: Xác nhận getRoiData dùng getMarketingLog**

Đọc `getRoiData` trong `gas/Marketing.gs`. Nếu nó gọi `getMarketingLog(from,to)` và đưa nguyên object vào output → cột mới đã tự có (vì Task 1 Step 3 đã thêm). Nếu nó tự đọc sheet theo index riêng → cập nhật để dùng `getMarketingLog(from,to)` thay cho vòng lặp tay.

- [ ] **Step 2: Verify endpoint roi_data trả field mới**

Deploy GAS. Chạy:
```bash
curl -s "https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec?action=roi_data&from=2026-06-01&to=2026-06-30" | python3 -m json.tool | grep -E "saves|format|data_source" | head
```
Expected: thấy `"saves"`, `"format"`, `"data_source"` trong phần `marketing[]`. (Nếu MARKETING_LOG trống thì seed 1 dòng qua `seedMarketingLogSamples()` trước.)

- [ ] **Step 3: Commit (nếu có sửa getRoiData)**
```bash
git add gas/Marketing.gs
git commit -m "feat(insight): surface engagement fields through getRoiData (P1)"
```

---

## Task 3: Tab DECISION_LOG (Insight.gs)

**Files:**
- Create: `gas/Insight.gs`

- [ ] **Step 1: Tạo `gas/Insight.gs` với init + ghi + truy vấn**
```javascript
/**
 * Insight.gs — DECISION_LOG: nhật ký quyết định content/menu/promo của subagent cafe-insight.
 * Mỗi quyết định có review_date (+14d); subagent quét dòng tới hạn để điền kết quả.
 */
var DECISION_LOG_HEADERS = [
  'decision_id', 'date', 'scope', 'ref_id', 'decision', 'rationale',
  'expected_metric', 'review_date', 'actual_result', 'hit_or_miss'
];

function _decisionSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DECISION_LOG');
}

/** Tạo tab DECISION_LOG (idempotent). */
function initDecisionLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('DECISION_LOG');
  if (sheet) { Logger.log('DECISION_LOG already exists.'); return; }
  sheet = ss.insertSheet('DECISION_LOG');
  sheet.appendRow(DECISION_LOG_HEADERS);
  sheet.getRange(1, 1, 1, DECISION_LOG_HEADERS.length)
    .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  Logger.log('DECISION_LOG created.');
}

function generateDecisionId() {
  var d = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  var rand = ('000' + Math.floor(Math.random() * 1000)).slice(-3);
  return 'DEC-' + d + '-' + rand;
}

/**
 * Ghi 1 quyết định. review_date = date + 14 ngày nếu không truyền.
 * @param {Object} d - { scope, ref_id, decision, rationale, expected_metric, date }
 * @return {string} decision_id
 */
function logDecision(d) {
  var sheet = _decisionSheet();
  if (!sheet) { initDecisionLog(); sheet = _decisionSheet(); }
  var tz = 'Asia/Ho_Chi_Minh';
  var date = d.date || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var review = d.review_date ||
    Utilities.formatDate(new Date(new Date(date).getTime() + 14 * 86400000), tz, 'yyyy-MM-dd');
  var id = d.decision_id || generateDecisionId();
  sheet.appendRow([
    id, date, d.scope || 'post', d.ref_id || '', d.decision || '',
    d.rationale || '', d.expected_metric || '', review, '', '',
  ]);
  return id;
}

/** Các quyết định đã tới hạn review (review_date <= hôm nay) & chưa có actual_result. */
function getDecisionsDue() {
  var sheet = _decisionSheet();
  if (!sheet || sheet.getLastRow() < 2) return [];
  var today = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  var data = sheet.getDataRange().getValues();
  var due = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    var reviewDate = (r[7] instanceof Date)
      ? Utilities.formatDate(r[7], 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') : String(r[7]);
    if (reviewDate && reviewDate <= today && !r[8]) {
      due.push({ row: i + 1, decision_id: r[0], scope: r[2], ref_id: r[3],
        decision: r[4], expected_metric: r[6], review_date: reviewDate });
    }
  }
  return due;
}

/** Điền kết quả review cho 1 quyết định (subagent gọi sau khi đánh giá). */
function recordDecisionResult(decisionId, actualResult, hitOrMiss) {
  var sheet = _decisionSheet();
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(decisionId)) {
      sheet.getRange(i + 1, 9).setValue(actualResult || '');
      sheet.getRange(i + 1, 10).setValue(hitOrMiss || '');
      return true;
    }
  }
  return false;
}
```

- [ ] **Step 2: Verify (editor)**

Đồng bộ `Insight.gs`. Chạy `initDecisionLog` → tab DECISION_LOG xuất hiện với 10 header. Chạy:
```javascript
function _tmpTestDec() {
  var id = logDecision({ scope:'post', ref_id:'MKT-20260620-001',
    decision:'SCALE', rationale:'ER 4.2% > benchmark, đơn 8, confidence MEDIUM',
    expected_metric:'+15% đơn DR001' });
  Logger.log('id=' + id + ' due=' + JSON.stringify(getDecisionsDue()));
}
```
Expected: tạo 1 dòng, `review_date` = +14 ngày, `getDecisionsDue()` trả `[]` (chưa tới hạn). Xoá dòng test + hàm tạm.

- [ ] **Step 3: Commit**
```bash
git add gas/Insight.gs
git commit -m "feat(insight): add DECISION_LOG sheet + log/query helpers (P1)"
```

---

## Task 4: doPost routes `log_content` + `log_decision`

**Files:**
- Modify: `gas/Code.gs` (trong `doPost`, khu vực route theo `payload.action`, sau các route hiện có ~dòng 64+)

- [ ] **Step 1: Thêm 2 route vào doPost**

Thêm sau block route device (sau dòng ~70 trong `doPost`, trước các route khác — đặt cạnh nhau):
```javascript
    // ── cafe-insight: nhập số post thủ công + ghi quyết định (admin session) ──
    if (payload && payload.action === 'log_content') {
      if (!validateSessionToken(payload.token)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      var cid = logMarketingActivity(payload.data || {});
      return _jsonResponse({ ok: true, activity_id: cid });
    }
    if (payload && payload.action === 'log_decision') {
      if (!validateSessionToken(payload.token)) {
        return _jsonResponse({ ok: false, error: 'unauthorized' });
      }
      var did = logDecision(payload.data || {});
      return _jsonResponse({ ok: true, decision_id: did });
    }
```

- [ ] **Step 2: Verify route (curl, cần admin token hợp lệ)**

Lấy session token bằng đăng nhập admin trên dashboard (hoặc `adminLogin`). Rồi:
```bash
curl -s -X POST "https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec" \
  -H "Content-Type: text/plain" \
  -d '{"action":"log_content","token":"<SESSION_TOKEN>","data":{"platform":"tiktok","title":"curl test","utm_tag":"tt-curl","reach":500,"views":400,"saves":20,"format":"reel","topic":"trend","data_source":"manual"}}'
```
Expected: `{"ok":true,"activity_id":"MKT-..."}`; token sai → `{"ok":false,"error":"unauthorized"}`. Xoá dòng test khỏi Sheet.

- [ ] **Step 3: Commit**
```bash
git add gas/Code.gs
git commit -m "feat(insight): doPost routes log_content + log_decision (P1)"
```

---

## Task 5: Panel nhập tay trong dashboard

**Files:**
- Modify: `web/dashboard.html` (thêm 1 section panel + JS submit; dùng `apiPost` có sẵn dòng 169 và `tk()`)

- [ ] **Step 1: Thêm markup panel**

Thêm 1 `<section>` vào vùng nội dung dashboard (cạnh các panel khác):
```html
<section class="card" id="content-log-panel">
  <h3>📊 Nhập số liệu bài đăng</h3>
  <div class="cl-grid">
    <select id="cl-platform"><option value="tiktok">TikTok</option><option value="threads">Threads</option><option value="fb">Facebook</option><option value="ig">Instagram</option></select>
    <select id="cl-format"><option value="reel">reel</option><option value="photo">photo</option><option value="carousel">carousel</option><option value="story">story</option><option value="live">live</option><option value="text">text</option></select>
    <select id="cl-topic"><option value="mon-spotlight">món spotlight</option><option value="behind-scene">hậu trường</option><option value="promo">promo</option><option value="ugc">UGC</option><option value="trend">trend</option><option value="thong-bao">thông báo</option><option value="khac">khác</option></select>
    <input id="cl-title" placeholder="Tiêu đề / mô tả ngắn">
    <input id="cl-utm" placeholder="utm_tag (vd tt-matcha-reel)">
    <input id="cl-sku" placeholder="SKU nổi bật (vd DR001)">
    <input id="cl-reach" type="number" placeholder="reach">
    <input id="cl-views" type="number" placeholder="views">
    <input id="cl-likes" type="number" placeholder="likes">
    <input id="cl-comments" type="number" placeholder="comments">
    <input id="cl-shares" type="number" placeholder="shares">
    <input id="cl-saves" type="number" placeholder="saves">
    <input id="cl-clicks" type="number" placeholder="link clicks">
    <input id="cl-watch" type="number" placeholder="watch time (giây)">
    <input id="cl-watchpct" type="number" placeholder="avg watch %">
    <input id="cl-date" type="date">
  </div>
  <button id="cl-submit">Lưu bài đăng</button>
  <div id="cl-msg" class="cl-msg"></div>
</section>
```

- [ ] **Step 2: Thêm JS submit (dùng apiPost + tk() có sẵn)**

Thêm vào khối `<script>`:
```javascript
function clVal(id){const el=document.getElementById(id);return el?el.value:'';}
function clNum(id){return Number(clVal(id))||0;}
document.getElementById('cl-submit').addEventListener('click', async function(){
  const msg=document.getElementById('cl-msg');
  const utm=clVal('cl-utm').trim();
  if(!utm){msg.textContent='⚠️ Cần utm_tag để đối soát đơn.';return;}
  msg.textContent='Đang lưu…';
  const data={ platform:clVal('cl-platform'), type:'post', format:clVal('cl-format'),
    topic:clVal('cl-topic'), title:clVal('cl-title'), utm_tag:utm, sku_featured:clVal('cl-sku'),
    date:clVal('cl-date'), reach:clNum('cl-reach'), views:clNum('cl-views'), likes:clNum('cl-likes'),
    comments:clNum('cl-comments'), shares:clNum('cl-shares'), saves:clNum('cl-saves'),
    clicks:clNum('cl-clicks'), watch_time_sec:clNum('cl-watch'), avg_watch_pct:clNum('cl-watchpct'),
    data_source:'manual' };
  try{
    const r=await apiPost({action:'log_content', token:tk(), data:data});
    if(r.ok){msg.textContent='✅ Đã lưu: '+r.activity_id; document.querySelectorAll('#content-log-panel input').forEach(function(i){i.value='';});}
    else{msg.textContent='❌ '+(r.error||'lỗi');}
  }catch(e){msg.textContent='❌ Lỗi kết nối';}
});
```

- [ ] **Step 3: Verify (browser preview)**

Khởi động preview phục vụ `web/`, mở `dashboard.html`, đăng nhập admin để có `tk()`. Điền platform=tiktok, utm=`tt-preview`, reach=500, saves=20, format=reel, topic=trend → bấm "Lưu bài đăng".
Expected: hiện `✅ Đã lưu: MKT-...`; tab MARKETING_LOG có dòng mới đúng cột. Bỏ trống utm → hiện cảnh báo, không gọi API. Xoá dòng test khỏi Sheet.

- [ ] **Step 4: Commit**
```bash
git add web/dashboard.html
git commit -m "feat(insight): dashboard manual post-metrics input panel (P1)"
```

---

## Task 6: Subagent cafe-insight (thay cafe-research)

**Files:**
- Create: `.claude/agents/cafe-insight.md`
- Delete: `.claude/agents/cafe-research.md`

- [ ] **Step 1: Viết `.claude/agents/cafe-insight.md`**
```markdown
---
name: cafe-insight
description: Isolated analytics + research agent cho Mitsu / Lâm Hà Kissaten. Use cho deep multi-step work — phân tích content→doanh số (scorecard từng bài + SWOT + SCALE/KILL/ITERATE), menu mix, RFM, ROI, competitor scan, batch content, reviews, trend. Gộp từ cafe-research. KHÔNG dùng cho task ngắn — đã có skill cafe-manager.
tools: WebSearch, WebFetch, Read, Write, Bash, Glob, Grep, Skill
---

# cafe-insight subagent

Isolated agent cho **Lâm Hà Kissaten (Mitsu)**. Nhận 1 task cụ thể từ parent → execute end-to-end → trả report ngắn gọn. Mục tiêu duy nhất: **tăng doanh số bằng dữ liệu**.

## Nguyên tắc
1. **Brand voice** — đọc `docs/brand-voice.md` trước khi draft content.
2. **Reuse skill `cafe-manager`** (+ /menu-eng /khach /roi /doi-thu /trend /post /promo) qua Skill tool.
3. **Output structured markdown**, ngắn (< 2000 từ) — parent sẽ tóm tắt.
4. **Save artifacts** vào `docs/<category>/YYYY-MM-DD-*.md`.
5. Tiếng Việt cho copy, English cho code identifier.
6. **Draft-only** — không auto-publish bất kỳ thứ gì.

## Nguồn dữ liệu
- ROI gộp: GET `…/exec?action=roi_data&from=YYYY-MM-DD&to=YYYY-MM-DD&token=<REPORT_API_TOKEN>`
  → `{ orders[], promotions[], marketing[], menu_costs{} }`. `marketing[]` chứa số post (reach, views, saves, shares, format, topic, sku_featured…).
- RFM: `action=rfm_snapshot`. Menu eng: `action=menu_engineering_data`.
- GAS base: `https://script.google.com/macros/s/AKfycbylzJojjKcjcaD91I7iVkWrnFhP7Ts_edofw42JgoNek-uGBp5m6_9FPoB5bYYtB87i/exec`

## CHẾ ĐỘ A — Phân tích content→doanh số (mặc định)
Chạy thang 4 tầng:

**1. DESCRIPTIVE** — mỗi post (từ `marketing[]`): engagement rate = (likes+comments+shares+saves)/reach; so benchmark F&B (TikTok 3.0–3.5%, IG 2.0–2.5%; video > ảnh; save+share = ý định mua). CTR = clicks/reach.

**2. DIAGNOSTIC (context normalizer — chạy TRƯỚC khi chấm)** — phủ hoàn cảnh: thứ/ngày, payday, cuối tuần (khách Đà Lạt/Bảo Lộc), thời tiết (mưa đèo/sương), promo đang chạy, đối thủ (/doi-thu). Tách lift "do nội dung" vs "do thời điểm".

**3. Đối soát đơn** — ghép post→ORDERS qua `utm_tag` (đơn trong 72h). Tính đơn ghi công, doanh thu, và **lãi gộp** = doanh thu − COGS(`menu_costs`) − discount(`promotions`) − `cost_vnd`. Menu mix: post đẩy món nào, tỉ lệ bán giữa món, AOV, attach-rate (compose /menu-eng). Khách mới vs quay lại (/khach RFM).

**4. confidence_level (tự tính)** — `LOW` nếu clicks<30 HOẶC đơn<3 (chỉ tham khảo, đừng dồn boost); `MEDIUM` clicks 30–100 / đơn 3–10; `HIGH` clicks>100 / đơn>10.

**5. PRESCRIPTIVE** — mỗi post: **SCALE / KILL / ITERATE** (vd save/share cao nhưng đơn ít do mưa → ITERATE, không KILL). Đề xuất danh mục 70-20-10, lệnh tiếp cho /post /promo. **Ghi quyết định** qua POST `action=log_decision` (scope/ref_id=activity_id/decision/rationale/expected_metric).

**6. Review loop** — đầu mỗi lần chạy, GET dòng tới hạn (subagent có thể hỏi parent chạy `getDecisionsDue()`); đánh giá kết quả thực; ghi lại qua `recordDecisionResult`.

Output: scorecard table (post | ER vs benchmark | đơn | lãi gộp | confidence | SWOT 1 dòng | quyết định) + 3 hành động ưu tiên. Save `docs/insight-reports/YYYY-MM-DD.md`.

## CHẾ ĐỘ B — Research (gộp từ cafe-research)
Giữ nguyên 5 use-case cũ: (1) competitor scan → `docs/competitor-scan/YYYY-MM.md`; (2) batch content → `docs/content-batches/`; (3) RFM refresh + winback drafts; (4) reviews monitor → REVIEWS_LOG; (5) deep trend scan → `docs/trend-research/`.

## Anti-patterns
- ❌ Wandering / output > 2000 từ
- ❌ Auto-publish lên social (draft only)
- ❌ Chấm SCALE khi confidence=LOW
- ❌ Bỏ qua context normalizer → quy nhầm lift thời tiết thành "post hay"
- ❌ Bịa đơn ghi công cho khách organic không có UTM/phone-link (xếp `unattributed`)
- ❌ Save artifact ngoài `docs/` · Loop subagent

## Tham chiếu
- Spec: `docs/superpowers/specs/2026-06-20-cafe-insight-subagent-design.md`
- Brand voice: `docs/brand-voice.md` · Social handles: `web/mitsu.html` ~line 1030-1049 · Phone: 0975 087 429
```

- [ ] **Step 2: Xoá agent cũ**
```bash
git rm .claude/agents/cafe-research.md
```

- [ ] **Step 3: Verify định nghĩa hợp lệ**

Đảm bảo frontmatter có `name`, `description`, `tools`. Kiểm không còn tham chiếu `cafe-research` trong repo:
```bash
grep -rn "cafe-research" .claude/ docs/ CLAUDE.md 2>/dev/null
```
Expected: chỉ còn các tham chiếu lịch sử trong spec/memory (chấp nhận); KHÔNG còn file agent `cafe-research.md`.

- [ ] **Step 4: Commit**
```bash
git add .claude/agents/cafe-insight.md
git commit -m "feat(insight): cafe-insight subagent replaces cafe-research (P1)"
```

---

## Self-Review (đã chạy)

- **Spec coverage:** §8.1 MARKETING_LOG→Task 1-2; §8.2 DECISION_LOG→Task 3; §6.5 review loop→Task 3 (`getDecisionsDue`/`recordDecisionResult`); §6.6 panel→Task 5; doPost→Task 4; subagent §9 + 7 module + §6.1 confidence + §6.4 context→Task 6. §8.3 CUSTOMERS social-id, Meta token §7, GA4 = **P2/P3** (ngoài plan này, có chú thích).
- **Placeholder scan:** không có TBD/TODO; mọi code step có code thật.
- **Type consistency:** `logMarketingActivity` field names (saves/format/data_source…) khớp giữa Task 1, Task 4, panel Task 5, subagent Task 6. `logDecision`/`getDecisionsDue`/`recordDecisionResult` khớp Task 3 ↔ Task 6.
- **Lưu ý thực thi:** mỗi lần sửa `.gs` phải đồng bộ lên Apps Script project trước khi verify endpoint; xoá mọi dòng/hàm test tạm sau khi verify.
```
