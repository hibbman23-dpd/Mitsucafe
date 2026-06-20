const fs = require('fs');
const path = require('path');
const assert = require('assert');
const test = require('node:test');
const vm = require('vm');

// 1. Mock Google Apps Script Globals
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: () => ({
      getLastColumn: () => 10,
      getRange: () => ({
        getValues: () => [['customer_id', 'phone']],
        setValue: () => ({
          setFontWeight: () => ({
            setBackground: () => ({
              setFontColor: () => {}
            })
          })
        })
      })
    })
  })
};
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: () => '1',
    setProperty: () => {},
    deleteProperty: () => {}
  })
};
global.Logger = { log: () => {} };
global.Utilities = {
  formatDate: (date, tz, format) => {
    // Simple mock formatter
    return date.toISOString().slice(0, 10);
  }
};

// 2. Load production Apps Script files into the Node context
function loadScript(fileName) {
  const filePath = path.join(__dirname, '../gas', fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInThisContext(code, { filename: fileName });
}

// Load Utils first (contains getConfig, format, etc.)
loadScript('Utils.gs');
loadScript('Orders.gs');
loadScript('Meta.gs');
loadScript('Admin.gs');
loadScript('RFM.gs');

// 3. Define Unit Tests
test('normalizeCustomerId normalizes VN phone numbers correctly', (t) => {
  // Test cases: [input, expected]
  const cases = [
    ['+84 975 087 429', '0975087429'],
    ['84975087429', '0975087429'],
    ['0975-087-429', '0975087429'],
    ['0975087429', '0975087429'],
    ['975087429', '0975087429'],
    ['', ''],
    [null, '']
  ];

  for (const [input, expected] of cases) {
    const actual = global.normalizeCustomerId(input);
    assert.strictEqual(actual, expected, `Failed for input: ${input}`);
  }
});

test('_sumReactions calculates totals from object and numbers', (t) => {
  assert.strictEqual(global._sumReactions(10), 10);
  assert.strictEqual(global._sumReactions('5'), 5);
  assert.strictEqual(global._sumReactions(null), 0);
  assert.strictEqual(global._sumReactions({ like: 3, love: 2, haha: 1 }), 6);
  assert.strictEqual(global._sumReactions({ like: '3', wow: null }), 3);
});

test('_adminCoerce converts types according to schema definitions', (t) => {
  // Numbers
  assert.strictEqual(global._adminCoerce('price_m', '15000'), 15000);
  assert.strictEqual(global._adminCoerce('current_stock', '4.5'), 4.5);
  // Booleans
  assert.strictEqual(global._adminCoerce('available', 'true'), true);
  assert.strictEqual(global._adminCoerce('available', 'TRUE'), true);
  assert.strictEqual(global._adminCoerce('available', 1), true);
  assert.strictEqual(global._adminCoerce('available', '0'), false);
  // Normal string
  assert.strictEqual(global._adminCoerce('name', 'Matcha Latte'), 'Matcha Latte');
});
