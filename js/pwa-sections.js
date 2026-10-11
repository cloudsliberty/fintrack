// FinTrack PWA — sections.js
// One route renderer per nav item, all sharing the FT_APP session + cachedLoad() + openFormModal()
// helpers from app.js. This is where every endpoint in the FinTrack manual gets a UI surface —
// deliberately more complete than the Android app's "basic options" (bulk CSV import, external
// API token management, full currency/category/tag CRUD, recurring "post now", etc).

function session() { return FT_APP.currentSession; }

function txKey(f = {}) { return `transactions:${f.accountId || ''}:${f.type || ''}:${f.category || ''}:${f.from || ''}:${f.to || ''}`; }

// ── Dashboard ──
ROUTE_RENDERERS.dashboard = async function (content) {
  try {
    const [{ data: summary }, { data: accounts }, { data: transactions }, { data: budgets }] = await Promise.all([
      cachedLoad('summary', () => FT_API.getSummary(session())),
      cachedLoad('accounts', () => FT_API.getAccounts(session())),
      cachedLoad(txKey(), () => FT_API.getAllTransactions(session())),
      cachedLoad('budgets', () => FT_API.getBudgets(session()))
    ]);

    const base = summary.baseCurrency || summary.base_currency || 'USD';
    const baseAccounts = accounts.filter((a) => a.currency === base && a.active);
    const netByAccount = {};
    transactions.filter((t) => t.currency === base).forEach((t) => {
      netByAccount[t.accountId] = (netByAccount[t.accountId] || 0) + (t.type === 'income' ? t.amount : -t.amount);
    });
    const totalAssets = baseAccounts.filter((a) => a.type === 'asset').reduce((s, a) => s + (netByAccount[a.id] || 0), 0);
    const totalLiabilities = baseAccounts.filter((a) => a.type === 'liability').reduce((s, a) => s + (netByAccount[a.id] || 0), 0);
    const netWorth = totalAssets - totalLiabilities;
    const baseTx = transactions.filter((t) => t.currency === base);
    const cashFlow = baseTx.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);

    const catTotals = {};
    baseTx.filter((t) => t.type === 'expense' && t.category).forEach((t) => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
    const topCategories = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const recent = [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);

    content.replaceChildren(
      h('div', { class: 'section' }, [
        h('div', { class: 'stat-grid' }, [
          statCard('Net Worth', formatMoney(netWorth, base)),
          statCard('Cash Flow', formatMoney(cashFlow, base), cashFlow >= 0 ? 'green' : 'red'),
          statCard('Total Assets', formatMoney(totalAssets, base)),
          statCard('Total Liabilities', formatMoney(totalLiabilities, base))
        ]),
        budgets.length ? h('h3', {}, 'Active Budgets') : null,
        ...budgets.filter((b) => b.active).map((b) => budgetRow(b, transactions)),
        topCategories.length ? h('h3', {}, 'Top Spending Categories') : null,
        ...topCategories.map(([cat, total]) => h('div', { class: 'list-row' }, [h('span', {}, cat), h('span', {}, formatMoney(total, base))])),
        h('h3', {}, 'Recent Transactions'),
        ...(recent.length ? recent.map((t) => txSummaryRow(t, accounts)) : [h('p', { class: 'muted' }, 'No transactions yet.')])
      ])
    );
  } catch (err) {
    content.replaceChildren(errorBox(err, () => ROUTE_RENDERERS.dashboard(content)));
  }
};

function statCard(label, value, color) {
  return h('div', { class: 'stat-card' }, [
    h('div', { class: 'stat-label' }, label),
    h('div', { class: `stat-value ${color ? 'c-' + color : ''}` }, value)
  ]);
}

function budgetRow(budget, transactions) {
  const spent = transactions
    .filter((t) => t.type === 'expense' && t.currency === budget.currency && (!budget.category || (t.category || '').toLowerCase() === budget.category.toLowerCase()))
    .reduce((s, t) => s + t.amount, 0);
  const ratio = budget.limitAmt > 0 ? Math.min(1, spent / budget.limitAmt) : 0;
  return h('div', { class: 'budget-row' }, [
    h('div', { class: 'list-row' }, [h('strong', {}, budget.name), h('span', {}, `${formatMoney(spent, budget.currency)} / ${formatMoney(budget.limitAmt, budget.currency)}`)]),
    h('div', { class: 'progress-track' }, [h('div', { class: `progress-fill ${ratio >= 1 ? 'over' : ''}`, style: `width:${ratio * 100}%` })])
  ]);
}

function txSummaryRow(tx, accounts) {
  const account = accounts.find((a) => a.id === tx.accountId);
  const isIncome = tx.type === 'income';
  return h('div', { class: 'list-row' }, [
    h('div', {}, [
      h('div', {}, tx.description || tx.category || 'Untitled'),
      h('div', { class: 'muted small' }, [tx.date, account ? account.name : null, tx.category].filter(Boolean).join(' · '))
    ]),
    h('span', { class: isIncome ? 'c-green' : 'c-red' }, `${isIncome ? '+' : '-'}${formatMoney(tx.amount, tx.currency)}`)
  ]);
}

function errorBox(err, onRetry) {
  return h('div', { class: 'error-box' }, [
    h('p', {}, err.message || 'Something went wrong.'),
    h('button', { class: 'ft-btn ft-btn-outline', onclick: onRetry }, 'Retry')
  ]);
}

// ── Accounts ──
const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Asset' }, { value: 'expense', label: 'Expense' },
  { value: 'revenue', label: 'Revenue' }, { value: 'liability', label: 'Liability' }
];

