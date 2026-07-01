<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCP\DB\QueryBuilder\IQueryBuilder;

class SettingsService extends BaseService {

	protected function tableName(): string {
		return 'fintrack_settings';
	}

	public function get(string $userId, string $key, string $default = ''): string {
		$qb = $this->qb();
		$qb->select('value')->from('fintrack_settings')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->eq('key', $qb->createNamedParameter($key)));
		$result = $qb->executeQuery();
		$row    = $result->fetch();
		$result->closeCursor();
		return $row ? (string)$row['value'] : $default;
	}

	/**
	 * Upsert a single setting value.
	 *
	 * Previous implementation tried an UPDATE first and only INSERTed when the
	 * UPDATE reported 0 affected rows. That is unsafe: MySQL/MariaDB (mysqli
	 * without CLIENT_FOUND_ROWS) report the number of rows *changed*, not the
	 * number of rows *matched*. Re-saving a setting with the same value it
	 * already had — e.g. clicking "Save" on the settings page without editing
	 * anything — makes the UPDATE report 0 affected rows even though the row
	 * exists, so the code then tried to INSERT a duplicate row and hit the
	 * (user_id, key) unique constraint, throwing an exception and surfacing as
	 * "Error" when saving settings.
	 *
	 * We instead try the INSERT first and, if it fails specifically because
	 * the row already exists (unique constraint violation), fall back to an
	 * UPDATE. This is correct regardless of the DB driver's affected-row
	 * semantics.
	 */
	public function set(string $userId, string $key, string $value): void {
		try {
			$qb = $this->qb();
			$qb->insert('fintrack_settings')->values([
				'user_id' => $qb->createNamedParameter($userId),
				'key'     => $qb->createNamedParameter($key),
				'value'   => $qb->createNamedParameter($value),
			]);
			$qb->executeStatement();
		} catch (\OCP\DB\Exception $e) {
			if ($e->getReason() !== \OCP\DB\Exception::REASON_UNIQUE_CONSTRAINT_VIOLATION) {
				throw $e;
			}
			// Row already exists — update it instead.
			$qb = $this->qb();
			$qb->update('fintrack_settings')
			   ->set('value', $qb->createNamedParameter($value))
			   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			   ->andWhere($qb->expr()->eq('key', $qb->createNamedParameter($key)));
			$qb->executeStatement();
		}
	}

	public function getAll(string $userId): array {
		$qb = $this->qb();
		$qb->select('key', 'value')->from('fintrack_settings')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
		$result = $qb->executeQuery();
		$out    = [];
		while ($row = $result->fetch()) {
			$out[$row['key']] = $row['value'];
		}
		$result->closeCursor();
		return $out;
	}
}
