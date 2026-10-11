<?php

declare(strict_types=1);

namespace OCA\FinTrack\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Drops fintrack_transactions.import_key (added in Version1009). The CSV
 * "unique-key(for-updating)" upsert column now matches against a
 * transaction's own id instead of a separate generated key — simpler, and
 * every transaction already has one, including rows created before
 * Version1009 ever ran (which is exactly the gap that change had: nothing
 * generated a key retroactively for older transactions). See
 * TransactionService::bulkImport() / exportTransactionsCSV().
 */
class Version1010Date20260716000000 extends SimpleMigrationStep {

	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if ($schema->hasTable('fintrack_transactions')) {
			$table = $schema->getTable('fintrack_transactions');
			if ($table->hasIndex('fintrack_tx_import_key')) {
				$table->dropIndex('fintrack_tx_import_key');
			}
			if ($table->hasColumn('import_key')) {
				$table->dropColumn('import_key');
			}
		}

		return $schema;
	}
}
