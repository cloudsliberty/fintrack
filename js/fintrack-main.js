// FinTrack for Nextcloud 32 — Main Entry Point
// Reads config from #fintrack-config data attribute (CSP-safe, no inline script needed).
(function () {
'use strict';

// ── Config (injected via data attribute in main.php, no inline JS needed) ──
const configEl  = document.getElementById('fintrack-config');
const CFG       = configEl ? JSON.parse(configEl.dataset.config || '{}') : {};
const API_BASE  = CFG.apiBase || (window.location.origin + '/index.php/apps/fintrack/api');

// ── ResizeObserver loop warning suppression ────────────────────────────────
// "ResizeObserver loop completed with undelivered notifications." is a
// harmless browser-level message, not a real error: it fires whenever a
// ResizeObserver callback changes layout in a way that would need another
// notification pass within the same frame, and the browser just defers that
// pass to the next frame instead of delivering it immediately. Nothing is
// broken and nothing needs to be caught or retried — Chrome/Firefox report
// it as a window 'error' event purely because that's the only channel they
// have for surfacing it, which is why Nextcloud's own client-side error
// logging was picking it up and writing it to the server log as if it were
// a real bug in this app. Neither this app's code nor the page reporting it
// actually create the ResizeObserver in question — Nextcloud's own
// responsive layout (the main content/sidebar containers) uses one, and any
// page open at the time gets blamed for whichever observer trips the
// warning. This listener only silences those two specific benign messages;
// every other error still logs and surfaces normally.
window.addEventListener('error', function (e) {
	if (e && (e.message === 'ResizeObserver loop completed with undelivered notifications.'
		|| e.message === 'ResizeObserver loop limit exceeded')) {
		e.stopImmediatePropagation();
		if (e.preventDefault) e.preventDefault();
	}
}, true);

// ── Telemetry ping ──────────────────────────────────────────────────────
// Sent from three places: the once-ever welcome screen, the periodic
// anniversary check-in (~3x/year), and the monthly "enjoying FinTrack?"
// donation reminder when it's dismissed/skipped.
// All three send the same payload: timestamp, instance ID, Nextcloud
// version, FinTrack version, and (optionally) country, for adoption/
// compatibility stats. instance_id is a random ID generated once for
// this install (see the telemetry_id app config value / Version1005
// migration) — not tied to any person or account.
// No name, email, account identifiers, or financial data of any kind are
// ever included in the payload. Settings → About (telemetry_monthly_enabled)
// controls only whether the country is included — the ping itself always
// fires and the monthly donation reminder it's sent alongside can't be
// turned off.
const USAGE_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyLNwI9c-Nknf1TEgKcBOuHwcCVNszKylRcqR7g1N7WDHCfFhPigbBRUb4sR_VxleM_ZQ/exec';

function sendTelemetryPing(country, options) {
	options = options || {};
	try {
		// telemetry_monthly_enabled now controls ONLY whether the country is
		// shared — the ping itself always goes out from the three places
		// listed above; it's never blocked entirely.
		const shareCountry = !state.settings || state.settings.telemetry_monthly_enabled !== '0';
		// All three call sites (welcome screen, anniversary check-in, monthly
		// donation reminder) now send the same full payload.
		const payload = {
			timestamp:   new Date().toISOString(),
			instanceId:  CFG.instanceId || '',
			country:     shareCountry ? (country || 'world') : '',
			ncVersion:   CFG.nextcloudVersion || '',
			ftVersion:   CFG.fintrackVersion || '',
		};
		const params = new URLSearchParams(payload);
		// mode: 'no-cors' — Google Apps Script's GET response doesn't carry
		// CORS headers, and we don't need to read the response anyway; this
		// is a fire-and-forget ping, never something the UI waits on.
		fetch(USAGE_WEBHOOK_URL + '?' + params.toString(), { method: 'GET', mode: 'no-cors' }).catch(function () {});
	} catch (e) { /* never let a failed ping affect the app itself */ }
}

// A reasonably complete country list for the welcome screen / settings
// dropdown. Exposed on window so fintrack-core.js (which renders the
// Settings page) can reuse the same list without duplicating it.
const FT_COUNTRIES = ['Afghanistan','Albania','Algeria','Andorra','Angola','Argentina','Armenia','Australia','Austria','Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin','Bhutan','Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi','Cambodia','Cameroon','Canada','Cape Verde','Central African Republic','Chad','Chile','China','Colombia','Comoros','Congo','Costa Rica','Croatia','Cuba','Cyprus','Czech Republic','Denmark','Djibouti','Dominica','Dominican Republic','Ecuador','Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia','Eswatini','Ethiopia','Fiji','Finland','France','Gabon','Gambia','Georgia','Germany','Ghana','Greece','Grenada','Guatemala','Guinea','Guinea-Bissau','Guyana','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Ivory Coast','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kiribati','Kosovo','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania','Luxembourg','Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Marshall Islands','Mauritania','Mauritius','Mexico','Micronesia','Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar','Namibia','Nauru','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria','North Korea','North Macedonia','Norway','Oman','Pakistan','Palau','Palestine','Panama','Papua New Guinea','Paraguay','Peru','Philippines','Poland','Portugal','Qatar','Romania','Russia','Rwanda','Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines','Samoa','San Marino','Sao Tome and Principe','Saudi Arabia','Senegal','Serbia','Seychelles','Sierra Leone','Singapore','Slovakia','Slovenia','Solomon Islands','Somalia','South Africa','South Korea','South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden','Switzerland','Syria','Taiwan','Tajikistan','Tanzania','Thailand','Timor-Leste','Togo','Tonga','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Tuvalu','Uganda','Ukraine','United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan','Vanuatu','Vatican City','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe','Other'];

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
	categoryRules:   [],
	settings:        {},
	apiKey:          CFG.apiToken || '',
	externalFormUrl: CFG.externalFormUrl || '',
};

window.FT_COUNTRIES = FT_COUNTRIES;
window.FT_INSTANCE_ID = CFG.instanceId || '';
// App version — read once server-side via IAppManager::getAppVersion() (Nextcloud
// already caches app info, so this is a fast lookup, not an XML re-parse) and handed
// down through the config blob. Never hardcode the version string in JS.
window.FT_VERSION = CFG.fintrackVersion || '';

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

// ── Critical error log (item 12) ──────────────────────────────────────────
// A rolling FIFO buffer of the last 100 client-side errors, kept in
// localStorage so it survives reloads without touching any server-side
// table. Captures uncaught JS exceptions, unhandled promise rejections, and
// failed API calls — the three most useful sources for debugging a report
// from a user. Exposed via a "Download Logs" button in Settings → Data
// Management (ftDownloadErrorLogs below).
const FT_ERROR_LOG_KEY = 'fintrack_error_log_v1';
const FT_ERROR_LOG_MAX = 100;

function ftReadErrorLog() {
	try {
		const raw = localStorage.getItem(FT_ERROR_LOG_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed : [];
	} catch (e) {
		return [];
	}
}

function ftLogError(entry) {
	try {
		let log = ftReadErrorLog();
		log.push(Object.assign({ ts: new Date().toISOString() }, entry));
		// Rolling FIFO — drop the oldest entries once over the cap.
		if (log.length > FT_ERROR_LOG_MAX) log = log.slice(log.length - FT_ERROR_LOG_MAX);
		localStorage.setItem(FT_ERROR_LOG_KEY, JSON.stringify(log));
	} catch (e) {
		// Storage unavailable/full — never let logging itself break the app.
	}
}

window.addEventListener('error', function (e) {
	ftLogError({
		type:    'error',
		message: e.message || 'Unknown error',
		source:  e.filename || '',
		line:    e.lineno || 0,
		col:     e.colno || 0,
		stack:   e.error && e.error.stack ? e.error.stack : '',
	});
});

window.addEventListener('unhandledrejection', function (e) {
	const reason = e.reason;
	ftLogError({
		type:    'unhandledrejection',
		message: (reason && (reason.message || String(reason))) || 'Unhandled promise rejection',
		stack:   reason && reason.stack ? reason.stack : '',
	});
});

// Compiles the cached log into a plain-text file and triggers a browser
// download — the "Download Logs" action in Settings → Data Management.
window.ftDownloadErrorLogs = function () {
	const log = ftReadErrorLog();

	// Instance identifier: FinTrack's random per-install ID (32 hex chars, see
	// the telemetry_id app config value), shown in UUID form. Not tied to any
	// person or account, so it's safe to share in a bug report.
	let uuid = window.FT_INSTANCE_ID || '';
	if (/^[0-9a-f]{32}$/i.test(uuid)) {
		uuid = [uuid.slice(0, 8), uuid.slice(8, 12), uuid.slice(12, 16), uuid.slice(16, 20), uuid.slice(20)].join('-');
	}

	// Header first, so a bug report always says which install/version it came from.
	const header = [
		'FinTrack log file',
		'Nextcloud instance UUID: ' + (uuid || 'unknown'),
		'FinTrack version: ' + (window.FT_VERSION || 'unknown'),
		'Nextcloud version: ' + (CFG.nextcloudVersion || 'unknown'),
		'Generated: ' + new Date().toISOString(),
		'Entries: ' + log.length,
		'='.repeat(60),
	].join('\n');

	const body = log.length
		? log.map(function (e) {
			let line = '[' + e.ts + '] ' + (e.type || 'error') + ': ' + (e.message || '');
			if (e.source) line += ' (' + e.source + ':' + e.line + ':' + e.col + ')';
			if (e.stack)  line += '\n' + e.stack;
			return line;
		}).join('\n\n')
		: '(no errors captured on this device yet)';

	const blob = new Blob([header + '\n\n' + body + '\n'], { type: 'text/plain' });
	const url  = URL.createObjectURL(blob);
	const a    = document.createElement('a');
	a.href     = url;
	a.download = 'fintrack-error-log-' + new Date().toISOString().slice(0, 10) + '.txt';
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
};

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

	let res;
	try {
		res = await fetch(url, Object.assign({}, options, {
			credentials: 'same-origin',
			headers:     headers,
		}));
	} catch (networkErr) {
		ftLogError({ type: 'network', message: networkErr.message || 'Network request failed', source: method + ' ' + path });
		throw networkErr;
	}

	if (!res.ok) {
		const err = await res.json().catch(function () { return { error: res.statusText }; });
		ftLogError({ type: 'api', message: err.error || res.statusText, source: method + ' ' + path + ' (' + res.status + ')' });
		const e = new Error(err.error || res.statusText);
		e.data = err;
		throw e;
	}
	return res.json();
}

window._api = {
	get:  function (path)         { return apiFetch(path); },
	post: function (path, body)   { return apiFetch(path, { method: 'POST',   body: JSON.stringify(body || {}) }); },
	put:  function (path, body)   { return apiFetch(path, { method: 'PUT',    body: JSON.stringify(body || {}) }); },
	del:  function (path)         { return apiFetch(path, { method: 'DELETE' }); },
};

// Looks up a live conversion rate (via the Frankfurter API, proxied through
// our own backend to sidestep CORS/CSP) and fills it into the given input.
// Used by the transaction form, the transfer form, and the Currencies page.
window.fetchOnlineRate = async function (fromCode, toCode, targetInputId, buttonEl, onSuccessFn) {
	if (!fromCode || !toCode) return;
	const original = buttonEl ? buttonEl.textContent : null;
	if (buttonEl) { buttonEl.textContent = '…'; buttonEl.disabled = true; }
	try {
		const data = await _api.get('/exchange-rate?from=' + encodeURIComponent(fromCode) + '&to=' + encodeURIComponent(toCode));
		const input = document.getElementById(targetInputId);
		if (input && data.rate) {
			input.value = data.rate;
			// Remember it locally too (server already persisted it), so it's
			// available immediately without waiting for a reload/re-fetch of settings.
			if (!state.settings) state.settings = {};
			state.settings['fx_last_rate_' + fromCode + '_' + toCode] = data.rate;
			state.settings['fx_last_rate_ts_' + fromCode + '_' + toCode] = String(Math.floor(Date.now() / 1000));
			// Refresh whichever "Last updated" sub-label sits next to this input,
			// if any (Transaction/Transfer modals each have their own).
			const updatedEl = document.getElementById(targetInputId + '-updated') || document.getElementById(targetInputId.replace(/-fetch$/, '') + '-updated');
			if (updatedEl && typeof getLastFetchedRateLabel === 'function') {
				updatedEl.textContent = getLastFetchedRateLabel(fromCode, toCode);
			}
			showToast(`Fetched 1 ${fromCode} = ${data.rate} ${toCode}`, 'success');
			if (onSuccessFn && typeof window[onSuccessFn] === 'function') {
				window[onSuccessFn](toCode, data.rate);
			}
		}
	} catch (e) {
		if (e.data && e.data.needsApiKey) {
			showToast(e.message + ' (Settings → Currency Rate API Key)', 'error');
		} else {
			showToast(e.message || 'Could not fetch the online rate', 'error');
		}
	} finally {
		if (buttonEl) { buttonEl.textContent = original; buttonEl.disabled = false; }
	}
};

// ══════════════════════════════════════════════
//  MODAL
// ══════════════════════════════════════════════
window.openModal = function (title, bodyHTML) {
	document.getElementById('ft-modal-title').textContent = title;
	document.getElementById('ft-modal-body').innerHTML    = bodyHTML;
	document.getElementById('ft-modal-overlay').classList.remove('ft-hidden');
};

// Armed by showDonationReminderModal() right before it opens; null the rest
// of the time, so closing any *other* modal never triggers a ping.
let _pendingDonationPingCountry = null;

window.closeModal = function () {
	document.getElementById('ft-modal-overlay').classList.add('ft-hidden');
	document.getElementById('ft-modal-body').innerHTML = '';
	if (_pendingDonationPingCountry !== null) {
		sendTelemetryPing(_pendingDonationPingCountry);
		_pendingDonationPingCountry = null;
	}
};

// ══════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════
// Every-app-open toast. Was a static "Welcome to FinTrack!" every single
// time, which reads oddly once someone isn't a first-time user anymore.
// Now: "Welcome back" or a time-of-day greeting, picked at random per load.
function greetingToast() {
	const hour = new Date().getHours();
	const timeGreeting = hour < 12 ? 'Good morning!' : hour < 18 ? 'Good afternoon!' : 'Good evening!';
	const options = ['Welcome back!', timeGreeting];
	return options[Math.floor(Math.random() * options.length)];
}

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
		case 'external-api':       navigate('settings');             break; // merged into Settings
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
		type:          document.getElementById('acc-type').value,
		currency:      document.getElementById('acc-currency').value,
		icon:          document.getElementById('acc-icon').value.trim(),
		color:         document.getElementById('acc-color').value,
		description:   document.getElementById('acc-desc').value.trim(),
		active:        document.getElementById('acc-active').value === 'true' ? 1 : 0,
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
	} catch (e) {
		if (e.data && e.data.markedInactive) {
			const acc = state.accounts.find(function (a) { return a.id == accountId; });
			if (acc) acc.active = false;
			openModal('Account In Use', '<p style="font-size:14px;color:var(--text-2)">' + escHtml(e.message) + '</p>');
			refreshCurrentPage();
			return;
		}
		showToast(e.message || 'Cannot delete account', 'error');
	}
};

