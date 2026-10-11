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
	'userId'           => $_['userId'],
	'displayName'      => $_['displayName'],
	'userEmail'        => $_['userEmail'],
	'apiToken'         => $_['apiToken'],
	'externalFormUrl'  => $_['externalFormUrl'],
	'apiBase'          => $_['apiBase'],
	'nextcloudVersion' => $_['nextcloudVersion'],
	'fintrackVersion'  => $_['fintrackVersion'],
	'instanceId'       => $_['instanceId'],
], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES);
?>
<div id="fintrack-config" data-config="<?php echo htmlspecialchars($configJson, ENT_QUOTES, 'UTF-8'); ?>" aria-hidden="true" style="display:none"></div>

<div id="fintrack-root">
	<!--
	  App Lock overlay — an optional PIN layer on top of Nextcloud's own auth
	  (see LockService). Hidden by default; fintrack-main.js shows it before
	  the first render if a PIN is configured for this user, and again after
	  the configured inactivity timeout. It sits above everything else in
	  #fintrack-root via z-index and blocks interaction while shown.
	-->
	<div id="ft-lock-overlay" class="ft-hidden">
		<div id="ft-lock-box">
			<div class="ft-lock-icon">
				<svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
			</div>
			<div id="ft-lock-title">FinTrack is locked</div>
			<div id="ft-lock-sub">Enter your PIN to continue</div>
			<input type="password" id="ft-lock-input" inputmode="numeric" autocomplete="off" placeholder="PIN">
			<div id="ft-lock-error"></div>
			<button type="button" id="ft-lock-submit" class="btn btn-primary">Unlock</button>
			<a href="#" id="ft-lock-forgot" style="display:block;margin-top:12px;font-size:12.5px">Forgot PIN?</a>
			<a href="#" id="ft-lock-admin-request" style="display:block;margin-top:8px;font-size:12.5px">Request Admin Approval to Reset PIN</a>

			<!-- Forgot-PIN flow: hidden until "Forgot PIN?" is clicked, and only
			     ever shown at all if the account has a reset question configured
			     (see ftLockForgotClick in fintrack-main.js). -->
			<div id="ft-lock-reset-box" class="ft-hidden" style="margin-top:14px;text-align:left">
				<div id="ft-lock-reset-question" style="font-size:13px;margin-bottom:8px"></div>
				<input type="text" id="ft-lock-reset-answer-input" autocomplete="off" placeholder="Your answer">
				<div id="ft-lock-reset-error"></div>
				<button type="button" id="ft-lock-reset-submit" class="btn btn-secondary" style="margin-top:8px">Reset PIN</button>
				<a href="#" id="ft-lock-reset-cancel" style="display:block;margin-top:8px;font-size:12.5px">Back to PIN entry</a>
			</div>
		</div>
	</div>

	<div id="ft-sidebar">
		<div class="ft-logo">
			<div class="ft-logo-mark" aria-hidden="true">FT</div>
			<span class="ft-logo-text">FinTrack</span>
			<button type="button" id="ft-sidebar-toggle" title="Collapse sidebar" aria-label="Collapse sidebar">
				<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
			</button>
		</div>
		<nav class="ft-nav">
			<div class="ft-nav-group ft-nav-group-expand">
				<button type="button" id="ft-sidebar-expand" class="ft-nav-item" title="Expand sidebar" aria-label="Expand sidebar">
					<svg viewBox="0 0 24 24"><path d="M5.59 7.41L10.17 12l-4.58 4.59L7 18l6-6-6-6zM12 6l-1.41 1.41L16.17 12l-4.58 4.59L12 18l6-6z"/></svg>
					<span>Expand sidebar</span>
				</button>
			</div>
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
					<svg viewBox="0 0 24 24"><path d="M4 10h3v7H4zm6.5 0h3v7h-3zM2 19h20v3H2zm15-9h3v7h-3zM12 1L2 6v2h20V6z"/></svg>
					<span>Asset Accounts</span>
				</a>
				<a href="#" class="ft-nav-item" data-page="expense-accounts">
					<svg viewBox="0 0 24 24"><path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>
					<span>Expense Accounts</span>
				</a>
				<a href="#" class="ft-nav-item" data-page="revenue-accounts">
					<svg viewBox="0 0 24 24"><ellipse cx="12" cy="17" rx="9" ry="3"/><ellipse cx="12" cy="12" rx="9" ry="3"/><ellipse cx="12" cy="7" rx="9" ry="3"/></svg>
					<span>Revenue Accounts</span>
				</a>
				<a href="#" class="ft-nav-item" data-page="liability-accounts">
					<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/></svg>
					<span>Liability Accounts</span>
				</a>
			</div>
			<div class="ft-nav-group">
				<span class="ft-nav-label">Transactions</span>
				<a href="#" class="ft-nav-item" data-page="transactions">
					<svg viewBox="0 0 24 24"><rect x="3" y="4" width="4" height="4"/><rect x="9" y="4.5" width="12" height="3"/><rect x="3" y="10" width="4" height="4"/><rect x="9" y="10.5" width="12" height="3"/><rect x="3" y="16" width="4" height="4"/><rect x="9" y="16.5" width="12" height="3"/></svg>
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
					<svg viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M3 6h18v12H3V6zm2 2v8h14V8H5z"/><text x="12" y="14.6" text-anchor="middle" font-size="7.5" font-weight="700" font-family="Arial, Helvetica, sans-serif">$</text></svg>
					<span>Currencies</span>
				</a>
			</div>
			<div class="ft-nav-group ft-nav-group-settings">
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
