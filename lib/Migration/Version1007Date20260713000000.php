<?php

declare(strict_types=1);

namespace OCA\FinTrack\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Adds fintrack_recurring.end_date — lets a recurring transaction expire /
 * auto-deactivate on a specific date instead of running forever. Nullable:
 * existing rows (and any new one that doesn't set it) keep posting
 * indefinitely, same as before.
 */
class Version1007Date20260713000000 extends SimpleMigrationStep {

	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if ($schema->hasTable('fintrack_recurring')) {
			$table = $schema->getTable('fintrack_recurring');
			if (!$table->hasColumn('end_date')) {
				$table->addColumn('end_date', Types::BIGINT, ['notnull' => false, 'default' => null]);
			}
		}

		return $schema;
	}
}