ROUTE_RENDERERS.accounts = async function (content) {
  try {
    const [{ data: accounts }, { data: currencies }] = await Promise.all([
      cachedLoad('accounts', () => FT_API.getAccounts(session())),
      cachedLoad('currencies', () => FT_API.getCurrencies(session()))
    ]);

    function openAccountForm(account) {
      openFormModal({
        title: account ? 'Edit Account' : 'New Account',
        fields: [
          { key: 'name', label: 'Name', required: true },
          { key: 'type', label: 'Type', type: 'select', options: ACCOUNT_TYPES },
          { key: 'currency', label: 'Currency', type: 'select', options: currencies.map((c) => ({ value: c.code, label: c.code })) },
          { key: 'description', label: 'Description (optional)' },
          { key: 'icon', label: 'Icon (emoji, optional)' },
          { key: 'active', label: 'Active', type: 'checkbox', default: true }
        ],
        initialValues: account || { type: 'asset', currency: currencies[0]?.code || '' },
        onSubmit: async (values) => {
          if (account) await FT_API.updateAccount(session(), account.id, values);
          else await FT_API.createAccount(session(), values);
          toast('Account saved');
          ROUTE_RENDERERS.accounts(content);
        }
      });
    }

    const searchText = (ROUTE_RENDERERS.accounts._search || '').toLowerCase();
    const groups = ['asset', 'expense', 'revenue', 'liability'].map((type) => ({
      label: ACCOUNT_TYPES.find((t) => t.value === type).label,
      items: accounts.filter((a) => a.active && a.type === type && (!searchText || a.name.toLowerCase().includes(searchText)))
    })).filter((g) => g.items.length);
    const inactive = accounts.filter((a) => !a.active && (!searchText || a.name.toLowerCase().includes(searchText)));
    if (inactive.length) groups.push({ label: 'Inactive', items: inactive });

    content.replaceChildren(
      h('div', { class: 'section' }, [
        h('div', { class: 'section-header' }, [h('h2', {}, 'Accounts'), h('button', { class: 'ft-btn ft-btn-primary', onclick: offlineGuard(() => openAccountForm(null), 'creating an account') }, '+ New Account')]),
        h('input', {
          class: 'ft-input', placeholder: '🔍 Search accounts…', value: ROUTE_RENDERERS.accounts._search || '',
          oninput: (e) => { ROUTE_RENDERERS.accounts._search = e.target.value; ROUTE_RENDERERS.accounts(content); }
        }),
        ...groups.map((g) => h('div', {}, [
          h('h4', { class: 'group-header' }, `${g.label} (${g.items.length})`),
          h('div', { class: 'list-grid' }, g.items.map((a) => h('div', { class: 'list-row clickable' }, [
            h('div', { onclick: () => navigateToAccountTransactions(a.id) }, [h('strong', {}, `${a.icon || ''} ${a.name}`), h('div', { class: 'muted small' }, `${a.type} · ${a.currency}`)]),
            h('div', {}, [
              h('button', { class: 'icon-btn', onclick: offlineGuard((e) => { e.stopPropagation(); openAccountForm(a); }, 'editing an account') }, '✏️'),
              h('button', {
                class: 'icon-btn', onclick: offlineGuard((e) => {
                  e.stopPropagation();
                  confirmDeleteCountdown(`Delete "${a.name}"? This can't be undone.`, async () => {
                    try {
                      await FT_API.deleteAccount(session(), a.id);
                      toast('Deleted');
                    } catch (err) {
                      // Account is linked to transactions/transfers — the server has
                      // already marked it inactive instead of deleting it.
                      toast(err.message || 'This account has existing transactions and was marked inactive instead.', true);
                    }
                    ROUTE_RENDERERS.accounts(content);
                  }, 5);
                }, 'deleting an account')
              }, '🗑️')
            ])
          ])))
        ])),
        !accounts.length ? h('p', { class: 'muted' }, 'No accounts yet.') : null,
        (accounts.length && !groups.length) ? h('p', { class: 'muted' }, 'No accounts match your search.') : null
      ])
    );
  } catch (err) {
    content.replaceChildren(errorBox(err, () => ROUTE_RENDERERS.accounts(content)));
  }
};

