<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCP\DB\QueryBuilder\IQueryBuilder;

class BudgetService extends BaseService {

	protected function tableName(): string { return 'fintrack_budgets'; }


	protected function mapRow(array $row): array {
		return [
			'id'        => (int)$row['id'],
			'name'      => $row['name'],
			'limit'     => (float)$row['limit_amt'],
			'currency'  => $row['currency'],
			'period'    => $row['period'],
			'category'  => $row['category'] ?? '',
			'active'    => (bool)(int)$row['active'],
			'startDate' => date('Y-m-d', (int)$row['start_date']),
			'created'   => (int)$row['created_at'],
		];
	}

	public function findAll(string $userId): array {
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_budgets')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->orderBy('name', 'ASC');
		return $this->rowsToArray($qb->executeQuery());
	}

	public function create(string $userId, array $data): array {
		$qb = $this->qb();
		$qb->insert('fintrack_budgets')->values([
			'user_id'    => $qb->createNamedParameter($userId),
			'name'       => $qb->createNamedParameter($data['name'] ?? ''),
			'limit_amt'  => $qb->createNamedParameter((float)($data['limit'] ?? 0)),
			'currency'   => $qb->createNamedParameter(strtoupper($data['currency'] ?? 'USD')),
			'period'     => $qb->createNamedParameter($data['period'] ?? 'monthly'),
			'category'   => $qb->createNamedParameter($data['category'] ?? ''),
			'active'     => $qb->createNamedParameter((int)($data['active'] ?? 1), IQueryBuilder::PARAM_INT),
			'start_date' => $qb->createNamedParameter(!empty($data['startDate']) ? strtotime($data['startDate']) : time(), IQueryBuilder::PARAM_INT),
			'created_at' => $qb->createNamedParameter($this->now(), IQueryBuilder::PARAM_INT),
		]);
		$qb->executeStatement();
		return array_merge($data, ['id' => (int)$this->db->lastInsertId('fintrack_budgets')]);
	}

	public function update(string $userId, int $id, array $data): array {
		$this->assertOwner($userId, 'fintrack_budgets', $id);
		$qb = $this->qb();
		$qb->update('fintrack_budgets')
		   ->set('name',       $qb->createNamedParameter($data['name'] ?? ''))
		   ->set('limit_amt',  $qb->createNamedParameter((float)($data['limit'] ?? 0)))
		   ->set('currency',   $qb->createNamedParameter(strtoupper($data['currency'] ?? 'USD')))
		   ->set('period',     $qb->createNamedParameter($data['period'] ?? 'monthly'))
		   ->set('category',   $qb->createNamedParameter($data['category'] ?? ''))
		   ->set('active',     $qb->createNamedParameter((int)($data['active'] ?? 1), IQueryBuilder::PARAM_INT))
		   ->set('start_date', $qb->createNamedParameter(!empty($data['startDate']) ? strtotime($data['startDate']) : time(), IQueryBuilder::PARAM_INT))
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
		return array_merge($data, ['id' => $id]);
	}

	public function delete(string $userId, int $id): void {
		$this->assertOwner($userId, 'fintrack_budgets', $id);
		$qb = $this->qb();
		$qb->delete('fintrack_budgets')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
	}
}
