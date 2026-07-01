// FinTrack — External Entry Form JS
// Config is read from data attributes on #ft-card to avoid inline JS (CSP compliance).
// No Nextcloud session or CSRF token required — authentication is via X-FinTrack-Token header.
(function () {
'use strict';

const card         = document.getElementById('ft-card');
const TOKEN        = card.dataset.token        || '';
const SUBMIT_URL   = card.dataset.submit       || '';
const ACCOUNTS_URL = card.dataset.accounts     || '';
const CATS_URL     = card.dataset.categories   || '';

// Set today's date as default
document.getElementById('date').value = new Date().toISOString().split('T')[0];

// ── Type toggle ──
let currentType = 'expense';
document.getElementById('btn-expense').addEventListener('click', function () {
	setType('expense', this, document.getElementById('btn-income'));
});
document.getElementById('btn-income').addEventListener('click', function () {
	setType('income', this, document.getElementById('btn-expense'));
});

function setType(type, activeBtn, inactiveBtn) {
	currentType = type;
	document.getElementById('txtype').value = type;
	activeBtn.className   = 'tbtn a' + type[0];
	inactiveBtn.className = 'tbtn';
}

// ── Load accounts and categories ──
async function load() {
	try {
		const headers = {
			'X-FinTrack-Token':  TOKEN,
			'X-Requested-With':  'XMLHttpRequest',
		};
		const [accs, cats] = await Promise.all([
			fetch(ACCOUNTS_URL,  { headers }).then(checkResponse),
			fetch(CATS_URL,      { headers }).then(checkResponse),
		]);

		const accountSel = document.getElementById('account');
		(accs || []).forEach(function (a) {
			const o = document.createElement('option');
			o.value       = a.id;
			o.textContent = (a.icon ? a.icon + ' ' : '') + a.name + ' (' + a.currency + ')';
			accountSel.appendChild(o);
		});

		const catSel = document.getElementById('cat');
		(cats || []).forEach(function (c) {
			const o = document.createElement('option');
			o.value       = c.name;
			o.textContent = (c.icon ? c.icon + ' ' : '') + c.name;
			catSel.appendChild(o);
		});

		document.getElementById('loading').style.display = 'none';
		document.getElementById('form').style.display    = 'block';
	} catch (e) {
		document.getElementById('loading').textContent = 'Failed to load — check your link. ' + (e.message || '');
	}
}

// ── Quick-add category ──
const catQuickAddToggle = document.getElementById('cat-quickadd-toggle');
const catQuickAddPanel  = document.getElementById('cat-quickadd');
const catQuickAddSave   = document.getElementById('cat-quickadd-save');

catQuickAddToggle.addEventListener('click', function (e) {
	e.preventDefault();
	const showing = catQuickAddPanel.style.display !== 'none';
	catQuickAddPanel.style.display = showing ? 'none' : 'block';
	if (!showing) document.getElementById('cat-quickadd-name').focus();
});

catQuickAddSave.addEventListener('click', async function () {
	const name = document.getElementById('cat-quickadd-name').value.trim();
	const type = document.getElementById('cat-quickadd-type').value;
	if (!name) { showErr('Enter a category name'); return; }

	try {
		const res = await fetch(CATS_URL, {
			method:  'POST',
			headers: {
				'Content-Type':     'application/json',
				'X-FinTrack-Token': TOKEN,
				'X-Requested-With': 'XMLHttpRequest',
			},
			body: JSON.stringify({ token: TOKEN, name, type }),
		});
		const cat = await checkResponse(res);

		const catSel = document.getElementById('cat');
		const o = document.createElement('option');
		o.value       = cat.name;
		o.textContent = (cat.icon ? cat.icon + ' ' : '') + cat.name;
		catSel.appendChild(o);
		catSel.value = cat.name;

		document.getElementById('cat-quickadd-name').value = '';
		catQuickAddPanel.style.display = 'none';
	} catch (e) {
		showErr(e.message || 'Failed to add category');
	}
});

async function checkResponse(res) {
	if (!res.ok) {
		const err = await res.json().catch(function () { return { error: res.statusText }; });
		throw new Error(err.error || res.statusText);
	}
	return res.json();
}

// ── Submit ──
document.getElementById('submit-btn').addEventListener('click', submitForm);

async function submitForm() {
	const amount = parseFloat(document.getElementById('amount').value);
	const acct   = document.getElementById('account').value;

	if (!amount || amount <= 0) { showErr('Enter a valid amount'); return; }
	if (!acct)                   { showErr('Select an account');   return; }

	const payload = {
		token:       TOKEN,
		type:        currentType,
		accountId:   parseInt(acct, 10),
		amount:      amount,
		description: document.getElementById('desc').value.trim(),
		category:    document.getElementById('cat').value,
		tags:        document.getElementById('tags').value
			.split(',').map(function (t) { return t.trim(); }).filter(Boolean),
		notes:       document.getElementById('notes').value.trim(),
		date:        document.getElementById('date').value,
	};

	try {
		const res  = await fetch(SUBMIT_URL, {
			method:  'POST',
			headers: {
				'Content-Type':     'application/json',
				'X-FinTrack-Token': TOKEN,
				'X-Requested-With': 'XMLHttpRequest',
			},
			body: JSON.stringify(payload),
		});
		const data = await res.json();
		if (!res.ok) { showErr(data.error || 'Submission failed'); return; }

		// Reset form fields
		document.getElementById('amount').value = '';
		document.getElementById('desc').value   = '';
		document.getElementById('notes').value  = '';
		document.getElementById('tags').value   = '';

		const ok = document.getElementById('ok');
		ok.style.display = 'block';
		setTimeout(function () { ok.style.display = 'none'; }, 4000);
	} catch (e) {
		showErr('Network error — please try again');
	}
}

function showErr(msg) {
	const el = document.getElementById('err');
	el.textContent   = msg;
	el.style.display = 'block';
	setTimeout(function () { el.style.display = 'none'; }, 4000);
}

load();
})();