// ── Transactions ──
ROUTE_RENDERERS.transactions = async function (content) {
  const filters = ROUTE_RENDERERS.transactions._filters || {};
  const tagFilters = ROUTE_RENDERERS.transactions._tagFilters || [];
  try {
    const [{ data: transactions }, { data: accounts }, { data: categories }, { data: tags }, { data: settings }] = await Promise.all([
      cachedLoad(txKey(filters), () => FT_API.getAllTransactions(session(), filters)),
      cachedLoad('accounts', () => FT_API.getAccounts(session())),
      cachedLoad('categories', () => FT_API.getCategories(session())),
      cachedLoad('tags', () => FT_API.getTags(session())),
      cachedLoad('settings', () => FT_API.getSettings(session()))
    ]);
    const baseCurrency = settings?.base_currency || accounts[0]?.currency || 'USD';

    const searchText = ROUTE_RENDERERS.transactions._search || '';
    const filtered = transactions.filter((t) =>
      (!searchText || (t.description || '').toLowerCase().includes(searchText.toLowerCase())) &&
      (!tagFilters.length || tagFilters.every((tg) => (t.tags || []).includes(tg)))
    );
    const income = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const currency = filtered[0]?.currency || accounts[0]?.currency || 'USD';

    const anyFilterActive = !!(filters.accountId || filters.category || filters.from || filters.to || searchText || tagFilters.length);
    // Collapsed/expanded state persists across re-renders within the session
    // (same pattern as _filters/_search/_tagFilters above), not saved server-side.
    // Defaults expanded so filters aren't hidden the first time this page loads.
    const filtersExpanded = ROUTE_RENDERERS.transactions._filtersExpanded !== false;

    function openTxForm(tx) {
      // Offline Restriction: editing an existing transaction needs a round
      // trip either way (the edit could itself create a conflicting local
      // vs. server state), so it's blocked offline — only creating a new
      // one is allowed.
      if (tx && FT_OFFLINE.isOffline()) {
        toast("You're offline — editing existing transactions needs a connection. You can still add new ones.", true);
        return;
      }
      // Editing → the transaction's own account. New → if the list is currently
      // filtered to one account (opened from inside that account's screen),
      // pre-fill that account so the person doesn't have to pick it again.
      // filters.accountId is a string (from navigateToAccountTransactions), a.id a number.
      const acct = tx
        ? accounts.find((a) => a.id === tx.accountId)
        : (filters.accountId ? accounts.find((a) => String(a.id) === String(filters.accountId)) : null);

      function refreshConversionField() {
        const accWrap = document.getElementById('f-accountId');
        const rateField = document.getElementById('tx-convrate-wrap');
        if (!accWrap || !rateField) return;
        const selectedLabel = accWrap.querySelector('input').value;
        const selAcc = accounts.find((a) => `${a.name} (${a.currency})` === selectedLabel);
        rateField.style.display = (selAcc && selAcc.currency !== baseCurrency) ? '' : 'none';
        const rateInput = document.getElementById('tx-convrate');
        const updatedLabel = document.getElementById('tx-convrate-updated');
        if (selAcc) {
          rateField.dataset.currency = selAcc.currency;
          if (selAcc.currency !== baseCurrency) {
            if (rateInput && !rateInput.value) {
              const cached = getLastFetchedRate(settings, selAcc.currency, baseCurrency);
              if (cached) rateInput.value = cached;
            }
            if (updatedLabel) updatedLabel.textContent = getLastFetchedRateLabel(settings, selAcc.currency, baseCurrency);
          }
        }
      }

      openFormModal({
        title: tx ? 'Edit Transaction' : 'New Transaction',
        fields: [
          { key: 'type', label: 'Type', type: 'select', options: [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }] },
          { key: 'accountId', label: 'Account', type: 'combo', options: accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })), onChange: refreshConversionField, required: true },
          { key: 'amount', label: 'Amount', type: 'number', required: true },
          { key: 'date', label: 'Date', type: 'date', required: true },
          { key: 'reminderDate', label: 'Reminder date (optional — get a Nextcloud alert that day)', type: 'date' },
          { key: 'description', label: 'Description' },
          { key: 'category', label: 'Category (type to add new)', type: 'combo', options: categories.map((c) => ({ value: c.name, label: c.name })) },
          { key: 'tags', label: 'Tags', type: 'tagcombo', options: tags },
          { key: 'notes', label: 'Notes', type: 'textarea' }
        ],
        initialValues: tx ? { ...tx, category: tx.category || '' } : { type: 'expense', accountId: acct?.id ?? '', date: new Date().toISOString().slice(0, 10) },
        onSubmit: async (values) => {
          const selAcc = accounts.find((a) => a.id === Number(values.accountId));
          const body = { ...values, currency: selAcc?.currency || currency };
          const rateInput = document.getElementById('tx-convrate');
          if (rateInput && document.getElementById('tx-convrate-wrap').style.display !== 'none' && rateInput.value) {
            body.conversionRate = parseFloat(rateInput.value);
          }
          if (tx) {
            await FT_API.updateTransaction(session(), tx.id, body);
            toast('Transaction saved');
          } else if (FT_OFFLINE.isOffline()) {
            const key = FT_PIN.currentKey(FT_APP.currentIdentityId);
            await FT_DB.addPending(FT_APP.currentIdentityId, key, body);
            toast('Saved offline — will sync automatically once you\'re back online.');
          } else {
            await FT_API.createTransaction(session(), body);
            toast('Transaction saved');
          }
          ROUTE_RENDERERS.transactions(content);
        }
      });

      // openFormModal has no hook for extra fields, so the conversion-rate
      // field + live-fetch button (matching the Nextcloud app) is appended right
      // after the Category field once the modal exists.
      const categoryField = document.getElementById('f-category')?.closest('.ft-field');
      if (categoryField) {
        const rateInput = h('input', { id: 'tx-convrate', class: 'ft-input', type: 'number', step: '0.00000001', min: '0', placeholder: 'e.g. 3.75', value: tx?.conversionRate || '' });
        const updatedLabel = h('p', { id: 'tx-convrate-updated', class: 'muted small', style: 'margin-top:4px' });
        const fetchBtn = h('button', {
          class: 'ft-btn ft-btn-outline', type: 'button', style: 'margin-top:6px',
          onclick: async () => {
            const wrap = document.getElementById('tx-convrate-wrap');
            const fromCur = wrap.dataset.currency;
            if (!fromCur) return;
            fetchBtn.disabled = true; fetchBtn.textContent = 'Fetching…';
            try {
              const r = await FT_API.getExchangeRate(session(), fromCur, baseCurrency);
              if (r && r.rate) {
                rateInput.value = r.rate;
                updatedLabel.textContent = `Last updated: ${new Date().toLocaleString()}`;
                toast(`Fetched 1 ${fromCur} = ${r.rate} ${baseCurrency}`);
              } else toast(r?.error || 'Could not fetch a live rate', true);
            } catch (err) { toast(err.message || 'Could not fetch a live rate', true); }
            finally { fetchBtn.disabled = false; fetchBtn.textContent = 'Fetch online'; }
          }
        }, 'Fetch online');
        const rateWrap = h('div', { id: 'tx-convrate-wrap', class: 'ft-field', style: 'display:none' }, [
          h('label', {}, 'Conversion Rate'),
          h('div', { style: 'display:flex;gap:8px' }, [rateInput, fetchBtn]),
          updatedLabel
        ]);
        categoryField.insertAdjacentElement('afterend', rateWrap);
        refreshConversionField();
      }
    }

    function openCsvImport() {
      const fileInput = h('input', { type: 'file', accept: '.csv' });
      const body = h('div', { class: 'ft-modal ft-form' }, [
        h('h3', {}, 'Import CSV'),
        h('p', { class: 'muted' }, 'Columns: date, type, amount, description, category, tags, notes (tags separated by ;). All rows import into one account.'),
        h('a', { href: 'data:text/csv;charset=utf-8,date,type,amount,description,category,tags,notes\n2026-01-01,expense,12.50,Coffee,Food,,\n', download: 'fintrack-template.csv', class: 'ft-btn ft-btn-outline' }, 'Download template'),
        h('label', { class: 'ft-field-label', style: 'margin-top:12px' }, 'Import into account'),
        h('select', { id: 'csv-account', class: 'ft-input' }, accounts.map((a) => h('option', { value: a.id }, a.name))),
        h('div', { style: 'margin-top:12px' }, [fileInput]),
        h('div', { id: 'csv-error', class: 'ft-error' }),
        h('div', { class: 'ft-modal-actions' }, [
          h('button', { class: 'ft-btn ft-btn-text', onclick: () => closeModal(overlay) }, 'Cancel'),
          h('button', { class: 'ft-btn ft-btn-primary', id: 'csv-submit' }, 'Import')
        ])
      ]);
      const overlay = openModal(body);
      body.querySelector('#csv-submit').addEventListener('click', async () => {
        const errEl = body.querySelector('#csv-error');
        const file = fileInput.files[0];
        if (!file) { errEl.textContent = 'Choose a CSV file first.'; return; }
        const text = await file.text();
        const rows = parseCsv(text);
        const accountId = Number(body.querySelector('#csv-account').value);
        try {
          const result = await FT_API.importTransactions(session(), { accountId, transactions: rows });
          toast(`Imported ${result.imported ?? rows.length} row(s)` + (result.errors?.length ? `, ${result.errors.length} skipped` : ''));
          closeModal(overlay);
          ROUTE_RENDERERS.transactions(content);
        } catch (err) {
          errEl.textContent = err.message;
        }
      });
    }

    const tagFilterCombo = tagComboInput({
      allTags: tags, selected: tagFilters,
      onChange: (newTags) => { ROUTE_RENDERERS.transactions._tagFilters = newTags; renderTxList(); updateResetVisibility(); }
    });

    content.replaceChildren(
      h('div', { class: 'section' }, [
        h('div', { class: 'section-header' }, [
          h('h2', {}, 'Transactions'),
          h('div', {}, [
            h('button', { class: 'ft-btn ft-btn-outline', onclick: openCsvImport }, 'Import CSV'),
            h('button', { class: 'ft-btn ft-btn-primary', onclick: () => openTxForm(null) }, '+ New')
          ])
        ]),
        h('div', { class: 'card', style: 'padding:0;overflow:hidden' }, [
          h('button', {
            class: 'collapsible-card-header', id: 'tx-filters-toggle',
            style: 'width:100%;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:none;border:none;color:var(--text);font-size:14px;font-weight:600;text-align:left;margin-top:0;cursor:pointer',
            onclick: () => {
              ROUTE_RENDERERS.transactions._filtersExpanded = !filtersExpanded;
              ROUTE_RENDERERS.transactions(content);
            }
          }, [
            h('span', {}, `Filters${anyFilterActive ? ' •' : ''}`),
            h('span', { 'aria-hidden': 'true', style: `transition:transform .15s;transform:rotate(${filtersExpanded ? '180deg' : '0deg'})` }, '▾')
          ]),
          h('div', { id: 'tx-filters-body', style: `padding:0 16px 16px;${filtersExpanded ? '' : 'display:none'}` }, [
            h('div', { class: 'filter-bar' }, [
              fuzzyCombo({
                options: accounts.map((a) => ({ value: a.id, label: a.name })), value: filters.accountId || '', placeholder: 'Account (all if empty)',
                onSelect: (v) => { ROUTE_RENDERERS.transactions._filters = { ...filters, accountId: v || undefined }; ROUTE_RENDERERS.transactions(content); }
              }),
              clearableInput({
                placeholder: 'Search description', value: searchText,
                onInput: (v) => { ROUTE_RENDERERS.transactions._search = v; renderTxList(); updateResetVisibility(); }
              }),
              fuzzyCombo({
                options: categories.map((c) => ({ value: c.name, label: c.name })), value: filters.category || '', placeholder: 'Category (all if empty)',
                onSelect: (v) => { ROUTE_RENDERERS.transactions._filters = { ...filters, category: v || undefined }; ROUTE_RENDERERS.transactions(content); }
              }),
              h('input', { class: 'ft-input', type: 'date', value: filters.from || '', onchange: (e) => { ROUTE_RENDERERS.transactions._filters = { ...filters, from: e.target.value || undefined }; ROUTE_RENDERERS.transactions(content); } }),
              h('input', { class: 'ft-input', type: 'date', value: filters.to || '', onchange: (e) => { ROUTE_RENDERERS.transactions._filters = { ...filters, to: e.target.value || undefined }; ROUTE_RENDERERS.transactions(content); } })
            ]),
            h('div', { class: 'ft-field' }, [h('label', {}, 'Tags'), tagFilterCombo]),
            h('button', {
              id: 'tx-reset-filters', class: 'ft-btn ft-btn-outline', style: anyFilterActive ? '' : 'display:none',
              onclick: () => {
                ROUTE_RENDERERS.transactions._filters = {};
                ROUTE_RENDERERS.transactions._search = '';
                ROUTE_RENDERERS.transactions._tagFilters = [];
                ROUTE_RENDERERS.transactions(content);
              }
            }, 'Reset All Filters')
          ])
        ]),
        h('div', { class: 'stat-grid' }, [
          statCard('Income', formatMoney(income, currency), 'green'),
          statCard('Expense', formatMoney(expense, currency), 'red'),
          statCard('Difference', formatMoney(income - expense, currency), 'orange')
        ]),
        h('div', { id: 'tx-list' })
      ])
    );

    function updateResetVisibility() {
      const btn = document.getElementById('tx-reset-filters');
      if (!btn) return;
      const active = !!(filters.accountId || filters.category || filters.from || filters.to || ROUTE_RENDERERS.transactions._search || (ROUTE_RENDERERS.transactions._tagFilters || []).length);
      btn.style.display = active ? '' : 'none';
    }

    function renderTxList() {
      const listEl = document.getElementById('tx-list');
      if (!listEl) return;
      const text = (ROUTE_RENDERERS.transactions._search || '').toLowerCase();
      const activeTags = ROUTE_RENDERERS.transactions._tagFilters || [];
      const rows = transactions.filter((t) =>
        (!text || (t.description || '').toLowerCase().includes(text)) &&
        (!activeTags.length || activeTags.every((tg) => (t.tags || []).includes(tg)))
      );
      listEl.replaceChildren(...(rows.length ? rows.map((t) => h('div', { class: 'list-row' }, [
        h('div', { class: 'clickable', onclick: () => openTxForm(t) }, [
          h('div', {}, t.description || t.category || 'Untitled'),
          h('div', { class: 'muted small' }, [t.date, accounts.find((a) => a.id === t.accountId)?.name, t.category, ...(t.tags || []).map((tg) => `#${tg}`)].filter(Boolean).join(' · '))
        ]),
        h('div', {}, [
          h('span', { class: t.type === 'income' ? 'c-green' : 'c-red' }, `${t.type === 'income' ? '+' : '-'}${formatMoney(t.amount, t.currency)}`),
          h('button', { class: 'icon-btn', onclick: () => confirmDialog('Delete this transaction?', async () => { await FT_API.deleteTransaction(session(), t.id); toast('Deleted'); ROUTE_RENDERERS.transactions(content); }) }, '🗑️')
        ])
      ])) : [h('p', { class: 'muted' }, 'No transactions match.')]));
    }
    renderTxList();
  } catch (err) {
    content.replaceChildren(errorBox(err, () => ROUTE_RENDERERS.transactions(content)));
  }
};

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map((h2) => h2.trim());
  return lines.slice(1).filter(Boolean).map((line) => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((header, i) => { row[header] = (cells[i] || '').trim(); });
    return {
      date: row.date, type: row.type, amount: Number(row.amount), description: row.description,
      category: row.category, tags: row.tags ? row.tags.split(';').map((s) => s.trim()).filter(Boolean) : [], notes: row.notes
    };
  });
}

