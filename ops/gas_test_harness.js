const fs = require('fs');
const path = require('path');
const vm = require('vm');

function mkRow(o) {
  const r = new Array(29).fill('');
  r[0]  = o.order_id || '';
  r[12] = o.status || 'NEW';
  r[13] = o.confirmed_at || '';
  r[18] = o.delivered_at || '';
  r[19] = o.payment_status || '';
  r[22] = o.label_printed_at || '';
  r[25] = o.customer_name || '';
  r[26] = o.short_code || '';
  r[27] = o.dtype || '';
  r[28] = o.idem || '';
  return r;
}

function loadGas(files, opts) {
  opts = opts || {};
  const props = opts.props || {};
  const rows = opts.ordersRows || [];
  const today = opts.today || '20260722';

  const sandbox = {
    console,
    CacheService: {
      getScriptCache: () => ({
        get: () => null,
        put: () => {},
        removeAll: () => {},
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? String(props[k]) : null),
        setProperty: (k, v) => { props[k] = String(v); },
        deleteProperty: (k) => { delete props[k]; },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() {},
        releaseLock() {},
        tryLock() { return true; },
      }),
    },
    Utilities: {
      formatDate: (d, tz, fmt) => today,
      newBlob: (b) => ({ getBytes: () => b }),
      sleep() {},
    },
    Logger: { log() {} },
    UrlFetchApp: {
      fetch: () => ({ getContentText: () => '{}' }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name) => ({
          getName: () => name,
          getLastRow: () => rows.length + 1,
          getLastColumn: () => 29,
          appendRow: (r) => { rows.push(r); },
          getRange: (row, col, nRows, nCols) => {
            nRows = nRows || 1;
            nCols = nCols || 1;
            return {
              getValue: () => {
                const rIdx = row - 2;
                return (rIdx >= 0 && rIdx < rows.length) ? rows[rIdx][col - 1] : '';
              },
              getValues: () => {
                const out = [];
                for (let i = 0; i < nRows; i++) {
                  const rIdx = (row - 2) + i;
                  const src = (rIdx >= 0 && rIdx < rows.length) ? rows[rIdx] : new Array(29).fill('');
                  out.push(src.slice(col - 1, (col - 1) + nCols));
                }
                return out;
              },
              setValue: (v) => {
                const rIdx = row - 2;
                if (rIdx >= 0 && rIdx < rows.length) {
                  rows[rIdx][col - 1] = v;
                }
              },
              setFontWeight: () => ({ setBackground: () => ({ setFontColor: () => {} }) }),
            };
          },
          getDataRange: () => ({
            getValues: () => {
              const res = [['key', 'value']];
              for (const r of rows) res.push(r);
              return res;
            },
          }),
        }),
      }),
    },
  };

  const ctx = vm.createContext(sandbox);
  for (const f of files) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'gas', f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }

  ctx._rows = rows;
  ctx._props = props;
  return ctx;
}

module.exports = { loadGas, mkRow };
