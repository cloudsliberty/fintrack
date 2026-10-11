<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\Service\RecurringService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\CORS;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

class RecurringController extends BaseApiController {

	public function __construct(
		IRequest $request,
		IUserSession $userSession,
		private RecurringService $recurringService,
	) {
		parent::__construct($request, $userSession);
	}

	/** GET /api/recurring */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function index(): DataResponse {
		return new DataResponse($this->recurringService->findAll($this->uid()));
	}

	/** POST /api/recurring */
	#[CORS]
	#[NoAdminRequired]
	public function create(): DataResponse {
		try {
			return new DataResponse($this->recurringService->create($this->uid(), $this->jsonBody()));
		} catch (\Exception $e) {
			return new DataResponse(['error' => $e->getMessage()], 400);
		}
	}

	/** PUT /api/recurring/{id} */
	#[CORS]
	#[NoAdminRequired]
	public function update(int $id): DataResponse {
		try {
			return new DataResponse($this->recurringService->update($this->uid(), $id, $this->jsonBody()));
		} catch (\Exception $e) {
			return new DataResponse(['error' => $e->getMessage()], 400);
		}
	}

	/** DELETE /api/recurring/{id} */
	#[CORS]
	#[NoAdminRequired]
	public function destroy(int $id): DataResponse {
		$this->recurringService->delete($this->uid(), $id);
		return new DataResponse(['status' => 'ok']);
	}

	/**
	 * POST /api/recurring/{id}/post
	 * Manual "post now" from the UI. The same posting logic also runs
	 * automatically on schedule — see BackgroundJob\PostDueRecurringJob.
	 */
	#[CORS]
	#[NoAdminRequired]
	public function post(int $id): DataResponse {
		try {
			return new DataResponse($this->recurringService->post($this->uid(), $id));
		} catch (\Exception $e) {
			return new DataResponse(['error' => $e->getMessage()], 400);
		}
	}
}
