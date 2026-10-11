// FinTrack PWA — app.js
// Single-file SPA logic: bootstrap, Login Flow v2, PIN setup/unlock, router shell, and the
// generic CRUD form builder. Section views (accounts.js-equivalent content) are appended below
// in sections.js for readability, but everything shares this same FT_APP namespace.

// The 'base' Nextcloud layout (no sidebar) this page renders with doesn't
// set a page-specific <title> — do it here so the browser tab/task-switcher
// shows "FinTrack" instead of a generic Nextcloud title. Favicon and
// apple-touch-icon are already set server-side in templates/external.php,
// pointing at the same app icon as the Nextcloud app.
document.title = 'FinTrack';

// ── Theme: dark / light / automatic ──
// Stored in localStorage (a per-device display preference, read
// synchronously so the right palette is applied before first paint).
// 'auto' = dark in the evening and night (18:00-06:00), light by day.
const FT_THEME = (() => {
  const KEY = 'ft_pwa_theme';
  const MODES = ['dark', 'light', 'auto'];
  let timer = null;

  function get() {
    try {
      const v = localStorage.getItem(KEY);
      return MODES.includes(v) ? v : 'dark'; // default unchanged: dark
    } catch (_) { return 'dark'; }
  }
  function effective(mode) {
    if (mode === 'auto') {
      const hr = new Date().getHours();
      return (hr >= 18 || hr < 6) ? 'dark' : 'light';
    }
    return mode;
  }
  function apply() {
    const mode = get();
    document.documentElement.setAttribute('data-theme', effective(mode));
    // Automatic mode flips at 18:00 / 06:00 even if the app stays open.
    clearInterval(timer);
    if (mode === 'auto') timer = setInterval(apply, 60 * 1000);
  }
  function set(mode) {
    if (!MODES.includes(mode)) return;
    try { localStorage.setItem(KEY, mode); } catch (_) { /* private mode: applies for this session only */ }
    apply();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(); });
  apply();
  return { get, set, apply, effective };
})();
window.FT_THEME = FT_THEME;

// Fetched dynamically from Nextcloud's own app-info (info.xml), injected
// server-side by PageController::externalForm — same source as the Main
// App's About section version line. Read lazily like the other data-*
// attrs above, for the same reason (script runs before #app-root exists).
const ftVersion = () => (ftRootEl() && ftRootEl().dataset.fintrackVersion) || '?';

// Served from inside the FinTrack Nextcloud app now, not from the PWA's own
// root, so icons live under img/pwa-icons/ instead of ./icons/, and the
// service worker is registered at the URL Nextcloud's router gave it
// (see templates/external.php / PageController::externalServiceWorker).
// These read #app-root's data-* attributes lazily (via functions, not
// top-level consts) because this script runs from <head>, before the
// <div id="app-root"> in the body exists yet — a top-level
// document.getElementById() here would always see null.
const ftRootEl = () => document.getElementById('app-root');
const ftIconBase = () => (ftRootEl() && ftRootEl().dataset.iconBase) || 'icons/';
const ftSwUrl = () => (ftRootEl() && ftRootEl().dataset.swUrl) || 'service-worker.js';
const ftDefaultServerUrl = () => (ftRootEl() && ftRootEl().dataset.serverUrl) || '';

const FT_APP = {
  currentIdentityId: null,
  currentSession: null, // { serverUrl, loginName, appPassword }
  route: 'dashboard',
  installPromptEvent: null
};
window.FT_APP = FT_APP;

// Attached immediately at script-parse time, NOT inside bootstrap()/on
// DOMContentLoaded — beforeinstallprompt can fire before DOMContentLoaded,
// and a missed event is gone for that page load with no way to re-trigger
// it. This was very likely why the install prompt never appeared: the old
// listener only attached once bootstrap() ran on DOMContentLoaded, by
// which point the event may have already fired and been lost.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  FT_APP.installPromptEvent = e;
  // maybeShowInstallPrompt() touches document.body, which may not exist
  // yet this early — bootstrap() also calls it once the DOM is ready, so
  // only show right away if we're past that point already.
  if (document.body) maybeShowInstallPrompt();
});

const root = () => document.getElementById('app-root');

function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === null || c === undefined) return;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}

function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch (_) {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

// Fuzzy-search combo dropdown: text input that filters a fixed option list
// as you type, with a clear ('×') button once something's selected. Used
// everywhere an Account or Category picker needs fuzzy search + a clear
// button instead of a plain <select> (Transactions/Recurring/Transfer
// filters and forms).
// options: [{ value, label }]. onSelect(value) fires on pick or clear
// (clear passes '').
function fuzzyCombo({ options, value = '', placeholder = '', onSelect }) {
  const selected = options.find((o) => String(o.value) === String(value));
  const wrap = h('div', { class: 'ft-combo' });
  const input = h('input', { class: 'ft-input', placeholder, value: selected ? selected.label : '' });
  const clearBtn = h('button', { class: 'ft-combo-clear', type: 'button' }, '×');
  clearBtn.style.display = selected ? '' : 'none';
  const list = h('div', { class: 'ft-combo-list' });
  list.style.display = 'none';

  function renderList(filterText) {
    const text = (filterText || '').toLowerCase();
    const matches = options.filter((o) => !text || o.label.toLowerCase().includes(text)).slice(0, 30);
    list.replaceChildren(...matches.map((o) => h('div', {
      class: 'ft-combo-option',
      onmousedown: (e) => e.preventDefault(), // keep the input's blur from firing before the click
      onclick: () => {
        input.value = o.label;
        clearBtn.style.display = '';
        list.style.display = 'none';
        onSelect(o.value);
      }
    }, o.label)));
    list.style.display = matches.length ? '' : 'none';
  }

  input.addEventListener('input', () => {
    if (!input.value) { clearBtn.style.display = 'none'; onSelect(''); }
    renderList(input.value);
  });
  input.addEventListener('focus', () => renderList(input.value));
  input.addEventListener('blur', () => { list.style.display = 'none'; });
  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    list.style.display = 'none';
    onSelect('');
    input.focus();
  });

  wrap.append(input, clearBtn, list);
  return wrap;
}

// Plain text input with the same '×' clear button fuzzyCombo() has, shown
// only while there's text. Used for free-text filters (e.g. the Transactions
// "Search description" box) so they behave like the combo filters beside them.
// onInput(value) fires on every keystroke and on clear (value '').
function clearableInput({ placeholder = '', value = '', onInput }) {
  const wrap = h('div', { class: 'ft-combo' });
  const input = h('input', { class: 'ft-input', placeholder, value });
  const clearBtn = h('button', { class: 'ft-combo-clear', type: 'button', 'aria-label': 'Clear' }, '×');
  clearBtn.style.display = value ? '' : 'none';
  input.addEventListener('input', () => {
    clearBtn.style.display = input.value ? '' : 'none';
    onInput(input.value);
  });
  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    onInput('');
    input.focus();
  });
  wrap.append(input, clearBtn);
  return wrap;
}

