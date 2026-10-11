<?php

declare(strict_types=1);

namespace OCA\FinTrack\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * fintrack_recurring.anchor_day (1.22.0) — the day of month a monthly /
 * quarterly / yearly rule is meant to fire on (1-31). Without it, a rule
 * starting on Jan 31 drifts to the 28th after passing through February.
 * Nullable: legacy rows fall back to the day of their current next_date.
 */
class Version1015Date20260806000000 extends SimpleMigrationStep {

	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if ($schema->hasTable('fintrack_recurring')) {
			$table = $schema->getTable('fintrack_recurring');
			if (!$table->hasColumn('anchor_day')) {
				$table->addColumn('anchor_day', Types::SMALLINT, ['notnull' => false, 'default' => null]);
			}
		}

		return $schema;
	}
}
