// FinTrack for Nextcloud 32 — Main Entry Point
// Reads config from #fintrack-config data attribute (CSP-safe, no inline script needed).
(function () {
'use strict';

// ── Config (injected via data attribute in main.php, no inline JS needed) ──
const configEl  = document.getElementById('fintrack-config');
const CFG       = configEl ? JSON.parse(configEl.dataset.config || '{}') : {};
const API_BASE  = CFG.apiBase || (window.location.origin + '/index.php/apps/fintrack/api');

// ── In-memory state ──
let state = {
	currencies:      [],
	baseCurrency:    'USD',
	accounts:        [],
	transactions:    [],
	transfers:       [],
	budgets:         [],
	categories:      [],
	tags:            [],
	recurring:       [],
	settings:        {},
	apiKey:          CFG.apiToken || '',
	externalFormUrl: CFG.externalFormUrl || '',
};

// ── Expose state accessors (used by fintrack-core.js UI modules) ──
window.getState  = function () { return state; };
window._ftGetState = function () { return state; }; // used by fintrack-core.js to avoid infinite recursion
window.loadState = function () { return state; };
window.saveState = function () {}; // no-op; all mutations go via API
// _ftSaveState is called by fintrack-core.js's saveState() to avoid infinite
// recursion (window.saveState would resolve to saveState() itself at global scope).
window._ftSaveState = function () {}; // no-op in NC mode — API calls handle persistence

// ── CSRF token ──
// NC32 sets the request token on <head data-requesttoken="...">.
// We read it once and cache it. If a token regeneration occurs during the session
// the page will be reloaded anyway (NC handles this transparently).
function csrfToken() {
	return (
		document.head?.dataset?.requesttoken
		|| document.querySelector('head[data-requesttoken]')?.dataset?.requesttoken
		|| document.querySelector('meta[name="requesttoken"]')?.content
		|| (typeof OC !== 'undefined' ? OC.requestToken : '')
		|| ''
	);
}

// ── HTTP helpers ──
// All mutating requests (POST/PUT/DELETE) include the requesttoken header so
// NC32's built-in CSRF middleware accepts them without needing #[NoCSRFRequired].
async function apiFetch(path, options) {
	options = options || {};
	const url    = API_BASE + path;
	const method = (options.method || 'GET').toUpperCase();
	const isMutating = method !== 'GET' && method !== 'HEAD';

	const headers = Object.assign(
		{
			'Content-Type':      'application/json',
			'X-Requested-With':  'XMLHttpRequest',
			'OCS-APIREQUEST':    'true',
		},
		isMutating ? { 'requesttoken': csrfToken() } : {},
		options.headers || {}
	);

	const res = await fetch(url, Object.assign({}, options, {
		credentials: 'same-origin',
		headers:     headers,
	}));

	if (!res.ok) {
		const err = await res.json().catch(function () { return { error: res.statusText }; });
		throw new Error(err.error || res.statusText);
	}
	return res.json();
}

window._api = {
	get:  function (path)         { return apiFetch(path); },
	post: function (path, body)   { return apiFetch(path, { method: 'POST',   body: JSON.stringify(body || {}) }); },
	put:  function (path, body)   { return apiFetch(path, { method: 'PUT',    body: JSON.stringify(body || {}) }); },
	del:  function (path)         { return apiFetch(path, { method: 'DELETE' }); },
};

// ══════════════════════════════════════════════
//  MODAL
// ══════════════════════════════════════════════
window.openModal = function (title, bodyHTML) {
	document.getElementById('ft-modal-title').textContent = title;
	document.getElementById('ft-modal-body').innerHTML    = bodyHTML;
	document.getElementById('ft-modal-overlay').classList.remove('ft-hidden');
};

window.closeModal = function () {
	document.getElementById('ft-modal-overlay').classList.add('ft-hidden');
	document.getElementById('ft-modal-body').innerHTML = '';
};

// ══════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════
window.showToast = function (message, type) {
	type = type || '';
	const container = document.getElementById('ft-toast-container');
	const el        = document.createElement('div');
	el.className    = 'ft-toast' + (type ? ' ' + type : '');
	el.textContent  = message;
	container.appendChild(el);
	setTimeout(function () { el.remove(); }, 3500);
};

// ══════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════
let currentPage = 'dashboard';

window.navigate = function (page) {
	currentPage = page;
	document.querySelectorAll('.ft-nav-item').forEach(function (el) {
		el.classList.toggle('active', el.dataset.page === page);
	});
	document.querySelectorAll('.ft-page').forEach(function (el) {
		el.classList.remove('active');
	});
	const pageEl = document.getElementById('page-' + page);
	if (pageEl) pageEl.classList.add('active');
	renderPage(page);
};

window.refreshCurrentPage = function () { renderPage(currentPage); };

function renderPage(page) {
	switch (page) {
		case 'dashboard':          renderDashboard();                break;
		case 'reports':            renderReportsPage();              break;
		case 'asset-accounts':     renderAccountsPage('asset');      break;
		case 'expense-accounts':   renderAccountsPage('expense');    break;
		case 'revenue-accounts':   renderAccountsPage('revenue');    break;
		case 'liability-accounts': renderAccountsPage('liability');  break;
		case 'transactions':       renderTransactionsPage();         break;
		case 'transfers':          renderTransfersPage();            break;
		case 'recurring':          renderRecurringPage();            break;
		case 'budgets':            renderBudgetsPage();              break;
		case 'categories':         renderCategoriesPage();           break;
		case 'currencies':         renderCurrenciesPage();           break;
		case 'external-api':       renderExternalApiPage();          break;
		case 'settings':           renderSettingsPage();             break;
	}
}

// ══════════════════════════════════════════════
//  API-BACKED MUTATIONS
// ══════════════════════════════════════════════

// ── Accounts ──
window.saveAccount = async function (accountId) {
	const name = document.getElementById('acc-name')?.value.trim();
	if (!name) { showToast('Account name required', 'error'); return; }
	const data = {
		name,
		type:        document.getElementById('acc-type').value,
		currency:    document.getElementById('acc-currency').value,
		icon:        document.getElementById('acc-icon').value.trim(),
		color:       document.getElementById('acc-color').value,
		description: document.getElementById('acc-desc').value.trim(),
		active:      document.getElementById('acc-active').value === 'true' ? 1 : 0,
	};
	try {
		if (accountId) {
			const r = await _api.put('/accounts/' + accountId, data);
			const idx = state.accounts.findIndex(function (a) { return a.id == accountId; });
			if (idx !== -1) state.accounts[idx] = Object.assign(state.accounts[idx], r);
			showToast('Account updated', 'success');
		} else {
			const r = await _api.post('/accounts', data);
			state.accounts.push(r);
			showToast('Account created', 'success');
		}
		closeModal(); refreshCurrentPage();
	} catch (e) { showToast(e.message || 'Error saving account', 'error'); }
};

window.deleteAccount = async function (accountId) {
	try {
		await _api.del('/accounts/' + accountId);
		state.accounts = state.accounts.filter(function (a) { return a.id != accountId; });
		showToast('Account deleted', 'success');
		refreshCurrentPage();
	} catch (e) { showToast(e.message || 'Cannot delete account', 'error'); }
};

// ── Transactions ──
window.saveTransaction = async function (txId) {
	const amount    = parseFloat(document.getElementById('tx-amount').value);
	const accountId = document.getElementById('tx-account').value;
	if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
	const acc  = state.accounts.find(function (a) { return a.id == accountId; });
	const tags = document.getElementById('tx-tags').value
		.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
	tags.forEach(function (t) { if (!state.tags.includes(t)) state.tags.push(t); });
	const data = {
		type:        document.getElementById('tx-type').value,
		accountId:   parseInt(accountId, 10),
		amount,
		currency:    acc ? acc.currency : 'USD',
		description: document.getElementById('tx-desc').value.trim(),
		category:    document.getElementById('tx-category').value,
		tags,
		notes:       document.getElementById('tx-notes').value.trim(),
		date:        document.getElementById('tx-date').value,
	};
	try {
		if (txId) {
			const r = await _api.put('/transactions/' + txId, data);
			const idx = state.transactions.findIndex(function (t) { return t.id == txId; });
			if (idx !== -1) state.transactions[idx] = Object.assign(state.transactions[idx], r);
			showToast('Transaction updated', 'success');
		} else {
			const r = await _api.post('/transactions', data);
			state.transactions.unshift(r);
			showToast('Transaction added', 'success');
		}
		closeModal(); refreshCurrentPage();
	} catch (e) { showToast(e.message || 'Error saving transaction', 'error'); }
};

// Quick-add a category from directly within the transaction entry form,
// without closing the modal or losing anything already typed into it.
window._ftQuickAddCategoryFromTx = async function () {
	const name = document.getElementById('tx-cat-quickadd-name').value.trim();
	if (!name) { showToast('Category name required', 'error'); return; }
	const data = {
		name,
		type: document.getElementById('tx-cat-quickadd-type').value,
		icon: document.getElementById('tx-cat-quickadd-icon').value.trim(),
		color: '#4f8ef7',
	};
	try {
		const cat = await _api.post('/categories', data);
		state.categories.push(cat);
		applyNewCategoryToTxForm(cat);
	} catch (e) { showToast(e.message || 'Error adding category', 'error'); }
};

window.deleteTransaction = async function (txId) {
	try {
		await _api.del('/transactions/' + txId);
		state.transactions = state.transactions.filter(function (t) { return t.id != txId; });
		showToast('Transaction deleted', 'success');
		refreshCurrentPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

// ── CSV Import ──
window._ftImportCsvTransactions = async function (accountId, rows) {
	try {
		const r = await _api.post('/transactions/import', {
			accountId: parseInt(accountId, 10),
			transactions: rows,
		});
		closeModal();
		const parts = [`Imported ${r.imported} transaction(s)`];
		if (r.failed) parts.push(`${r.failed} skipped`);
		showToast(parts.join(', '), r.failed ? 'error' : 'success');
		// Refresh transactions from the server rather than guessing IDs locally.
		state.transactions = (await _api.get('/transactions?limit=1000')) || [];
		refreshCurrentPage();
	} catch (e) { showToast(e.message || 'Import failed', 'error'); }
};

// ── Transfers ──
window.saveTransfer = async function () {
	const fromId = document.getElementById('tr-from').value;
	const toId   = document.getElementById('tr-to').value;
	const amount = parseFloat(document.getElementById('tr-amount').value);
	const date   = document.getElementById('tr-date').value;
	if (fromId === toId) { showToast('Cannot transfer to same account', 'error'); return; }
	if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
	const fromAcc = state.accounts.find(function (a) { return a.id == fromId; });
	const toAcc   = state.accounts.find(function (a) { return a.id == toId; });
	const rate    = getRate(fromAcc.currency, toAcc.currency);
	try {
		const r = await _api.post('/transfers', {
			fromAccountId:  parseInt(fromId, 10),
			toAccountId:    parseInt(toId, 10),
			fromAmount:     amount,
			toAmount:       amount * rate,
			fromCurrency:   fromAcc.currency,
			toCurrency:     toAcc.currency,
			conversionRate: rate,
			description:    document.getElementById('tr-desc').value.trim(),
			date,
		});
		state.transfers.unshift(r);
		showToast('Transfer created', 'success');
		closeModal(); renderTransfersPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

window.deleteTransfer = async function (trId) {
	try {
		await _api.del('/transfers/' + trId);
		state.transfers = state.transfers.filter(function (t) { return t.id != trId; });
		showToast('Transfer deleted', 'success');
		renderTransfersPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

// ── Budgets ──
window.saveBudget = async function (budgetId) {
	const name  = document.getElementById('b-name').value.trim();
	const limit = parseFloat(document.getElementById('b-limit').value);
	if (!name)  { showToast('Name required', 'error');  return; }
	if (!limit) { showToast('Limit required', 'error'); return; }
	const data = {
		name, limit,
		currency:  document.getElementById('b-currency').value,
		period:    document.getElementById('b-period').value,
		category:  document.getElementById('b-category').value,
		startDate: document.getElementById('b-start').value,
		active:    document.getElementById('b-active').value === 'true' ? 1 : 0,
	};
	try {
		if (budgetId) {
			const r = await _api.put('/budgets/' + budgetId, data);
			const idx = state.budgets.findIndex(function (b) { return b.id == budgetId; });
			if (idx !== -1) state.budgets[idx] = r;
			showToast('Budget updated', 'success');
		} else {
			const r = await _api.post('/budgets', data);
			state.budgets.push(r);
			showToast('Budget created', 'success');
		}
		closeModal(); renderBudgetsPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

window.deleteBudget = async function (budgetId) {
	try {
		await _api.del('/budgets/' + budgetId);
		state.budgets = state.budgets.filter(function (b) { return b.id != budgetId; });
		showToast('Budget deleted', 'success'); renderBudgetsPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

// ── Categories ──
window.saveCategory = async function (catId) {
	const name = document.getElementById('cat-name').value.trim();
	if (!name) { showToast('Name required', 'error'); return; }
	const data = {
		name,
		type:  document.getElementById('cat-type').value,
		icon:  document.getElementById('cat-icon').value.trim(),
		color: document.getElementById('cat-color').value,
	};
	try {
		if (catId) {
			const r = await _api.put('/categories/' + catId, data);
			const idx = state.categories.findIndex(function (c) { return c.id == catId; });
			if (idx !== -1) state.categories[idx] = r;
			showToast('Category updated', 'success');
		} else {
			const r = await _api.post('/categories', data);
			state.categories.push(r);
			showToast('Category created', 'success');
		}
		closeModal(); renderCategoriesPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

window.deleteCategory = async function (catId) {
	const cat = state.categories.find(function (c) { return c.id == catId; });
	if (state.transactions.some(function (t) { return t.category === (cat && cat.name); })) {
		showToast('Category is in use by transactions', 'error'); return;
	}
	try {
		await _api.del('/categories/' + catId);
		state.categories = state.categories.filter(function (c) { return c.id != catId; });
		showToast('Category deleted', 'success'); renderCategoriesPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

// ── Currencies ──
// window._ftSaveCurrency / _ftSaveCategory are the canonical API-backed save
// functions called by fintrack-core.js stubs. They must NOT call window.saveCurrency
// or window.saveCategory to avoid mutual recursion with core.js hoisted declarations.
window._ftSaveCurrency = async function () {
	const code   = document.getElementById('cur-code').value.trim().toUpperCase();
	const name   = document.getElementById('cur-name').value.trim();
	const symbol = document.getElementById('cur-symbol').value.trim();
	const rate   = parseFloat(document.getElementById('cur-rate').value);
	if (!code || !name || !symbol || isNaN(rate)) { showToast('Fill all fields', 'error'); return; }
	if (state.currencies.find(function (c) { return c.code === code; })) {
		showToast('Currency already exists', 'error'); return;
	}
	try {
		const r = await _api.post('/currencies', { code, name, symbol, rate });
		state.currencies.push(r);
		showToast('Currency added', 'success');
		closeModal(); renderCurrenciesPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

window._ftSaveCategory = async function (catId) {
	const name = document.getElementById('cat-name').value.trim();
	if (!name) { showToast('Category name required', 'error'); return; }
	const data = {
		name,
		type:  document.getElementById('cat-type').value,
		icon:  document.getElementById('cat-icon').value.trim(),
		color: document.getElementById('cat-color').value,
	};
	try {
		if (catId) {
			const r = await _api.put('/categories/' + catId, data);
			const cat = state.categories.find(function (c) { return c.id === catId; });
			if (cat) Object.assign(cat, r || data);
			showToast('Category updated', 'success');
		} else {
			const r = await _api.post('/categories', data);
			state.categories.push(r);
			showToast('Category created', 'success');
		}
		closeModal(); renderCategoriesPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};


// window.saveCurrency / saveCategory kept for any direct callers; they delegate
// to the _ft* versions above so there is a single source of truth.
window.saveCurrency = async function () { return window._ftSaveCurrency(); };
window.saveCategory = async function (catId) { return window._ftSaveCategory(catId); };

// (saveCurrency implementation is in window._ftSaveCurrency above)

window.updateCurrencyRate = async function (code, value) {
	const rate = parseFloat(value);
	if (isNaN(rate) || rate <= 0) return;
	const cur = state.currencies.find(function (c) { return c.code === code; });
	if (!cur) return;
	cur.rate = rate;
	try {
		await _api.put('/currencies/' + cur.id, cur);
		if (typeof updateCalc === 'function') updateCalc();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

window.deleteCurrency = async function (code) {
	if (state.accounts.some(function (a) { return a.currency === code; })) {
		showToast('Currency is in use by accounts', 'error'); return;
	}
	const cur = state.currencies.find(function (c) { return c.code === code; });
	if (!cur) return;
	try {
		await _api.del('/currencies/' + cur.id);
		state.currencies = state.currencies.filter(function (c) { return c.code !== code; });
		showToast('Currency removed', 'success'); renderCurrenciesPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

window.setBaseCurrency = async function (code) {
	state.baseCurrency = code;
	try {
		await _api.post('/settings', { base_currency: code });
		showToast('Base currency updated', 'success'); renderCurrenciesPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

// ── Recurring ──
window.saveRecurring = async function (recId) {
	const name   = document.getElementById('rec-name').value.trim();
	const amount = parseFloat(document.getElementById('rec-amount').value);
	if (!name)   { showToast('Name required', 'error');   return; }
	if (!amount) { showToast('Amount required', 'error'); return; }
	const accountId = document.getElementById('rec-account').value;
	const acc  = state.accounts.find(function (a) { return a.id == accountId; });
	const tags = document.getElementById('rec-tags').value
		.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
	const data = {
		name,
		type:        document.getElementById('rec-type').value,
		accountId:   parseInt(accountId, 10),
		amount,
		currency:    acc ? acc.currency : 'USD',
		frequency:   document.getElementById('rec-frequency').value,
		nextDate:    document.getElementById('rec-start').value,
		category:    document.getElementById('rec-category').value,
		description: document.getElementById('rec-desc').value.trim(),
		tags,
		active:      document.getElementById('rec-active').value === 'true' ? 1 : 0,
	};
	try {
		if (recId) {
			const r = await _api.put('/recurring/' + recId, data);
			const idx = (state.recurring || []).findIndex(function (x) { return x.id == recId; });
			if (idx !== -1) state.recurring[idx] = r;
			showToast('Updated', 'success');
		} else {
			if (!state.recurring) state.recurring = [];
			const r = await _api.post('/recurring', data);
			state.recurring.push(r);
			showToast('Created', 'success');
		}
		closeModal(); renderRecurringPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

window.postRecurring = async function (recId) {
	try {
		const r = await _api.post('/recurring/' + recId + '/post', {});
		if (r.transaction) state.transactions.unshift(r.transaction);
		const rec = (state.recurring || []).find(function (x) { return x.id == recId; });
		if (rec && r.nextDate) {
			rec.nextDate   = r.nextDate;
			rec.lastPosted = new Date().toISOString().split('T')[0];
		}
		showToast('Transaction posted', 'success'); renderRecurringPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

window.postAllDue = async function () {
	const due = (state.recurring || []).filter(function (r) {
		return r.active && new Date(r.nextDate) <= new Date();
	});
	for (let i = 0; i < due.length; i++) {
		await window.postRecurring(due[i].id);
	}
	if (due.length === 0) showToast('No recurring transactions due', 'success');
};

window.toggleRecurring = async function (recId) {
	const rec = (state.recurring || []).find(function (r) { return r.id == recId; });
	if (!rec) return;
	rec.active = !rec.active;
	try {
		await _api.put('/recurring/' + recId, rec);
		renderRecurringPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

window.deleteRecurring = async function (recId) {
	try {
		await _api.del('/recurring/' + recId);
		state.recurring = (state.recurring || []).filter(function (r) { return r.id != recId; });
		showToast('Deleted', 'success'); renderRecurringPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

// ── Tags ──
window.addTag = async function () {
	const input = document.getElementById('new-tag-input');
	const tag   = input ? input.value.trim().toLowerCase() : '';
	if (!tag || state.tags.includes(tag)) { showToast('Tag already exists or empty', 'error'); return; }
	state.tags.push(tag);
	try {
		await _api.post('/tags', { tags: state.tags });
		input.value = '';
		showToast('Tag added', 'success');
		if (typeof renderTagList === 'function') renderTagList();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

window.deleteTag = async function (tag) {
	state.tags = state.tags.filter(function (t) { return t !== tag; });
	try {
		await _api.post('/tags', { tags: state.tags });
		if (!document.getElementById('tags-list')) renderCategoriesPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

// ── Settings ──
window.saveSettings = async function () {
	const settings = {
		date_format:     document.getElementById('set-datefmt').value,
		week_start:      document.getElementById('set-weekstart').value,
		fy_month:        document.getElementById('set-fymonth').value,
		default_tx_type: document.getElementById('set-txdefault').value,
		base_currency:   document.getElementById('set-basecur').value,
	};
	state.baseCurrency = settings.base_currency;
	try {
		await _api.post('/settings', settings);
		showToast('Settings saved', 'success');
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

window.regenerateApiKey = async function () {
	try {
		const r = await _api.post('/token/regenerate', {});
		state.apiKey = r.token;
		showToast('New API key generated', 'success');
		renderExternalApiPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

window.resetAllData = function () {
	showToast('To reset: use occ app:disable fintrack && occ app:enable fintrack', 'error');
	closeModal();
};

// ── Export / Import ──
window.exportJSON = function () {
	const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
	const a    = document.createElement('a');
	a.href     = URL.createObjectURL(blob);
	a.download = 'fintrack-export-' + new Date().toISOString().split('T')[0] + '.json';
	a.click();
	showToast('Data exported as JSON', 'success');
};

window.exportCSV = function () {
	const headers = ['Date','Type','Account','Amount','Currency','Description','Category','Tags','Notes'];
	const rows = state.transactions.map(function (t) {
		const acc = state.accounts.find(function (a) { return a.id == t.accountId; });
		return [
			t.date, t.type, acc ? acc.name : '', t.amount, t.currency,
			t.description || '', t.category || '',
			(t.tags || []).join(';'), t.notes || '',
		].map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
	});
	const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
	const a    = document.createElement('a');
	a.href     = URL.createObjectURL(blob);
	a.download = 'fintrack-transactions-' + new Date().toISOString().split('T')[0] + '.csv';
	a.click();
	showToast('Transactions exported as CSV', 'success');
};

window.importFile = function (input) {
	const file = input.files[0];
	if (!file) return;
	const reader = new FileReader();
	reader.onload = async function (e) {
		try {
			if (file.name.endsWith('.json')) {
				const imported = JSON.parse(e.target.result);
				if (imported.transactions) {
					let count = 0;
					for (let i = 0; i < imported.transactions.length; i++) {
						const t = imported.transactions[i];
						if (!state.transactions.find(function (x) { return x.id === t.id; })) {
							try {
								const r = await _api.post('/transactions', t);
								state.transactions.unshift(r);
								count++;
							} catch (_) {}
						}
					}
					showToast('Imported ' + count + ' transactions', 'success');
					refreshCurrentPage();
				}
			}
		} catch (err) { showToast('Failed to parse file', 'error'); }
	};
	reader.readAsText(file);
};

// ══════════════════════════════════════════════
//  BOOT — load all data from API on page ready
// ══════════════════════════════════════════════
async function boot() {
	try {
		const results = await Promise.all([
			_api.get('/accounts'),
			_api.get('/transactions?limit=1000'),
			_api.get('/transfers'),
			_api.get('/budgets'),
			_api.get('/categories'),
			_api.get('/currencies'),
			_api.get('/recurring'),
			_api.get('/settings'),
			_api.get('/tags'),
		]);
		state.accounts     = results[0] || [];
		state.transactions = results[1] || [];
		state.transfers    = results[2] || [];
		state.budgets      = results[3] || [];
		state.categories   = results[4] || [];
		state.currencies   = results[5] || [];
		state.recurring    = results[6] || [];
		state.settings     = results[7] || {};
		state.tags         = results[8] || [];
		state.baseCurrency = (results[7] && results[7].base_currency) || 'USD';
		state.apiKey       = CFG.apiToken       || '';
		state.externalFormUrl = CFG.externalFormUrl || '';
	} catch (e) {
		console.error('FinTrack boot error:', e);
		showToast('Failed to load data — check the Nextcloud log', 'error');
	}
}

// ══════════════════════════════════════════════
//  DOM READY
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async function () {
	// Wire sidebar navigation
	document.querySelectorAll('.ft-nav-item[data-page]').forEach(function (el) {
		el.addEventListener('click', function (e) {
			e.preventDefault();
			navigate(el.dataset.page);
		});
	});

	// Wire modal close
	const overlay = document.getElementById('ft-modal-overlay');
	document.getElementById('ft-modal-close').addEventListener('click', closeModal);
	overlay.addEventListener('click', function (e) {
		if (e.target === overlay) closeModal();
	});

	// Keyboard shortcuts
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape') closeModal();
	});

	// Load data then render dashboard
	await boot();
	navigate('dashboard');
	showToast('Welcome to FinTrack!', 'success');
});

})();

// ── NC32 delegation anchors ──────────────────────────────────────────────────
// Captured HERE (end of main.js, before core.js loads) so that when core.js
// hoists its function declarations over window.*, the _ft* names still point
// to these async API implementations.
window._ftSaveAccount     = window.saveAccount;
window._ftSaveTransaction = window.saveTransaction;
window._ftSaveTransfer    = window.saveTransfer;
window._ftAddTag          = window.addTag;
window._ftSaveRecurring   = window.saveRecurring;
window._ftPostRecurring   = window.postRecurring;
window._ftPostAllDue      = window.postAllDue;
window._ftSaveSettings    = window.saveSettings;
window._ftSetBaseCurrency = window.setBaseCurrency;
// resetAllData in main.js is already the correct NC message; keep it
window._ftResetAllData    = window.resetAllData;
