/* cham-cong.js — UI chấm công LAN.
   Không giữ PIN ở bất kỳ storage nào: chủ đăng nhập lấy token TTL 15 phút,
   token nằm trong sessionStorage (mất khi đóng tab). */
'use strict';

var POLL_MS = 20000;
var RESULT_MS = 3000;
var OWNER_IDLE_MS = 10 * 60 * 1000;

var state = { staff: [], picking: null, pin: '', ownerMode: false, idleTimer: null,
              staffLoaded: false, gen: 0, busy: false };

var $ = function (id) { return document.getElementById(id); };

/* Chuỗi từ Google Sheet (owner tự sửa) không được tin — escape trước khi
   nhét vào innerHTML. Copy nguyên bản từ web/signage.js:76 để đồng nhất. */
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

function offline(on) { $('offline').classList.toggle('on', !!on); }

function api(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  var tok = sessionStorage.getItem('ownerSession');
  if (tok) opts.headers['X-Owner-Session'] = tok;
  return fetch(path, opts).then(function (r) {
    // Trong lúc grid tên NHÂN VIÊN chưa từng tải được lần nào, trang coi như
    // hỏng — dù request khác (vd refreshToday) có thành công cũng KHÔNG được
    // tắt banner đỏ, kẻo nhân viên tưởng máy đã hồi phục trong khi grid vẫn trống.
    if (state.staffLoaded) { offline(false); }
    return r.json().then(function (b) { return { status: r.status, body: b }; });
  }).catch(function (e) { offline(true); throw e; });
}

/* ── màn nhân viên ─────────────────────────────────────────────── */
var staffRetryTimer = null;

function loadStaff() {
  api('/attendance/staff').then(function (r) {
    state.staff = r.body.staff || [];
    state.staffLoaded = true;
    offline(false);
    if (staffRetryTimer) { clearTimeout(staffRetryTimer); staffRetryTimer = null; }
    var g = $('grid');
    g.innerHTML = '';
    if (state.staff.length === 0) {
      // {ok:true, staff:[]} xảy ra khi cache STAFF chưa đồng bộ lần nào (mới
      // cài) hoặc token GAS sai cấu hình — request THÀNH CÔNG nhưng không có
      // nghĩa là trang đã sẵn sàng. Lưới trống im lặng khiến nhân viên đứng
      // trước "Đang trong ca: 0" không biết bấm vào đâu. Phải nói rõ + tự thử
      // lại nền, KHÔNG có nút "thử lại" nào khác cho họ.
      g.innerHTML = '<p style="text-align:center;color:var(--dim);padding:20px 8px">' +
        'Danh sách nhân viên chưa đồng bộ — báo chủ quán kiểm tra.</p>';
      if (!staffRetryTimer) {
        staffRetryTimer = setTimeout(function () { staffRetryTimer = null; loadStaff(); }, 5000);
      }
      return;
    }
    state.staff.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'who';
      b.textContent = s.name;          // textContent — không cần esc()
      b.onclick = function () { pick(s); };
      g.appendChild(b);
    });
    populateManualStaffSelect();
  }).catch(function () {
    // Wifi rớt ngay lúc load trang: KHÔNG được để grid trống mà im lặng.
    // Bật banner đỏ + tự thử lại mỗi 5s tới khi thành công — nhân viên không
    // có nút "thử lại" nào khác để bấm.
    offline(true);
    if (!staffRetryTimer) {
      staffRetryTimer = setTimeout(function () { staffRetryTimer = null; loadStaff(); }, 5000);
    }
  });
}

function pick(s) {
  state.picking = s;
  state.pin = '';
  $('grid').style.display = 'none';
  $('pinpad').classList.add('on');
  $('pinwho').textContent = s.name;    // textContent — không cần esc()
  drawDots();
}

function drawDots() {
  $('dots').textContent = '●'.repeat(state.pin.length) + '○'.repeat(4 - state.pin.length);
}

