<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\AppInfo\Application;
use OCA\FinTrack\Service\LockService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;

/**
 * Admin Settings → FinTrack → Reset PIN queue. Every method here requires
 * Nextcloud admin rights — unlike the per-resource API controllers, none of
 * these are annotated #[NoAdminRequired], which is the deliberate default
 * for this controller (see BaseApiController's CSRF policy note for the
 * equivalent convention on the CSRF side).
 */
class AdminLockController extends Controller {

	public function __construct(
		IRequest            $request,
		private LockService $lockService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * POST /admin/lock-reset/{id}/approve — "Approve & Clear PIN". Called via
	 * fetch() from js/fintrack-admin.js with the requesttoken header, so this
	 * returns JSON rather than redirecting/rendering a page.
	 */
	public function approve(int $id): DataResponse {
		try {
			$result = $this->lockService->approveRequest($id);
			return new DataResponse($result);
		} catch (\InvalidArgumentException $e) {
			return new DataResponse(['error' => $e->getMessage()], 400);
		}
	}
}
