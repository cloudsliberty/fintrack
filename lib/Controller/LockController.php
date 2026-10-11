<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\Exception\LockedOutException;
use OCA\FinTrack\Service\LockService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\CORS;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * Endpoints for the optional app-local PIN lock (on top of Nextcloud's own
 * authentication). See LockService for the rationale and rate-limiting design.
 */
class LockController extends BaseApiController {

	public function __construct(
		IRequest             $request,
		IUserSession         $userSession,
		private LockService  $lockService,
	) {
		parent::__construct($request, $userSession);
	}

	/** GET /api/lock/status */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function status(): DataResponse {
		return new DataResponse($this->lockService->status($this->uid()));
	}

	/** POST /api/lock/setup — body: { newPassword, currentPassword?, timeoutMinutes, resetQuestion?, resetAnswer? } */
	#[CORS]
	#[NoAdminRequired]
	public function setup(): DataResponse {
		$body = $this->jsonBody();
		try {
			$result = $this->lockService->setup(
				$this->uid(),
				(string)($body['newPassword'] ?? ''),
				isset($body['currentPassword']) ? (string)$body['currentPassword'] : null,
				(int)($body['timeoutMinutes'] ?? 10),
				isset($body['resetQuestion']) ? (string)$body['resetQuestion'] : null,
				isset($body['resetAnswer']) ? (string)$body['resetAnswer'] : null,
			);
			return new DataResponse($result);
		} catch (\InvalidArgumentException $e) {
			return new DataResponse(['error' => $e->getMessage()], 400);
		}
	}

	/** POST /api/lock/disable — body: { currentPassword } */
	#[CORS]
	#[NoAdminRequired]
	public function disable(): DataResponse {
		$body = $this->jsonBody();
		try {
			$result = $this->lockService->disable($this->uid(), (string)($body['currentPassword'] ?? ''));
			return new DataResponse($result);
		} catch (\InvalidArgumentException $e) {
			return new DataResponse(['error' => $e->getMessage()], 400);
		}
	}

	/** POST /api/lock/verify — body: { password } */
	#[CORS]
	#[NoAdminRequired]
	public function verify(): DataResponse {
		$body = $this->jsonBody();
		try {
			$result = $this->lockService->verify($this->uid(), (string)($body['password'] ?? ''));
			return new DataResponse($result);
		} catch (LockedOutException $e) {
			return new DataResponse(['error' => $e->getMessage(), 'lockedUntil' => $e->lockedUntil], 423);
		} catch (\InvalidArgumentException $e) {
			return new DataResponse(['error' => $e->getMessage()], 401);
		}
	}

	/** GET /api/lock/reset-question — returns the "forgot PIN" security question, if one is set */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function resetQuestion(): DataResponse {
		$question = $this->lockService->getResetQuestion($this->uid());
		return new DataResponse(['question' => $question]);
	}

	/** POST /api/lock/reset-verify — body: { answer }. On success, disables the PIN lock. */
	#[CORS]
	#[NoAdminRequired]
	public function resetVerify(): DataResponse {
		$body = $this->jsonBody();
		try {
			$result = $this->lockService->verifyResetAnswer($this->uid(), (string)($body['answer'] ?? ''));
			return new DataResponse($result);
		} catch (LockedOutException $e) {
			return new DataResponse(['error' => $e->getMessage(), 'lockedUntil' => $e->lockedUntil], 423);
		} catch (\InvalidArgumentException $e) {
			return new DataResponse(['error' => $e->getMessage()], 401);
		}
	}

	/**
	 * POST /api/lock/request-admin-reset — files a "Request Admin Approval to
	 * Reset PIN" request (see LockService::requestAdminReset()) and notifies
	 * every member of the "admin" group. Last-resort fallback for someone
	 * locked out of App Lock with no security question set, or who's
	 * forgotten the answer too. Idempotent — safe to call again while a
	 * request is already pending.
	 */
	#[CORS]
	#[NoAdminRequired]
	public function requestAdminReset(): DataResponse {
		$user = $this->userSession->getUser();
		$displayName = $user?->getDisplayName() ?? '';
		$result = $this->lockService->requestAdminReset($this->uid(), $displayName);
		return new DataResponse($result);
	}
}
