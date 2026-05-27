/**
 * Payment.gs — VietQR generation + payment reconciliation.
 *
 * VietQR open API (không cần key):
 *   https://img.vietqr.io/image/{BANK}-{ACCT}-compact2.png
 *     ?amount={TOTAL}&addInfo={ORDER_ID}&accountName={NAME}
 * addInfo = order_id để đối soát tự động khi khách chuyển khoản.
 */

function generateVietQR(orderId, amount) {
  var bank = getConfig('VIETQR_BANK_CODE');     // VCB, TCB, MBB, ...
  var acct = getConfig('VIETQR_ACCOUNT');
  var name = getConfig('VIETQR_ACCT_NAME');
  if (!bank || !acct || !name) {
    logError('generateVietQR', new Error('VietQR config missing'));
    return null;
  }
  return buildVietQRUrl(bank, acct, name, amount, orderId);
}

function buildVietQRUrl(bank, acct, name, amount, content) {
  var params = [
    'amount=' + encodeURIComponent(amount),
    'addInfo=' + encodeURIComponent(content),
    'accountName=' + encodeURIComponent(name),
  ].join('&');
  return 'https://img.vietqr.io/image/' + bank + '-' + acct + '-compact2.png?' + params;
}

/**
 * Phase 3: tự động đối soát bằng cách query Casso/SePay API.
 * MVP: nhân viên cập nhật thủ công cột payment_status thành PAID.
 */
function checkPaymentStatus(orderId) {
  // TODO Phase 3
  return null;
}

// markOrderPaid đã chuyển sang Orders.gs (cần set DELIVERED + trigger print)
// Không define lại ở đây để tránh override.
