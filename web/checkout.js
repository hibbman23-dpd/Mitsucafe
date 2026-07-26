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
function applyQty(items, index, delta) {
  const out = items.map((it) => cloneItem(it));
  const q = Number(out[index].qty || 1) + delta;
  if (q <= 0) { out.splice(index, 1); return out; }
  out[index].qty = q; return out;
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
const __checkoutApi = { lineSubtotal, cartTotal, applyQty, buildPartitions, isStale, mergeChanges, lateMinutes, isLate, cloneItem };
if (typeof module !== 'undefined' && module.exports) module.exports = __checkoutApi;
if (typeof window !== 'undefined') window.checkout = __checkoutApi;  // browser namespace used by kds.html
