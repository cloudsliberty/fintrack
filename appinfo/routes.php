<?php

declare(strict_types=1);

// Route "name" is 'controller#method'; the controller key maps to
// <Key>Controller in lib/Controller (Nextcloud's standard convention).
// This app used to have one giant 'api#...' controller for every resource —
// it's now split one-controller-per-resource, mirroring how routes are
// grouped below.
return [
	'routes' => [
		// ── Main page ──
		['name' => 'page#index',                    'url' => '/',                                  'verb' => 'GET'],
		// ── External entry point — now the FinTrack PWA (full Login Flow v2
		// auth), replacing the old anonymous token-link quick-entry form ──
		['name' => 'page#externalForm',              'url' => '/pwa',                            'verb' => 'GET'],
		['name' => 'page#externalManifest',          'url' => '/pwa/manifest.webmanifest',        'verb' => 'GET'],
		['name' => 'page#externalServiceWorker',     'url' => '/pwa/sw.js',                       'verb' => 'GET'],

		// ── Accounts ──
		['name' => 'accounts#index',   'url' => '/api/accounts',      'verb' => 'GET'],
		['name' => 'accounts#create',  'url' => '/api/accounts',      'verb' => 'POST'],
		['name' => 'accounts#update',  'url' => '/api/accounts/{id}', 'verb' => 'PUT'],
		['name' => 'accounts#destroy', 'url' => '/api/accounts/{id}', 'verb' => 'DELETE'],

		// ── Transactions ──
		['name' => 'transactions#index',   'url' => '/api/transactions',        'verb' => 'GET'],
		['name' => 'transactions#create',  'url' => '/api/transactions',        'verb' => 'POST'],
		['name' => 'transactions#import',  'url' => '/api/transactions/import', 'verb' => 'POST'],
		['name' => 'transactions#update',  'url' => '/api/transactions/{id}',   'verb' => 'PUT'],
		['name' => 'transactions#destroy', 'url' => '/api/transactions/{id}',   'verb' => 'DELETE'],

		// ── Transactions recycle bin (Settings → Data Management → Recently Deleted) ──
		['name' => 'transactions#trash',             'url' => '/api/transactions/trash',            'verb' => 'GET'],
		['name' => 'transactions#restoreFromTrash',  'url' => '/api/transactions/trash/{id}/restore', 'verb' => 'POST'],
		['name' => 'transactions#destroyFromTrash',  'url' => '/api/transactions/trash/{id}',       'verb' => 'DELETE'],
		['name' => 'transactions#emptyTrash',        'url' => '/api/transactions/trash/empty',      'verb' => 'POST'],

		// ── Transfers ──
		['name' => 'transfers#index',   'url' => '/api/transfers',      'verb' => 'GET'],
		['name' => 'transfers#create',  'url' => '/api/transfers',      'verb' => 'POST'],
		['name' => 'transfers#destroy', 'url' => '/api/transfers/{id}', 'verb' => 'DELETE'],

		// ── Budgets ──
		['name' => 'budgets#index',   'url' => '/api/budgets',      'verb' => 'GET'],
		['name' => 'budgets#create',  'url' => '/api/budgets',      'verb' => 'POST'],
		['name' => 'budgets#update',  'url' => '/api/budgets/{id}', 'verb' => 'PUT'],
		['name' => 'budgets#destroy', 'url' => '/api/budgets/{id}', 'verb' => 'DELETE'],

		// ── Categories ──
		['name' => 'categories#index',          'url' => '/api/categories',                 'verb' => 'GET'],
		['name' => 'categories#create',         'url' => '/api/categories',                 'verb' => 'POST'],
		['name' => 'categories#update',         'url' => '/api/categories/{id}',            'verb' => 'PUT'],
		['name' => 'categories#destroy',        'url' => '/api/categories/{id}',            'verb' => 'DELETE'],
		['name' => 'categories#export',         'url' => '/api/categories/export',          'verb' => 'GET'],
		['name' => 'categories#import',         'url' => '/api/categories/import',          'verb' => 'POST'],
		['name' => 'categories#createDefaults', 'url' => '/api/categories/create-defaults', 'verb' => 'POST'],

		// ── Currencies ──
		['name' => 'currencies#index',        'url' => '/api/currencies',      'verb' => 'GET'],
		['name' => 'currencies#create',       'url' => '/api/currencies',      'verb' => 'POST'],
		['name' => 'currencies#update',       'url' => '/api/currencies/{id}', 'verb' => 'PUT'],
		['name' => 'currencies#destroy',      'url' => '/api/currencies/{id}', 'verb' => 'DELETE'],
		['name' => 'currencies#exchangeRate', 'url' => '/api/exchange-rate',   'verb' => 'GET'],

		// PWA session UID / remote-wipe system (see PwaSessionsController).
		['name' => 'pwaSessions#index',    'url' => '/api/pwa-sessions',          'verb' => 'GET'],
		['name' => 'pwaSessions#destroy',  'url' => '/api/pwa-sessions/{uid}',    'verb' => 'DELETE'],
		['name' => 'pwaSessions#register', 'url' => '/api/pwa-sessions/register', 'verb' => 'POST'],
		['name' => 'pwaSessions#status',   'url' => '/api/pwa-sessions/status',   'verb' => 'GET'],
		['name' => 'currencies#testExchangeRateApiKey', 'url' => '/api/exchange-rate/test', 'verb' => 'POST'],

		// ── Recurring ──
		['name' => 'recurring#index',   'url' => '/api/recurring',           'verb' => 'GET'],
		['name' => 'recurring#create',  'url' => '/api/recurring',           'verb' => 'POST'],
		['name' => 'recurring#update',  'url' => '/api/recurring/{id}',      'verb' => 'PUT'],
		['name' => 'recurring#destroy', 'url' => '/api/recurring/{id}',      'verb' => 'DELETE'],
		['name' => 'recurring#post',    'url' => '/api/recurring/{id}/post', 'verb' => 'POST'],

		// ── Settings / tags / token / summary / reset ──
		['name' => 'settings#summary',         'url' => '/api/summary',          'verb' => 'GET'],
		['name' => 'settings#index',           'url' => '/api/settings',         'verb' => 'GET'],
		['name' => 'settings#save',            'url' => '/api/settings',         'verb' => 'POST'],
		['name' => 'settings#tags',            'url' => '/api/tags',             'verb' => 'GET'],
		['name' => 'settings#saveTags',        'url' => '/api/tags',             'verb' => 'POST'],
		['name' => 'settings#renameTag',       'url' => '/api/tags/rename',      'verb' => 'POST'],
		['name' => 'settings#deleteTag',       'url' => '/api/tags/delete',      'verb' => 'POST'],
		['name' => 'settings#getToken',        'url' => '/api/token',            'verb' => 'GET'],
		['name' => 'settings#regenerateToken', 'url' => '/api/token/regenerate', 'verb' => 'POST'],
		['name' => 'settings#reset',           'url' => '/api/reset',            'verb' => 'POST'],
		['name' => 'settings#restore',         'url' => '/api/settings/restore', 'verb' => 'POST'],
		['name' => 'settings#backup',          'url' => '/api/settings/backup',  'verb' => 'GET'],

		// ── Auto-categorization rules (CSV import) ──
		['name' => 'settings#categoryRules',     'url' => '/api/category-rules', 'verb' => 'GET'],
		['name' => 'settings#saveCategoryRules', 'url' => '/api/category-rules', 'verb' => 'POST'],

		// ── App Lock (PIN on top of Nextcloud auth) ──
		['name' => 'lock#status',  'url' => '/api/lock/status',  'verb' => 'GET'],
		['name' => 'lock#setup',   'url' => '/api/lock/setup',   'verb' => 'POST'],
		['name' => 'lock#disable', 'url' => '/api/lock/disable', 'verb' => 'POST'],
		['name' => 'lock#verify',  'url' => '/api/lock/verify',  'verb' => 'POST'],
		['name' => 'lock#resetQuestion',     'url' => '/api/lock/reset-question',     'verb' => 'GET'],
		['name' => 'lock#resetVerify',       'url' => '/api/lock/reset-verify',       'verb' => 'POST'],
		['name' => 'lock#requestAdminReset', 'url' => '/api/lock/request-admin-reset', 'verb' => 'POST'],

		// ── Admin Settings → FinTrack → Reset PIN queue (admin-only) ──
		['name' => 'adminLock#approve', 'url' => '/admin/lock-reset/{id}/approve', 'verb' => 'POST'],

		// ── External (public) API — token-authenticated, no NC session needed ──
		// These public routes expose accounts/categories for the external form,
		// authenticated by the FinTrack API token header (X-FinTrack-Token).
		['name' => 'external#submit',          'url' => '/external/submit',          'verb' => 'POST'],
		['name' => 'external#quickAdd',        'url' => '/external/quick-add',       'verb' => 'GET'],
		['name' => 'external#getAccounts',     'url' => '/external/accounts',        'verb' => 'GET'],
		['name' => 'external#getCategories',   'url' => '/external/categories',      'verb' => 'GET'],
		['name' => 'external#createCategory',  'url' => '/external/categories',      'verb' => 'POST'],
		['name' => 'external#getTags',         'url' => '/external/tags',            'verb' => 'GET'],
		['name' => 'external#lockStatus',      'url' => '/external/lock-status',     'verb' => 'GET'],
		['name' => 'external#lockVerify',      'url' => '/external/lock-verify',     'verb' => 'POST'],

		// ── Login proxy (public, CORS) — relays NC core's Login Flow v2 for
		// the FinTrack PWA served at /pwa. See LoginProxyController. ──
		['name' => 'loginProxy#init', 'url' => '/login-proxy/init', 'verb' => 'POST'],
		['name' => 'loginProxy#poll', 'url' => '/login-proxy/poll', 'verb' => 'POST'],
	],
];
