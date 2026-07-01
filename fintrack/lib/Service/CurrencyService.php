<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCP\DB\QueryBuilder\IQueryBuilder;

class CurrencyService extends BaseService {

	protected function tableName(): string { return 'fintrack_currencies'; }


	protected function mapRow(array $row): array {
		return [
			'id'     => (int)$row['id'],
			'code'   => $row['code'],
			'name'   => $row['name'],
			'symbol' => $row['symbol'],
			'rate'   => (float)$row['rate'],
		];
	}

	public function findAll(string $userId): array {
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_currencies')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->orderBy('code', 'ASC');
		return $this->rowsToArray($qb->executeQuery());
	}

	public function create(string $userId, array $data): array {
		$qb = $this->qb();
		$qb->insert('fintrack_currencies')->values([
			'user_id' => $qb->createNamedParameter($userId),
			'code'    => $qb->createNamedParameter(strtoupper($data['code'] ?? '')),
			'name'    => $qb->createNamedParameter($data['name'] ?? ''),
			'symbol'  => $qb->createNamedParameter($data['symbol'] ?? ''),
			'rate'    => $qb->createNamedParameter((float)($data['rate'] ?? 1)),
		]);
		$qb->executeStatement();
		return array_merge($data, ['id' => (int)$this->db->lastInsertId('fintrack_currencies')]);
	}

	public function update(string $userId, int $id, array $data): array {
		$this->assertOwner($userId, 'fintrack_currencies', $id);
		$qb = $this->qb();
		$qb->update('fintrack_currencies')
		   ->set('name',   $qb->createNamedParameter($data['name'] ?? ''))
		   ->set('symbol', $qb->createNamedParameter($data['symbol'] ?? ''))
		   ->set('rate',   $qb->createNamedParameter((float)($data['rate'] ?? 1)))
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
		return array_merge($data, ['id' => $id]);
	}

	public function delete(string $userId, int $id): void {
		$this->assertOwner($userId, 'fintrack_currencies', $id);
		$qb = $this->qb();
		$qb->delete('fintrack_currencies')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
	}
}
