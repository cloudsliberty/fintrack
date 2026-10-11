<?php

declare(strict_types=1);

namespace OCA\FinTrack\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * The All Transactions page's filter bar (search, date range, type, account,
 * category, tags) now lives entirely in browser localStorage — see the
 * "Transaction filter persistence" helpers in fintrack-core.js — instead of
 * the server-synced settings table. This one-time cleanup removes any
 * tx_filter_* rows left behind in fintrack_settings by earlier versions of
 * the app, for every user, so nothing stale lingers server-side.
 */
class Version1012Date20260718000000 extends SimpleMigrationStep {

	private const KEYS = [
		'tx_filter_from',
		'tx_filter_to',
		'tx_filter_search',
		'tx_filter_type',
		'tx_filter_account',
		'tx_filter_category',
		'tx_filter_tag',
	];

	public function __construct(
		private IDBConnection $db,
	) {
	}

	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		return null;
	}

	public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
		$qb = $this->db->getQueryBuilder();
		$qb->delete('fintrack_settings')
			->where($qb->expr()->in('key', $qb->createNamedParameter(self::KEYS, IQueryBuilder::PARAM_STR_ARRAY)));
		$qb->executeStatement();
	}
}
