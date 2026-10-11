<?php

declare(strict_types=1);

namespace OCA\FinTrack\AppInfo;

use OCA\FinTrack\Notification\Notifier;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

class Application extends App implements IBootstrap {

	public const APP_ID = 'fintrack';

	public function __construct() {
		parent::__construct(self::APP_ID);
	}

	public function register(IRegistrationContext $context): void {
		// Auto-wiring handles all service injection.
		// PostDueRecurringJob is registered via <background-jobs> in
		// appinfo/info.xml, not here — IRegistrationContext has no
		// registerBackgroundJob() method (that call used to be here and
		// broke app registration entirely: "Call to undefined method
		// ...IRegistrationContext@anonymous::registerBackgroundJob()").
		// Renders the "pin_reset_request" notification (see LockService::notifyAdmins())
		// sent to admins when a user requests App Lock PIN approval.
		$context->registerNotifierService(Notifier::class);
	}

	public function boot(IBootContext $context): void {
		// Nothing needed at boot
	}
}