// Tag autosuggest input: type to fuzzy-search existing tags (or press Enter
// to add a new one), each pick renders as a dismissible chip below and the
// input clears itself. Used in Transaction/Recurring forms and the
// Transactions tag filter.
function tagComboInput({ allTags = [], selected = [], onChange }) {
  let current = [...selected];
  const wrap = h('div', {});
  const input = h('input', { class: 'ft-input', placeholder: 'Add a tag…' });
  const list = h('div', { class: 'ft-combo-list' });
  list.style.display = 'none';
  const chipsRow = h('div', { class: 'chip-row' });

  function renderChips() {
    chipsRow.replaceChildren(...current.map((t) => h('span', { class: 'chip' }, [
      `#${t}`,
      h('button', { class: 'chip-remove', type: 'button', onclick: () => { current = current.filter((x) => x !== t); renderChips(); onChange([...current]); } }, '×')
    ])));
  }
  function pick(tag) {
    tag = tag.trim();
    if (!tag || current.includes(tag)) return;
    current.push(tag);
    input.value = '';
    list.style.display = 'none';
    renderChips();
    onChange([...current]);
  }
  input.addEventListener('input', () => {
    const text = input.value.trim().toLowerCase();
    const matches = allTags.filter((t) => !current.includes(t) && t.toLowerCase().includes(text)).slice(0, 20);
    list.replaceChildren(...matches.map((t) => h('div', { class: 'ft-combo-option', onmousedown: (e) => e.preventDefault(), onclick: () => pick(t) }, `#${t}`)));
    list.style.display = matches.length ? '' : 'none';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); pick(input.value); }
  });
  input.addEventListener('blur', () => { list.style.display = 'none'; });
  renderChips();
  wrap.append(input, list, chipsRow);
  wrap._getValue = () => [...current];
  return wrap;
}

// Shared with the Nextcloud app's cache: CurrenciesController stores the last
// successfully fetched online rate (and when) per currency pair as plain
// settings keys, which come back in the same getSettings() payload the PWA
// already fetches — so these are free reads, no extra request.
function getLastFetchedRate(settings, from, to) {
  const val = settings && settings['fx_last_rate_' + from + '_' + to];
  return val ? parseFloat(val) : null;
}
function getLastFetchedRateLabel(settings, from, to) {
  const ts = settings && settings['fx_last_rate_ts_' + from + '_' + to];
  if (!ts) return '';
  const d = new Date(parseFloat(ts) * 1000);
  return `Last updated: ${d.toLocaleString()}`;
}

function toast(message, isError = false) {
  const t = h('div', { class: `ft-toast ${isError ? 'ft-toast-error' : ''}` }, message);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

// ── Sync status (mirrors the Android app's icon-only status pill) ──
const FT_SYNC = (() => {
  let state = 'idle'; // idle | connecting | offline
  let inFlight = 0;
  const el = () => document.getElementById('sync-status-icon');

  function render() {
    const node = el();
    if (!node) return;
    node.className = 'sync-icon';
    if (inFlight > 0) {
      node.classList.add('spin');
      node.innerHTML = '&#8635;'; // spinner glyph
      node.title = 'Refreshing…';
    } else if (state === 'offline') {
      node.classList.add('sync-offline');
      node.innerHTML = '&#9729;&#8203;\u26A0'; // cloud + warning fallback glyph
      node.textContent = '⚠';
      node.title = 'Offline — showing cached data';
    } else {
      node.classList.add('sync-ok');
      node.textContent = '✓';
      node.title = 'Up to date';
    }
  }

  function begin() { inFlight++; render(); }
  function end(usedCache) { inFlight = Math.max(0, inFlight - 1); state = usedCache ? 'offline' : 'idle'; render(); }
  return { begin, end, render };
})();

// ── Offline detection ──
// Proactive (navigator.onLine + online/offline events) rather than only
// inferred from failed requests (FT_SYNC above is reactive/cosmetic for the
// status pill) — this is the source of truth the "New Transaction only"
// offline restriction and the pending-sync engine both check.
const FT_OFFLINE = (() => {
  let offline = !navigator.onLine;
  const listeners = [];
  function isOffline() { return offline; }
  function onChange(fn) { listeners.push(fn); }
  function setOffline(v) {
    if (v === offline) return;
    offline = v;
    listeners.forEach((fn) => fn(offline));
  }
  window.addEventListener('online', () => setOffline(false));
  window.addEventListener('offline', () => setOffline(true));
  return { isOffline, onChange };
})();

/** Two-outcome confirm (Upload anyway / Discard) for a potential-duplicate pending entry. Resolves true=upload, false=discard. */
function confirmDuplicateUpload(message) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (v) => { if (!resolved) { resolved = true; resolve(v); } };
    const body = h('div', { class: 'ft-modal' }, [
      h('p', {}, message),
      h('div', { class: 'ft-modal-actions' }, [
        h('button', { class: 'ft-btn ft-btn-text', onclick: () => { closeModal(overlay); done(false); } }, 'Discard'),
        h('button', { class: 'ft-btn ft-btn-primary', onclick: () => { closeModal(overlay); done(true); } }, 'Upload anyway')
      ])
    ]);
    const overlay = openModal(body);
  });
}

/**
 * Offline Restriction: wraps any write-action handler (create/edit/delete
 * button) so it's a no-op with an explanatory toast while offline — the
 * only action NOT wrapped in this anywhere in the PWA is creating a new
 * transaction (see openTxForm in pwa-sections.js), which queues locally
 * instead of being blocked.
 */
function offlineGuard(fn, what) {
  return function (...args) {
    if (FT_OFFLINE.isOffline()) {
      toast(`You're offline — ${what || 'this'} needs a connection. You can still add new transactions.`, true);
      return;
    }
    return fn.apply(this, args);
  };
}

