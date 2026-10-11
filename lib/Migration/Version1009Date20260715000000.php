<?php

declare(strict_types=1);

namespace OCA\FinTrack\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Adds fintrack_transactions.import_key — a permanent per-transaction
 * identifier (its creation time as epoch milliseconds) exposed in CSV
 * export as the "unique-key(for-updating)" column, so re-importing a
 * previously-exported (and possibly hand-edited) file updates the matching
 * existing row instead of creating a duplicate. Set once at creation
 * (TransactionService::create() / generateImportKey()) and never changed
 * afterward, including across updates. Nullable so existing rows created
 * before this migration simply have no key — they're unmatchable by CSV
 * upsert until re-exported once, but behave exactly as before otherwise.
 *
 * SUPERSEDED by Version1010, which drops this column again: the "no key
 * until re-exported once" gap above meant older transactions could never
 * be matched by CSV upsert, so the upsert key was simplified to just be
 * the transaction's own id — every transaction already has one, no
 * separate column needed. Kept here, unmodified, as migration history.
 */
class Version1009Date20260715000000 extends SimpleMigrationStep {

	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if ($schema->hasTable('fintrack_transactions')) {
			$table = $schema->getTable('fintrack_transactions');
			if (!$table->hasColumn('import_key')) {
				$table->addColumn('import_key', Types::BIGINT, ['notnull' => false, 'default' => null]);
			}
			if (!$table->hasIndex('fintrack_tx_import_key')) {
				$table->addIndex(['user_id', 'import_key'], 'fintrack_tx_import_key');
			}
		}

		return $schema;
	}
}