function buildKeys() {
  var k = $('keys');
  k.innerHTML = '';
  ['1','2','3','4','5','6','7','8','9','','0','⌫'].forEach(function (d) {
    var b = document.createElement('button');
    b.textContent = d;
    if (!d) { b.style.visibility = 'hidden'; }
    b.onclick = function () {
      // Mạng chậm: punch/owner-login trước còn bay giữa chừng thì chặn phím,
      // tránh gõ đủ 4 số lần nữa bắn quả toggle thứ hai đè lên quả đầu.
      if (state.busy) { return; }
      if (d === '⌫') { state.pin = state.pin.slice(0, -1); }
      else if (d) { state.pin += d; }
      drawDots();
      if (state.pin.length === 4) { submitPin(); }   // đủ 4 số là gửi, không cần nút OK
    };
    k.appendChild(b);
  });
}

function submitPin() {
  var pin = state.pin, who = state.picking;
  state.pin = '';
  drawDots();
  state.busy = true;
  if (state.ownerMode) { return ownerLogin(who, pin); }
  doPunch(who, pin, randNonce(), false);
}

function randNonce() {
  return 'p' + Date.now() + '-' + Math.random().toString(16).slice(2, 8);
}

function doPunch(who, pin, nonce, confirmed, intent) {
  var myGen = state.gen;   // "Huỷ"/idle-out tăng gen — phản hồi trễ tới sau phải bị bỏ
  api('/attendance/punch', {
    method: 'POST',
    body: JSON.stringify({ staff_id: who.staff_id, pin: pin, nonce: nonce,
                           confirm_quick_out: confirmed, intent: intent || null })
  }).then(function (r) {
    if (myGen !== state.gen) { state.busy = false; return; }   // đã bị huỷ — không đụng UI/storage
    if (r.status === 429) {
      state.busy = false;
      return showResult('Nhập sai nhiều lần. Thử lại sau ' +
                        (r.body.retry_after || 60) + 's', false);
    }
    if (r.status !== 200) { state.busy = false; return showResult(r.body.error || 'Lỗi', false); }
    if (r.body.action === 'confirm_needed') {
      // Vẫn coi là "busy" — còn chờ confirm() rồi gửi lại lượt nữa, chưa xong.
      if (confirm(r.body.message)) { doPunch(who, pin, randNonce(), true); }
      else { state.busy = false; reset(); }
      return;
    }
    if (r.body.action === 'choose_unclosed') {
      // Vẫn "busy" — màn chọn 2 nút tính là còn dở dang, chờ intent rồi gửi
      // lại lượt punch nữa (§U1: server không tự đoán close_late/new_shift).
      return showUnclosedChoice(who, pin, r.body.row, myGen);
    }
    state.busy = false;
    var row = r.body.row;
    if (r.body.action === 'in') {
      showResult('✅ Vào ca ' + hhmm(row.clock_in_at) + ' · chào ' + row.staff_name, true);
    } else if (r.body.action === 'close_late') {
      // KHÔNG được nói "đã ghi giờ ra" — server cố ý không bịa clock_out_at,
      // ca vẫn nằm trong danh sách unclosed chờ chủ nhập giờ thật (§U1).
      showResult('Đã ghi nhận. Chủ sẽ nhập giờ ra.', true);
    } else {
      showResult('✅ Ra ca ' + hhmm(row.clock_out_at) + ' · hôm nay ' +
                 dur(row.minutes_worked), true);
    }
    refreshToday();
  }).catch(function () {
    state.busy = false;
    if (myGen !== state.gen) { return; }
    showResult('Mất kết nối máy quán', false);
  });
}

/* Ca gần nhất của người này là UNCLOSED (bị đợt quét 04:00 đánh dấu) — server
   từ chối đoán hộ, phải hỏi lại bằng 2 nút thật (không dùng confirm(): đây là
   lựa chọn ảnh hưởng trực tiếp tới lương, OK/Cancel không đủ rõ nghĩa). */
var UNCLOSED_CHOICE_MS = 30000;
var unclosedTimeoutTimer = null;

function clearUnclosedTimeout() {
  if (unclosedTimeoutTimer) { clearInterval(unclosedTimeoutTimer); unclosedTimeoutTimer = null; }
}

function updateUnclosedCountdown(sec) {
  var el = $('unclosedCountdown');
  if (el) { el.textContent = 'Màn hình tự đóng sau ' + sec + 's nếu không bấm gì'; }
}