// ── Offline pending-transactions sync ──
//
// Offline Restriction: while FT_OFFLINE.isOffline(), the only write action
// allowed anywhere in the PWA is creating a new transaction (see openTxForm
// in pwa-sections.js) — everything else (accounts, transfers, recurring,
// budgets, categories, tags, currencies, and editing/deleting anything
// existing) is disabled with an explanatory message. A transaction created
// offline is queued locally (FT_DB.addPending, AES-encrypted like everything
// else this app stores) instead of hitting the network.
//
// Duplicate Prevention Sync Protocol: before uploading each queued entry,
// its date+amount is checked against the transactions already on the
// server. A match prompts for confirmation before uploading that specific
// entry — declining discards just that one entry, without blocking the rest
// of the queue.
const FT_PENDING_SYNC = (() => {
  let syncing = false;

  async function count(identityId) {
    if (!identityId) return 0;
    const key = FT_PIN.currentKey(identityId);
    if (!key) return 0;
    try {
      const pending = await FT_DB.listPending(identityId, key);
      return pending.length;
    } catch (e) { return 0; }
  }

  function isPotentialDuplicate(entry, existingTransactions) {
    return existingTransactions.some((t) => t.date === entry.date && Number(t.amount) === Number(entry.amount));
  }

  /** Runs once; safe to call repeatedly (e.g. on the 'online' event, after a manual offline entry, and from the Settings dashboard's "Sync Now"). */
  async function run(identityId, session) {
    if (syncing || !identityId || !session || FT_OFFLINE.isOffline()) return;
    const key = FT_PIN.currentKey(identityId);
    if (!key) return;
    syncing = true;
    try {
      const pending = await FT_DB.listPending(identityId, key);
      if (!pending.length) return;

      let existingTransactions = [];
      try {
        existingTransactions = await FT_API.getTransactions(session, {});
      } catch (e) { return; } // not really online after all — try again next time

      let uploaded = 0;
      for (const { id, value: entry } of pending) {
        if (isPotentialDuplicate(entry, existingTransactions)) {
          const amountLabel = (typeof formatMoney === 'function') ? formatMoney(entry.amount, entry.currency || 'USD') : entry.amount;
          const proceed = await confirmDuplicateUpload(
            `A transaction with matching date (${entry.date}) and amount (${amountLabel}) already exists. Do you still want to upload this entry?`
          );
          if (!proceed) { await FT_DB.removePending(identityId, id); continue; }
        }
        try {
          await FT_API.createTransaction(session, entry);
          await FT_DB.removePending(identityId, id);
          existingTransactions.push(entry); // so a second queued entry with the same date/amount also gets flagged
          uploaded++;
        } catch (e) {
          // Server/network rejected it — leave queued, try again next sync.
        }
      }
      if (uploaded > 0 && typeof toast === 'function') toast(`Synced ${uploaded} offline transaction${uploaded === 1 ? '' : 's'}`);
    } finally {
      syncing = false;
    }
  }

  return { count, run };
})();

FT_OFFLINE.onChange((offline) => {
  if (!offline) FT_PENDING_SYNC.run(FT_APP.currentIdentityId, FT_APP.currentSession);
});


// ── Cache-then-network data loading (same pattern as the Android app) ──
async function cachedLoad(cacheKey, networkFn) {
  const identityId = FT_APP.currentIdentityId;
  const key = FT_PIN.currentKey(identityId);
  const cached = key ? await FT_DB.getDecrypted(identityId, 'cache', cacheKey, key).catch(() => undefined) : undefined;

  FT_SYNC.begin();
  try {
    const fresh = await networkFn();
    if (key) FT_DB.putEncrypted(identityId, 'cache', cacheKey, key, fresh).catch(() => {});
    FT_SYNC.end(false);
    return { data: fresh, fromCache: false };
  } catch (err) {
    FT_SYNC.end(true);
    if (cached !== undefined) return { data: cached, fromCache: true };
    throw err;
  }
}

// ── Bootstrap ──
async function bootstrap() {
  if ('serviceWorker' in navigator) {
    // Scope = the PWA page's own path (the server allows exactly that via
    // Service-Worker-Allowed), so the page and manifest are controlled — and
    // cached for offline — on pretty-URL and /index.php/ installs alike.
    const swPath = new URL(ftSwUrl(), location.href).pathname;
    navigator.serviceWorker.register(ftSwUrl(), { scope: swPath.replace(/\/sw\.js$/, '') })
      .catch(() => navigator.serviceWorker.register(ftSwUrl()).catch(() => {}));
  }
  setupInstallPrompt();

  const lastIdentityId = await FT_DB.getMeta('lastIdentityId');
  const identities = await FT_DB.listIdentities();

  if (!lastIdentityId || !identities.find((i) => i.id === lastIdentityId)) {
    renderLogin(identities);
    return;
  }

  FT_APP.currentIdentityId = lastIdentityId;
  const identity = identities.find((i) => i.id === lastIdentityId);

  // PWA data retention: if this identity hasn't been active (unlocked) for
  // longer than its cached retention-days setting, wipe its local cached
  // data now rather than asking for the PIN just to immediately discard it.
  // Purely client-side/offline — matches the Settings copy ("logs out and
  // wipes its local cached data on next launch"). Falls back to 30 days if
  // never synced.
  const retentionDays = identity.cachedRetentionDays || 30;
  if (identity.lastActiveAt && (Date.now() - identity.lastActiveAt) > retentionDays * 86400000) {
    await FT_DB.wipeIdentityData(identity.id);
    await FT_DB.deleteIdentity(identity.id);
    await FT_DB.setMeta('lastIdentityId', null);
    renderLogin(await FT_DB.listIdentities());
    return;
  }

  if (identity.encSalt) {
    // Every fresh page load always re-asks for the PIN, full stop — the encryption key has to be
    // re-derived from it every time (nothing sensitive is ever kept in memory across a reload).
    // The timeout-aware "don't re-ask if only briefly backgrounded" leniency (isLockRequiredNow)
    // only matters for an already-unlocked warm session resuming from visibilitychange, not this.
    renderPinUnlock(identity);
  } else {
    // No local record for this identity at all (e.g. cleared storage, or login succeeded but Pin
    // Lock setup was never finished) — needs a fresh login to re-establish it.
    renderLogin(identities);
  }
}

// ── Login (Nextcloud Login Flow v2) ──
function renderLogin(identities) {
  root().replaceChildren(
    h('div', { class: 'auth-screen' }, [
      h('img', { src: ftIconBase() + 'icon-192.png', class: 'auth-logo', alt: 'FinTrack' }),
      h('h1', {}, 'FinTrack'),
      h('p', { class: 'muted' }, 'Sign in to your Nextcloud server'),
      h('input', { id: 'server-url', type: 'url', placeholder: 'https://cloud.example.com', class: 'ft-input', value: ftDefaultServerUrl() }),
      h('button', { id: 'login-btn', class: 'ft-btn ft-btn-primary' }, 'Continue'),
      h('div', { id: 'login-status', class: 'muted', style: 'margin-top:12px' }),
      identities.length
        ? h('div', { style: 'margin-top:24px' }, [
            h('p', { class: 'muted' }, 'Or switch to a previous account:'),
            ...identities.map((i) =>
              h('button', { class: 'ft-btn ft-btn-outline', style: 'display:block;width:100%;margin-top:8px', onclick: () => switchIdentity(i) },
                `${i.loginName} @ ${i.serverUrl.replace(/^https?:\/\//, '')}`)
            )
          ])
        : null
    ])
  );

  document.getElementById('login-btn').addEventListener('click', async () => {
    const serverUrl = document.getElementById('server-url').value.trim();
    const statusEl = document.getElementById('login-status');
    if (!serverUrl) return;
    statusEl.textContent = 'Starting login…';
    try {
      // This is Nextcloud's official Login Flow v2 (the same protocol the Android app uses),
      // relayed through FinTrack's own login-proxy routes so it's reachable cross-origin — see
      // LoginProxyController in the Nextcloud app.
      const flow = await FT_API.initLoginFlow(serverUrl);
      const popup = window.open(flow.login, '_blank', 'noopener');
      statusEl.replaceChildren(
        'Complete the login in the tab that just opened, then come back here.',
        h('br'),
        !popup || popup.closed
          ? h('a', { href: flow.login, target: '_blank', rel: 'noopener' }, "Didn't open? Click here to log in.")
          : null,
        h('br'),
        h('button', { class: 'ft-btn ft-btn-text', id: 'cancel-login-btn', style: 'margin-top:8px' }, 'Cancel')
      );
      const stopPolling = pollForLogin(flow.poll.endpoint, flow.poll.token, serverUrl, statusEl);
      document.getElementById('cancel-login-btn').addEventListener('click', () => {
        stopPolling();
        statusEl.textContent = '';
      });
    } catch (err) {
      statusEl.textContent = err.message || 'Could not reach that server.';
    }
  });
}

