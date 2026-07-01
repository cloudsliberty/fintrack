<?php

declare(strict_types=1);

namespace OCA\FinTrack\AppInfo;

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
		// Auto-wiring handles all service injection
	}

	public function boot(IBootContext $context): void {
		// Nothing needed at boot
	}
}
