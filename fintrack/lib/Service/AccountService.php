<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCP\DB\QueryBuilder\IQueryBuilder;

class AccountService extends BaseService {

	protected function tableName(): string { return 'fintrack_accounts'; }


	protected function mapRow(array $row): array {
		return [
			'id'          => (int)$row['id'],
			'name'        => $row['name'],
			'type'        => $row['type'],
			'currency'    => $row['currency'],
			'description' => $row['description'] ?? '',
			'icon'        => $row['icon'] ?? '',
			'color'       => $row['color'] ?? '#4f8ef7',
			'active'      => (bool)(int)$row['active'],
			'created'     => (int)$row['created_at'],
		];
	}

	public function findAll(string $userId): array {
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_accounts')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->orderBy('name', 'ASC');
		return $this->rowsToArray($qb->executeQuery());
	}

	public function create(string $userId, array $data): array {
		$qb = $this->qb();
		$qb->insert('fintrack_accounts')->values([
			'user_id'     => $qb->createNamedParameter($userId),
			'name'        => $qb->createNamedParameter($data['name'] ?? ''),
			'type'        => $qb->createNamedParameter($data['type'] ?? 'asset'),
			'currency'    => $qb->createNamedParameter(strtoupper($data['currency'] ?? 'USD')),
			'description' => $qb->createNamedParameter($data['description'] ?? ''),
			'icon'        => $qb->createNamedParameter($data['icon'] ?? ''),
			'color'       => $qb->createNamedParameter($data['color'] ?? '#4f8ef7'),
			'active'      => $qb->createNamedParameter((int)($data['active'] ?? 1), IQueryBuilder::PARAM_INT),
			'created_at'  => $qb->createNamedParameter($this->now(), IQueryBuilder::PARAM_INT),
		]);
		$qb->executeStatement();
		$id = (int)$this->db->lastInsertId('fintrack_accounts');
		return array_merge($this->mapRow(array_merge($data, ['id' => $id, 'created_at' => $this->now()])), ['id' => $id]);
	}

	public function update(string $userId, int $id, array $data): array {
		$this->assertOwner($userId, 'fintrack_accounts', $id);
		$qb = $this->qb();
		$qb->update('fintrack_accounts')
		   ->set('name',        $qb->createNamedParameter($data['name'] ?? ''))
		   ->set('type',        $qb->createNamedParameter($data['type'] ?? 'asset'))
		   ->set('currency',    $qb->createNamedParameter(strtoupper($data['currency'] ?? 'USD')))
		   ->set('description', $qb->createNamedParameter($data['description'] ?? ''))
		   ->set('icon',        $qb->createNamedParameter($data['icon'] ?? ''))
		   ->set('color',       $qb->createNamedParameter($data['color'] ?? '#4f8ef7'))
		   ->set('active',      $qb->createNamedParameter((int)($data['active'] ?? 1), IQueryBuilder::PARAM_INT))
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
		return array_merge($data, ['id' => $id]);
	}

	public function delete(string $userId, int $id): void {
		$this->assertOwner($userId, 'fintrack_accounts', $id);
		$qb = $this->qb();
		$qb->delete('fintrack_accounts')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
	}
}
