// Minimal in-memory stand-in for the Apps Script services Code.gs uses.
(function (global) {
  class Range {
    constructor(sheet, row, col, rows, cols) { Object.assign(this, { sheet, row, col, rows, cols }); }
    getValues() {
      const out = [];
      for (let r = 0; r < this.rows; r++) {
        const line = [];
        for (let c = 0; c < this.cols; c++) {
          const v = (this.sheet.data[this.row - 1 + r] || [])[this.col - 1 + c];
          line.push(v === undefined ? '' : v);
        }
        out.push(line);
      }
      return out;
    }
    setValues(values) {
      if (this.row + this.rows - 1 > this.sheet.maxRows) throw new Error('Range outside sheet');
      values.forEach((line, r) => line.forEach((v, c) => {
        const rr = this.row - 1 + r;
        while (this.sheet.data.length <= rr) this.sheet.data.push([]);
        const text = this.sheet.textCols.has(this.col + c);
        // Sheets auto-converts date-looking strings unless the column is plain text.
        if (!text && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
          const [y, m, d] = v.split('-').map(Number);
          v = new Date(y, m - 1, d);
        }
        this.sheet.data[rr][this.col - 1 + c] = v;
      }));
      return this;
    }
    setValue(v) { return this.setValues([[v]]); }
    clearContent() { return this.setValues(Array.from({ length: this.rows }, () => Array(this.cols).fill(''))); }
    setNumberFormat(f) { if (f === '@') for (let c = 0; c < this.cols; c++) this.sheet.textCols.add(this.col + c); return this; }
    setFontWeight() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.data = []; this.maxRows = 1000; this.textCols = new Set(); }
    getRange(row, col, rows = 1, cols = 1) { return new Range(this, row, col, rows, cols); }
    getLastRow() {
      for (let r = this.data.length; r > 0; r--) if ((this.data[r - 1] || []).some(v => v !== '' && v !== undefined)) return r;
      return 0;
    }
    getLastColumn() { return Math.max(0, ...this.data.map(r => { let c = r.length; while (c > 0 && (r[c - 1] === '' || r[c - 1] === undefined)) c--; return c; })); }
    getMaxRows() { return this.maxRows; }
    insertRowsAfter(_, n) { this.maxRows += n; }
    deleteRow(r) { this.data.splice(r - 1, 1); }
    appendRow(row) { this.getRange(this.getLastRow() + 1, 1, 1, row.length).setValues([row]); }
    setFrozenRows() {}
  }
  const sheets = {};
  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = new Sheet(n)),
    getSpreadsheetTimeZone: () => 'America/New_York',
  };
  global.DEMO_SECRET = 'demo';
  global.__sheets = sheets;
  global.__Sheet = Sheet;
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ss };
  global.Utilities = {
    getUuid: () => 'id-' + Math.random().toString(36).slice(2, 10),
    formatDate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  };
  const props = {};
  global.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: k => (k === 'SECRET' ? global.DEMO_SECRET : k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: k => { delete props[k]; },
    }),
  };
  global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  global.ContentService = {
    MimeType: { JSON: 'json' },
    createTextOutput: text => ({ text, setMimeType() { return this; } }),
  };
  global.__call = (body) => JSON.parse(global.doPost({ postData: { contents: JSON.stringify(body) } }).text);
})(typeof window !== 'undefined' ? window : globalThis);
