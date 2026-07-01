<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

class RecurringService extends BaseService {

	protected function tableName(): string { return 'fintrack_recurring'; }


	public function __construct(
		IDBConnection $db,
		private TransactionService $transactionService,
	) {
		parent::__construct($db);
	}

	protected function mapRow(array $row): array {
		return [
			'id'          => (int)$row['id'],
			'name'        => $row['name'],
			'type'        => $row['type'],
			'accountId'   => (int)$row['account_id'],
			'amount'      => (float)$row['amount'],
			'currency'    => $row['currency'],
			'frequency'   => $row['frequency'],
			'nextDate'    => date('Y-m-d', (int)$row['next_date']),
			'lastPosted'  => !empty($row['last_posted']) ? date('Y-m-d', (int)$row['last_posted']) : null,
			'category'    => $row['category'] ?? '',
			'description' => $row['description'] ?? '',
			'tags'        => json_decode($row['tags'] ?? '[]', true) ?: [],
			'active'      => (bool)(int)$row['active'],
			'created'     => (int)$row['created_at'],
		];
	}

	public function findAll(string $userId): array {
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_recurring')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->orderBy('name', 'ASC');
		return $this->rowsToArray($qb->executeQuery());
	}

	public function create(string $userId, array $data): array {
		$tags = $data['tags'] ?? [];
		if (is_string($tags)) {
			$tags = array_filter(array_map('trim', explode(',', $tags)));
		}
		$qb = $this->qb();
		$qb->insert('fintrack_recurring')->values([
			'user_id'     => $qb->createNamedParameter($userId),
			'name'        => $qb->createNamedParameter($data['name'] ?? ''),
			'type'        => $qb->createNamedParameter($data['type'] ?? 'expense'),
			'account_id'  => $qb->createNamedParameter((int)($data['accountId'] ?? 0), IQueryBuilder::PARAM_INT),
			'amount'      => $qb->createNamedParameter((float)($data['amount'] ?? 0)),
			'currency'    => $qb->createNamedParameter(strtoupper($data['currency'] ?? 'USD')),
			'frequency'   => $qb->createNamedParameter($data['frequency'] ?? 'monthly'),
			'next_date'   => $qb->createNamedParameter(!empty($data['nextDate']) ? strtotime($data['nextDate']) : time(), IQueryBuilder::PARAM_INT),
			'last_posted' => $qb->createNamedParameter(null),
			'category'    => $qb->createNamedParameter($data['category'] ?? ''),
			'description' => $qb->createNamedParameter($data['description'] ?? ''),
			'tags'        => $qb->createNamedParameter(json_encode(array_values($tags))),
			'active'      => $qb->createNamedParameter((int)($data['active'] ?? 1), IQueryBuilder::PARAM_INT),
			'created_at'  => $qb->createNamedParameter($this->now(), IQueryBuilder::PARAM_INT),
		]);
		$qb->executeStatement();
		return array_merge($data, ['id' => (int)$this->db->lastInsertId('fintrack_recurring')]);
	}

	public function update(string $userId, int $id, array $data): array {
		$this->assertOwner($userId, 'fintrack_recurring', $id);
		$tags = $data['tags'] ?? [];
		if (is_string($tags)) {
			$tags = array_filter(array_map('trim', explode(',', $tags)));
		}
		$qb = $this->qb();
		$qb->update('fintrack_recurring')
		   ->set('name',        $qb->createNamedParameter($data['name'] ?? ''))
		   ->set('type',        $qb->createNamedParameter($data['type'] ?? 'expense'))
		   ->set('account_id',  $qb->createNamedParameter((int)($data['accountId'] ?? 0), IQueryBuilder::PARAM_INT))
		   ->set('amount',      $qb->createNamedParameter((float)($data['amount'] ?? 0)))
		   ->set('frequency',   $qb->createNamedParameter($data['frequency'] ?? 'monthly'))
		   ->set('next_date',   $qb->createNamedParameter(!empty($data['nextDate']) ? strtotime($data['nextDate']) : time(), IQueryBuilder::PARAM_INT))
		   ->set('category',    $qb->createNamedParameter($data['category'] ?? ''))
		   ->set('description', $qb->createNamedParameter($data['description'] ?? ''))
		   ->set('tags',        $qb->createNamedParameter(json_encode(array_values($tags))))
		   ->set('active',      $qb->createNamedParameter((int)($data['active'] ?? 1), IQueryBuilder::PARAM_INT))
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
		return array_merge($data, ['id' => $id]);
	}

	public function delete(string $userId, int $id): void {
		$this->assertOwner($userId, 'fintrack_recurring', $id);
		$qb = $this->qb();
		$qb->delete('fintrack_recurring')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
	}

	public function post(string $userId, int $id): array {
		$this->assertOwner($userId, 'fintrack_recurring', $id);
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_recurring')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$result = $qb->executeQuery();
		$row = $result->fetch();
		$result->closeCursor();
		if (!$row) {
			throw new \Exception('Recurring transaction not found');
		}

		$rec = $this->mapRow($row);
		$tx = $this->transactionService->create($userId, [
			'accountId'   => $rec['accountId'],
			'type'        => $rec['type'],
			'amount'      => $rec['amount'],
			'currency'    => $rec['currency'],
			'description' => $rec['description'] ?: $rec['name'],
			'category'    => $rec['category'],
			'tags'        => array_merge($rec['tags'], ['recurring']),
			'date'        => date('Y-m-d'),
			'source'      => 'recurring',
			'recurringId' => $id,
		]);

		$nextTs = $this->advanceDate($rec['frequency']);
		$upQb = $this->qb();
		$upQb->update('fintrack_recurring')
		     ->set('last_posted', $upQb->createNamedParameter($this->now(), IQueryBuilder::PARAM_INT))
		     ->set('next_date',   $upQb->createNamedParameter($nextTs, IQueryBuilder::PARAM_INT))
		     ->where($upQb->expr()->eq('id', $upQb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$upQb->executeStatement();

		return ['transaction' => $tx, 'nextDate' => date('Y-m-d', $nextTs)];
	}

	private function advanceDate(string $frequency): int {
		$d = new \DateTime();
		match ($frequency) {
			'daily'     => $d->modify('+1 day'),
			'weekly'    => $d->modify('+1 week'),
			'biweekly'  => $d->modify('+2 weeks'),
			'quarterly' => $d->modify('+3 months'),
			'yearly'    => $d->modify('+1 year'),
			default     => $d->modify('+1 month'),
		};
		return $d->getTimestamp();
	}
}