async function switchIdentity(identity) {
  FT_APP.currentIdentityId = identity.id;
  await FT_DB.setMeta('lastIdentityId', identity.id);
  renderPinUnlock(identity);
}

function pollForLogin(endpoint, token, serverUrl, statusEl) {
  const intervalId = setInterval(async () => {
    try {
      const creds = await FT_API.pollLogin(endpoint, token, serverUrl);
      if (!creds) return; // still pending
      clearInterval(intervalId);
      statusEl.textContent = 'Signed in! Checking Pin Lock…';
      await onLoginSuccess(creds);
    } catch (err) {
      clearInterval(intervalId);
      statusEl.textContent = err.message || 'Login failed or expired — try again.';
    }
  }, 2000);
  // Give up after 5 minutes so a stale tab doesn't poll forever.
  const timeoutId = setTimeout(() => clearInterval(intervalId), 5 * 60 * 1000);
  return () => { clearInterval(intervalId); clearTimeout(timeoutId); };
}

async function onLoginSuccess(creds) {
  const identityId = await FT_CRYPTO.identityHash(creds.serverUrl, creds.loginName);
  const identities = await FT_DB.listIdentities();
  const existing = identities.find((i) => i.id === identityId);

  FT_APP.currentIdentityId = identityId;
  FT_APP.currentSession = creds;
  await FT_DB.setMeta('lastIdentityId', identityId);
  await FT_DB.saveIdentity({ id: identityId, serverUrl: creds.serverUrl, loginName: creds.loginName, encSalt: existing?.encSalt, cachedLockStatus: existing?.cachedLockStatus });

  // Always check the server's actual Pin Lock state — never assume based on stale local data.
  let status;
  try {
    status = await FT_API.getLockStatus(creds);
  } catch (err) {
    root().replaceChildren(h('div', { class: 'auth-screen' }, [
      h('p', {}, `Signed in, but couldn't reach FinTrack's API to check Pin Lock status: ${err.message}`),
      h('button', { class: 'ft-btn ft-btn-primary', onclick: () => onLoginSuccess(creds) }, 'Retry')
    ]));
    return;
  }

  if (status.enabled) {
    renderPinAdopt({ id: identityId, serverUrl: creds.serverUrl, loginName: creds.loginName }, creds, status);
  } else {
    renderPinSetup({ id: identityId, serverUrl: creds.serverUrl, loginName: creds.loginName }, creds);
  }
}

/** Server has NO Pin Lock configured yet for this Nextcloud account — offer to create one (same as Settings -> Pin Lock in the Nextcloud app). */
function renderPinSetup(identity, session) {
  root().replaceChildren(
    h('div', { class: 'auth-screen' }, [
      h('img', { src: ftIconBase() + 'icon-192.png', class: 'auth-logo', alt: 'FinTrack' }),
      h('h1', {}, 'FinTrack'),
      h('p', { class: 'muted' }, `Version ${ftVersion()}`),
      h('h2', { style: 'margin-top:24px' }, 'Set up Pin Lock'),
      h('p', { class: 'muted' }, "This is the same Pin Lock as FinTrack's Settings in the Nextcloud app — the PIN you set here works everywhere, and protects everything stored on this device too."),
      h('input', { id: 'pin1', type: 'password', inputmode: 'numeric', maxlength: '6', placeholder: 'New PIN (4–6 digits)', class: 'ft-input' }),
      h('input', { id: 'pin2', type: 'password', inputmode: 'numeric', maxlength: '6', placeholder: 'Confirm PIN', class: 'ft-input' }),
      h('label', { class: 'ft-field-label' }, 'Re-lock after (minutes in background)'),
      h('select', { id: 'pin-timeout', class: 'ft-input' }, [
        h('option', { value: '1' }, '1 minute'),
        h('option', { value: '5' }, '5 minutes'),
        h('option', { value: '10', selected: true }, '10 minutes'),
        h('option', { value: '15' }, '15 minutes'),
        h('option', { value: '30' }, '30 minutes')
      ]),
      h('div', { id: 'pin-setup-error', class: 'ft-error' }),
      h('button', { id: 'pin-setup-btn', class: 'ft-btn ft-btn-primary' }, 'Enable Pin Lock & Continue')
    ])
  );

  document.getElementById('pin-setup-btn').addEventListener('click', async () => {
    const pin1 = document.getElementById('pin1').value;
    const pin2 = document.getElementById('pin2').value;
    const timeoutMinutes = Number(document.getElementById('pin-timeout').value);
    const errEl = document.getElementById('pin-setup-error');
    if (!/^\d{4,6}$/.test(pin1)) { errEl.textContent = 'PIN must be 4–6 digits.'; return; }
    if (pin1 !== pin2) { errEl.textContent = "PINs don't match."; return; }
    try {
      await FT_PIN.setupNewPin(identity.id, pin1, timeoutMinutes, session);
      FT_APP.currentSession = session;
      await maybeOfferBiometric(identity, pin1);
      enterApp();
    } catch (err) {
      errEl.textContent = err.message || 'Could not set up Pin Lock.';
    }
  });
}

