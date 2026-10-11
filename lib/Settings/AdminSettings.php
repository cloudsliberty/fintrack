<?php

declare(strict_types=1);

namespace OCA\FinTrack\Settings;

use OCA\FinTrack\AppInfo\Application;
use OCA\FinTrack\Service\LockService;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\Settings\ISettings;

/**
 * Admin Settings → FinTrack → Reset PIN. Shows the queue of pending
 * "Request Admin Approval to Reset PIN" requests (see LockService) with a
 * one-click "Approve & Clear PIN" action per row.
 */
class AdminSettings implements ISettings {

	public function __construct(
		private LockService $lockService,
	) {
	}

	public function getForm(): TemplateResponse {
		return new TemplateResponse(Application::APP_ID, 'admin_settings', [
			'pendingRequests' => $this->lockService->listPendingRequests(),
		], 'blank');
	}

	public function getSection(): string {
		return Application::APP_ID;
	}

	public function getPriority(): int {
		return 10;
	}
}
