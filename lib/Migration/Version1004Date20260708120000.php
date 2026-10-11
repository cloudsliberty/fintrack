<?php

declare(strict_types=1);

namespace OCA\FinTrack\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * The investment-account feature (buy/sell tracking, purchase price/date,
 * settlement, location) has been removed from FinTrack entirely. This drops
 * the now-unused columns it added to fintrack_accounts in earlier migrations.
 * Any investment accounts that existed keep their core account data (name,
 * type, currency, balance-affecting transactions) — only the investment-
 * specific metadata columns are dropped.
 */
class Version1004Date20260708120000 extends SimpleMigrationStep {

	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if ($schema->hasTable('fintrack_accounts')) {
			$table = $schema->getTable('fintrack_accounts');
			foreach (['is_investment', 'purchase_price', 'purchase_date', 'settled_date', 'settled_price', 'location'] as $column) {
				if ($table->hasColumn($column)) {
					$table->dropColumn($column);
				}
			}
		}

		return $schema;
	}
}