/** Server already HAS a Pin Lock configured (set up in the Nextcloud app, or another device) — confirm it, then adopt it locally. */
function renderPinAdopt(identity, session, status) {
  root().replaceChildren(
    h('div', { class: 'auth-screen' }, [
      h('img', { src: ftIconBase() + 'icon-192.png', class: 'auth-logo', alt: 'FinTrack' }),
      h('h1', {}, 'FinTrack'),
      h('p', { class: 'muted' }, `Version ${ftVersion()}`),
      h('h2', { style: 'margin-top:24px' }, 'Enter your Pin Lock PIN'),
      h('p', { class: 'muted' }, `${identity.loginName} @ ${identity.serverUrl.replace(/^https?:\/\//, '')} already has Pin Lock enabled (re-locks after ${status.timeoutMinutes} min). Enter it to set this device up too.`),
      h('input', { id: 'pin-adopt', type: 'password', inputmode: 'numeric', maxlength: '6', placeholder: 'PIN', class: 'ft-input', autofocus: true }),
      h('div', { id: 'pin-adopt-error', class: 'ft-error' }),
      h('button', { id: 'pin-adopt-btn', class: 'ft-btn ft-btn-primary' }, 'Confirm')
    ])
  );

  async function tryAdopt() {
    const pin = document.getElementById('pin-adopt').value;
    const errEl = document.getElementById('pin-adopt-error');
    try {
      await FT_PIN.adoptExistingPin(identity.id, pin, session);
      FT_APP.currentSession = session;
      await maybeOfferBiometric(identity, pin);
      enterApp();
    } catch (err) {
      errEl.textContent = err.status === 423 ? (err.message || 'Too many attempts') : 'Incorrect PIN';
      document.getElementById('pin-adopt').value = '';
    }
  }
  document.getElementById('pin-adopt-btn').addEventListener('click', tryAdopt);
  document.getElementById('pin-adopt').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryAdopt(); });
}

function renderPinUnlock(identity) {
  root().replaceChildren(
    h('div', { class: 'auth-screen' }, [
      h('img', { src: ftIconBase() + 'icon-192.png', class: 'auth-logo', alt: 'FinTrack' }),
      h('h1', {}, 'FinTrack'),
      h('p', { class: 'muted' }, `Version ${ftVersion()}`),
      h('h2', { style: 'margin-top:24px' }, 'Enter your PIN'),
      h('p', { class: 'muted' }, `${identity.loginName} @ ${identity.serverUrl.replace(/^https?:\/\//, '')}`),
      h('input', { id: 'pin-unlock', type: 'password', inputmode: 'numeric', maxlength: '6', placeholder: 'PIN', class: 'ft-input', style: 'text-align:center', autofocus: true }),
      h('div', { id: 'pin-unlock-error', class: 'ft-error' }),
      h('button', { id: 'pin-unlock-btn', class: 'ft-btn ft-btn-primary' }, 'Unlock'),
      h('button', { id: 'bio-unlock-btn', class: 'ft-btn ft-btn-outline', style: 'display:none;margin-top:8px' }, '👆 Unlock with biometrics'),
      h('button', { id: 'switch-account-btn', class: 'ft-btn ft-btn-text', style: 'margin-top:16px' }, 'Not you? Switch account'),
      h('button', { id: 'forgot-pin-btn', class: 'ft-btn ft-btn-text' }, 'Forgot PIN? Remove this account from this device')
    ])
  );

  async function afterUnlockResult(result) {
    if (!result.ok) {
      const errEl = document.getElementById('pin-unlock-error');
      errEl.textContent = result.lockedUntil
        ? `${result.error} (try again after ${new Date(result.lockedUntil * 1000).toLocaleTimeString()})`
        : result.error;
      document.getElementById('pin-unlock').value = '';
      if (result.staleDevice) setTimeout(async () => { await logout(); }, 2500);
      return;
    }
    FT_APP.currentSession = await FT_DB.getDecrypted(identity.id, 'secure', 'session', FT_PIN.currentKey(identity.id));
    if (result.offline) toast('Offline — unlocked with your last verified PIN.');
    enterApp();
  }

  async function tryUnlock() {
    const pin = document.getElementById('pin-unlock').value;
    const btn = document.getElementById('pin-unlock-btn');
    btn.disabled = true;
    const result = await FT_PIN.tryUnlock(identity.id, pin);
    btn.disabled = false;
    await afterUnlockResult(result);
  }

  async function tryBiometric() {
    const result = await FT_PIN.tryBiometricUnlock(identity.id);
    if (result) await afterUnlockResult(result);
  }

  document.getElementById('pin-unlock-btn').addEventListener('click', tryUnlock);
  document.getElementById('pin-unlock').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
  document.getElementById('switch-account-btn').addEventListener('click', async () => {
    FT_APP.currentIdentityId = null;
    await FT_DB.setMeta('lastIdentityId', null);
    renderLogin(await FT_DB.listIdentities());
  });
  document.getElementById('forgot-pin-btn').addEventListener('click', async () => {
    if (!confirm('This removes all locally cached data for this account from this device (including its local copy of the Pin Lock check). Your Pin Lock itself stays enabled on the server — you\'ll confirm it again next time you log in here. Continue?')) return;
    closeAllModals();
    await FT_DB.wipeIdentityData(identity.id);
    await FT_DB.deleteIdentity(identity.id);
    await FT_DB.setMeta('lastIdentityId', null);
    FT_PIN.lock();
    renderLogin(await FT_DB.listIdentities());
  });

  // If biometric is enabled AND this tab already has the PIN cached (i.e. it was typed once
  // already this session), offer it — and try it automatically, matching how native apps
  // greet a re-lock with a biometric prompt rather than making the person tap a button first.
  FT_PIN.isBiometricEnabled(identity.id).then((enabled) => {
    if (!enabled) return;
    const bioBtn = document.getElementById('bio-unlock-btn');
    bioBtn.style.display = '';
    bioBtn.addEventListener('click', tryBiometric);
    tryBiometric();
  });
}

function enterApp() {
  FT_APP.route = 'dashboard';
  renderShell();
  FT_PWA_SESSION.onEnterApp(FT_APP.currentIdentityId, FT_APP.currentSession);
  FT_PENDING_SYNC.run(FT_APP.currentIdentityId, FT_APP.currentSession);
}