// ── Transactions ──
window.saveTransaction = async function (txId) {
	const amount    = parseFloat(document.getElementById('tx-amount').value);
	const accountId = document.getElementById('tx-account').value;
	if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
	const acc  = state.accounts.find(function (a) { return a.id == accountId; });
	const tags = document.getElementById('tx-tags').value
		.split(',').map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
	const newTags = tags.filter(function (t) { return !state.tags.includes(t); });
	newTags.forEach(function (t) { state.tags.push(t); });

	// Conversion rate to the base currency — only relevant when this
	// transaction's currency differs from the base currency. The server
	// freezes it on this transaction only; the currency's own rate on file
	// is changed from the Currencies page, never as a side effect here.
	let conversionRate = null;
	if (acc && acc.currency !== state.baseCurrency) {
		const rateInput = document.getElementById('tx-convrate');
		const rateVal = rateInput ? parseFloat(rateInput.value) : NaN;
		if (rateVal > 0) conversionRate = rateVal;
	}

	const data = {
		type:        document.getElementById('tx-type').value,
		accountId:   parseInt(accountId, 10),
		amount,
		currency:    acc ? acc.currency : 'USD',
		conversionRate,
		description: document.getElementById('tx-desc').value.trim(),
		category:    document.getElementById('tx-category').value,
		tags,
		notes:       document.getElementById('tx-notes').value.trim(),
		date:        document.getElementById('tx-date').value,
		// Custom reminder date → Nextcloud alert on that day; null clears it.
		reminderDate: (document.getElementById('tx-reminder') || {}).value || null,
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
		// Persist any newly-typed tags so they show up in autosuggest next time.
		if (newTags.length) {
			try { await _api.post('/tags', { tags: state.tags }); } catch (_) {}
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

// ── Transactions recycle bin ──
// TransactionsController::destroy() already soft-deletes server-side (see
// TransactionService::delete()), so the removal above just needs to drop
// the item from the in-memory list — it isn't gone, it's recoverable
// through these until the 100-item cap or a permanent delete.
window._ftGetTrash = async function () {
	return (await _api.get('/transactions/trash')) || [];
};

window._ftRestoreTransaction = async function (id) {
	const restored = await _api.post('/transactions/trash/' + id + '/restore');
	state.transactions.push(restored);
	return restored;
};

window._ftPermanentlyDeleteTransaction = async function (id) {
	await _api.del('/transactions/trash/' + id);
};

window._ftEmptyTransactionTrash = async function () {
	await _api.post('/transactions/trash/empty');
};

// Balances, totals and reports are computed client-side from state.transactions,
// so it must hold EVERY transaction, not just the first page. Pages through
// /transactions (newest first, stable order) until a short page comes back.
async function fetchAllTransactions() {
	const PAGE = 1000;
	const all = [];
	for (let offset = 0; ; offset += PAGE) {
		const page = (await _api.get('/transactions?limit=' + PAGE + '&offset=' + offset)) || [];
		for (let i = 0; i < page.length; i++) all.push(page[i]);
		if (page.length < PAGE) break;
	}
	return all;
}

// ── CSV Import ──
window._ftImportCsvTransactions = async function (accountId, rows) {
	try {
		const r = await _api.post('/transactions/import', {
			accountId: parseInt(accountId, 10),
			transactions: rows,
		});
		// Refresh transactions from the server rather than guessing details
		// locally — every created/updated row's id is what a later
		// re-export/re-import round-trip matches against for upserts.
		state.transactions = await fetchAllTransactions();
		refreshCurrentPage();
		showCsvImportResults(r);
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
	const rateInput = document.getElementById('tr-convrate');
	const manualRate = rateInput ? parseFloat(rateInput.value) : NaN;
	const rate = (manualRate > 0) ? manualRate : getRate(fromAcc.currency, toAcc.currency);
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
		// A manually-typed rate updates that currency's stored rate too, same
		// as the transaction form does, so it becomes the new default going forward.
		if (manualRate > 0 && toAcc.currency !== fromAcc.currency) {
			await window.updateCurrencyRate(toAcc.currency, manualRate);
		}
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
			const cat = state.categories.find(function (c) { return c.id == catId; });
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
		// Re-render so the "1 base = X.XXXX" column and the derived state
		// (fetched-rate cache, etc.) reflect the new value immediately —
		// previously this only appeared after a manual browser refresh.
		if (typeof renderCurrenciesPage === 'function' && document.getElementById('page-currencies')) renderCurrenciesPage();
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

// Per-currency live-rate provider preference: 'auto' (try frankfurter.dev,
// fall back to exchangerate.host), 'frankfurter', or 'exchangerate_host'.
// Stored as a plain settings key so no DB migration is needed.
window.setCurrencyApiPref = async function (code, pref) {
	if (!state.settings) state.settings = {};
	state.settings['fx_api_pref_' + code] = pref;
	try {
		await _api.post('/settings', { ['fx_api_pref_' + code]: pref });
		showToast('Rate provider updated for ' + code, 'success');
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
		.split(',').map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
	const newTags = tags.filter(function (t) { return !state.tags.includes(t); });
	newTags.forEach(function (t) { state.tags.push(t); });
	const endDate = document.getElementById('rec-end').value;
	if (endDate && document.getElementById('rec-start').value && endDate < document.getElementById('rec-start').value) {
		showToast('"Ends On" date must be after the start date', 'error'); return;
	}
	const data = {
		name,
		type:        document.getElementById('rec-type').value,
		accountId:   parseInt(accountId, 10),
		amount,
		currency:    acc ? acc.currency : 'USD',
		frequency:   document.getElementById('rec-frequency').value,
		nextDate:    document.getElementById('rec-start').value,
		endDate:     endDate || null,
		category:    document.getElementById('rec-category').value,
		description: document.getElementById('rec-desc').value.trim(),
		tags,
		active:      document.getElementById('rec-active').value === 'true' ? 1 : 0,
		alertEnabled: document.getElementById('rec-alert').value === 'true',
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
		if (newTags.length) {
			try { await _api.post('/tags', { tags: state.tags }); } catch (_) {}
		}
		closeModal(); renderRecurringPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

// ── Categories & Tags: export / import / create defaults ──
window.exportCategoriesAndTags = async function () {
	try {
		const data = await _api.get('/categories/export');
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'fintrack-categories-tags-' + new Date().toISOString().split('T')[0] + '.json';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		showToast('Exported', 'success');
	} catch (e) { showToast(e.message || 'Export failed', 'error'); }
};

window.importCategoriesAndTags = function (input) {
	const file = input.files[0];
	if (!file) return;
	const reader = new FileReader();
	reader.onload = async function (e) {
		try {
			const data = JSON.parse(e.target.result);
			const result = await _api.post('/categories/import', {
				categories: data.categories || [],
				tags:       data.tags || [],
			});
			state.categories = (await _api.get('/categories')) || state.categories;
			state.tags       = (await _api.get('/tags')) || state.tags;
			showToast(`Imported ${result.importedCategories} categories, ${result.importedTags} tags`, 'success');
			refreshCurrentPage();
		} catch (err) { showToast('Invalid or unreadable file', 'error'); }
	};
	reader.readAsText(file);
	input.value = '';
};

window.createDefaultCategoriesAndTags = async function () {
	try {
		const result = await _api.post('/categories/create-defaults', {});
		state.categories = (await _api.get('/categories')) || state.categories;
		state.tags       = (await _api.get('/tags')) || state.tags;
		showToast(`Created ${result.createdCategories} categories, ${result.createdTags} tags`, 'success');
		refreshCurrentPage();
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
		showToast('Transaction posted', 'success');
		// Use refreshCurrentPage (not renderRecurringPage) so this also works
		// when triggered from the dashboard's Upcoming Recurring card.
		refreshCurrentPage();
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
		// The Manage Tags modal sits on top of the Categories & Tags page, so
		// that page also needs refreshing now — otherwise its tag chips stay
		// stale until the user manually reloads, even after the modal closes.
		if (document.getElementById('page-categories') && typeof renderCategoriesPage === 'function') renderCategoriesPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

window.deleteTag = async function (tag) {
	try {
		const r = await _api.post('/tags/delete', { tag: tag });
		state.tags = (r && Array.isArray(r.tags)) ? r.tags : state.tags.filter(function (t) { return t !== tag; });
		if (typeof renderTagList === 'function') renderTagList();
		if (document.getElementById('page-categories') && typeof renderCategoriesPage === 'function') renderCategoriesPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

// Renames a tag everywhere it's used — the saved tag list, every
// transaction, and every recurring rule — not just the Manage Tags list
// itself, so nothing is left referencing the old name afterward.
window.renameTag = async function (oldTag) {
	const input = window.prompt('Rename tag "' + oldTag + '" to:', oldTag);
	if (input === null) return; // cancelled
	const newTag = input.trim().toLowerCase();
	if (!newTag) { showToast('Tag name required', 'error'); return; }
	if (newTag === oldTag) return;
	try {
		const r = await _api.post('/tags/rename', { oldName: oldTag, newName: newTag });
		state.tags = (r && Array.isArray(r.tags)) ? r.tags : state.tags.map(function (t) { return t === oldTag ? newTag : t; });
		// Reflect the rename in every already-loaded transaction/recurring
		// row too, so open views update immediately instead of needing a
		// full reload to pick up what the server just changed.
		state.transactions.forEach(function (t) {
			if (Array.isArray(t.tags) && t.tags.includes(oldTag)) {
				t.tags = Array.from(new Set(t.tags.map(function (tg) { return tg === oldTag ? newTag : tg; })));
			}
		});
		if (Array.isArray(state.recurring)) {
			state.recurring.forEach(function (rec) {
				if (Array.isArray(rec.tags) && rec.tags.includes(oldTag)) {
					rec.tags = Array.from(new Set(rec.tags.map(function (tg) { return tg === oldTag ? newTag : tg; })));
				}
			});
		}
		showToast('Tag renamed', 'success');
		if (typeof renderTagList === 'function') renderTagList();
		if (typeof refreshCurrentPage === 'function') refreshCurrentPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

// ── App Lock (Settings page) ──
window.saveAppLock = async function () {
	const newPin = document.getElementById('set-lock-newpin')?.value || '';
	const currentPin = document.getElementById('set-lock-currentpin')?.value || '';
	const timeoutMinutes = parseInt(document.getElementById('set-lock-timeout')?.value, 10) || 10;
	const resetQuestion = document.getElementById('set-lock-reset-question')?.value.trim() || '';
	const resetAnswer = document.getElementById('set-lock-reset-answer')?.value.trim() || '';
	if (!newPin) { showToast('Enter a PIN of at least 4 characters', 'error'); return; }
	try {
		const result = await _api.post('/lock/setup', {
			newPassword: newPin,
			currentPassword: state.lock?.enabled ? currentPin : undefined,
			timeoutMinutes,
			resetQuestion: resetQuestion || undefined,
			resetAnswer: resetAnswer || undefined,
		});
		state.lock = result;
		showToast('Pin Lock saved', 'success');
		ftLockResetInactivityTimer();
		refreshCurrentPage();
	} catch (e) { showToast(e.message || 'Could not save Pin Lock', 'error'); }
};

window.disableAppLock = async function () {
	const currentPin = document.getElementById('set-lock-currentpin')?.value || '';
	if (!currentPin) { showToast('Enter your current PIN to disable Pin Lock', 'error'); return; }
	const pwaOn = state.settings && state.settings.pwa_enabled !== '0';
	if (pwaOn && !window.confirm('The PWA requires a PIN Lock, so disabling Pin Lock will also disable PWA access. Continue?')) {
		return;
	}
	try {
		const result = await _api.post('/lock/disable', { currentPassword: currentPin });
		state.lock = result;
		if (pwaOn) {
			if (!state.settings) state.settings = {};
			state.settings.pwa_enabled = '0';
			await _api.post('/settings', { pwa_enabled: '0' }).catch(function () {});
		}
		showToast('Pin Lock disabled', 'success');
		if (FT_LOCK.inactivityTimer) clearTimeout(FT_LOCK.inactivityTimer);
		refreshCurrentPage();
	} catch (e) { showToast(e.message || 'Could not disable Pin Lock', 'error'); }
};

window.testFxApiKey = async function () {
	const input = document.getElementById('set-fx-apikey');
	const btn = document.getElementById('set-fx-apikey-test');
	const status = document.getElementById('set-fx-apikey-status');
	if (!input || !status) return;

	const apiKey = input.value.trim();
	const original = btn ? btn.textContent : null;
	if (btn) { btn.textContent = 'Testing…'; btn.disabled = true; }
	status.style.display = 'block';
	status.style.color = 'var(--text-3)';
	status.textContent = 'Checking key against exchangerate.host…';

	try {
		const result = await _api.post('/exchange-rate/test', { apiKey });
		status.textContent = (result.ok ? '✅ ' : '❌ ') + result.message;
		status.style.color = result.ok ? 'var(--green)' : 'var(--red)';
	} catch (e) {
		status.textContent = '❌ ' + (e.message || 'Key test failed');
		status.style.color = 'var(--red)';
	} finally {
		if (btn) { btn.textContent = original; btn.disabled = false; }
	}
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
	// The server never sends the stored FX API key back (GET /settings only
	// reports exchangerate_host_api_key_set), so a blank field means "keep
	// the saved key" — only send the key when a new one was typed.
	const fxKey = document.getElementById('set-fx-apikey').value.trim();
	if (fxKey) settings.exchangerate_host_api_key = fxKey;
	state.baseCurrency = settings.base_currency;
	try {
		await _api.post('/settings', settings);
		// Keep in-memory state.settings in sync with what was just saved. The
		// key itself is deliberately not kept client-side (backups exclude it).
		if (!state.settings) state.settings = {};
		Object.assign(state.settings, settings);
		if (fxKey) {
			delete state.settings.exchangerate_host_api_key;
			state.settings.exchangerate_host_api_key_set = '1';
			const fxInput = document.getElementById('set-fx-apikey');
			if (fxInput) { fxInput.value = ''; fxInput.placeholder = 'Key saved — leave blank to keep it'; }
		}
		showToast('Settings saved', 'success');
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

// ── Auto-Categorization Rules ──
window._ftSaveCategoryRules = async function () {
	try {
		const clean = (state.categoryRules || []).filter(function (r) {
			return (r.pattern || '').trim() && (r.category || '').trim();
		});
		const r = await _api.post('/category-rules', { rules: clean });
		state.categoryRules = r || clean;
		showToast('Category rules saved', 'success');
		refreshCurrentPage();
	} catch (e) { showToast(e.message || 'Failed to save rules', 'error'); }
};

// PWA access requires a PIN Lock (Mandatory PIN Policy). Turning PWA on
// without a PIN set forces PIN creation first instead of silently allowing
// an unlocked PWA. The checkbox itself is reverted if the person doesn't
// have a PIN yet, so the setting never ends up in a contradictory state.
window.togglePwaEnabled = async function (checked) {
	const checkbox = document.getElementById('pwa-enabled-toggle');
	if (checked && !(state.lock && state.lock.enabled)) {
		if (checkbox) checkbox.checked = false;
		showToast('Set a PIN below first — the PWA requires a PIN Lock.', 'error');
		document.getElementById('collapse-body-set-pinlock')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		document.getElementById('set-lock-newpin')?.focus();
		return;
	}
	if (!state.settings) state.settings = {};
	state.settings.pwa_enabled = checked ? '1' : '0';
	try {
		await _api.post('/settings', { pwa_enabled: state.settings.pwa_enabled });
		showToast(checked ? 'PWA access enabled' : 'PWA access disabled', 'success');
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

window.setPwaRetentionDays = async function (value) {
	const days = Math.max(1, Math.min(365, parseInt(value, 10) || 30));
	if (!state.settings) state.settings = {};
	state.settings.pwa_data_retention_days = String(days);
	try {
		await _api.post('/settings', { pwa_data_retention_days: days });
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

// PWA session UID / remote-wipe system (see PwaSessionsController). Lists
// every browser/device that's logged into the PWA, with a Revoke button —
// revoking deletes the session row server-side, which is what the PWA's
// own periodic status check treats as "log out and wipe local data".
window.loadPwaSessionsList = async function () {
	const el = document.getElementById('pwa-sessions-list');
	if (!el) return;
	el.textContent = 'Loading…';
	try {
		const sessions = await _api.get('/pwa-sessions');
		if (!sessions || !sessions.length) {
			el.textContent = 'No PWA devices have logged in yet.';
			return;
		}
		el.innerHTML = sessions.map(function (sess) {
			const lastSeen = sess.lastSeenAt ? new Date(sess.lastSeenAt * 1000).toLocaleString() : 'never';
			return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
				<div>
					<div style="font-size:13px;color:var(--text-1)">${escHtml(sess.label || 'Unknown device')}</div>
					<div style="font-size:11.5px;color:var(--text-3)">Last synced: ${escHtml(lastSeen)}</div>
				</div>
				<button class="btn btn-danger btn-sm" data-action="revokePwaSession('${escHtml(sess.uid)}')">Revoke</button>
			</div>`;
		}).join('');
	} catch (e) {
		el.textContent = 'Could not load PWA sessions.';
	}
};

window.revokePwaSession = async function (uid) {
	if (!window.confirm('Revoke this PWA device? It will be logged out and its cached data wiped the next time it tries to sync.')) return;
	try {
		await _api.del('/pwa-sessions/' + encodeURIComponent(uid));
		showToast('PWA session revoked', 'success');
		loadPwaSessionsList();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

window.regenerateApiKey = async function () {
	try {
		const r = await _api.post('/token/regenerate', {});
		state.apiKey = r.token;
		showToast('New API key generated', 'success');
		renderSettingsPage();
	} catch (e) { showToast(e.message || 'Error', 'error'); }
};

// Restores all FinTrack data from a previously exported JSON backup file,
// via the server (so it's actually persisted to the DB — see
// SettingsController::restore()), then reboots the app with the fresh data.
window._ftRestoreBackup = function (file) {
	const reader = new FileReader();
	reader.onload = async function (e) {
		let imported;
		try {
			imported = JSON.parse(e.target.result);
		} catch (err) {
			showToast('Invalid backup file', 'error');
			return;
		}
		if (!imported || !Array.isArray(imported.accounts) || !Array.isArray(imported.transactions)) {
			showToast('Invalid backup file', 'error');
			return;
		}
		try {
			const r = await _api.post('/settings/restore', imported);
			const n = (r && r.imported && r.imported.transactions) || 0;
			let msg = 'Backup restored — ' + n + ' transaction(s) restored';
			if (r && r.secretsUnreadable) {
				msg += '. Its encrypted secrets (PIN, token, API key) could not be opened on this server and were skipped.';
			} else if (r && r.secretsRestored && r.secretsRestored.length) {
				msg += '. PIN / token / API key recovered from the backup.';
			}
			showToast(msg, 'success');
			await boot();
			navigate('dashboard');
		} catch (err) {
			showToast(err.message || 'Failed to restore backup', 'error');
		}
	};
	reader.onerror = function () { showToast('Could not read backup file', 'error'); };
	reader.readAsText(file);
};

window.resetAllData = async function () {
	try {
		const r = await _api.post('/reset', {});
		closeModal();
		if (r && r.backupFallback) {
			// The server couldn't write the backup into Nextcloud Files (e.g.
			// permissions/quota) — download it in the browser instead so the
			// data isn't lost.
			const blob = new Blob([JSON.stringify(r.backupFallback, null, 2)], { type: 'application/json' });
			const a    = document.createElement('a');
			a.href     = URL.createObjectURL(blob);
			a.download = 'fintrack-backup-' + new Date().toISOString().split('T')[0] + '.json';
			a.click();
			showToast('All FinTrack data has been deleted — backup downloaded (could not save to Files)', 'success');
		} else if (r && r.backupPath) {
			showToast('All FinTrack data has been deleted — backup saved to ' + r.backupPath, 'success');
		} else {
			showToast('All FinTrack data has been deleted', 'success');
		}
		await boot();
		navigate('dashboard');
	} catch (e) {
		showToast(e.message || 'Failed to reset data', 'error');
	}
};

// ══════════════════════════════════════════════
//  PIN GATE — used to require the App Lock PIN before running a sensitive
//  data-management action (backup download, CSV import, full reset), even
//  though the person is already inside an unlocked session. Only prompts
//  when a PIN is actually configured; otherwise runs the action straight away.
// ══════════════════════════════════════════════
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

window.submitPinGate = async function () {
	const input = document.getElementById('pin-gate-input');
	const errEl = document.getElementById('pin-gate-error');
	const pw = input ? input.value : '';
	if (!pw) return;
	try {
		await _api.post('/lock/verify', { password: pw });
		const action = window._pinGateAction;
		window._pinGateAction = null;
		closeModal();
		if (action) action();
	} catch (e) {
		if (errEl) { errEl.textContent = e.message || 'Incorrect PIN'; errEl.style.display = 'block'; }
		if (input) { input.value = ''; input.focus(); }
	}
};

// ── Export / Import ──
window.exportJSON = function () {
	requirePin(async function () {
		// The backup is built on the server (BackupService::compose(), the same
		// document the automatic pre-reset backup writes). The External Access
		// token, PIN Lock and exchange-rate API key are in it, but only inside
		// an encrypted `secrets` block — they never reach the browser in clear.
		let data;
		try {
			data = await _api.get('/settings/backup');
		} catch (err) {
			showToast(err.message || 'Could not create the backup', 'error');
			return;
		}
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const a    = document.createElement('a');
		a.href     = URL.createObjectURL(blob);
		a.download = 'fintrack-export-' + new Date().toISOString().split('T')[0] + '.json';
		a.click();
		showToast('Backup downloaded — keep it somewhere safe', 'success');
	});
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
//  APP LOCK — optional PIN layer on top of Nextcloud's own auth
// ══════════════════════════════════════════════
// See LockService (server-side) for the rate-limiting/lockout design. This
// client side just: (1) blocks the first render behind the PIN screen if a
// PIN is configured, (2) re-shows the same screen after N minutes of no
// mouse/keyboard/touch activity, requiring the PIN again before the app
// underneath becomes interactive again.
const FT_LOCK = {
	status: { enabled: false, timeoutMinutes: 10, lockedUntil: null },
	inactivityTimer: null,
};

async function ftLockLoadStatus() {
	try {
		FT_LOCK.status = await _api.get('/lock/status');
	} catch (e) { /* if the status check itself fails, fail open rather than locking the person out */ }
	return FT_LOCK.status;
}

function ftLockShow(message) {
	// Lockout Cleanup: a PIN prompt appearing over an open modal (e.g. someone
	// mid-edit when the inactivity timeout fires) is confusing and can trap
	// input in a hidden form — close whatever's open first.
	if (typeof window.closeModal === 'function') window.closeModal();
	const overlay = document.getElementById('ft-lock-overlay');
	const err = document.getElementById('ft-lock-error');
	const input = document.getElementById('ft-lock-input');
	if (!overlay) return;
	overlay.classList.remove('ft-hidden');
	if (err) err.textContent = message || '';
	if (input) { input.value = ''; setTimeout(function () { input.focus(); }, 50); }
}

function ftLockHide() {
	const overlay = document.getElementById('ft-lock-overlay');
	if (overlay) overlay.classList.add('ft-hidden');
}

async function ftLockSubmit() {
	const input = document.getElementById('ft-lock-input');
	const err = document.getElementById('ft-lock-error');
	const btn = document.getElementById('ft-lock-submit');
	const pw = input ? input.value : '';
	if (!pw) { if (err) err.textContent = 'Enter your PIN'; return; }
	if (btn) btn.disabled = true;
	try {
		await _api.post('/lock/verify', { password: pw });
		ftLockHide();
		ftLockResetInactivityTimer();
	} catch (e) {
		if (err) err.textContent = (e.data && e.data.error) ? e.data.error : (e.message || 'Incorrect PIN');
	} finally {
		if (btn) btn.disabled = false;
	}
}

// ── Forgot PIN ──
// A lightweight security-question fallback for someone locked out of their
// own app-local PIN. On a correct answer the PIN lock is disabled entirely
// (see LockService::verifyResetAnswer) so the person can log back in and set
// a fresh PIN from Settings → App Lock.
function ftLockShowForgotBox(question) {
	const box = document.getElementById('ft-lock-reset-box');
	const qEl = document.getElementById('ft-lock-reset-question');
	const errEl = document.getElementById('ft-lock-reset-error');
	const ansInput = document.getElementById('ft-lock-reset-answer-input');
	if (!box) return;
	if (qEl) qEl.textContent = question;
	if (errEl) errEl.textContent = '';
	if (ansInput) ansInput.value = '';
	box.classList.remove('ft-hidden');
	if (ansInput) setTimeout(function () { ansInput.focus(); }, 50);
}

function ftLockHideForgotBox() {
	const box = document.getElementById('ft-lock-reset-box');
	if (box) box.classList.add('ft-hidden');
}

// ── Request Admin Approval to Reset PIN ──
// Last-resort fallback for someone locked out with no security question set
// (or who's forgotten the answer too). Files a request an admin can approve
// from Admin Settings → FinTrack → Reset PIN (see LockController::requestAdminReset()).
// Deliberately doesn't block PIN entry or the security-question box above —
// the person can still get back in on their own at any time; doing so
// auto-cancels this request server-side (see LockService::cancelPendingReset()).
function ftLockSetAdminRequestPending(pending) {
	const link = document.getElementById('ft-lock-admin-request');
	if (!link) return;
	if (pending) {
		link.textContent = 'Request sent — waiting for admin approval';
		link.classList.add('ft-lock-admin-pending');
	} else {
		link.textContent = 'Request Admin Approval to Reset PIN';
		link.classList.remove('ft-lock-admin-pending');
	}
}

async function ftLockAdminRequestClick(e) {
	if (e) e.preventDefault();
	const link = document.getElementById('ft-lock-admin-request');
	if (link && link.classList.contains('ft-lock-admin-pending')) return; // already pending — no-op
	try {
		const r = await _api.post('/lock/request-admin-reset', {});
		ftLockSetAdminRequestPending(!!(r && r.pendingAdminReset));
		showToast('Request sent — an admin will need to approve it', 'success');
	} catch (e2) {
		showToast('Could not send the request — please try again', 'error');
	}
}

async function ftLockForgotClick(e) {
	if (e) e.preventDefault();
	const err = document.getElementById('ft-lock-error');
	try {
		const r = await _api.get('/lock/reset-question');
		if (!r || !r.question) {
			if (err) err.textContent = 'No security question was set up for this PIN — see your Nextcloud admin.';
			return;
		}
		ftLockShowForgotBox(r.question);
	} catch (e2) {
		if (err) err.textContent = 'Could not check for a reset question right now.';
	}
}

async function ftLockResetSubmit() {
	const input = document.getElementById('ft-lock-reset-answer-input');
	const errEl = document.getElementById('ft-lock-reset-error');
	const btn = document.getElementById('ft-lock-reset-submit');
	const answer = input ? input.value : '';
	if (!answer) { if (errEl) errEl.textContent = 'Enter your answer'; return false; }
	if (btn) btn.disabled = true;
	try {
		await _api.post('/lock/reset-verify', { answer });
		ftLockHideForgotBox();
		ftLockHide();
		FT_LOCK.status = { enabled: false, timeoutMinutes: FT_LOCK.status.timeoutMinutes || 10, lockedUntil: null };
		showToast('PIN reset — set a new PIN under Settings → Pin Lock', 'success');
		return true;
	} catch (e) {
		if (errEl) errEl.textContent = (e.data && e.data.error) ? e.data.error : (e.message || 'Incorrect answer');
		return false;
	} finally {
		if (btn) btn.disabled = false;
	}
}

// Any interaction resets the countdown; once it elapses with zero activity,
// the lock screen reappears and the person must re-enter their PIN — the
// in-memory app state stays intact underneath, only the overlay reappears.
function ftLockResetInactivityTimer() {
	if (!FT_LOCK.status.enabled) return;
	if (FT_LOCK.inactivityTimer) clearTimeout(FT_LOCK.inactivityTimer);
	const ms = Math.max(1, FT_LOCK.status.timeoutMinutes || 10) * 60 * 1000;
	FT_LOCK.inactivityTimer = setTimeout(function () {
		ftLockShow('Session timed out — enter your PIN to continue');
	}, ms);
}

function ftLockWireActivityListeners() {
	['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(function (evt) {
		document.addEventListener(evt, function () {
			// Don't let typing into the lock screen itself count as "still
			// active" before it's actually been unlocked.
			const overlay = document.getElementById('ft-lock-overlay');
			if (overlay && !overlay.classList.contains('ft-hidden')) return;
			ftLockResetInactivityTimer();
		}, { passive: true });
	});
}

// Called once at boot, before any app data loads — if a PIN is configured,
// the person must clear it before boot()/navigate() ever runs, so the
// dashboard/account data is never rendered behind the lock screen.
async function ftLockGate() {
	await ftLockLoadStatus();
	if (!FT_LOCK.status.enabled) return;

	ftLockShow(FT_LOCK.status.lockedUntil ? 'Too many attempts — try again later' : '');
	ftLockSetAdminRequestPending(!!FT_LOCK.status.pendingAdminReset);
	await new Promise(function (resolve) {
		const submitBtn = document.getElementById('ft-lock-submit');
		const input = document.getElementById('ft-lock-input');
		function tryUnlock() {
			ftLockSubmit().then(function () {
				if (document.getElementById('ft-lock-overlay').classList.contains('ft-hidden')) resolve();
			});
		}
		if (submitBtn) submitBtn.addEventListener('click', tryUnlock);
		if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryUnlock(); });

		const forgotLink = document.getElementById('ft-lock-forgot');
		const adminRequestLink = document.getElementById('ft-lock-admin-request');
		const cancelLink = document.getElementById('ft-lock-reset-cancel');
		const resetBtn   = document.getElementById('ft-lock-reset-submit');
		const answerInput = document.getElementById('ft-lock-reset-answer-input');
		function tryReset() {
			ftLockResetSubmit().then(function (ok) { if (ok) resolve(); });
		}
		if (forgotLink) forgotLink.addEventListener('click', ftLockForgotClick);
		if (adminRequestLink) adminRequestLink.addEventListener('click', ftLockAdminRequestClick);
		if (cancelLink) cancelLink.addEventListener('click', function (e) { e.preventDefault(); ftLockHideForgotBox(); });
		if (resetBtn) resetBtn.addEventListener('click', tryReset);
		if (answerInput) answerInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryReset(); });
	});
}

// ══════════════════════════════════════════════
//  BOOT — load all data from API on page ready
// ══════════════════════════════════════════════
async function boot() {
	try {
		const results = await Promise.all([
			_api.get('/accounts'),
			fetchAllTransactions(),
			_api.get('/transfers'),
			_api.get('/budgets'),
			_api.get('/categories'),
			_api.get('/currencies'),
			_api.get('/recurring'),
			_api.get('/settings'),
			_api.get('/tags'),
			_api.get('/lock/status'),
			_api.get('/category-rules'),
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
		state.lock         = results[9] || { enabled: false, timeoutMinutes: 10 };
		state.categoryRules = results[10] || [];
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
			if (el.dataset.page === 'transactions' && typeof resetTxFilterState === 'function') {
				// A deliberate sidebar click into Transactions starts from a
				// clean slate — unlike an edit/delete refresh or a
				// category/tag/account jump, which intentionally keep (or
				// replace) the current filter bar. See resetTxFilterState()
				// in fintrack-core.js (browser-local only, not server-synced).
				resetTxFilterState();
			}
			navigate(el.dataset.page);
		});
	});

	// Sidebar collapse (icon-only) toggle — a display preference stored in
	// this browser's localStorage, independent of the responsive <900px
	// breakpoint which always collapses regardless of this setting.
	const SIDEBAR_COLLAPSE_KEY = 'fintrack_sidebar_collapsed_v1';
	const root = document.getElementById('fintrack-root');
	try {
		if (localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1') {
			root.classList.add('ft-sidebar-collapsed');
		}
	} catch (e) { /* localStorage unavailable — sidebar just won't remember */ }

	function setSidebarCollapsed(collapsed) {
		root.classList.toggle('ft-sidebar-collapsed', collapsed);
		try { localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0'); } catch (e) {}
	}
	const collapseBtn = document.getElementById('ft-sidebar-toggle');
	const expandBtn = document.getElementById('ft-sidebar-expand');
	if (collapseBtn) collapseBtn.addEventListener('click', function () { setSidebarCollapsed(true); });
	if (expandBtn) expandBtn.addEventListener('click', function () { setSidebarCollapsed(false); });

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

	// App Lock: block everything below until the PIN (if configured) is
	// entered correctly. Must run before boot() so account/transaction data
	// is never fetched or rendered while the lock screen is up.
	await ftLockGate();
	ftLockWireActivityListeners();
	ftLockResetInactivityTimer();

	// Load data then render dashboard
	await boot();
	navigate('dashboard');
	showToast(greetingToast(), 'success');
	checkSpecialNotices();
});

// ══════════════════════════════════════════════
//  FIRST-USE WELCOME / MONTHLY DONATION REMINDER / SPECIAL-DATE POPUPS
// ══════════════════════════════════════════════
// Only one of these shows per page load (they're rare, low-priority
// interruptions, not something to stack): a special date takes priority
// over the once-ever welcome screen, which takes priority over the
// monthly donation nudge.
function checkSpecialNotices() {
	const todayISO = new Date().toISOString().split('T')[0];
	const ymNow = todayISO.slice(0, 7);
	if (!state.settings) state.settings = {};

	// Just upgraded? Show "What's new" once per version (see checkWhatsNew()).
	// An upgrade is rare and more useful than the other notices, so it goes first.
	if (checkWhatsNew()) return;

	const special = getTodaysSpecialDate();
	if (special && state.settings.last_special_date_shown !== todayISO) {
		showSpecialDateModal(special);
		state.settings.last_special_date_shown = todayISO;
		_api.post('/settings', { last_special_date_shown: todayISO }).catch(function () {});
		return;
	}

	if (!state.settings.first_use_date) {
		showWelcomeConsentModal();
		state.settings.first_use_date = todayISO;
		// A brand-new install starts on the current version — no "What's new".
		state.settings.last_seen_version = CFG.fintrackVersion || '';
		_api.post('/settings', { first_use_date: todayISO, last_seen_version: state.settings.last_seen_version }).catch(function () {});
		return;
	}

	// "3 anniversary days a year" — every 4 months from first use, counted
	// from first_use_date, so every FinTrack install gets its own 3 checkpoints
	// spread evenly across the year rather than a single fixed calendar date.
	const anniversary = getAnniversaryCheckpoint(todayISO);
	if (anniversary && state.settings.last_anniversary_shown !== String(anniversary)) {
		showAnniversaryReviewModal(anniversary);
		state.settings.last_anniversary_shown = String(anniversary);
		_api.post('/settings', { last_anniversary_shown: String(anniversary) }).catch(function () {});
		return;
	}

	// The monthly donation reminder always shows once a month — it is NOT
	// gated by telemetry_monthly_enabled, which now controls only whether
	// country info is included in the telemetry ping (see sendTelemetryPing()
	// and Settings → About).
	if (state.settings.last_donation_reminder_ym !== ymNow) {
		showDonationReminderModal();
		state.settings.last_donation_reminder_ym = ymNow;
		_api.post('/settings', { last_donation_reminder_ym: ymNow }).catch(function () {});
	}
}

// ── What's new (shown once after an upgrade) ──
// Headline changes, keyed by exact version. A version with no entry (e.g. a
// small patch release) just records itself and sends the ping — no modal.
const FT_WHATS_NEW = {
	'1.22.0': [
		['🔒', 'Safer settings & backups', 'Lock settings can no longer be changed through the settings API, and backups no longer contain your PIN hashes or exchange-rate API key.'],
		['📊', 'Correct balances for big accounts', 'Accounts with more than 1,000 transactions now show the right balance — everything is loaded, not just the latest page.'],
		['🔁', 'Smarter recurring transactions', 'Overdue rules catch up on their real dates, month-end rules (the 31st) no longer drift, and the currency follows the account.'],
		['🌗', 'Light, dark & automatic PWA theme', 'Pick a look in PWA Settings → Appearance. Automatic switches to dark mode in the evening.'],
		['🔔', 'Clearer alerts', 'Notification-bell alerts now start with "FinTrack:" followed by the transaction description.'],
		['🛠', 'Fixes', 'Disabling PWA access now really disables it, restoring a backup is all-or-nothing, and the PWA works offline on installs without pretty URLs.']
	]
};

// Returns true when it showed (or silently recorded) an upgrade this load.
function checkWhatsNew() {
	const cur = CFG.fintrackVersion || '';
	if (!cur || !state.settings.first_use_date) return false;   // new installs get the welcome screen instead
	if (state.settings.last_seen_version === cur) return false;

	state.settings.last_seen_version = cur;
	_api.post('/settings', { last_seen_version: cur }).catch(function () {});

	// Telemetry: the same minimal ping as everywhere else, so the install ID
	// is recorded against the new FinTrack version. Fires when the modal
	// opens, so dismissing it any way counts.
	sendTelemetryPing(state.settings.telemetry_country || '');

	const items = FT_WHATS_NEW[cur];
	if (!items) return false;

	openModal('🎉 What\'s new in FinTrack ' + escHtml(cur), `
		<div style="padding:2px 4px 4px">
			<p style="font-size:13px;color:var(--text-2);margin-bottom:12px">FinTrack was updated. Here are the biggest changes:</p>
			<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
				${items.map(function (it) {
					return `<div style="display:flex;gap:10px;align-items:flex-start">
						<div style="font-size:20px;line-height:1.2">${it[0]}</div>
						<div><div style="font-size:13.5px;font-weight:600">${escHtml(it[1])}</div>
						<div style="font-size:12.5px;color:var(--text-2);line-height:1.5">${escHtml(it[2])}</div></div>
					</div>`;
				}).join('')}
			</div>
			<button class="btn btn-primary" style="width:100%" data-action="closeModal()">Got it</button>
		</div>
	`);
	return true;
}

// Offered once, right after the welcome screen, when there are no categories
// yet. "Yes" runs the same Settings → Starter Set action.
function showStarterSetPrompt() {
	openModal('Set up starter categories?', `
		<div style="padding:2px 4px 4px">
			<p style="font-size:13.5px;color:var(--text-2);line-height:1.6;margin-bottom:16px">
				Would you like FinTrack to create a default set of <strong>income and expense categories</strong>
				(Groceries, Rent, Salary and more) and some tags to get you started?
				You can also do this later in Settings → Starter Set.
			</p>
			<div style="display:flex;gap:10px">
				<button class="btn btn-primary" style="flex:1" data-action="acceptStarterSet()">Yes, create them</button>
				<button class="btn btn-secondary" style="flex:1" data-action="closeModal()">No thanks</button>
			</div>
		</div>
	`);
}

window.acceptStarterSet = async function () {
	closeModal();
	await window.createDefaultCategoriesAndTags();
};

function getTodaysSpecialDate() {
	const now = new Date();
	const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();

	if (m === 0 && d === 1) {
		return {
			emoji: '🎉',
			title: 'Happy New Year!',
			desc: 'A fresh year, a fresh start for your finances. Take a few minutes today to set a budget, ' +
				  'review last year\'s spending, and set one clear savings goal for the months ahead.',
		};
	}
	if (m === 9 && d === 31) {
		return {
			emoji: '🏦',
			title: 'World Savings Day',
			desc: 'A reminder that small, consistent savings compound into real security over time. ' +
				  'Consider reviewing your accounts today and setting aside a little extra, even if it\'s modest.',
		};
	}
	if (m === 9) {
		const firstOfMonth = new Date(y, 9, 1);
		const firstWednesday = 1 + ((3 - firstOfMonth.getDay() + 7) % 7);
		if (d === firstWednesday) {
			return {
				emoji: '📊',
				title: 'World Financial Planning Day',
				desc: 'A good day to step back from day-to-day spending and look at the bigger picture: ' +
					  'are your budgets realistic, is your emergency fund where it should be, and are you on track for your goals?',
			};
		}
	}
	return null;
}

function getAnniversaryCheckpoint(todayISO) {
	if (!state.settings.first_use_date) return null;
	const start = new Date(state.settings.first_use_date + 'T00:00:00');
	const today = new Date(todayISO + 'T00:00:00');
	if (isNaN(start.getTime())) return null;
	const monthsSinceStart = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
	// Every 4 months (so 3 times a year) on the same day-of-month as first use.
	if (monthsSinceStart > 0 && monthsSinceStart % 4 === 0 && today.getDate() === start.getDate()) {
		return monthsSinceStart;
	}
	return null;
}

function showSpecialDateModal(special) {
	spawnCelebrationEffect();
	openModal(`${special.emoji} ${special.title}`, `
		<div style="text-align:center;padding:8px 4px 4px">
			<div style="font-size:52px;line-height:1;margin-bottom:14px">${special.emoji}</div>
			<p style="font-size:14px;color:var(--text-2);line-height:1.7;margin-bottom:20px">${special.desc}</p>
			<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:16px">
				<a href="https://www.paypal.me/jaleel1618" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;background:#ffc439;color:#111;font-weight:700;font-size:13px;padding:8px 16px;border-radius:6px;text-decoration:none">Donate via PayPal</a>
				<a href="https://ko-fi.com/jaleel1618" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;background:#ff5e5b;color:#fff;font-weight:700;font-size:13px;padding:8px 16px;border-radius:6px;text-decoration:none">☕ Donate via Ko-fi</a>
			</div>
			<button class="btn btn-primary" data-action="closeModal()">Thanks!</button>
		</div>
	`);
}

// A brief, lightweight "confetti" effect — a handful of emoji drifting down
// the screen for a few seconds. Purely decorative, removes itself.
function spawnCelebrationEffect() {
	const layer = document.createElement('div');
	layer.className = 'ft-celebration-layer';
	const emojis = ['🎉', '✨', '💰', '⭐', '🎊'];
	for (let i = 0; i < 24; i++) {
		const span = document.createElement('span');
		span.className = 'ft-celebration-piece';
		span.textContent = emojis[i % emojis.length];
		span.style.left = Math.random() * 100 + 'vw';
		span.style.animationDelay = (Math.random() * 1.2) + 's';
		span.style.animationDuration = (2.2 + Math.random() * 1.6) + 's';
		span.style.fontSize = (16 + Math.random() * 14) + 'px';
		layer.appendChild(span);
	}
	document.body.appendChild(layer);
	setTimeout(function () { layer.remove(); }, 4500);
}

// First-run welcome screen. Shows a short, plain-language version of the
// telemetry notice (the full version lives in Settings → About) and offers
// an optional country selector — nothing else is collected here. Whatever
// the person chooses (including "prefer not to say") is saved so later
// pings can reuse it, and a single minimal ping is sent right away.
function showWelcomeConsentModal() {
	openModal('Welcome to FinTrack! 👋', `
		<div style="padding:4px 4px 4px">
			<div style="text-align:center;margin-bottom:6px">
				<div style="font-size:44px;line-height:1;margin-bottom:10px">💰</div>
				<p style="font-size:13.5px;color:var(--text-2);line-height:1.6;margin-bottom:16px">
					FinTrack helps you track accounts, budgets, and spending across multiple currencies — all inside your own Nextcloud.
				</p>
			</div>
			<div class="form-group">
				<label>Country <span style="font-weight:400;color:var(--text-3)">(optional)</span></label>
				<select id="welcome-country">
					<option value="">Prefer not to say</option>
					${FT_COUNTRIES.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
				</select>
			</div>
			<p style="font-size:11.5px;color:var(--text-3);line-height:1.6;margin-bottom:14px">
				FinTrack sends your country information to the developer only to understand adoption and regional
				usage trends. No financial data is ever collected.
			</p>
			<button class="btn btn-primary" style="width:100%" data-action="submitWelcomeConsent()">Continue</button>
			<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px">
				<a href="https://github.com/cloudsliberty/fintrack/blob/main/docs/MANUAL.md" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="text-decoration:none">Read the Manual</a>
				<a href="https://www.paypal.me/jaleel1618" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;background:#ffc439;color:#111;font-weight:700;font-size:13px;padding:8px 16px;border-radius:6px;text-decoration:none">Donate via PayPal</a>
			</div>
		</div>
	`);
}

window.submitWelcomeConsent = function () {
	const country = (document.getElementById('welcome-country')?.value || '').trim();

	state.settings.telemetry_country = country;
	_api.post('/settings', { telemetry_country: country }).catch(function () {});

	// Welcome screen now sends the same full payload as the other two
	// ping sites (see sendTelemetryPing() above).
	sendTelemetryPing(country);

	closeModal();
	showToast('Welcome to FinTrack!', 'success');
	// First open: offer the default income/expense categories if there are none.
	if (!(state.categories && state.categories.length)) {
		setTimeout(showStarterSetPrompt, 0);
	}
};

// Anniversary review — shown 3 times a year (see getAnniversaryCheckpoint).
// A one-tap happy/neutral/sad review. The tap itself is only used to pick
// the toast shown afterward — the telemetry ping sent alongside it carries
// just the same minimal fields as everywhere else (instance ID, country if
// provided, and version numbers), never the review choice itself.
function showAnniversaryReviewModal(monthsSinceStart) {
	const years  = Math.floor(monthsSinceStart / 12);
	const months = monthsSinceStart % 12;
	let timeLabel;
	if (years > 0 && months > 0) timeLabel = `${years} year${years > 1 ? 's' : ''} and ${months} month${months > 1 ? 's' : ''}`;
	else if (years > 0) timeLabel = `${years} year${years > 1 ? 's' : ''}`;
	else timeLabel = `${months} months`;

	spawnCelebrationEffect();
	openModal('🎈 Time flies!', `
		<div style="text-align:center;padding:8px 4px 4px">
			<div style="font-size:44px;line-height:1;margin-bottom:14px">🎈</div>
			<p style="font-size:14px;color:var(--text-2);line-height:1.7;margin-bottom:18px">
				You've been tracking your finances with FinTrack for ${timeLabel} now. Thanks for sticking with it! 
				How's FinTrack working out for you?
			</p>
			<div style="display:flex;justify-content:center;gap:18px;margin-bottom:6px">
				<button class="ft-emoji-btn" style="font-size:34px;background:none;border:none;cursor:pointer;padding:6px 10px;border-radius:10px" data-action="submitAnniversaryReview('good')" title="Happy">😊</button>
				<button class="ft-emoji-btn" style="font-size:34px;background:none;border:none;cursor:pointer;padding:6px 10px;border-radius:10px" data-action="submitAnniversaryReview('neutral')" title="Neutral">😐</button>
				<button class="ft-emoji-btn" style="font-size:34px;background:none;border:none;cursor:pointer;padding:6px 10px;border-radius:10px" data-action="submitAnniversaryReview('bad')" title="Sad">😞</button>
			</div>
		</div>
	`);
}

window.submitAnniversaryReview = function (score) {
	const country = state.settings.telemetry_country || '';

	sendTelemetryPing(country);

	closeModal();
	showToast('Thanks for the feedback! 🙏', 'success');
};

// The monthly donation reminder doesn't have its own "skip" handler — closing
// it any way (the "Maybe later" button or the modal's × button) goes through
// the shared closeModal() below, which is what actually fires the ping. This
// arms that one-shot behavior for as long as this particular modal is open.
function showDonationReminderModal() {
	const country = state.settings.telemetry_country || '';
	_pendingDonationPingCountry = country;
	openModal('Enjoying FinTrack? 😊', `
		<div style="text-align:center;padding:8px 4px 4px">
			<div style="font-size:40px;line-height:1;margin-bottom:14px">😊</div>
			<p style="font-size:14px;color:var(--text-2);line-height:1.7;margin-bottom:18px">
				FinTrack is free and developed independently. If it's been useful to you this month,
				a small donation goes a long way toward keeping it maintained and improving.
				No pressure at all — feel free to close this and get back to your finances!
			</p>
			<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
				<a href="https://www.paypal.me/jaleel1618" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;background:#ffc439;color:#111;font-weight:700;font-size:13px;padding:8px 16px;border-radius:6px;text-decoration:none">Donate via PayPal</a>
				<a href="https://ko-fi.com/jaleel1618" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;background:#ff5e5b;color:#fff;font-weight:700;font-size:13px;padding:8px 16px;border-radius:6px;text-decoration:none">☕ Donate via Ko-fi</a>
			</div>
			<div style="margin-top:14px">
				<button class="btn btn-secondary" data-action="closeModal()">Maybe later</button>
			</div>
		</div>
	`);
}

})();

// ── NC32 delegation anchors ──────────────────────────────────────────────────
// Captured HERE (end of main.js, before core.js loads) so that when core.js
// hoists its function declarations over window.*, the _ft* names still point
// to these async API implementations.
window._ftSaveAccount     = window.saveAccount;
window._ftSaveTransaction = window.saveTransaction;
window._ftSaveTransfer    = window.saveTransfer;
window._ftAddTag          = window.addTag;
window._ftRenameTag       = window.renameTag;
window._ftSaveRecurring   = window.saveRecurring;
window._ftPostRecurring   = window.postRecurring;
window._ftPostAllDue      = window.postAllDue;
window._ftSaveSettings    = window.saveSettings;
window._ftSetBaseCurrency = window.setBaseCurrency;
window._ftSetCurrencyApiPref = window.setCurrencyApiPref;
window._ftTogglePwaEnabled   = window.togglePwaEnabled;
window._ftSetPwaRetentionDays = window.setPwaRetentionDays;
window._ftResetAllData    = window.resetAllData;
window._ftDeleteCurrency     = window.deleteCurrency;
window._ftDeleteAccount      = window.deleteAccount;
window._ftDeleteTransaction  = window.deleteTransaction;
window._ftDeleteTransfer     = window.deleteTransfer;
window._ftDeleteBudget       = window.deleteBudget;
window._ftDeleteCategory     = window.deleteCategory;
window._ftDeleteRecurring    = window.deleteRecurring;
window._ftToggleRecurring    = window.toggleRecurring;
window._ftDeleteTag          = window.deleteTag;
window._ftSaveBudget         = window.saveBudget;
window._ftUpdateCurrencyRate = window.updateCurrencyRate;
