<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\Service\AccountService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\CORS;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

class AccountsController extends BaseApiController {

	/** Account types the app understands (see README → Accounts). */
	private const ACCOUNT_TYPES = ['asset', 'liability', 'revenue', 'expense'];

	/** Returns an error response for an invalid body, or null if valid. */
	private function validateAccountBody(array $body): ?DataResponse {
		if (!array_key_exists('type', $body) || !is_string($body['type']) || !in_array($body['type'], self::ACCOUNT_TYPES, true)) {
			return new DataResponse(['error' => 'Invalid account type. Allowed: ' . implode(', ', self::ACCOUNT_TYPES) . '.'], 400);
		}
		return null;
	}

	public function __construct(
		IRequest $request,
		IUserSession $userSession,
		private AccountService $accountService,
	) {
		parent::__construct($request, $userSession);
	}

	/** GET /api/accounts */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function index(): DataResponse {
		return new DataResponse($this->accountService->findAll($this->uid()));
	}

	/** POST /api/accounts */
	#[CORS]
	#[NoAdminRequired]
	public function create(): DataResponse {
		$body = $this->jsonBody();
		if ($error = $this->validateAccountBody($body)) {
			return $error;
		}
		return new DataResponse($this->accountService->create($this->uid(), $body));
	}

	/** PUT /api/accounts/{id} */
	#[CORS]
	#[NoAdminRequired]
	public function update(int $id): DataResponse {
		$body = $this->jsonBody();
		if ($error = $this->validateAccountBody($body)) {
			return $error;
		}
		return new DataResponse($this->accountService->update($this->uid(), $id, $body));
	}

	/** DELETE /api/accounts/{id} */
	#[CORS]
	#[NoAdminRequired]
	public function destroy(int $id): DataResponse {
		try {
			$this->accountService->delete($this->uid(), $id);
			return new DataResponse(['status' => 'ok']);
		} catch (\OCA\FinTrack\Exception\AccountInUseException $e) {
			return new DataResponse(['error' => $e->getMessage(), 'markedInactive' => true], 409);
		}
	}
}
