<?php

declare(strict_types=1);

namespace OCA\FinTrack\Migration;

use Closure;
use OCA\FinTrack\AppInfo\Application;
use OCP\DB\ISchemaWrapper;
use OCP\IConfig;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Generates a dedicated, random telemetry instance ID for this FinTrack
 * installation and stores it as an app config value.
 *
 * This ID is intentionally separate from Nextcloud's own system `instanceid`
 * (OCP\IConfig::getSystemValue('instanceid')): it identifies this FinTrack
 * install specifically for the app's own minimal usage telemetry, rather
 * than reusing an identifier that also ties into the rest of the server.
 *
 * Idempotent: if a telemetry_id already exists (e.g. this migration re-runs,
 * or a future reinstall), it is left untouched.
 */
class Version1005Date20260709000000 extends SimpleMigrationStep {

	public function __construct(
		private IConfig $config,
	) {
	}

	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		return null;
	}

	public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
		$existing = $this->config->getAppValue(Application::APP_ID, 'telemetry_id', '');
		if ($existing === '') {
			$instanceId = bin2hex(random_bytes(16));
			$this->config->setAppValue(Application::APP_ID, 'telemetry_id', $instanceId);
		}
	}
}
