<?php

declare(strict_types=1);

namespace OCA\FinTrack\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Adds investment-tracking columns to fintrack_accounts.
 *
 * Investment accounts (gold, stocks, crypto, mutual funds, real estate…) are
 * still plain "asset" accounts — is_investment simply flags one so the UI can
 * offer a Sell/Settle action and record the purchase price/date needed to
 * compute the eventual profit or loss.
 */
class Version1002Date20260707000000 extends SimpleMigrationStep {

	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if ($schema->hasTable('fintrack_accounts')) {
			$table = $schema->getTable('fintrack_accounts');

			if (!$table->hasColumn('is_investment')) {
				$table->addColumn('is_investment', Types::SMALLINT, [
					'notnull' => true,
					'default' => 0,
					'unsigned' => true,
				]);
			}
			if (!$table->hasColumn('purchase_price')) {
				$table->addColumn('purchase_price', Types::DECIMAL, [
					'notnull'   => false,
					'precision' => 15,
					'scale'     => 4,
					'default'   => null,
				]);
			}
			if (!$table->hasColumn('purchase_date')) {
				// Stored as a Unix timestamp (BIGINT), consistent with created_at
				// and every other date field in this schema.
				$table->addColumn('purchase_date', Types::BIGINT, [
					'notnull' => false,
					'default' => null,
				]);
			}
			if (!$table->hasColumn('settled_date')) {
				$table->addColumn('settled_date', Types::BIGINT, [
					'notnull' => false,
					'default' => null,
				]);
			}
			if (!$table->hasColumn('settled_price')) {
				$table->addColumn('settled_price', Types::DECIMAL, [
					'notnull'   => false,
					'precision' => 15,
					'scale'     => 4,
					'default'   => null,
				]);
			}
		}

		return $schema;
	}
}