// ── PWA session UID / remote-wipe system ──
//
// Each PWA install (a browser + Nextcloud account pairing) generates its own
// UID once and registers it server-side (PwaSessionsController). Settings ->
// External Access - PWA in the Nextcloud app lists these and can revoke one
// remotely; checkStatus() below is what notices a revocation and wipes this
// device's local cached data. Runs once on every enterApp() and on a
// 5-minute interval while the app tab stays open — "whenever the PWA
// starts/syncs/refreshes", per the feature's intent, without a network
// round-trip on every single API call.
const FT_PWA_SESSION = (() => {
  let intervalHandle = null;

  function shortDeviceLabel() {
    const ua = navigator.userAgent || '';
    const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
    const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    return `${browser} on ${os}`;
  }

  async function getOrCreateUid(identityId) {
    const identity = await FT_PIN.getIdentity(identityId);
    if (identity && identity.pwaSessionUid) return identity.pwaSessionUid;
    const uid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await FT_DB.saveIdentity({ ...(identity || { id: identityId }), pwaSessionUid: uid });
    return uid;
  }

  async function checkStatus(identityId, session) {
    if (!session) return;
    const identity = await FT_PIN.getIdentity(identityId);
    if (!identity || !identity.pwaSessionUid) return;
    let result;
    try {
      result = await FT_API.getPwaSessionStatus(session, identity.pwaSessionUid);
    } catch (e) {
      return; // offline/unreachable — don't wipe on a network error, only on an explicit "invalid"
    }
    if (result && result.valid === false) {
      toast('This device was revoked from FinTrack PWA settings — signing out and wiping local data.', true);
      await FT_DB.wipeIdentityData(identityId);
      await FT_DB.deleteIdentity(identityId);
      await logout();
    }
  }

  async function onEnterApp(identityId, session) {
    if (!identityId || !session) return;
    const uid = await getOrCreateUid(identityId);
    const identity = await FT_PIN.getIdentity(identityId);

    // register() is an upsert — calling it again after a revoke would just
    // re-create the deleted row, silently undoing the revoke. So it's only
    // ever called once per identity (tracked locally via
    // pwaSessionRegistered); every later app-open only calls checkStatus(),
    // which treats a missing row as "revoked", not "never registered".
    if (!identity.pwaSessionRegistered) {
      try {
        await FT_API.registerPwaSession(session, uid, shortDeviceLabel());
        await FT_DB.saveIdentity({ ...(await FT_PIN.getIdentity(identityId)), pwaSessionRegistered: true });
      } catch (e) { /* offline — will retry next successful app open */ }
    }

    // Cache the retention-days setting + bump lastActiveAt, for bootstrap()'s
    // offline inactivity check next time the app cold-starts.
    try {
      const settings = await FT_API.getSettings(session);
      const freshIdentity = await FT_PIN.getIdentity(identityId);
      await FT_DB.saveIdentity({ ...freshIdentity, lastActiveAt: Date.now(), cachedRetentionDays: Number(settings.pwa_data_retention_days) || 30 });
    } catch (e) { /* offline — keep whatever was cached before */ }

    checkStatus(identityId, session);
    if (intervalHandle) clearInterval(intervalHandle);
    intervalHandle = setInterval(() => {
      checkStatus(FT_APP.currentIdentityId, FT_APP.currentSession);
      FT_PENDING_SYNC.run(FT_APP.currentIdentityId, FT_APP.currentSession);
    }, 5 * 60 * 1000);
  }

  function stop() {
    if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
  }

  return { onEnterApp, stop };
})();

/**
 * First-login biometric onboarding: offered right after a PIN was just
 * typed successfully (setup or adopt), since that's the one moment the
 * plaintext PIN is available to cache for the biometric gate (see the
 * design note above FT_PIN's biometric functions). Skipped silently if
 * the device/browser has no platform authenticator, or biometric is
 * already enabled for this identity.
 */
async function maybeOfferBiometric(identity, pin) {
  if (!FT_PIN.biometricSupported()) return;
  if (await FT_PIN.isBiometricEnabled(identity.id)) return;
  const overlay = openModal(h('div', { class: 'ft-modal' }, [
    h('h3', {}, 'Enable biometric unlock?'),
    h('p', { class: 'muted' }, "Use Face/Touch ID or your device's screen lock to unlock FinTrack instead of retyping your PIN."),
    h('div', { class: 'ft-modal-actions' }, [
      h('button', { class: 'ft-btn ft-btn-text', onclick: () => closeModal(overlay) }, 'Not now'),
      h('button', {
        class: 'ft-btn ft-btn-primary', onclick: async () => {
          try {
            await FT_PIN.enableBiometric(identity.id, pin);
            toast('Biometric unlock enabled');
          } catch (err) {
            toast(err.message || 'Could not enable biometric unlock', true);
          }
          closeModal(overlay);
        }
      }, 'Enable')
    ])
  ]));
}

async function logout() {
  closeAllModals();
  FT_PWA_SESSION.stop();
  FT_PIN.lock();
  await FT_DB.setMeta('lastIdentityId', null);
  FT_APP.currentIdentityId = null;
  FT_APP.currentSession = null;
  renderLogin(await FT_DB.listIdentities());
}

// ── App shell + router ──
// Simple outline SVG icons for the nav bar, replacing emoji glyphs — flat,
// stroke-based, currentColor (so they pick up --text/active colors automatically),
// in the same minimal style as Nextcloud's own core icon set.
const NAV_ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  transactions: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h4"/></svg>',
  accounts: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6"/><path d="M5 10v9h14v-9"/><path d="M10 19v-6h4v6"/></svg>',
  transfers: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h13l-4-4"/><path d="M17 17H4l4 4"/></svg>',
  recurring: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 14-5.3L21 9"/><path d="M21 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L3 15"/><path d="M3 20v-5h5"/></svg>',
  budgets: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12z"/><path d="M12 2v10"/></svg>',
  categories: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 12.4 12 21l-9-9V4h8z"/><circle cx="7" cy="8" r="1.4" fill="currentColor" stroke="none"/></svg>',
  currencies: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="6"/><circle cx="15" cy="15" r="6"/></svg>',
  settings: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  logout: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>'
};

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: NAV_ICONS.dashboard },
  { id: 'transactions', label: 'Transactions', icon: NAV_ICONS.transactions },
  { id: 'accounts', label: 'Accounts', icon: NAV_ICONS.accounts },
  { id: 'transfers', label: 'Transfers', icon: NAV_ICONS.transfers },
  { id: 'recurring', label: 'Recurring', icon: NAV_ICONS.recurring },
  { id: 'budgets', label: 'Budgets', icon: NAV_ICONS.budgets },
  { id: 'categories', label: 'Categories & Tags', icon: NAV_ICONS.categories },
  { id: 'currencies', label: 'Currencies', icon: NAV_ICONS.currencies },
  { id: 'settings', label: 'Settings', icon: NAV_ICONS.settings }
];

// Bottom nav bar (mobile only, see .bottom-nav / .app-sidebar CSS) fits
// exactly 5 buttons: the 4 most-used sections plus a "More" button that
// pops up the rest — a full 9-item bar wouldn't fit legibly on a phone
// width. The desktop sidebar (.app-sidebar) still shows the full list.
const PRIMARY_NAV_IDS = ['dashboard', 'transactions', 'accounts', 'transfers'];
const MORE_NAV_ITEMS = NAV_ITEMS.filter((item) => !PRIMARY_NAV_IDS.includes(item.id));

function navButton(item) {
  return h('button', {
    class: `nav-item ${FT_APP.route === item.id ? 'active' : ''}`,
    'data-route': item.id,
    onclick: () => { closeMoreMenu(); navigate(item.id); }
  }, [h('span', { class: 'nav-icon', html: item.icon }), h('span', { class: 'nav-label' }, item.label)]);
}

