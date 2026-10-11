<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\Service\BudgetService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\CORS;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

class BudgetsController extends BaseApiController {

	public function __construct(
		IRequest $request,
		IUserSession $userSession,
		private BudgetService $budgetService,
	) {
		parent::__construct($request, $userSession);
	}

	/** GET /api/budgets */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function index(): DataResponse {
		return new DataResponse($this->budgetService->findAll($this->uid()));
	}

	/** POST /api/budgets */
	#[CORS]
	#[NoAdminRequired]
	public function create(): DataResponse {
		return new DataResponse($this->budgetService->create($this->uid(), $this->jsonBody()));
	}

	/** PUT /api/budgets/{id} */
	#[CORS]
	#[NoAdminRequired]
	public function update(int $id): DataResponse {
		return new DataResponse($this->budgetService->update($this->uid(), $id, $this->jsonBody()));
	}

	/** DELETE /api/budgets/{id} */
	#[CORS]
	#[NoAdminRequired]
	public function destroy(int $id): DataResponse {
		$this->budgetService->delete($this->uid(), $id);
		return new DataResponse(['status' => 'ok']);
	}
}
