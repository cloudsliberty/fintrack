<?php
/**
 * FinTrack main template — NC32 compatible.
 *
 * NC32's TemplateResponse automatically adds a CSP nonce to <script> tags
 * rendered by \OCP\Util::addScript(). However, inline <script> blocks in
 * templates are NOT automatically nonced.
 *
 * To stay CSP-compliant without 'unsafe-inline', we output the config as
 * a JSON data attribute on a <div> and read it from fintrack-main.js,
 * which avoids the need for any inline script at all.
 *
 * @var array $_
 */
\OCP\Util::addStyle('fintrack', 'app');
// fintrack-main MUST load first so window.getState is registered before fintrack-core runs
\OCP\Util::addScript('fintrack', 'fintrack-main');
\OCP\Util::addScript('fintrack', 'fintrack-core');
?>
<?php
// Encode config as a JSON data attribute — zero inline JS, CSP-safe.
$configJson = json_encode([
	'userId'          => $_['userId'],
	'displayName'     => $_['displayName'],
	'apiToken'        => $_['apiToken'],
	'externalFormUrl' => $_['externalFormUrl'],
	'apiBase'         => $_['apiBase'],
], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES);
?>
<div id="fintrack-config" data-config="<?php echo htmlspecialchars($configJson, ENT_QUOTES, 'UTF-8'); ?>" aria-hidden="true" style="display:none"></div>

<div id="fintrack-root">
	<div id="ft-sidebar">
		<div class="ft-logo">
			<div class="ft-logo-mark">FT</div>
			<span class="ft-logo-text">FinTrack</span>
		</div>
		<nav class="ft-nav">
			<div class="ft-nav-group">
				<span class="ft-nav-label">Overview</span>
				<a href="#" class="ft-nav-item active" data-page="dashboard">
					<svg viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
					<span>Dashboard</span>
				</a>
				<a href="#" class="ft-nav-item" data-page="reports">
					<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/></svg>
					<span>Reports</span>
				</a>
			</div>
			<div class="ft-nav-group">
				<span class="ft-nav-label">Accounts</span>
				<a href="#" class="ft-nav-item" data-page="asset-accounts">
					<svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>
					<span>Asset Accounts</span>
				</a>
				<a href="#" class="ft-nav-item" data-page="expense-accounts">
					<svg viewBox="0 0 24 24"><path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>
					<span>Expense Accounts</span>
				</a>
				<a href="#" class="ft-nav-item" data-page="revenue-accounts">
					<svg viewBox="0 0 24 24"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>
					<span>Revenue Accounts</span>
				</a>
				<a href="#" class="ft-nav-item" data-page="liability-accounts">
					<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
					<span>Liability Accounts</span>
				</a>
			</div>
			<div class="ft-nav-group">
				<span class="ft-nav-label">Transactions</span>
				<a href="#" class="ft-nav-item" data-page="transactions">
					<svg viewBox="0 0 24 24"><path d="M7 16l-4-4 4-4v3h8.25C16.24 11 18 12.76 18 14.75S16.24 18.5 14.25 18.5H10v-2h4.25c.96 0 1.75-.79 1.75-1.75S15.21 13 14.25 13H7v3z"/></svg>
					<span>All Transactions</span>
				</a>
				<a href="#" class="ft-nav-item" data-page="transfers">
					<svg viewBox="0 0 24 24"><path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg>
					<span>Transfers</span>
				</a>
				<a href="#" class="ft-nav-item" data-page="recurring">
					<svg viewBox="0 0 24 24"><path d="M12 6v3l4 4-4 4v3c-3.31 0-6-2.69-6-6s2.69-6 6-6m0-2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>
					<span>Recurring</span>
				</a>
			</div>
			<div class="ft-nav-group">
				<span class="ft-nav-label">Planning</span>
				<a href="#" class="ft-nav-item" data-page="budgets">
					<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/></svg>
					<span>Budgets</span>
				</a>
				<a href="#" class="ft-nav-item" data-page="categories">
					<svg viewBox="0 0 24 24"><path d="M12 2l-5.5 9h11z"/><circle cx="17.5" cy="17.5" r="4.5"/><path d="M3 13.5h8v8H3z"/></svg>
					<span>Categories &amp; Tags</span>
				</a>
			</div>
			<div class="ft-nav-group">
				<span class="ft-nav-label">System</span>
				<a href="#" class="ft-nav-item" data-page="currencies">
					<svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>
					<span>Currencies</span>
				</a>
				<a href="#" class="ft-nav-item" data-page="external-api">
					<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
					<span>External API</span>
				</a>
				<a href="#" class="ft-nav-item" data-page="settings">
					<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
					<span>Settings</span>
				</a>
			</div>
		</nav>
	</div>

	<div id="ft-main">
		<div id="page-dashboard"          class="ft-page active"></div>
		<div id="page-reports"            class="ft-page"></div>
		<div id="page-asset-accounts"     class="ft-page"></div>
		<div id="page-expense-accounts"   class="ft-page"></div>
		<div id="page-revenue-accounts"   class="ft-page"></div>
		<div id="page-liability-accounts" class="ft-page"></div>
		<div id="page-transactions"       class="ft-page"></div>
		<div id="page-transfers"          class="ft-page"></div>
		<div id="page-recurring"          class="ft-page"></div>
		<div id="page-budgets"            class="ft-page"></div>
		<div id="page-categories"         class="ft-page"></div>
		<div id="page-currencies"         class="ft-page"></div>
		<div id="page-external-api"       class="ft-page"></div>
		<div id="page-settings"           class="ft-page"></div>
	</div>

	<div id="ft-modal-overlay" class="ft-hidden">
		<div id="ft-modal">
			<div id="ft-modal-header">
				<h3 id="ft-modal-title"></h3>
				<button id="ft-modal-close" type="button">×</button>
			</div>
			<div id="ft-modal-body"></div>
		</div>
	</div>

	<div id="ft-toast-container"></div>
</div>
