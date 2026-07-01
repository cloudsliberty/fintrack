<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCP\IDBConnection;
use OCP\DB\QueryBuilder\IQueryBuilder;

abstract class BaseService {

	public function __construct(protected IDBConnection $db) {}

	abstract protected function tableName(): string;

	protected function qb(): IQueryBuilder {
		return $this->db->getQueryBuilder();
	}

	protected function now(): int {
		return time();
	}

	/**
	 * NC32 returns OC\DB\ResultAdapter from executeQuery(), not Doctrine\DBAL\Result.
	 * We accept any object with fetch() and closeCursor() methods.
	 */
	protected function rowsToArray(mixed $result): array {
		$rows = [];
		while ($row = $result->fetch()) {
			$rows[] = $this->mapRow((array)$row);
		}
		$result->closeCursor();
		return $rows;
	}

	protected function mapRow(array $row): array {
		return $row;
	}

	protected function assertOwner(string $userId, string $table, int $id): void {
		$qb = $this->qb();
		$qb->select('id')->from($table)
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
		   ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
		$result = $qb->executeQuery();
		$row = $result->fetch();
		$result->closeCursor();
		if (!$row) {
			throw new \Exception('Not found or access denied');
		}
	}
}
