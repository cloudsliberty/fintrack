// FinTrack PWA — api.js
//
// Talks to the same Nextcloud FinTrack REST API the Android app uses: Login Flow v2 for
// authentication (server URL -> browser login -> polled app password), then HTTP Basic Auth
// (login name + app password) on every subsequent request — see the "Internal REST API" and
// "Public/External API" sections of the FinTrack manual.
//
// CORS: Nextcloud's core Login Flow v2 endpoints (/index.php/login/v2) can't carry CORS headers
// (that's core code, not the FinTrack app's — the app can't add headers to a route it doesn't
// own). To make Login Flow v2 reachable from a browser-hosted PWA at all, this client calls it
// through a small proxy under FinTrack's OWN routes instead — see LoginProxyController in the
// Nextcloud app (lib/Controller/LoginProxyController.php) — which relays the two calls
// server-side (no browser involved server-to-server, so no CORS applies there) and adds
// #[CORS] on its own route, which the app CAN do. The rest of the API (api/..., external/...)
// still needs #[CORS] added directly on FinTrack's existing controllers — see README.md.

const FT_API = (() => {
  function normalizeServer(url) {
    return url.replace(/\/+$/, '');
  }

  async function initLoginFlow(serverUrl) {
    const res = await fetch(`${normalizeServer(serverUrl)}/index.php/apps/fintrack/login-proxy/init`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'OCS-APIREQUEST': 'true' }
    });
    if (!res.ok) throw new Error(`Could not start login (HTTP ${res.status}). Check the server address, and that LoginProxyController is installed — see README.md.`);
    return res.json(); // { poll: { token, endpoint }, login: "https://.../login/v2/flow/..." }
  }

  /** Polls once, through the same server-side proxy. Returns null while pending, or credentials once the person has finished logging in. */
  async function pollLogin(pollEndpoint, pollToken, serverUrl) {
    const res = await fetch(`${normalizeServer(serverUrl)}/index.php/apps/fintrack/login-proxy/poll`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'OCS-APIREQUEST': 'true' },
      body: `endpoint=${encodeURIComponent(pollEndpoint)}&token=${encodeURIComponent(pollToken)}`
    });
    if (res.status === 202) return null; // not completed yet
    if (!res.ok) throw new Error(`Login poll failed (HTTP ${res.status}).`);
    const data = await res.json(); // { server, loginName, appPassword }
    return { serverUrl: normalizeServer(data.server), loginName: data.loginName, appPassword: data.appPassword };
  }

  function authHeader(session) {
    const creds = btoa(unescape(encodeURIComponent(`${session.loginName}:${session.appPassword}`)));
    return { Authorization: `Basic ${creds}`, 'OCS-APIREQUEST': 'true' };
  }

  async function request(session, method, path, body) {
    const url = `${normalizeServer(session.serverUrl)}/index.php/apps/fintrack/${path}`;
    const res = await fetch(url, {
      method,
      mode: 'cors',
      headers: { ...authHeader(session), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      let errorBody = null;
      try {
        errorBody = await res.json();
        if (errorBody && errorBody.error) message = errorBody.error;
      } catch (_) { /* body wasn't JSON */ }
      const err = new Error(message);
      err.status = res.status;
      err.body = errorBody;
      throw err;
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function qs(params) {
    const usp = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') usp.set(k, v);
    });
    const s = usp.toString();
    return s ? `?${s}` : '';
  }

  return {
    initLoginFlow, pollLogin,

    // ── Accounts ──
    getAccounts: (s) => request(s, 'GET', 'api/accounts'),
    createAccount: (s, body) => request(s, 'POST', 'api/accounts', body),
    updateAccount: (s, id, body) => request(s, 'PUT', `api/accounts/${id}`, body),
    deleteAccount: (s, id) => request(s, 'DELETE', `api/accounts/${id}`),

    // ── Transactions ──
    getTransactions: (s, filters) => request(s, 'GET', `api/transactions${qs(filters)}`),
    // Pages through every transaction (1000 per request) for totals that must not be truncated.
    getAllTransactions: async (s, filters) => {
      const PAGE = 1000;
      const all = [];
      for (let offset = 0; ; offset += PAGE) {
        const page = (await request(s, 'GET', `api/transactions${qs({ ...(filters || {}), limit: PAGE, offset })}`)) || [];
        all.push(...page);
        if (page.length < PAGE) break;
      }
      return all;
    },
    createTransaction: (s, body) => request(s, 'POST', 'api/transactions', body),
    importTransactions: (s, body) => request(s, 'POST', 'api/transactions/import', body),
    updateTransaction: (s, id, body) => request(s, 'PUT', `api/transactions/${id}`, body),
    deleteTransaction: (s, id) => request(s, 'DELETE', `api/transactions/${id}`),

    // ── Transfers ──
    getTransfers: (s) => request(s, 'GET', 'api/transfers'),
    createTransfer: (s, body) => request(s, 'POST', 'api/transfers', body),
    deleteTransfer: (s, id) => request(s, 'DELETE', `api/transfers/${id}`),

    // ── Budgets ──
    getBudgets: (s) => request(s, 'GET', 'api/budgets'),
    createBudget: (s, body) => request(s, 'POST', 'api/budgets', body),
    updateBudget: (s, id, body) => request(s, 'PUT', `api/budgets/${id}`, body),
    deleteBudget: (s, id) => request(s, 'DELETE', `api/budgets/${id}`),

    // ── Categories ──
    getCategories: (s) => request(s, 'GET', 'api/categories'),
    createCategory: (s, body) => request(s, 'POST', 'api/categories', body),
    updateCategory: (s, id, body) => request(s, 'PUT', `api/categories/${id}`, body),
    deleteCategory: (s, id) => request(s, 'DELETE', `api/categories/${id}`),

    // ── Currencies ──
    getCurrencies: (s) => request(s, 'GET', 'api/currencies'),
    createCurrency: (s, body) => request(s, 'POST', 'api/currencies', body),
    updateCurrency: (s, id, body) => request(s, 'PUT', `api/currencies/${id}`, body),
    deleteCurrency: (s, id) => request(s, 'DELETE', `api/currencies/${id}`),
    getExchangeRate: (s, from, to) => request(s, 'GET', `api/exchange-rate${qs({ from, to })}`),
    registerPwaSession: (s, uid, label) => request(s, 'POST', 'api/pwa-sessions/register', { uid, label }),
    getPwaSessionStatus: (s, uid) => request(s, 'GET', `api/pwa-sessions/status${qs({ uid })}`),

    // ── Recurring ──
    getRecurring: (s) => request(s, 'GET', 'api/recurring'),
    createRecurring: (s, body) => request(s, 'POST', 'api/recurring', body),
    updateRecurring: (s, id, body) => request(s, 'PUT', `api/recurring/${id}`, body),
    deleteRecurring: (s, id) => request(s, 'DELETE', `api/recurring/${id}`),
    postRecurring: (s, id) => request(s, 'POST', `api/recurring/${id}/post`),

    // ── Summary / settings / tags / token ──
    getSummary: (s) => request(s, 'GET', 'api/summary'),
    getSettings: (s) => request(s, 'GET', 'api/settings'),
    saveSettings: (s, body) => request(s, 'POST', 'api/settings', body),
    getTags: (s) => request(s, 'GET', 'api/tags'),
    saveTags: (s, tags) => request(s, 'POST', 'api/tags', { tags }),
    renameTag: (s, oldName, newName) => request(s, 'POST', 'api/tags/rename', { oldName, newName }),
    deleteTag: (s, tag) => request(s, 'POST', 'api/tags/delete', { tag }),
    getToken: (s) => request(s, 'GET', 'api/token'),
    regenerateToken: (s) => request(s, 'POST', 'api/token/regenerate'),

    // ── Pin Lock (the same "Settings → Pin Lock" the main Nextcloud app uses — this PWA defers to it entirely rather than keeping a separate lock) ──
    getLockStatus: (s) => request(s, 'GET', 'api/lock/status'),
    setupLock: (s, body) => request(s, 'POST', 'api/lock/setup', body),
    disableLock: (s, body) => request(s, 'POST', 'api/lock/disable', body),
    verifyLock: (s, password) => request(s, 'POST', 'api/lock/verify', { password }),
    getLockResetQuestion: (s) => request(s, 'GET', 'api/lock/reset-question'),
    verifyLockResetAnswer: (s, answer) => request(s, 'POST', 'api/lock/reset-verify', { answer }),
    requestAdminLockReset: (s) => request(s, 'POST', 'api/lock/request-admin-reset'),

    // ── External / token-authenticated API (for the External API settings page) ──
    externalGetAccounts: (s, token) => request(s, 'GET', `external/accounts?token=${encodeURIComponent(token)}`),
    externalGetCategories: (s, token) => request(s, 'GET', `external/categories?token=${encodeURIComponent(token)}`),
    externalCreateCategory: (s, token, body) => request(s, 'POST', `external/categories?token=${encodeURIComponent(token)}`, body),
    externalSubmit: (s, token, body) => request(s, 'POST', `external/submit?token=${encodeURIComponent(token)}`, body),
    quickAddUrl: (serverUrl, token, params) =>
      `${normalizeServer(serverUrl)}/index.php/apps/fintrack/external/quick-add${qs({ key: token, ...params })}`
  };
})();