function closeMoreMenu() {
  document.getElementById('bottom-nav-more-menu')?.remove();
  document.getElementById('more-nav-btn')?.classList.remove('active');
}

function toggleMoreMenu() {
  const existing = document.getElementById('bottom-nav-more-menu');
  if (existing) { closeMoreMenu(); return; }
  const moreBtn = document.getElementById('more-nav-btn');
  moreBtn?.classList.add('active');
  const menu = h('div', { id: 'bottom-nav-more-menu', class: 'more-nav-menu' }, [
    ...MORE_NAV_ITEMS.map((item) => h('button', {
      class: `more-nav-item ${FT_APP.route === item.id ? 'active' : ''}`,
      onclick: () => { closeMoreMenu(); navigate(item.id); }
    }, [h('span', { class: 'nav-icon', html: item.icon }), h('span', {}, item.label)])),
    h('button', { class: 'more-nav-item', onclick: () => { closeMoreMenu(); logout(); } }, [h('span', { class: 'nav-icon', html: NAV_ICONS.logout }), h('span', {}, 'Log Out')])
  ]);
  document.querySelector('.bottom-nav')?.appendChild(menu);
  // Tapping anywhere outside the popup closes it.
  setTimeout(() => document.addEventListener('click', function onDocClick(e) {
    if (!menu.contains(e.target) && e.target.id !== 'more-nav-btn') { closeMoreMenu(); document.removeEventListener('click', onDocClick); }
  }), 0);
}

function renderShell() {
  root().replaceChildren(
    h('div', { class: 'app-shell' }, [
      h('header', { class: 'app-topbar' }, [
        h('div', { class: 'app-title' }, 'FinTrack'),
        h('div', { id: 'sync-status-icon', class: 'sync-icon' })
      ]),
      // Desktop: full list, vertical sidebar.
      h('nav', { class: 'app-sidebar' }, NAV_ITEMS.map(navButton)
        .concat([h('button', { class: 'nav-item nav-logout', onclick: logout }, [h('span', { class: 'nav-icon', html: NAV_ICONS.logout }), h('span', { class: 'nav-label' }, 'Log Out')])])),
      // Mobile: 4 primary + "More" (5 total), More pops up the rest.
      h('nav', { class: 'bottom-nav' }, [
        ...PRIMARY_NAV_IDS.map((id) => navButton(NAV_ITEMS.find((i) => i.id === id))),
        h('button', { id: 'more-nav-btn', class: 'nav-item', onclick: (e) => { e.stopPropagation(); toggleMoreMenu(); } }, [h('span', { class: 'nav-icon', html: NAV_ICONS.more }), h('span', { class: 'nav-label' }, 'More')])
      ]),
      h('main', { id: 'app-content', class: 'app-content' })
    ])
  );
  FT_SYNC.render();
  navigate(FT_APP.route);
}

const ROUTE_RENDERERS = {}; // populated by sections.js

function navigate(routeId) {
  FT_APP.route = routeId;
  document.querySelectorAll('.nav-item[data-route]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-route') === routeId);
  });
  const content = document.getElementById('app-content');
  content.replaceChildren(h('div', { class: 'loading-placeholder' }, 'Loading…'));
  const renderer = ROUTE_RENDERERS[routeId];
  if (renderer) renderer(content);
}

// Clicking an account tile, category card, or tag chip jumps to Transactions
// pre-filtered to just that item, clearing any other active filters — mirrors
// the Nextcloud app's showAccountTransactions()/category-and-tag click behavior.
function navigateToAccountTransactions(accountId) {
  ROUTE_RENDERERS.transactions._filters = { accountId: String(accountId) };
  ROUTE_RENDERERS.transactions._search = '';
  ROUTE_RENDERERS.transactions._tagFilters = [];
  navigate('transactions');
}
function navigateToCategoryTransactions(category) {
  ROUTE_RENDERERS.transactions._filters = { category };
  ROUTE_RENDERERS.transactions._search = '';
  ROUTE_RENDERERS.transactions._tagFilters = [];
  navigate('transactions');
}
function navigateToTagTransactions(tag) {
  ROUTE_RENDERERS.transactions._filters = {};
  ROUTE_RENDERERS.transactions._search = '';
  ROUTE_RENDERERS.transactions._tagFilters = [tag];
  navigate('transactions');
}

// ── Install prompt (Yes / Later) ──
// Listener itself is registered at the very top of this file (script-parse
// time) — see the comment there for why. This just covers the case where
// the event already fired before document.body existed.
function setupInstallPrompt() {
  if (FT_APP.installPromptEvent) maybeShowInstallPrompt();
}

function maybeShowInstallPrompt() {
  // Shows every time the app opens and the browser considers it installable
  // (browsers stop firing beforeinstallprompt on their own once actually
  // installed, so this naturally stops nagging an already-installed user —
  // no separate "dismissed forever"/cooldown suppression needed anymore).
  if (!FT_APP.installPromptEvent) return;

  const overlay = h('div', { class: 'ft-modal-overlay' }, [
    h('div', { class: 'ft-modal' }, [
      h('img', { src: ftIconBase() + 'icon-96.png', alt: '', style: 'width:48px;height:48px;border-radius:12px' }),
      h('h3', {}, 'Install FinTrack?'),
      h('p', { class: 'muted' }, 'Add FinTrack to your home screen for a faster, full-screen experience — works offline too.'),
      h('div', { class: 'ft-modal-actions' }, [
        h('button', { class: 'ft-btn ft-btn-text', onclick: () => overlay.remove() }, 'Later'),
        h('button', {
          class: 'ft-btn ft-btn-primary',
          onclick: async () => {
            overlay.remove();
            FT_APP.installPromptEvent.prompt();
            await FT_APP.installPromptEvent.userChoice;
            FT_APP.installPromptEvent = null;
          }
        }, 'Yes, install')
      ])
    ])
  ]);
  document.body.appendChild(overlay);
}

