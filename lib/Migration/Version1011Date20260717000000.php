<?php

declare(strict_types=1);

namespace OCA\FinTrack\Migration;

use Closure;
use OCA\FinTrack\Service\TagUtil;
use OCP\DB\ISchemaWrapper;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Tags are now case-insensitive throughout the app (see TagUtil::normalize())
 * so "Food" and "food" are treated as the same tag going forward. This
 * one-time data migration lowercases + dedupes every tag that already
 * exists on disk, so older mixed-case data doesn't keep showing up as
 * separate tags after the upgrade:
 *
 *  - fintrack_settings, key='tags' (the per-user saved/autosuggest tag list)
 *  - fintrack_transactions.tags (each row's own JSON tag array)
 *  - fintrack_recurring.tags (same, for recurring rules)
 *
 * Idempotent: normalizing already-lowercase data is a no-op, and rows whose
 * value doesn't change are simply not written back.
 */
class Version1011Date20260717000000 extends SimpleMigrationStep {

	public function __construct(
		private IDBConnection $db,
	) {
	}

	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		return null;
	}

	public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
		$this->lowercaseSettingsTags();
		$this->lowercaseRowTags('fintrack_transactions');
		$this->lowercaseRowTags('fintrack_recurring');
	}

	private function lowercaseSettingsTags(): void {
		$select = $this->db->getQueryBuilder();
		$select->select('id', 'value')->from('fintrack_settings')
			->where($select->expr()->eq('key', $select->createNamedParameter('tags')));
		$result = $select->executeQuery();
		while ($row = $result->fetch()) {
			$tags = json_decode((string)$row['value'], true);
			if (!is_array($tags)) {
				continue;
			}
			$normalized = TagUtil::normalize($tags);
			if ($normalized === $tags) {
				continue;
			}
			$update = $this->db->getQueryBuilder();
			$update->update('fintrack_settings')
				->set('value', $update->createNamedParameter(json_encode(array_values($normalized))))
				->where($update->expr()->eq('id', $update->createNamedParameter((int)$row['id'], \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT)));
			$update->executeStatement();
		}
		$result->closeCursor();
	}

	private function lowercaseRowTags(string $table): void {
		$select = $this->db->getQueryBuilder();
		$select->select('id', 'tags')->from($table);
		$result = $select->executeQuery();
		while ($row = $result->fetch()) {
			$tags = json_decode((string)$row['tags'], true);
			if (!is_array($tags) || empty($tags)) {
				continue;
			}
			$normalized = TagUtil::normalize($tags);
			if ($normalized === $tags) {
				continue;
			}
			$update = $this->db->getQueryBuilder();
			$update->update($table)
				->set('tags', $update->createNamedParameter(json_encode(array_values($normalized))))
				->where($update->expr()->eq('id', $update->createNamedParameter((int)$row['id'], \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT)));
			$update->executeStatement();
		}
		$result->closeCursor();
	}
}
