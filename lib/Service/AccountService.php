<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCA\FinTrack\Exception\AccountInUseException;
use OCP\DB\QueryBuilder\IQueryBuilder;

class AccountService extends BaseService {

	public function __construct(
		\OCP\IDBConnection $db,
		private CategoryService $categoryService,
	) {
		parent::__construct($db);
	}

	protected function tableName(): string { return 'fintrack_accounts'; }

	protected function mapRow(array $row): array {
		return [
			'id'            => (int)$row['id'],
			'name'          => $row['name'],
			'type'          => $row['type'],
			'currency'      => $row['currency'],
			'description'   => $row['description'] ?? '',
			'icon'          => $row['icon'] ?? '',
			'color'         => $row['color'] ?? '#4f8ef7',
			'active'        => (bool)(int)$row['active'],
			'created'       => (int)$row['created_at'],
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
			'user_id'        => $qb->createNamedParameter($userId),
			'name'           => $qb->createNamedParameter($data['name'] ?? ''),
			'type'           => $qb->createNamedParameter($data['type'] ?? 'asset'),
			'currency'       => $qb->createNamedParameter(strtoupper($data['currency'] ?? 'USD')),
			'description'    => $qb->createNamedParameter($data['description'] ?? ''),
			'icon'           => $qb->createNamedParameter($data['icon'] ?? ''),
			'color'          => $qb->createNamedParameter($data['color'] ?? '#4f8ef7'),
			'active'         => $qb->createNamedParameter((int)($data['active'] ?? 1), IQueryBuilder::PARAM_INT),
			'created_at'     => $qb->createNamedParameter($this->now(), IQueryBuilder::PARAM_INT),
		]);
		$qb->executeStatement();
		$id = (int)$this->db->lastInsertId('fintrack_accounts');

		return $this->find($userId, $id);
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

		return $this->find($userId, $id);
	}

	public function find(string $userId, int $id): array {
		$this->assertOwner($userId, 'fintrack_accounts', $id);
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_accounts')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$row = $qb->executeQuery()->fetch();
		return $this->mapRow($row);
	}

	/**
	 * Deletion is blocked for any account referenced by at least one
	 * transaction or transfer — removing it would orphan that financial
	 * history. Instead the account is marked inactive (soft-disable): it
	 * stays visible in reports/history but drops out of "active account"
	 * pickers for new entries. Only an account with zero linked records
	 * is actually deleted. Applies identically in the Main App and PWA,
	 * since both go through this same service method.
	 */
	public function delete(string $userId, int $id): void {
		$this->assertOwner($userId, 'fintrack_accounts', $id);

		if ($this->hasLinkedTransactions($userId, $id)) {
			$qb = $this->qb();
			$qb->update('fintrack_accounts')
			   ->set('active', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT))
			   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
			$qb->executeStatement();
			throw new AccountInUseException();
		}

		$qb = $this->qb();
		$qb->delete('fintrack_accounts')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
	}

	// (thrown by delete() above; see Exception\AccountInUseException)
	private function hasLinkedTransactions(string $userId, int $accountId): bool {
		$qb = $this->qb();
		$qb->select('id')->from('fintrack_transactions')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->eq('account_id', $qb->createNamedParameter($accountId, IQueryBuilder::PARAM_INT)))
		   ->setMaxResults(1);
		if ($qb->executeQuery()->fetch()) {
			return true;
		}

		$qb = $this->qb();
		$qb->select('id')->from('fintrack_transfers')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->orX(
		   	$qb->expr()->eq('from_account_id', $qb->createNamedParameter($accountId, IQueryBuilder::PARAM_INT)),
		   	$qb->expr()->eq('to_account_id', $qb->createNamedParameter($accountId, IQueryBuilder::PARAM_INT))
		   ))
		   ->setMaxResults(1);
		return (bool)$qb->executeQuery()->fetch();
	}
}
