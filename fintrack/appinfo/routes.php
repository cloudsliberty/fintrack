<?php

declare(strict_types=1);

return [
	'routes' => [
		// ── Main page ──
		['name' => 'page#index',        'url' => '/',              'verb' => 'GET'],
		['name' => 'page#externalForm', 'url' => '/entry/{token}', 'verb' => 'GET'],

		// ── Transaction API ──
		['name' => 'api#getTransactions',   'url' => '/api/transactions',      'verb' => 'GET'],
		['name' => 'api#createTransaction', 'url' => '/api/transactions',      'verb' => 'POST'],
		['name' => 'api#importTransactions','url' => '/api/transactions/import', 'verb' => 'POST'],
		['name' => 'api#updateTransaction', 'url' => '/api/transactions/{id}', 'verb' => 'PUT'],
		['name' => 'api#deleteTransaction', 'url' => '/api/transactions/{id}', 'verb' => 'DELETE'],

		// ── Account API ──
		['name' => 'api#getAccounts',   'url' => '/api/accounts',      'verb' => 'GET'],
		['name' => 'api#createAccount', 'url' => '/api/accounts',      'verb' => 'POST'],
		['name' => 'api#updateAccount', 'url' => '/api/accounts/{id}', 'verb' => 'PUT'],
		['name' => 'api#deleteAccount', 'url' => '/api/accounts/{id}', 'verb' => 'DELETE'],

		// ── Transfer API ──
		['name' => 'api#getTransfers',   'url' => '/api/transfers',      'verb' => 'GET'],
		['name' => 'api#createTransfer', 'url' => '/api/transfers',      'verb' => 'POST'],
		['name' => 'api#deleteTransfer', 'url' => '/api/transfers/{id}', 'verb' => 'DELETE'],

		// ── Budget API ──
		['name' => 'api#getBudgets',   'url' => '/api/budgets',      'verb' => 'GET'],
		['name' => 'api#createBudget', 'url' => '/api/budgets',      'verb' => 'POST'],
		['name' => 'api#updateBudget', 'url' => '/api/budgets/{id}', 'verb' => 'PUT'],
		['name' => 'api#deleteBudget', 'url' => '/api/budgets/{id}', 'verb' => 'DELETE'],

		// ── Category API ──
		['name' => 'api#getCategories',  'url' => '/api/categories',      'verb' => 'GET'],
		['name' => 'api#createCategory', 'url' => '/api/categories',      'verb' => 'POST'],
		['name' => 'api#updateCategory', 'url' => '/api/categories/{id}', 'verb' => 'PUT'],
		['name' => 'api#deleteCategory', 'url' => '/api/categories/{id}', 'verb' => 'DELETE'],

		// ── Currency API ──
		['name' => 'api#getCurrencies',  'url' => '/api/currencies',      'verb' => 'GET'],
		['name' => 'api#createCurrency', 'url' => '/api/currencies',      'verb' => 'POST'],
		['name' => 'api#updateCurrency', 'url' => '/api/currencies/{id}', 'verb' => 'PUT'],
		['name' => 'api#deleteCurrency', 'url' => '/api/currencies/{id}', 'verb' => 'DELETE'],

		// ── Recurring API ──
		['name' => 'api#getRecurring',    'url' => '/api/recurring',            'verb' => 'GET'],
		['name' => 'api#createRecurring', 'url' => '/api/recurring',            'verb' => 'POST'],
		['name' => 'api#updateRecurring', 'url' => '/api/recurring/{id}',       'verb' => 'PUT'],
		['name' => 'api#deleteRecurring', 'url' => '/api/recurring/{id}',       'verb' => 'DELETE'],
		['name' => 'api#postRecurring',   'url' => '/api/recurring/{id}/post',  'verb' => 'POST'],

		// ── Summary / reports ──
		['name' => 'api#getSummary',      'url' => '/api/summary',             'verb' => 'GET'],
		['name' => 'api#getSettings',     'url' => '/api/settings',            'verb' => 'GET'],
		['name' => 'api#saveSettings',    'url' => '/api/settings',            'verb' => 'POST'],
		['name' => 'api#getTags',         'url' => '/api/tags',                'verb' => 'GET'],
		['name' => 'api#saveTags',        'url' => '/api/tags',                'verb' => 'POST'],
		['name' => 'api#getApiToken',     'url' => '/api/token',               'verb' => 'GET'],
		['name' => 'api#regenerateToken', 'url' => '/api/token/regenerate',    'verb' => 'POST'],

		// ── External (public) API — token-authenticated, no NC session needed ──
		// These public routes expose accounts/categories for the external form,
		// authenticated by the FinTrack API token header (X-FinTrack-Token).
		['name' => 'external#submit',          'url' => '/external/submit',          'verb' => 'POST'],
		['name' => 'external#quickAdd',        'url' => '/external/quick-add',       'verb' => 'GET'],
		['name' => 'external#getAccounts',     'url' => '/external/accounts',        'verb' => 'GET'],
		['name' => 'external#getCategories',   'url' => '/external/categories',      'verb' => 'GET'],
		['name' => 'external#createCategory',  'url' => '/external/categories',      'verb' => 'POST'],
	],
];
