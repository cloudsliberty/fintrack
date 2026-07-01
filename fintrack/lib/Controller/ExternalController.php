<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\AppInfo\Application;
use OCA\FinTrack\Service\AccountService;
use OCA\FinTrack\Service\CategoryService;
use OCA\FinTrack\Service\SettingsService;
use OCA\FinTrack\Service\TransactionService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\DataResponse;
use OCP\IDBConnection;
use OCP\IRequest;

/**
 * ExternalController — all routes are public (no NC session), authenticated
 * exclusively by the FinTrack API token (X-FinTrack-Token header or 'token' body param).
 *
 * CSRF:   #[NoCSRFRequired] is correct on all methods here because these endpoints
 *         are by definition reached without a Nextcloud session, so no NC CSRF token
 *         is available. Token-based authentication is the security mechanism instead.
 *
 * PublicPage: required to bypass NC's authentication middleware.
 */
class ExternalController extends Controller {

	public function __construct(
		IRequest                   $request,
		private IDBConnection      $db,
		private SettingsService    $settingsService,
		private TransactionService $transactionService,
		private AccountService     $accountService,
		private CategoryService    $categoryService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * Resolve a FinTrack API token to a userId.
	 * Looks up the token in fintrack_settings.
	 */
	private function resolveToken(string $token): ?string {
		if (empty($token)) {
			return null;
		}
		$qb = $this->db->getQueryBuilder();
		$qb->select('user_id')
		   ->from('fintrack_settings')
		   ->where($qb->expr()->eq('key',   $qb->createNamedParameter('api_token')))
		   ->andWhere($qb->expr()->eq('value', $qb->createNamedParameter($token)));
		$result = $qb->executeQuery();
		$row    = $result->fetch();
		$result->closeCursor();
		return $row ? (string)$row['user_id'] : null;
	}

	/**
	 * Extract the API token from the request.
	 * Accepts either the X-FinTrack-Token header or a 'token' body/query parameter.
	 */
	private function extractToken(): string {
		$headerToken = $this->request->getHeader('X-FinTrack-Token');
		if (!empty($headerToken)) {
			return trim($headerToken);
		}
		return (string)($this->request->getParam('token', ''));
	}

	/**
	 * GET /external/accounts
	 * Returns account list for the token owner — used by the external form to
	 * populate the account dropdown without requiring a Nextcloud session.
	 */
	#[PublicPage]
	#[NoCSRFRequired]
	public function getAccounts(): DataResponse {
		$uid = $this->resolveToken($this->extractToken());
		if ($uid === null) {
			return new DataResponse(['error' => 'Invalid or missing API token'], 401);
		}
		// Return only active accounts with minimal fields (no sensitive data)
		$accounts = array_values(array_filter(
			$this->accountService->findAll($uid),
			fn ($a) => $a['active'] === true || $a['active'] === 1
		));
		return new DataResponse($accounts);
	}

	/**
	 * GET /external/categories
	 * Returns category list for the token owner.
	 */
	#[PublicPage]
	#[NoCSRFRequired]
	public function getCategories(): DataResponse {
		$uid = $this->resolveToken($this->extractToken());
		if ($uid === null) {
			return new DataResponse(['error' => 'Invalid or missing API token'], 401);
		}
		return new DataResponse($this->categoryService->findAll($uid));
	}

	/**
	 * POST /external/categories
	 * Quick-add a category from the external entry form, so a category can be
	 * created on the fly without leaving the transaction-entry screen.
	 * Body params: token, name, type, icon, color
	 */
	#[PublicPage]
	#[NoCSRFRequired]
	public function createCategory(): DataResponse {
		$uid = $this->resolveToken($this->extractToken());
		if ($uid === null) {
			return new DataResponse(['error' => 'Invalid or missing API token'], 401);
		}

		$contentType = $this->request->getHeader('Content-Type');
		if (str_contains((string)$contentType, 'application/json')) {
			$raw    = file_get_contents('php://input');
			$parsed = ($raw !== false && $raw !== '') ? json_decode($raw, true) : [];
			$get    = fn (string $key, mixed $default = '') => $parsed[$key] ?? $default;
		} else {
			$get = fn (string $key, mixed $default = '') => $this->request->getParam($key, $default);
		}

		$name = trim((string)$get('name', ''));
		if ($name === '') {
			return new DataResponse(['error' => 'Category name is required'], 400);
		}

		$type = (string)$get('type', 'expense');
		if (!in_array($type, ['income', 'expense', 'transfer'], true)) {
			$type = 'expense';
		}

		try {
			$category = $this->categoryService->create($uid, [
				'name'  => $name,
				'type'  => $type,
				'icon'  => (string)$get('icon', ''),
				'color' => (string)$get('color', '#4f8ef7'),
			]);
			return new DataResponse($category);
		} catch (\Exception $e) {
			return new DataResponse(['error' => $e->getMessage()], 400);
		}
	}

	/**
	 * POST /external/submit
	 * Submit a transaction via the external form or API.
	 * Body params: token, type, accountId, amount, description, category, tags, date, notes
	 */
	#[PublicPage]
	#[NoCSRFRequired]
	public function submit(): DataResponse {
		$uid = $this->resolveToken($this->extractToken());
		if ($uid === null) {
			return new DataResponse(['error' => 'Invalid or missing API token'], 401);
		}

		// Support JSON body (fetch with Content-Type: application/json) and form posts
		$contentType = $this->request->getHeader('Content-Type');
		if (str_contains((string)$contentType, 'application/json')) {
			$raw    = file_get_contents('php://input');
			$parsed = ($raw !== false && $raw !== '') ? json_decode($raw, true) : [];
			$get    = fn (string $key, mixed $default = '') => $parsed[$key] ?? $default;
		} else {
			$get = fn (string $key, mixed $default = '') => $this->request->getParam($key, $default);
		}

		$type = (string)$get('type', 'expense');
		if (!in_array($type, ['income', 'expense'], true)) {
			return new DataResponse(['error' => 'Type must be income or expense'], 400);
		}

		$amount = (float)$get('amount', 0);
		if ($amount <= 0) {
			return new DataResponse(['error' => 'Amount must be greater than zero'], 400);
		}

		$accountId = (int)$get('accountId', 0);
		if ($accountId <= 0) {
			return new DataResponse(['error' => 'A valid accountId is required'], 400);
		}

		// Parse tags — accept array or comma-separated string
		$rawTags = $get('tags', []);
		if (is_string($rawTags)) {
			$tags = array_values(array_filter(array_map('trim', explode(',', $rawTags))));
		} elseif (is_array($rawTags)) {
			$tags = array_values(array_filter(array_map('trim', $rawTags)));
		} else {
			$tags = [];
		}

		$data = [
			'type'        => $type,
			'accountId'   => $accountId,
			'amount'      => $amount,
			'description' => (string)$get('description', ''),
			'category'    => (string)$get('category', ''),
			'tags'        => $tags,
			'notes'       => (string)$get('notes', ''),
			'date'        => (string)$get('date', date('Y-m-d')),
			'source'      => 'external',
		];

		try {
			$tx = $this->transactionService->create($uid, $data);
			return new DataResponse(['status' => 'ok', 'transaction' => $tx]);
		} catch (\Exception $e) {
			return new DataResponse(['error' => $e->getMessage()], 400);
		}
	}

	/**
	 * GET /external/quick-add
	 * Add a transaction via URL params (bookmarklet / automation / webhooks).
	 * Auth param: key=<api_token>
	 */
	#[PublicPage]
	#[NoCSRFRequired]
	public function quickAdd(): DataResponse {
		// quick-add uses 'key' query param for the token (bookmarklet-friendly)
		$token = (string)$this->request->getParam('key', '');
		if (empty($token)) {
			// also accept 'token' for consistency
			$token = (string)$this->request->getParam('token', '');
		}
		$uid = $this->resolveToken($token);
		if ($uid === null) {
			return new DataResponse(['error' => 'Invalid API key'], 401);
		}

		$amount = (float)$this->request->getParam('amount', 0);
		if ($amount <= 0) {
			return new DataResponse(['error' => 'Amount required and must be > 0'], 400);
		}

		$rawTags = (string)$this->request->getParam('tags', '');
		$tags    = array_values(array_filter(array_map('trim', explode(',', $rawTags))));

		$data = [
			'type'        => (string)$this->request->getParam('type', 'expense'),
			'accountId'   => (int)$this->request->getParam('account', 0),
			'amount'      => $amount,
			'description' => (string)$this->request->getParam('description', ''),
			'category'    => (string)$this->request->getParam('category', ''),
			'tags'        => $tags,
			'date'        => (string)$this->request->getParam('date', date('Y-m-d')),
			'source'      => 'quick-add',
		];

		if (!in_array($data['type'], ['income', 'expense'], true)) {
			return new DataResponse(['error' => 'Type must be income or expense'], 400);
		}

		try {
			$tx = $this->transactionService->create($uid, $data);
			return new DataResponse(['status' => 'ok', 'id' => $tx['id'], 'message' => 'Transaction added']);
		} catch (\Exception $e) {
			return new DataResponse(['error' => $e->getMessage()], 400);
		}
	}
}
