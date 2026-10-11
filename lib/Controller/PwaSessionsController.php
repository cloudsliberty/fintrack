<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\Service\PwaSessionService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\CORS;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * PWA session UID / remote-wipe system.
 *
 * index()/destroy() back the "PWA Sessions" list in Settings → External
 * Access - PWA in the Main App: every device/browser that's ever logged
 * into the PWA, with a Revoke button.
 *
 * register()/status() are called by the PWA itself (pwa-app.js): register()
 * once at login, status() on every periodic sync/refresh. A revoked session
 * (row deleted) makes status() return valid=false, which is the PWA's
 * signal to log out and wipe its local cached data immediately.
 */
class PwaSessionsController extends BaseApiController {

	public function __construct(
		IRequest $request,
		IUserSession $userSession,
		private PwaSessionService $pwaSessionService,
	) {
		parent::__construct($request, $userSession);
	}

	/** GET /api/pwa-sessions — list this user's registered PWA devices (Main App Settings). */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function index(): DataResponse {
		return new DataResponse($this->pwaSessionService->findAll($this->uid()));
	}

	/** DELETE /api/pwa-sessions/{uid} — revoke a device (Main App Settings "Revoke" button). */
	#[CORS]
	#[NoAdminRequired]
	public function destroy(string $uid): DataResponse {
		$this->pwaSessionService->revoke($this->uid(), $uid);
		return new DataResponse(['status' => 'ok']);
	}

	/** POST /api/pwa-sessions/register — called by the PWA once at login. Body: { uid, label }. */
	#[CORS]
	#[NoAdminRequired]
	public function register(): DataResponse {
		$body = $this->jsonBody();
		$uid = trim((string)($body['uid'] ?? ''));
		$label = trim((string)($body['label'] ?? ''));
		if ($uid === '') {
			return new DataResponse(['error' => 'uid is required'], 400);
		}
		return new DataResponse($this->pwaSessionService->register($this->uid(), $uid, $label));
	}

	/**
	 * GET /api/pwa-sessions/status?uid=... — called by the PWA on every
	 * periodic sync/refresh. valid=false means this UID was revoked (or
	 * never registered) — the PWA must log out and wipe local data.
	 */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function status(string $uid): DataResponse {
		$valid = $this->pwaSessionService->isValid($this->uid(), $uid);
		if ($valid) {
			$this->pwaSessionService->touch($this->uid(), $uid);
		}
		return new DataResponse(['valid' => $valid]);
	}
}
