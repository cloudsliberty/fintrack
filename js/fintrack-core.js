// FinTrack — Central Data Store
const DB_KEY = 'fintrack_v1';

// ── CSP-safe delegated event handling ──
// All HTML injected via innerHTML uses data-action / data-change / data-input / data-blur
// attributes instead of inline onclick/onchange handlers, so the app works under
// Nextcloud 32's strict CSP (no 'unsafe-inline' and no 'unsafe-eval').
//
// Action expressions have the form:  fnName(arg1, arg2)
// Multiple calls may be chained with semicolons: fn1();fn2(arg)
//
// Supported argument literals:
//   'string'  "string"  — string literals
//   null                — null
//   el.value            — the value property of the triggering element
//   el                  — the triggering element itself
//
// All callable functions must be exposed on window (which they already are,
// either as top-level declarations or explicit window.* assignments).
(function installDelegatedHandlers() {

  // Parse a single call expression like  fnName('id', el.value)
  // Returns { name, args } or null on parse failure.
  function parseCall(expr, el) {
    expr = expr.trim();
    var parenOpen = expr.indexOf('(');
    if (parenOpen === -1) return null;
    var name = expr.slice(0, parenOpen).trim();
    var argsStr = expr.slice(parenOpen + 1, expr.lastIndexOf(')')).trim();

    var args = [];
    if (argsStr.length > 0) {
      // Tokenise: split on commas that are not inside quotes.
      var tokens = [];
      var cur = '';
      var inQ = false, qChar = '';
      for (var i = 0; i < argsStr.length; i++) {
        var ch = argsStr[i];
        if (inQ) {
          cur += ch;
          if (ch === qChar) inQ = false;
        } else if (ch === "'" || ch === '"') {
          inQ = true; qChar = ch; cur += ch;
        } else if (ch === ',') {
          tokens.push(cur.trim()); cur = '';
        } else {
          cur += ch;
        }
      }
      if (cur.trim()) tokens.push(cur.trim());

      for (var t = 0; t < tokens.length; t++) {
        var tok = tokens[t];
        if (tok === 'null' || tok === 'undefined') {
          args.push(null);
        } else if (tok === 'el.value') {
          args.push(el ? el.value : undefined);
        } else if (tok === 'el.checked') {
          // Was missing: the literal string 'el.checked' (always truthy) was
          // passed instead, so unticking a checkbox still acted as "on".
          args.push(el ? !!el.checked : undefined);
        } else if (tok === 'el') {
          args.push(el);
        } else if ((tok[0] === "'" && tok[tok.length-1] === "'") ||
                   (tok[0] === '"' && tok[tok.length-1] === '"')) {
          args.push(tok.slice(1, -1));
        } else if (tok === 'true') {
          args.push(true);
        } else if (tok === 'false') {
          args.push(false);
        } else if (!isNaN(tok)) {
          args.push(Number(tok));
        } else {
          // Unknown token — pass as string (shouldn't happen with current actions)
          args.push(tok);
        }
      }
    }
    return { name: name, args: args };
  }

  // Execute one or more semicolon-separated call expressions.
  function invokeExpr(expr, el) {
    // Split on ';' that are not inside parens or quotes.
    var calls = [];
    var cur = '', depth = 0, inQ = false, qChar = '';
    for (var i = 0; i < expr.length; i++) {
      var ch = expr[i];
      if (inQ) {
        cur += ch;
        if (ch === qChar) inQ = false;
      } else if (ch === "'" || ch === '"') {
        inQ = true; qChar = ch; cur += ch;
      } else if (ch === '(') {
        depth++; cur += ch;
      } else if (ch === ')') {
        depth--; cur += ch;
      } else if (ch === ';' && depth === 0) {
        if (cur.trim()) calls.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) calls.push(cur.trim());

    for (var c = 0; c < calls.length; c++) {
      var parsed = parseCall(calls[c], el);
      if (!parsed) { console.error('FT: unparseable action:', calls[c]); continue; }
      var fn = window[parsed.name];
      if (typeof fn !== 'function') { console.error('FT: unknown action fn:', parsed.name); continue; }
      try { fn.apply(window, parsed.args); } catch (err) { console.error('FT: action error in', parsed.name, err); }
    }
  }

  function dispatch(attrName, e) {
    let el = e.target;
    while (el && el !== document.body) {
      if (el.classList.contains('ft-stop-propagation') && attrName === 'data-action') {
        const expr = el.getAttribute(attrName);
        if (!expr) { e.stopPropagation(); return; }
      }
      const expr = el.getAttribute(attrName);
      if (expr) {
        e.stopPropagation();
        invokeExpr(expr, el);
        return;
      }
      el = el.parentElement;
    }
  }

  document.addEventListener('click',  function(e) { dispatch('data-action', e); });
  document.addEventListener('change', function(e) { dispatch('data-change', e); });
  document.addEventListener('input',  function(e) { dispatch('data-input',  e); });
  document.addEventListener('blur',   function(e) { dispatch('data-blur',   e); }, true);

  // Fuzzy-search comboboxes (accounts/categories/tags): selecting an option
  // is a click on a plain, non-focusable div, which blurs the search input
  // first (mousedown moves focus away before the click event even fires).
  // That blur schedules the dropdown to hide via a 150ms timer as a safety
  // net for "click elsewhere to dismiss" — but it raced against the actual
  // option click, and under any hiccup (slow paint, a form with two
  // comboboxes like the Transfer form's From/To) the dropdown could vanish
  // before the click on the option registered, silently dropping the
  // selection. Preventing default on mousedown keeps focus on the search
  // input so no blur — and no race — happens at all; the click still fires
  // and chooseComboboxOption() still runs normally.
  document.addEventListener('mousedown', function (e) {
    if (e.target && e.target.closest && e.target.closest('.ft-combo-option')) {
      e.preventDefault();
    }
  });
})();


const DEFAULT_DATA = {
  currencies: [
    { code: 'USD', name: 'US Dollar', symbol: '$', rate: 1 },
    { code: 'EUR', name: 'Euro', symbol: '€', rate: 0.92 },
    { code: 'GBP', name: 'British Pound', symbol: '£', rate: 0.79 },
    { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', rate: 3.75 },
    { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', rate: 3.67 },
  ],
  baseCurrency: 'USD',
  accounts: [
    { id: 'a1', name: 'Main Checking', type: 'asset', currency: 'USD', description: 'Primary bank account', color: '#4f8ef7', icon: '🏦', active: true, created: new Date().toISOString() },
    { id: 'a2', name: 'Savings', type: 'asset', currency: 'USD', description: 'Emergency fund', color: '#2ecc8a', icon: '💰', active: true, created: new Date().toISOString() },
    { id: 'a3', name: 'Groceries', type: 'expense', currency: 'USD', description: 'Weekly grocery spending', color: '#f05151', icon: '🛒', active: true, created: new Date().toISOString() },
    { id: 'a4', name: 'Utilities', type: 'expense', currency: 'USD', description: 'Monthly utilities', color: '#f0c040', icon: '⚡', active: true, created: new Date().toISOString() },
    { id: 'a5', name: 'Salary', type: 'revenue', currency: 'USD', description: 'Monthly salary', color: '#2ecc8a', icon: '💼', active: true, created: new Date().toISOString() },
    { id: 'a6', name: 'Credit Card', type: 'liability', currency: 'USD', description: 'Visa credit card', color: '#f0c040', icon: '💳', active: true, created: new Date().toISOString() },
  ],
  transactions: [
    { id: 't1', type: 'income', accountId: 'a1', amount: 5000, currency: 'USD', category: 'Salary', tags: ['monthly'], description: 'Monthly salary', date: new Date(Date.now() - 86400000 * 5).toISOString(), linkedAccountId: 'a5', created: new Date().toISOString() },
    { id: 't2', type: 'expense', accountId: 'a1', amount: 120, currency: 'USD', category: 'Groceries', tags: ['food', 'weekly'], description: 'Supermarket run', date: new Date(Date.now() - 86400000 * 3).toISOString(), linkedAccountId: 'a3', created: new Date().toISOString() },
    { id: 't3', type: 'expense', accountId: 'a1', amount: 85, currency: 'USD', category: 'Utilities', tags: ['bills'], description: 'Electricity bill', date: new Date(Date.now() - 86400000 * 2).toISOString(), linkedAccountId: 'a4', created: new Date().toISOString() },
    { id: 't4', type: 'income', accountId: 'a2', amount: 500, currency: 'USD', category: 'Transfer', tags: [], description: 'Transfer to savings', date: new Date(Date.now() - 86400000 * 1).toISOString(), linkedAccountId: null, created: new Date().toISOString() },
  ],
  transfers: [
    { id: 'tr1', fromAccountId: 'a1', toAccountId: 'a2', fromAmount: 500, toAmount: 500, fromCurrency: 'USD', toCurrency: 'USD', conversionRate: 1, description: 'Transfer to savings', date: new Date(Date.now() - 86400000).toISOString(), created: new Date().toISOString() },
  ],
  budgets: [
    { id: 'b1', name: 'Monthly Groceries', limit: 600, currency: 'USD', period: 'monthly', category: 'Groceries', accountIds: ['a3'], active: true, startDate: new Date().toISOString(), created: new Date().toISOString() },
    { id: 'b2', name: 'Utilities Budget', limit: 200, currency: 'USD', period: 'monthly', category: 'Utilities', accountIds: ['a4'], active: true, startDate: new Date().toISOString(), created: new Date().toISOString() },
  ],
  categories: [
    { id: 'c1', name: 'Salary', type: 'income', color: '#2ecc8a', icon: '💼' },
    { id: 'c2', name: 'Freelance', type: 'income', color: '#4f8ef7', icon: '💻' },
    { id: 'c3', name: 'Investment', type: 'income', color: '#9b6cf0', icon: '📈' },
    { id: 'c4', name: 'Groceries', type: 'expense', color: '#f05151', icon: '🛒' },
    { id: 'c5', name: 'Utilities', type: 'expense', color: '#f0c040', icon: '⚡' },
    { id: 'c6', name: 'Transport', type: 'expense', color: '#4f8ef7', icon: '🚗' },
    { id: 'c7', name: 'Dining', type: 'expense', color: '#f0c040', icon: '🍽️' },
    { id: 'c8', name: 'Health', type: 'expense', color: '#2ecc8a', icon: '🏥' },
    { id: 'c9', name: 'Entertainment', type: 'expense', color: '#9b6cf0', icon: '🎬' },
    { id: 'c10', name: 'Transfer', type: 'transfer', color: '#9aa3b8', icon: '↔️' },
  ],
  tags: ['monthly', 'food', 'weekly', 'bills', 'personal', 'work', 'annual', 'recurring'],
  apiKey: generateId('key'),
};

function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Picks a random pastel/light color (fixed saturation+lightness, random hue)
// for a brand-new account's default color swatch, instead of always the same
// blue — makes it easier to tell accounts apart at a glance in lists/charts
// before the user ever bothers picking a custom color.
function randomLightColor() {
  const hue = Math.floor(Math.random() * 360);
  return hslToHex(hue, 65, 70);
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = x => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// ── State ──
// In Nextcloud mode fintrack-main.js registers window.getState before this file
// runs (script load order: fintrack-main first, fintrack-core second).
// We never cache the state reference at module level — we always call
// window.getState() so that async updates from fintrack-main.js are reflected.
// Fallback: standalone / dev mode initialises from DEFAULT_DATA.
let _standaloneState = null;

function getState() {
  // In Nextcloud mode, fintrack-main.js registers window._ftGetState (not window.getState)
  // to avoid the infinite recursion that occurs when this function checks window.getState
  // and window.getState IS this function (standalone fallback path).
  if (typeof window._ftGetState === 'function') {
    return window._ftGetState();
  }
  // Standalone fallback
  if (!_standaloneState) {
    _standaloneState = JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
  return _standaloneState;
}

function loadState() {
  // Kept for compatibility; getState() is the canonical accessor now.
  return getState();
}

function saveState() {
  // In Nextcloud mode mutations go via the REST API (fintrack-main.js).
  // Use _ftSaveState (not window.saveState) to avoid calling ourselves
  // since this function is also exposed as window.saveState at global scope.
  if (typeof window._ftSaveState === 'function') window._ftSaveState();
}

// Expose getState globally so fintrack-main.js helpers can call it if needed.
// Note: do NOT assign window.getState = getState here — that would cause
// infinite recursion since getState() checks window._ftGetState, not window.getState.
if (typeof window.getState !== 'function') {
  window.getState = getState;
}

// ── Currency helpers ──
function getRate(fromCode, toCode) {
  if (fromCode === toCode) return 1;
  const s = getState();
  if (!s || !s.currencies) return 1;
  const from = s.currencies.find(c => c.code === fromCode);
  const to = s.currencies.find(c => c.code === toCode);
  if (!from || !to) return 1;
  // All rates are relative to baseCurrency (USD by default = rate 1)
  // from→USD: 1/from.rate; USD→to: to.rate
  return to.rate / from.rate;
}

function convertAmount(amount, fromCode, toCode) {
  return amount * getRate(fromCode, toCode);
}

// Convert a transaction's amount into the base currency for totals/reports.
//
// Transactions in a foreign currency store a snapshot of the conversion rate
// that applied when they were entered (tx.conversionRate). We must use that
// snapshot instead of the live currency table — otherwise editing a currency's
// rate today would silently re-price every past transaction in that currency.
// Only fall back to the live rate for older transactions that predate this
// feature and never got a rate recorded.
function transactionAmountInBase(t) {
  const s = getState();
  const base = s ? s.baseCurrency : 'USD';
  const amount = parseFloat(t.amount) || 0;
  if (!t.currency || t.currency === base) return amount;
  if (t.conversionRate) return amount * parseFloat(t.conversionRate);
  return convertAmount(amount, t.currency, base);
}

function formatCurrency(amount, currencyCode) {
  const s = getState();
  const cur = (s && s.currencies) ? s.currencies.find(c => c.code === currencyCode) : null;
  const symbol = cur ? cur.symbol : (currencyCode || '');
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}

// Formats a date according to Settings > Date Format (MM/DD/YYYY, DD/MM/YYYY,
// or YYYY-MM-DD). Previously every date in the app used the browser's
// locale via toLocaleDateString(), which ignored this setting entirely —
// this is the single place all transaction/transfer/recurring date display
// should go through instead.
function formatDate(input) {
  if (!input && input !== 0) return '';
  const d = (input instanceof Date) ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  const s = getState();
  const fmt = s?.settings?.date_format || 'MM/DD/YYYY';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  if (fmt === 'DD/MM/YYYY') return `${dd}/${mm}/${yyyy}`;
  if (fmt === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`;
  return `${mm}/${dd}/${yyyy}`;
}

// ── Account helpers ──
function getAccountBalance(accountId) {
  const s = getState();
  if (!s) return 0;
  const acc = s.accounts.find(a => a.id == accountId);
  if (!acc) return 0;

  let balance = 0;
  (s.transactions || []).forEach(t => {
    if (t.accountId != accountId) return;
    if (t.type === 'income') balance += parseFloat(t.amount);
    else if (t.type === 'expense') balance -= parseFloat(t.amount);
  });

  // Transfers
  (s.transfers || []).forEach(tr => {
    if (tr.fromAccountId == accountId) balance -= parseFloat(tr.fromAmount);
    if (tr.toAccountId == accountId) balance += parseFloat(tr.toAmount);
  });

  return balance;
}

function getAccountIncome(accountId) {
  const s = getState();
  if (!s || !s.transactions) return 0;
  return s.transactions
    .filter(t => t.accountId == accountId && t.type == 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
}

function getAccountExpense(accountId) {
  const s = getState();
  if (!s || !s.transactions) return 0;
  return s.transactions
    .filter(t => t.accountId == accountId && t.type == 'expense')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
}

// ── Base-currency account totals ──
//
// getAccountBalance/Income/Expense above sum native-currency amounts, which
// is correct for the big number on an account's own card. But converting
// that native SUM with today's live currency rate (convertAmount) is wrong
// for any account whose currency isn't the base currency: each transaction
// may have been entered (or CSV-imported) with its own historical
// conversionRate snapshot — exactly so a later rate change doesn't re-price
// old transactions — and converting the aggregate with the current rate
// throws that away, silently re-pricing everything at today's rate instead.
// These variants sum each transaction through transactionAmountInBase()
// (which honors the per-transaction snapshot, falling back to the live
// rate only when a transaction never got one), and should be used
// wherever a total is displayed in the base currency.
function getAccountBalanceInBase(accountId) {
  const s = getState();
  if (!s) return 0;
  const acc = s.accounts.find(a => a.id == accountId);
  if (!acc) return 0;
  const base = s.baseCurrency;

  let balance = 0;
  (s.transactions || []).forEach(t => {
    if (t.accountId != accountId) return;
    const amt = transactionAmountInBase(t);
    if (t.type === 'income') balance += amt;
    else if (t.type === 'expense') balance -= amt;
  });

  // Transfers don't carry a to-base snapshot (their conversionRate is
  // fromCurrency→toCurrency, not →base), so these still use the live rate —
  // there's no historical rate to preserve here.
  (s.transfers || []).forEach(tr => {
    if (tr.fromAccountId == accountId) balance -= convertAmount(parseFloat(tr.fromAmount), tr.fromCurrency, base);
    if (tr.toAccountId == accountId) balance += convertAmount(parseFloat(tr.toAmount), tr.toCurrency, base);
  });

  return balance;
}

function getAccountIncomeInBase(accountId) {
  const s = getState();
  if (!s || !s.transactions) return 0;
  return s.transactions
    .filter(t => t.accountId == accountId && t.type == 'income')
    .reduce((sum, t) => sum + transactionAmountInBase(t), 0);
}

function getAccountExpenseInBase(accountId) {
  const s = getState();
  if (!s || !s.transactions) return 0;
  return s.transactions
    .filter(t => t.accountId == accountId && t.type == 'expense')
    .reduce((sum, t) => sum + transactionAmountInBase(t), 0);
}

function getTotalByType(type) {
  const s = getState();
  if (!s || !s.accounts) return 0;
  const accounts = s.accounts.filter(a => a.type === type);
  let total = 0;
  accounts.forEach(acc => {
    total += getAccountBalanceInBase(acc.id);
  });
  return total;
}

function getCategorySpend(categoryName, period) {
  const s = getState();
  if (!s || !s.transactions) return 0;
  const now = new Date();
  let startDate;
  if (period === 'monthly') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'weekly') {
    const d = now.getDay();
    startDate = new Date(now); startDate.setDate(now.getDate() - d);
  } else if (period === 'yearly') {
    startDate = new Date(now.getFullYear(), 0, 1);
  } else {
    startDate = new Date(0);
  }

  return s.transactions
    .filter(t => t.type === 'expense' && t.category === categoryName && new Date(t.date) >= startDate)
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
}

// FinTrack — Currencies Module

function renderCurrenciesPage() {
  const s = getState();
  const page = document.getElementById('page-currencies');

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Currencies</div>
        <div class="page-subtitle">Define currencies and set conversion rates relative to your base currency</div>
      </div>
      <button class="btn btn-primary" data-action="showAddCurrencyModal()">
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        Add Currency
      </button>
    </div>

    <div class="content">
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <div class="card-title">Base Currency</div>
        </div>
        <div class="card-body">
          <p style="color:var(--text-2);font-size:13px;margin-bottom:12px">All balances will be converted to and displayed in the base currency for totals.</p>
          <div class="form-grid cols-3">
            <div class="form-group">
              <label>Base Currency</label>
              <select id="base-currency-select" data-change="setBaseCurrency(el.value)">
                ${s.currencies.map(c => `<option value="${c.code}" ${c.code === s.baseCurrency ? 'selected' : ''}>${c.code} — ${escHtml(c.name)}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Currency Rates</div>
          <span style="font-size:12px;color:var(--text-3)">Rates relative to ${s.baseCurrency} (1 ${s.baseCurrency} = X currency)</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Symbol</th>
                <th>Rate (per ${s.baseCurrency})</th>
                <th>1 ${s.baseCurrency} =</th>
                <th>Rate API</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${s.currencies.map(c => `
                <tr>
                  <td><span class="chip accent">${c.code}</span></td>
                  <td>${escHtml(c.name)}</td>
                  <td class="td-mono">${c.symbol}</td>
                  <td>
                    ${c.code === s.baseCurrency
                      ? '<span class="td-muted">Base (1.00)</span>'
                      : `<div style="display:flex;gap:6px;align-items:center">
                           <input id="curr-rate-${c.code}" type="number" step="0.0001" value="${c.rate}" style="max-width:110px"
                             data-change="updateCurrencyRate('${c.code}', el.value)"
                             data-blur="updateCurrencyRate('${c.code}', el.value)">
                           <button type="button" class="btn btn-secondary btn-sm" title="Fetch the current rate online"
                             data-action="fetchOnlineRate('${s.baseCurrency}','${c.code}','curr-rate-${c.code}',el,'updateCurrencyRate')">⟳</button>
                         </div>`
                    }
                  </td>
                  <td class="td-mono">${c.symbol}${c.rate.toFixed(4)}</td>
                  <td>
                    ${c.code === s.baseCurrency ? '<span class="td-muted">—</span>' : `
                      <select id="curr-api-${c.code}" style="max-width:150px" title="Which live-rate provider to use for ${c.code}"
                        data-change="setCurrencyApiPref('${c.code}', el.value)">
                        <option value="auto" ${(s.settings?.['fx_api_pref_' + c.code] || 'auto') === 'auto' ? 'selected' : ''}>Automatic</option>
                        <option value="frankfurter" ${s.settings?.['fx_api_pref_' + c.code] === 'frankfurter' ? 'selected' : ''}>frankfurter.dev</option>
                        <option value="exchangerate_host" ${s.settings?.['fx_api_pref_' + c.code] === 'exchangerate_host' ? 'selected' : ''}>exchangerate.host</option>
                      </select>
                    `}
                  </td>
                  <td>
                    ${c.code !== s.baseCurrency ? `
                      <button class="btn btn-danger btn-sm" data-action="deleteCurrency('${c.code}')">Remove</button>
                    ` : '<span class="chip">Base</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-header"><div class="card-title">Conversion Calculator</div></div>
        <div class="card-body">
          <div class="form-grid cols-3">
            <div class="form-group">
              <label>Amount</label>
              <input type="number" id="calc-amount" value="1" min="0" step="any" data-input="updateCalc()">
            </div>
            <div class="form-group">
              <label>From</label>
              <select id="calc-from" data-change="updateCalc()">
                ${s.currencies.map(c => `<option value="${c.code}">${c.code}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>To</label>
              <select id="calc-to" data-change="updateCalc()">
                ${s.currencies.map(c => `<option value="${c.code}" ${c.code !== s.baseCurrency ? 'selected' : ''}>${c.code}</option>`).join('')}
              </select>
            </div>
          </div>
          <div id="calc-result" class="conversion-info" style="margin-top:14px"></div>
          <p style="font-size:11.5px;color:var(--text-3);margin-top:10px">
            Rates shown here come from whatever is stored on the Currency Rates table above. Use "Fetch online" on a
            rate row to pull the latest rate before calculating.
          </p>
        </div>
      </div>

      <p style="font-size:11.5px;color:var(--text-3);margin-top:16px;text-align:center">
        Live currency conversion rates are fetched using
        <a href="https://frankfurter.dev" target="_blank" rel="noopener noreferrer">frankfurter.dev</a> and
        <a href="https://exchangerate.host" target="_blank" rel="noopener noreferrer">exchangerate.host</a>.
        frankfurter.dev is free and unlimited; exchangerate.host allows only 100 requests/month on its free plan —
        if you need more lookups, please purchase a paid plan from exchangerate.host.
      </p>
    </div>
  `;

  updateCalc();
}

function updateCalc() {
  const amountInput = document.getElementById('calc-amount');
  const amount = amountInput ? (parseFloat(amountInput.value) || 0) : 1;
  const from = document.getElementById('calc-from')?.value;
  const to = document.getElementById('calc-to')?.value;
  if (!from || !to) return;
  const result = convertAmount(amount, from, to);
  const s = getState();
  const fromCur = s.currencies.find(c => c.code === from);
  const toCur = s.currencies.find(c => c.code === to);
  document.getElementById('calc-result').innerHTML =
    `${fromCur.symbol}${amount.toLocaleString()} ${from} = <strong>${toCur.symbol}${result.toFixed(4)} ${to}</strong>
     &nbsp;·&nbsp; Rate: 1 ${from} = ${getRate(from, to).toFixed(6)} ${to}`;
}

function setBaseCurrency(code) {
  if (typeof window._ftSetBaseCurrency === 'function') { window._ftSetBaseCurrency(code); return; }
  const state = getState();
  state.baseCurrency = code;
  saveState();
  showToast('Base currency updated', 'success');
  renderCurrenciesPage();
}

function setCurrencyApiPref(code, pref) {
  if (typeof window._ftSetCurrencyApiPref === 'function') { window._ftSetCurrencyApiPref(code, pref); return; }
  const state = getState();
  if (!state.settings) state.settings = {};
  state.settings['fx_api_pref_' + code] = pref;
  saveState();
}

// Mandatory PIN Policy: PWA can't be enabled without a PIN Lock already set.
function togglePwaEnabled(checked) {
  if (typeof window._ftTogglePwaEnabled === 'function') { window._ftTogglePwaEnabled(checked); return; }
  const state = getState();
  const checkbox = document.getElementById('pwa-enabled-toggle');
  if (checked && !(state.lock && state.lock.enabled)) {
    if (checkbox) checkbox.checked = false;
    showToast('Set a PIN below first — the PWA requires a PIN Lock.', 'error');
    return;
  }
  if (!state.settings) state.settings = {};
  state.settings.pwa_enabled = checked ? '1' : '0';
  saveState();
}

function setPwaRetentionDays(value) {
  if (typeof window._ftSetPwaRetentionDays === 'function') { window._ftSetPwaRetentionDays(value); return; }
  const state = getState();
  const days = Math.max(1, Math.min(365, parseInt(value, 10) || 30));
  if (!state.settings) state.settings = {};
  state.settings.pwa_data_retention_days = String(days);
  saveState();
}

function updateCurrencyRate(code, value) {
  if (typeof window._ftUpdateCurrencyRate === 'function') { window._ftUpdateCurrencyRate(code, value); return; }
  const state = getState();
  const rate = parseFloat(value);
  if (isNaN(rate) || rate <= 0) return;
  const cur = state.currencies.find(c => c.code === code);
  if (cur) { cur.rate = rate; saveState(); }
  updateCalc();
}

function deleteCurrency(code) {
  if (typeof window._ftDeleteCurrency === 'function') { window._ftDeleteCurrency(code); return; }
  const state = getState();
  const inUse = state.accounts.some(a => a.currency === code) ||
                state.transactions.some(t => t.currency === code);
  if (inUse) { showToast('This currency is used by an account or transaction and can\'t be removed.', 'error'); return; }
  state.currencies = state.currencies.filter(c => c.code !== code);
  saveState();
  showToast('Currency removed', 'success');
  renderCurrenciesPage();
}

function showAddCurrencyModal() {
  openModal('💱 Add Currency', `
    <div class="form-grid cols-1">
      <div class="form-grid">
        <div class="form-group">
          <label>Currency Code *</label>
          <input id="cur-code" placeholder="e.g. JPY" maxlength="3" style="text-transform:uppercase">
        </div>
        <div class="form-group">
          <label>Symbol *</label>
          <input id="cur-symbol" placeholder="e.g. ¥">
        </div>
        <div class="form-group full">
          <label>Name *</label>
          <input id="cur-name" placeholder="e.g. Japanese Yen">
        </div>
        <div class="form-group">
          <label>Rate (1 ${getState().baseCurrency} = X) *</label>
          <input id="cur-rate" type="number" step="0.0001" placeholder="e.g. 150.0">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-action="closeModal()">Cancel</button>
        <button class="btn btn-primary" data-action="saveCurrency()">Add Currency</button>
      </div>
    </div>
  `);
}

function saveCurrency() {
  // In Nextcloud mode, delegate to the API-backed version registered by fintrack-main.js.
  if (typeof window._ftSaveCurrency === 'function') { window._ftSaveCurrency(); return; }

  // Standalone fallback (no Nextcloud API available).
  const state = getState();
  const code = document.getElementById('cur-code').value.trim().toUpperCase();
  const name = document.getElementById('cur-name').value.trim();
  const symbol = document.getElementById('cur-symbol').value.trim();
  const rate = parseFloat(document.getElementById('cur-rate').value);

  if (!code || !name || !symbol || isNaN(rate)) { showToast('Please fill all fields', 'error'); return; }
  if (state.currencies.find(c => c.code === code)) { showToast('Currency code already exists', 'error'); return; }

  state.currencies.push({ code, name, symbol, rate });
  saveState();
  showToast('Currency added', 'success');
  closeModal();
  renderCurrenciesPage();
}
// FinTrack — Accounts Module

const ACCOUNT_TYPES = {
  asset: { label: 'Asset', color: 'accent', desc: 'Bank accounts, cash, investments' },
  expense: { label: 'Expense', color: 'red', desc: 'Spending categories' },
  revenue: { label: 'Revenue', color: 'green', desc: 'Income sources' },
  liability: { label: 'Liability', color: 'yellow', desc: 'Loans, credit cards, debts' },
};

// Per-type UI state for the Accounts pages (compact toggle + section
// expand/collapse). This is a pure display preference, not app data, so it's
// stored in the browser's own localStorage (not synced via the API) — it
// persists across reloads but is local to this browser/device.
const FT_ACCOUNTS_VIEW_KEY = 'fintrack_accounts_view_v1';
window._ftAccountsView = window._ftAccountsView || (function loadAccountsViewFromStorage() {
  try {
    const raw = localStorage.getItem(FT_ACCOUNTS_VIEW_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
})();
function persistAccountsView() {
  try { localStorage.setItem(FT_ACCOUNTS_VIEW_KEY, JSON.stringify(window._ftAccountsView)); } catch (e) { /* storage unavailable — view just won't persist */ }
}
function getAccountsViewState(type) {
  if (!window._ftAccountsView[type]) {
    window._ftAccountsView[type] = { compact: false, expandActive: true, expandInactive: false };
  }
  return window._ftAccountsView[type];
}
function toggleAccountsCompact(type) {
  const v = getAccountsViewState(type);
  v.compact = !v.compact;
  persistAccountsView();
  renderAccountsPage(type);
}
function toggleAccountsSection(type, section) {
  const v = getAccountsViewState(type);
  const key = 'expand' + section;
  v[key] = !v[key];
  persistAccountsView();
  renderAccountsPage(type);
}

// Generic collapsible-card helper — used by Settings sections, Reports
// cards, and Dashboard tiles so they can expand/collapse the same way the
// Active/Inactive sections do on the Accounts pages. Unlike the accounts
// sections (which re-render their whole page on toggle), this toggles the
// body's visibility directly in the DOM, so it doesn't need to know how to
// re-render whatever page called it.
const FT_COLLAPSE_KEY = 'fintrack_collapse_v1';
window._ftCollapseState = window._ftCollapseState || (function loadCollapseFromStorage() {
  try {
    const raw = localStorage.getItem(FT_COLLAPSE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
})();
function persistCollapseState() {
  try { localStorage.setItem(FT_COLLAPSE_KEY, JSON.stringify(window._ftCollapseState)); } catch (e) { /* storage unavailable — state just won't persist */ }
}
function isCollapsibleExpanded(id, defaultExpanded) {
  if (!(id in window._ftCollapseState)) return defaultExpanded !== false;
  return !!window._ftCollapseState[id];
}
function toggleCollapsibleSection(id) {
  const expanded = isCollapsibleExpanded(id, true);
  window._ftCollapseState[id] = !expanded;
  persistCollapseState();
  const body = document.getElementById('collapse-body-' + id);
  const chevron = document.getElementById('collapse-chevron-' + id);
  if (body) body.style.display = expanded ? 'none' : '';
  if (chevron) chevron.classList.toggle('expanded', !expanded);
}
// Returns the opening markup for a collapsible card header: the chevron +
// title, wired up to toggle section `id`. Caller is responsible for closing
// the header div and wrapping the body in `<div id="collapse-body-ID">`.
function collapsibleHeaderStart(id, titleHtml, defaultExpanded) {
  const expanded = isCollapsibleExpanded(id, defaultExpanded);
  return `
    <div class="card-header collapsible-card-header" data-action="toggleCollapsibleSection('${id}')">
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        <svg id="collapse-chevron-${id}" class="accounts-section-chevron ${expanded ? 'expanded' : ''}" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
        <div class="card-title">${titleHtml}</div>
      </div>
  `;
}
function collapsibleBodyStyle(id, defaultExpanded) {
  return isCollapsibleExpanded(id, defaultExpanded) ? '' : 'display:none';
}

function renderAccountsPage(type) {
  const s = getState();
  const cfg = ACCOUNT_TYPES[type];
  const accounts = s.accounts.filter(a => a.type === type);
  const page = document.getElementById(`page-${type}-accounts`);
  const view = getAccountsViewState(type);

  // Totals (always computed across ALL accounts of this type — unaffected by
  // the search box below, which only filters which cards are shown).
  let totalIncome = 0, totalExpense = 0, totalBalance = 0;
  accounts.forEach(acc => {
    totalBalance += getAccountBalanceInBase(acc.id);
    totalIncome += getAccountIncomeInBase(acc.id);
    totalExpense += getAccountExpenseInBase(acc.id);
  });

  const baseCur = s.currencies.find(c => c.code === s.baseCurrency);
  const activeAccounts = accounts.filter(a => a.active);

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${cfg.label} Accounts</div>
        <div class="page-subtitle">${cfg.desc}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" title="${view.compact ? 'Switch to normal view' : 'Switch to compact view'}" data-action="toggleAccountsCompact('${type}')">
          <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor">${view.compact
            ? '<path d="M4 4h16v4H4zm0 6h16v4H4zm0 6h16v4H4z"/>'
            : '<path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"/>'}</svg>
          ${view.compact ? 'Normal View' : 'Compact View'}
        </button>
        <button class="btn btn-primary" data-action="showAccountModal(null,'${type}')">
          <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          New Account
        </button>
      </div>
    </div>

    <div class="stats-strip">
      <div class="stat-card">
        <div class="stat-label">Total Balance</div>
        <div class="stat-value accent">${formatCurrency(totalBalance, s.baseCurrency)}</div>
        <div class="stat-sub">All ${cfg.label} accounts in ${s.baseCurrency}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Income</div>
        <div class="stat-value green">${formatCurrency(totalIncome, s.baseCurrency)}</div>
        <div class="stat-sub">Across all ${cfg.label} accounts</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Expenses</div>
        <div class="stat-value red">${formatCurrency(totalExpense, s.baseCurrency)}</div>
        <div class="stat-sub">Across all ${cfg.label} accounts</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Accounts</div>
        <div class="stat-value">${accounts.length}</div>
        <div class="stat-sub">${activeAccounts.length} active</div>
      </div>
    </div>

    ${accounts.length > 0 ? `
      <div class="filters-bar">
        <input type="text" id="acct-search-${type}" placeholder="Search ${cfg.label.toLowerCase()} accounts…" autocomplete="off"
          data-input="filterAccountsList('${type}')" style="flex:1;min-width:200px">
      </div>
    ` : ''}

    <div class="content" id="accounts-content-${type}">
      ${renderAccountsListContent(type, accounts)}
    </div>
  `;
}

// Renders just the account cards/sections for a type — factored out of
// renderAccountsPage() so the search box (filterAccountsList) can refresh
// only this part of the page without losing focus on the search input.
function renderAccountsListContent(type, accounts) {
  const view = getAccountsViewState(type);
  const cfg = ACCOUNT_TYPES[type];

  if (accounts.length === 0) {
    return `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/></svg>
        <div class="empty-title">No ${cfg.label} accounts yet</div>
        <p>Create your first ${cfg.label.toLowerCase()} account to start tracking your finances.</p>
        <br>
        <button class="btn btn-primary" data-action="showAccountModal(null,'${type}')">Create Account</button>
      </div>
    `;
  }

  const search = (document.getElementById(`acct-search-${type}`)?.value || '').trim();
  const filtered = search
    ? accounts.filter(a => fuzzyMatch(search, a.name) || fuzzyMatch(search, a.description || ''))
    : accounts;

  if (filtered.length === 0) {
    return `<div class="ft-empty-inline">No accounts match "${escHtml(search)}"</div>`;
  }

  const activeAccounts = filtered.filter(a => a.active);
  const inactiveAccounts = filtered.filter(a => !a.active);

  function section(label, list, key) {
    const expanded = view['expand' + key];
    return `
      <div class="accounts-section">
        <div class="accounts-section-header" data-action="toggleAccountsSection('${type}','${key}')">
          <svg class="accounts-section-chevron ${expanded ? 'expanded' : ''}" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
          <span class="accounts-section-title">${label}</span>
          <span class="chip">${list.length}</span>
        </div>
        ${expanded ? (list.length === 0
          ? `<div class="ft-empty-inline">No ${label.toLowerCase()} accounts</div>`
          : `<div class="accounts-grid ${view.compact ? 'compact' : ''}">${list.map(acc => renderAccountCard(acc, view.compact)).join('')}</div>`
        ) : ''}
      </div>
    `;
  }

  return `
    ${section('Active', activeAccounts, 'Active')}
    ${section('Inactive', inactiveAccounts, 'Inactive')}
  `;
}

function filterAccountsList(type) {
  const el = document.getElementById(`accounts-content-${type}`);
  if (!el) return;
  const s = getState();
  const accounts = s.accounts.filter(a => a.type === type);
  el.innerHTML = renderAccountsListContent(type, accounts);
}

function renderAccountCard(acc, compact) {
  const bal = getAccountBalance(acc.id);
  const inc = getAccountIncome(acc.id);
  const exp = getAccountExpense(acc.id);

  const accColor = acc.color || '#4f8ef7';
  const typeLabel = ACCOUNT_TYPES[acc.type]?.label || acc.type;

  const clickAction = `showAccountTransactions('${acc.id}')`;

  if (compact) {
    return `
      <div class="account-card compact type-${acc.type}" style="border-left: 7px solid ${accColor}" data-action="${clickAction}">
        <div class="account-card-name" style="color:${accColor}"><span class="account-card-icon">${escHtml(acc.icon || '')}</span> ${escHtml(acc.name)}</div>
        <div class="account-card-typeline">(${typeLabel})</div>
        <div class="account-balance compact">${formatCurrency(bal, acc.currency)}</div>
        <div class="account-actions ft-stop-propagation">
          <button class="btn btn-ghost btn-icon btn-sm" title="Edit" data-action="showAccountModal('${acc.id}')">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
        </div>
        ${!acc.active ? '<span class="account-badge">Inactive</span>' : ''}
      </div>
    `;
  }

  return `
    <div class="account-card type-${acc.type}" style="border-left: 7px solid ${accColor}" data-action="${clickAction}">
      <div class="account-card-name" style="color:${accColor}"><span class="account-card-icon">${escHtml(acc.icon || '')}</span> ${escHtml(acc.name)}</div>
      <div class="account-card-typeline">(${typeLabel})</div>
      <div class="account-card-currency">${acc.currency}</div>
      <div class="account-balance">${formatCurrency(bal, acc.currency)}</div>
      <div class="account-income-expense">
        <div class="account-inc">▲ ${formatCurrency(inc, acc.currency)}</div>
        <div class="account-exp">▼ ${formatCurrency(exp, acc.currency)}</div>
      </div>
      <div class="account-actions ft-stop-propagation">
        <button class="btn btn-ghost btn-icon btn-sm" title="Edit" data-action="showAccountModal('${acc.id}')">
          <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button class="btn btn-danger btn-icon btn-sm" title="Delete" data-action="deleteAccount('${acc.id}')">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
      ${!acc.active ? '<span class="account-badge">Inactive</span>' : ''}
    </div>
  `;
}

// ══════════════════════════════════════════════
//  EMOJI / ICON PICKER (inline popover, not a modal)
// ══════════════════════════════════════════════
// A second openModal() call would blow away whatever form is already open
// (there's only one modal container), so this renders as a small popover
// panel inside the account form instead.
const FT_EMOJI_LIST = [
  { e: '🏦', n: 'bank' }, { e: '💰', n: 'money bag savings' }, { e: '💵', n: 'dollar banknote cash' },
  { e: '💳', n: 'credit card' }, { e: '🏧', n: 'atm' }, { e: '💴', n: 'yen banknote' },
  { e: '💶', n: 'euro banknote' }, { e: '💷', n: 'pound banknote' }, { e: '🪙', n: 'coin' },
  { e: '📈', n: 'chart increasing profit investment' }, { e: '📉', n: 'chart decreasing loss' },
  { e: '💹', n: 'chart yen growth' }, { e: '🏠', n: 'house home' }, { e: '🏡', n: 'house garden home' },
  { e: '🚗', n: 'car vehicle transport' }, { e: '✈️', n: 'airplane travel' },
  { e: '🛒', n: 'cart shopping groceries' }, { e: '🍔', n: 'burger food dining' }, { e: '☕', n: 'coffee' },
  { e: '🎓', n: 'graduation education school' }, { e: '💊', n: 'medicine health' }, { e: '🏥', n: 'hospital health' },
  { e: '🎬', n: 'movie entertainment' }, { e: '🎮', n: 'game entertainment' }, { e: '📱', n: 'phone mobile bill' },
  { e: '💻', n: 'laptop computer' }, { e: '🎁', n: 'gift' }, { e: '🧾', n: 'receipt bill invoice' },
  { e: '🪪', n: 'card id' }, { e: '💎', n: 'diamond gem investment' }, { e: '🥇', n: 'gold medal investment' },
  { e: '🛢️', n: 'oil barrel commodity investment' }, { e: '🏗️', n: 'construction real estate investment' },
  { e: '📊', n: 'bar chart stats' }, { e: '🐖', n: 'piggy pig savings' }, { e: '👛', n: 'purse wallet' },
  { e: '⚡', n: 'utility electricity bill' }, { e: '💡', n: 'idea utility bill' }, { e: '🚰', n: 'water utility bill' },
  { e: '📶', n: 'internet wifi bill' }, { e: '🏋️', n: 'gym fitness health' }, { e: '🍽️', n: 'restaurant dining' },
  { e: '🎉', n: 'party celebration' }, { e: '🐾', n: 'pet animal' }, { e: '🧳', n: 'travel luggage' },
  { e: '📚', n: 'books education' }, { e: '🛠️', n: 'tools maintenance' }, { e: '🧢', n: 'clothing apparel' },
  { e: '👶', n: 'baby childcare' }, { e: '🚕', n: 'taxi transport' }, { e: '🚌', n: 'bus transport' },
  { e: '💼', n: 'briefcase business salary' }, { e: '🏢', n: 'office building business' },
  { e: '🍕', n: 'pizza food dining' }, { e: '🍺', n: 'beer drinks bar' }, { e: '🍷', n: 'wine drinks bar' },
  { e: '🚆', n: 'train transport commute' }, { e: '⛽', n: 'gas fuel car' }, { e: '🅿️', n: 'parking car' },
  { e: '📺', n: 'tv streaming subscription entertainment' }, { e: '🎵', n: 'music streaming subscription' },
  { e: '💄', n: 'cosmetics beauty personal care' }, { e: '💇', n: 'haircut salon personal care' },
  { e: '🧴', n: 'toiletries personal care' }, { e: '🐶', n: 'dog pet animal' }, { e: '🐱', n: 'cat pet animal' },
  { e: '👕', n: 'clothing apparel shopping' }, { e: '👟', n: 'shoes apparel shopping' },
  { e: '🎄', n: 'holiday christmas gift' }, { e: '🎂', n: 'birthday celebration gift' },
  { e: '⚖️', n: 'legal fees lawyer' }, { e: '🧑‍⚕️', n: 'doctor health' }, { e: '🦷', n: 'dentist health' },
  { e: '🏦', n: 'loan bank' }, { e: '📉', n: 'debt loss' }, { e: '🔧', n: 'repair maintenance tools' },
  { e: '🌱', n: 'garden plants investment growth' }, { e: '🪴', n: 'plant home' }, { e: '📦', n: 'package delivery shopping' },
  { e: '🎫', n: 'ticket event entertainment' }, { e: '🏝️', n: 'vacation travel' }, { e: '⛴️', n: 'ferry travel transport' },
  { e: '🚲', n: 'bike transport' }, { e: '🧸', n: 'toys childcare gift' }, { e: '🐣', n: 'childcare baby' },
];

// Only one emoji popover should ever be open at a time — otherwise a second
// field's popover can be left open (and interactable) underneath a modal
// that gets closed/replaced, which is what made the button seem "stuck" or
// unresponsive on the next click.
function toggleEmojiPicker(pickerId, inputId) {
  const panel = document.getElementById(pickerId);
  if (!panel) return;
  const showing = panel.style.display !== 'none';
  closeAllEmojiPickers();
  if (!showing) {
    panel.style.display = 'block';
    renderEmojiGrid(inputId, pickerId, '');
    const search = document.getElementById(pickerId + '-search');
    if (search) search.focus();
  }
}

function closeAllEmojiPickers() {
  document.querySelectorAll('#fintrack-root .ft-emoji-popover').forEach(p => { p.style.display = 'none'; });
}

// Close the popover when clicking anywhere outside the icon field, and on Escape.
document.addEventListener('click', function (e) {
  if (e.target.closest('.ft-emoji-field') || e.target.closest('.ft-emoji-popover')) return;
  closeAllEmojiPickers();
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeAllEmojiPickers();
});

// User-added custom emojis — appended after the built-in list so people
// aren't limited to FT_EMOJI_LIST. Stored locally (display preference, not
// app data), same pattern as the accounts view state above.
const FT_CUSTOM_EMOJI_KEY = 'fintrack_custom_emojis_v1';
window._ftCustomEmojis = window._ftCustomEmojis || (function loadCustomEmojisFromStorage() {
  try {
    const raw = localStorage.getItem(FT_CUSTOM_EMOJI_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
})();
function persistCustomEmojis() {
  try { localStorage.setItem(FT_CUSTOM_EMOJI_KEY, JSON.stringify(window._ftCustomEmojis)); } catch (e) { /* storage unavailable — list just won't persist */ }
}

function renderEmojiGrid(inputId, pickerId, query) {
  const grid = document.getElementById(pickerId + '-grid');
  if (!grid) return;
  const q = (query || '').toLowerCase();
  const filtered = FT_EMOJI_LIST.filter(x => !q || x.n.includes(q));
  // Custom emojis aren't tagged with searchable keywords, so a search only
  // hides them if it's actually filtering something — an empty query still
  // shows all of them alongside the built-in set.
  const customFiltered = q ? window._ftCustomEmojis.filter(e => e === q) : window._ftCustomEmojis;

  const addBtnHTML = `
    <button type="button" class="ft-emoji-opt ft-emoji-add" title="Add a new icon…" data-action="promptAddCustomEmoji('${inputId}','${pickerId}')">+</button>
  `;

  grid.innerHTML = (filtered.length === 0 && customFiltered.length === 0)
    ? `<div class="ft-combo-empty">No icons found</div>${addBtnHTML}`
    : filtered.map(x => `<button type="button" class="ft-emoji-opt" title="${escHtml(x.n)}" data-action="pickEmoji('${inputId}','${pickerId}','${x.e}')">${x.e}</button>`).join('')
      + customFiltered.map(e => `<button type="button" class="ft-emoji-opt" title="Custom icon" data-action="pickEmoji('${inputId}','${pickerId}','${String(e).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">${escHtml(e)}</button>`).join('')
      + addBtnHTML;
}

// Prompts the person to type/paste a single emoji, adds it to the custom
// list (skipping duplicates already in either list), persists it, then
// re-renders the grid and selects it straight into the field.
function promptAddCustomEmoji(inputId, pickerId) {
  const entered = window.prompt('Enter an emoji to add to your icon picker:');
  if (entered === null) return;
  const emoji = entered.trim().slice(0, 16);
  if (!emoji) { showToast('Enter an emoji first', 'error'); return; }
  const alreadyBuiltIn = FT_EMOJI_LIST.some(x => x.e === emoji);
  if (!alreadyBuiltIn && !window._ftCustomEmojis.includes(emoji)) {
    window._ftCustomEmojis.push(emoji);
    persistCustomEmojis();
  }
  const search = document.getElementById(pickerId + '-search');
  renderEmojiGrid(inputId, pickerId, search ? search.value : '');
  pickEmoji(inputId, pickerId, emoji);
}

function filterEmojiGrid(inputId, pickerId) {
  const search = document.getElementById(pickerId + '-search');
  renderEmojiGrid(inputId, pickerId, search ? search.value : '');
}

// Keeps the little preview button in sync while someone types/pastes an
// emoji directly into the field instead of picking from the grid.
function syncEmojiButton(inputId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(inputId + '-btn');
  if (input && btn) btn.textContent = input.value || '🙂';
}

function pickEmoji(inputId, pickerId, emoji) {
  const input = document.getElementById(inputId);
  if (input) input.value = emoji;
  const btn = document.getElementById(inputId + '-btn');
  if (btn) btn.textContent = emoji || '🙂';
  const panel = document.getElementById(pickerId);
  if (panel) panel.style.display = 'none';
}

// The toggle button now lives *inside* the input's own box (an icon-style
// button absolutely positioned over the right edge of the input) instead of
// sitting next to it as a separate control, and clicking anywhere on the
// input itself also opens the picker, so there's no dead space where a
// click does nothing.
function emojiPickerFieldHTML(inputId, value) {
  const pickerId = inputId + '-picker';
  return `
    <div class="ft-emoji-field">
      <input id="${inputId}" value="${escHtml(value || '')}" maxlength="8" class="ft-emoji-input"
             placeholder="Type or paste any emoji…" autocomplete="off"
             data-action="toggleEmojiPicker('${pickerId}','${inputId}')"
             data-input="syncEmojiButton('${inputId}')">
      <button type="button" id="${inputId}-btn" class="ft-emoji-btn" title="Choose icon…"
              data-action="toggleEmojiPicker('${pickerId}','${inputId}')">${value || '🙂'}</button>
    </div>
    <div id="${pickerId}" class="ft-emoji-popover" style="display:none">
      <input id="${pickerId}-search" placeholder="Search icons…" autocomplete="off" data-input="filterEmojiGrid('${inputId}','${pickerId}')">
      <div class="ft-emoji-grid" id="${pickerId}-grid"></div>
    </div>
  `;
}

function showAccountModal(accountId, defaultType) {
  const s = getState();
  const acc = accountId ? s.accounts.find(a => a.id == accountId) : null;
  const title = acc ? '🏦 Edit Account' : '🏦 New Account';
  const accType = acc?.type || defaultType || 'asset';

  openModal(title, `
    <div class="form-grid cols-1">
      <div class="form-grid">
        <div class="form-group full">
          <label>Account Name *</label>
          <input id="acc-name" placeholder="e.g. Main Checking" value="${acc?.name || ''}">
        </div>
        <div class="form-group">
          <label>Type *</label>
          <select id="acc-type">
            ${Object.entries(ACCOUNT_TYPES).map(([v, cfg]) =>
              `<option value="${v}" ${accType === v ? 'selected' : ''}>${cfg.label}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Currency *</label>
          <select id="acc-currency">
            ${s.currencies.map(c => `<option value="${c.code}" ${(acc?.currency || s.baseCurrency) === c.code ? 'selected' : ''}>${c.code} — ${escHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Icon (emoji)</label>
          ${emojiPickerFieldHTML('acc-icon', acc?.icon || '')}
        </div>
        <div class="form-group">
          <label>Color</label>
          <input id="acc-color" type="color" value="${acc?.color || randomLightColor()}">
        </div>
        <div class="form-group full">
          <label>Description</label>
          <textarea id="acc-desc" placeholder="Optional description...">${acc?.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="acc-active">
            <option value="true" ${!acc || acc.active ? 'selected' : ''}>Active</option>
            <option value="false" ${acc && !acc.active ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <div style="display:flex;gap:10px">
          <button class="btn btn-secondary" data-action="closeModal()">Cancel</button>
          <button class="btn btn-primary" data-action="saveAccount('${accountId || ''}')">
            ${acc ? 'Save Changes' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  `);
}

function saveAccount(accountId) {
  if (typeof window._ftSaveAccount === 'function') { window._ftSaveAccount(accountId); return; }
  const state = getState();
  const name = document.getElementById('acc-name').value.trim();
  if (!name) { showToast('Account name required', 'error'); return; }

  const data = {
    name,
    type: document.getElementById('acc-type').value,
    currency: document.getElementById('acc-currency').value,
    icon: document.getElementById('acc-icon').value.trim(),
    color: document.getElementById('acc-color').value,
    description: document.getElementById('acc-desc').value.trim(),
    active: document.getElementById('acc-active').value === 'true',
  };

  if (accountId) {
    const acc = state.accounts.find(a => a.id == accountId);
    if (acc) Object.assign(acc, data);
    showToast('Account updated', 'success');
  } else {
    state.accounts.push({ id: generateId('acc'), ...data, created: new Date().toISOString() });
    showToast('Account created', 'success');
  }

  saveState();
  closeModal();
  refreshCurrentPage();
}

// ── Delete confirmation (+ optional cancellable countdown) ──
//
// Generic "are you sure?" gate used before any destructive action. If
// countdownSeconds > 0, confirming doesn't fire onConfirm immediately —
// it shows a second-stage countdown with a Cancel button, and onConfirm
// only runs if the countdown reaches zero uncancelled. Used for account
// deletion (3s undo window); transaction deletion uses countdownSeconds:0
// since it's already recoverable via the recycle bin.
let _ftDeleteCountdownTimer = null;
let _ftDeleteCountdownCancelled = false;

function confirmDangerousAction(opts) {
  const { title, message, confirmLabel = 'Delete', onConfirm, countdownSeconds = 0 } = opts;
  openModal(title, `
    <div class="form-grid cols-1">
      <p style="font-size:14px;color:var(--text-2);line-height:1.5">${message}</p>
      <div class="form-actions">
        <button class="btn btn-secondary" data-action="closeModal()">Cancel</button>
        <button class="btn btn-danger" id="ft-confirm-danger-btn">${escHtml(confirmLabel)}</button>
      </div>
    </div>
  `);
  const btn = document.getElementById('ft-confirm-danger-btn');
  if (btn) {
    btn.onclick = function () {
      if (countdownSeconds > 0) {
        startDeleteCountdown(countdownSeconds, onConfirm);
      } else {
        closeModal();
        onConfirm();
      }
    };
  }
}

function startDeleteCountdown(seconds, onConfirm) {
  let remaining = seconds;
  _ftDeleteCountdownCancelled = false;
  openModal('⏳ Deleting…', `
    <div class="form-grid cols-1" style="text-align:center">
      <p style="font-size:14px;color:var(--text-2)">
        Deleting in <span id="ft-countdown-num" style="font-weight:700;color:var(--red);font-size:18px">${remaining}</span>s…
      </p>
      <div class="form-actions" style="justify-content:center">
        <button class="btn btn-secondary" data-action="cancelDeleteCountdown()">Cancel</button>
      </div>
    </div>
  `);
  if (_ftDeleteCountdownTimer) clearInterval(_ftDeleteCountdownTimer);
  _ftDeleteCountdownTimer = setInterval(function () {
    remaining -= 1;
    const el = document.getElementById('ft-countdown-num');
    if (el) el.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(_ftDeleteCountdownTimer);
      _ftDeleteCountdownTimer = null;
      if (!_ftDeleteCountdownCancelled) {
        closeModal();
        onConfirm();
      }
    }
  }, 1000);
}

window.cancelDeleteCountdown = function () {
  _ftDeleteCountdownCancelled = true;
  if (_ftDeleteCountdownTimer) { clearInterval(_ftDeleteCountdownTimer); _ftDeleteCountdownTimer = null; }
  closeModal();
  showToast('Deletion cancelled', 'success');
};

function deleteAccount(accountId) {
  const s = getState();
  const acc = s.accounts.find(a => a.id == accountId);
  const name = acc ? acc.name : 'this account';
  confirmDangerousAction({
    title: '🗑️ Delete Account',
    message: `Delete <strong>${escHtml(name)}</strong>?`,
    confirmLabel: 'Delete Account',
    countdownSeconds: 5,
    onConfirm: function () { performDeleteAccount(accountId); },
  });
}

function performDeleteAccount(accountId) {
  if (typeof window._ftDeleteAccount === 'function') { window._ftDeleteAccount(accountId); return; }
  const state = getState();
  const inUse = state.transactions.some(t => t.accountId == accountId) ||
                state.transfers.some(t => t.fromAccountId == accountId || t.toAccountId == accountId);
  if (inUse) {
    const acc = state.accounts.find(a => a.id == accountId);
    if (acc) acc.active = false;
    saveState();
    showToast('This account has existing transactions and can\'t be deleted. It has been marked inactive instead.', 'error');
    refreshCurrentPage();
    return;
  }

  state.accounts = state.accounts.filter(a => a.id !== accountId);
  saveState();
  showToast('Account deleted', 'success');
  refreshCurrentPage();
}

// Clicking an account tile jumps to the All Transactions page, pre-filtered
// to that account, so the user can see every transaction for it across all dates.
//
// Resets every other saved filter first (see resetTxFilterState()) before
// applying the account filter — otherwise whatever category/tag/type/date
// range was left over from a previous visit to All Transactions stayed in
// effect, silently mixing in with the account filter instead of showing
// every transaction for that account.
function showAccountTransactions(accountId) {
  const s = getState();
  const acc = s.accounts.find(a => a.id == accountId);
  if (!acc) return;

  resetTxFilterState();
  navigate('transactions');

  if (document.getElementById('tx-account-filter')) {
    chooseComboboxOption('tx-account-filter', String(accountId));
    filterTransactions();
  }
}

// Clicking a category card or tag chip jumps to All Transactions, pre-filtered
// to that category/tag, same pattern as clicking an account tile.
//
// Both helpers first clear every *other* saved filter (see
// resetTxFilterState()) before applying the category/tag — otherwise
// whatever account/type/date-range was left over from a previous visit to
// All Transactions stayed in effect, silently narrowing the category/tag
// view down to only that account's transactions.
function showCategoryTransactions(categoryName) {
  resetTxFilterState();
  navigate('transactions');
  if (document.getElementById('tx-category-filter')) {
    chooseComboboxOption('tx-category-filter', categoryName);
    filterTransactions();
  }
}

function showTagTransactions(tag) {
  resetTxFilterState();
  navigate('transactions');
  if (document.getElementById('tx-tag-filter')) {
    setTagFilterSelection('tx-tag-filter', [tag]);
    filterTransactions();
  }
}
// FinTrack — Transactions Module

function renderTransactionsPage() {
  const s = getState();
  const page = document.getElementById('page-transactions');

  const sorted = [...s.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  // A dashboard/report card may have set a pending filter (see
  // navigateToTransactions) right before navigating here — consume it once
  // so this page opens already scoped to whatever the person clicked.
  const pending = window._ftPendingTxFilter;
  window._ftPendingTxFilter = null;

  // Every filter criterion is persisted in browser localStorage (see
  // getSavedTxFilter()/setSavedTxFilter() below) so the filter bar is
  // restored exactly as the user left it every time this page (re)renders.
  // This matters most right after editing or deleting a transaction (see
  // submitTransaction()/deleteTransaction()), which both call
  // refreshCurrentPage() -> renderTransactionsPage(): without this, that
  // refresh used to silently reset search/type/account/category/tag back to
  // blank, which was disruptive when working through several transactions
  // against the same filter. A pending filter (dashboard/report card click)
  // still fully replaces the saved ones for that one visit.
  //
  // None of these ever round-trip through the account's saved settings/db —
  // purely a browser-local convenience so a mid-task refresh doesn't lose
  // your place, not a "real" saved preference synced across devices.
  const savedFrom = pending ? (pending.from || '') : getSavedTxFilter('from');
  const savedTo = pending ? (pending.to || '') : getSavedTxFilter('to');
  const initialSearch = pending ? (pending.search || '') : getSavedTxSearch();
  const initialType = pending ? (pending.type || '') : getSavedTxFilter('type');
  const initialAccount = pending ? (pending.account || '') : getSavedTxFilter('account');
  const initialCategory = pending ? (pending.category || '') : getSavedTxFilter('category');
  const savedTagRaw = pending ? pending.tag : getSavedTxFilterTags();
  const initialTags = Array.isArray(savedTagRaw) ? savedTagRaw.filter(Boolean) : (savedTagRaw ? [savedTagRaw] : []);
  const initialTagMatchAll = pending ? !!pending.tagMatchAll : (getSavedTxFilter('tagMatchAll') === '1');

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">All Transactions</div>
        <div class="page-subtitle">${sorted.length} transactions</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" data-action="exportTransactionsCSV()">Export CSV</button>
        <button class="btn btn-secondary" data-action="showImportCsvModal()">Import CSV</button>
        <button class="btn btn-primary" data-action="openNewTransactionFromList()">
          <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          New Transaction
        </button>
      </div>
    </div>

    <div class="filters-bar">
      <div class="ft-filter-field">
        <label class="ft-filter-label" for="tx-from-filter">From</label>
        <input type="date" id="tx-from-filter" value="${savedFrom}" data-change="filterTransactions()">
      </div>
      <div class="ft-filter-field">
        <label class="ft-filter-label" for="tx-to-filter">To</label>
        <input type="date" id="tx-to-filter" value="${savedTo}" data-change="filterTransactions()">
      </div>
      <div class="ft-filter-field">
        <label class="ft-filter-label" for="tx-type-filter">Type</label>
        <select id="tx-type-filter" data-change="filterTransactions()">
          <option value="" ${initialType === '' ? 'selected' : ''}>All Types</option>
          <option value="income" ${initialType === 'income' ? 'selected' : ''}>Income</option>
          <option value="expense" ${initialType === 'expense' ? 'selected' : ''}>Expense</option>
        </select>
      </div>
      <div class="ft-filter-field" style="min-width:170px">
        <label class="ft-filter-label" for="tx-account-filter-search">Account</label>
        ${comboboxHTML('tx-account-filter',
          [{ value: '', label: 'All Accounts' }, ...s.accounts.map(a => ({ value: a.id, label: a.name }))],
          initialAccount, 'Search accounts…')}
      </div>
      <div class="ft-filter-field" style="min-width:170px">
        <label class="ft-filter-label" for="tx-category-filter-search">Category</label>
        ${comboboxHTML('tx-category-filter',
          [{ value: '', label: 'All Categories' }, ...[...new Set(s.transactions.map(t => t.category).filter(Boolean))].map(c => ({ value: c, label: c }))],
          initialCategory, 'Search categories…')}
      </div>
      <div class="ft-filter-field" style="flex:1;min-width:150px">
        <label class="ft-filter-label" for="tx-search">Description</label>
        <input type="text" id="tx-search" placeholder="Search description…" value="${escHtml(initialSearch)}" data-input="filterTransactions()">
      </div>
      <div class="ft-tag-filter-box" id="tx-tag-filter-box">
        <div class="ft-tag-filter-head">
          <label class="ft-filter-label">Tags</label>
          <label class="ft-tag-strict-toggle" title="When on, a transaction must have every selected tag. When off, having any one of the selected tags is enough.">
            <input type="checkbox" id="tx-tag-match-all" ${initialTagMatchAll ? 'checked' : ''} data-change="filterTransactions()">
            Match all
          </label>
        </div>
        ${multiTagFilterHTML('tx-tag-filter',
          [...new Set(s.transactions.flatMap(t => t.tags || []))].sort(),
          initialTags)}
      </div>
      <span id="tx-reset-filters-wrap">${renderTxResetFiltersButton(savedFrom, savedTo, initialSearch, initialType, initialAccount, initialCategory, initialTags, initialTagMatchAll)}</span>
    </div>


    <div class="content" style="padding-top:16px">
      <div class="card">
        <div id="tx-summary-wrap"></div>
        <div class="table-wrap" id="tx-table-wrap"></div>
      </div>
    </div>
  `;

  // The account/category filters are fuzzy-search comboboxes (see the
  // FUZZY-SEARCH COMBOBOX helpers) — wire up onSelect so picking an option
  // re-runs the filter, same as the old <select data-change> did. The tag
  // filter is a separate multi-select widget (see multiTagFilterHTML()) that
  // already re-runs the filter itself whenever a tag is toggled.
  ['tx-account-filter', 'tx-category-filter'].forEach(id => {
    if (window._ftComboRegistry[id]) window._ftComboRegistry[id].onSelect = function () { filterTransactions(); };
  });

  // Render the (possibly pre-filtered) table/summary now that every filter
  // input above actually exists in the DOM.
  filterTransactions();
}

// Renders a total both in the transactions' own (original) currency and, in
// brackets, converted to the base currency — unless the filtered set mixes
// several currencies, in which case only the base-currency total makes sense.
function formatSumWithBase(txList, nativeSum, baseSum, base) {
  const currencies = [...new Set(txList.map(t => t.currency))];
  if (currencies.length === 1 && currencies[0] === base) {
    return formatCurrency(baseSum, base);
  }
  if (currencies.length === 1) {
    return `${formatCurrency(nativeSum, currencies[0])} <span style="color:var(--text-3);font-weight:500">(${formatCurrency(baseSum, base)})</span>`;
  }
  return `${formatCurrency(baseSum, base)} <span style="color:var(--text-3);font-weight:500;font-size:11px">(mixed currencies)</span>`;
}

function renderTransactionSummary(transactions) {
  const s = getState();
  const base = s.baseCurrency;

  const incomeTx = transactions.filter(t => t.type === 'income');
  const expenseTx = transactions.filter(t => t.type === 'expense');

  const nativeIncome = incomeTx.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
  const nativeExpense = expenseTx.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

  const totalIncome = incomeTx.reduce((sum, t) => sum + transactionAmountInBase(t), 0);
  const totalExpense = expenseTx.reduce((sum, t) => sum + transactionAmountInBase(t), 0);

  const diff = totalIncome - totalExpense;

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;padding:14px 16px;border-bottom:1px solid var(--border)">
      <div style="background:var(--bg);border-radius:6px;padding:12px 14px">
        <div style="font-size:11.5px;color:var(--text-3);margin-bottom:4px">Total Income</div>
        <div class="td-mono td-green" style="font-size:18px;font-weight:700">${formatSumWithBase(incomeTx, nativeIncome, totalIncome, base)}</div>
      </div>
      <div style="background:var(--bg);border-radius:6px;padding:12px 14px">
        <div style="font-size:11.5px;color:var(--text-3);margin-bottom:4px">Total Expense</div>
        <div class="td-mono td-red" style="font-size:18px;font-weight:700">${formatSumWithBase(expenseTx, nativeExpense, totalExpense, base)}</div>
      </div>
      <div style="background:var(--bg);border-radius:6px;padding:12px 14px">
        <div style="font-size:11.5px;color:var(--text-3);margin-bottom:4px">Difference (Income − Expense)</div>
        <div class="td-mono ${diff >= 0 ? 'td-green' : 'td-red'}" style="font-size:18px;font-weight:700">${formatCurrency(diff, base)}</div>
      </div>
    </div>
  `;
}

function renderTransactionTable(transactions) {
  const s = getState();
  if (transactions.length === 0) {
    return `<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M7 16l-4-4 4-4v3h8.25C16.24 11 18 12.76 18 14.75S16.24 18.5 14.25 18.5H10v-2h4.25c.96 0 1.75-.79 1.75-1.75S15.21 13 14.25 13H7v3z"/></svg><div class="empty-title">No transactions found</div><p>Add your first transaction or adjust your filters.</p></div>`;
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Account</th>
          <th>Description</th>
          <th>Category</th>
          <th>Tags</th>
          <th>Type</th>
          <th>Amount</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${transactions.map(t => {
          const acc = s.accounts.find(a => a.id == t.accountId);
          return `
            <tr class="ft-row-clickable" data-action="showTransactionModal('${t.id}', null, true)" title="Click to view details">
              <td class="td-muted">${formatDate(t.date)}</td>
              <td>${acc ? `<span class="chip">${escHtml(acc.icon || '')} ${escHtml(acc.name)}</span>` : '—'}</td>
              <td>${escHtml(t.description) || '—'}</td>
              <td>${t.category ? `<span class="chip">${escHtml(t.category)}</span>` : '—'}</td>
              <td>${(t.tags || []).map(tag => `<span class="chip">${escHtml(tag)}</span>`).join(' ')}</td>
              <td><span class="chip ${t.type === 'income' ? 'green' : 'red'}">${t.type}</span></td>
              <td class="td-mono ${t.type === 'income' ? 'td-green' : 'td-red'}">
                ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount, t.currency)}
              </td>
              <td>
                <div class="ft-stop-propagation" style="display:flex;gap:4px">
                  <button class="btn btn-ghost btn-icon btn-sm" data-action="showTransactionModal('${t.id}')" title="Edit">
                      <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>
                    </button>
                    <button class="btn btn-danger btn-icon btn-sm" data-action="deleteTransaction('${t.id}')" title="Delete">
                      <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12z"/></svg>
                    </button>
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function getFilteredTransactions() {
  const s = getState();
  const search = (document.getElementById('tx-search')?.value || '').toLowerCase();
  const type = document.getElementById('tx-type-filter')?.value || '';
  const account = document.getElementById('tx-account-filter')?.value || '';
  const category = document.getElementById('tx-category-filter')?.value || '';
  // Multiple tags can be selected now (see multiTagFilterHTML()) — by default
  // a transaction matches if it has ANY of the selected tags, but the
  // "Match all selected tags" checkbox switches this to requiring EVERY
  // selected tag to be present on the transaction.
  const tags = getTagFilterSelection('tx-tag-filter');
  const tagMatchAll = document.getElementById('tx-tag-match-all')?.checked || false;
  const from = document.getElementById('tx-from-filter')?.value;
  const to = document.getElementById('tx-to-filter')?.value;

  let filtered = [...s.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (search) filtered = filtered.filter(t => {
    const acc = s.accounts.find(a => a.id == t.accountId);
    return fuzzyMatch(search, t.description || '') ||
      fuzzyMatch(search, t.category || '') ||
      (t.tags || []).some(tag => fuzzyMatch(search, tag)) ||
      fuzzyMatch(search, acc ? acc.name : '');
  });
  if (type) filtered = filtered.filter(t => t.type === type);
  if (account) filtered = filtered.filter(t => t.accountId == account);
  if (category) filtered = filtered.filter(t => t.category === category);
  if (tags.length) filtered = filtered.filter(t => {
    const txTags = t.tags || [];
    return tagMatchAll ? tags.every(tg => txTags.includes(tg)) : tags.some(tg => txTags.includes(tg));
  });
  if (from) filtered = filtered.filter(t => new Date(t.date) >= new Date(from));
  if (to) filtered = filtered.filter(t => new Date(t.date) <= new Date(to + 'T23:59:59'));

  return filtered;
}

// ══════════════════════════════════════════════
//  CROSS-PAGE NAVIGATION HELPERS
// ══════════════════════════════════════════════
// Dashboard/report cards jump straight into a pre-filtered view instead of
// only being static summaries. A pending filter is stashed here and consumed
// once by renderTransactionsPage the next time it renders.
window._ftPendingTxFilter = null;

function navigateToTransactions(filter) {
  window._ftPendingTxFilter = filter || {};
  navigate('transactions');
}

// The data-action attribute is parsed by a small literal-only parser (see
// installDelegatedHandlers below) — it understands strings/numbers/null/
// true/false but not object literals. These wrappers give data-action a
// plain, fixed-arity function to call while still driving the same
// object-based navigateToTransactions() under the hood.
function ftNavigateTransactions(from, to, type, account, category) {
  navigateToTransactions({
    from: from || '',
    to: to || '',
    type: type || '',
    account: account || '',
    category: category || '',
  });
}

function navigateToTransactionsMonth(year, month) {
  const r = monthDateRange(Number(year), Number(month));
  navigateToTransactions({ from: r.from, to: r.to });
}

function monthDateRange(year, month) {
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0);
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: fmt(from), to: fmt(to) };
}

// Navigates to a page, then briefly scrolls to and pulses one specific
// element on it — lets a dashboard/report summary point at "that one
// budget" or "that one recurring item" rather than just the page at large.
function navigateAndHighlight(page, elementId) {
  navigate(page);
  setTimeout(() => {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ft-highlight-pulse');
    setTimeout(() => el.classList.remove('ft-highlight-pulse'), 1600);
  }, 60);
}

// ── Transaction filter persistence (browser-only, NOT the server-synced
// settings/db) ──
// Every filter on the All Transactions page — search, date range, type,
// account, category, tags — is saved here instead of in the server-synced
// settings object. It's still saved *somewhere* so an edit/delete refresh
// (see renderTransactionsPage()) doesn't wipe out the filter bar mid-task,
// but it no longer round-trips through the account's saved settings/db, so
// it can't keep silently reappearing indefinitely the way a "real" saved
// setting would, and there's nothing left server-side to clean up on future
// visits/logins/devices.
//
// Keys are namespaced by the logged-in Nextcloud user (falls back to a
// fixed key when OC.getCurrentUser() isn't available, e.g. standalone/demo
// mode) so that on a shared/public computer, one person's leftover filter
// picks can't silently apply to a different account that logs in next.
function ftTxFilterStorageKey(field) {
  let uid = 'default';
  try {
    if (typeof OC !== 'undefined' && OC.getCurrentUser && OC.getCurrentUser()) uid = OC.getCurrentUser().uid;
  } catch (_) { /* OC unavailable — standalone/demo mode */ }
  return `fintrack_tx_filter_${field}:${uid}`;
}

function getSavedTxFilter(field) {
  try { return localStorage.getItem(ftTxFilterStorageKey(field)) || ''; } catch (_) { return ''; }
}

function setSavedTxFilter(field, value) {
  try {
    if (value) localStorage.setItem(ftTxFilterStorageKey(field), value);
    else localStorage.removeItem(ftTxFilterStorageKey(field));
  } catch (_) { /* localStorage unavailable — silently skip */ }
}

function getSavedTxFilterTags() {
  const raw = getSavedTxFilter('tag');
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (_) { return []; }
}

function setSavedTxFilterTags(tags) {
  setSavedTxFilter('tag', (tags && tags.length) ? JSON.stringify(tags) : '');
}

// Back-compat aliases (search was the first field moved to localStorage,
// kept as thin wrappers so nothing else needs to change).
function getSavedTxSearch() { return getSavedTxFilter('search'); }
function setSavedTxSearch(value) { setSavedTxFilter('search', value); }

function filterTransactions() {
  // Persist every filter field to browser localStorage (not the
  // server-synced settings/db — see the "Transaction filter persistence"
  // helpers above) so the whole filter bar is restored the same every time
  // the Transactions page (re)renders, including right after an edit/delete
  // refresh (see renderTransactionsPage()).
  const from = document.getElementById('tx-from-filter')?.value || '';
  const to = document.getElementById('tx-to-filter')?.value || '';
  const type = document.getElementById('tx-type-filter')?.value || '';
  const account = document.getElementById('tx-account-filter')?.value || '';
  const category = document.getElementById('tx-category-filter')?.value || '';
  const tags = getTagFilterSelection('tx-tag-filter');
  const tagMatchAll = document.getElementById('tx-tag-match-all')?.checked || false;
  const search = document.getElementById('tx-search')?.value || '';

  setSavedTxFilter('from', from);
  setSavedTxFilter('to', to);
  setSavedTxFilter('type', type);
  setSavedTxFilter('account', account);
  setSavedTxFilter('category', category);
  setSavedTxFilterTags(tags);
  setSavedTxFilter('tagMatchAll', tagMatchAll ? '1' : '');
  setSavedTxSearch(search);

  // The Reset Filters button's visibility depends on whether any filter is
  // currently active — it's re-evaluated on every filter change (not just
  // the initial page render), otherwise it never appeared after the person
  // picked a filter post-load (typing a search term, changing a dropdown,
  // etc. only ever updated the table, never the filter bar around it).
  const resetWrap = document.getElementById('tx-reset-filters-wrap');
  if (resetWrap) resetWrap.innerHTML = renderTxResetFiltersButton(from, to, search, type, account, category, tags, tagMatchAll);

  const filtered = getFilteredTransactions();
  document.getElementById('tx-table-wrap').innerHTML = renderTransactionTable(filtered);
  const summaryWrap = document.getElementById('tx-summary-wrap');
  if (summaryWrap) summaryWrap.innerHTML = renderTransactionSummary(filtered);
}

// Shared by the initial page render and every subsequent filterTransactions()
// call, so the button's visibility always reflects the filter bar's current
// state instead of only the values it had when the page first loaded.
function renderTxResetFiltersButton(from, to, search, type, account, category, tags, tagMatchAll) {
  return (from || to || search || type || account || category || (tags && tags.length) || tagMatchAll)
    ? `<button class="btn btn-ghost btn-sm" data-action="resetTransactionFilters()" title="Clear search, type, account, category, tag, and date range">Reset Filters</button>`
    : '';
}

// Clears every saved transaction-list filter (all browser-local — see
// "Transaction filter persistence" above) without any toast/re-render side
// effects, so it can be reused as a plain "start from a clean slate" step —
// e.g. right before applying a single category/tag filter from the
// Categories & Tags page (see showCategoryTransactions()/showTagTransactions()).
function resetTxFilterState() {
  setSavedTxFilter('from', '');
  setSavedTxFilter('to', '');
  setSavedTxFilter('type', '');
  setSavedTxFilter('account', '');
  setSavedTxFilter('category', '');
  setSavedTxFilterTags([]);
  setSavedTxFilter('tagMatchAll', '');
  setSavedTxSearch('');
}

function resetTransactionFilters() {
  resetTxFilterState();
  showToast('Filters reset', 'success');
  refreshCurrentPage();
}

function exportTransactionsCSV() {
  if (!pinProtectionEnabled('pin_protect_export_csv')) { performExportTransactionsCSV(); return; }
  requirePin(performExportTransactionsCSV);
}

function performExportTransactionsCSV() {
  const s = getState();
  const filtered = getFilteredTransactions();

  if (filtered.length === 0) {
    showToast('No transactions to export', 'error');
    return;
  }

  const headers = ['date', 'type', 'amount', 'currency', 'account', 'description', 'category', 'tags', 'notes', 'conversionRate', 'unique-key(for-updating)'];
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

  // Summary header section — same totals shown on the Transactions page,
  // included at the top of the export so the CSV matches what's on screen.
  const base = s.baseCurrency;
  const totalIncome = filtered
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + transactionAmountInBase(t), 0);
  const totalExpense = filtered
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + transactionAmountInBase(t), 0);
  const diff = totalIncome - totalExpense;

  // Summary amounts use the currency CODE ("1,234.56 USD"), not
  // formatCurrency()'s symbol — several currency symbols (SAR's ﷼ in
  // particular) render as an unreadable character in CSV depending on the
  // opening app's encoding/font, while the ISO code is always plain ASCII
  // and unambiguous.
  const formatCsvAmount = (amount) => amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + base;

  const lines = [
    esc('Total Income') + ',' + esc(formatCsvAmount(totalIncome)),
    esc('Total Expense') + ',' + esc(formatCsvAmount(totalExpense)),
    esc('Difference (Income - Expense)') + ',' + esc(formatCsvAmount(diff)),
    '',
    headers.join(','),
  ];
  filtered.forEach(t => {
    const acc = s.accounts.find(a => a.id == t.accountId);
    const row = [
      t.date ? t.date.split('T')[0] : '',
      t.type || '',
      t.amount != null ? t.amount : '',
      t.currency || '',
      acc ? acc.name : '',
      t.description || '',
      t.category || '',
      (t.tags || []).join(';'),
      t.notes || '',
      t.conversionRate || '',
      t.id || '',
    ];
    lines.push(row.map(esc).join(','));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().split('T')[0];
  a.download = `fintrack-transactions-${stamp}.csv`;
  a.click();
  showToast('Transactions exported', 'success');
}

// Opens the New Transaction modal from the All Transactions page, preselecting
// whatever account the list is currently filtered to (if any), so entering a
// transaction while looking at one account's history doesn't force reselecting it.
function openNewTransactionFromList() {
  const filterVal = document.getElementById('tx-account-filter')?.value || '';
  showTransactionModal(null, filterVal || null);
}

// ══════════════════════════════════════════════
//  FUZZY-SEARCH COMBOBOX (accounts / categories)
// ══════════════════════════════════════════════
// Lightweight subsequence-based fuzzy matcher — "chk" matches "Checking",
// "grc" matches "Groceries", etc. Good enough for short account/category lists
// without pulling in a dependency.
function fuzzyMatch(needle, haystack) {
  needle = (needle || '').toLowerCase();
  haystack = (haystack || '').toLowerCase();
  if (!needle) return true;
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}

window._ftComboRegistry = window._ftComboRegistry || {};

function registerCombobox(id, options, onSelect) {
  window._ftComboRegistry[id] = { options, onSelect };
}

function comboboxHTML(id, options, selectedValue, placeholder) {
  const selected = options.find(o => String(o.value) === String(selectedValue));
  registerCombobox(id, options);
  return `
    <div class="ft-combobox">
      <input type="text" id="${id}-search" class="ft-combo-input" autocomplete="off" placeholder="${placeholder || 'Search...'}"
        value="${selected ? escHtml(selected.label) : ''}"
        data-input="filterComboboxOptions('${id}')"
        data-action="showComboboxDropdown('${id}')"
        data-blur="hideComboboxDropdownDelayed('${id}')">
      <input type="hidden" id="${id}" value="${selected ? selected.value : ''}">
      <div class="ft-combo-dropdown" id="${id}-dropdown" style="display:none"></div>
    </div>
  `;
}

function renderComboboxDropdown(id, matches) {
  const dropdown = document.getElementById(id + '-dropdown');
  if (!dropdown) return;
  dropdown.innerHTML = matches.length
    ? matches.map(o => `<div class="ft-combo-option" data-action="chooseComboboxOption('${id}','${String(o.value).replace(/'/g, "\\'")}')">${escHtml(o.label)}</div>`).join('')
    : `<div class="ft-combo-empty">No matches</div>`;
  dropdown.style.display = 'block';
}

function filterComboboxOptions(id) {
  const reg = window._ftComboRegistry[id];
  const input = document.getElementById(id + '-search');
  if (!reg || !input) return;
  const matches = reg.options.filter(o => fuzzyMatch(input.value, o.label)).slice(0, 60);
  renderComboboxDropdown(id, matches);
}

// Opening the dropdown (click/focus) always shows the full option list,
// ignoring whatever text currently sits in the input — e.g. the label of an
// already-selected option. Filtering against that text would only match
// options containing it as a subsequence, which routinely leaves the list
// empty or near-empty. Typing afterward re-filters normally via
// filterComboboxOptions(), which is bound to the input event.
function showComboboxDropdown(id) {
  const reg = window._ftComboRegistry[id];
  if (!reg) return;
  renderComboboxDropdown(id, reg.options.slice(0, 60));
}

function hideComboboxDropdown(id) {
  const dropdown = document.getElementById(id + '-dropdown');
  if (dropdown) dropdown.style.display = 'none';
}

// Delayed hide so a click on a dropdown option registers before blur closes it.
function hideComboboxDropdownDelayed(id) {
  setTimeout(function () { hideComboboxDropdown(id); }, 150);
}

function chooseComboboxOption(id, value) {
  const reg = window._ftComboRegistry[id];
  if (!reg) return;
  const opt = reg.options.find(o => String(o.value) === String(value));
  const input = document.getElementById(id + '-search');
  const hidden = document.getElementById(id);
  if (input) input.value = opt ? opt.label : '';
  if (hidden) hidden.value = value;
  hideComboboxDropdown(id);
  if (reg.onSelect) reg.onSelect(value);
}

// ══════════════════════════════════════════════
//  MULTI-SELECT TAG FILTER (All Transactions page)
// ══════════════════════════════════════════════
// A fuzzy-search combo dropdown, same interaction pattern as the
// account/category filters above, except clicking a matching tag adds it to
// the selection instead of replacing it — so more than one tag can be
// filtered on at once (a transaction matches if it has ANY of the selected
// tags). Selected tags show as chips above the search box, each with its
// own × button to remove just that one tag.
window._ftTagFilterRegistry = window._ftTagFilterRegistry || {};

function multiTagFilterHTML(id, allTags, selected) {
  window._ftTagFilterRegistry[id] = { allTags, selected: (selected || []).slice() };
  return `
    <div class="ft-combobox ft-multitag-filter" id="${id}-wrap">
      <div class="ft-multitag-chips" id="${id}-chips">${renderTagFilterChips(id, selected)}</div>
      <input type="text" id="${id}-search" class="ft-combo-input" autocomplete="off" placeholder="Search tags…"
        data-input="filterTagFilterOptions('${id}')"
        data-action="showTagFilterDropdown('${id}')"
        data-blur="hideComboboxDropdownDelayed('${id}')">
      <input type="hidden" id="${id}" value="${(selected || []).join(',')}">
      <div class="ft-combo-dropdown" id="${id}-dropdown" style="display:none"></div>
    </div>
  `;
}

function renderTagFilterChips(id, selected) {
  return (selected && selected.length)
    ? selected.map(t => `
        <span class="ft-tag-chip">
          ${escHtml(t)}
          <button type="button" class="ft-tag-chip-x" data-action="removeTagFilterValue('${id}','${t.replace(/'/g, "\\'")}')" title="Remove ${escHtml(t)}">&times;</button>
        </span>`).join('')
    : `<span class="ft-combo-placeholder">No tags selected</span>`;
}

function renderTagFilterDropdown(id, matches) {
  const reg = window._ftTagFilterRegistry[id];
  const dropdown = document.getElementById(id + '-dropdown');
  if (!dropdown || !reg) return;
  dropdown.innerHTML = matches.length
    ? matches.map(t => {
        const isSelected = reg.selected.includes(t);
        return `<div class="ft-combo-option ft-tag-filter-option${isSelected ? ' selected' : ''}"
          data-action="toggleTagFilterValue('${id}','${t.replace(/'/g, "\\'")}')">
          <span class="ft-tag-filter-check">${isSelected ? '✓' : ''}</span>${escHtml(t)}
        </div>`;
      }).join('')
    : `<div class="ft-combo-empty">No matching tags</div>`;
  dropdown.style.display = 'block';
}

function filterTagFilterOptions(id) {
  const reg = window._ftTagFilterRegistry[id];
  const input = document.getElementById(id + '-search');
  if (!reg || !input) return;
  const matches = reg.allTags.filter(t => fuzzyMatch(input.value, t)).slice(0, 60);
  renderTagFilterDropdown(id, matches);
}

// Opening the dropdown always shows the full tag list — same reasoning as
// showComboboxDropdown() above for the single-select comboboxes.
function showTagFilterDropdown(id) {
  const reg = window._ftTagFilterRegistry[id];
  if (!reg) return;
  renderTagFilterDropdown(id, reg.allTags.slice(0, 60));
}

function applyTagFilterSelection(id) {
  const reg = window._ftTagFilterRegistry[id];
  if (!reg) return;
  const hidden = document.getElementById(id);
  if (hidden) hidden.value = reg.selected.join(',');
  const chips = document.getElementById(id + '-chips');
  if (chips) chips.innerHTML = renderTagFilterChips(id, reg.selected);
}

function toggleTagFilterValue(id, tag) {
  const reg = window._ftTagFilterRegistry[id];
  if (!reg) return;
  const idx = reg.selected.indexOf(tag);
  if (idx === -1) reg.selected.push(tag); else reg.selected.splice(idx, 1);
  applyTagFilterSelection(id);
  // Re-filter (against whatever's still typed in the search box, if
  // anything) so the checkmark updates without closing the dropdown —
  // lets several tags be picked in one go.
  filterTagFilterOptions(id);
  filterTransactions();
}

// Removes a single tag directly from its chip's × button, without needing
// to reopen the dropdown to find and untick it.
function removeTagFilterValue(id, tag) {
  const reg = window._ftTagFilterRegistry[id];
  if (!reg) return;
  reg.selected = reg.selected.filter(t => t !== tag);
  applyTagFilterSelection(id);
  filterTransactions();
}

function setTagFilterSelection(id, tags) {
  const reg = window._ftTagFilterRegistry[id];
  if (!reg) return;
  reg.selected = (tags || []).slice();
  applyTagFilterSelection(id);
}

function getTagFilterSelection(id) {
  const reg = window._ftTagFilterRegistry[id];
  return reg ? reg.selected.slice() : [];
}

// ══════════════════════════════════════════════
//  TAG AUTOSUGGEST (comma-separated tags input)
// ══════════════════════════════════════════════
// Shows suggestions matching whatever the person is currently typing after
// the last comma; clicking a suggestion appends it and re-focuses for the
// next tag. New tags typed here get auto-saved to the tag list on submit
// (existing saveTransaction/saveRecurring logic already does this).
function filterTagSuggestions(inputId) {
  const s = getState();
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(inputId + '-suggest');
  if (!input || !dropdown) return;
  const raw = input.value;
  const parts = raw.split(',');
  const current = parts[parts.length - 1].trim().toLowerCase();
  const already = parts.slice(0, -1).map(t => t.trim().toLowerCase());

  const matches = (s.tags || [])
    .filter(t => !already.includes(t.toLowerCase()))
    .filter(t => current === '' || t.toLowerCase().includes(current))
    .slice(0, 20);

  if (!matches.length || (current === '' && raw !== '')) {
    dropdown.style.display = 'none';
    return;
  }
  dropdown.innerHTML = matches.map(t => `<div class="ft-combo-option" data-action="chooseTagSuggestion('${inputId}','${t.replace(/'/g, "\\'")}')">${escHtml(t)}</div>`).join('');
  dropdown.style.display = 'block';
}

function chooseTagSuggestion(inputId, tag) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const parts = input.value.split(',').map(t => t.trim()).filter(Boolean);
  parts.pop(); // drop the partial fragment being typed
  parts.push(tag);
  input.value = parts.join(', ') + ', ';
  hideTagSuggestDelayed(inputId);
  input.focus();
}

function hideTagSuggestDelayed(inputId) {
  setTimeout(function () {
    const dropdown = document.getElementById(inputId + '-suggest');
    if (dropdown) dropdown.style.display = 'none';
  }, 150);
}

function tagAutosuggestHTML(inputId, value, placeholder) {
  return `
    <div class="ft-combobox">
      <input id="${inputId}" placeholder="${placeholder || 'e.g. food, monthly'}" value="${value || ''}"
        data-input="filterTagSuggestions('${inputId}')"
        data-action="filterTagSuggestions('${inputId}')"
        data-blur="hideTagSuggestDelayed('${inputId}')" autocomplete="off">
      <div class="ft-combo-dropdown" id="${inputId}-suggest" style="display:none"></div>
    </div>
  `;
}

function showTransactionModal(txId, defaultAccountId, readOnly) {
  const s = getState();
  const tx = txId ? s.transactions.find(t => t.id == txId) : null;
  const ro = !!readOnly;
  const dis = ro ? 'disabled' : '';

  // Inactive accounts can't be picked for new/edited transactions — except the
  // transaction's own current account, so existing history still displays correctly.
  const accountOptions = s.accounts
    .filter(a => a.active || (tx && tx.accountId == a.id))
    .map(a => ({
      value: a.id,
      label: `${a.icon || ''} ${a.name} (${a.currency})${!a.active ? ' — inactive' : ''}`,
    }));
  const categoryOptions = s.categories.map(c => ({ value: c.name, label: `${c.icon || ''} ${c.name}` }));

  openModal(ro ? '🧾 Transaction Details' : (tx ? '🧾 Edit Transaction' : '🧾 New Transaction'), `
    <div class="form-grid cols-1">
      <div class="form-grid">
        <div class="form-group">
          <label>Type *</label>
          <select id="tx-type" ${dis}>
            <option value="income" ${tx?.type === 'income' ? 'selected' : ''}>Income</option>
            <option value="expense" ${!tx || tx?.type === 'expense' ? 'selected' : ''}>Expense</option>
          </select>
        </div>
        <div class="form-group">
          <label>Account *</label>
          ${comboboxHTML('tx-account', accountOptions, tx?.accountId || defaultAccountId, 'Search accounts…')}
        </div>
        <div class="form-group">
          <label>Amount *</label>
          <input id="tx-amount" type="number" step="0.01" placeholder="0.00" value="${tx?.amount || ''}" ${dis}>
        </div>
        <div class="form-group">
          <label>Date *</label>
          <input id="tx-date" type="date" value="${tx ? tx.date.split('T')[0] : new Date().toISOString().split('T')[0]}" ${dis}>
        </div>
        <div class="form-group">
          <label>Reminder date <span style="font-weight:400;color:var(--text-3)">(optional)</span></label>
          <input id="tx-reminder" type="date" value="${tx?.reminderDate ? tx.reminderDate.split('T')[0] : ''}" ${dis}>
          <span style="font-size:11.5px;color:var(--text-3)">Get a Nextcloud alert on this date — e.g. a repayment due, upcoming bill, or recharge.</span>
        </div>
        <div class="form-group" id="tx-convrate-wrap" style="display:none">
          <label id="tx-convrate-label">Conversion Rate</label>
          <div style="display:flex;gap:6px">
            <input id="tx-convrate" type="number" step="0.00000001" min="0" placeholder="e.g. 3.75" value="${tx?.conversionRate || ''}" style="flex:1" ${dis}>
            ${!ro ? `<button type="button" id="tx-convrate-fetch" class="btn btn-secondary btn-sm" data-action="fetchOnlineRate('','','tx-convrate',el)">Fetch online</button>` : ''}
          </div>
          <p id="tx-convrate-updated" style="font-size:11px;color:var(--text-3);margin-top:4px"></p>
        </div>
        <div class="form-group full">
          <label>Description</label>
          <input id="tx-desc" placeholder="What was this for?" value="${tx?.description || ''}" ${dis}>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;justify-content:space-between">
            <span>Category</span>
            ${!ro ? `<a href="#" data-action="toggleTxCategoryQuickAdd()" style="font-size:12px;font-weight:500">+ New category</a>` : ''}
          </label>
          ${comboboxHTML('tx-category', categoryOptions, tx?.category || '', 'Search categories…')}
          <div id="tx-cat-quickadd" style="display:none;margin-top:8px;padding:10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-2)">
            <div class="form-grid" style="gap:8px">
              <input id="tx-cat-quickadd-name" placeholder="Category name" style="grid-column:span 2">
              <select id="tx-cat-quickadd-type">
                <option value="expense" ${(!tx || tx?.type === 'expense') ? 'selected' : ''}>Expense</option>
                <option value="income" ${tx?.type === 'income' ? 'selected' : ''}>Income</option>
              </select>
              <input id="tx-cat-quickadd-icon" placeholder="🎬 (icon)" style="font-size:16px;max-width:70px">
            </div>
            <div style="display:flex;gap:8px;margin-top:8px">
              <button type="button" class="btn btn-secondary btn-sm" data-action="toggleTxCategoryQuickAdd()">Cancel</button>
              <button type="button" class="btn btn-primary btn-sm" data-action="quickAddCategoryFromTx()">Add category</button>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>Tags (comma-separated)</label>
          ${ro
            ? `<input id="tx-tags" value="${escHtml((tx?.tags || []).join(', '))}" disabled>`
            : tagAutosuggestHTML('tx-tags', (tx?.tags || []).join(', '))}
        </div>
        <div class="form-group full">
          <label>Notes</label>
          <textarea id="tx-notes" placeholder="Additional notes..." ${dis}>${escHtml(tx?.notes || '')}</textarea>
        </div>
      </div>
      <div class="form-actions">
        ${ro
          ? `<button class="btn btn-secondary" data-action="closeModal()">Close</button>
             <button class="btn btn-primary" data-action="showTransactionModal('${txId}')">Edit</button>`
          : `<button class="btn btn-secondary" data-action="closeModal()">Cancel</button>
             <button class="btn btn-primary" data-action="saveTransaction('${txId || ''}')">${tx ? 'Save Changes' : 'Add Transaction'}</button>`}
      </div>
    </div>
  `);
  // Wire the account combobox's onSelect to refresh the conversion-rate field.
  if (window._ftComboRegistry['tx-account']) {
    window._ftComboRegistry['tx-account'].onSelect = function () { updateTxConversionRateField(tx); };
  }
  updateTxConversionRateField(tx);
}

/**
 * Show/hide and label the "Conversion Rate" field on the transaction form
 * based on whether the selected account's currency differs from the base
 * currency. When shown, prefill it with:
 *   1. the transaction's own previously-saved rate (when editing), else
 *   2. the currency's current rate on file (a sensible starting point).
 * Nothing here forces a value — the person can always type a different
 * rate that reflects what applied on the transaction's actual date.
 */
// Reads the last successfully online-fetched rate for a currency pair,
// saved per-pair by fetchOnlineRate()/CurrenciesController — this is the
// same settings blob already loaded on boot, so it's a free in-memory lookup.
function getLastFetchedRate(from, to) {
  const s = getState();
  const val = s.settings && s.settings['fx_last_rate_' + from + '_' + to];
  return val ? parseFloat(val) : null;
}

// Sub-label text shown next to the conversion-rate Fetch button. Returns ''
// when there's no cached fetch yet, so callers can hide the label entirely.
function getLastFetchedRateLabel(from, to) {
  const s = getState();
  const ts = s.settings && s.settings['fx_last_rate_ts_' + from + '_' + to];
  if (!ts) return '';
  const d = new Date(parseFloat(ts) * 1000);
  return `Last updated: ${d.toLocaleString()}`;
}

function updateTxConversionRateField(tx) {
  const s = getState();
  const base = s.baseCurrency;
  const accountId = document.getElementById('tx-account')?.value;
  const acc = s.accounts.find(a => a.id == accountId);
  const wrap = document.getElementById('tx-convrate-wrap');
  const label = document.getElementById('tx-convrate-label');
  const input = document.getElementById('tx-convrate');
  const fetchBtn = document.getElementById('tx-convrate-fetch');
  if (!wrap || !input || !acc) return;

  if (acc.currency === base) {
    wrap.style.display = 'none';
    input.value = '';
    return;
  }

  wrap.style.display = '';
  if (label) label.textContent = `Conversion Rate (1 ${acc.currency} = ? ${base})`;
  if (fetchBtn) fetchBtn.setAttribute('data-action', `fetchOnlineRate('${acc.currency}','${base}','tx-convrate',el)`);
  if (!input.value) {
    const existingRate = (tx && tx.currency === acc.currency && tx.conversionRate)
      ? tx.conversionRate
      : (getLastFetchedRate(acc.currency, base) || getRate(acc.currency, base));
    input.value = existingRate || '';
  }
  const updatedEl = document.getElementById('tx-convrate-updated');
  if (updatedEl) updatedEl.textContent = getLastFetchedRateLabel(acc.currency, base);
}

function toggleTxCategoryQuickAdd() {
  const panel = document.getElementById('tx-cat-quickadd');
  if (!panel) return;
  const showing = panel.style.display !== 'none';
  panel.style.display = showing ? 'none' : 'block';
  if (!showing) {
    const nameInput = document.getElementById('tx-cat-quickadd-name');
    if (nameInput) nameInput.focus();
  }
}

function quickAddCategoryFromTx() {
  if (typeof window._ftQuickAddCategoryFromTx === 'function') { window._ftQuickAddCategoryFromTx(); return; }

  // Standalone fallback — no server round-trip, just push into local state.
  const state = getState();
  const name = document.getElementById('tx-cat-quickadd-name').value.trim();
  if (!name) { showToast('Category name required', 'error'); return; }
  const cat = {
    id: generateId('cat'),
    name,
    type: document.getElementById('tx-cat-quickadd-type').value,
    icon: document.getElementById('tx-cat-quickadd-icon').value.trim(),
    color: '#4f8ef7',
  };
  state.categories.push(cat);
  saveState();
  applyNewCategoryToTxForm(cat);
}

/**
 * Shared by both the API-backed (fintrack-main.js) and standalone quick-add
 * paths: append the new category to the transaction modal's dropdown, select
 * it, reset/hide the quick-add panel, and let the person continue filling
 * out the rest of the transaction without losing anything they've entered.
 */
function applyNewCategoryToTxForm(cat) {
  // tx-category is now a fuzzy-search combobox (hidden input + visible search
  // box), not a <select> — add the new category to its registry and select it.
  const reg = window._ftComboRegistry && window._ftComboRegistry['tx-category'];
  const label = (cat.icon ? cat.icon + ' ' : '') + cat.name;
  if (reg) {
    reg.options.push({ value: cat.name, label });
  }
  const hidden = document.getElementById('tx-category');
  const search = document.getElementById('tx-category-search');
  if (hidden) hidden.value = cat.name;
  if (search) search.value = label;
  const nameInput = document.getElementById('tx-cat-quickadd-name');
  if (nameInput) nameInput.value = '';
  const iconInput = document.getElementById('tx-cat-quickadd-icon');
  if (iconInput) iconInput.value = '';
  toggleTxCategoryQuickAdd();
  showToast('Category added', 'success');
}

function saveTransaction(txId) {
  if (typeof window._ftSaveTransaction === 'function') { window._ftSaveTransaction(txId); return; }
  const state = getState();
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const accountId = document.getElementById('tx-account').value;
  if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
  if (!accountId) { showToast('Select an account', 'error'); return; }

  const acc = state.accounts.find(a => a.id == accountId);
  const tagsRaw = document.getElementById('tx-tags').value;
  const tags = tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

  // Save new tags
  tags.forEach(tag => { if (!state.tags.includes(tag)) state.tags.push(tag); });

  // Conversion rate to the base currency — only meaningful when this
  // transaction's currency differs from the base currency. Saving it here
  // also updates the currency's own rate on file, so the two stay in sync.
  let conversionRate = null;
  if (acc.currency !== state.baseCurrency) {
    const rateInput = document.getElementById('tx-convrate');
    const rateVal = rateInput ? parseFloat(rateInput.value) : NaN;
    if (rateVal > 0) {
      conversionRate = rateVal;
      const cur = state.currencies.find(c => c.code === acc.currency);
      if (cur) cur.rate = rateVal;
    }
  }

  const data = {
    type: document.getElementById('tx-type').value,
    accountId,
    amount,
    currency: acc.currency,
    conversionRate,
    description: document.getElementById('tx-desc').value.trim(),
    category: document.getElementById('tx-category').value,
    tags,
    notes: document.getElementById('tx-notes').value.trim(),
    date: new Date(document.getElementById('tx-date').value).toISOString(),
  };

  if (txId) {
    const tx = state.transactions.find(t => t.id == txId);
    if (tx) Object.assign(tx, data);
    showToast('Transaction updated', 'success');
  } else {
    state.transactions.push({ id: generateId('tx'), ...data, created: new Date().toISOString() });
    showToast('Transaction added', 'success');
  }

  saveState();
  closeModal();
  refreshCurrentPage();
}

function deleteTransaction(txId) {
  const s = getState();
  const tx = s.transactions.find(t => t.id == txId);
  const label = tx
    ? `${tx.type === 'income' ? '+' : '-'}${formatCurrency(tx.amount, tx.currency)} — ${tx.description || tx.category || 'transaction'}`
    : 'this transaction';
  confirmDangerousAction({
    title: '🗑️ Delete Transaction',
    message: `Delete <strong>${escHtml(label)}</strong>? It'll move to Recently Deleted in Settings → Data Management, where you can restore it.`,
    confirmLabel: 'Delete',
    countdownSeconds: 0,
    onConfirm: function () { performDeleteTransaction(txId); },
  });
}

function performDeleteTransaction(txId) {
  if (typeof window._ftDeleteTransaction === 'function') { window._ftDeleteTransaction(txId); return; }
  // Standalone/demo mirror of the server's soft-delete: move the
  // transaction into a capped local trash list instead of dropping it,
  // so the recycle bin has something to show in this mode too.
  const state = getState();
  const idx = state.transactions.findIndex(t => t.id == txId);
  if (idx === -1) return;
  const [removed] = state.transactions.splice(idx, 1);
  removed.deletedAt = Date.now();
  state.trashedTransactions = state.trashedTransactions || [];
  state.trashedTransactions.unshift(removed);
  if (state.trashedTransactions.length > 100) state.trashedTransactions.length = 100;
  saveState();
  showToast('Transaction deleted', 'success');
  refreshCurrentPage();
}

// ── Recently Deleted (transactions recycle bin) ──
//
// Backed by the server's soft-delete (TransactionService::delete() sets
// deleted_at instead of removing the row, capped at the last 100 — see
// findTrash()/restore()/permanentlyDelete()/emptyTrash()). In standalone
// mode, mirrored locally via state.trashedTransactions (see
// performDeleteTransaction() above).
window.showTrashModal = function () {
  const open = async function () {
    openModal('🗑️ Recently Deleted', '<div id="ft-trash-modal-body" style="min-height:60px;color:var(--text-2);font-size:13px">Loading…</div>');
    await renderTrashModalBody();
  };
  // Gated by its own Protected Actions checkbox (Settings → Pin Lock) —
  // Recently Deleted can contain the same sensitive details as the
  // transactions themselves (amounts, descriptions, categories).
  if (!pinProtectionEnabled('pin_protect_trash')) { open(); return; }
  requirePin(open);
};

async function renderTrashModalBody() {
  const container = document.getElementById('ft-trash-modal-body');
  if (!container) return;

  let items = [];
  try {
    items = typeof window._ftGetTrash === 'function'
      ? await window._ftGetTrash()
      : (getState().trashedTransactions || []);
  } catch (e) {
    container.innerHTML = '<p style="color:var(--red)">Could not load recently deleted transactions.</p>';
    return;
  }

  if (!items.length) {
    container.innerHTML = '<p style="color:var(--text-2)">Nothing here right now — deleted transactions show up here for a while before they\'re gone for good.</p>';
    return;
  }

  const rowsHtml = items.map(t => `
    <tr>
      <td class="td-mono">${escHtml(t.date)}</td>
      <td><span class="chip ${t.type === 'income' ? 'green' : 'red'}">${escHtml(t.type)}</span></td>
      <td class="td-mono">${formatCurrency(t.amount, t.currency)}</td>
      <td>${escHtml(t.description || '')}</td>
      <td>${escHtml(t.category || '')}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm" data-action="restoreTrashedTransaction('${t.id}')">Restore</button>
        <button class="btn btn-danger btn-sm" data-action="permanentlyDeleteTrashedTransaction('${t.id}')">Delete Forever</button>
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
      <span style="color:var(--text-2)">${items.length} deleted transaction(s), most recent first</span>
      <button class="btn btn-ghost btn-sm" data-action="emptyTransactionTrash()">Empty Trash</button>
    </div>
    <div class="table-wrap" style="max-height:340px;overflow:auto">
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Description</th><th>Category</th><th></th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

window.restoreTrashedTransaction = async function (id) {
  try {
    if (typeof window._ftRestoreTransaction === 'function') {
      await window._ftRestoreTransaction(id);
    } else {
      const s = getState();
      s.trashedTransactions = s.trashedTransactions || [];
      const idx = s.trashedTransactions.findIndex(t => t.id == id);
      if (idx === -1) return;
      const [restored] = s.trashedTransactions.splice(idx, 1);
      delete restored.deletedAt;
      s.transactions.push(restored);
      saveState();
    }
    showToast('Transaction restored', 'success');
    refreshCurrentPage();
    await renderTrashModalBody();
  } catch (e) {
    showToast(e.message || 'Could not restore transaction', 'error');
  }
};

window.permanentlyDeleteTrashedTransaction = function (id) {
  confirmDangerousAction({
    title: '🗑️ Delete Forever',
    message: 'Permanently delete this transaction? This cannot be undone.',
    confirmLabel: 'Delete Forever',
    countdownSeconds: 0,
    onConfirm: async function () {
      try {
        if (typeof window._ftPermanentlyDeleteTransaction === 'function') {
          await window._ftPermanentlyDeleteTransaction(id);
        } else {
          const s = getState();
          s.trashedTransactions = (s.trashedTransactions || []).filter(t => t.id != id);
          saveState();
        }
        showToast('Transaction permanently deleted', 'success');
      } catch (e) {
        showToast(e.message || 'Could not delete transaction', 'error');
      }
    },
  });
};

window.emptyTransactionTrash = function () {
  confirmDangerousAction({
    title: '🗑️ Empty Trash',
    message: 'Permanently delete all recently-deleted transactions? This cannot be undone.',
    confirmLabel: 'Empty Trash',
    countdownSeconds: 0,
    onConfirm: async function () {
      try {
        if (typeof window._ftEmptyTransactionTrash === 'function') {
          await window._ftEmptyTransactionTrash();
        } else {
          const s = getState();
          s.trashedTransactions = [];
          saveState();
        }
        showToast('Trash emptied', 'success');
      } catch (e) {
        showToast(e.message || 'Could not empty trash', 'error');
      }
    },
  });
};

// ── Transfers ──
function renderTransfersPage() {
  const s = getState();
  const page = document.getElementById('page-transfers');
  const sorted = [...s.transfers].sort((a, b) => new Date(b.date) - new Date(a.date));

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Transfers</div>
        <div class="page-subtitle">Move money between accounts with automatic currency conversion</div>
      </div>
      <button class="btn btn-primary" data-action="showTransferModal()">
        <svg viewBox="0 0 24 24"><path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg>
        New Transfer
      </button>
    </div>

    <div class="content">
      <div class="card">
        ${sorted.length === 0 ? `
          <div class="empty-state">
            <svg viewBox="0 0 24 24"><path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg>
            <div class="empty-title">No transfers yet</div>
            <p>Create a transfer to move money between your accounts.</p>
          </div>
        ` : `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th>From Amount</th>
                  <th>To Amount</th>
                  <th>Rate</th>
                  <th>Description</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${sorted.map(tr => {
                  const from = s.accounts.find(a => a.id == tr.fromAccountId);
                  const to = s.accounts.find(a => a.id == tr.toAccountId);
                  return `
                    <tr>
                      <td class="td-muted">${formatDate(tr.date)}</td>
                      <td>${from ? `<span class="chip">${escHtml(from.icon || '')} ${escHtml(from.name)}</span>` : '—'}</td>
                      <td>${to ? `<span class="chip">${escHtml(to.icon || '')} ${escHtml(to.name)}</span>` : '—'}</td>
                      <td class="td-mono td-red">-${formatCurrency(tr.fromAmount, tr.fromCurrency)}</td>
                      <td class="td-mono td-green">+${formatCurrency(tr.toAmount, tr.toCurrency)}</td>
                      <td class="td-mono td-muted">${tr.fromCurrency !== tr.toCurrency ? `1 ${tr.fromCurrency} = ${tr.conversionRate.toFixed(4)} ${tr.toCurrency}` : '—'}</td>
                      <td>${escHtml(tr.description) || '—'}</td>
                      <td>
                        <button class="btn btn-danger btn-icon btn-sm" data-action="deleteTransfer('${tr.id}')">
                          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12z"/></svg>
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </div>
  `;
}

function showTransferModal() {
  const s = getState();
  const accountOptions = s.accounts.map(a => ({
    value: a.id,
    label: `${a.icon || ''} ${a.name} (${a.currency})${!a.active ? ' — inactive' : ''}`,
  }));
  // Both From and To start empty on a new transfer — the person must
  // deliberately pick each account rather than have them pre-filled.
  openModal('🔁 New Transfer', `
    <div class="form-grid cols-1">
      <div class="form-grid">
        <div class="form-group">
          <label>From Account *</label>
          ${comboboxHTML('tr-from', accountOptions, '', 'Search accounts…')}
        </div>
        <div class="form-group">
          <label>To Account *</label>
          ${comboboxHTML('tr-to', accountOptions, '', 'Search accounts…')}
        </div>
        <div class="form-group">
          <label>Amount *</label>
          <input id="tr-amount" type="number" step="0.01" placeholder="0.00" data-input="updateTransferConversion()">
        </div>
        <div class="form-group">
          <label>Date *</label>
          <input id="tr-date" type="date" value="${new Date().toISOString().split('T')[0]}">
        </div>
      </div>
      <div id="tr-conversion-info" class="conversion-info" style="display:none"></div>
      <div class="form-group" id="tr-convrate-wrap" style="display:none">
        <label id="tr-convrate-label">Conversion Rate</label>
        <div style="display:flex;gap:6px">
          <input id="tr-convrate" type="number" step="0.00000001" min="0" placeholder="e.g. 3.75" style="flex:1" data-input="updateTransferConversion()">
          <button type="button" id="tr-convrate-fetch" class="btn btn-secondary btn-sm" data-action="fetchOnlineRate('','','tr-convrate',el)">Fetch online</button>
        </div>
        <p id="tr-convrate-updated" style="font-size:11px;color:var(--text-3);margin-top:4px"></p>
      </div>
      <div class="form-group" id="tr-received-wrap" style="display:none">
        <label id="tr-received-label">Amount Received</label>
        <input id="tr-received" type="number" readonly tabindex="-1" placeholder="0.00">
      </div>
      <div class="form-group">
        <label>Description</label>
        <input id="tr-desc" placeholder="What is this transfer for?">
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-action="closeModal()">Cancel</button>
        <button class="btn btn-primary" data-action="saveTransfer()">Create Transfer</button>
      </div>
    </div>
  `);
  // The from/to fields are fuzzy-search comboboxes now (not plain <select>s),
  // so wire their onSelect callbacks to keep the conversion-rate preview live.
  if (window._ftComboRegistry['tr-from']) window._ftComboRegistry['tr-from'].onSelect = updateTransferConversion;
  if (window._ftComboRegistry['tr-to']) window._ftComboRegistry['tr-to'].onSelect = updateTransferConversion;
  setTimeout(updateTransferConversion, 100);
}

function updateTransferConversion() {
  const fromEl = document.getElementById('tr-from');
  const toEl = document.getElementById('tr-to');
  const amountEl = document.getElementById('tr-amount');
  const infoEl = document.getElementById('tr-conversion-info');
  const rateWrap = document.getElementById('tr-convrate-wrap');
  const rateLabel = document.getElementById('tr-convrate-label');
  const rateInput = document.getElementById('tr-convrate');
  const fetchBtn = document.getElementById('tr-convrate-fetch');
  const receivedWrap = document.getElementById('tr-received-wrap');
  const receivedInput = document.getElementById('tr-received');
  const updatedEl = document.getElementById('tr-convrate-updated');
  if (!fromEl || !toEl || !infoEl) return;

  const s = getState();
  const fromAcc = s.accounts.find(a => a.id == fromEl.value);
  const toAcc = s.accounts.find(a => a.id == toEl.value);
  if (!fromAcc || !toAcc) return;

  const amount = parseFloat(amountEl?.value || 0);
  if (fromAcc.currency !== toAcc.currency) {
    const rate = (rateInput && parseFloat(rateInput.value) > 0) ? parseFloat(rateInput.value) : (getLastFetchedRate(fromAcc.currency, toAcc.currency) || getRate(fromAcc.currency, toAcc.currency));
    const converted = amount * rate;
    infoEl.style.display = 'block';
    infoEl.innerHTML = amount > 0
      ? `${formatCurrency(amount, fromAcc.currency)} → <strong>${formatCurrency(converted, toAcc.currency)}</strong> · Rate: 1 ${fromAcc.currency} = ${rate.toFixed(6)} ${toAcc.currency}`
      : `Different currencies detected · 1 ${fromAcc.currency} = ${rate.toFixed(6)} ${toAcc.currency}`;

    if (rateWrap) rateWrap.style.display = '';
    if (rateLabel) rateLabel.textContent = `Conversion Rate (1 ${fromAcc.currency} = ? ${toAcc.currency})`;
    if (fetchBtn) fetchBtn.setAttribute('data-action', `fetchOnlineRate('${fromAcc.currency}','${toAcc.currency}','tr-convrate',el)`);
    if (rateInput && !rateInput.value) rateInput.value = getLastFetchedRate(fromAcc.currency, toAcc.currency) || getRate(fromAcc.currency, toAcc.currency) || '';
    if (updatedEl) updatedEl.textContent = getLastFetchedRateLabel(fromAcc.currency, toAcc.currency);
    if (receivedWrap) receivedWrap.style.display = '';
    if (receivedInput) receivedInput.value = converted ? converted.toFixed(4) : '';
  } else {
    infoEl.style.display = 'none';
    if (rateWrap) rateWrap.style.display = 'none';
    if (rateInput) rateInput.value = '';
    if (updatedEl) updatedEl.textContent = '';
    if (receivedWrap) receivedWrap.style.display = 'none';
    if (receivedInput) receivedInput.value = '';
  }
}

function saveTransfer() {
  if (typeof window._ftSaveTransfer === 'function') { window._ftSaveTransfer(); return; }
  const state = getState();
  const s = getState();
  const fromId = document.getElementById('tr-from').value;
  const toId = document.getElementById('tr-to').value;
  const amount = parseFloat(document.getElementById('tr-amount').value);
  const date = document.getElementById('tr-date').value;

  if (!fromId) { showToast('Select a From account', 'error'); return; }
  if (!toId) { showToast('Select a To account', 'error'); return; }
  if (fromId === toId) { showToast('Cannot transfer to the same account', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }

  const fromAcc = s.accounts.find(a => a.id == fromId);
  const toAcc = s.accounts.find(a => a.id == toId);
  const rate = getRate(fromAcc.currency, toAcc.currency);
  const toAmount = amount * rate;

  state.transfers.push({
    id: generateId('tr'),
    fromAccountId: fromId,
    toAccountId: toId,
    fromAmount: amount,
    toAmount,
    fromCurrency: fromAcc.currency,
    toCurrency: toAcc.currency,
    conversionRate: rate,
    description: document.getElementById('tr-desc').value.trim(),
    date: new Date(date).toISOString(),
    created: new Date().toISOString(),
  });

  saveState();
  showToast('Transfer created', 'success');
  closeModal();
  renderTransfersPage();
}

function deleteTransfer(trId) {
  if (typeof window._ftDeleteTransfer === 'function') { window._ftDeleteTransfer(trId); return; }
  const state = getState();
  state.transfers = state.transfers.filter(t => t.id != trId);
  saveState();
  showToast('Transfer deleted', 'success');
  renderTransfersPage();
}
// FinTrack — Budgets Module

function renderBudgetsPage() {
  const s = getState();
  const page = document.getElementById('page-budgets');

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Budgets</div>
        <div class="page-subtitle">Set spending limits and track your progress</div>
      </div>
      <button class="btn btn-primary" data-action="showBudgetModal()">
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        New Budget
      </button>
    </div>

    <div class="content">
      ${s.budgets.length === 0 ? `
        <div class="empty-state">
          <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/></svg>
          <div class="empty-title">No budgets yet</div>
          <p>Create budgets to control your spending and reach your financial goals.</p>
          <br>
          <button class="btn btn-primary" data-action="showBudgetModal()">Create Budget</button>
        </div>
      ` : `
        <div class="accounts-grid">
          ${s.budgets.map(b => renderBudgetCard(b)).join('')}
        </div>
      `}
    </div>
  `;
}

function renderBudgetCard(budget) {
  const spent = getCategorySpend(budget.category, budget.period);
  const pct = budget.limit > 0 ? Math.min((spent / budget.limit) * 100, 100) : 0;
  const remaining = budget.limit - spent;
  const isOver = spent > budget.limit;
  const isWarning = pct >= 80;

  return `
    <div class="budget-card" id="ft-budget-card-${budget.id}">
      <div class="budget-header">
        <div>
          <div class="budget-name">${escHtml(budget.name)}</div>
          <div class="budget-period">${escHtml(capitalise(budget.period))} · ${escHtml(budget.category)}</div>
        </div>
        <div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-icon btn-sm" data-action="showBudgetModal('${budget.id}')">
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>
          </button>
          <button class="btn btn-danger btn-icon btn-sm" data-action="deleteBudget('${budget.id}')">
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12z"/></svg>
          </button>
        </div>
      </div>

      <div class="progress-bar">
        <div class="progress-fill ${isOver ? 'danger' : isWarning ? 'warning' : ''}" style="width:${pct}%"></div>
      </div>

      <div class="budget-amounts">
        <span>
          <span class="spent" style="color:${isOver ? 'var(--red)' : 'var(--text)'}">${formatCurrency(spent, budget.currency)}</span>
          <span style="color:var(--text-3)"> spent of </span>
          <span class="limit">${formatCurrency(budget.limit, budget.currency)}</span>
        </span>
        <span style="color:${isOver ? 'var(--red)' : remaining < budget.limit * 0.2 ? 'var(--yellow)' : 'var(--green)'}">
          ${isOver ? `Over by ${formatCurrency(Math.abs(remaining), budget.currency)}` : `${formatCurrency(remaining, budget.currency)} left`}
        </span>
      </div>

      <div style="margin-top:8px;font-size:11.5px;color:var(--text-3)">${pct.toFixed(1)}% used</div>
    </div>
  `;
}

function showBudgetModal(budgetId) {
  const s = getState();
  const b = budgetId ? s.budgets.find(x => x.id == budgetId) : null;

  openModal(b ? '🎯 Edit Budget' : '🎯 New Budget', `
    <div class="form-grid cols-1">
      <div class="form-grid">
        <div class="form-group full">
          <label>Budget Name *</label>
          <input id="b-name" placeholder="e.g. Monthly Groceries" value="${b?.name || ''}">
        </div>
        <div class="form-group">
          <label>Spending Limit *</label>
          <input id="b-limit" type="number" step="0.01" placeholder="0.00" value="${b?.limit || ''}">
        </div>
        <div class="form-group">
          <label>Currency</label>
          <select id="b-currency">
            ${s.currencies.map(c => `<option value="${c.code}" ${(b?.currency || s.baseCurrency) === c.code ? 'selected' : ''}>${c.code}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Period *</label>
          <select id="b-period">
            <option value="weekly" ${b?.period === 'weekly' ? 'selected' : ''}>Weekly</option>
            <option value="monthly" ${!b || b?.period === 'monthly' ? 'selected' : ''}>Monthly</option>
            <option value="quarterly" ${b?.period === 'quarterly' ? 'selected' : ''}>Quarterly</option>
            <option value="yearly" ${b?.period === 'yearly' ? 'selected' : ''}>Yearly</option>
          </select>
        </div>
        <div class="form-group">
          <label>Category</label>
          <select id="b-category">
            <option value="">— Any —</option>
            ${s.categories.map(c => `<option value="${c.name}" ${b?.category === c.name ? 'selected' : ''}>${c.icon || ''} ${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Start Date</label>
          <input id="b-start" type="date" value="${b ? b.startDate?.split('T')[0] : new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="b-active">
            <option value="true" ${!b || b.active ? 'selected' : ''}>Active</option>
            <option value="false" ${b && !b.active ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-action="closeModal()">Cancel</button>
        <button class="btn btn-primary" data-action="saveBudget('${budgetId || ''}')">
          ${b ? 'Save Changes' : 'Create Budget'}
        </button>
      </div>
    </div>
  `);
}

function saveBudget(budgetId) {
  if (typeof window._ftSaveBudget === 'function') { window._ftSaveBudget(budgetId); return; }
  const state = getState();
  const name = document.getElementById('b-name').value.trim();
  const limit = parseFloat(document.getElementById('b-limit').value);
  if (!name) { showToast('Budget name required', 'error'); return; }
  if (!limit || limit <= 0) { showToast('Enter a valid limit', 'error'); return; }

  const data = {
    name,
    limit,
    currency: document.getElementById('b-currency').value,
    period: document.getElementById('b-period').value,
    category: document.getElementById('b-category').value,
    startDate: new Date(document.getElementById('b-start').value).toISOString(),
    active: document.getElementById('b-active').value === 'true',
  };

  if (budgetId) {
    const b = state.budgets.find(x => x.id == budgetId);
    if (b) Object.assign(b, data);
    showToast('Budget updated', 'success');
  } else {
    state.budgets.push({ id: generateId('bud'), ...data, created: new Date().toISOString() });
    showToast('Budget created', 'success');
  }

  saveState();
  closeModal();
  renderBudgetsPage();
}

function deleteBudget(budgetId) {
  if (typeof window._ftDeleteBudget === 'function') { window._ftDeleteBudget(budgetId); return; }
  const state = getState();
  state.budgets = state.budgets.filter(b => b.id != budgetId);
  saveState();
  showToast('Budget deleted', 'success');
  renderBudgetsPage();
}

function capitalise(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }
// FinTrack — Categories & Tags Module

function renderCategoriesPage() {
  const page = document.getElementById('page-categories');

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Categories & Tags</div>
        <div class="page-subtitle">Organise and classify your transactions</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" data-action="showTagModal()">Manage Tags</button>
        <button class="btn btn-primary" data-action="showCategoryModal()">
          <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          New Category
        </button>
      </div>
    </div>

    <div class="filters-bar">
      <input type="text" id="cat-search" placeholder="Search categories & tags…" autocomplete="off"
        data-input="filterCategoriesPage()" style="flex:1;min-width:200px;max-width:360px">
    </div>

    <div class="content" id="categories-content">
      ${renderCategoriesContent()}
    </div>
  `;
}

// Renders just the category groups + tag list — factored out of
// renderCategoriesPage() so the search box can refresh this part only,
// without losing focus on the search input itself.
function renderCategoriesContent() {
  const s = getState();
  const search = (document.getElementById('cat-search')?.value || '').trim();

  const grouped = {
    income: s.categories.filter(c => c.type === 'income' && (!search || fuzzyMatch(search, c.name))),
    expense: s.categories.filter(c => c.type === 'expense' && (!search || fuzzyMatch(search, c.name))),
    transfer: s.categories.filter(c => c.type === 'transfer' && (!search || fuzzyMatch(search, c.name))),
  };
  const filteredTags = s.tags.filter(t => !search || fuzzyMatch(search, t));

  return `
      ${['income', 'expense', 'transfer'].map(type => `
        <div style="margin-bottom:24px">
          <h3 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-3);margin-bottom:12px">${type} Categories</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
            ${grouped[type].map(cat => `
              <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer" data-action="showCategoryTransactions('${cat.name}')" title="View transactions in this category">
                <div style="display:flex;align-items:center;gap:10px">
                  <span style="font-size:20px">${cat.icon || '📂'}</span>
                  <div>
                    <div style="font-size:13.5px;font-weight:500">${escHtml(cat.name)}</div>
                    <div style="font-size:11.5px;color:var(--text-3)">${s.transactions.filter(t => t.category === cat.name).length} txns</div>
                  </div>
                </div>
                <div class="ft-stop-propagation" style="display:flex;gap:4px">
                  <button class="btn btn-ghost btn-icon btn-sm" data-action="showCategoryModal('${cat.id}')">
                    <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>
                  </button>
                  <button class="btn btn-danger btn-icon btn-sm" data-action="deleteCategory('${cat.id}')">
                    <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12z"/></svg>
                  </button>
                </div>
              </div>
            `).join('')}
            ${search && grouped[type].length === 0 ? `<div class="ft-empty-inline">No matches</div>` : ''}
            <button class="btn btn-secondary" style="height:62px;border-style:dashed" data-action="showCategoryModal(null,'${type}')">
              + Add ${type} category
            </button>
          </div>
        </div>
      `).join('')}

      <div class="section-divider"></div>

      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h3 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-3)">Tags</h3>
          <button class="btn btn-secondary btn-sm" data-action="showTagModal()">Manage Tags</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${filteredTags.map(tag => `
            <div style="display:flex;align-items:center;gap:6px;background:var(--bg-2);border:1px solid var(--border);border-radius:20px;padding:5px 12px;cursor:pointer" data-action="showTagTransactions('${tag}')" title="View transactions with this tag">
              <span style="font-size:13px">${escHtml(tag)}</span>
              <button data-action="renameTag('${tag}')" class="ft-stop-propagation" title="Rename tag" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:13px;line-height:1;padding:0">✏️</button>
              <button data-action="deleteTag('${tag}')" class="ft-stop-propagation" title="Delete tag" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:16px;line-height:1;padding:0">&times;</button>
            </div>
          `).join('')}
          ${search && filteredTags.length === 0 ? `<div class="ft-empty-inline">No matches</div>` : ''}
          <button class="btn btn-secondary btn-sm" data-action="showTagModal()">+ Add Tag</button>
        </div>
      </div>
  `;
}

function filterCategoriesPage() {
  const el = document.getElementById('categories-content');
  if (el) el.innerHTML = renderCategoriesContent();
}

function showCategoryModal(catId, defaultType) {
  const s = getState();
  const cat = catId ? s.categories.find(c => c.id == catId) : null;

  openModal(cat ? '🏷️ Edit Category' : '🏷️ New Category', `
    <div class="form-grid cols-1">
      <div class="form-grid">
        <div class="form-group full">
          <label>Name *</label>
          <input id="cat-name" placeholder="e.g. Entertainment" value="${cat?.name || ''}">
        </div>
        <div class="form-group">
          <label>Type *</label>
          <select id="cat-type">
            <option value="income" ${(cat?.type || defaultType) === 'income' ? 'selected' : ''}>Income</option>
            <option value="expense" ${(!cat && !defaultType) || (cat?.type || defaultType) === 'expense' ? 'selected' : ''}>Expense</option>
            <option value="transfer" ${(cat?.type || defaultType) === 'transfer' ? 'selected' : ''}>Transfer</option>
          </select>
        </div>
        <div class="form-group">
          <label>Icon (emoji)</label>
          ${emojiPickerFieldHTML('cat-icon', cat?.icon || '')}
        </div>
        <div class="form-group">
          <label>Color</label>
          <input id="cat-color" type="color" value="${cat?.color || '#4f8ef7'}">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-action="closeModal()">Cancel</button>
        <button class="btn btn-primary" data-action="saveCategory('${catId || ''}')">
          ${cat ? 'Save' : 'Create Category'}
        </button>
      </div>
    </div>
  `);
}

function saveCategory(catId) {
  // In Nextcloud mode, delegate to the API-backed version registered by fintrack-main.js.
  if (typeof window._ftSaveCategory === 'function') { window._ftSaveCategory(catId); return; }

  // Standalone fallback.
  const state = getState();
  const name = document.getElementById('cat-name').value.trim();
  if (!name) { showToast('Category name required', 'error'); return; }

  const data = {
    name,
    type: document.getElementById('cat-type').value,
    icon: document.getElementById('cat-icon').value.trim(),
    color: document.getElementById('cat-color').value,
  };

  if (catId) {
    const cat = state.categories.find(c => c.id == catId);
    if (cat) Object.assign(cat, data);
    showToast('Category updated', 'success');
  } else {
    state.categories.push({ id: generateId('cat'), ...data });
    showToast('Category created', 'success');
  }

  saveState();
  closeModal();
  renderCategoriesPage();
}

function deleteCategory(catId) {
  if (typeof window._ftDeleteCategory === 'function') { window._ftDeleteCategory(catId); return; }
  const state = getState();
  const cat = state.categories.find(c => c.id == catId);
  if (!cat) return;
  const inUse = state.transactions.some(t => t.category === cat.name);
  if (inUse) { showToast('Category is in use by transactions', 'error'); return; }
  state.categories = state.categories.filter(c => c.id != catId);
  saveState();
  showToast('Category deleted', 'success');
  renderCategoriesPage();
}

function showTagModal() {
  const s = getState();
  openModal('🏷️ Manage Tags', `
    <div class="form-grid cols-1">
      <div class="form-group">
        <label>Add New Tag</label>
        <div style="display:flex;gap:8px">
          <input id="new-tag-input" placeholder="Tag name..." style="flex:1">
          <button class="btn btn-primary" data-action="addTag()">Add</button>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px" id="tags-list">
        ${s.tags.map(tagChipHTML).join('')}
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-action="closeModal();renderCategoriesPage()">Done</button>
      </div>
    </div>
  `);
}

function tagChipHTML(tag) {
  return `
    <div style="display:flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border);border-radius:20px;padding:5px 12px">
      <span>${escHtml(tag)}</span>
      <button data-action="renameTag('${tag}')" title="Rename tag"
        style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:13px;line-height:1;padding:0">✏️</button>
      <button data-action="deleteTag('${tag}');renderTagList()" title="Delete tag"
        style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:16px;line-height:1">&times;</button>
    </div>
  `;
}

function addTag() {
  if (typeof window._ftAddTag === 'function') { window._ftAddTag(); return; }
  const state = getState();
  const input = document.getElementById('new-tag-input');
  const tag = input.value.trim().toLowerCase();
  if (!tag) return;
  if (state.tags.includes(tag)) { showToast('Tag already exists', 'error'); return; }
  state.tags.push(tag);
  saveState();
  input.value = '';
  showToast('Tag added', 'success');
  renderTagList();
}

function renderTagList() {
  const state = getState();
  const list = document.getElementById('tags-list');
  if (!list) return;
  list.innerHTML = state.tags.map(tagChipHTML).join('');
}

function deleteTag(tag) {
  if (typeof window._ftDeleteTag === 'function') { window._ftDeleteTag(tag); return; }
  const state = getState();
  const inUse = state.transactions.some(t => (t.tags || []).includes(tag)) ||
                (state.recurring || []).some(r => (r.tags || []).includes(tag));
  if (inUse) { showToast('This tag is used by existing transactions and can\'t be deleted. Rename it instead if needed.', 'error'); return; }
  state.tags = state.tags.filter(t => t !== tag);
  saveState();
  if (!document.getElementById('tags-list')) renderCategoriesPage();
}

// Renames a tag. In Nextcloud mode this delegates to window._ftRenameTag
// (fintrack-main.js), which also cascades the rename to every transaction
// and recurring rule server-side. The standalone fallback below only
// renames the tag in local demo data, since there's no server to cascade to.
function renameTag(oldTag) {
  if (typeof window._ftRenameTag === 'function') { window._ftRenameTag(oldTag); return; }
  const input = window.prompt('Rename tag "' + oldTag + '" to:', oldTag);
  if (input === null) return;
  const newTag = input.trim().toLowerCase();
  if (!newTag || newTag === oldTag) return;
  const state = getState();
  if (state.tags.includes(newTag)) { state.tags = state.tags.filter(t => t !== oldTag); }
  else { state.tags = state.tags.map(t => t === oldTag ? newTag : t); }
  state.transactions.forEach(t => {
    if (Array.isArray(t.tags) && t.tags.includes(oldTag)) {
      t.tags = [...new Set(t.tags.map(tg => tg === oldTag ? newTag : tg))];
    }
  });
  saveState();
  showToast('Tag renamed', 'success');
  renderTagList();
  if (!document.getElementById('tags-list')) renderCategoriesPage();
}
// FinTrack — Reports Module

// Resolve the currently selected report period. Presets are computed relative
// to today; a custom range is persisted verbatim. Stored in settings so the
// choice survives page switches and reloads.
function getReportRange() {
  const s = getState();
  const rr = (s.settings && s.settings.report_range) || {};
  const preset = rr.preset || '6m';

  if (preset === 'custom' && rr.from && rr.to) {
    return { preset, from: new Date(rr.from + 'T00:00:00'), to: new Date(rr.to + 'T23:59:59') };
  }

  const to = new Date();
  const from = new Date();
  if (preset === '3m') from.setMonth(from.getMonth() - 3);
  else if (preset === '1y') from.setFullYear(from.getFullYear() - 1);
  else if (preset === '5y') from.setFullYear(from.getFullYear() - 5);
  else if (preset === '10y') from.setFullYear(from.getFullYear() - 10);
  else from.setMonth(from.getMonth() - 6); // default '6m'

  const knownPresets = ['3m', '6m', '1y', '5y', '10y'];
  return { preset: knownPresets.includes(preset) ? preset : '6m', from, to };
}

function setReportPreset(preset) {
  const s = getState();
  if (!s.settings) s.settings = {};
  s.settings.report_range = { preset };
  saveState();
  renderReportsPage();
}

function setReportCustomRange() {
  const fromVal = document.getElementById('rpt-from-filter')?.value;
  const toVal = document.getElementById('rpt-to-filter')?.value;
  if (!fromVal || !toVal) return;
  if (new Date(fromVal) > new Date(toVal)) { showToast('"From" date must be before "Until" date', 'error'); return; }
  const s = getState();
  if (!s.settings) s.settings = {};
  s.settings.report_range = { preset: 'custom', from: fromVal, to: toVal };
  saveState();
  renderReportsPage();
}

// Full calendar months spanning the selected range (capped at 120 — enough
// for the 10 Years preset — to stay sane for very wide custom ranges) —
// used for the trend chart / monthly table.
function getReportMonths(from, to) {
  const months = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  let guard = 0;
  while (cursor <= end && guard < 120) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth(), label: cursor.toLocaleString('default', { month: 'short', year: '2-digit' }) });
    cursor.setMonth(cursor.getMonth() + 1);
    guard++;
  }
  if (months.length === 0) {
    months.push({ year: to.getFullYear(), month: to.getMonth(), label: to.toLocaleString('default', { month: 'short', year: '2-digit' }) });
  }
  return months;
}

function renderReportsPage() {
  const s = getState();
  const page = document.getElementById('page-reports');

  const range = getReportRange();
  const months = getReportMonths(range.from, range.to);

  const monthlyData = months.map(m => {
    const income = s.transactions
      .filter(t => t.type === 'income' && new Date(t.date).getFullYear() === m.year && new Date(t.date).getMonth() === m.month)
      .reduce((sum, t) => sum + transactionAmountInBase(t), 0);
    const expense = s.transactions
      .filter(t => t.type === 'expense' && new Date(t.date).getFullYear() === m.year && new Date(t.date).getMonth() === m.month)
      .reduce((sum, t) => sum + transactionAmountInBase(t), 0);
    return { ...m, income, expense, net: income - expense };
  });

  // Transactions that actually fall within the exact selected range (used for
  // the period-level stat cards and the category breakdown below).
  const inRange = s.transactions.filter(t => {
    const d = new Date(t.date);
    return d >= range.from && d <= range.to;
  });
  const periodIncome = inRange.filter(t => t.type === 'income')
    .reduce((sum, t) => sum + transactionAmountInBase(t), 0);
  const periodExpense = inRange.filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + transactionAmountInBase(t), 0);
  const periodNet = periodIncome - periodExpense;
  const periodTransfers = s.transfers.filter(t => {
    const d = new Date(t.date);
    return d >= range.from && d <= range.to;
  });

  // Category breakdown across the whole selected period
  const periodExpenses = inRange.filter(t => t.type === 'expense');
  const catBreakdown = {};
  periodExpenses.forEach(t => {
    const key = t.category || 'Uncategorized';
    catBreakdown[key] = (catBreakdown[key] || 0) + transactionAmountInBase(t);
  });
  const catEntries = Object.entries(catBreakdown).sort((a, b) => b[1] - a[1]);
  const totalCatSpend = catEntries.reduce((s, [, v]) => s + v, 0);

  // Account balances
  const assetAccounts = s.accounts.filter(a => a.type === 'asset' && a.active);
  const totalAssets = assetAccounts.reduce((sum, a) => sum + getAccountBalanceInBase(a.id), 0);

  const maxBar = Math.max(...monthlyData.map(m => Math.max(m.income, m.expense)), 1);
  const rangeFromStr = range.from.toISOString().split('T')[0];
  const rangeToStr = range.to.toISOString().split('T')[0];
  const savingsMonths = monthlyData.slice(Math.max(0, monthlyData.length - 3));

  page.innerHTML = `
    <div class="page-header no-print">
      <div>
        <div class="page-title">Reports &amp; Analytics</div>
        <div class="page-subtitle">Visual overview of your financial activity</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" data-action="exportReportPDF()">Export Report</button>
      </div>
    </div>

    <div class="filters-bar no-print" style="align-items:center;flex-wrap:wrap">
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm ${range.preset === '3m' ? 'btn-primary' : 'btn-secondary'}" data-action="setReportPreset('3m')">3 Months</button>
        <button class="btn btn-sm ${range.preset === '6m' ? 'btn-primary' : 'btn-secondary'}" data-action="setReportPreset('6m')">6 Months</button>
        <button class="btn btn-sm ${range.preset === '1y' ? 'btn-primary' : 'btn-secondary'}" data-action="setReportPreset('1y')">1 Year</button>
        <button class="btn btn-sm ${range.preset === '5y' ? 'btn-primary' : 'btn-secondary'}" data-action="setReportPreset('5y')">5 Years</button>
        <button class="btn btn-sm ${range.preset === '10y' ? 'btn-primary' : 'btn-secondary'}" data-action="setReportPreset('10y')">10 Years</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-left:auto">
        <span style="font-size:12px;color:var(--text-3)">Custom range</span>
        <input type="date" id="rpt-from-filter" value="${rangeFromStr}" data-change="setReportCustomRange()">
        <span style="color:var(--text-3);font-size:12px">to</span>
        <input type="date" id="rpt-to-filter" value="${rangeToStr}" data-change="setReportCustomRange()">
      </div>
    </div>

    <div id="ft-report-print-area">
      <div class="ft-print-only-title" style="display:none">
        <h1>FinTrack — Reports &amp; Analytics</h1>
        <p>${months[0]?.label} – ${months[months.length - 1]?.label} · Base currency: ${s.baseCurrency} · Generated ${new Date().toLocaleDateString()}</p>
      </div>

      <div class="stats-strip">
      <div class="stat-card ft-clickable" data-action="ftNavigateTransactions('${rangeFromStr}','${rangeToStr}','income',null,null)" title="View income transactions in this period">
        <div class="stat-label">Period Income</div>
        <div class="stat-value green">${formatCurrency(periodIncome, s.baseCurrency)}</div>
        <div class="stat-sub">${months[0]?.label} – ${months[months.length - 1]?.label}</div>
      </div>
      <div class="stat-card ft-clickable" data-action="ftNavigateTransactions('${rangeFromStr}','${rangeToStr}','expense',null,null)" title="View expense transactions in this period">
        <div class="stat-label">Period Expenses</div>
        <div class="stat-value red">${formatCurrency(periodExpense, s.baseCurrency)}</div>
        <div class="stat-sub">${months[0]?.label} – ${months[months.length - 1]?.label}</div>
      </div>
      <div class="stat-card ft-clickable" data-action="ftNavigateTransactions('${rangeFromStr}','${rangeToStr}',null,null,null)" title="View all transactions in this period">
        <div class="stat-label">Period Net</div>
        <div class="stat-value ${periodNet >= 0 ? 'accent' : 'red'}">${formatCurrency(periodNet, s.baseCurrency)}</div>
        <div class="stat-sub">Income minus expenses</div>
      </div>
      <div class="stat-card ft-clickable" data-action="ftNavigateTransactions('${rangeFromStr}','${rangeToStr}',null,null,null)" title="View all transactions in this period">
        <div class="stat-label">Total Transactions</div>
        <div class="stat-value">${inRange.length}</div>
        <div class="stat-sub">${periodTransfers.length} transfers</div>
      </div>
    </div>

    <div class="content">
      <!-- Income vs Expense Bar Chart -->
      <div class="card" style="margin-bottom:16px">
        ${collapsibleHeaderStart('rpt-incexp', `Income vs Expenses — ${months[0]?.label} to ${months[months.length - 1]?.label}`, true)}
        </div>
        <div class="card-body" id="collapse-body-rpt-incexp" style="${collapsibleBodyStyle('rpt-incexp', true)}">
          <div style="display:flex;align-items:flex-end;gap:12px;height:160px;padding-bottom:28px;position:relative">
            ${monthlyData.map(m => {
              const incH = maxBar > 0 ? (m.income / maxBar) * 130 : 0;
              const expH = maxBar > 0 ? (m.expense / maxBar) * 130 : 0;
              return `
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%;justify-content:flex-end">
                  <div style="display:flex;gap:3px;align-items:flex-end;width:100%;justify-content:center">
                    <div style="width:40%;background:var(--green);opacity:0.8;border-radius:3px 3px 0 0;height:${incH}px;min-height:${m.income > 0 ? 2 : 0}px;transition:height 0.4s ease" title="Income: ${formatCurrency(m.income, s.baseCurrency)}"></div>
                    <div style="width:40%;background:var(--red);opacity:0.8;border-radius:3px 3px 0 0;height:${expH}px;min-height:${m.expense > 0 ? 2 : 0}px;transition:height 0.4s ease" title="Expense: ${formatCurrency(m.expense, s.baseCurrency)}"></div>
                  </div>
                  <div style="font-size:10.5px;color:var(--text-3);text-align:center;position:absolute;bottom:4px">${m.label}</div>
                </div>
              `;
            }).join('')}
          </div>
          <div style="display:flex;gap:16px;margin-top:8px;justify-content:center">
            <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-2)">
              <div style="width:12px;height:12px;background:var(--green);border-radius:2px;opacity:0.8"></div> Income
            </div>
            <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-2)">
              <div style="width:12px;height:12px;background:var(--red);border-radius:2px;opacity:0.8"></div> Expenses
            </div>
          </div>
        </div>
      </div>

      <div class="dash-grid" style="gap:16px">
        <!-- Category Breakdown -->
        <div class="card">
          ${collapsibleHeaderStart('rpt-catbreak', 'Expense Breakdown — Selected Period', true)}
          </div>
          <div class="card-body" id="collapse-body-rpt-catbreak" style="display:flex;flex-direction:column;gap:10px;${collapsibleBodyStyle('rpt-catbreak', true)}">
            ${catEntries.length === 0
              ? `<p style="color:var(--text-3);font-size:13px">No expenses in the selected period.</p>`
              : catEntries.map(([cat, amt]) => {
                  const pct = totalCatSpend > 0 ? (amt / totalCatSpend) * 100 : 0;
                  const catObj = s.categories.find(c => c.name === cat);
                  return `
                    <div class="ft-clickable" data-action="ftNavigateTransactions('${rangeFromStr}','${rangeToStr}','expense',null,'${String(cat).replace(/'/g, "\\'")}')" title="View ${escHtml(cat)} transactions in this period">
                      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                        <span style="font-size:13px">${catObj?.icon || '📂'} ${cat}</span>
                        <span style="font-size:12px;font-family:var(--mono)">
                          ${formatCurrency(amt, s.baseCurrency)}
                          <span style="color:var(--text-3)">(${pct.toFixed(1)}%)</span>
                        </span>
                      </div>
                      <div class="progress-bar">
                        <div class="progress-fill danger" style="width:${pct}%"></div>
                      </div>
                    </div>
                  `;
                }).join('')
            }
          </div>
        </div>

        <!-- Monthly Trend Table -->
        <div class="card">
          ${collapsibleHeaderStart('rpt-monthly', 'Monthly Summary', true)}
          </div>
          <div class="table-wrap" id="collapse-body-rpt-monthly" style="${collapsibleBodyStyle('rpt-monthly', true)}">
            <table>
              <thead>
                <tr><th>Month</th><th>Income</th><th>Expenses</th><th>Net</th></tr>
              </thead>
              <tbody>
                ${[...monthlyData].reverse().map(m => `
                  <tr class="ft-row-clickable" data-action="navigateToTransactionsMonth(${m.year},${m.month})" title="View ${m.label} transactions">
                    <td style="font-weight:500">${m.label}</td>
                    <td class="td-mono td-green">${formatCurrency(m.income, s.baseCurrency)}</td>
                    <td class="td-mono td-red">${formatCurrency(m.expense, s.baseCurrency)}</td>
                    <td class="td-mono ${m.net >= 0 ? 'td-green' : 'td-red'}">${m.net >= 0 ? '+' : ''}${formatCurrency(m.net, s.baseCurrency)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Asset Allocation -->
        <div class="card">
          ${collapsibleHeaderStart('rpt-assetalloc', 'Asset Allocation', true)}
          </div>
          <div class="card-body" id="collapse-body-rpt-assetalloc" style="display:flex;flex-direction:column;gap:10px;${collapsibleBodyStyle('rpt-assetalloc', true)}">
            ${assetAccounts.length === 0
              ? `<p style="color:var(--text-3);font-size:13px">No asset accounts.</p>`
              : assetAccounts.map(acc => {
                  const bal = getAccountBalance(acc.id);
                  const balBase = getAccountBalanceInBase(acc.id);
                  const pct = totalAssets > 0 ? (balBase / totalAssets) * 100 : 0;
                  return `
                    <div class="ft-clickable" data-action="ftNavigateTransactions(null,null,null,'${acc.id}',null)" title="View transactions for ${escHtml(acc.name)}">
                      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                        <span style="font-size:13px">${escHtml(acc.icon || '')} ${escHtml(acc.name)}</span>
                        <span style="font-size:12px;font-family:var(--mono)">
                          ${formatCurrency(bal, acc.currency)}
                          <span style="color:var(--text-3)">(${pct.toFixed(1)}%)</span>
                        </span>
                      </div>
                      <div class="progress-bar">
                        <div class="progress-fill" style="width:${pct}%;background:var(--accent)"></div>
                      </div>
                    </div>
                  `;
                }).join('')
            }
          </div>
        </div>

        <!-- Savings Rate -->
        <div class="card">
          ${collapsibleHeaderStart('rpt-savings', `Savings Rate — Last ${savingsMonths.length} Month${savingsMonths.length === 1 ? '' : 's'}`, true)}
          </div>
          <div class="card-body" id="collapse-body-rpt-savings" style="display:flex;flex-direction:column;gap:14px;${collapsibleBodyStyle('rpt-savings', true)}">
            ${savingsMonths.map(m => {
              const rate = m.income > 0 ? Math.max(0, ((m.income - m.expense) / m.income) * 100) : 0;
              return `
                <div class="ft-clickable" data-action="navigateToTransactionsMonth(${m.year},${m.month})" title="View ${m.label} transactions">
                  <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                    <span style="font-size:13px;font-weight:500">${m.label}</span>
                    <span style="font-size:13px;font-family:var(--mono);color:${rate >= 20 ? 'var(--green)' : rate >= 10 ? 'var(--yellow)' : 'var(--red)'}">
                      ${rate.toFixed(1)}%
                    </span>
                  </div>
                  <div class="progress-bar">
                    <div class="progress-fill ${rate >= 20 ? '' : rate >= 10 ? 'warning' : 'danger'}" style="width:${Math.min(rate, 100)}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
            <p style="font-size:12px;color:var(--text-3)">Healthy savings rate: 20%+</p>
          </div>
        </div>
      </div>
    </div>
    </div>
  `;
}

function exportReportPDF() {
  showToast('Preparing a clean PDF — use Save as PDF in the print dialog', 'success');
  window.print();
}
// FinTrack — Recurring Transactions Module

function renderRecurringPage() {
  const s = getState();
  const page = document.getElementById('page-recurring');

  const recurring = s.recurring || [];

  // Check for due transactions
  const due = recurring.filter(r => r.active && isDue(r));

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Recurring Transactions</div>
        <div class="page-subtitle">Automate repeating income and expense entries</div>
      </div>
      <button class="btn btn-primary" data-action="showRecurringModal()">
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        New Recurring
      </button>
    </div>

    ${due.length > 0 ? `
      <div style="margin:16px 28px 0;background:var(--yellow-dim);border:1px solid rgba(240,192,64,0.3);border-radius:var(--radius);padding:14px 18px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:13.5px;font-weight:600;color:var(--yellow)">⏰ ${due.length} recurring transaction${due.length > 1 ? 's' : ''} due</div>
          <div style="font-size:12.5px;color:var(--text-2);margin-top:2px">These transactions are scheduled and ready to post</div>
        </div>
        <button class="btn btn-primary" data-action="postAllDue()">Post All Due</button>
      </div>
    ` : ''}

    <div class="content">
      ${recurring.length === 0 ? `
        <div class="empty-state">
          <svg viewBox="0 0 24 24"><path d="M12 6v3l4 4-4 4v3c-3.31 0-6-2.69-6-6s2.69-6 6-6m0-2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>
          <div class="empty-title">No recurring transactions</div>
          <p>Set up recurring entries for regular income (salary, rent) or expenses (subscriptions, bills).</p>
          <br>
          <button class="btn btn-primary" data-action="showRecurringModal()">Create Recurring Transaction</button>
        </div>
      ` : `
        <div class="card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Account</th>
                  <th>Amount</th>
                  <th>Frequency</th>
                  <th>Next Due</th>
                  <th>Last Posted</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${recurring.map(r => {
                  const acc = s.accounts.find(a => a.id == r.accountId);
                  const due = isDue(r);
                  return `
                    <tr id="ft-recurring-row-${r.id}">
                      <td style="font-weight:500">${escHtml(r.name)}</td>
                      <td>${acc ? `<span class="chip">${escHtml(acc.icon || '')} ${escHtml(acc.name)}</span>` : '—'}</td>
                      <td class="td-mono ${r.type === 'income' ? 'td-green' : 'td-red'}">
                        ${r.type === 'income' ? '+' : '-'}${formatCurrency(r.amount, r.currency)}
                      </td>
                      <td><span class="chip">${capitalise(r.frequency)}</span></td>
                      <td class="${due ? 'td-green' : 'td-muted'}" style="font-size:12.5px">
                        ${due ? '⏰ Due now' : r.nextDate ? formatDate(r.nextDate) : '—'}
                        ${r.endDate ? `<div style="font-size:11px;color:var(--text-3)">Ends ${formatDate(r.endDate)}</div>` : ''}
                      </td>
                      <td class="td-muted" style="font-size:12.5px">${r.lastPosted ? formatDate(r.lastPosted) : 'Never'}</td>
                      <td>
                        <span class="chip ${r.active ? 'green' : ''}">${r.active ? 'Active' : (isExpired(r) ? 'Expired' : 'Paused')}</span>
                      </td>
                      <td>
                        <div style="display:flex;gap:4px">
                          ${due ? `<button class="btn btn-primary btn-sm" data-action="postRecurring('${r.id}')">Post</button>` : ''}
                          <button class="btn btn-ghost btn-icon btn-sm" data-action="showRecurringModal('${r.id}')">
                            <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>
                          </button>
                          <button class="btn btn-secondary btn-sm" data-action="toggleRecurring('${r.id}')">
                            ${r.active ? 'Pause' : 'Resume'}
                          </button>
                          <button class="btn btn-danger btn-icon btn-sm" data-action="deleteRecurring('${r.id}')">
                            <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12z"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `}
    </div>
  `;
}

function isDue(r) {
  if (!r.active || !r.nextDate) return false;
  if (r.endDate && new Date(r.nextDate) > new Date(r.endDate + 'T23:59:59')) return false;
  return new Date(r.nextDate) <= new Date();
}

// True once a recurring item has run past its own end date — shown as an
// "Expired" badge instead of "Paused" so it's clear *why* it stopped.
function isExpired(r) {
  return !!r.endDate && new Date(r.endDate + 'T23:59:59') < new Date();
}

function getNextDate(frequency, fromDate) {
  const d = new Date(fromDate || new Date());
  switch (frequency) {
    case 'daily':   d.setDate(d.getDate() + 1); break;
    case 'weekly':  d.setDate(d.getDate() + 7); break;
    case 'biweekly':d.setDate(d.getDate() + 14); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly':d.setMonth(d.getMonth() + 3); break;
    case 'yearly':  d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString();
}

function showRecurringModal(recId) {
  const s = getState();
  const rec = recId ? (s.recurring || []).find(r => r.id == recId) : null;
  const accountOptions = s.accounts
    .filter(a => a.active || (rec && rec.accountId == a.id))
    .map(a => ({
      value: a.id,
      label: `${a.icon || ''} ${a.name} (${a.currency})${!a.active ? ' — inactive' : ''}`,
    }));

  openModal(rec ? '⏱️ Edit Recurring Transaction' : '⏱️ New Recurring Transaction', `
    <div class="form-grid cols-1">
      <div class="form-grid">
        <div class="form-group full">
          <label>Name *</label>
          <input id="rec-name" placeholder="e.g. Monthly Salary, Netflix Subscription" value="${rec?.name || ''}">
        </div>
        <div class="form-group">
          <label>Type *</label>
          <select id="rec-type">
            <option value="expense" ${!rec || rec.type === 'expense' ? 'selected' : ''}>Expense</option>
            <option value="income" ${rec?.type === 'income' ? 'selected' : ''}>Income</option>
          </select>
        </div>
        <div class="form-group">
          <label>Account *</label>
          ${comboboxHTML('rec-account', accountOptions, rec?.accountId || '', 'Search accounts…')}
        </div>
        <div class="form-group">
          <label>Amount *</label>
          <input id="rec-amount" type="number" step="0.01" placeholder="0.00" value="${rec?.amount || ''}">
        </div>
        <div class="form-group">
          <label>Frequency *</label>
          <select id="rec-frequency">
            <option value="daily" ${rec?.frequency === 'daily' ? 'selected' : ''}>Daily</option>
            <option value="weekly" ${rec?.frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
            <option value="biweekly" ${rec?.frequency === 'biweekly' ? 'selected' : ''}>Bi-weekly</option>
            <option value="monthly" ${!rec || rec?.frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
            <option value="quarterly" ${rec?.frequency === 'quarterly' ? 'selected' : ''}>Quarterly</option>
            <option value="yearly" ${rec?.frequency === 'yearly' ? 'selected' : ''}>Yearly</option>
          </select>
        </div>
        <div class="form-group">
          <label>Start / Next Date *</label>
          <input id="rec-start" type="date" value="${rec ? rec.nextDate?.split('T')[0] : new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Ends On <span style="font-weight:400;color:var(--text-3)">(optional)</span></label>
          <input id="rec-end" type="date" value="${rec?.endDate || ''}">
          <span style="font-size:11.5px;color:var(--text-3)">Leave blank to repeat indefinitely. After this date it auto-pauses instead of posting.</span>
        </div>
        <div class="form-group">
          <label>Category</label>
          <select id="rec-category">
            <option value="">— None —</option>
            ${s.categories.map(c => `<option value="${c.name}" ${rec?.category === c.name ? 'selected' : ''}>${c.icon || ''} ${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group full">
          <label>Description</label>
          <input id="rec-desc" placeholder="Optional description" value="${rec?.description || ''}">
        </div>
        <div class="form-group">
          <label>Tags (comma-separated)</label>
          ${tagAutosuggestHTML('rec-tags', (rec?.tags || []).join(', '), 'e.g. recurring, bills')}
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="rec-active">
            <option value="true" ${!rec || rec.active ? 'selected' : ''}>Active</option>
            <option value="false" ${rec && !rec.active ? 'selected' : ''}>Paused</option>
          </select>
        </div>
        <div class="form-group">
          <label>Nextcloud alert</label>
          <select id="rec-alert">
            <option value="true" ${!rec || rec.alertEnabled !== false ? 'selected' : ''}>Enabled</option>
            <option value="false" ${rec && rec.alertEnabled === false ? 'selected' : ''}>Disabled</option>
          </select>
          <span style="font-size:11.5px;color:var(--text-3)">Sends an alert to your Nextcloud notifications on each trigger date.</span>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-action="closeModal()">Cancel</button>
        <button class="btn btn-primary" data-action="saveRecurring('${recId || ''}')">
          ${rec ? 'Save Changes' : 'Create Recurring'}
        </button>
      </div>
    </div>
  `);
}

function saveRecurring(recId) {
  if (typeof window._ftSaveRecurring === 'function') { window._ftSaveRecurring(recId); return; }
  const state = getState();
  const name = document.getElementById('rec-name').value.trim();
  const amount = parseFloat(document.getElementById('rec-amount').value);
  if (!name) { showToast('Name required', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }

  const accountId = document.getElementById('rec-account').value;
  const acc = state.accounts.find(a => a.id == accountId);
  const tags = document.getElementById('rec-tags').value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

  const data = {
    name,
    type: document.getElementById('rec-type').value,
    accountId,
    amount,
    currency: acc.currency,
    frequency: document.getElementById('rec-frequency').value,
    nextDate: new Date(document.getElementById('rec-start').value).toISOString(),
    category: document.getElementById('rec-category').value,
    description: document.getElementById('rec-desc').value.trim(),
    tags,
    active: document.getElementById('rec-active').value === 'true',
  };

  if (!state.recurring) state.recurring = [];

  if (recId) {
    const rec = state.recurring.find(r => r.id === recId);
    if (rec) Object.assign(rec, data);
    showToast('Recurring transaction updated', 'success');
  } else {
    state.recurring.push({ id: generateId('rec'), ...data, created: new Date().toISOString() });
    showToast('Recurring transaction created', 'success');
  }

  saveState();
  closeModal();
  renderRecurringPage();
}

function postRecurring(recId) {
  if (typeof window._ftPostRecurring === 'function') { window._ftPostRecurring(recId); return; }
  const state = getState();
  const rec = (state.recurring || []).find(r => r.id === recId);
  if (!rec) return;
  const acc = state.accounts.find(a => a.id == rec.accountId);

  state.transactions.push({
    id: generateId('tx'),
    type: rec.type,
    accountId: rec.accountId,
    amount: rec.amount,
    currency: rec.currency,
    description: rec.description || rec.name,
    category: rec.category,
    tags: [...(rec.tags || []), 'recurring'],
    date: new Date().toISOString(),
    source: 'recurring',
    recurringId: recId,
    created: new Date().toISOString(),
  });

  rec.lastPosted = new Date().toISOString();
  rec.nextDate = getNextDate(rec.frequency, new Date());

  saveState();
  showToast(`Posted: ${rec.name}`, 'success');
  renderRecurringPage();
}

function postAllDue() {
  if (typeof window._ftPostAllDue === 'function') { window._ftPostAllDue(); return; }
  const state = getState();
  const due = (state.recurring || []).filter(r => r.active && isDue(r));
  due.forEach(r => postRecurring(r.id));
  if (due.length > 0) showToast(`Posted ${due.length} recurring transactions`, 'success');
}

function toggleRecurring(recId) {
  if (typeof window._ftToggleRecurring === 'function') { window._ftToggleRecurring(recId); return; }
  const state = getState();
  const rec = (state.recurring || []).find(r => r.id == recId);
  if (rec) { rec.active = !rec.active; saveState(); renderRecurringPage(); }
}

function deleteRecurring(recId) {
  if (typeof window._ftDeleteRecurring === 'function') { window._ftDeleteRecurring(recId); return; }
  const state = getState();
  state.recurring = (state.recurring || []).filter(r => r.id !== recId);
  saveState();
  showToast('Recurring transaction deleted', 'success');
  renderRecurringPage();
}
// FinTrack — Dashboard Module

function renderDashboard() {
  const s = getState();
  const page = document.getElementById('page-dashboard');

  const totalAssets = getTotalByType('asset');
  const totalLiabilities = getTotalByType('liability');
  const netWorth = totalAssets - totalLiabilities;
  const totalRevenue = getTotalByType('revenue');
  const totalExpenses = getTotalByType('expense');
  // getTotalByType('expense') sums balances of expense-type accounts, and
  // getAccountBalance() subtracts each 'expense' transaction from an
  // account's balance — so totalExpenses already comes back as a negative
  // (or zero) number. Adding it back to revenue is what actually performs
  // "revenue minus expenses"; subtracting it here would flip the sign and
  // effectively compute revenue + expenses instead.
  const cashFlow = totalRevenue + totalExpenses;

  const recentTxs = [...s.transactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 8);

  const activeBudgets = s.budgets.filter(b => b.active).slice(0, 4);

  // Top spending categories
  const catSpend = {};
  s.transactions.filter(t => t.type === 'expense').forEach(t => {
    if (t.category) catSpend[t.category] = (catSpend[t.category] || 0) + parseFloat(t.amount);
  });
  const topCategories = Object.entries(catSpend)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const maxCatSpend = topCategories[0]?.[1] || 1;

  // Upcoming recurring transactions — next 3-5 occurrences due in the next
  // 5 days (including anything already overdue, since that's still the
  // very next thing that will post). Only the item's next single
  // occurrence is considered; once posted, its nextDate rolls forward and
  // it drops out of this window until it's due again.
  const upcomingWindowDays = 5;
  const upcomingCutoff = new Date();
  upcomingCutoff.setHours(23, 59, 59, 999);
  upcomingCutoff.setDate(upcomingCutoff.getDate() + upcomingWindowDays);
  const upcomingRecurring = (s.recurring || [])
    .filter(r => r.active && r.nextDate && new Date(r.nextDate) <= upcomingCutoff)
    .sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate))
    .slice(0, 5);

  const relativeDayLabel = (dateStr) => {
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target - today) / 86400000);
    if (diffDays < 0) return { text: `Overdue ${Math.abs(diffDays)}d`, cls: 'red' };
    if (diffDays === 0) return { text: 'Today', cls: 'yellow' };
    if (diffDays === 1) return { text: 'Tomorrow', cls: 'yellow' };
    return { text: `In ${diffDays}d`, cls: 'accent' };
  };

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Dashboard</div>
        <div class="page-subtitle">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" data-action="showTransactionModal()">+ Transaction</button>
        <button class="btn btn-primary" data-action="showTransferModal()">
          <svg viewBox="0 0 24 24"><path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg>
          Transfer
        </button>
      </div>
    </div>

    <div class="stats-strip">
      <div class="stat-card ft-clickable" data-action="navigate('reports')" title="Open Reports">
        <div class="stat-label">Net Worth</div>
        <div class="stat-value ${netWorth >= 0 ? 'accent' : 'red'}">${formatCurrency(netWorth, s.baseCurrency)}</div>
        <div class="stat-sub">Assets minus liabilities</div>
      </div>
      <div class="stat-card ft-clickable" data-action="navigate('asset-accounts')" title="View asset accounts">
        <div class="stat-label">Total Assets</div>
        <div class="stat-value green">${formatCurrency(totalAssets, s.baseCurrency)}</div>
        <div class="stat-sub">${s.accounts.filter(a => a.type === 'asset').length} accounts</div>
      </div>
      <div class="stat-card ft-clickable" data-action="navigate('liability-accounts')" title="View liability accounts">
        <div class="stat-label">Total Liabilities</div>
        <div class="stat-value red">${formatCurrency(totalLiabilities, s.baseCurrency)}</div>
        <div class="stat-sub">${s.accounts.filter(a => a.type === 'liability').length} accounts</div>
      </div>
      <div class="stat-card ft-clickable" data-action="navigateToTransactionsMonth(${new Date().getFullYear()},${new Date().getMonth()})" title="View this month's transactions">
        <div class="stat-label">Cash Flow</div>
        <div class="stat-value ${cashFlow >= 0 ? 'green' : 'red'}">${cashFlow >= 0 ? '+' : ''}${formatCurrency(cashFlow, s.baseCurrency)}</div>
        <div class="stat-sub">Revenue minus expenses</div>
      </div>
    </div>

    <div class="content">
      <div class="dash-grid" style="gap:16px">
        <!-- Recent Transactions -->
        <div class="card">
          ${collapsibleHeaderStart('dash-recent', 'Recent Transactions', true)}
            <button class="btn btn-ghost btn-sm ft-stop-propagation" data-action="navigate('transactions')">View all</button>
          </div>
          <div id="collapse-body-dash-recent" style="${collapsibleBodyStyle('dash-recent', true)}">
          ${recentTxs.length === 0
            ? `<div class="card-body"><p style="color:var(--text-3);font-size:13px">No transactions yet.</p></div>`
            : `<div class="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Description</th><th>Amount</th></tr></thead>
                  <tbody>
                    ${recentTxs.map(t => {
                      const acc = s.accounts.find(a => a.id == t.accountId);
                      return `<tr class="ft-row-clickable" data-action="showTransactionModal('${t.id}', null, true)" title="Click to view details">
                        <td class="td-muted" style="font-size:12px">${formatDate(t.date)}</td>
                        <td>
                          <div style="font-size:13px">${escHtml(t.description || t.category) || '—'}</div>
                          ${acc ? `<div style="font-size:11.5px;color:var(--text-3)">${escHtml(acc.name)}</div>` : ''}
                        </td>
                        <td class="td-mono ${t.type === 'income' ? 'td-green' : 'td-red'}" style="font-size:13px">
                          ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount, t.currency)}
                        </td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>`
          }
          </div>
        </div>

        <!-- Budget Overview -->
        <div class="card">
          ${collapsibleHeaderStart('dash-budget', 'Budget Overview', true)}
            <button class="btn btn-ghost btn-sm ft-stop-propagation" data-action="navigate('budgets')">Manage</button>
          </div>
          <div class="card-body" id="collapse-body-dash-budget" style="display:flex;flex-direction:column;gap:12px;${collapsibleBodyStyle('dash-budget', true)}">
            ${activeBudgets.length === 0
              ? `<p style="color:var(--text-3);font-size:13px">No active budgets.</p>`
              : activeBudgets.map(b => {
                  const spent = getCategorySpend(b.category, b.period);
                  const pct = b.limit > 0 ? Math.min((spent / b.limit) * 100, 100) : 0;
                  const isOver = spent > b.limit;
                  const isWarn = pct >= 80;
                  return `
                    <div class="ft-clickable" data-action="navigateAndHighlight('budgets','ft-budget-card-${b.id}')" title="Click to open this budget">
                      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                        <span style="font-size:13px;font-weight:500">${escHtml(b.name)}</span>
                        <span style="font-size:12px;font-family:var(--mono);color:${isOver ? 'var(--red)' : 'var(--text-2)'}">
                          ${formatCurrency(spent, b.currency)} / ${formatCurrency(b.limit, b.currency)}
                        </span>
                      </div>
                      <div class="progress-bar">
                        <div class="progress-fill ${isOver ? 'danger' : isWarn ? 'warning' : ''}" style="width:${pct}%"></div>
                      </div>
                    </div>
                  `;
                }).join('')
            }
          </div>
        </div>

        <!-- Accounts Summary -->
        <div class="card">
          ${collapsibleHeaderStart('dash-accts', 'Accounts Summary', true)}
          </div>
          <div class="table-wrap" id="collapse-body-dash-accts" style="${collapsibleBodyStyle('dash-accts', true)}">
            <table>
              <thead><tr><th>Account</th><th>Type</th><th>Balance</th></tr></thead>
              <tbody>
                ${s.accounts.filter(a => a.active).map(acc => {
                  const bal = getAccountBalance(acc.id);
                  return `<tr class="ft-row-clickable" data-action="ftNavigateTransactions(null,null,null,'${acc.id}',null)" title="View transactions for this account">
                    <td>
                      <div style="font-size:13px;font-weight:500">${escHtml(acc.icon || '')} ${escHtml(acc.name)}</div>
                      <div style="font-size:11.5px;color:var(--text-3)">${acc.currency}</div>
                    </td>
                    <td><span class="chip">${ACCOUNT_TYPES[acc.type]?.label || acc.type}</span></td>
                    <td class="td-mono" style="font-size:13px">${formatCurrency(bal, acc.currency)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Top Categories -->
        <div class="card">
          ${collapsibleHeaderStart('dash-topcats', 'Top Expense Categories', true)}
          </div>
          <div class="card-body" id="collapse-body-dash-topcats" style="display:flex;flex-direction:column;gap:12px;${collapsibleBodyStyle('dash-topcats', true)}">
            ${topCategories.length === 0
              ? `<p style="color:var(--text-3);font-size:13px">No expense data yet.</p>`
              : topCategories.map(([cat, amt]) => {
                  const pct = (amt / maxCatSpend) * 100;
                  const catObj = s.categories.find(c => c.name === cat);
                  return `
                    <div class="ft-clickable" data-action="ftNavigateTransactions(null,null,'expense',null,'${String(cat).replace(/'/g, "\\'")}')" title="View ${escHtml(cat)} transactions">
                      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                        <span style="font-size:13px">${catObj?.icon || '📂'} ${cat}</span>
                        <span style="font-size:12.5px;font-family:var(--mono);color:var(--red)">${formatCurrency(amt, s.baseCurrency)}</span>
                      </div>
                      <div class="progress-bar">
                        <div class="progress-fill danger" style="width:${pct}%"></div>
                      </div>
                    </div>
                  `;
                }).join('')
            }
          </div>
        </div>

        <!-- Upcoming Recurring -->
        <div class="card">
          ${collapsibleHeaderStart('dash-upcoming', 'Upcoming Recurring', true)}
            <button class="btn btn-ghost btn-sm ft-stop-propagation" data-action="navigate('recurring')">View all</button>
          </div>
          <div class="card-body" id="collapse-body-dash-upcoming" style="display:flex;flex-direction:column;gap:2px;padding-top:4px;${collapsibleBodyStyle('dash-upcoming', true)}">
            <p style="font-size:11.5px;color:var(--text-3);margin:0 0 8px">Next occurrences due in the next ${upcomingWindowDays} days</p>
            ${upcomingRecurring.length === 0
              ? `<p style="color:var(--text-3);font-size:13px">Nothing scheduled in the next ${upcomingWindowDays} days.</p>`
              : upcomingRecurring.map(r => {
                  const acc = s.accounts.find(a => a.id == r.accountId);
                  const label = relativeDayLabel(r.nextDate);
                  return `
                    <div class="ft-clickable" data-action="navigateAndHighlight('recurring','ft-recurring-row-${r.id}')" title="Click to open this recurring transaction" style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
                      <div style="min-width:0">
                        <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r.name)}</div>
                        <div style="font-size:11.5px;color:var(--text-3)">${acc ? escHtml(acc.name) : ''}${acc ? ' · ' : ''}${formatDate(r.nextDate)}</div>
                      </div>
                      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                        <span class="td-mono ${r.type === 'income' ? 'td-green' : 'td-red'}" style="font-size:12.5px">
                          ${r.type === 'income' ? '+' : '-'}${formatCurrency(r.amount, r.currency)}
                        </span>
                        <span class="chip ${label.cls}" style="font-size:11px">${label.text}</span>
                      </div>
                    </div>
                  `;
                }).join('')
            }
          </div>
        </div>
      </div>
    </div>
  `;
}
// FinTrack — Settings Module

// External Access used to be its own page; it now renders as a section
// inside Settings (see renderSettingsPage) so everything account-management
// related lives in one place. Kept as a function returning an HTML string —
// renderSettingsPage() splices it directly into its own template.
function renderExternalAccessSectionHTML() {
  const s = getState();
  const apiKey = s.apiKey || '';
  const formUrl = s.externalFormUrl || '';

  return `
      <!-- External Access (merged: API Token + Progressive Web App) -->
      <div class="card" style="margin-bottom:16px">
        ${collapsibleHeaderStart('set-external', '🔗 External Access - PWA', true)}
        </div>
        <div class="card-body" id="collapse-body-set-external" style="${collapsibleBodyStyle('set-external', true)}">
          <div style="font-size:13.5px;font-weight:600;margin-bottom:10px">🔑 API Token</div>
          <p style="font-size:13px;color:var(--text-2);margin-bottom:12px">
            Use this token to authenticate requests to the FinTrack external API.
            Include it as the <code>X-FinTrack-Token</code> header in every request.
            See the <a href="https://github.com/cloudsliberty/fintrack/blob/main/docs/MANUAL.md" target="_blank" rel="noopener noreferrer">usage manual</a> for details.
          </p>
          <div class="form-group" style="margin-bottom:12px">
            <label>Current Token</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input id="ext-api-key" type="password" value="${escHtml(apiKey)}" readonly
                style="font-family:monospace;font-size:12.5px;flex:1">
              <button class="btn btn-secondary" id="ext-api-key-toggle" data-action="toggleApiKeyVisibility()">Show</button>
              <button class="btn btn-secondary" data-action="copyApiKey()">Copy</button>
            </div>
          </div>
          <div style="font-size:12px;color:var(--text-3);margin-bottom:16px">
            Keep this token secret. Anyone with this token can submit transactions on your behalf.
          </div>
          <button class="btn btn-danger" data-action="regenerateApiKey()">Regenerate Token</button>

          <div class="section-divider"></div>

          <div style="font-size:13.5px;font-weight:600;margin-bottom:10px">📱 Progressive Web App (PWA)</div>
          <div class="form-group" style="margin-bottom:12px;display:flex;align-items:center;gap:10px">
            <label style="margin-bottom:0" for="pwa-enabled-toggle">Enable PWA access</label>
            <input id="pwa-enabled-toggle" type="checkbox" ${s.settings?.pwa_enabled !== '0' ? 'checked' : ''}
              data-change="togglePwaEnabled(el.checked)">
          </div>
          <p style="font-size:11.5px;color:var(--text-3);margin-bottom:12px">
            The PWA requires a PIN Lock. Turning this on without a PIN set will prompt you to create one first.
          </p>
          <div class="form-group" style="margin-bottom:12px">
            <label>PWA URL</label>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <a id="pwa-url-link" href="${escHtml(formUrl)}" target="_blank" rel="noopener noreferrer" style="font-family:monospace;font-size:12px;word-break:break-all">${escHtml(formUrl)}</a>
              <button class="btn btn-secondary" data-action="copyFormUrl()">Copy URL</button>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0;max-width:260px">
            <label>Wipe cached PWA data after inactive for (days)</label>
            <input id="pwa-retention-days" type="number" min="1" max="365"
              value="${escHtml(s.settings?.pwa_data_retention_days || '30')}"
              data-blur="setPwaRetentionDays(el.value)" data-change="setPwaRetentionDays(el.value)">
            <p style="font-size:11px;color:var(--text-3);margin-top:4px">
              If a PWA session doesn't sync for this many days, it logs out and wipes its local cached data on next launch.
            </p>
          </div>

          <div class="section-divider" style="margin:18px 0"></div>

          <div style="font-size:13.5px;font-weight:600;margin-bottom:6px">📲 PWA Sessions</div>
          <p style="font-size:12px;color:var(--text-3);margin-bottom:10px">
            Every browser/device that's logged into the PWA. Revoking one logs it out and wipes its cached data
            the next time it tries to sync.
          </p>
          <div id="pwa-sessions-list" style="font-size:13px;color:var(--text-3)">Not available in demo mode.</div>
        </div>
      </div>
  `;
}

// Whether a specific security-sensitive action currently requires the PIN.
// Always false when no PIN is set at all (nothing to gate against yet).
// Otherwise defaults to protected (true) unless explicitly turned off via
// its checkbox in Settings → Pin Lock → Protected Actions — Import CSV and
// Recently Deleted were unconditionally gated before these per-module
// toggles existed, so defaulting to "on" preserves that for anyone
// upgrading without touching the new checkboxes. Export CSV is new
// protection, also defaulted on per how it was requested.
function pinProtectionEnabled(moduleKey) {
  const s = getState();
  if (!s.lock || !s.lock.enabled) return false;
  return s.settings?.[moduleKey] !== '0';
}

// Protected Actions block — rendered under Pin Lock (see renderSettingsPage)
// rather than inside each individual feature, since it's really a property
// of the Pin Lock feature: none of these take effect until a PIN is set
// above, so they belong grouped with the other lock/authentication controls.
const PIN_PROTECTED_MODULES = [
  { key: 'pin_protect_export_csv', label: 'Exporting transactions to CSV' },
  { key: 'pin_protect_import_csv', label: 'Importing transactions from CSV' },
  { key: 'pin_protect_trash', label: 'Viewing Recently Deleted transactions' },
  { key: 'external_lock_enabled', label: 'The Progressive Web App (PWA)' },
];

function renderExternalLockSecurityHTML() {
  const s = getState();
  const rowsHtml = PIN_PROTECTED_MODULES.map(m => {
    // external_lock_enabled predates this list and defaults OFF (opt-in);
    // the other three were unconditionally on before and default ON
    // (opt-out) — see pinProtectionEnabled() above.
    const checked = m.key === 'external_lock_enabled'
      ? s.settings?.[m.key] === '1'
      : s.settings?.[m.key] !== '0';
    return `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0">
        <input type="checkbox" id="pinmod-${m.key}" ${checked ? 'checked' : ''}
          data-change="togglePinProtectedModule(el, '${m.key}')" style="width:auto;margin-top:2px">
        <label for="pinmod-${m.key}" style="margin:0;font-size:13px;color:var(--text-2);font-weight:400;line-height:1.4">
          ${escHtml(m.label)}
        </label>
      </div>`;
  }).join('');

  return `
    <div class="form-group" style="margin-top:16px">
      <label>Protected Actions</label>
      <p style="font-size:11.5px;color:var(--text-3);margin:-4px 0 8px">
        Only takes effect once a PIN is set above. Uncheck anything you don't want asking for it.
      </p>
      <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius);padding:4px 14px">
        ${rowsHtml}
      </div>
    </div>
  `;
}

// Token stays masked (type="password") until the person explicitly asks to
// see it — a lightweight guard against shoulder-surfing / screen-share leaks.
// Token (and the form URL below, which embeds the same token) stay masked
// by default and require the App Lock PIN to reveal or copy — same
// protection tier as backup export / full reset (see requirePin() in
// fintrack-main.js). Only prompts when a PIN is actually configured;
// otherwise these run immediately, same as before this was added.
// Token (and the form URL below, which embeds the same token) stay masked
// by default and require the App Lock PIN to reveal or copy — same
// protection tier as backup export / full reset (see requirePin() in
// fintrack-main.js). Only prompts when a PIN is actually configured;
// otherwise these run immediately, same as before this was added.
//
// requirePin() itself is normally defined by fintrack-main.js (Nextcloud
// mode, verifies against the server via /lock/verify). In standalone/demo
// mode fintrack-main.js isn't loaded, so define a local fallback here that
// checks the PIN against state.lock instead — otherwise Show/Copy would
// throw in demo mode. Guarded so the NC-mode version always wins if both
// scripts are present.
if (typeof window.requirePin !== 'function') {
  window.requirePin = function (actionFn) {
    const s = getState();
    if (!s.lock || !s.lock.enabled) { actionFn(); return; }
    window._pinGateAction = actionFn;
    openModal('🔐 PIN Required', `
      <div class="form-grid cols-1">
        <p style="font-size:13px;color:var(--text-2)">This action needs your PIN to continue.</p>
        <div class="form-group">
          <input id="pin-gate-input" type="password" placeholder="Enter PIN" autocomplete="off">
        </div>
        <div id="pin-gate-error" style="font-size:12px;color:var(--red);display:none"></div>
        <div class="form-actions">
          <button class="btn btn-secondary" data-action="closeModal()">Cancel</button>
          <button class="btn btn-primary" data-action="submitPinGate()">Confirm</button>
        </div>
      </div>
    `);
    setTimeout(function () {
      const el = document.getElementById('pin-gate-input');
      if (!el) return;
      el.focus();
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitPinGate(); });
    }, 50);
  };

  window.submitPinGate = function () {
    const input = document.getElementById('pin-gate-input');
    const errEl = document.getElementById('pin-gate-error');
    const pw = input ? input.value : '';
    const s = getState();
    if (!pw) return;
    if (pw !== (s.lock && s.lock.pin)) {
      if (errEl) { errEl.textContent = 'Incorrect PIN'; errEl.style.display = 'block'; }
      if (input) { input.value = ''; input.focus(); }
      return;
    }
    const action = window._pinGateAction;
    window._pinGateAction = null;
    closeModal();
    if (action) action();
  };
}

window.toggleApiKeyVisibility = function () {
  const input = document.getElementById('ext-api-key');
  const btn = document.getElementById('ext-api-key-toggle');
  if (!input || !btn) return;
  const revealing = input.type === 'password';
  if (!revealing) { input.type = 'password'; btn.textContent = 'Show'; return; }
  requirePin(function () {
    input.type = 'text';
    btn.textContent = 'Hide';
  });
};

window.copyApiKey = function () {
  requirePin(function () {
    const el = document.getElementById('ext-api-key');
    if (el) { navigator.clipboard.writeText(el.value); showToast('Token copied', 'success'); }
  });
};

// Same masked-by-default treatment as the external API token above.
window.toggleFxApiKeyVisibility = function () {
  const input = document.getElementById('set-fx-apikey');
  const btn = document.getElementById('set-fx-apikey-toggle');
  if (!input || !btn) return;
  const revealing = input.type === 'password';
  input.type = revealing ? 'text' : 'password';
  btn.textContent = revealing ? 'Hide' : 'Show';
};

window.copyFormUrl = function () {
  const el = document.getElementById('pwa-url-link');
  if (el) { navigator.clipboard.writeText(el.href); showToast('URL copied', 'success'); }
};

// Toggling any of the Protected Actions checkboxes saves immediately
// (unlike the main Settings page, which batches changes behind a Save
// button) — these are security-relevant switches, so it shouldn't be
// possible to flip one and accidentally leave without persisting it.
//
// Turning a module's protection OFF is itself gated by the PIN — without
// this, anyone could bypass a module's protection just by unchecking it,
// making the whole feature pointless. Turning protection ON needs no such
// gate (that only makes things more secure, nothing to authenticate
// against). requirePin() itself is a no-op passthrough when no PIN is
// configured, so this has no effect until one is set.
window.togglePinProtectedModule = function (el, settingKey) {
  const checked = !!(el && el.checked);
  if (!checked) {
    if (el) el.checked = true; // hold the visual state until the PIN is confirmed
    requirePin(function () {
      if (el) el.checked = false;
      persistPinProtectedModule(el, settingKey, false);
    });
    return;
  }
  persistPinProtectedModule(el, settingKey, true);
};

function persistPinProtectedModule(el, settingKey, checked) {
  const s = getState();
  if (!s.settings) s.settings = {};
  const prevValue = s.settings[settingKey];
  s.settings[settingKey] = checked ? '1' : '0';

  // In NC mode, window._api is set up by fintrack-main.js and talks to the
  // real /api/settings endpoint; in standalone/demo mode it's absent, so we
  // just fall back to local persistence via saveState().
  // NOTE: must be '1'/'0', not 'true'/'false' — ExternalController::
  // lockStatus()/lockVerify() (and the equivalent PIN-gate checks for the
  // other three modules) all check `=== '1'` / `!== '0'` server- or
  // client-side.
  if (window._api && typeof window._api.post === 'function') {
    const body = {}; body[settingKey] = checked ? '1' : '0';
    window._api.post('/settings', body)
      .then(function () { showToast(checked ? 'PIN required for this' : 'PIN no longer required for this', 'success'); })
      .catch(function () {
        if (el) el.checked = !checked; // revert the checkbox on failure
        s.settings[settingKey] = prevValue;
        showToast('Failed to save — please try again', 'error');
      });
  } else {
    saveState();
    showToast(checked ? 'PIN required for this' : 'PIN no longer required for this', 'success');
  }
}

// Saves the country shared for usage analytics immediately (same
// immediate-save pattern as togglePinProtectedModule above) — this only ever
// affects future telemetry pings, never anything already sent.
window.saveTelemetryCountry = function (el) {
  const country = (el && el.value) || '';
  const s = getState();
  if (!s.settings) s.settings = {};
  const prev = s.settings.telemetry_country || '';
  s.settings.telemetry_country = country;

  if (window._api && typeof window._api.post === 'function') {
    window._api.post('/settings', { telemetry_country: country })
      .then(function () { showToast('Preference saved', 'success'); })
      .catch(function () {
        s.settings.telemetry_country = prev;
        if (el) el.value = prev;
        showToast('Failed to save — please try again', 'error');
      });
  } else {
    saveState();
  }
};

// Controls ONLY whether the country picked below is included in telemetry
// pings — deliberately decoupled from the monthly "enjoying FinTrack?"
// reminder, which now always shows once a month regardless of this setting
// (see checkSpecialNotices() in fintrack-main.js). Saves immediately, same
// as the toggle above.
window.toggleMonthlyTelemetry = function (el) {
  const checked = !!(el && el.checked);
  const s = getState();
  if (!s.settings) s.settings = {};
  s.settings.telemetry_monthly_enabled = checked ? '1' : '0';

  if (window._api && typeof window._api.post === 'function') {
    window._api.post('/settings', { telemetry_monthly_enabled: checked ? '1' : '0' })
      .then(function () { showToast('Preference saved', 'success'); })
      .catch(function () {
        if (el) el.checked = !checked;
        s.settings.telemetry_monthly_enabled = checked ? '0' : '1';
        showToast('Failed to save — please try again', 'error');
      });
  } else {
    saveState();
    showToast('Preference saved', 'success');
  }
};

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSettingsPage() {
  const s = getState();
  const page = document.getElementById('page-settings');

  const txCount = s.transactions.length;
  const accCount = s.accounts.length;
  const dataSize = (JSON.stringify(s).length / 1024).toFixed(1);

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Settings</div>
        <div class="page-subtitle">Application preferences and data management</div>
      </div>
    </div>

    <div class="content">
      <!-- General Settings -->
      <div class="card" style="margin-bottom:16px">
        ${collapsibleHeaderStart('set-general', '⚙️ General Preferences', true)}
        </div>
        <div class="card-body" id="collapse-body-set-general" style="${collapsibleBodyStyle('set-general', true)}">
          <div class="form-grid">
            <div class="form-group">
              <label>Base / Display Currency</label>
              <select id="set-basecur">
                ${s.currencies.map(c => `<option value="${c.code}" ${s.baseCurrency === c.code ? 'selected' : ''}>${c.code} — ${escHtml(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Date Format</label>
              <select id="set-datefmt">
                <option value="MM/DD/YYYY" ${s.settings?.date_format === 'MM/DD/YYYY' ? 'selected' : ''}>MM/DD/YYYY (US)</option>
                <option value="DD/MM/YYYY" ${s.settings?.date_format === 'DD/MM/YYYY' ? 'selected' : ''}>DD/MM/YYYY (EU)</option>
                <option value="YYYY-MM-DD" ${s.settings?.date_format === 'YYYY-MM-DD' ? 'selected' : ''}>YYYY-MM-DD (ISO)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Start of Week</label>
              <select id="set-weekstart">
                <option value="sunday" ${(!s.settings?.week_start || s.settings?.week_start === 'sunday') ? 'selected' : ''}>Sunday</option>
                <option value="monday" ${s.settings?.week_start === 'monday' ? 'selected' : ''}>Monday</option>
              </select>
            </div>
            <div class="form-group">
              <label>Fiscal Year Start Month</label>
              <select id="set-fymonth">
                ${['January','February','March','April','May','June','July','August','September','October','November','December']
                  .map((m, i) => `<option value="${i}" ${String(s.settings?.fy_month ?? 0) === String(i) ? 'selected' : ''}>${m}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Default Transaction Type</label>
              <select id="set-txdefault">
                <option value="expense" ${(!s.settings?.default_tx_type || s.settings?.default_tx_type === 'expense') ? 'selected' : ''}>Expense</option>
                <option value="income" ${s.settings?.default_tx_type === 'income' ? 'selected' : ''}>Income</option>
              </select>
            </div>
            <div class="form-group full">
              <label>Currency Rate API Key (exchangerate.host)</label>
              <div style="display:flex;gap:8px">
                <input id="set-fx-apikey" type="password" autocomplete="off" placeholder="${s.settings?.exchangerate_host_api_key_set === '1' ? 'Key saved — leave blank to keep it' : 'Paste your access key…'}" value="" style="flex:1">
                <button type="button" class="btn btn-secondary" id="set-fx-apikey-toggle" data-action="toggleFxApiKeyVisibility()">Show</button>
                <button type="button" class="btn btn-secondary" id="set-fx-apikey-test" data-action="testFxApiKey()">Test Key</button>
              </div>
              <p id="set-fx-apikey-status" style="font-size:11.5px;margin-top:6px;display:none"></p>
              <p style="font-size:11.5px;color:var(--text-3);margin-top:4px">
                ExchangeRate.host: Used when Frankfurter API rates are unavailable for certain currencies in
                automatic fetching mode. Note: ExchangeRate.host free tier has a 100 requests/month limit.
                Don't have a key yet?
                <a href="https://exchangerate.host/signup" target="_blank" rel="noopener noreferrer">Sign up for a free exchangerate.host API key</a>.
              </p>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" data-action="saveSettings()">Save Preferences</button>
          </div>
        </div>
      </div>

      <!-- Pin Lock -->
      <div class="card" style="margin-bottom:16px">
        ${collapsibleHeaderStart('set-pinlock', '🔒 Pin Lock', true)}
        </div>
        <div class="card-body" id="collapse-body-set-pinlock" style="${collapsibleBodyStyle('set-pinlock', true)}">
          <p style="font-size:13px;color:var(--text-2);margin-bottom:14px">
            An extra PIN layer on top of your Nextcloud login — useful on a shared or family device that stays
            signed in to Nextcloud. After ${s.lock?.timeoutMinutes || 10} minute(s) of inactivity the app re-locks
            automatically, and it locks itself out for 15 minutes after 5 incorrect attempts.
          </p>
          <div class="form-grid">
            <div class="form-group">
              <label>${s.lock?.enabled ? 'Change PIN' : 'Set a PIN'} (min. 4 characters)</label>
              <input id="set-lock-newpin" type="password" placeholder="New PIN" autocomplete="off">
            </div>
            ${s.lock?.enabled ? `
              <div class="form-group">
                <label>Current PIN</label>
                <input id="set-lock-currentpin" type="password" placeholder="Required to change or disable" autocomplete="off">
              </div>
            ` : ''}
            <div class="form-group">
              <label>Auto-lock after (minutes of inactivity)</label>
              <input id="set-lock-timeout" type="number" min="1" max="120" value="${s.lock?.timeoutMinutes || 10}">
            </div>
            <div class="form-group">
              <label>Security Question (optional — helps reset a forgotten PIN)</label>
              <input id="set-lock-reset-question" type="text" placeholder="e.g. What was your first pet's name?" maxlength="200">
            </div>
            <div class="form-group">
              <label>Answer</label>
              <input id="set-lock-reset-answer" type="text" placeholder="Answer" autocomplete="off" maxlength="200">
            </div>
          </div>
          <p style="font-size:11.5px;color:var(--text-3);margin-top:2px">
            Leave the question/answer blank to keep whatever was set before. Setting a new one replaces it.
            The answer is stored hashed, the same way the PIN is — nobody, including us, can read it back.
          </p>
          <div class="form-actions" style="justify-content:${s.lock?.enabled ? 'space-between' : 'flex-end'}">
            ${s.lock?.enabled ? `<button class="btn btn-danger" data-action="disableAppLock()">Disable Pin Lock</button>` : ''}
            <button class="btn btn-primary" data-action="saveAppLock()">${s.lock?.enabled ? 'Update' : 'Enable Pin Lock'}</button>
          </div>

          <div class="section-divider" style="margin:18px 0"></div>

          ${renderExternalLockSecurityHTML()}
        </div>
      </div>

      ${renderExternalAccessSectionHTML()}

      <!-- Data Management (merged: Data Overview, Categories & Tags, Backup/Restore, CSV import, Auto-categorization rules, Danger Zone) -->
      <div class="card" style="margin-bottom:16px">
        ${collapsibleHeaderStart('set-datamgmt', '🗄️ Data Management', true)}
        </div>
        <div class="card-body" id="collapse-body-set-datamgmt" style="${collapsibleBodyStyle('set-datamgmt', true)}">
          <div style="font-size:13.5px;font-weight:600;margin-bottom:10px">📊 Data Overview</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
            ${[
              ['Accounts', accCount],
              ['Transactions', txCount],
              ['Transfers', s.transfers.length],
              ['Budgets', s.budgets.length],
              ['Categories', s.categories.length],
              ['Tags', s.tags.length],
              ['Currencies', s.currencies.length],
              ['Storage Used', `${dataSize} KB`],
            ].map(([label, val]) => `
              <div style="background:var(--bg);border-radius:6px;padding:12px 14px;text-align:center">
                <div style="font-size:20px;font-weight:700;color:var(--accent)">${val}</div>
                <div style="font-size:11.5px;color:var(--text-3);margin-top:2px">${label}</div>
              </div>
            `).join('')}
            <!-- Instance ID: the random per-install identifier saved to the server DB (app config)
                 the very first time FinTrack runs — see Version1005 migration / PageController. -->
            <div style="background:var(--bg);border-radius:6px;padding:12px 14px;text-align:center">
              <div style="font-size:12px;font-weight:700;color:var(--accent);word-break:break-all" class="td-mono">${escHtml(window.FT_INSTANCE_ID || '—')}</div>
              <div style="font-size:11.5px;color:var(--text-3);margin-top:2px">Instance ID</div>
            </div>
          </div>

          <div class="section-divider"></div>

          <div style="font-size:13.5px;font-weight:600;margin-bottom:10px">🏷️ Categories &amp; Tags</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div>
              <div style="font-size:13.5px;font-weight:600;margin-bottom:6px">⬆️ Export</div>
              <p style="font-size:13px;color:var(--text-2);margin-bottom:10px">Download your categories and tags as a JSON file.</p>
              <button class="btn btn-secondary" data-action="exportCategoriesAndTags()">Export Categories &amp; Tags</button>
            </div>
            <div>
              <div style="font-size:13.5px;font-weight:600;margin-bottom:6px">⬇️ Import</div>
              <p style="font-size:13px;color:var(--text-2);margin-bottom:10px">Add categories/tags from a previously exported file. Existing ones are left untouched.</p>
              <label class="btn btn-secondary" style="cursor:pointer">
                Import Categories &amp; Tags
                <input type="file" accept=".json" style="display:none" data-change="importCategoriesAndTags(el)">
              </label>
            </div>
          </div>
          <div class="section-divider"></div>
          <div>
            <div style="font-size:13.5px;font-weight:600;margin-bottom:6px">✨ Starter Set</div>
            <p style="font-size:13px;color:var(--text-2);margin-bottom:10px">Create a set of common categories (Groceries, Rent, Salary, etc.) and tags to get started quickly.</p>
            <button class="btn btn-secondary" data-action="createDefaultCategoriesAndTags()">Create Default Categories &amp; Tags</button>
          </div>

          <div class="section-divider"></div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div>
              <div style="font-size:13.5px;font-weight:600;margin-bottom:6px">💾 Backup Data</div>
              <p style="font-size:13px;color:var(--text-2);margin-bottom:10px">Export all your data as a JSON backup file.</p>
              <button class="btn btn-secondary" data-action="exportJSON()">Download Backup</button>
            </div>
            <div>
              <div style="font-size:13.5px;font-weight:600;margin-bottom:6px">♻️ Restore from Backup</div>
              <p style="font-size:13px;color:var(--text-2);margin-bottom:10px">Restore all data from a previously exported backup.</p>
              <label class="btn btn-secondary" style="cursor:pointer">
                Restore Backup
                <input type="file" accept=".json" style="display:none" data-change="restoreBackup(el)">
              </label>
            </div>
          </div>
          <div class="section-divider"></div>
          <div>
            <div style="font-size:13.5px;font-weight:600;margin-bottom:6px">🗑️ Recently Deleted</div>
            <p style="font-size:13px;color:var(--text-2);margin-bottom:10px">
              Deleted transactions land here first instead of disappearing right away — the last 100, restorable
              any time.
            </p>
            <button class="btn btn-secondary" data-action="showTrashModal()">View Recently Deleted</button>
          </div>
          <div class="section-divider"></div>
          <div>
            <div style="font-size:13.5px;font-weight:600;margin-bottom:6px">🪲 Error Logs</div>
            <p style="font-size:13px;color:var(--text-2);margin-bottom:10px">
              FinTrack keeps the last 100 critical client-side errors on this device, for debugging. Nothing is sent
              anywhere automatically. The file starts with your Nextcloud instance UUID and the FinTrack version.
            </p>
            <button class="btn btn-secondary" data-action="ftDownloadErrorLogs()">Download Logs</button>
          </div>
          <div class="section-divider"></div>
          <div>
            <div style="font-size:13.5px;font-weight:600;margin-bottom:6px">📥 Import Transactions from CSV</div>
            <p style="font-size:13px;color:var(--text-2);margin-bottom:10px">
              Import a batch of transactions from a CSV file into one account. Rows without a category are
              auto-categorized using the rules below, when they match.
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-secondary" data-action="showImportCsvModal()">Import CSV</button>
              <button class="btn btn-ghost" data-action="downloadCsvTemplate()">Download Template</button>
            </div>
          </div>
          <div class="section-divider"></div>
          <div>
            <div style="font-size:13.5px;font-weight:600;margin-bottom:6px">🧠 Auto-Categorization Rules</div>
            <p style="font-size:13px;color:var(--text-2);margin-bottom:10px">
              When a CSV row has no category, its description is checked against these rules from top to bottom —
              the first pattern found inside the description (case-insensitive, anywhere in the text) sets the
              category. Rules are only applied to rows that don't already specify a category.
            </p>
            <div id="category-rules-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
              ${(s.categoryRules || []).length === 0
                ? `<p style="font-size:12.5px;color:var(--text-3)">No rules yet — add one below, e.g. pattern "starbucks" → category "Coffee".</p>`
                : (s.categoryRules || []).map((rule, idx) => `
                    <div style="display:flex;gap:8px;align-items:center">
                      <input placeholder="Pattern (e.g. starbucks)" value="${escHtml(rule.pattern || '')}"
                        style="flex:1" data-change="updateCategoryRuleField(${idx},'pattern',el.value)">
                      <svg viewBox="0 0 24 24" style="width:16px;height:16px;flex-shrink:0;color:var(--text-3)"><path d="M8 5v14l11-7z"/></svg>
                      <input placeholder="Category (e.g. Coffee)" value="${escHtml(rule.category || '')}"
                        style="flex:1" data-change="updateCategoryRuleField(${idx},'category',el.value)">
                      <button class="btn btn-ghost btn-sm" data-action="removeCategoryRuleRow(${idx})" title="Remove rule">✕</button>
                    </div>
                  `).join('')
              }
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-secondary" data-action="addCategoryRuleRow()">+ Add Rule</button>
              <button class="btn btn-primary" data-action="saveCategoryRules()">Save Rules</button>
            </div>
          </div>
          <div class="section-divider"></div>
          <div>
            <div style="font-size:13.5px;font-weight:600;color:var(--red);margin-bottom:6px">Danger Zone</div>
            <p style="font-size:13px;color:var(--text-2);margin-bottom:10px">
              Permanently delete all FinTrack data. This cannot be undone — a backup is saved automatically
              to your Nextcloud Files under <code>/fintrack/backup</code> (or downloaded by your browser if
              that isn't possible) right before deletion.
            </p>
            <button class="btn btn-danger" data-action="confirmReset()">Reset All Data</button>
          </div>
        </div>
      </div>

      <!-- About FinTrack (app info + developer info, merged into one card).
           Deliberately NOT collapsible — always fully visible. -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <div class="card-title">ℹ️ About FinTrack</div>
        </div>
        <div class="card-body" id="collapse-body-set-about">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
            <div style="width:48px;height:48px;background:var(--accent);border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:16px">FT</div>
            <div>
              <div style="font-size:16px;font-weight:700">FinTrack</div>
              <div style="font-size:12.5px;color:var(--text-3)">Personal Finance Manager v${escHtml(window.FT_VERSION || '?')}</div>
            </div>
          </div>
          <div style="font-size:13px;color:var(--text-2);line-height:1.7">
            FinTrack is a full-featured personal finance application with multi-currency support, 
            asset/expense/revenue/liability accounts, budget tracking, recurring transactions, 
            external API access, and comprehensive reporting.
          </div>
          <div style="font-size:13px;color:var(--text-2);line-height:1.7;margin-top:10px;font-weight:600">
            This app is free forever. 🎉
          </div>
          <div style="font-size:13px;color:var(--text-2);line-height:1.7;margin-top:4px">
            Special thanks to my team Niyolice for all the support.
          </div>

          <div class="section-divider" style="margin:18px 0"></div>

          <div style="font-size:13px;font-weight:600;margin-bottom:6px">About the Developer</div>
          <div style="font-size:13px;color:var(--text-2);line-height:1.7">
            This program was designed and developed by Abdul Jaleel Adenpulan, a technology enthusiast from Kondotty, Kerala, India. With a strong passion for coding, automation, and project design, he enjoys creating practical software solutions that simplify daily tasks and improve productivity.
          </div>

          <div style="display:flex;align-items:center;gap:12px;margin-top:16px;flex-wrap:wrap">
            <a href="https://github.com/cloudsliberty/fintrack" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:8px;text-decoration:none">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.93.57.1.79-.25.79-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.69-1.28-1.69-1.04-.72.08-.7.08-.7 1.16.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.56-.29-5.25-1.28-5.25-5.71 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.77.11 3.06.74.8 1.19 1.83 1.19 3.09 0 4.44-2.7 5.42-5.27 5.7.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .3.21.66.8.55A10.53 10.53 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>
              View on GitHub
            </a>
            <a href="https://github.com/cloudsliberty/fintrack/blob/main/docs/MANUAL.md" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:8px;text-decoration:none">
              Read the Manual on GitHub
            </a>
            <a href="https://www.paypal.me/jaleel1618" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;background:#ffc439;color:#111;font-weight:700;font-size:13px;padding:8px 16px;border-radius:var(--ft-radius,6px);text-decoration:none">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="#111"><path d="M7.4 21.6h-3a.5.5 0 0 1-.5-.6l2.8-17.6a.7.7 0 0 1 .7-.6h6.8c3.2 0 5.4 1.5 4.9 4.7-.5 3.6-3 5.2-6.3 5.2H10a.7.7 0 0 0-.7.6l-.9 5.7-1 2.6zm5.6-12.6c1.7 0 2.6-.8 2.8-2.3.2-1.5-.6-2.1-2.2-2.1h-2l-.7 4.4h2.1z"/></svg>
              Donate via PayPal
            </a>
            <a href="https://ko-fi.com/jaleel1618" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;background:#ff5e5b;color:#fff;font-weight:700;font-size:13px;padding:8px 16px;border-radius:var(--ft-radius,6px);text-decoration:none">
              ☕ Donate via Ko-fi
            </a>
          </div>

          <div class="section-divider" style="margin:18px 0"></div>

          <div style="font-size:13px;font-weight:600;margin-bottom:6px">Privacy &amp; Usage Data</div>
          <div style="font-size:12.5px;color:var(--text-2);line-height:1.7">
            FinTrack sends a small usage ping (an HTTP GET request) to the developer from the welcome screen, the
            periodic anniversary check-in, and the monthly donation reminder. It contains a random install ID,
            your Nextcloud version, your FinTrack version, and your country (if you choose to share it) &mdash;
            used only to understand adoption, installation trends, regional usage, and version compatibility.
          </div>
          <div style="font-size:12.5px;color:var(--text-2);line-height:1.7;margin-top:8px">
            FinTrack does not collect, transmit, store, or process any financial data, including account information,
            transaction details, account balances, categories, payees, budgets, or other financial records. The
            setting below controls only whether your country is included in the ping; the ping itself is always sent.
          </div>

          <div class="form-grid" style="margin-top:14px">
            <div class="form-group">
              <label>Country shared for usage analytics</label>
              <select id="set-telemetry-country" data-change="saveTelemetryCountry(el)">
                <option value="">Prefer not to say</option>
                ${(window.FT_COUNTRIES || []).map(c => `<option value="${escHtml(c)}" ${s.settings?.telemetry_country === c ? 'selected' : ''}>${escHtml(c)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="display:flex;align-items:flex-start;gap:10px;background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-top:12px">
            <input type="checkbox" id="set-telemetry-monthly" ${s.settings?.telemetry_monthly_enabled !== '0' ? 'checked' : ''}
              data-change="toggleMonthlyTelemetry(el)" style="width:auto;margin-top:2px">
            <label for="set-telemetry-monthly" style="margin:0;font-size:13px;color:var(--text-2);font-weight:400;line-height:1.5">
              Include my country in the usage ping sent to the developer (the ping itself is always sent).
            </label>
          </div>
        </div>
      </div>

      <!-- Report an issue — sits directly after the About card. -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <div class="card-title">🐞 Report an Issue</div>
        </div>
        <div class="card-body">
          <div style="font-size:13px;color:var(--text-2);line-height:1.7;margin-bottom:12px">
            Found a bug or have a problem? Open an issue on GitHub. Please download the logs file first
            (Settings → Data Management → Error Logs → Download Logs) and attach it to your issue — it
            helps a lot in tracking the problem down.
          </div>
          <a href="https://github.com/cloudsliberty/fintrack/issues/new" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:8px;text-decoration:none">
            🐞 Report an issue — please attach the logs file
          </a>
        </div>
      </div>

    </div>
  `;

  if (typeof window.loadPwaSessionsList === 'function') window.loadPwaSessionsList();
}

function saveSettings() {
  if (typeof window._ftSaveSettings === 'function') { window._ftSaveSettings(); return; }
  const state = getState();
  if (!state.settings) state.settings = {};
  state.settings.date_format = document.getElementById('set-datefmt').value;
  state.settings.week_start = document.getElementById('set-weekstart').value;
  state.settings.fy_month = parseInt(document.getElementById('set-fymonth').value);
  state.settings.default_tx_type = document.getElementById('set-txdefault').value;
  state.baseCurrency = document.getElementById('set-basecur').value;
  saveState();
  showToast('Settings saved', 'success');
}

function restoreBackup(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  requirePin(function () {
    if (typeof window._ftRestoreBackup === 'function') {
      window._ftRestoreBackup(file);
      return;
    }
    const state = getState();
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!imported.accounts || !imported.transactions) {
          showToast('Invalid backup file', 'error'); return;
        }
        Object.assign(state, imported);
        saveState();
        showToast('Backup restored successfully', 'success');
        renderSettingsPage();
        renderDashboard();
      } catch {
        showToast('Failed to restore backup', 'error');
      }
    };
    reader.readAsText(file);
  });
  input.value = '';
}

// ── CSV Import ──

// Holds the parsed rows from the last selected CSV file, keyed nowhere
// persistent — this is just transient state for the open import modal.
let _csvImportRows = [];

const CSV_TEMPLATE_HEADERS = ['date', 'type', 'amount', 'description', 'category', 'tags (separated by ;)', 'notes', 'conversionRate', 'unique-key(for-updating)'];
const CSV_TEMPLATE_ROWS = [
  ['2026-01-05', 'expense', '42.50', 'Grocery shopping', 'Groceries', 'food;weekly', 'Bought vegetables and fruit', '', ''],
  ['2026-01-07', 'income', '1500.00', 'Monthly salary', 'Salary', '', '', '', ''],
  ['2026-01-10', 'expense', '9.99', 'Streaming subscription', 'Entertainment', 'subscriptions', '', '', ''],
  // Demonstrates conversionRate: only needed when the account's currency
  // differs from your base currency. 3.75 here means 1 account-currency
  // unit = 3.75 base-currency units, as of this row's own date — leave
  // blank on rows where the currency's current on-file rate is fine.
  // unique-key(for-updating) is left blank on every template row on
  // purpose — blank always means "create a new transaction". It only gets
  // a value when you export existing transactions (see exportTransactionsCSV()),
  // and re-importing that exported file updates the matching row instead
  // of duplicating it.
  ['2026-01-12', 'expense', '120.00', 'Hotel booking (foreign currency account)', 'Travel', 'trip', '', '3.75', ''],
];

function buildCsvTemplateText() {
  const esc = v => '"' + String(v).replace(/"/g, '""') + '"';
  const lines = [CSV_TEMPLATE_HEADERS.join(',')];
  CSV_TEMPLATE_ROWS.forEach(row => lines.push(row.map(esc).join(',')));
  return lines.join('\n');
}

function downloadCsvTemplate() {
  const blob = new Blob([buildCsvTemplateText()], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'fintrack-import-template.csv';
  a.click();
}

/**
 * Minimal RFC4180-ish CSV parser: handles quoted fields, embedded commas,
 * and escaped quotes ("") inside quoted fields. Good enough for the small,
 * hand-edited or spreadsheet-exported files this feature targets.
 */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\r') {
      // ignore, handled by \n
    } else if (c === '\n') {
      pushRow();
    } else {
      field += c;
    }
  }
  // Final field/row if the file doesn't end with a newline
  if (field.length > 0 || row.length > 0) pushRow();

  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1)
    .filter(r => r.some(cell => cell.trim() !== ''))
    .map(r => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (r[idx] || '').trim(); });
      return obj;
    });
}

// Collapse a header to lowercase alnum-only so 'Conversion rate',
// 'conversion_rate' and 'conversionRate' all compare equal. Mirrors
// TransactionService::normalizeRowKeys() on the PHP side so the preview
// shown here matches what the server will actually do with the file.
function csvNormalizeKey(k) {
  return String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function csvNormalizeRow(row) {
  const out = {};
  Object.keys(row).forEach((k) => { out[csvNormalizeKey(k)] = row[k]; });
  return out;
}

function csvRowValue(normRow, aliases) {
  for (const alias of aliases) {
    const v = normRow[csvNormalizeKey(alias)];
    if (v !== undefined && v !== '') return v;
  }
  return null;
}

// Column definitions the importer understands, in the order shown in the
// preview table. 'aliases' is every header spelling that's accepted for
// that column (matched via csvNormalizeKey, so casing/spacing don't matter).
const CSV_FIELD_DEFS = [
  { key: 'date', label: 'Date', aliases: ['date'], required: true },
  { key: 'type', label: 'Type', aliases: ['type'] },
  { key: 'amount', label: 'Amount', aliases: ['amount'], required: true },
  { key: 'description', label: 'Description', aliases: ['description', 'desc'] },
  { key: 'category', label: 'Category', aliases: ['category'] },
  { key: 'tags', label: 'Tags', aliases: ['tags', 'tag', 'tags (separated by ;)'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note'] },
  {
    key: 'conversionRate', label: 'Conversion Rate',
    aliases: ['conversionrate', 'conversion_rate', 'conversion rate', 'rate',
      'exchangerate', 'exchange rate', 'fxrate', 'fx rate'],
  },
  {
    // Aliases mirror TransactionService::bulkImport()'s rowValue() lookup
    // exactly, so what the preview says will match is what the server
    // will actually match. The value itself is just the transaction's own
    // id — see exportTransactionsCSV(), which writes t.id into this column.
    key: 'importKey', label: 'Unique Key (for updating)',
    aliases: ['unique-key(for-updating)', 'uniquekeyforupdating', 'unique_key', 'uniquekey', 'key'],
  },
];

// Same fingerprint TransactionService::importFingerprint() computes
// server-side (date + type + 2dp amount + normalized description), so the
// preview's duplicate flags match what the server will actually skip.
function csvImportFingerprint(dateRaw, type, amount, description) {
  const ts = Date.parse(dateRaw);
  const day = isNaN(ts) ? '' : new Date(ts).toISOString().slice(0, 10);
  const desc = String(description || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const amt = (Math.round((Number(amount) || 0) * 100) / 100).toFixed(2);
  return day + '|' + String(type || '').toLowerCase() + '|' + amt + '|' + desc;
}

function showImportCsvModal() {
  const s = getState();
  if (s.accounts.length === 0) {
    showToast('Add an account first', 'error');
    return;
  }
  const open = function () {
    _csvImportRows = [];
    const filteredAccountId = getSavedTxFilter('account') || '';
    openModal('📥 Import Transactions from CSV', `
    <div class="form-grid cols-1">
      <div class="form-grid">
        <div class="form-group full">
          <label>Import into Account *</label>
          ${comboboxHTML('csv-import-account',
            s.accounts.map(a => ({ value: a.id, label: `${a.icon || ''} ${a.name} (${a.currency})` })),
            filteredAccountId, 'Search accounts…')}
        </div>
        <div class="form-group full">
          <label>CSV File</label>
          <input type="file" id="csv-import-file" accept=".csv" data-change="handleCsvFileSelect(el)">
        </div>
        <div class="form-group full">
          <p style="font-size:12.5px;color:var(--text-3);line-height:1.6">
            Expected columns: <code>date, type, amount, description, category, tags, notes, conversionRate,
            unique-key(for-updating)</code>.
            <code>type</code> is <code>income</code> or <code>expense</code>; <code>tags</code> are semicolon-separated.
            <code>conversionRate</code> is optional — only needed when this account's currency differs from your
            base currency, and lets each imported row keep the exchange rate that applied on its own date
            (1 account-currency unit = <code>conversionRate</code> base-currency units). Leave it blank to use the
            currency's current rate on file. Header names are matched loosely, so
            <code>Conversion rate</code>, <code>conversion_rate</code> and <code>Rate</code> all work.
            <code>unique-key(for-updating)</code> is also optional — leave it blank to create a new transaction.
            Export your transactions first (Export CSV) to get a file where each row already has its own key
            filled in; re-importing that file <strong>updates</strong> the matching transaction instead of
            duplicating it. <a href="#" data-action="downloadCsvTemplate()">Download a template</a>.
          </p>
        </div>
        <div class="form-group full" id="csv-import-preview" style="font-size:13px;color:var(--text-2)"></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-action="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="csv-import-btn" data-action="importCsvTransactions()" disabled>Import</button>
      </div>
    </div>
  `);
    if (window._ftComboRegistry['csv-import-account']) {
      window._ftComboRegistry['csv-import-account'].onSelect = function () { renderCsvImportPreview(); };
    }
  };
  if (!pinProtectionEnabled('pin_protect_import_csv')) { open(); return; }
  requirePin(open);
}

function handleCsvFileSelect(input) {
  const file = input.files[0];
  const preview = document.getElementById('csv-import-preview');
  const importBtn = document.getElementById('csv-import-btn');
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      _csvImportRows = parseCSV(e.target.result);
      if (_csvImportRows.length === 0) {
        preview.innerHTML = 'No transactions found in this file.';
        importBtn.disabled = true;
        return;
      }
      renderCsvImportPreview();
      importBtn.disabled = false;
    } catch (err) {
      preview.innerHTML = 'Could not read this file — please check it is a valid CSV.';
      importBtn.disabled = true;
    }
  };
  reader.readAsText(file);
}

// Builds the "which column means what" summary plus a per-row preview
// table, run against whichever account is currently selected so duplicate
// detection reflects that account's existing transactions. Re-run whenever
// the file changes or the account dropdown changes.
function renderCsvImportPreview() {
  const preview = document.getElementById('csv-import-preview');
  const accountSel = document.getElementById('csv-import-account');
  if (!preview || _csvImportRows.length === 0) return;
  const accountId = accountSel ? accountSel.value : null;

  // ── Column mapping summary ──
  const fileHeaders = Object.keys(_csvImportRows[0]);
  const normFileHeaders = fileHeaders.map(csvNormalizeKey);
  const mappingHtml = CSV_FIELD_DEFS.map((def) => {
    const idx = def.aliases.map(csvNormalizeKey).findIndex(a => normFileHeaders.includes(a));
    const matchedHeader = idx !== -1 ? def.aliases.map(csvNormalizeKey).find(a => normFileHeaders.includes(a)) : null;
    const originalHeader = matchedHeader !== null
      ? fileHeaders[normFileHeaders.indexOf(matchedHeader)]
      : null;
    let statusHtml;
    if (originalHeader) {
      statusHtml = def.ignored
        ? `<span style="color:var(--text-3)">"${escHtml(originalHeader)}" → ignored</span>`
        : `<span style="color:var(--green)">"${escHtml(originalHeader)}" ✓</span>`;
    } else {
      statusHtml = def.required
        ? `<span style="color:var(--red)">not found (required)</span>`
        : `<span style="color:var(--text-3)">not found</span>`;
    }
    return `<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0">
      <span style="color:var(--text-2)">${escHtml(def.label)}</span>${statusHtml}
    </div>`;
  }).join('');

  const recognizedNorm = CSV_FIELD_DEFS.flatMap(d => d.aliases.map(csvNormalizeKey));
  const unrecognized = fileHeaders.filter(h => !recognizedNorm.includes(csvNormalizeKey(h)));

  // ── Duplicate detection against this account's existing transactions ──
  const state = getState();
  const existingFingerprints = new Set(
    (state.transactions || [])
      .filter(t => String(t.accountId) === String(accountId))
      .map(t => csvImportFingerprint(t.date, t.type, t.amount, t.description))
  );
  const seenInFile = new Set();

  // ── Upsert matching (unique-key(for-updating)) — checked across ALL
  // accounts, same as the server, since a row's key can match a
  // transaction that currently lives on a different account. The value is
  // just each transaction's own id (see exportTransactionsCSV()).
  const importKeyDef = CSV_FIELD_DEFS.find(d => d.key === 'importKey');
  const existingById = new Map(
    (state.transactions || []).map(t => [String(t.id), t])
  );

  let newCount = 0, dupCount = 0, invalidCount = 0, updateCount = 0;
  const rowsHtml = _csvImportRows.map((row, i) => {
    const normRow = csvNormalizeRow(row);
    const date = csvRowValue(normRow, CSV_FIELD_DEFS.find(d => d.key === 'date').aliases) || '';
    const type = (csvRowValue(normRow, CSV_FIELD_DEFS.find(d => d.key === 'type').aliases) || 'expense').toLowerCase();
    const amount = csvRowValue(normRow, CSV_FIELD_DEFS.find(d => d.key === 'amount').aliases);
    const description = csvRowValue(normRow, CSV_FIELD_DEFS.find(d => d.key === 'description').aliases) || '';
    const category = csvRowValue(normRow, CSV_FIELD_DEFS.find(d => d.key === 'category').aliases) || '';
    const rate = csvRowValue(normRow, CSV_FIELD_DEFS.find(d => d.key === 'conversionRate').aliases);
    const importKeyVal = csvRowValue(normRow, importKeyDef.aliases);

    const amountNum = parseFloat(amount);
    const dateValid = date && !isNaN(Date.parse(date));
    let status, rowStyle;
    if (!dateValid || !amountNum || amountNum <= 0) {
      status = 'Invalid'; rowStyle = 'background:rgba(220,60,60,.10)'; invalidCount++;
    } else if (importKeyVal && existingById.has(String(importKeyVal).trim())) {
      // Matches an existing transaction's key — the server will update
      // that row in place, bypassing duplicate detection entirely.
      status = 'Update'; rowStyle = 'background:rgba(79,142,247,.14)'; updateCount++;
    } else {
      const fp = csvImportFingerprint(date, type, amountNum, description);
      if (existingFingerprints.has(fp) || seenInFile.has(fp)) {
        status = 'Duplicate'; rowStyle = 'background:rgba(230,180,20,.16)'; dupCount++;
      } else {
        status = 'New'; rowStyle = ''; newCount++;
      }
      seenInFile.add(fp);
    }

    return `<tr style="${rowStyle}">
      <td class="td-mono">${escHtml(date)}</td>
      <td>${escHtml(type)}</td>
      <td class="td-mono">${escHtml(amount ?? '')}</td>
      <td>${escHtml(description)}</td>
      <td>${escHtml(category)}</td>
      <td class="td-mono">${escHtml(rate ?? '')}</td>
      <td>${status}</td>
    </tr>`;
  });

  const MAX_ROWS_SHOWN = 200;
  const shownRows = rowsHtml.slice(0, MAX_ROWS_SHOWN).join('');
  const moreNote = rowsHtml.length > MAX_ROWS_SHOWN
    ? `<p style="margin-top:4px;color:var(--text-3)">+ ${rowsHtml.length - MAX_ROWS_SHOWN} more row(s) not shown</p>`
    : '';

  preview.innerHTML = `
    <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px">
      <div style="font-weight:600;margin-bottom:4px;color:var(--text-1)">Column mapping</div>
      ${mappingHtml}
      ${unrecognized.length ? `<div style="margin-top:6px;color:var(--text-3)">Unrecognized column(s), ignored: ${unrecognized.map(escHtml).join(', ')}</div>` : ''}
    </div>
    <div style="margin-bottom:6px">
      ${newCount} new · ${updateCount ? `<strong style="color:var(--accent)">${updateCount} update</strong>` : '0 update'} · ${dupCount ? `<strong style="color:var(--yellow)">${dupCount} duplicate</strong>` : '0 duplicate'} (skipped on import) · ${invalidCount ? `<strong style="color:var(--red)">${invalidCount} invalid</strong>` : '0 invalid'}
    </div>
    <div class="table-wrap" style="max-height:280px;overflow:auto;border:1px solid var(--border);border-radius:8px">
      <table>
        <thead><tr>
          <th>Date</th><th>Type</th><th>Amount</th><th>Description</th><th>Category</th><th>Rate</th><th>Status</th>
        </tr></thead>
        <tbody>${shownRows}</tbody>
      </table>
    </div>
    ${moreNote}
  `;
}

function importCsvTransactions() {
  const accountId = document.getElementById('csv-import-account').value;
  if (!accountId) { showToast('Select an account', 'error'); return; }
  if (_csvImportRows.length === 0) { showToast('Choose a CSV file first', 'error'); return; }

  if (typeof window._ftImportCsvTransactions === 'function') {
    window._ftImportCsvTransactions(accountId, _csvImportRows);
    return;
  }

  // Standalone fallback — validate and push rows straight into local state.
  // Mirrors TransactionService::bulkImport()'s structured errors and
  // id-based upsert matching so this mode demoes the same behavior.
  const state = getState();
  const acc = state.accounts.find(a => a.id == accountId);
  const importKeyDef = CSV_FIELD_DEFS.find(d => d.key === 'importKey');
  const existingById = new Map(state.transactions.map(t => [String(t.id), t]));

  let imported = 0;
  let updated = 0;
  const errors = [];

  _csvImportRows.forEach((row, i) => {
    const rowNum = i + 2;
    const normRow = csvNormalizeRow(row);
    const type = (row.type || 'expense').toLowerCase();
    const amount = parseFloat(row.amount);
    if (!amount || amount <= 0) {
      errors.push({ row: rowNum, column: 'amount', message: 'Amount must be greater than zero' });
      return;
    }
    if (!row.date || isNaN(new Date(row.date).getTime())) {
      errors.push({ row: rowNum, column: 'date', message: 'Invalid or missing date' });
      return;
    }

    const currency = acc ? acc.currency : 'USD';
    let conversionRate = null;
    if (currency !== state.baseCurrency) {
      const rowRate = parseFloat(csvRowValue(normRow, CSV_FIELD_DEFS.find(d => d.key === 'conversionRate').aliases));
      if (rowRate > 0) {
        conversionRate = rowRate;
        const cur = state.currencies.find(c => c.code === currency);
        if (cur) cur.rate = rowRate;
      } else {
        // No rate given for this row — fall back to whatever's on file.
        conversionRate = getRate(currency, state.baseCurrency);
      }
    }

    const fields = {
      accountId,
      type: ['income', 'expense'].includes(type) ? type : 'expense',
      amount,
      currency,
      conversionRate,
      description: row.description || '',
      category: row.category || '',
      tags: (csvRowValue(normRow, CSV_FIELD_DEFS.find(d => d.key === 'tags').aliases) || '').split(';').map(t => t.trim().toLowerCase()).filter(Boolean),
      notes: row.notes || '',
      date: new Date(row.date).toISOString(),
    };

    // ── Upsert: does this row's key match an existing transaction's id? ──
    const importKeyVal = csvRowValue(normRow, importKeyDef.aliases);
    const matched = importKeyVal ? existingById.get(String(importKeyVal).trim()) : null;
    if (matched) {
      Object.assign(matched, fields); // id/source/created stay untouched
      updated++;
      return;
    }

    state.transactions.push(Object.assign({}, fields, {
      id: generateId('tx'),
      source: 'import',
      created: new Date().toISOString(),
    }));
    imported++;
  });

  saveState();
  refreshCurrentPage();
  showCsvImportResults({ imported, updated, duplicates: 0, autoCategorized: 0, failed: errors.length, errors });
}

// Renders the post-import summary + detailed row-error breakdown. Accepts
// the same shape TransactionService::bulkImport() returns
// ({imported, updated, duplicates, autoCategorized, failed, errors}),
// where each error is either {row, column, message} (server / this
// fallback) or a plain string (kept for backward compatibility).
function showCsvImportResults(result) {
  const imported = result.imported || 0;
  const updated = result.updated || 0;
  const duplicates = result.duplicates || 0;
  const autoCategorized = result.autoCategorized || 0;
  const errors = result.errors || [];
  const failed = result.failed != null ? result.failed : errors.length;

  const summaryParts = [`<strong>${imported}</strong> imported`];
  if (updated) summaryParts.push(`<strong>${updated}</strong> updated`);
  if (duplicates) summaryParts.push(`<strong>${duplicates}</strong> duplicate(s) skipped`);
  if (autoCategorized) summaryParts.push(`<strong>${autoCategorized}</strong> auto-categorized`);
  if (failed) summaryParts.push(`<strong style="color:var(--red)">${failed}</strong> failed`);

  const errorRowsHtml = errors.map(e => {
    if (typeof e === 'string') {
      return `<div style="padding:6px 0;border-bottom:1px solid var(--border)">${escHtml(e)}</div>`;
    }
    const colLabel = e.column && e.column !== 'general'
      ? ` <span style="color:var(--text-3)">(${escHtml(e.column)})</span>` : '';
    return `<div style="padding:6px 0;border-bottom:1px solid var(--border)">
      <strong>Row ${e.row}</strong>${colLabel}: ${escHtml(e.message)}
    </div>`;
  }).join('');

  openModal('📥 Import Results', `
    <div class="form-grid cols-1">
      <p style="font-size:14px;color:var(--text-2)">${summaryParts.join(' · ')}</p>
      ${errors.length ? `
        <div>
          <div style="font-weight:600;margin-bottom:6px;color:var(--red)">Row errors</div>
          <div style="max-height:280px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:0 10px;font-size:13px">
            ${errorRowsHtml}
          </div>
        </div>
      ` : ''}
      <div class="form-actions">
        <button class="btn btn-primary" data-action="closeModal()">Close</button>
      </div>
    </div>
  `);
}

// ── Auto-Categorization Rules (Settings page) ──
// Edits happen against the in-memory state.categoryRules array as the person
// types/adds/removes rows; nothing is persisted to the server until they
// click "Save Rules". This mirrors the other Settings sections (e.g.
// currency preferences), which all use an explicit Save action rather than
// saving on every keystroke.

function updateCategoryRuleField(idx, field, value) {
  const s = getState();
  if (!s.categoryRules || !s.categoryRules[idx]) return;
  s.categoryRules[idx][field] = value;
}

function addCategoryRuleRow() {
  const s = getState();
  if (!s.categoryRules) s.categoryRules = [];
  s.categoryRules.push({ pattern: '', category: '' });
  renderSettingsPage();
  // Focus the newly-added row's pattern input for a quicker add-many flow.
  setTimeout(() => {
    const inputs = document.querySelectorAll('#category-rules-list input');
    const last = inputs[inputs.length - 2]; // pattern input of the last row
    if (last) last.focus();
  }, 0);
}

function removeCategoryRuleRow(idx) {
  const s = getState();
  if (!s.categoryRules) return;
  s.categoryRules.splice(idx, 1);
  renderSettingsPage();
}

function saveCategoryRules() {
  if (typeof window._ftSaveCategoryRules === 'function') { window._ftSaveCategoryRules(); return; }
  showToast('Category rules saved', 'success');
}

function confirmReset() {
  requirePin(function () {
    openModal('⚠️ Reset All Data', `
      <div style="text-align:center;padding:10px 0">
        <div style="font-size:40px;margin-bottom:12px">⚠️</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:8px">Are you sure?</div>
        <p style="font-size:13.5px;color:var(--text-2);line-height:1.6;margin-bottom:20px">
          This will permanently delete ALL your accounts, transactions, budgets, and settings.<br>
          This action <strong>cannot be undone</strong>.<br><br>
          A backup will be saved automatically to <code>/fintrack/backup</code> in your Nextcloud Files first
          (or downloaded by your browser if that isn't possible).
        </p>
        <div style="display:flex;gap:10px;justify-content:center">
          <button class="btn btn-secondary" data-action="closeModal()">Cancel</button>
          <button class="btn btn-danger" data-action="resetAllData()">Yes, Delete Everything</button>
        </div>
      </div>
    `);
  });
}

function resetAllData() {
  if (typeof window._ftResetAllData === 'function') { window._ftResetAllData(); return; }
  // In Nextcloud mode, data reset requires server-side action.
  if (typeof showToast === 'function') {
    showToast('To reset: use occ app:disable fintrack && occ app:enable fintrack', 'error');
  }
}

