'use strict';
// Outbox — hàng đợi gửi đơn ngoại tuyến (web/order.js Phase 1).
// Dual-target: browser <script> (window.Outbox) + node:test (module.exports).
// Storage injectable (mặc định localStorage) để test dùng fake object.
//
// Entry: { idempotency_key, payload, created_at (ISO), attempts (int), status: 'pending'|'failed' }
// Persist dưới key lhk_outbox.

const OUTBOX_KEY = 'lhk_outbox';
const EXPIRY_MS = 30 * 60 * 1000; // 30 phút
const RETRY_DELAYS_MS = [2000, 5000, 15000]; // backoff cho lần retry 0,1,2 — retry 3 trở đi = bỏ cuộc

function defaultStorage() {
  return (typeof localStorage !== 'undefined') ? localStorage : null;
}

function readAll(storage) {
  const st = storage || defaultStorage();
  if (!st) return [];
  let raw;
  try { raw = st.getItem(OUTBOX_KEY); } catch (_) { return []; }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    // Storage hỏng (JSON không hợp lệ) — coi như rỗng, không throw ra ngoài.
    return [];
  }
}

function writeAll(list, storage) {
  const st = storage || defaultStorage();
  if (!st) return;
  st.setItem(OUTBOX_KEY, JSON.stringify(list));
}

function list(storage) {
  return readAll(storage);
}

function enqueue(idempotencyKey, payload, storage) {
  const all = readAll(storage);
  const existing = all.find((e) => e.idempotency_key === idempotencyKey);
  if (existing) return existing; // đã có — không duplicate (idempotent theo key)
  const entry = {
    idempotency_key: idempotencyKey,
    payload,
    created_at: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
  };
  all.push(entry);
  writeAll(all, storage);
  return entry;
}

function remove(idempotencyKey, storage) {
  const all = readAll(storage);
  const next = all.filter((e) => e.idempotency_key !== idempotencyKey);
  writeAll(next, storage);
  return next;
}

function update(idempotencyKey, patch, storage) {
  const all = readAll(storage);
  const idx = all.findIndex((e) => e.idempotency_key === idempotencyKey);
  if (idx === -1) return null;
  all[idx] = Object.assign({}, all[idx], patch);
  writeAll(all, storage);
  return all[idx];
}

// Độ trễ trước lần gửi lại kế tiếp theo số lần đã thử (0-index). null = hết lượt, chuyển 'failed'.
function nextDelayMs(attempts) {
  if (attempts == null || attempts < 0) return RETRY_DELAYS_MS[0];
  return attempts < RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[attempts] : null;
}

// Ngày lịch theo Asia/Ho_Chi_Minh — KHÔNG dùng device timezone (bug cũ trong repo).
function hcmDateStr(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
}

// Hết hạn khi: quá 30 phút, HOẶC đã sang ngày lịch khác ở giờ VN (dù chưa đủ 30 phút) —
// một đơn bắn lại lúc sáng hôm sau là "đơn ma": tem đã in, đồ đã pha, không ai tới lấy.
function isExpired(entry, now) {
  const nowDate = now || new Date();
  const created = new Date(entry.created_at);
  const ageMs = nowDate.getTime() - created.getTime();
  if (ageMs > EXPIRY_MS) return true;
  return hcmDateStr(created) !== hcmDateStr(nowDate);
}

// Đánh dấu các entry 'pending' đã hết hạn thành 'failed' — không bao giờ tự gửi ngầm.
// Trả về toàn bộ danh sách sau khi cập nhật.
function expireStale(storage, now) {
  const all = readAll(storage);
  let changed = false;
  const next = all.map((e) => {
    if (e.status === 'pending' && isExpired(e, now)) {
      changed = true;
      return Object.assign({}, e, { status: 'failed' });
    }
    return e;
  });
  if (changed) writeAll(next, storage);
  return next;
}

const __outboxApi = {
  OUTBOX_KEY, EXPIRY_MS,
  enqueue, list, remove, update, nextDelayMs, isExpired, expireStale,
};

if (typeof module !== 'undefined' && module.exports) module.exports = __outboxApi;
if (typeof window !== 'undefined') window.Outbox = __outboxApi;
