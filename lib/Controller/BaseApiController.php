<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\IRequest;
use OCP\IUserSession;

/**
 * Shared helpers for every FinTrack API controller. This app used to have a
 * single 700-line ApiController handling accounts, transactions, budgets,
 * currencies, recurring items, settings and reset all at once; it's now
 * split into one controller per resource (AccountsController,
 * TransactionsController, ...) — the standard Nextcloud pattern — each
 * pulling in only the Service(s) it actually needs.
 *
 * CSRF policy (applies to every subclass):
 *   GET endpoints:            #[NoCSRFRequired]  — safe reads, no state change
 *   POST / PUT / DELETE:      CSRF enforced by default (no attribute needed)
 * The JS client sends the requesttoken header on every mutating fetch(), so
 * NC32's built-in CSRF check passes automatically.
 *
 * Body parsing:
 *   The JS client sends Content-Type: application/json. NC32's
 *   IRequest::getParams() does NOT decode a JSON body — it only reads
 *   multipart/form-data and application/x-www-form-urlencoded. jsonBody()
 *   below parses the raw input for mutating calls, falling back to
 *   getParams() for plain form submissions.
 */
abstract class BaseApiController extends Controller {

	public function __construct(
		IRequest $request,
		protected IUserSession $userSession,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/** Return the current user's ID (throws if not logged in). */
	protected function uid(): string {
		$user = $this->userSession->getUser();
		if ($user === null) {
			throw new \RuntimeException('Not authenticated');
		}
		return $user->getUID();
	}

	protected function jsonBody(): array {
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
}
