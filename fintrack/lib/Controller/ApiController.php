<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\AppInfo\Application;
use OCA\FinTrack\Service\AccountService;
use OCA\FinTrack\Service\TransactionService;
use OCA\FinTrack\Service\TransferService;
use OCA\FinTrack\Service\BudgetService;
use OCA\FinTrack\Service\CategoryService;
use OCA\FinTrack\Service\CurrencyService;
use OCA\FinTrack\Service\RecurringService;
use OCA\FinTrack\Service\SettingsService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * ApiController — all endpoints require an authenticated Nextcloud session.
 *
 * CSRF policy:
 *   GET endpoints:            #[NoCSRFRequired]  — safe reads, no state change
 *   POST / PUT / DELETE:      CSRF enforced by default (no attribute needed)
 *
 * The JS client sends the requesttoken header on every mutating fetch(), so
 * NC32's built-in CSRF check passes automatically.
 *
 * Body parsing:
 *   The JS client sends Content-Type: application/json.
 *   NC32's IRequest::getParams() does NOT decode a JSON body — it only reads
 *   multipart/form-data and application/x-www-form-urlencoded.
 *   We use jsonBody() (a helper below) to parse the raw input for mutating calls.
 */
class ApiController extends Controller {

	public function __construct(
		IRequest                  $request,
		private IUserSession      $userSession,
		private AccountService    $accountService,
		private TransactionService $transactionService,
		private TransferService   $transferService,
		private BudgetService     $budgetService,
		private CategoryService   $categoryService,
		private CurrencyService   $currencyService,
		private RecurringService  $recurringService,
		private SettingsService   $settingsService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/** Return the current user's ID (throws if not logged in). */
	private function uid(): string {
		$user = $this->userSession->getUser();
		if ($user === null) {
			throw new \RuntimeException('Not authenticated');
		}
		return $user->getUID();
	}

	/**
	 * Decode a JSON request body.
	 * Falls back to IRequest::getParams() for form-encoded submissions
	 * so the controller works with both content-types.
	 */
	private function jsonBody(): array {
		$contentType = $this->request->getHeader('Content-Type');
		if (str_contains((string)$contentType, 'application/json')) {
			$raw = file_get_contents('php://input');
			if ($raw !== false && $raw !== '') {
				$decoded = json_decode($raw, true);
				if (is_array($decoded)) {
					return $decoded;
				}
			}
			return [];
		}
		// form-encoded fallback
		return $this->request->getParams();
	}

	// ═══════════════════ ACCOUNTS ═══════════════════

	/** GET /api/accounts */
	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function getAccounts(): DataResponse {
		return new DataResponse($this->accountService->findAll($this->uid()));
	}

	/** POST /api/accounts */
	#[NoAdminRequired]
	public function createAccount(): DataResponse {
		return new DataResponse($this->accountService->create($this->uid(), $this->jsonBody()));
	}

	/** PUT /api/accounts/{id} */
	#[NoAdminRequired]
	public function updateAccount(int $id): DataResponse {
		return new DataResponse($this->accountService->update($this->uid(), $id, $this->jsonBody()));
	}

	/** DELETE /api/accounts/{id} */
	#[NoAdminRequired]
	public function deleteAccount(int $id): DataResponse {
		$this->accountService->delete($this->uid(), $id);
		return new DataResponse(['status' => 'ok']);
	}

	// ═══════════════════ TRANSACTIONS ═══════════════════

	/** GET /api/transactions */
	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function getTransactions(): DataResponse {
		$filters = [
			'accountId' => $this->request->getParam('accountId'),
			'type'      => $this->request->getParam('type'),
			'category'  => $this->request->getParam('category'),
			'from'      => $this->request->getParam('from'),
			'to'        => $this->request->getParam('to'),
			'limit'     => (int)($this->request->getParam('limit', 500)),
			'offset'    => (int)($this->request->getParam('offset', 0)),
		];
		return new DataResponse($this->transactionService->findAll($this->uid(), $filters));
	}

	/** POST /api/transactions */
	#[NoAdminRequired]
	public function createTransaction(): DataResponse {
		return new DataResponse($this->transactionService->create($this->uid(), $this->jsonBody()));
	}

	/**
	 * POST /api/transactions/import
	 * Bulk-import transactions parsed from a CSV file into a single account.
	 * Body: { accountId: number, transactions: [{date,type,amount,description,category,tags,notes}, ...] }
	 */
	#[NoAdminRequired]
	public function importTransactions(): DataResponse {
		$body      = $this->jsonBody();
		$accountId = (int)($body['accountId'] ?? 0);
		$rows      = $body['transactions'] ?? [];

		if ($accountId <= 0) {
			return new DataResponse(['error' => 'Please select an account to import into'], 400);
		}
		if (!is_array($rows) || count($rows) === 0) {
			return new DataResponse(['error' => 'No transactions found to import'], 400);
		}

		try {
			return new DataResponse($this->transactionService->bulkImport($this->uid(), $accountId, $rows));
		} catch (\Exception $e) {
			return new DataResponse(['error' => $e->getMessage()], 400);
		}
	}

	/** PUT /api/transactions/{id} */
	#[NoAdminRequired]
	public function updateTransaction(int $id): DataResponse {
		return new DataResponse($this->transactionService->update($this->uid(), $id, $this->jsonBody()));
	}

	/** DELETE /api/transactions/{id} */
	#[NoAdminRequired]
	public function deleteTransaction(int $id): DataResponse {
		$this->transactionService->delete($this->uid(), $id);
		return new DataResponse(['status' => 'ok']);
	}

	// ═══════════════════ TRANSFERS ═══════════════════

	/** GET /api/transfers */
	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function getTransfers(): DataResponse {
		return new DataResponse($this->transferService->findAll($this->uid()));
	}

	/** POST /api/transfers */
	#[NoAdminRequired]
	public function createTransfer(): DataResponse {
		return new DataResponse($this->transferService->create($this->uid(), $this->jsonBody()));
	}

	/** DELETE /api/transfers/{id} */
	#[NoAdminRequired]
	public function deleteTransfer(int $id): DataResponse {
		$this->transferService->delete($this->uid(), $id);
		return new DataResponse(['status' => 'ok']);
	}

	// ═══════════════════ BUDGETS ═══════════════════

	/** GET /api/budgets */
	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function getBudgets(): DataResponse {
		return new DataResponse($this->budgetService->findAll($this->uid()));
	}

	/** POST /api/budgets */
	#[NoAdminRequired]
	public function createBudget(): DataResponse {
		return new DataResponse($this->budgetService->create($this->uid(), $this->jsonBody()));
	}

	/** PUT /api/budgets/{id} */
	#[NoAdminRequired]
	public function updateBudget(int $id): DataResponse {
		return new DataResponse($this->budgetService->update($this->uid(), $id, $this->jsonBody()));
	}

	/** DELETE /api/budgets/{id} */
	#[NoAdminRequired]
	public function deleteBudget(int $id): DataResponse {
		$this->budgetService->delete($this->uid(), $id);
		return new DataResponse(['status' => 'ok']);
	}

	// ═══════════════════ CATEGORIES ═══════════════════

	/** GET /api/categories */
	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function getCategories(): DataResponse {
		return new DataResponse($this->categoryService->findAll($this->uid()));
	}

	/** POST /api/categories */
	#[NoAdminRequired]
	public function createCategory(): DataResponse {
		return new DataResponse($this->categoryService->create($this->uid(), $this->jsonBody()));
	}

	/** PUT /api/categories/{id} */
	#[NoAdminRequired]
	public function updateCategory(int $id): DataResponse {
		return new DataResponse($this->categoryService->update($this->uid(), $id, $this->jsonBody()));
	}

	/** DELETE /api/categories/{id} */
	#[NoAdminRequired]
	public function deleteCategory(int $id): DataResponse {
		$this->categoryService->delete($this->uid(), $id);
		return new DataResponse(['status' => 'ok']);
	}

	// ═══════════════════ CURRENCIES ═══════════════════

	/** GET /api/currencies */
	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function getCurrencies(): DataResponse {
		return new DataResponse($this->currencyService->findAll($this->uid()));
	}

	/** POST /api/currencies */
	#[NoAdminRequired]
	public function createCurrency(): DataResponse {
		return new DataResponse($this->currencyService->create($this->uid(), $this->jsonBody()));
	}

	/** PUT /api/currencies/{id} */
	#[NoAdminRequired]
	public function updateCurrency(int $id): DataResponse {
		return new DataResponse($this->currencyService->update($this->uid(), $id, $this->jsonBody()));
	}

	/** DELETE /api/currencies/{id} */
	#[NoAdminRequired]
	public function deleteCurrency(int $id): DataResponse {
		$this->currencyService->delete($this->uid(), $id);
		return new DataResponse(['status' => 'ok']);
	}

	// ═══════════════════ RECURRING ═══════════════════

	/** GET /api/recurring */
	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function getRecurring(): DataResponse {
		return new DataResponse($this->recurringService->findAll($this->uid()));
	}

	/** POST /api/recurring */
	#[NoAdminRequired]
	public function createRecurring(): DataResponse {
		return new DataResponse($this->recurringService->create($this->uid(), $this->jsonBody()));
	}

	/** PUT /api/recurring/{id} */
	#[NoAdminRequired]
	public function updateRecurring(int $id): DataResponse {
		return new DataResponse($this->recurringService->update($this->uid(), $id, $this->jsonBody()));
	}

	/** DELETE /api/recurring/{id} */
	#[NoAdminRequired]
	public function deleteRecurring(int $id): DataResponse {
		$this->recurringService->delete($this->uid(), $id);
		return new DataResponse(['status' => 'ok']);
	}

	/** POST /api/recurring/{id}/post */
	#[NoAdminRequired]
	public function postRecurring(int $id): DataResponse {
		return new DataResponse($this->recurringService->post($this->uid(), $id));
	}

	// ═══════════════════ SETTINGS / TAGS ═══════════════════

	/** GET /api/settings */
	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function getSettings(): DataResponse {
		return new DataResponse($this->settingsService->getAll($this->uid()));
	}

	/** POST /api/settings */
	#[NoAdminRequired]
	public function saveSettings(): DataResponse {
		$uid    = $this->uid();
		$params = $this->jsonBody();
		// Block overwriting the api_token via this endpoint
		unset($params['api_token']);
		foreach ($params as $key => $value) {
			$this->settingsService->set($uid, (string)$key, (string)$value);
		}
		return new DataResponse(['status' => 'ok']);
	}

	/** GET /api/tags */
	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function getTags(): DataResponse {
		$raw = $this->settingsService->get($this->uid(), 'tags', '[]');
		return new DataResponse(json_decode($raw, true) ?: []);
	}

	/** POST /api/tags */
	#[NoAdminRequired]
	public function saveTags(): DataResponse {
		$body = $this->jsonBody();
		$tags = $body['tags'] ?? [];
		if (!is_array($tags)) {
			$tags = [];
		}
		$this->settingsService->set($this->uid(), 'tags', json_encode(array_values($tags)));
		return new DataResponse(['status' => 'ok']);
	}

	/** GET /api/token */
	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function getApiToken(): DataResponse {
		return new DataResponse(['token' => $this->settingsService->get($this->uid(), 'api_token', '')]);
	}

	/** POST /api/token/regenerate */
	#[NoAdminRequired]
	public function regenerateToken(): DataResponse {
		$token = bin2hex(random_bytes(32));
		$this->settingsService->set($this->uid(), 'api_token', $token);
		return new DataResponse(['token' => $token]);
	}

	// ═══════════════════ SUMMARY ═══════════════════

	/** GET /api/summary */
	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function getSummary(): DataResponse {
		$uid          = $this->uid();
		$accounts     = $this->accountService->findAll($uid);
		$currencies   = $this->currencyService->findAll($uid);
		$baseCurrency = $this->settingsService->get($uid, 'base_currency', 'USD');

		$summary = [
			'baseCurrency'      => $baseCurrency,
			'totalAccounts'     => count($accounts),
			'totalTransactions' => count($this->transactionService->findAll($uid, ['limit' => 0])),
			'currencies'        => $currencies,
		];

		return new DataResponse($summary);
	}
}