// ── Generic modal + form builder (reused by every entity section in sections.js) ──
function openModal(contentNode) {
  const overlay = h('div', { class: 'ft-modal-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } }, [contentNode]);
  document.body.appendChild(overlay);
  return overlay;
}

function closeModal(overlay) { overlay.remove(); }

// Lockout Cleanup: modal overlays are appended to document.body (see
// openModal() above), outside #app-root — so re-rendering the shell or the
// PIN unlock screen on a session timeout/re-lock does NOT close them on its
// own. Called at every lock-trigger point below.
function closeAllModals() {
  document.querySelectorAll('.ft-modal-overlay').forEach((el) => el.remove());
}

/**
 * field: { key, label, type: 'text'|'number'|'date'|'select'|'checkbox'|'textarea'|'combo'|'tagcombo', options?: [{value,label}], required? }
 * 'combo'    → fuzzy-search dropdown with a clear button (replaces <select> for Account/Category pickers).
 * 'tagcombo' → autosuggest tag input with dismissible chips below (options: array of existing tag strings via f.options).
 */
function openFormModal({ title, fields, initialValues = {}, onSubmit }) {
  const inputs = {};
  const formBody = h('div', { class: 'ft-modal ft-form' }, [
    h('h3', {}, title),
    ...fields.map((f) => {
      const value = initialValues[f.key] ?? f.default ?? '';
      let inputEl;
      if (f.type === 'select') {
        inputEl = h('select', { class: 'ft-input', id: `f-${f.key}` },
          (f.options || []).map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
      } else if (f.type === 'combo') {
        inputEl = fuzzyCombo({ options: f.options || [], value, placeholder: f.placeholder || `Search ${f.label}…`, onSelect: (v) => { if (f.onChange) f.onChange(v); } });
        inputEl.id = `f-${f.key}`;
      } else if (f.type === 'tagcombo') {
        inputEl = tagComboInput({ allTags: f.options || [], selected: Array.isArray(value) ? value : (value ? String(value).split(',').map((s) => s.trim()).filter(Boolean) : []) });
        inputEl.id = `f-${f.key}`;
      } else if (f.type === 'checkbox') {
        inputEl = h('input', { type: 'checkbox', id: `f-${f.key}`, checked: !!value });
      } else if (f.type === 'textarea') {
        inputEl = h('textarea', { class: 'ft-input', id: `f-${f.key}` }, String(value));
      } else {
        inputEl = h('input', {
          class: 'ft-input', id: `f-${f.key}`, type: f.type || 'text',
          value: f.type === 'checkbox' ? undefined : String(value), placeholder: f.placeholder || ''
        });
      }
      inputs[f.key] = inputEl;
      return h('div', { class: 'ft-field' }, [h('label', {}, f.label), inputEl]);
    }),
    h('div', { id: 'form-error', class: 'ft-error' }),
    h('div', { class: 'ft-modal-actions' }, [
      h('button', { class: 'ft-btn ft-btn-text', onclick: () => closeModal(overlay) }, 'Cancel'),
      h('button', { class: 'ft-btn ft-btn-primary', id: 'form-submit-btn' }, 'Save')
    ])
  ]);
  const overlay = openModal(formBody);

  formBody.querySelector('#form-submit-btn').addEventListener('click', async () => {
    const values = {};
    for (const f of fields) {
      const el = inputs[f.key];
      if (f.type === 'checkbox') values[f.key] = el.checked;
      else if (f.type === 'number') values[f.key] = el.value === '' ? null : Number(el.value);
      else if (f.type === 'combo') values[f.key] = el.querySelector('input').value ? (f.options.find((o) => o.label === el.querySelector('input').value)?.value ?? '') : '';
      else if (f.type === 'tagcombo') values[f.key] = el._getValue();
      else values[f.key] = el.value;
      if (f.required && (values[f.key] === '' || values[f.key] === null)) {
        formBody.querySelector('#form-error').textContent = `${f.label} is required.`;
        return;
      }
    }
    try {
      await onSubmit(values);
      closeModal(overlay);
    } catch (err) {
      formBody.querySelector('#form-error').textContent = err.message || 'Something went wrong.';
    }
  });
}

function confirmDialog(message, onConfirm) {
  const body = h('div', { class: 'ft-modal' }, [
    h('p', {}, message),
    h('div', { class: 'ft-modal-actions' }, [
      h('button', { class: 'ft-btn ft-btn-text', onclick: () => closeModal(overlay) }, 'Cancel'),
      h('button', { class: 'ft-btn ft-btn-danger', onclick: async () => { closeModal(overlay); await onConfirm(); } }, 'Delete')
    ])
  ]);
  const overlay = openModal(body);
}

// 5-second countdown before the Delete button becomes active — matches the
// Nextcloud app's account-deletion confirmation (accounts carry real financial
// history, so this one gets a longer, harder-to-fat-finger confirmation
// than the instant confirmDialog() used elsewhere).
function confirmDeleteCountdown(message, onConfirm, seconds = 5) {
  let remaining = seconds;
  const btn = h('button', { class: 'ft-btn ft-btn-danger', disabled: true }, `Delete (${remaining})`);
  btn.onclick = async () => { if (btn.disabled) return; closeModal(overlay); await onConfirm(); };
  const body = h('div', { class: 'ft-modal' }, [
    h('p', {}, message),
    h('div', { class: 'ft-modal-actions' }, [
      h('button', { class: 'ft-btn ft-btn-text', onclick: () => { clearInterval(timer); closeModal(overlay); } }, 'Cancel'),
      btn
    ])
  ]);
  const overlay = openModal(body);
  const timer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = 'Delete';
    } else {
      btn.textContent = `Delete (${remaining})`;
    }
  }, 1000);
}

// Re-lock a live, already-unlocked session if it's been hidden longer than the server-configured
// timeout — without this, the timeout only ever took effect across a full page reload.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !FT_APP.currentIdentityId || !FT_APP.currentSession) return;
  const required = await FT_PIN.isLockRequiredNow(FT_APP.currentIdentityId);
  if (required) {
    const identity = await FT_PIN.getIdentity(FT_APP.currentIdentityId);
    closeAllModals();
    FT_PIN.lock();
    FT_APP.currentSession = null;
    renderPinUnlock(identity);
  }
});

window.addEventListener('DOMContentLoaded', bootstrap);

// ── Force true fullscreen on installed launches ──
// manifest.webmanifest already declares display:"fullscreen" (with a
// standalone/minimal-ui fallback chain), but that's only a *request* —
// most browsers (Chrome for Android included) don't actually honor
// "fullscreen" for installed PWAs purely from the manifest, and silently
// fall back to "standalone" (status bar still visible), which is why the
// app never appeared truly fullscreen even though nothing was "wrong"
// with the manifest itself. The separate Fullscreen API is what actually
// hides the status/nav chrome, and it requires a user gesture — it can't
// be called on load. So: only when launched as the installed app (not a
// plain browser tab), request it on the very first tap/click.
function ftIsInstalledDisplayMode() {
  return window.matchMedia('(display-mode: fullscreen)').matches
    || window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches
    || window.navigator.standalone === true; // iOS Safari's own flag
}
function ftRequestFullscreenOnce() {
  document.removeEventListener('pointerdown', ftRequestFullscreenOnce);
  if (!ftIsInstalledDisplayMode() || document.fullscreenElement) return;
  const el = document.documentElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen;
  if (request) request.call(el).catch(() => { /* not fatal — app still usable in standalone */ });
}
if (ftIsInstalledDisplayMode()) {
  document.addEventListener('pointerdown', ftRequestFullscreenOnce);
}
