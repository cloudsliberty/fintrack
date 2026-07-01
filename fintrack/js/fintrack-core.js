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

function formatCurrency(amount, currencyCode) {
  const s = getState();
  const cur = (s && s.currencies) ? s.currencies.find(c => c.code === currencyCode) : null;
  const symbol = cur ? cur.symbol : (currencyCode || '');
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
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

function getTotalByType(type) {
  const s = getState();
  if (!s || !s.accounts) return 0;
  const accounts = s.accounts.filter(a => a.type === type);
  const base = s.baseCurrency;
  let total = 0;
  accounts.forEach(acc => {
    const bal = getAccountBalance(acc.id);
    total += convertAmount(bal, acc.currency, base);
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
                ${s.currencies.map(c => `<option value="${c.code}" ${c.code === s.baseCurrency ? 'selected' : ''}>${c.code} — ${c.name}</option>`).join('')}
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${s.currencies.map(c => `
                <tr>
                  <td><span class="chip accent">${c.code}</span></td>
                  <td>${c.name}</td>
                  <td class="td-mono">${c.symbol}</td>
                  <td>
                    ${c.code === s.baseCurrency
                      ? '<span class="td-muted">Base (1.00)</span>'
                      : `<input type="number" step="0.0001" value="${c.rate}" style="max-width:120px"
                           data-change="updateCurrencyRate('${c.code}', el.value)"
                           data-blur="updateCurrencyRate('${c.code}', el.value)">`
                    }
                  </td>
                  <td class="td-mono">${c.symbol}${c.rate.toFixed(4)}</td>
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
              <input type="number" id="calc-amount" value="100" data-input="updateCalc()">
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
        </div>
      </div>
    </div>
  `;

  updateCalc();
}

function updateCalc() {
  const amount = parseFloat(document.getElementById('calc-amount')?.value || 100);
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

function updateCurrencyRate(code, value) {
  const state = getState();
  const rate = parseFloat(value);
  if (isNaN(rate) || rate <= 0) return;
  const cur = state.currencies.find(c => c.code === code);
  if (cur) { cur.rate = rate; saveState(); }
  updateCalc();
}

function deleteCurrency(code) {
  const state = getState();
  const inUse = state.accounts.some(a => a.currency === code);
  if (inUse) { showToast('Cannot remove currency in use by accounts', 'error'); return; }
  state.currencies = state.currencies.filter(c => c.code !== code);
  saveState();
  showToast('Currency removed', 'success');
  renderCurrenciesPage();
}

function showAddCurrencyModal() {
  openModal('Add Currency', `
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

function renderAccountsPage(type) {
  const s = getState();
  const cfg = ACCOUNT_TYPES[type];
  const accounts = s.accounts.filter(a => a.type === type);
  const page = document.getElementById(`page-${type}-accounts`);

  // Totals
  let totalIncome = 0, totalExpense = 0, totalBalance = 0;
  accounts.forEach(acc => {
    const bal = getAccountBalance(acc.id);
    const inc = getAccountIncome(acc.id);
    const exp = getAccountExpense(acc.id);
    totalBalance += convertAmount(bal, acc.currency, s.baseCurrency);
    totalIncome += convertAmount(inc, acc.currency, s.baseCurrency);
    totalExpense += convertAmount(exp, acc.currency, s.baseCurrency);
  });

  const baseCur = s.currencies.find(c => c.code === s.baseCurrency);

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${cfg.label} Accounts</div>
        <div class="page-subtitle">${cfg.desc}</div>
      </div>
      <button class="btn btn-primary" data-action="showAccountModal(null,'${type}')">
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        New Account
      </button>
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
        <div class="stat-sub">${accounts.filter(a => a.active).length} active</div>
      </div>
    </div>

    <div class="content">
      ${accounts.length === 0 ? `
        <div class="empty-state">
          <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/></svg>
          <div class="empty-title">No ${cfg.label} accounts yet</div>
          <p>Create your first ${cfg.label.toLowerCase()} account to start tracking your finances.</p>
          <br>
          <button class="btn btn-primary" data-action="showAccountModal(null,'${type}')">Create Account</button>
        </div>
      ` : `
        <div class="accounts-grid">
          ${accounts.map(acc => renderAccountCard(acc)).join('')}
        </div>
      `}
    </div>
  `;
}

function renderAccountCard(acc) {
  const bal = getAccountBalance(acc.id);
  const inc = getAccountIncome(acc.id);
  const exp = getAccountExpense(acc.id);

  return `
    <div class="account-card type-${acc.type}" data-action="showAccountTransactions('${acc.id}')">
      <div class="account-card-type">${acc.icon || ''} ${ACCOUNT_TYPES[acc.type]?.label || acc.type}</div>
      <div class="account-card-name">${acc.name}</div>
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

function showAccountModal(accountId, defaultType) {
  const s = getState();
  const acc = accountId ? s.accounts.find(a => a.id == accountId) : null;
  const title = acc ? 'Edit Account' : 'New Account';

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
              `<option value="${v}" ${(acc?.type || defaultType) === v ? 'selected' : ''}>${cfg.label}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Currency *</label>
          <select id="acc-currency">
            ${s.currencies.map(c => `<option value="${c.code}" ${(acc?.currency || s.baseCurrency) === c.code ? 'selected' : ''}>${c.code} — ${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Icon (emoji)</label>
          <input id="acc-icon" placeholder="🏦" value="${acc?.icon || ''}" style="font-size:18px">
        </div>
        <div class="form-group">
          <label>Color</label>
          <input id="acc-color" type="color" value="${acc?.color || '#4f8ef7'}">
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
        <button class="btn btn-secondary" data-action="closeModal()">Cancel</button>
        <button class="btn btn-primary" data-action="saveAccount('${accountId || ''}')">
          ${acc ? 'Save Changes' : 'Create Account'}
        </button>
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

function deleteAccount(accountId) {
  const state = getState();
  const inUse = state.transactions.some(t => t.accountId == accountId) ||
                state.transfers.some(t => t.fromAccountId == accountId || t.toAccountId == accountId);
  if (inUse) { showToast('Cannot delete account with transactions', 'error'); return; }

  state.accounts = state.accounts.filter(a => a.id !== accountId);
  saveState();
  showToast('Account deleted', 'success');
  refreshCurrentPage();
}

// Clicking an account tile jumps to the All Transactions page, pre-filtered
// to that account, so the user can see every transaction for it across all dates.
function showAccountTransactions(accountId) {
  const s = getState();
  const acc = s.accounts.find(a => a.id == accountId);
  if (!acc) return;

  navigate('transactions');

  const sel = document.getElementById('tx-account-filter');
  if (sel) {
    sel.value = String(accountId);
    filterTransactions();
  }
}
// FinTrack — Transactions Module

function renderTransactionsPage() {
  const s = getState();
  const page = document.getElementById('page-transactions');

  const sorted = [...s.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">All Transactions</div>
        <div class="page-subtitle">${sorted.length} transactions</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" data-action="showImportCsvModal()">Import CSV</button>
        <button class="btn btn-primary" data-action="showTransactionModal()">
          <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          New Transaction
        </button>
      </div>
    </div>

    <div class="filters-bar">
      <input type="text" id="tx-search" placeholder="Search..." data-input="filterTransactions()" style="flex:1;min-width:150px">
      <select id="tx-type-filter" data-change="filterTransactions()">
        <option value="">All Types</option>
        <option value="income">Income</option>
        <option value="expense">Expense</option>
      </select>
      <select id="tx-account-filter" data-change="filterTransactions()">
        <option value="">All Accounts</option>
        ${s.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
      </select>
      <select id="tx-category-filter" data-change="filterTransactions()">
        <option value="">All Categories</option>
        ${[...new Set(s.transactions.map(t => t.category).filter(Boolean))].map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <input type="date" id="tx-from-filter" data-change="filterTransactions()">
      <input type="date" id="tx-to-filter" data-change="filterTransactions()">
    </div>

    <div class="content" style="padding-top:16px">
      <div class="card">
        <div class="table-wrap" id="tx-table-wrap">
          ${renderTransactionTable(sorted)}
        </div>
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
            <tr>
              <td class="td-muted">${new Date(t.date).toLocaleDateString()}</td>
              <td>${acc ? `<span class="chip">${acc.icon || ''} ${acc.name}</span>` : '—'}</td>
              <td>${t.description || '—'}</td>
              <td>${t.category ? `<span class="chip">${t.category}</span>` : '—'}</td>
              <td>${(t.tags || []).map(tag => `<span class="chip">${tag}</span>`).join(' ')}</td>
              <td><span class="chip ${t.type === 'income' ? 'green' : 'red'}">${t.type}</span></td>
              <td class="td-mono ${t.type === 'income' ? 'td-green' : 'td-red'}">
                ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount, t.currency)}
              </td>
              <td>
                <div style="display:flex;gap:4px">
                  <button class="btn btn-ghost btn-icon btn-sm" data-action="showTransactionModal('${t.id}')">
                    <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>
                  </button>
                  <button class="btn btn-danger btn-icon btn-sm" data-action="deleteTransaction('${t.id}')">
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

function filterTransactions() {
  const s = getState();
  const search = (document.getElementById('tx-search')?.value || '').toLowerCase();
  const type = document.getElementById('tx-type-filter')?.value || '';
  const account = document.getElementById('tx-account-filter')?.value || '';
  const category = document.getElementById('tx-category-filter')?.value || '';
  const from = document.getElementById('tx-from-filter')?.value;
  const to = document.getElementById('tx-to-filter')?.value;

  let filtered = [...s.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (search) filtered = filtered.filter(t =>
    (t.description || '').toLowerCase().includes(search) ||
    (t.category || '').toLowerCase().includes(search) ||
    (t.tags || []).some(tag => tag.toLowerCase().includes(search))
  );
  if (type) filtered = filtered.filter(t => t.type === type);
  if (account) filtered = filtered.filter(t => t.accountId == account);
  if (category) filtered = filtered.filter(t => t.category === category);
  if (from) filtered = filtered.filter(t => new Date(t.date) >= new Date(from));
  if (to) filtered = filtered.filter(t => new Date(t.date) <= new Date(to + 'T23:59:59'));

  document.getElementById('tx-table-wrap').innerHTML = renderTransactionTable(filtered);
}

function showTransactionModal(txId, defaultAccountId) {
  const s = getState();
  const tx = txId ? s.transactions.find(t => t.id == txId) : null;
  const allTags = s.tags.join(', ');

  openModal(tx ? 'Edit Transaction' : 'New Transaction', `
    <div class="form-grid cols-1">
      <div class="form-grid">
        <div class="form-group">
          <label>Type *</label>
          <select id="tx-type">
            <option value="income" ${tx?.type === 'income' ? 'selected' : ''}>Income</option>
            <option value="expense" ${!tx || tx?.type === 'expense' ? 'selected' : ''}>Expense</option>
          </select>
        </div>
        <div class="form-group">
          <label>Account *</label>
          <select id="tx-account">
            ${s.accounts.map(a => `<option value="${a.id}" ${(tx?.accountId || defaultAccountId) == a.id ? 'selected' : ''}>${a.icon || ''} ${a.name} (${a.currency})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Amount *</label>
          <input id="tx-amount" type="number" step="0.01" placeholder="0.00" value="${tx?.amount || ''}">
        </div>
        <div class="form-group">
          <label>Date *</label>
          <input id="tx-date" type="date" value="${tx ? tx.date.split('T')[0] : new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group full">
          <label>Description</label>
          <input id="tx-desc" placeholder="What was this for?" value="${tx?.description || ''}">
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;justify-content:space-between">
            <span>Category</span>
            <a href="#" data-action="toggleTxCategoryQuickAdd()" style="font-size:12px;font-weight:500">+ New category</a>
          </label>
          <select id="tx-category">
            <option value="">— None —</option>
            ${s.categories.map(c => `<option value="${c.name}" ${tx?.category === c.name ? 'selected' : ''}>${c.icon || ''} ${c.name}</option>`).join('')}
          </select>
          <div id="tx-cat-quickadd" style="display:none;margin-top:8px;padding:10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-2)">
            <div class="form-grid" style="gap:8px">
              <input id="tx-cat-quickadd-name" placeholder="Category name" style="grid-column:span 2">
              <select id="tx-cat-quickadd-type">
                <option value="expense" ${(!tx || tx?.type === 'expense') ? 'selected' : ''}>Expense</option>
                <option value="income" ${tx?.type === 'income' ? 'selected' : ''}>Income</option>
              </select>
              <input id="tx-cat-quickadd-icon" placeholder="🎬 (icon)" style="font-size:16px">
            </div>
            <div style="display:flex;gap:8px;margin-top:8px">
              <button type="button" class="btn btn-secondary btn-sm" data-action="toggleTxCategoryQuickAdd()">Cancel</button>
              <button type="button" class="btn btn-primary btn-sm" data-action="quickAddCategoryFromTx()">Add category</button>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>Tags (comma-separated)</label>
          <input id="tx-tags" placeholder="e.g. food, monthly" value="${(tx?.tags || []).join(', ')}">
        </div>
        <div class="form-group full">
          <label>Notes</label>
          <textarea id="tx-notes" placeholder="Additional notes...">${tx?.notes || ''}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-action="closeModal()">Cancel</button>
        <button class="btn btn-primary" data-action="saveTransaction('${txId || ''}')">
          ${tx ? 'Save Changes' : 'Add Transaction'}
        </button>
      </div>
    </div>
  `);
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
  const select = document.getElementById('tx-category');
  if (select) {
    const opt = document.createElement('option');
    opt.value = cat.name;
    opt.textContent = (cat.icon ? cat.icon + ' ' : '') + cat.name;
    select.appendChild(opt);
    select.value = cat.name;
  }
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
  const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

  // Save new tags
  tags.forEach(tag => { if (!state.tags.includes(tag)) state.tags.push(tag); });

  const data = {
    type: document.getElementById('tx-type').value,
    accountId,
    amount,
    currency: acc.currency,
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
  const state = getState();
  state.transactions = state.transactions.filter(t => t.id != txId);
  saveState();
  showToast('Transaction deleted', 'success');
  refreshCurrentPage();
}

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
                      <td class="td-muted">${new Date(tr.date).toLocaleDateString()}</td>
                      <td>${from ? `<span class="chip">${from.icon || ''} ${from.name}</span>` : '—'}</td>
                      <td>${to ? `<span class="chip">${to.icon || ''} ${to.name}</span>` : '—'}</td>
                      <td class="td-mono td-red">-${formatCurrency(tr.fromAmount, tr.fromCurrency)}</td>
                      <td class="td-mono td-green">+${formatCurrency(tr.toAmount, tr.toCurrency)}</td>
                      <td class="td-mono td-muted">${tr.fromCurrency !== tr.toCurrency ? `1 ${tr.fromCurrency} = ${tr.conversionRate.toFixed(4)} ${tr.toCurrency}` : '—'}</td>
                      <td>${tr.description || '—'}</td>
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
  openModal('New Transfer', `
    <div class="form-grid cols-1">
      <div class="form-grid">
        <div class="form-group">
          <label>From Account *</label>
          <select id="tr-from" data-change="updateTransferConversion()">
            ${s.accounts.map(a => `<option value="${a.id}">${a.icon || ''} ${a.name} (${a.currency})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>To Account *</label>
          <select id="tr-to" data-change="updateTransferConversion()">
            ${s.accounts.map((a, i) => `<option value="${a.id}" ${i===1?'selected':''}>${a.icon || ''} ${a.name} (${a.currency})</option>`).join('')}
          </select>
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
  setTimeout(updateTransferConversion, 100);
}

function updateTransferConversion() {
  const fromEl = document.getElementById('tr-from');
  const toEl = document.getElementById('tr-to');
  const amountEl = document.getElementById('tr-amount');
  const infoEl = document.getElementById('tr-conversion-info');
  if (!fromEl || !toEl || !infoEl) return;

  const s = getState();
  const fromAcc = s.accounts.find(a => a.id == fromEl.value);
  const toAcc = s.accounts.find(a => a.id == toEl.value);
  if (!fromAcc || !toAcc) return;

  const amount = parseFloat(amountEl?.value || 0);
  if (fromAcc.currency !== toAcc.currency) {
    const rate = getRate(fromAcc.currency, toAcc.currency);
    const converted = amount * rate;
    infoEl.style.display = 'block';
    infoEl.innerHTML = amount > 0
      ? `${formatCurrency(amount, fromAcc.currency)} → <strong>${formatCurrency(converted, toAcc.currency)}</strong> · Rate: 1 ${fromAcc.currency} = ${rate.toFixed(6)} ${toAcc.currency}`
      : `Different currencies detected · 1 ${fromAcc.currency} = ${rate.toFixed(6)} ${toAcc.currency}`;
  } else {
    infoEl.style.display = 'none';
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
    <div class="budget-card">
      <div class="budget-header">
        <div>
          <div class="budget-name">${budget.name}</div>
          <div class="budget-period">${capitalise(budget.period)} · ${budget.category}</div>
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

  openModal(b ? 'Edit Budget' : 'New Budget', `
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
  const state = getState();
  state.budgets = state.budgets.filter(b => b.id != budgetId);
  saveState();
  showToast('Budget deleted', 'success');
  renderBudgetsPage();
}

function capitalise(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }
// FinTrack — Categories & Tags Module

function renderCategoriesPage() {
  const s = getState();
  const page = document.getElementById('page-categories');

  const grouped = {
    income: s.categories.filter(c => c.type === 'income'),
    expense: s.categories.filter(c => c.type === 'expense'),
    transfer: s.categories.filter(c => c.type === 'transfer'),
  };

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

    <div class="content">
      ${['income', 'expense', 'transfer'].map(type => `
        <div style="margin-bottom:24px">
          <h3 style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-3);margin-bottom:12px">${type} Categories</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
            ${grouped[type].map(cat => `
              <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;display:flex;align-items:center;justify-content:space-between">
                <div style="display:flex;align-items:center;gap:10px">
                  <span style="font-size:20px">${cat.icon || '📂'}</span>
                  <div>
                    <div style="font-size:13.5px;font-weight:500">${cat.name}</div>
                    <div style="font-size:11.5px;color:var(--text-3)">${s.transactions.filter(t => t.category === cat.name).length} txns</div>
                  </div>
                </div>
                <div style="display:flex;gap:4px">
                  <button class="btn btn-ghost btn-icon btn-sm" data-action="showCategoryModal('${cat.id}')">
                    <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>
                  </button>
                  <button class="btn btn-danger btn-icon btn-sm" data-action="deleteCategory('${cat.id}')">
                    <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12z"/></svg>
                  </button>
                </div>
              </div>
            `).join('')}
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
          ${s.tags.map(tag => `
            <div style="display:flex;align-items:center;gap:6px;background:var(--bg-2);border:1px solid var(--border);border-radius:20px;padding:5px 12px">
              <span style="font-size:13px">${tag}</span>
              <button data-action="deleteTag('${tag}')" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:16px;line-height:1;padding:0">&times;</button>
            </div>
          `).join('')}
          <button class="btn btn-secondary btn-sm" data-action="showTagModal()">+ Add Tag</button>
        </div>
      </div>
    </div>
  `;
}

function showCategoryModal(catId, defaultType) {
  const s = getState();
  const cat = catId ? s.categories.find(c => c.id == catId) : null;

  openModal(cat ? 'Edit Category' : 'New Category', `
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
          <input id="cat-icon" placeholder="🎬" value="${cat?.icon || ''}" style="font-size:18px">
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
  openModal('Manage Tags', `
    <div class="form-grid cols-1">
      <div class="form-group">
        <label>Add New Tag</label>
        <div style="display:flex;gap:8px">
          <input id="new-tag-input" placeholder="Tag name..." style="flex:1">
          <button class="btn btn-primary" data-action="addTag()">Add</button>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px" id="tags-list">
        ${s.tags.map(tag => `
          <div style="display:flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border);border-radius:20px;padding:5px 12px">
            <span>${tag}</span>
            <button data-action="deleteTag('${tag}');renderTagList()" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:16px;line-height:1">&times;</button>
          </div>
        `).join('')}
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" data-action="closeModal();renderCategoriesPage()">Done</button>
      </div>
    </div>
  `);
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
  list.innerHTML = state.tags.map(tag => `
    <div style="display:flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border);border-radius:20px;padding:5px 12px">
      <span>${tag}</span>
      <button data-action="deleteTag('${tag}');renderTagList()" style="background:none;border:none;color:var(--text-3);cursor:pointer;font-size:16px;line-height:1">&times;</button>
    </div>
  `).join('');
}

function deleteTag(tag) {
  const state = getState();
  state.tags = state.tags.filter(t => t !== tag);
  saveState();
  if (!document.getElementById('tags-list')) renderCategoriesPage();
}
// FinTrack — Reports Module

function renderReportsPage() {
  const s = getState();
  const page = document.getElementById('page-reports');

  // Monthly data for last 6 months
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleString('default', { month: 'short', year: '2-digit' }) });
  }

  const monthlyData = months.map(m => {
    const income = s.transactions
      .filter(t => t.type === 'income' && new Date(t.date).getFullYear() === m.year && new Date(t.date).getMonth() === m.month)
      .reduce((sum, t) => sum + convertAmount(parseFloat(t.amount), t.currency, s.baseCurrency), 0);
    const expense = s.transactions
      .filter(t => t.type === 'expense' && new Date(t.date).getFullYear() === m.year && new Date(t.date).getMonth() === m.month)
      .reduce((sum, t) => sum + convertAmount(parseFloat(t.amount), t.currency, s.baseCurrency), 0);
    return { ...m, income, expense, net: income - expense };
  });

  // Category breakdown this month
  const now = new Date();
  const thisMonth = s.transactions.filter(t =>
    t.type === 'expense' &&
    new Date(t.date).getFullYear() === now.getFullYear() &&
    new Date(t.date).getMonth() === now.getMonth()
  );
  const catBreakdown = {};
  thisMonth.forEach(t => {
    const key = t.category || 'Uncategorized';
    catBreakdown[key] = (catBreakdown[key] || 0) + convertAmount(parseFloat(t.amount), t.currency, s.baseCurrency);
  });
  const catEntries = Object.entries(catBreakdown).sort((a, b) => b[1] - a[1]);
  const totalCatSpend = catEntries.reduce((s, [, v]) => s + v, 0);

  // Account balances
  const assetAccounts = s.accounts.filter(a => a.type === 'asset' && a.active);
  const totalAssets = assetAccounts.reduce((sum, a) => sum + convertAmount(getAccountBalance(a.id), a.currency, s.baseCurrency), 0);

  const maxBar = Math.max(...monthlyData.map(m => Math.max(m.income, m.expense)), 1);

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Reports & Analytics</div>
        <div class="page-subtitle">Visual overview of your financial activity</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" data-action="exportReportPDF()">Export Report</button>
      </div>
    </div>

    <div class="stats-strip">
      <div class="stat-card">
        <div class="stat-label">This Month Income</div>
        <div class="stat-value green">${formatCurrency(monthlyData[5]?.income || 0, s.baseCurrency)}</div>
        <div class="stat-sub">${monthlyData[5]?.label}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">This Month Expenses</div>
        <div class="stat-value red">${formatCurrency(monthlyData[5]?.expense || 0, s.baseCurrency)}</div>
        <div class="stat-sub">${monthlyData[5]?.label}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">This Month Net</div>
        <div class="stat-value ${(monthlyData[5]?.net || 0) >= 0 ? 'accent' : 'red'}">${formatCurrency(monthlyData[5]?.net || 0, s.baseCurrency)}</div>
        <div class="stat-sub">Income minus expenses</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Transactions</div>
        <div class="stat-value">${s.transactions.length}</div>
        <div class="stat-sub">${s.transfers.length} transfers</div>
      </div>
    </div>

    <div class="content">
      <!-- Income vs Expense Bar Chart -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <div class="card-title">Income vs Expenses — Last 6 Months</div>
        </div>
        <div class="card-body">
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
          <div class="card-header">
            <div class="card-title">Expense Breakdown — This Month</div>
          </div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:10px">
            ${catEntries.length === 0
              ? `<p style="color:var(--text-3);font-size:13px">No expenses this month.</p>`
              : catEntries.map(([cat, amt]) => {
                  const pct = totalCatSpend > 0 ? (amt / totalCatSpend) * 100 : 0;
                  const catObj = s.categories.find(c => c.name === cat);
                  return `
                    <div>
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
          <div class="card-header"><div class="card-title">Monthly Summary</div></div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Month</th><th>Income</th><th>Expenses</th><th>Net</th></tr>
              </thead>
              <tbody>
                ${[...monthlyData].reverse().map(m => `
                  <tr>
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
          <div class="card-header"><div class="card-title">Asset Allocation</div></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:10px">
            ${assetAccounts.length === 0
              ? `<p style="color:var(--text-3);font-size:13px">No asset accounts.</p>`
              : assetAccounts.map(acc => {
                  const bal = getAccountBalance(acc.id);
                  const balBase = convertAmount(bal, acc.currency, s.baseCurrency);
                  const pct = totalAssets > 0 ? (balBase / totalAssets) * 100 : 0;
                  return `
                    <div>
                      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                        <span style="font-size:13px">${acc.icon || ''} ${acc.name}</span>
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
          <div class="card-header"><div class="card-title">Savings Rate — Last 3 Months</div></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:14px">
            ${monthlyData.slice(3).map(m => {
              const rate = m.income > 0 ? Math.max(0, ((m.income - m.expense) / m.income) * 100) : 0;
              return `
                <div>
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
  `;
}

function exportReportPDF() {
  showToast('Report export — use browser Print → Save as PDF', 'success');
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
                    <tr>
                      <td style="font-weight:500">${r.name}</td>
                      <td>${acc ? `<span class="chip">${acc.icon || ''} ${acc.name}</span>` : '—'}</td>
                      <td class="td-mono ${r.type === 'income' ? 'td-green' : 'td-red'}">
                        ${r.type === 'income' ? '+' : '-'}${formatCurrency(r.amount, r.currency)}
                      </td>
                      <td><span class="chip">${capitalise(r.frequency)}</span></td>
                      <td class="${due ? 'td-green' : 'td-muted'}" style="font-size:12.5px">
                        ${due ? '⏰ Due now' : r.nextDate ? new Date(r.nextDate).toLocaleDateString() : '—'}
                      </td>
                      <td class="td-muted" style="font-size:12.5px">${r.lastPosted ? new Date(r.lastPosted).toLocaleDateString() : 'Never'}</td>
                      <td>
                        <span class="chip ${r.active ? 'green' : ''}">${r.active ? 'Active' : 'Paused'}</span>
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
  return new Date(r.nextDate) <= new Date();
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
  const rec = recId ? (s.recurring || []).find(r => r.id === recId) : null;

  openModal(rec ? 'Edit Recurring Transaction' : 'New Recurring Transaction', `
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
          <select id="rec-account">
            ${s.accounts.map(a => `<option value="${a.id}" ${rec?.accountId == a.id ? 'selected' : ''}>${a.icon || ''} ${a.name} (${a.currency})</option>`).join('')}
          </select>
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
          <input id="rec-tags" placeholder="e.g. recurring, bills" value="${(rec?.tags || []).join(', ')}">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="rec-active">
            <option value="true" ${!rec || rec.active ? 'selected' : ''}>Active</option>
            <option value="false" ${rec && !rec.active ? 'selected' : ''}>Paused</option>
          </select>
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
  const tags = document.getElementById('rec-tags').value.split(',').map(t => t.trim()).filter(Boolean);

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
  const state = getState();
  const rec = (state.recurring || []).find(r => r.id === recId);
  if (rec) { rec.active = !rec.active; saveState(); renderRecurringPage(); }
}

function deleteRecurring(recId) {
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
  const cashFlow = totalRevenue - totalExpenses;

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
      <div class="stat-card">
        <div class="stat-label">Net Worth</div>
        <div class="stat-value ${netWorth >= 0 ? 'accent' : 'red'}">${formatCurrency(netWorth, s.baseCurrency)}</div>
        <div class="stat-sub">Assets minus liabilities</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Assets</div>
        <div class="stat-value green">${formatCurrency(totalAssets, s.baseCurrency)}</div>
        <div class="stat-sub">${s.accounts.filter(a => a.type === 'asset').length} accounts</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Liabilities</div>
        <div class="stat-value red">${formatCurrency(totalLiabilities, s.baseCurrency)}</div>
        <div class="stat-sub">${s.accounts.filter(a => a.type === 'liability').length} accounts</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Cash Flow</div>
        <div class="stat-value ${cashFlow >= 0 ? 'green' : 'red'}">${cashFlow >= 0 ? '+' : ''}${formatCurrency(cashFlow, s.baseCurrency)}</div>
        <div class="stat-sub">Revenue minus expenses</div>
      </div>
    </div>

    <div class="content">
      <div class="dash-grid" style="gap:16px">
        <!-- Recent Transactions -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Recent Transactions</div>
            <button class="btn btn-ghost btn-sm" data-action="navigate('transactions')">View all</button>
          </div>
          ${recentTxs.length === 0
            ? `<div class="card-body"><p style="color:var(--text-3);font-size:13px">No transactions yet.</p></div>`
            : `<div class="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Description</th><th>Amount</th></tr></thead>
                  <tbody>
                    ${recentTxs.map(t => {
                      const acc = s.accounts.find(a => a.id == t.accountId);
                      return `<tr>
                        <td class="td-muted" style="font-size:12px">${new Date(t.date).toLocaleDateString()}</td>
                        <td>
                          <div style="font-size:13px">${t.description || t.category || '—'}</div>
                          ${acc ? `<div style="font-size:11.5px;color:var(--text-3)">${acc.name}</div>` : ''}
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

        <!-- Budget Overview -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">Budget Overview</div>
            <button class="btn btn-ghost btn-sm" data-action="navigate('budgets')">Manage</button>
          </div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:12px">
            ${activeBudgets.length === 0
              ? `<p style="color:var(--text-3);font-size:13px">No active budgets.</p>`
              : activeBudgets.map(b => {
                  const spent = getCategorySpend(b.category, b.period);
                  const pct = b.limit > 0 ? Math.min((spent / b.limit) * 100, 100) : 0;
                  const isOver = spent > b.limit;
                  const isWarn = pct >= 80;
                  return `
                    <div>
                      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                        <span style="font-size:13px;font-weight:500">${b.name}</span>
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
          <div class="card-header"><div class="card-title">Accounts Summary</div></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Account</th><th>Type</th><th>Balance</th></tr></thead>
              <tbody>
                ${s.accounts.filter(a => a.active).map(acc => {
                  const bal = getAccountBalance(acc.id);
                  return `<tr>
                    <td>
                      <div style="font-size:13px;font-weight:500">${acc.icon || ''} ${acc.name}</div>
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
          <div class="card-header"><div class="card-title">Top Expense Categories</div></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:12px">
            ${topCategories.length === 0
              ? `<p style="color:var(--text-3);font-size:13px">No expense data yet.</p>`
              : topCategories.map(([cat, amt]) => {
                  const pct = (amt / maxCatSpend) * 100;
                  const catObj = s.categories.find(c => c.name === cat);
                  return `
                    <div>
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
      </div>
    </div>
  `;
}
// FinTrack — Settings Module

function renderExternalApiPage() {
  const s = getState();
  const page = document.getElementById('page-external-api');
  if (!page) return;

  const apiKey = s.apiKey || '';
  const formUrl = s.externalFormUrl || '';

  page.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">External API</div>
        <div class="page-subtitle">API token and external entry form link</div>
      </div>
    </div>

    <div class="content">
      <!-- API Token -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">API Token</div></div>
        <div class="card-body">
          <p style="font-size:13px;color:var(--text-2);margin-bottom:12px">
            Use this token to authenticate requests to the FinTrack external API.
            Include it as the <code>X-FinTrack-Token</code> header in every request.
          </p>
          <div class="form-group" style="margin-bottom:12px">
            <label>Current Token</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input id="ext-api-key" type="text" value="${escHtml(apiKey)}" readonly
                style="font-family:monospace;font-size:12.5px;flex:1">
              <button class="btn btn-secondary" onclick="copyApiKey()">Copy</button>
            </div>
          </div>
          <div style="font-size:12px;color:var(--text-3);margin-bottom:16px">
            Keep this token secret. Anyone with this token can submit transactions on your behalf.
          </div>
          <button class="btn btn-danger" data-action="regenerateApiKey()">Regenerate Token</button>
        </div>
      </div>

      <!-- External Form Link -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">External Entry Form</div></div>
        <div class="card-body">
          <p style="font-size:13px;color:var(--text-2);margin-bottom:12px">
            Share this link to allow quick transaction entry without logging in to Nextcloud.
            The form uses your API token for authentication.
          </p>
          <div class="form-group" style="margin-bottom:12px">
            <label>Form URL</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input id="ext-form-url" type="text" value="${escHtml(formUrl)}" readonly
                style="font-family:monospace;font-size:12px;flex:1">
              <button class="btn btn-secondary" onclick="copyFormUrl()">Copy</button>
            </div>
          </div>
          ${formUrl ? `<a href="${escHtml(formUrl)}" target="_blank" class="btn btn-primary" style="display:inline-block">Open Form</a>` : ''}
        </div>
      </div>

      <!-- API Endpoints Reference -->
      <div class="card">
        <div class="card-header"><div class="card-title">API Endpoints</div></div>
        <div class="card-body">
          <p style="font-size:13px;color:var(--text-2);margin-bottom:12px">
            All endpoints require the <code>X-FinTrack-Token</code> header.
          </p>
          ${[
            ['GET',  '/api/external/accounts',    'List active accounts'],
            ['GET',  '/api/external/categories',  'List categories'],
            ['POST', '/api/external/transaction',  'Submit a transaction'],
          ].map(([method, path, desc]) => `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:11px;font-weight:700;padding:2px 6px;border-radius:3px;background:var(--accent);color:#fff;min-width:38px;text-align:center">${method}</span>
              <code style="font-size:12px;flex:1">${escHtml(path)}</code>
              <span style="font-size:12.5px;color:var(--text-2)">${desc}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

window.copyApiKey = function () {
  const el = document.getElementById('ext-api-key');
  if (el) { navigator.clipboard.writeText(el.value); showToast('Token copied', 'success'); }
};

window.copyFormUrl = function () {
  const el = document.getElementById('ext-form-url');
  if (el) { navigator.clipboard.writeText(el.value); showToast('URL copied', 'success'); }
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
        <div class="card-header"><div class="card-title">General Preferences</div></div>
        <div class="card-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Base / Display Currency</label>
              <select id="set-basecur">
                ${s.currencies.map(c => `<option value="${c.code}" ${s.baseCurrency === c.code ? 'selected' : ''}>${c.code} — ${c.name}</option>`).join('')}
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
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" data-action="saveSettings()">Save Preferences</button>
          </div>
        </div>
      </div>

      <!-- Data Stats -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">Data Overview</div></div>
        <div class="card-body">
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
          </div>
        </div>
      </div>

      <!-- Data Management -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><div class="card-title">Data Management</div></div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div>
              <div style="font-size:13.5px;font-weight:600;margin-bottom:6px">Backup Data</div>
              <p style="font-size:13px;color:var(--text-2);margin-bottom:10px">Export all your data as a JSON backup file.</p>
              <button class="btn btn-secondary" data-action="exportJSON()">Download Backup</button>
            </div>
            <div>
              <div style="font-size:13.5px;font-weight:600;margin-bottom:6px">Restore from Backup</div>
              <p style="font-size:13px;color:var(--text-2);margin-bottom:10px">Restore all data from a previously exported backup.</p>
              <label class="btn btn-secondary" style="cursor:pointer">
                Restore Backup
                <input type="file" accept=".json" style="display:none" data-change="restoreBackup(el)">
              </label>
            </div>
          </div>
          <div class="section-divider"></div>
          <div>
            <div style="font-size:13.5px;font-weight:600;margin-bottom:6px">Import Transactions from CSV</div>
            <p style="font-size:13px;color:var(--text-2);margin-bottom:10px">Import a batch of transactions from a CSV file into one account.</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-secondary" data-action="showImportCsvModal()">Import CSV</button>
              <button class="btn btn-ghost" data-action="downloadCsvTemplate()">Download Template</button>
            </div>
          </div>
          <div class="section-divider"></div>
          <div>
            <div style="font-size:13.5px;font-weight:600;color:var(--red);margin-bottom:6px">Danger Zone</div>
            <p style="font-size:13px;color:var(--text-2);margin-bottom:10px">Permanently delete all FinTrack data. This cannot be undone.</p>
            <button class="btn btn-danger" data-action="confirmReset()">Reset All Data</button>
          </div>
        </div>
      </div>

      <!-- About -->
      <div class="card">
        <div class="card-header"><div class="card-title">About FinTrack</div></div>
        <div class="card-body">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
            <div style="width:48px;height:48px;background:var(--accent);border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:16px">FT</div>
            <div>
              <div style="font-size:16px;font-weight:700">FinTrack</div>
              <div style="font-size:12.5px;color:var(--text-3)">Personal Finance Manager v1.0</div>
            </div>
          </div>
          <div style="font-size:13px;color:var(--text-2);line-height:1.7">
            FinTrack is a full-featured personal finance application with multi-currency support, 
            asset/expense/revenue/liability accounts, budget tracking, recurring transactions, 
            external API access, and comprehensive reporting.
            <br><br>
            All data is stored locally in your browser. Use the backup feature to preserve your data.
          </div>
        </div>
      </div>
    </div>
  `;
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
  const state = getState();
  const file = input.files[0];
  if (!file) return;
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
}

// ── CSV Import ──

// Holds the parsed rows from the last selected CSV file, keyed nowhere
// persistent — this is just transient state for the open import modal.
let _csvImportRows = [];

const CSV_TEMPLATE_HEADERS = ['date', 'type', 'amount', 'description', 'category', 'tags', 'notes'];
const CSV_TEMPLATE_ROWS = [
  ['2026-01-05', 'expense', '42.50', 'Grocery shopping', 'Groceries', 'food;weekly', 'Bought vegetables and fruit'],
  ['2026-01-07', 'income', '1500.00', 'Monthly salary', 'Salary', '', ''],
  ['2026-01-10', 'expense', '9.99', 'Streaming subscription', 'Entertainment', 'subscriptions', ''],
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

function showImportCsvModal() {
  const s = getState();
  _csvImportRows = [];

  if (s.accounts.length === 0) {
    showToast('Add an account first', 'error');
    return;
  }

  openModal('Import Transactions from CSV', `
    <div class="form-grid cols-1">
      <div class="form-grid">
        <div class="form-group full">
          <label>Import into Account *</label>
          <select id="csv-import-account">
            ${s.accounts.map(a => `<option value="${a.id}">${a.icon || ''} ${a.name} (${a.currency})</option>`).join('')}
          </select>
        </div>
        <div class="form-group full">
          <label>CSV File</label>
          <input type="file" id="csv-import-file" accept=".csv" data-change="handleCsvFileSelect(el)">
        </div>
        <div class="form-group full">
          <p style="font-size:12.5px;color:var(--text-3);line-height:1.6">
            Expected columns: <code>date, type, amount, description, category, tags, notes</code>.
            <code>type</code> is <code>income</code> or <code>expense</code>; <code>tags</code> are semicolon-separated.
            <a href="#" data-action="downloadCsvTemplate()">Download a template</a>.
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
        preview.textContent = 'No transactions found in this file.';
        importBtn.disabled = true;
        return;
      }
      preview.textContent = `${_csvImportRows.length} transaction(s) ready to import.`;
      importBtn.disabled = false;
    } catch (err) {
      preview.textContent = 'Could not read this file — please check it is a valid CSV.';
      importBtn.disabled = true;
    }
  };
  reader.readAsText(file);
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
  const state = getState();
  const acc = state.accounts.find(a => a.id == accountId);
  let imported = 0;
  const errors = [];

  _csvImportRows.forEach((row, i) => {
    const type = (row.type || 'expense').toLowerCase();
    const amount = parseFloat(row.amount);
    if (!amount || amount <= 0) { errors.push(`Row ${i + 2}: invalid amount`); return; }
    if (!row.date || isNaN(new Date(row.date).getTime())) { errors.push(`Row ${i + 2}: invalid date`); return; }

    state.transactions.push({
      id: generateId('tx'),
      accountId,
      type: ['income', 'expense'].includes(type) ? type : 'expense',
      amount,
      currency: acc ? acc.currency : 'USD',
      description: row.description || '',
      category: row.category || '',
      tags: (row.tags || '').split(';').map(t => t.trim()).filter(Boolean),
      notes: row.notes || '',
      date: new Date(row.date).toISOString(),
      source: 'import',
      created: new Date().toISOString(),
    });
    imported++;
  });

  saveState();
  closeModal();
  showToast(`Imported ${imported} transaction(s)${errors.length ? `, ${errors.length} skipped` : ''}`, errors.length ? 'error' : 'success');
  refreshCurrentPage();
}

function confirmReset() {
  openModal('Reset All Data', `
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:40px;margin-bottom:12px">⚠️</div>
      <div style="font-size:15px;font-weight:600;margin-bottom:8px">Are you sure?</div>
      <p style="font-size:13.5px;color:var(--text-2);line-height:1.6;margin-bottom:20px">
        This will permanently delete ALL your accounts, transactions, budgets, and settings.<br>
        This action <strong>cannot be undone</strong>.
      </p>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="btn btn-secondary" data-action="closeModal()">Cancel</button>
        <button class="btn btn-danger" data-action="resetAllData()">Yes, Delete Everything</button>
      </div>
    </div>
  `);
}

function resetAllData() {
  if (typeof window._ftResetAllData === 'function') { window._ftResetAllData(); return; }
  // In Nextcloud mode, data reset requires server-side action.
  if (typeof showToast === 'function') {
    showToast('To reset: use occ app:disable fintrack && occ app:enable fintrack', 'error');
  }
}

