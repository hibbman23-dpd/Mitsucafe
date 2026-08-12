'use strict';
function cloneItem(it) {
  const c = Object.assign({}, it);
  if (it && it.modifiers && typeof it.modifiers === 'object') c.modifiers = Object.assign({}, it.modifiers);
  return c;
}
function lineSubtotal(it) {
  return (it.subtotal != null) ? Number(it.subtotal) : Number(it.qty || 1) * Number(it.price || 0);
}
function cartTotal(items) { return (items || []).reduce((s, it) => s + lineSubtotal(it), 0); }
// Đổi qty thì phải kéo `subtotal` theo — compute_total() phía server ưu tiên
// subtotal, để nguyên là bớt ly mà tiền vẫn nguyên. Scale theo tỉ lệ (không
// lấy qty*price) để giữ mọi giảm giá đã áp lên dòng.
function scaleQty(it, oldQty, newQty) {
  it.qty = newQty;
  if (it.subtotal != null && oldQty > 0) {
    it.subtotal = Math.round(Number(it.subtotal) / oldQty * newQty);
  }
  return it;
}
function applyQty(items, index, delta) {
  const out = items.map((it) => cloneItem(it));
  const oldQty = Number(out[index].qty || 1);
  const q = oldQty + delta;
  if (q <= 0) { out.splice(index, 1); return out; }
  scaleQty(out[index], oldQty, q); return out;
}
// Hủy một phần: cancelMap = {chỉ số dòng: số ly hủy}. Dòng hủy hết thì bỏ khỏi
// đơn, hủy một phần thì trừ qty. Trả mảng mới, không đụng mảng gốc.
function applyCancelQty(items, cancelMap) {
  const out = [];
  (items || []).forEach((it, i) => {
    const oldQty = Number(it.qty || 1);
    const drop = Math.min(Math.max(Number((cancelMap || {})[i]) || 0, 0), oldQty);
    const left = oldQty - drop;
    if (left <= 0) return;
    out.push(drop ? scaleQty(cloneItem(it), oldQty, left) : cloneItem(it));
  });
  return out;
}
function buildPartitions(items, assignment) {
  const groups = {};
  items.forEach((it, i) => {
    const g = assignment[i];
    if (g == null) throw new Error('unassigned item at ' + i);
    (groups[g] = groups[g] || []).push(cloneItem(it));
  });
  return Object.keys(groups).sort().map((k) => groups[k]);
}
function isStale(status) { return status === 409; }
function mergeChanges(current, changes) {
  const byId = {}; (current || []).forEach((o) => { byId[o.order_id] = o; });
  (changes || []).forEach((o) => { byId[o.order_id] = o; });
  return Object.keys(byId).map((k) => byId[k]);
}
function lateMinutes(createdAtIso, nowIso) {
  return (new Date(nowIso).getTime() - new Date(createdAtIso).getTime()) / 60000;
}
function isLate(createdAtIso, nowIso, thresholdMin) {
  return lateMinutes(createdAtIso, nowIso) > (thresholdMin == null ? 15 : thresholdMin);
}
const __checkoutApi = { lineSubtotal, cartTotal, applyQty, applyCancelQty, buildPartitions, isStale, mergeChanges, lateMinutes, isLate, cloneItem };
if (typeof module !== 'undefined' && module.exports) module.exports = __checkoutApi;
if (typeof window !== 'undefined') window.checkout = __checkoutApi;  // browser namespace used by kds.html
