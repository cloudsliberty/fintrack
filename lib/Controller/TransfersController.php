<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\Service\TransferService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\CORS;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

class TransfersController extends BaseApiController {

	public function __construct(
		IRequest $request,
		IUserSession $userSession,
		private TransferService $transferService,
	) {
		parent::__construct($request, $userSession);
	}

	/** GET /api/transfers */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function index(): DataResponse {
		return new DataResponse($this->transferService->findAll($this->uid()));
	}

	/** POST /api/transfers */
	#[CORS]
	#[NoAdminRequired]
	public function create(): DataResponse {
		try {
			return new DataResponse($this->transferService->create($this->uid(), $this->jsonBody()));
		} catch (\InvalidArgumentException $e) {
			return new DataResponse(['error' => $e->getMessage()], 400);
		}
	}

	/** DELETE /api/transfers/{id} */
	#[CORS]
	#[NoAdminRequired]
	public function destroy(int $id): DataResponse {
		$this->transferService->delete($this->uid(), $id);
		return new DataResponse(['status' => 'ok']);
	}
}
