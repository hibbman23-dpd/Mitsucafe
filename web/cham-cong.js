/* cham-cong.js — UI chấm công LAN.
   Không giữ PIN ở bất kỳ storage nào: chủ đăng nhập lấy token TTL 15 phút,
   token nằm trong sessionStorage (mất khi đóng tab). */
'use strict';

var POLL_MS = 20000;
var RESULT_MS = 3000;
var OWNER_IDLE_MS = 10 * 60 * 1000;

var state = { staff: [], picking: null, pin: '', ownerMode: false, idleTimer: null };

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
    offline(false);
    return r.json().then(function (b) { return { status: r.status, body: b }; });
  }).catch(function (e) { offline(true); throw e; });
}

/* ── màn nhân viên ─────────────────────────────────────────────── */
function loadStaff() {
  api('/attendance/staff').then(function (r) {
    state.staff = r.body.staff || [];
    var g = $('grid');
    g.innerHTML = '';
    state.staff.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'who';
      b.textContent = s.name;          // textContent — không cần esc()
      b.onclick = function () { pick(s); };
      g.appendChild(b);
    });
  }).catch(function () {});
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
  if (state.ownerMode) { return ownerLogin(who, pin); }
  doPunch(who, pin, randNonce(), false);
}

function randNonce() {
  return 'p' + Date.now() + '-' + Math.random().toString(16).slice(2, 8);
}

function doPunch(who, pin, nonce, confirmed) {
  api('/attendance/punch', {
    method: 'POST',
    body: JSON.stringify({ staff_id: who.staff_id, pin: pin, nonce: nonce,
                           confirm_quick_out: confirmed })
  }).then(function (r) {
    if (r.status === 429) { return showResult('Nhập sai nhiều lần. Thử lại sau ' +
                                              (r.body.retry_after || 60) + 's', false); }
    if (r.status !== 200) { return showResult(r.body.error || 'Lỗi', false); }
    if (r.body.action === 'confirm_needed') {
      if (confirm(r.body.message)) { doPunch(who, pin, randNonce(), true); }
      else { reset(); }
      return;
    }
    var row = r.body.row;
    if (r.body.action === 'in') {
      showResult('✅ Vào ca ' + hhmm(row.clock_in_at) + ' · chào ' + row.staff_name, true);
    } else {
      showResult('✅ Ra ca ' + hhmm(row.clock_out_at) + ' · hôm nay ' +
                 dur(row.minutes_worked), true);
    }
    refreshToday();
  }).catch(function () { showResult('Mất kết nối máy quán', false); });
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
  state.picking = null; state.pin = ''; state.ownerMode = false;
  $('result').className = '';
  $('pinpad').classList.remove('on');
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
  api('/attendance/owner_login', {
    method: 'POST',
    body: JSON.stringify({ staff_id: who.staff_id, pin: pin })
  }).then(function (r) {
    if (r.status !== 200) { return showResult(r.body.error || 'Không vào được', false); }
    sessionStorage.setItem('ownerSession', r.body.session_token);
    $('pinpad').classList.remove('on');
    $('owner').classList.add('on');
    loadReport();
    bumpIdle();
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
  if (period === 'week') { s.setDate(now.getDate() - now.getDay() + 1); }
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
      return '<tr class="unclosed"><td>' + esc(u.staff_name) + '</td><td>' + u.date +
             ' vào ' + hhmm(u.clock_in_at) + '</td><td><button class="linkbtn" ' +
             'onclick="fixShift(\'' + u.punch_id + '\')">Nhập giờ ra</button></td></tr>';
    }).join('') || '<tr><td>Không có ca hở</td></tr>';
  });
}

window.fixShift = function (punchId) {
  var t = prompt('Giờ ra thật (HH:MM)');
  if (!t) { return; }
  var note = prompt('Lý do') || '';
  var row = (window._lastUnclosed || {})[punchId];
  var day = (row && row.date) || ymd(new Date());
  api('/attendance/fix', {
    method: 'POST',
    body: JSON.stringify({ punch_id: punchId, note: note,
                           clock_out_at: day + 'T' + t + ':00+07:00' })
  }).then(function (r) {
    if (r.status !== 200) { return alert(r.body.error || 'Không sửa được'); }
    loadReport();
  });
};

function ownerOut(expired) {
  sessionStorage.removeItem('ownerSession');
  $('owner').classList.remove('on');
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
window.addEventListener('online', function () { offline(false); refreshToday(); });
$('cancel').onclick = reset;

buildKeys();
loadStaff();
refreshToday();
