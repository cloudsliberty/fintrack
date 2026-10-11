<?php

declare(strict_types=1);

namespace OCA\FinTrack\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Adds fintrack_pwa_sessions: one row per PWA install (browser + Nextcloud
 * account combination), identified by a UID the PWA generates for itself at
 * first login. Backs the PWA settings feature in Settings → External Access
 * - PWA: a person can see every device/browser that's ever logged into the
 * PWA and revoke one remotely. A revoked (or simply deleted) row is what
 * PwaSessionsController::status() checks on the PWA's periodic sync/refresh
 * — a miss there is the signal for the PWA to log out and wipe its local
 * cached data (see pwa-app.js's checkPwaSessionStatus()).
 */
class Version1013Date20260730000000 extends SimpleMigrationStep {

	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if (!$schema->hasTable('fintrack_pwa_sessions')) {
			$table = $schema->createTable('fintrack_pwa_sessions');
			$table->addColumn('id',            Types::BIGINT,  ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
			$table->addColumn('user_id',       Types::STRING,  ['notnull' => true,  'length' => 64]);
			$table->addColumn('uid',           Types::STRING,  ['notnull' => true,  'length' => 64]);
			$table->addColumn('label',         Types::STRING,  ['notnull' => false, 'length' => 255, 'default' => '']);
			$table->addColumn('created_at',    Types::BIGINT,  ['notnull' => true,  'default' => 0]);
			$table->addColumn('last_seen_at',  Types::BIGINT,  ['notnull' => true,  'default' => 0]);
			$table->setPrimaryKey(['id']);
			$table->addUniqueIndex(['user_id', 'uid'], 'fintrack_pwasess_user_uid');
			$table->addIndex(['user_id'], 'fintrack_pwasess_user');
		}

		return $schema;
	}
}
