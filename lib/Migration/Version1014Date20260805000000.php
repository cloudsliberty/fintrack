<?php

declare(strict_types=1);

namespace OCA\FinTrack\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Nextcloud alerts (notifications) for recurring transactions and custom
 * transaction reminders (1.21.0):
 *
 * - fintrack_recurring.alert_enabled — per-rule on/off switch for the alert
 *   sent on the rule's trigger date. Defaults to 1 so every existing and new
 *   recurring transaction gets an alert unless the person turns it off from
 *   the rule's details screen.
 * - fintrack_transactions.reminder_date — optional custom reminder date on
 *   any transaction (lent/borrowed money repayment, upcoming bill, recharge
 *   ...). Nullable; null means no reminder.
 * - fintrack_transactions.reminder_sent — 1 once the alert for the current
 *   reminder_date has been sent, so the background job never alerts twice.
 *   Reset to 0 whenever reminder_date is changed.
 */
class Version1014Date20260805000000 extends SimpleMigrationStep {

	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if ($schema->hasTable('fintrack_recurring')) {
			$table = $schema->getTable('fintrack_recurring');
			if (!$table->hasColumn('alert_enabled')) {
				$table->addColumn('alert_enabled', Types::SMALLINT, ['notnull' => true, 'default' => 1, 'unsigned' => true]);
			}
		}

		if ($schema->hasTable('fintrack_transactions')) {
			$table = $schema->getTable('fintrack_transactions');
			if (!$table->hasColumn('reminder_date')) {
				$table->addColumn('reminder_date', Types::BIGINT, ['notnull' => false, 'default' => null]);
			}
			if (!$table->hasColumn('reminder_sent')) {
				$table->addColumn('reminder_sent', Types::SMALLINT, ['notnull' => true, 'default' => 0, 'unsigned' => true]);
			}
			if (!$table->hasIndex('fintrack_tx_reminder')) {
				$table->addIndex(['reminder_date'], 'fintrack_tx_reminder');
			}
		}

		return $schema;
	}
}
