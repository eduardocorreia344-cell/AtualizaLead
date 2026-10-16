// Simula o ambiente do Google Apps Script para testar Code.gs localmente com Node.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class Sheet {
  constructor(name, values) { this.name = name; this.values = values || []; this.protegida = false; }
  getName() { return this.name; }
  getLastRow() { return this.values.length; }
  getDataRange() {
    const largura = Math.max(0, ...this.values.map(r => r.length));
    const vals = this.values.map(r => { const c = r.slice(); while (c.length < largura) c.push(''); return c; });
    return { getValues: () => vals.map(r => r.slice()) };
  }
  appendRow(row) { this.values.push(row.slice()); }
  getRange(a, b, nr, nc) {
    const sheet = this;
    const api = {
      setValues(rows) {
        const r0 = typeof a === 'number' ? a - 1 : 0;
        const c0 = typeof b === 'number' ? b - 1 : 0;
        rows.forEach((row, i) => {
          while (sheet.values.length <= r0 + i) sheet.values.push([]);
          row.forEach((v, j) => { sheet.values[r0 + i][c0 + j] = v; });
        });
        return api;
      },
      setFontWeight() { return api; }, setNumberFormat() { return api; },
    };
    return api;
  }
  setFrozenRows() {} setColumnWidth() {}
  protect() { this.protegida = true; const p = { setDescription: () => p, setWarningOnly: () => p }; return p; }
}

class Spreadsheet {
  constructor(id, sheets) { this.id = id; this.sheets = sheets; }
  getId() { return this.id; }
  getSheets() { return this.sheets; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n, idx) { const s = new Sheet(n, []); if (idx === 0) this.sheets.unshift(s); else this.sheets.push(s); return s; }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
}

function formatDate(d, tz, padrao) {
  const partes = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).forEach(p => { partes[p.type] = p.value; });
  return padrao.replace('yyyy', partes.year).replace('MM', partes.month).replace('dd', partes.day)
    .replace('HH', partes.hour === '24' ? '00' : partes.hour).replace('mm', partes.minute);
}

function criarAmbiente({ planilhas, appSs }) {
  const estado = { usuario: '', efetivo: '', props: {}, emails: [], gatilhos: [], logs: [] };
  const ctx = {
    console,
    SpreadsheetApp: {
      openById: id => { const s = planilhas[id]; if (!s) throw new Error('Sem acesso à planilha ' + id); return s; },
      getActiveSpreadsheet: () => appSs,
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => estado.usuario }),
      getEffectiveUser: () => ({ getEmail: () => estado.efetivo || estado.usuario }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in estado.props ? estado.props[k] : null),
        setProperty: (k, v) => { estado.props[k] = String(v); },
        setProperties: o => Object.keys(o).forEach(k => { estado.props[k] = String(o[k]); }),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    MailApp: { sendEmail: o => estado.emails.push(o) },
    Utilities: { formatDate },
    Logger: { log: m => estado.logs.push(m) },
    ScriptApp: {
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TESTE/exec' }),
      getProjectTriggers: () => estado.gatilhos.slice(),
      deleteTrigger: t => { estado.gatilhos = estado.gatilhos.filter(x => x !== t); },
      newTrigger: fn => {
        const b = { timeBased: () => b, everyMinutes: () => b, create: () => { const t = { getHandlerFunction: () => fn }; estado.gatilhos.push(t); return t; } };
        return b;
      },
    },
    ContentService: {
      MimeType: { CSV: 'text/csv' },
      createTextOutput: s => { const o = { conteudo: s, setMimeType: m => { o.mime = m; return o; }, downloadAsFile: n => { o.arquivo = n; return o; } }; return o; },
    },
    HtmlService: {
      createTemplateFromFile: nome => {
        const t = { evaluate: () => { const o = { html: 'TEMPLATE:' + nome, t, setTitle: () => o, addMetaTag: () => o }; return o; } };
        return t;
      },
      createHtmlOutput: html => { const o = { html, setTitle: () => o, addMetaTag: () => o }; return o; },
    },
  };
  vm.createContext(ctx);
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  vm.runInContext(codigo, ctx, { filename: 'Code.gs' });

  // Cada chamada do Apps Script é uma execução nova: zera a memória por execução.
  const chamar = (fn, ...args) => {
    vm.runInContext('memoConfig_ = null; memoEstado_ = null;', ctx);
    return ctx[fn](...args);
  };
  const interno = expr => vm.runInContext(expr, ctx);
  return { ctx, estado, chamar, interno, Sheet };
}

module.exports = { Sheet, Spreadsheet, criarAmbiente };