// ── Transfers ──
ROUTE_RENDERERS.transfers = async function (content) {
  try {
    const [{ data: transfers }, { data: accounts }, { data: settings }] = await Promise.all([
      cachedLoad('transfers', () => FT_API.getTransfers(session())),
      cachedLoad('accounts', () => FT_API.getAccounts(session())),
      cachedLoad('settings', () => FT_API.getSettings(session()))
    ]);

    function openTransferForm() {
      function recalc() {
        const fromWrap = document.getElementById('f-fromAccountId');
        const toWrap = document.getElementById('f-toAccountId');
        const amountInput = document.getElementById('f-fromAmount');
        const rateWrap = document.getElementById('tr-convrate-wrap');
        const rateInput = document.getElementById('tr-convrate');
        const receivedInput = document.getElementById('tr-received');
        const updatedLabel = document.getElementById('tr-convrate-updated');
        if (!fromWrap || !toWrap || !rateWrap) return;
        const fromAcc = accounts.find((a) => `${a.name} (${a.currency})` === fromWrap.querySelector('input').value);
        const toAcc = accounts.find((a) => `${a.name} (${a.currency})` === toWrap.querySelector('input').value);
        const amount = parseFloat(amountInput?.value || 0);
        if (fromAcc && toAcc && fromAcc.currency !== toAcc.currency) {
          rateWrap.style.display = '';
          rateWrap.dataset.from = fromAcc.currency;
          rateWrap.dataset.to = toAcc.currency;
          if (!rateInput.value) {
            const cached = getLastFetchedRate(settings, fromAcc.currency, toAcc.currency);
            if (cached) rateInput.value = cached;
          }
          if (updatedLabel) updatedLabel.textContent = getLastFetchedRateLabel(settings, fromAcc.currency, toAcc.currency);
          const rate = parseFloat(rateInput.value) > 0 ? parseFloat(rateInput.value) : 1;
          receivedInput.value = amount ? (amount * rate).toFixed(4) : '';
        } else {
          rateWrap.style.display = 'none';
          if (updatedLabel) updatedLabel.textContent = '';
          receivedInput.value = amount ? amount.toFixed(4) : '';
        }
      }

      openFormModal({
        title: 'New Transfer',
        fields: [
          { key: 'fromAccountId', label: 'From account', type: 'combo', options: accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })), onChange: recalc, required: true },
          { key: 'toAccountId', label: 'To account', type: 'combo', options: accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })), onChange: recalc, required: true },
          { key: 'fromAmount', label: 'Amount (from account currency)', type: 'number', required: true },
          { key: 'date', label: 'Date', type: 'date', required: true },
          { key: 'description', label: 'Description' }
        ],
        initialValues: { date: new Date().toISOString().slice(0, 10) },
        onSubmit: async (values) => {
          const fromAcct = accounts.find((a) => a.id === Number(values.fromAccountId));
          const toAcct = accounts.find((a) => a.id === Number(values.toAccountId));
          const rateInput = document.getElementById('tr-convrate');
          const rate = (rateInput && rateInput.value) ? parseFloat(rateInput.value) : 1;
          const toAmount = fromAcct.currency === toAcct.currency ? values.fromAmount : values.fromAmount * rate;
          await FT_API.createTransfer(session(), {
            fromAccountId: Number(values.fromAccountId), toAccountId: Number(values.toAccountId),
            fromAmount: values.fromAmount, toAmount, fromCurrency: fromAcct.currency, toCurrency: toAcct.currency,
            conversionRate: rate,
            description: values.description, date: values.date
          });
          toast('Transfer created');
          ROUTE_RENDERERS.transfers(content);
        }
      });

      // openFormModal has no hook for extra fields, so the conversion-rate
      // (manual or live-fetch) and readonly Amount Received fields are
      // appended right after the Amount field once the modal exists.
      const amountField = document.getElementById('f-fromAmount')?.closest('.ft-field');
      if (amountField) {
        const amountInput = document.getElementById('f-fromAmount');
        amountInput.addEventListener('input', recalc);

        const rateInput = h('input', { id: 'tr-convrate', class: 'ft-input', type: 'number', step: '0.00000001', min: '0', placeholder: 'e.g. 3.75', oninput: recalc });
        const updatedLabel = h('p', { id: 'tr-convrate-updated', class: 'muted small', style: 'margin-top:4px' });
        const fetchBtn = h('button', {
          class: 'ft-btn ft-btn-outline', type: 'button', style: 'margin-top:6px',
          onclick: async () => {
            const rateWrap = document.getElementById('tr-convrate-wrap');
            const from = rateWrap.dataset.from, to = rateWrap.dataset.to;
            if (!from || !to) return;
            fetchBtn.disabled = true; fetchBtn.textContent = 'Fetching…';
            try {
              const r = await FT_API.getExchangeRate(session(), from, to);
              if (r && r.rate) {
                rateInput.value = r.rate; recalc();
                updatedLabel.textContent = `Last updated: ${new Date().toLocaleString()}`;
                toast(`Fetched 1 ${from} = ${r.rate} ${to}`);
              } else toast(r?.error || 'Could not fetch a live rate', true);
            } catch (err) { toast(err.message || 'Could not fetch a live rate', true); }
            finally { fetchBtn.disabled = false; fetchBtn.textContent = 'Fetch online'; }
          }
        }, 'Fetch online');
        const rateWrap = h('div', { id: 'tr-convrate-wrap', class: 'ft-field', style: 'display:none' }, [
          h('label', {}, 'Conversion Rate'),
          h('div', { style: 'display:flex;gap:8px' }, [rateInput, fetchBtn]),
          updatedLabel
        ]);
        const receivedWrap = h('div', { class: 'ft-field' }, [
          h('label', {}, 'Amount Received'),
          h('input', { id: 'tr-received', class: 'ft-input', type: 'number', readonly: true, tabindex: '-1', placeholder: '0.00' })
        ]);
        amountField.insertAdjacentElement('afterend', receivedWrap);
        amountField.insertAdjacentElement('afterend', rateWrap);
        recalc();
      }
    }

    content.replaceChildren(
      h('div', { class: 'section' }, [
        h('div', { class: 'section-header' }, [h('h2', {}, 'Transfers'), h('button', { class: 'ft-btn ft-btn-primary', onclick: offlineGuard(openTransferForm, 'creating a transfer') }, '+ New Transfer')]),
        transfers.length
          ? h('div', { class: 'list-grid' }, transfers.map((t) => {
              const from = accounts.find((a) => a.id === t.fromAccountId);
              const to = accounts.find((a) => a.id === t.toAccountId);
              return h('div', { class: 'list-row' }, [
                h('div', {}, [h('strong', {}, `${from?.name || '?'} → ${to?.name || '?'}`), h('div', { class: 'muted small' }, t.date)]),
                h('div', {}, [
                  h('span', {}, `${formatMoney(t.fromAmount, t.fromCurrency)} → ${formatMoney(t.toAmount, t.toCurrency)}`),
                  h('button', { class: 'icon-btn', onclick: () => confirmDialog('Delete this transfer?', async () => { await FT_API.deleteTransfer(session(), t.id); toast('Deleted'); ROUTE_RENDERERS.transfers(content); }) }, '🗑️')
                ])
              ]);
            }))
          : h('p', { class: 'muted' }, 'No transfers yet.')
      ])
    );
  } catch (err) {
    content.replaceChildren(errorBox(err, () => ROUTE_RENDERERS.transfers(content)));
  }
};

