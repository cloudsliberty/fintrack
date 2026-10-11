<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\Service\AccountService;
use OCA\FinTrack\Service\TransactionService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\CORS;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

class TransactionsController extends BaseApiController {

	public function __construct(
		IRequest $request,
		IUserSession $userSession,
		private TransactionService $transactionService,
		private AccountService $accountService,
	) {
		parent::__construct($request, $userSession);
	}

	/** GET /api/transactions */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function index(): DataResponse {
		$filters = [
			'accountId' => $this->request->getParam('accountId'),
			'type'      => $this->request->getParam('type'),
			'category'  => $this->request->getParam('category'),
			'from'      => $this->request->getParam('from'),
			'to'        => $this->request->getParam('to'),
			// Pages of up to 5000 rows (combine with offset); the web UI and PWA
			// page through everything so balances never rest on a truncated list.
			'limit'     => min(5000, (int)($this->request->getParam('limit', 500))),
			'offset'    => (int)($this->request->getParam('offset', 0)),
		];
		return new DataResponse($this->transactionService->findAll($this->uid(), $filters));
	}

	/** POST /api/transactions */
	#[CORS]
	#[NoAdminRequired]
	public function create(): DataResponse {
		try {
			return new DataResponse($this->transactionService->create($this->uid(), $this->jsonBody()));
		} catch (\Exception $e) {
			return new DataResponse(['error' => $e->getMessage()], 400);
		}
	}

	/**
	 * POST /api/transactions/import
	 * Bulk-import transactions parsed from a CSV file into a single account.
	 * Body: { accountId: number, transactions: [{date,type,amount,description,category,tags,notes}, ...] }
	 * Duplicate rows (by date+type+amount+description, against both the
	 * account's existing transactions and the rest of the same file) are
	 * skipped rather than imported twice — see TransactionService::bulkImport().
	 */
	#[CORS]
	#[NoAdminRequired]
	public function import(): DataResponse {
		$body      = $this->jsonBody();
		$accountId = (int)($body['accountId'] ?? 0);
		$rows      = $body['transactions'] ?? [];

		if ($accountId <= 0) {
			return new DataResponse(['error' => 'Please select an account to import into'], 400);
		}
		if (!is_array($rows) || count($rows) === 0) {
			return new DataResponse(['error' => 'No transactions found to import'], 400);
		}

		$uid = $this->uid();
		try {
			$this->accountService->find($uid, $accountId);
		} catch (\Exception $e) {
			return new DataResponse(['error' => 'Account not found'], 400);
		}

		try {
			return new DataResponse($this->transactionService->bulkImport($uid, $accountId, $rows));
		} catch (\Exception $e) {
			return new DataResponse(['error' => $e->getMessage()], 400);
		}
	}

	/** PUT /api/transactions/{id} */
	#[CORS]
	#[NoAdminRequired]
	public function update(int $id): DataResponse {
		try {
			return new DataResponse($this->transactionService->update($this->uid(), $id, $this->jsonBody()));
		} catch (\Exception $e) {
			return new DataResponse(['error' => $e->getMessage()], 400);
		}
	}

	/** DELETE /api/transactions/{id} */
	#[CORS]
	#[NoAdminRequired]
	public function destroy(int $id): DataResponse {
		$this->transactionService->delete($this->uid(), $id);
		return new DataResponse(['status' => 'ok']);
	}

	/** GET /api/transactions/trash — the "Recently Deleted" recycle bin, most recent first, capped at 100 */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function trash(): DataResponse {
		return new DataResponse($this->transactionService->findTrash($this->uid()));
	}

	/** POST /api/transactions/trash/{id}/restore */
	#[CORS]
	#[NoAdminRequired]
	public function restoreFromTrash(int $id): DataResponse {
		try {
			return new DataResponse($this->transactionService->restore($this->uid(), $id));
		} catch (\Exception $e) {
			return new DataResponse(['error' => $e->getMessage()], 400);
		}
	}

	/** DELETE /api/transactions/trash/{id} — permanent, cannot be undone */
	#[CORS]
	#[NoAdminRequired]
	public function destroyFromTrash(int $id): DataResponse {
		$this->transactionService->permanentlyDelete($this->uid(), $id);
		return new DataResponse(['status' => 'ok']);
	}

	/** POST /api/transactions/trash/empty — permanent, cannot be undone */
	#[CORS]
	#[NoAdminRequired]
	public function emptyTrash(): DataResponse {
		$this->transactionService->emptyTrash($this->uid());
		return new DataResponse(['status' => 'ok']);
	}
}