/* Màn này (không như pinpad/result) trước đây chờ vô thời hạn với state.busy
   = true, tên+pin của người vừa bấm còn giữ nguyên trong closure của 2 nút.
   Trên máy tính bảng dùng chung của quán, người kế tiếp bước tới, thấy 2 nút,
   bấm "Vào ca mới" — mở ca dưới DANH TÍNH người trước. Phải tự đóng như mọi
   màn khác + hiện rõ đếm ngược cho người đọc biết màn sắp biến mất. */
function startUnclosedTimeout() {
  clearUnclosedTimeout();
  var remaining = UNCLOSED_CHOICE_MS / 1000;
  updateUnclosedCountdown(remaining);
  unclosedTimeoutTimer = setInterval(function () {
    remaining -= 1;
    if (remaining <= 0) {
      clearUnclosedTimeout();
      state.busy = false;
      $('unclosedChoice').classList.remove('on');
      reset();
      return;
    }
    updateUnclosedCountdown(remaining);
  }, 1000);
}

function showUnclosedChoice(who, pin, row, myGen) {
  $('unclosedMsg').innerHTML = 'Ca ngày ' + esc(row.date) + ' lúc ' + hhmm(row.clock_in_at) +
    ' của ' + esc(who.name) + ' chưa đóng. Bạn muốn?';
  $('pinpad').classList.remove('on');
  $('unclosedChoice').classList.add('on');
  startUnclosedTimeout();
  $('unclosedCloseLate').onclick = function () {
    if (myGen !== state.gen) { return; }   // huỷ/idle-out xảy ra trong lúc màn hình còn mở
    clearUnclosedTimeout();
    $('unclosedChoice').classList.remove('on');
    doPunch(who, pin, randNonce(), false, 'close_late');
  };
  $('unclosedNewShift').onclick = function () {
    if (myGen !== state.gen) { return; }
    clearUnclosedTimeout();
    $('unclosedChoice').classList.remove('on');
    doPunch(who, pin, randNonce(), false, 'new_shift');
  };
  $('unclosedCancel').onclick = function () {
    clearUnclosedTimeout();
    state.busy = false;
    $('unclosedChoice').classList.remove('on');
    reset();
  };
}

function hhmm(iso) { return String(iso || '').slice(11, 16); }
function dur(m) { m = m || 0; return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); }

function showResult(text, ok) {
  // text ở đây luôn do client tự dựng (tiếng Việt cố định + số/giờ), không
  // phải chuỗi từ Sheet — dùng textContent nên vẫn an toàn dù có esc() hay không.
  var r = $('result');
  r.textContent = text;
  r.className = 'on' + (ok ? ' ok' : '');
  $('pinpad').classList.remove('on');
  setTimeout(reset, RESULT_MS);       // tự về lưới tên, người sau bấm được ngay
}

function reset() {
  state.gen++;   // vô hiệu hoá mọi response đang bay từ lượt trước (xem doPunch/ownerLogin)
  clearUnclosedTimeout();
  state.picking = null; state.pin = ''; state.ownerMode = false;
  $('result').className = '';
  $('pinpad').classList.remove('on');
  $('unclosedChoice').classList.remove('on');
  $('grid').style.display = '';
}

/* ── đang trong ca ─────────────────────────────────────────────── */
function refreshToday() {
  api('/attendance/today').then(function (r) {
    var open = r.body.open || [];
    $('incount').textContent = 'Đang trong ca: ' + open.length;
    $('chips').innerHTML = open.map(function (o) {
      return '<span class="chip">' + esc(o.staff_name) + ' · ' + hhmm(o.clock_in_at) + '</span>';
    }).join('');
  }).catch(function () {});
}

setInterval(function () {
  if (document.visibilityState === 'visible') { refreshToday(); }
}, POLL_MS);

/* ── màn chủ ───────────────────────────────────────────────────── */
$('ownerbtn').onclick = function () {
  var owner = state.staff.filter(function (s) { return s.role === 'owner'; })[0];
  if (!owner) { return alert('Chưa có tài khoản chủ trong STAFF'); }
  state.ownerMode = true;
  pick(owner);
};

