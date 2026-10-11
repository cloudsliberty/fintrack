<?php

declare(strict_types=1);

namespace OCA\FinTrack\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Adds a free-text "location" column to fintrack_accounts, used only for
 * investment accounts to note where the asset physically/digitally lives
 * (e.g. "Home safe", "Zerodha / NSE", "Chase Bank locker", "Binance").
 */
class Version1003Date20260708000000 extends SimpleMigrationStep {

	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if ($schema->hasTable('fintrack_accounts')) {
			$table = $schema->getTable('fintrack_accounts');

			if (!$table->hasColumn('location')) {
				$table->addColumn('location', Types::STRING, [
					'notnull' => false,
					'length'  => 255,
					'default' => null,
				]);
			}
		}

		return $schema;
	}
}