// ── Recurring ──
const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].map((f) => ({ value: f, label: f[0].toUpperCase() + f.slice(1) }));

ROUTE_RENDERERS.recurring = async function (content) {
  try {
    const [{ data: rules }, { data: accounts }, { data: categories }, { data: tags }] = await Promise.all([
      cachedLoad('recurring', () => FT_API.getRecurring(session())),
      cachedLoad('accounts', () => FT_API.getAccounts(session())),
      cachedLoad('categories', () => FT_API.getCategories(session())),
      cachedLoad('tags', () => FT_API.getTags(session()))
    ]);

    function openForm(rule) {
      openFormModal({
        title: rule ? 'Edit Recurring Rule' : 'New Recurring Rule',
        fields: [
          { key: 'name', label: 'Name', required: true },
          { key: 'type', label: 'Type', type: 'select', options: [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }] },
          { key: 'accountId', label: 'Account', type: 'combo', options: accounts.map((a) => ({ value: a.id, label: a.name })), required: true },
          { key: 'amount', label: 'Amount', type: 'number', required: true },
          { key: 'frequency', label: 'Frequency', type: 'select', options: FREQUENCIES },
          { key: 'nextDate', label: 'Next date', type: 'date', required: true },
          { key: 'endDate', label: 'Expiry date (optional — stops posting after this date)', type: 'date' },
          { key: 'category', label: 'Category', type: 'combo', options: categories.map((c) => ({ value: c.name, label: c.name })) },
          { key: 'tags', label: 'Tags', type: 'tagcombo', options: tags },
          { key: 'description', label: 'Description' },
          { key: 'active', label: 'Active', type: 'checkbox', default: true },
          { key: 'alertEnabled', label: 'Nextcloud alert on each trigger date', type: 'checkbox', default: true }
        ],
        initialValues: rule || { type: 'expense', frequency: 'monthly', nextDate: new Date().toISOString().slice(0, 10) },
        onSubmit: async (values) => {
          const body = { ...values, currency: accounts.find((a) => a.id === Number(values.accountId))?.currency };
          if (rule) await FT_API.updateRecurring(session(), rule.id, body);
          else await FT_API.createRecurring(session(), body);
          toast('Recurring rule saved');
          ROUTE_RENDERERS.recurring(content);
        }
      });
    }

    content.replaceChildren(
      h('div', { class: 'section' }, [
        h('div', { class: 'section-header' }, [h('h2', {}, 'Recurring'), h('button', { class: 'ft-btn ft-btn-primary', onclick: offlineGuard(() => openForm(null), 'creating a recurring rule') }, '+ New')]),
        ...(rules.length ? rules.map((r) => h('div', { class: 'list-row' }, [
          h('div', { class: 'clickable', onclick: () => openForm(r) }, [
            h('strong', {}, r.name),
            h('div', { class: 'muted small' }, `${r.frequency} · next ${r.nextDate}${r.endDate ? ' · ends ' + r.endDate : ''} · ${formatMoney(r.amount, r.currency)}${r.active ? '' : ' · inactive'}`)
          ]),
          h('div', {}, [
            h('button', { class: 'ft-btn ft-btn-outline', onclick: async (e) => { e.stopPropagation(); await FT_API.postRecurring(session(), r.id); toast('Posted'); ROUTE_RENDERERS.recurring(content); } }, 'Post'),
            h('button', { class: 'icon-btn', onclick: (e) => { e.stopPropagation(); openForm(r); } }, '✏️'),
            h('button', { class: 'icon-btn', onclick: (e) => { e.stopPropagation(); confirmDialog(`Delete "${r.name}"?`, async () => { await FT_API.deleteRecurring(session(), r.id); toast('Deleted'); ROUTE_RENDERERS.recurring(content); }); } }, '🗑️')
          ])
        ])) : [h('p', { class: 'muted' }, 'No recurring rules yet.')])
      ])
    );
  } catch (err) {
    content.replaceChildren(errorBox(err, () => ROUTE_RENDERERS.recurring(content)));
  }
};

