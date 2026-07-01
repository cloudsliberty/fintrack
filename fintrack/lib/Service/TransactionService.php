<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCP\DB\QueryBuilder\IQueryBuilder;

class TransactionService extends BaseService {

	public function __construct(
		\OCP\IDBConnection $db,
		private AccountService $accountService,
	) {
		parent::__construct($db);
	}

	protected function tableName(): string { return 'fintrack_transactions'; }


	protected function mapRow(array $row): array {
		return [
			'id'          => (int)$row['id'],
			'accountId'   => (int)$row['account_id'],
			'type'        => $row['type'],
			'amount'      => (float)$row['amount'],
			'currency'    => $row['currency'],
			'description' => $row['description'] ?? '',
			'category'    => $row['category'] ?? '',
			'tags'        => json_decode($row['tags'] ?? '[]', true) ?: [],
			'notes'       => $row['notes'] ?? '',
			'date'        => date('Y-m-d', (int)$row['date']),
			'source'      => $row['source'] ?? 'manual',
			'recurringId' => isset($row['recurring_id']) ? (int)$row['recurring_id'] : null,
			'created'     => (int)$row['created_at'],
		];
	}

	public function findAll(string $userId, array $filters = []): array {
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_transactions')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->orderBy('date', 'DESC');

		if (!empty($filters['accountId'])) {
			$qb->andWhere($qb->expr()->eq('account_id', $qb->createNamedParameter((int)$filters['accountId'], IQueryBuilder::PARAM_INT)));
		}
		if (!empty($filters['type'])) {
			$qb->andWhere($qb->expr()->eq('type', $qb->createNamedParameter($filters['type'])));
		}
		if (!empty($filters['category'])) {
			$qb->andWhere($qb->expr()->eq('category', $qb->createNamedParameter($filters['category'])));
		}
		if (!empty($filters['from'])) {
			$qb->andWhere($qb->expr()->gte('date', $qb->createNamedParameter(strtotime($filters['from']), IQueryBuilder::PARAM_INT)));
		}
		if (!empty($filters['to'])) {
			$qb->andWhere($qb->expr()->lte('date', $qb->createNamedParameter(strtotime($filters['to'] . ' 23:59:59'), IQueryBuilder::PARAM_INT)));
		}
		if (!empty($filters['limit'])) {
			$qb->setMaxResults((int)$filters['limit']);
		}
		if (!empty($filters['offset'])) {
			$qb->setFirstResult((int)$filters['offset']);
		}

		return $this->rowsToArray($qb->executeQuery());
	}

	public function create(string $userId, array $data): array {
		$tags = $data['tags'] ?? [];
		if (is_string($tags)) {
			$tags = array_filter(array_map('trim', explode(',', $tags)));
		}
		$dateTs = !empty($data['date']) ? strtotime($data['date']) : time();
		$accountId = (int)($data['accountId'] ?? $data['account_id'] ?? 0);

		$qb = $this->qb();
		$qb->insert('fintrack_transactions')->values([
			'user_id'      => $qb->createNamedParameter($userId),
			'account_id'   => $qb->createNamedParameter($accountId, IQueryBuilder::PARAM_INT),
			'type'         => $qb->createNamedParameter($data['type'] ?? 'expense'),
			'amount'       => $qb->createNamedParameter((float)($data['amount'] ?? 0)),
			'currency'     => $qb->createNamedParameter(strtoupper($data['currency'] ?? 'USD')),
			'description'  => $qb->createNamedParameter($data['description'] ?? ''),
			'category'     => $qb->createNamedParameter($data['category'] ?? ''),
			'tags'         => $qb->createNamedParameter(json_encode(array_values($tags))),
			'notes'        => $qb->createNamedParameter($data['notes'] ?? ''),
			'date'         => $qb->createNamedParameter($dateTs, IQueryBuilder::PARAM_INT),
			'source'       => $qb->createNamedParameter($data['source'] ?? 'manual'),
			'recurring_id' => $qb->createNamedParameter($data['recurringId'] ?? null),
			'created_at'   => $qb->createNamedParameter($this->now(), IQueryBuilder::PARAM_INT),
		]);
		$qb->executeStatement();
		$id = (int)$this->db->lastInsertId('fintrack_transactions');
		return $this->mapRow([
			'id'           => $id,
			'account_id'   => $accountId,
			'type'         => $data['type'] ?? 'expense',
			'amount'       => $data['amount'] ?? 0,
			'currency'     => strtoupper($data['currency'] ?? 'USD'),
			'description'  => $data['description'] ?? '',
			'category'     => $data['category'] ?? '',
			'tags'         => json_encode(array_values($tags)),
			'notes'        => $data['notes'] ?? '',
			'date'         => $dateTs,
			'source'       => $data['source'] ?? 'manual',
			'recurring_id' => $data['recurringId'] ?? null,
			'created_at'   => $this->now(),
		]);
	}

