<?php

declare(strict_types=1);

namespace OCA\FinTrack\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Adds fintrack_pin_resets, backing the "Request Admin Approval to Reset PIN"
 * flow (see LockService::requestAdminReset()/approveRequest()): a user who's
 * locked out of App Lock and has no (or forgotten) security question can ask
 * a Nextcloud admin to clear their PIN from Admin Settings → FinTrack.
 */
class Version1006Date20260711000000 extends SimpleMigrationStep {

	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if (!$schema->hasTable('fintrack_pin_resets')) {
			$table = $schema->createTable('fintrack_pin_resets');
			$table->addColumn('id',           Types::BIGINT,  ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
			$table->addColumn('user_id',      Types::STRING,  ['notnull' => true,  'length' => 64]);
			$table->addColumn('display_name', Types::STRING,  ['notnull' => false, 'length' => 255, 'default' => '']);
			$table->addColumn('status',       Types::STRING,  ['notnull' => true,  'length' => 20, 'default' => 'pending']);
			$table->addColumn('created_at',   Types::BIGINT,  ['notnull' => true,  'default' => 0]);
			$table->addColumn('resolved_at',  Types::BIGINT,  ['notnull' => false, 'default' => null]);
			$table->setPrimaryKey(['id']);
			$table->addIndex(['user_id', 'status'], 'fintrack_pinreset_user_status');
			$table->addIndex(['status'],            'fintrack_pinreset_status');
		}

		return $schema;
	}
}
