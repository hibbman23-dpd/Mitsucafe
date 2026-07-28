'use strict';
// Dual-target: browser <script> and node:test. `fetchImpl` param lets tests stub fetch.
function OrderApi(baseUrl, fetchImpl) {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  async function call(path, method, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await f(baseUrl + path, opts);
    let parsed = {};
    try { parsed = await res.json(); } catch (_) {}
    return { status: res.status, body: parsed };
  }
  return {
    listOrders: () => call('/orders', 'GET'),
    pollChanges: (since) => call('/orders/changes?since=' + encodeURIComponent(since || ''), 'GET'),
    getOrder: (id) => call('/order/' + encodeURIComponent(id), 'GET'),
    patchItems: (id, items, version, managerPin) =>
      call('/order/' + encodeURIComponent(id) + '/items', 'PATCH',
           managerPin ? { items, version, manager_pin: managerPin } : { items, version }),
    patchMeta: (id, meta, version) =>
      call('/order/' + encodeURIComponent(id) + '/meta', 'PATCH', Object.assign({ version }, meta)),
    splitOrder: (id, partitions, version) =>
      call('/order/' + encodeURIComponent(id) + '/split', 'POST', { partitions, version }),
    voidOrder: (id, reason, staff, managerPin) =>
      call('/order/' + encodeURIComponent(id) + '/void', 'POST', { reason, staff, manager_pin: managerPin }),
    mergeBill: (orderIds) => call('/bill/merge', 'POST', { order_ids: orderIds }),
    printBill: (id) => call('/bill/' + encodeURIComponent(id) + '/print', 'POST', {}),
    printGroup: (gid) => call('/bill/group/' + encodeURIComponent(gid) + '/print', 'POST', {}),
    setStatus: (id, status) => call('/order/status', 'POST', { order_id: id, status }),
    markPaid: (id, extra) => call('/order/mark_paid', 'POST', Object.assign({ order_id: id }, extra || {})),
    inbox: () => call('/inbox', 'GET'),
    acceptOnline: (id, payload) => call('/inbox/' + encodeURIComponent(id) + '/accept', 'POST', payload || {}),
    cloudStatus: () => call('/cloud/status', 'GET'),
    health: () => call('/health', 'GET'),
    printCustomLabel: (name, modifiers, qty) => call('/print/custom_label', 'POST', { name, modifiers, qty }),
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { OrderApi };