// ── Budgets ──
ROUTE_RENDERERS.budgets = async function (content) {
  try {
    const [{ data: budgets }, { data: categories }, { data: currencies }] = await Promise.all([
      cachedLoad('budgets', () => FT_API.getBudgets(session())),
      cachedLoad('categories', () => FT_API.getCategories(session())),
      cachedLoad('currencies', () => FT_API.getCurrencies(session()))
    ]);

    function openForm(budget) {
      openFormModal({
        title: budget ? 'Edit Budget' : 'New Budget',
        fields: [
          { key: 'name', label: 'Name', required: true },
          { key: 'category', label: 'Category', type: 'select', options: [{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c.name, label: c.name }))] },
          { key: 'limitAmt', label: 'Limit amount', type: 'number', required: true },
          { key: 'currency', label: 'Currency', type: 'select', options: [{ value: '', label: 'Select a currency…' }, ...currencies.map((c) => ({ value: c.code, label: c.code }))], required: true },
          { key: 'period', label: 'Period', type: 'select', options: [{ value: 'monthly', label: 'Monthly' }, { value: 'weekly', label: 'Weekly' }, { value: 'yearly', label: 'Yearly' }] },
          { key: 'startDate', label: 'Start date', type: 'date' },
          { key: 'active', label: 'Active', type: 'checkbox', default: true }
        ],
        initialValues: budget || { period: 'monthly', startDate: new Date().toISOString().slice(0, 10) },
        onSubmit: async (values) => {
          if (budget) await FT_API.updateBudget(session(), budget.id, values);
          else await FT_API.createBudget(session(), values);
          toast('Budget saved');
          ROUTE_RENDERERS.budgets(content);
        }
      });
    }

    content.replaceChildren(
      h('div', { class: 'section' }, [
        h('div', { class: 'section-header' }, [h('h2', {}, 'Budgets'), h('button', { class: 'ft-btn ft-btn-primary', onclick: offlineGuard(() => openForm(null), 'creating a budget') }, '+ New Budget')]),
        budgets.length
          ? h('div', { class: 'list-grid' }, budgets.map((b) => h('div', { class: 'list-row' }, [
              h('div', { class: 'clickable', onclick: () => openForm(b) }, [
                h('strong', {}, b.name),
                h('div', { class: 'muted small' }, `${b.category || 'All categories'} · ${formatMoney(b.limitAmt, b.currency)} / ${b.period}${b.active ? '' : ' · inactive'}`)
              ]),
              h('button', { class: 'icon-btn', onclick: () => confirmDialog(`Delete "${b.name}"?`, async () => { await FT_API.deleteBudget(session(), b.id); toast('Deleted'); ROUTE_RENDERERS.budgets(content); }) }, '🗑️')
            ])))
          : h('p', { class: 'muted' }, 'No budgets yet.')
      ])
    );
  } catch (err) {
    content.replaceChildren(errorBox(err, () => ROUTE_RENDERERS.budgets(content)));
  }
};