	/**
	 * Bulk-import transactions from parsed CSV rows into a single account.
	 * Each row is validated independently — one bad row does not abort the
	 * whole import, it's just reported back in 'errors'.
	 *
	 * @param array $rows Each row: ['date','type','amount','description','category','tags','notes']
	 * @return array{imported:int, failed:int, errors:string[]}
	 */
	public function bulkImport(string $userId, int $accountId, array $rows): array {
		$account = null;
		foreach ($this->accountService->findAll($userId) as $a) {
			if ($a['id'] === $accountId) {
				$account = $a;
				break;
			}
		}
		if ($account === null) {
			throw new \Exception('Account not found');
		}

		$imported = 0;
		$errors   = [];

		foreach ($rows as $i => $row) {
			$rowNum = $i + 2; // +1 for 0-index, +1 for the CSV header row
			try {
				$type = strtolower(trim((string)($row['type'] ?? 'expense')));
				if (!in_array($type, ['income', 'expense'], true)) {
					$type = 'expense';
				}

				$amount = (float)($row['amount'] ?? 0);
				if ($amount <= 0) {
					throw new \Exception('amount must be greater than zero');
				}

				$dateRaw = trim((string)($row['date'] ?? ''));
				if ($dateRaw === '' || strtotime($dateRaw) === false) {
					throw new \Exception('invalid or missing date');
				}

				$tags = $row['tags'] ?? [];
				if (is_string($tags)) {
					$tags = array_filter(array_map('trim', explode(';', $tags)));
				}

				$this->create($userId, [
					'accountId'   => $accountId,
					'type'        => $type,
					'amount'      => $amount,
					'currency'    => $account['currency'],
					'description' => (string)($row['description'] ?? ''),
					'category'    => (string)($row['category'] ?? ''),
					'tags'        => $tags,
					'notes'       => (string)($row['notes'] ?? ''),
					'date'        => $dateRaw,
					'source'      => 'import',
				]);
				$imported++;
			} catch (\Exception $e) {
				$errors[] = 'Row ' . $rowNum . ': ' . $e->getMessage();
			}
		}

		return ['imported' => $imported, 'failed' => count($errors), 'errors' => $errors];
	}

	public function update(string $userId, int $id, array $data): array {
		$this->assertOwner($userId, 'fintrack_transactions', $id);
		$tags = $data['tags'] ?? [];
		if (is_string($tags)) {
			$tags = array_filter(array_map('trim', explode(',', $tags)));
		}
		$dateTs = !empty($data['date']) ? strtotime($data['date']) : time();

		$qb = $this->qb();
		$qb->update('fintrack_transactions')
		   ->set('account_id',  $qb->createNamedParameter((int)($data['accountId'] ?? 0), IQueryBuilder::PARAM_INT))
		   ->set('type',        $qb->createNamedParameter($data['type'] ?? 'expense'))
		   ->set('amount',      $qb->createNamedParameter((float)($data['amount'] ?? 0)))
		   ->set('currency',    $qb->createNamedParameter(strtoupper($data['currency'] ?? 'USD')))
		   ->set('description', $qb->createNamedParameter($data['description'] ?? ''))
		   ->set('category',    $qb->createNamedParameter($data['category'] ?? ''))
		   ->set('tags',        $qb->createNamedParameter(json_encode(array_values($tags))))
		   ->set('notes',       $qb->createNamedParameter($data['notes'] ?? ''))
		   ->set('date',        $qb->createNamedParameter($dateTs, IQueryBuilder::PARAM_INT))
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
		return array_merge($data, ['id' => $id]);
	}

	public function delete(string $userId, int $id): void {
		$this->assertOwner($userId, 'fintrack_transactions', $id);
		$qb = $this->qb();
		$qb->delete('fintrack_transactions')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
	}
}
