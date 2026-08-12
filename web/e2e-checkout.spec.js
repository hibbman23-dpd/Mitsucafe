// e2e-checkout.spec.js — run with: node --test web/e2e-checkout.spec.js
//
// Playwright-based smoke test for the iPOS-style checkout flow. It is SKIPPED when
// Playwright is not installed (it is not installed in this repo's environment). In
// that case, verification is done manually via the browser preview against a test
// backend on a non-production port — that manual pass has been performed and covers:
//   - kds.html reads orders from the local server (GET /orders + /orders/changes cursor)
//   - checkout opens (table-scoped / order-scoped); editing a line qty fires
//     PATCH /order/<id>/items, the server recomputes the total, and board + sheet update
//   - "In bill + Thu tiền" settles EVERY order in the table/bill-group with a single
//     bill print (verified: 1 print + N×mark_paid + N×status → all DELIVERED/paid)
//   - online-inbox badge + "ĐƠN TRỄ X PHÚT" late flag + cloud/printer status badges render
//
// To run the automated version: `npm i -D playwright && npx playwright install chromium`,
// start a test backend (PRINT_ENGINE=noop on a spare port) serving kds.html, then run this file.
'use strict';
const test = require('node:test');
const assert = require('node:assert');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (_) { chromium = null; }

const BASE = process.env.KDS_E2E_URL || 'http://localhost:5002/kds.html';

test('checkout: editing a line qty updates the order total', { skip: !chromium }, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(BASE);
    await page.waitForFunction(() => typeof window.allOrders !== 'undefined' && window.allOrders.length > 0, { timeout: 5000 });
    // Open checkout for the first order's table, decrement the first line, assert the
    // server-recomputed total dropped. Selectors follow kds.html's checkout sheet.
    const before = await page.evaluate(() => {
      const o = window.allOrders[0];
      window.openCheckout(o.order_id);
      return o.total;
    });
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('#checkout-overlay button')].find(b => b.textContent.trim() === '−');
      btn && btn.click();
    });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => {
      const oid = window.checkoutState && window.checkoutState.orderId;
      return window.allOrders.find(x => x.order_id === oid).total;
    });
    assert.ok(after < before, `total should drop after decrement (${after} < ${before})`);
  } finally {
    await browser.close();
  }
});