// ── Categories & Tags ──
ROUTE_RENDERERS.categories = async function (content) {
  try {
    const [{ data: categories }, { data: tags }] = await Promise.all([
      cachedLoad('categories', () => FT_API.getCategories(session())),
      cachedLoad('tags', () => FT_API.getTags(session()))
    ]);

    function openCategoryForm(cat) {
      openFormModal({
        title: cat ? 'Edit Category' : 'New Category',
        fields: [
          { key: 'name', label: 'Name', required: true },
          { key: 'type', label: 'Type', type: 'select', options: [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfer' }] },
          { key: 'icon', label: 'Icon (emoji, optional)' }
        ],
        initialValues: cat || { type: 'expense' },
        onSubmit: async (values) => {
          if (cat) await FT_API.updateCategory(session(), cat.id, values);
          else await FT_API.createCategory(session(), values);
          toast('Category saved');
          ROUTE_RENDERERS.categories(content);
        }
      });
    }

    let newTag = '';
    const catSearch = (ROUTE_RENDERERS.categories._search || '').toLowerCase();
    const filteredCategories = categories.filter((c) => !catSearch || c.name.toLowerCase().includes(catSearch));
    content.replaceChildren(
      h('div', { class: 'section' }, [
        h('div', { class: 'section-header' }, [h('h2', {}, 'Categories'), h('button', { class: 'ft-btn ft-btn-primary', onclick: offlineGuard(() => openCategoryForm(null), 'creating a category') }, '+ New Category')]),
        h('input', {
          class: 'ft-input', placeholder: '🔍 Search categories…', value: ROUTE_RENDERERS.categories._search || '',
          oninput: (e) => { ROUTE_RENDERERS.categories._search = e.target.value; ROUTE_RENDERERS.categories(content); }
        }),
        categories.length
          ? h('div', { class: 'list-grid', style: 'margin-top:12px' }, filteredCategories.length
              ? filteredCategories.map((c) => h('div', { class: 'list-row clickable' }, [
                  h('div', { onclick: () => navigateToCategoryTransactions(c.name) }, [h('strong', {}, `${c.icon || ''} ${c.name}`), h('div', { class: 'muted small' }, c.type)]),
                  h('div', {}, [
                    h('button', { class: 'icon-btn', onclick: (e) => { e.stopPropagation(); openCategoryForm(c); } }, '✏️'),
                    h('button', {
                      class: 'icon-btn', onclick: (e) => {
                        e.stopPropagation();
                        confirmDialog(`Delete "${c.name}"?`, async () => {
                          try {
                            await FT_API.deleteCategory(session(), c.id);
                            toast('Deleted');
                          } catch (err) {
                            toast(err.message || 'This category is used by existing transactions and can\'t be deleted.', true);
                          }
                          ROUTE_RENDERERS.categories(content);
                        });
                      }
                    }, '🗑️')
                  ])
                ]))
              : [h('p', { class: 'muted' }, 'No categories match your search.')])
          : h('p', { class: 'muted' }, 'No categories yet.'),

        h('h2', { style: 'margin-top:32px' }, 'Tags'),
        h('div', { id: 'tags-chip-list', class: 'chip-row' }, tags.map((t) => tagChip(t, tags, content))),
        h('div', { class: 'filter-bar' }, [
          h('input', { id: 'new-tag-input', class: 'ft-input', placeholder: 'Add a tag' }),
          h('button', {
            class: 'ft-btn ft-btn-outline', onclick: async () => {
              const input = document.getElementById('new-tag-input');
              const value = input.value.trim();
              if (!value) return;
              const updated = [...new Set([...tags, value])];
              await FT_API.saveTags(session(), updated);
              toast('Tag added');
              ROUTE_RENDERERS.categories(content);
            }
          }, 'Add tag')
        ])
      ])
    );
  } catch (err) {
    content.replaceChildren(errorBox(err, () => ROUTE_RENDERERS.categories(content)));
  }
};

function tagChip(tag, allTags, content) {
  return h('span', { class: 'chip' }, [
    h('span', { class: 'clickable', onclick: () => navigateToTagTransactions(tag) }, `#${tag}`),
    h('button', {
      class: 'chip-remove', title: 'Rename', onclick: (e) => {
        e.stopPropagation();
        const next = window.prompt(`Rename tag "#${tag}" — this updates it on every past transaction and recurring rule too:`, tag);
        if (!next || next.trim() === '' || next.trim() === tag) return;
        FT_API.renameTag(session(), tag, next.trim())
          .then(() => { toast('Tag renamed'); ROUTE_RENDERERS.categories(content); })
          .catch((err) => toast(err.message || 'Could not rename tag', true));
      }
    }, '✏️'),
    h('button', {
      class: 'chip-remove', title: 'Delete', onclick: (e) => {
        e.stopPropagation();
        FT_API.deleteTag(session(), tag)
          .then(() => { toast('Tag removed'); ROUTE_RENDERERS.categories(content); })
          .catch((err) => toast(err.message || 'This tag is used by existing transactions and can\'t be deleted.', true));
      }
    }, '×')
  ]);
}

// ── Currencies ──
ROUTE_RENDERERS.currencies = async function (content) {
  try {
    const [{ data: currencies }, { data: settingsData }] = await Promise.all([
      cachedLoad('currencies', () => FT_API.getCurrencies(session())),
      cachedLoad('settings', () => FT_API.getSettings(session()))
    ]);
    const base = settingsData?.base_currency || 'USD';

    function openForm(currency) {
      openFormModal({
        title: currency ? 'Edit Currency' : 'New Currency',
        fields: [
          { key: 'code', label: 'Code (e.g. USD)', required: true },
          { key: 'name', label: 'Display name', required: true },
          { key: 'symbol', label: 'Symbol' },
          { key: 'rate', label: 'Conversion rate (relative to base currency)', type: 'number', required: true, default: 1 }
        ],
        initialValues: currency || { rate: 1 },
        onSubmit: async (values) => {
          if (currency) await FT_API.updateCurrency(session(), currency.id, values);
          else await FT_API.createCurrency(session(), values);
          toast('Currency saved');
          ROUTE_RENDERERS.currencies(content);
        }
      });
      // openFormModal has no hook for extra controls, so the live-rate-fetch
      // button and "Last updated" timestamp are appended right after the
      // rate field once the modal exists.
      const rateInput = document.getElementById('f-rate');
      const codeInput = document.getElementById('f-code');
      if (rateInput && rateInput.parentElement) {
        const updatedLabel = h('p', { id: 'cur-rate-updated', class: 'muted small', style: 'margin-top:4px' },
          currency ? getLastFetchedRateLabel(settingsData, base, currency.code) : '');
        const fetchBtn = h('button', {
          class: 'ft-btn ft-btn-outline', type: 'button', style: 'margin-top:6px',
          onclick: async () => {
            const code = (codeInput?.value || (currency && currency.code) || '').toUpperCase();
            if (!code || code === base) { toast('Pick a non-base currency code first'); return; }
            fetchBtn.disabled = true; fetchBtn.textContent = 'Fetching…';
            try {
              const r = await FT_API.getExchangeRate(session(), base, code);
              if (r && r.rate) {
                rateInput.value = r.rate;
                updatedLabel.textContent = `Last updated: ${new Date().toLocaleString()}`;
                toast(`Fetched 1 ${base} = ${r.rate} ${code}`);
              } else {
                toast(r?.error || 'Could not fetch a live rate');
              }
            } catch (err) {
              toast(err.message || 'Could not fetch a live rate');
            } finally {
              fetchBtn.disabled = false; fetchBtn.textContent = '⟳ Fetch live rate';
            }
          }
        }, '⟳ Fetch live rate');
        rateInput.parentElement.appendChild(fetchBtn);
        rateInput.parentElement.appendChild(updatedLabel);
      }
    }

    content.replaceChildren(
      h('div', { class: 'section' }, [
        h('div', { class: 'section-header' }, [h('h2', {}, 'Currencies'), h('button', { class: 'ft-btn ft-btn-primary', onclick: offlineGuard(() => openForm(null), 'creating a currency') }, '+ New Currency')]),
        h('p', { class: 'muted' }, `Base currency: ${base}. Deleting currencies isn't available here — manage that in the Nextcloud app.`),
        ...(currencies.length ? currencies.map((c) => h('div', { class: 'list-row clickable' }, [
          h('div', { onclick: () => openForm(c) }, [
            h('strong', {}, `${c.code} — ${c.name}${c.code === base ? ' ⭐' : ''}`),
            h('div', { class: 'muted small' }, `${c.symbol || ''} · rate ${c.rate}`)
          ])
        ])) : [h('p', { class: 'muted' }, 'No currencies yet.')]),
        h('p', { class: 'muted small', style: 'margin-top:12px' }, 'Live FX rate providers (frankfurter.dev / exchangerate.host) and per-currency API selection are configured in the Nextcloud app → Settings → Currencies.')
      ])
    );
  } catch (err) {
    content.replaceChildren(errorBox(err, () => ROUTE_RENDERERS.currencies(content)));
  }
};

// ── Settings ──
ROUTE_RENDERERS.settings = async function (content) {
  try {
    const identity = await FT_PIN.getIdentity(FT_APP.currentIdentityId);
    let lockStatus;
    try {
      lockStatus = await FT_API.getLockStatus(session());
      await FT_DB.saveIdentity({ ...identity, cachedLockStatus: lockStatus });
    } catch (err) {
      lockStatus = identity.cachedLockStatus || { enabled: false, timeoutMinutes: 10 };
    }
    const biometricEnabled = await FT_PIN.isBiometricEnabled(identity.id);
    const pinKey = FT_PIN.currentKey(identity.id);
    const pendingEntries = pinKey ? await FT_DB.listPending(identity.id, pinKey).catch(() => []) : [];

    content.replaceChildren(
      h('div', { class: 'section' }, [
        h('h2', {}, 'Settings'),

        h('div', { class: 'card' }, [
          h('h4', {}, 'Pin Lock'),
          h('p', { class: 'muted small' }, 'This is the same Pin Lock as the Nextcloud app\'s Settings — changes here apply everywhere, not just in this PWA. The PWA requires Pin Lock, so it can only be turned off from the Nextcloud app (which also turns off PWA access when you do).'),
          lockStatus.enabled
            ? h('div', {}, [
                h('p', { class: 'muted' }, `Enabled — asks for your PIN every time FinTrack opens, and again after ${lockStatus.timeoutMinutes} minutes in the background.`),
                h('button', { class: 'ft-btn ft-btn-outline', onclick: () => openPinChangeForm(identity, content) }, 'Change PIN')
              ])
            : h('div', {}, [
                h('p', { class: 'muted' }, 'Not enabled.'),
                h('button', { class: 'ft-btn ft-btn-primary', onclick: () => openPinChangeForm(identity, content, true) }, 'Enable Pin Lock')
              ])
        ]),

        h('div', { class: 'card' }, [
          h('h4', {}, 'Biometric Authentication'),
          !FT_PIN.biometricSupported()
            ? h('p', { class: 'muted' }, "Not available — this device or browser doesn't support a platform authenticator (Face/Touch ID, Windows Hello, etc.).")
            : h('div', {}, [
                h('p', { class: 'muted' }, biometricEnabled
                  ? 'Enabled — you can unlock with biometrics instead of retyping your PIN, every time you reopen FinTrack.'
                  : 'Off. Unlocks FinTrack with Face/Touch ID or your device screen lock instead of retyping your PIN, every time you reopen it.'),
                h('div', { style: 'display:flex;align-items:center;gap:10px' }, [
                  h('label', { style: 'margin-bottom:0' }, biometricEnabled ? 'Enabled' : 'Disabled'),
                  h('input', {
                    type: 'checkbox', checked: biometricEnabled,
                    onchange: async (e) => {
                      const checked = e.target.checked;
                      try {
                        if (checked) {
                          const pin = window.prompt('Enter your PIN once to enable biometric unlock:');
                          if (!pin) { e.target.checked = false; return; }
                          const result = await FT_PIN.tryUnlock(identity.id, pin);
                          if (!result.ok) { toast(result.error || 'Incorrect PIN', true); e.target.checked = false; return; }
                          await FT_PIN.enableBiometric(identity.id, pin);
                          toast('Biometric unlock enabled');
                        } else {
                          await FT_PIN.disableBiometric(identity.id);
                          toast('Biometric unlock disabled');
                        }
                        ROUTE_RENDERERS.settings(content);
                      } catch (err) {
                        toast(err.message || 'Could not update biometric setting', true);
                        e.target.checked = !checked;
                      }
                    }
                  })
                ])
              ])
        ]),

        h('div', { class: 'card' }, [
          h('h4', {}, 'Appearance'),
          h('p', { class: 'muted small' }, 'Choose how FinTrack looks on this device. Automatic uses dark mode in the evening and at night (6 pm – 6 am) and light mode during the day.'),
          h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, [
            ['dark', '🌙 Dark mode'],
            ['light', '☀️ Light mode'],
            ['auto', '🌗 Automatic (dark in the evening)']
          ].map(([mode, label]) => h('label', { style: 'display:flex;align-items:center;gap:10px;margin:0;cursor:pointer' }, [
            h('input', {
              type: 'radio', name: 'ft-theme', value: mode, checked: FT_THEME.get() === mode,
              onchange: () => { FT_THEME.set(mode); toast('Theme: ' + label.replace(/^\S+\s/, '')); }
            }),
            h('span', {}, label)
          ])))
        ]),

        h('div', { class: 'card' }, [
          h('h4', {}, 'Offline Pending Sync'),
          pendingEntries.length === 0
            ? h('p', { class: 'muted' }, 'No transactions waiting to sync.')
            : h('div', {}, [
                h('p', { class: 'muted' }, `${pendingEntries.length} transaction${pendingEntries.length === 1 ? '' : 's'} saved offline, waiting to upload.`),
                ...pendingEntries.map(({ id, value: entry }) => h('div', { class: 'list-row' }, [
                  h('div', {}, [
                    h('div', {}, entry.description || entry.category || 'Untitled'),
                    h('div', { class: 'muted small' }, `${entry.date} · ${entry.type === 'income' ? '+' : '-'}${(typeof formatMoney === 'function') ? formatMoney(entry.amount, entry.currency || 'USD') : entry.amount}`)
                  ]),
                  h('button', {
                    class: 'icon-btn', onclick: () => confirmDialog('Discard this offline entry without uploading it?', async () => {
                      await FT_DB.removePending(identity.id, id);
                      toast('Discarded');
                      ROUTE_RENDERERS.settings(content);
                    })
                  }, '🗑️')
                ])),
                h('button', {
                  class: 'ft-btn ft-btn-primary', style: 'margin-top:8px',
                  onclick: async () => {
                    if (FT_OFFLINE.isOffline()) { toast("Still offline — can't sync yet.", true); return; }
                    await FT_PENDING_SYNC.run(FT_APP.currentIdentityId, FT_APP.currentSession);
                    ROUTE_RENDERERS.settings(content);
                  }
                }, 'Sync Now')
              ])
        ]),

        h('div', { class: 'card' }, [
          h('h4', {}, 'This Device'),
          h('p', { class: 'muted' }, `${identity.loginName} @ ${identity.serverUrl}`),
          h('button', {
            class: 'ft-btn ft-btn-outline', onclick: async () => {
              // Clear only the cache store, keep credentials/PIN — useful if cached data looks stale/wrong.
              const dbName = `fintrack_data_${identity.id}`;
              const req = indexedDB.open(dbName);
              req.onsuccess = () => {
                const tx = req.result.transaction('cache', 'readwrite');
                tx.objectStore('cache').clear();
                tx.oncomplete = () => toast('Local cache cleared');
              };
            }
          }, 'Clear Local Cache')
        ]),

        h('div', { class: 'card' }, [
          h('h4', {}, 'About App'),
          h('p', {}, [h('strong', {}, 'FinTrack'), ` — Version ${ftVersion()}`]),
          h('p', { class: 'muted small' }, 'Personal finance manager for your Nextcloud server.'),
          h('p', { class: 'muted small' }, 'Developed by Abdul Jaleel Adenpulan.'),
          h('p', { class: 'muted small' }, 'Privacy: the PWA sends no usage data. The Nextcloud app sends the developer a small usage ping (install ID, Nextcloud version, FinTrack version, and optionally your country); see Settings → About FinTrack there. No financial data is ever sent.'),
          h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px' }, [
            h('a', { href: 'https://github.com/cloudsliberty/fintrack', target: '_blank', rel: 'noopener noreferrer', class: 'ft-btn-link', style: 'background:var(--surface-2);color:var(--text);border:1px solid var(--border)' }, 'View on GitHub'),
            h('a', { href: 'https://www.paypal.me/jaleel1618', target: '_blank', rel: 'noopener noreferrer', class: 'ft-btn-link', style: 'background:#ffc439;color:#111' }, 'Donate via PayPal'),
            h('a', { href: 'https://ko-fi.com/jaleel1618', target: '_blank', rel: 'noopener noreferrer', class: 'ft-btn-link', style: 'background:#ff5e5b;color:#fff' }, '☕ Donate via Ko-fi')
          ])
        ]),

        // Directly after About App.
        h('div', { class: 'card' }, [
          h('h4', {}, 'Report an Issue'),
          h('p', { class: 'muted small' }, 'Found a bug? Open an issue on GitHub and please attach the logs file — download it from the FinTrack app in Nextcloud: Settings → Data Management → Error Logs → Download Logs.'),
          h('div', { style: 'margin-top:8px' }, [
            h('a', { href: 'https://github.com/cloudsliberty/fintrack/issues/new', target: '_blank', rel: 'noopener noreferrer', class: 'ft-btn-link', style: 'background:var(--ft-blue);color:#fff' }, '🐞 Report an issue — attach the logs file')
          ])
        ])
      ])
    );
  } catch (err) {
    content.replaceChildren(errorBox(err, () => ROUTE_RENDERERS.settings(content)));
  }
};

