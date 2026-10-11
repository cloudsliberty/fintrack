<?php

declare(strict_types=1);

namespace OCA\FinTrack\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Adds fintrack_transactions.deleted_at — turns transaction deletion into a
 * soft delete so the Data Management "Recently Deleted" recycle bin can
 * list and restore the last 100 deleted transactions per user. Nullable:
 * existing rows and any transaction that's never been deleted stay NULL and
 * behave exactly as before (excluded from the trash, included everywhere
 * else). Indexed since every normal read filters on "deleted_at IS NULL"
 * and the trash view filters on "deleted_at IS NOT NULL", both per-user.
 */
class Version1008Date20260714000000 extends SimpleMigrationStep {

	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if ($schema->hasTable('fintrack_transactions')) {
			$table = $schema->getTable('fintrack_transactions');
			if (!$table->hasColumn('deleted_at')) {
				$table->addColumn('deleted_at', Types::BIGINT, ['notnull' => false, 'default' => null]);
			}
			if (!$table->hasIndex('fintrack_tx_deleted')) {
				$table->addIndex(['user_id', 'deleted_at'], 'fintrack_tx_deleted');
			}
		}

		return $schema;
	}
}