function ownerLogin(who, pin) {
  var myGen = state.gen;   // "Huỷ"/idle-out tăng gen — phản hồi trễ tới sau phải bị bỏ
  api('/attendance/owner_login', {
    method: 'POST',
    body: JSON.stringify({ staff_id: who.staff_id, pin: pin })
  }).then(function (r) {
    if (myGen !== state.gen) { state.busy = false; return; }   // đã bị huỷ — không đụng UI/storage
    if (r.status === 429) {
      state.busy = false;
      return showResult('Nhập sai nhiều lần. Thử lại sau ' +
                        (r.body.retry_after || 60) + 's', false);
    }
    if (r.status !== 200) {
      state.busy = false;
      return showResult(r.body.error || 'Không vào được', false);
    }
    state.busy = false;
    sessionStorage.setItem('ownerSession', r.body.session_token);
    $('pinpad').classList.remove('on');
    $('owner').classList.add('on');
    loadReport();
    bumpIdle();
  }).catch(function () {
    state.busy = false;
    if (myGen !== state.gen) { return; }
    showResult('Mất kết nối máy quán', false);
  });
}

function ymd(d) {
  // KHÔNG dùng toISOString: nó trả về ngày theo UTC, mà quán ở +07 —
  // từ 00:00 tới 06:59 giờ local nó lùi một ngày, làm bảng công mất
  // nguyên ngày gần nhất mà không báo lỗi gì.
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

function range(period) {
  var now = new Date(), s = new Date(now), e = new Date(now);
  if (period === 'week') {
    // Tuần bắt đầu thứ Hai. getDay()===0 là CHỦ NHẬT — không đi theo quy luật
    // "lùi (thứ tự trong tuần) trừ 1" như các ngày còn lại, mà phải lùi về
    // thứ Hai của CHÍNH tuần đó, tức lùi 6 ngày. Bỏ case này (vd "đơn giản hoá"
    // về công thức chung `getDay() - 1`) làm from > to và server trả rỗng cả
    // tuần mà không báo lỗi gì — xem báo cáo review, verified 2026-08-02.
    var day = now.getDay();
    s.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
  }
  else if (period === 'month') { s.setDate(1); }
  return { from: ymd(s), to: ymd(e) };
}

function loadReport() {
  var r = range($('period').value);
  api('/attendance/report?from=' + r.from + '&to=' + r.to).then(function (res) {
    if (res.status === 401) { return ownerOut(true); }
    $('reportbody').innerHTML = (res.body.by_staff || []).map(function (a) {
      return '<tr><td>' + esc(a.staff_name) + '</td><td>' + a.shifts + '</td><td>' +
             dur(a.minutes) + '</td></tr>';
    }).join('') || '<tr><td colspan="3">Chưa có ca nào</td></tr>';
    window._lastUnclosed = {};
    (res.body.unclosed || []).forEach(function (u) { window._lastUnclosed[u.punch_id] = u; });
    // punch_id do server sinh (ATT-YYYYMMDD-HHMMSS-XXXXXXXX, xem
    // attendance_store.new_punch_id) — không phải chuỗi người dùng nhập, an
    // toàn để nhét thẳng vào attribute onclick. staff_name thì luôn esc().
    $('unclosedbody').innerHTML = (res.body.unclosed || []).map(function (u) {
      // edit_note phân biệt UNCLOSED thô (quét 04:00, chưa ai đụng vào) với
      // AWAIT_OWNER (nhân viên đã xác nhận "Ra ca hôm qua") — chuỗi này đến
      // từ Sheet/DB, không phải hằng số client, nên luôn esc() trước innerHTML.
      return '<tr class="unclosed"><td>' + esc(u.staff_name) + '</td><td>' + u.date +
             ' vào ' + hhmm(u.clock_in_at) + '</td><td>' + esc(u.edit_note || '') +
             '</td><td><button class="linkbtn" ' +
             'onclick="fixShift(\'' + u.punch_id + '\')">Nhập giờ ra</button></td></tr>';
    }).join('') || '<tr><td>Không có ca hở</td></tr>';
  }).catch(function () {
    // Refresh lỗi: KHÔNG được để bảng cũ nằm im như thể là số mới — chủ có
    // thể chốt lương nhầm trên số liệu cũ. Chèn cảnh báo, giữ nguyên bảng cũ.
    offline(true);
    if ($('reportbody').innerHTML.indexOf('stale-warn') === -1) {
      $('reportbody').innerHTML = '<tr class="stale-warn"><td colspan="3">' +
        '⚠️ Không tải được số mới — bảng dưới có thể đã cũ</td></tr>' +
        $('reportbody').innerHTML;
    }
  });
}

/* Ca qua đêm (vào 21:00 hôm trước, ra 02:00 hôm sau) trước đây luôn ghép giờ
   ra với NGÀY BẮT ĐẦU ca (prompt chỉ hỏi giờ) — chủ gõ "02:00" thì client gửi
   <ngày_vào>T02:00, server thấy giờ ra trước giờ vào nên từ chối, và không có
   đường nào khác để chủ sửa ngày. Form dưới cho nhập rõ NGÀY ra, mặc định =
   ngày bắt đầu ca (trường hợp cùng ngày là phổ biến nhất, vẫn 1 bước). */
var _fixPunchId = null;

window.fixShift = function (punchId) {
  var row = (window._lastUnclosed || {})[punchId];
  _fixPunchId = punchId;
  $('fixWho').textContent = row ? row.staff_name : '';   // textContent — không cần esc()
  $('fixDate').value = (row && row.date) || ymd(new Date());
  $('fixTime').value = '';
  $('fixNote').value = '';
  $('fixError').textContent = '';
  $('fixForm').style.display = 'block';
};

$('fixCancel').onclick = function () {
  $('fixForm').style.display = 'none';
  _fixPunchId = null;
};

$('fixSave').onclick = function () {
  var day = $('fixDate').value, t = $('fixTime').value;
  if (!day || !t) { $('fixError').textContent = 'Cần nhập đủ ngày và giờ ra'; return; }
  var note = $('fixNote').value || '';
  $('fixError').textContent = '';
  api('/attendance/fix', {
    method: 'POST',
    body: JSON.stringify({ punch_id: _fixPunchId, note: note,
                           clock_out_at: day + 'T' + t + ':00+07:00' })
  }).then(function (r) {
    // Phiên hết hạn giữa lúc sửa giờ: bật lại PIN pad như loadReport, đừng để
    // chủ đứng hình trên dashboard không còn dùng được.
    if (r.status === 401) { return ownerOut(true); }
    if (r.status !== 200) {
      $('fixError').textContent = r.body.error || 'Không sửa được';
      return;
    }
    $('fixForm').style.display = 'none';
    _fixPunchId = null;
    loadReport();
  }).catch(function () {
    offline(true);
    $('fixError').textContent = 'Mất kết nối máy quán — chưa lưu được sửa giờ, thử lại.';
  });
};

/* ── Thêm ca tay (§U3) ─────────────────────────────────────────────
   docs/system/attendance.md + offline-failover.md đã hứa nút này để chủ tự
   cứu bảng công khi Mac Mini/mạng sập, nhưng UI chưa từng có — chỉ backend
   /attendance/create_manual tồn tại. */
function populateManualStaffSelect() {
  var sel = $('manualStaff');
  if (!sel) { return; }
  sel.innerHTML = '';
  state.staff.forEach(function (s) {
    var o = document.createElement('option');
    o.value = s.staff_id;
    o.textContent = s.name;   // textContent — không cần esc()
    sel.appendChild(o);
  });
}

// Nonce sinh MỘT LẦN cho lượt nhập đang dở, chỉ đổi sang cái mới SAU khi tạo
// thành công (§F8 phía server). Double-tap hay bấm lại sau lỗi mạng đều dùng
// lại đúng nonce này — server thấy nonce cũ sẽ trả về ca đã tạo, không đẻ
// thêm ca thứ hai cho cùng một lượt nhập.
var manualNonce = randNonce();

/* Ngày RA mặc định = ngày VÀO (trường hợp phổ biến, vẫn 1 bước) nhưng chủ có
   thể tự sửa cho ca qua đêm (§P2a: 21:00 hôm nay -> 02:00 hôm sau). Trước đây
   chỉ có 1 ô ngày dùng chung cho cả vào lẫn ra — ca qua đêm luôn bị server từ
   chối 400 vì giờ ra hoá ra "trước" giờ vào cùng ngày, và form này không có
   đường nào khác để sửa NGÀY ra, chỉ có giờ. Đây là đường DUY NHẤT phục hồi ca
   sau khi mất mạng/máy in, tức đúng lúc cần ghi ca đêm nhất. Chỉ tự đồng bộ
   khi chủ CHƯA tự tay sửa ô ngày ra — sửa rồi thì tôn trọng lựa chọn đó. */
var manualDateOutTouched = false;
if ($('manualDateOut')) {
  $('manualDateOut').addEventListener('input', function () { manualDateOutTouched = true; });
}
if ($('manualDateIn')) {
  $('manualDateIn').addEventListener('input', function () {
    if (!manualDateOutTouched) { $('manualDateOut').value = $('manualDateIn').value; }
  });
}

$('manualSave').onclick = function () {
  var staffId = $('manualStaff').value;
  var dayIn = $('manualDateIn').value, dayOut = $('manualDateOut').value || dayIn;
  var tin = $('manualIn').value, tout = $('manualOut').value;
  var note = $('manualNote').value || '';
  if (!staffId) { $('manualError').textContent = 'Chưa chọn nhân viên'; return; }
  if (!dayIn || !dayOut || !tin || !tout) {
    $('manualError').textContent = 'Cần nhập đủ ngày vào, ngày ra, giờ vào và giờ ra';
    return;
  }
  $('manualError').textContent = '';
  $('manualSave').disabled = true;
  api('/attendance/create_manual', {
    method: 'POST',
    body: JSON.stringify({ staff_id: staffId, note: note, nonce: manualNonce,
                           clock_in_at: dayIn + 'T' + tin + ':00+07:00',
                           clock_out_at: dayOut + 'T' + tout + ':00+07:00' })
  }).then(function (r) {
    $('manualSave').disabled = false;
    if (r.status === 401) { return ownerOut(true); }
    if (r.status === 409) {
      // §P2c: nonce lặp lại nhưng lần này giờ/ghi chú KHÁC lần lưu trước —
      // KHÔNG được coi là thành công (server đã từ chối). Đổi nonce mới để
      // lần bấm kế tiếp (sau khi chủ đã xem lại) không tiếp tục kẹt xung đột
      // với ca đã lưu, nhưng giữ nguyên form để chủ tự đối chiếu giờ đã lưu.
      manualNonce = randNonce();
      var old = r.body.row || {};
      $('manualError').textContent = (r.body.error || 'Dữ liệu xung đột với ca đã lưu') +
        (old.clock_in_at ? (' (ca đã lưu: ' + hhmm(old.clock_in_at) + '–' +
                            hhmm(old.clock_out_at) + ')') : '');
      return;
    }
    if (r.status !== 200) {
      $('manualError').textContent = r.body.error || 'Không thêm được ca';
      return;
    }
    manualNonce = randNonce();   // lượt nhập này đã xong — lượt sau cần nonce mới
    manualDateOutTouched = false;
    $('manualIn').value = ''; $('manualOut').value = ''; $('manualNote').value = '';
    loadReport();
  }).catch(function () {
    $('manualSave').disabled = false;
    offline(true);
    $('manualError').textContent = 'Mất kết nối máy quán — chưa lưu được, thử lại (không tạo trùng ca).';
  });
};

function ownerOut(expired) {
  state.gen++;   // vô hiệu hoá response đang bay (vd ownerLogin trễ) — xem reset()
  sessionStorage.removeItem('ownerSession');
  $('owner').classList.remove('on');
  $('fixForm').style.display = 'none';   // đừng để form sửa ca cũ hiện lại lần đăng nhập sau
  _fixPunchId = null;
  reset();
  if (expired) { alert('Phiên hết hạn, nhập lại PIN'); }
}

$('ownerout').onclick = function () { ownerOut(false); };
$('period').onchange = loadReport;

function bumpIdle() {
  clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(function () { ownerOut(true); }, OWNER_IDLE_MS);
}
['click', 'touchstart', 'keydown'].forEach(function (ev) {
  document.addEventListener(ev, function () {
    if (sessionStorage.getItem('ownerSession')) { bumpIdle(); }
  });
});

window.addEventListener('offline', function () { offline(true); });
window.addEventListener('online', function () {
  // KHÔNG tắt banner trực tiếp ở đây — 'online' chỉ nghĩa là card mạng lên,
  // không nghĩa là server /attendance đã trả lời được. Để api() tự tắt banner
  // khi có phản hồi thật (và chỉ khi staffLoaded, xem api()).
  refreshToday();
  loadStaff();
});
$('cancel').onclick = reset;

buildKeys();
loadStaff();
refreshToday();
