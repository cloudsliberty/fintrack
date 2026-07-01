<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCP\DB\QueryBuilder\IQueryBuilder;

class CategoryService extends BaseService {

	protected function tableName(): string { return 'fintrack_categories'; }


	protected function mapRow(array $row): array {
		return [
			'id'    => (int)$row['id'],
			'name'  => $row['name'],
			'type'  => $row['type'],
			'icon'  => $row['icon'] ?? '',
			'color' => $row['color'] ?? '#4f8ef7',
		];
	}

	public function findAll(string $userId): array {
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_categories')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->orderBy('name', 'ASC');
		return $this->rowsToArray($qb->executeQuery());
	}

	public function create(string $userId, array $data): array {
		$qb = $this->qb();
		$qb->insert('fintrack_categories')->values([
			'user_id' => $qb->createNamedParameter($userId),
			'name'    => $qb->createNamedParameter($data['name'] ?? ''),
			'type'    => $qb->createNamedParameter($data['type'] ?? 'expense'),
			'icon'    => $qb->createNamedParameter($data['icon'] ?? ''),
			'color'   => $qb->createNamedParameter($data['color'] ?? '#4f8ef7'),
		]);
		$qb->executeStatement();
		return array_merge($data, ['id' => (int)$this->db->lastInsertId('fintrack_categories')]);
	}

	public function update(string $userId, int $id, array $data): array {
		$this->assertOwner($userId, 'fintrack_categories', $id);
		$qb = $this->qb();
		$qb->update('fintrack_categories')
		   ->set('name',  $qb->createNamedParameter($data['name'] ?? ''))
		   ->set('type',  $qb->createNamedParameter($data['type'] ?? 'expense'))
		   ->set('icon',  $qb->createNamedParameter($data['icon'] ?? ''))
		   ->set('color', $qb->createNamedParameter($data['color'] ?? '#4f8ef7'))
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
		return array_merge($data, ['id' => $id]);
	}

	public function delete(string $userId, int $id): void {
		$this->assertOwner($userId, 'fintrack_categories', $id);
		$qb = $this->qb();
		$qb->delete('fintrack_categories')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
	}
}
