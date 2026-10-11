<?php

declare(strict_types=1);

namespace OCA\FinTrack\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Adds a per-transaction conversion_rate column.
 *
 * Previously, converting a transaction's amount into the base currency
 * always used the *current* rate stored on fintrack_currencies — meaning
 * older transactions silently re-priced themselves every time the currency
 * table's rate was updated. This migration lets each transaction snapshot
 * the rate that applied to it at entry/import time, so historical figures
 * stay accurate regardless of later rate changes.
 */
class Version1001Date20260706000000 extends SimpleMigrationStep {

	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if ($schema->hasTable('fintrack_transactions')) {
			$table = $schema->getTable('fintrack_transactions');
			if (!$table->hasColumn('conversion_rate')) {
				// Nullable: null/absent means "same as base currency, no conversion needed".
				$table->addColumn('conversion_rate', Types::DECIMAL, [
					'notnull'  => false,
					'precision' => 15,
					'scale'    => 8,
					'default'  => null,
				]);
			}
		}

		return $schema;
	}
}