function openPinChangeForm(identity, content, isFirstSetup = false) {
  const fields = [
    ...(isFirstSetup ? [] : [{ key: 'currentPassword', label: 'Current PIN', type: 'password', required: true }]),
    { key: 'pin1', label: 'New PIN (4–6 digits)', type: 'password' },
    { key: 'pin2', label: 'Confirm PIN', type: 'password' },
    { key: 'timeoutMinutes', label: 'Re-lock after (minutes)', type: 'select', options: [{ value: 1, label: '1 minute' }, { value: 5, label: '5 minutes' }, { value: 10, label: '10 minutes' }, { value: 15, label: '15 minutes' }, { value: 30, label: '30 minutes' }], default: 10 }
  ];
  openFormModal({
    title: isFirstSetup ? 'Enable Pin Lock' : 'Change PIN',
    fields,
    onSubmit: async (values) => {
      if (!/^\d{4,6}$/.test(values.pin1) || values.pin1 !== values.pin2) throw new Error('PINs must match and be 4–6 digits.');
      if (isFirstSetup) {
        await FT_PIN.setupNewPin(identity.id, values.pin1, Number(values.timeoutMinutes), session());
      } else {
        await FT_PIN.changePin(identity.id, values.currentPassword, values.pin1, Number(values.timeoutMinutes), session());
      }
      toast(isFirstSetup ? 'Pin Lock enabled' : 'PIN updated');
      ROUTE_RENDERERS.settings(content);
    }
  });
}
