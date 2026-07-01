<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCP\DB\QueryBuilder\IQueryBuilder;

class TransferService extends BaseService {

	protected function tableName(): string { return 'fintrack_transfers'; }


	protected function mapRow(array $row): array {
		return [
			'id'             => (int)$row['id'],
			'fromAccountId'  => (int)$row['from_account_id'],
			'toAccountId'    => (int)$row['to_account_id'],
			'fromAmount'     => (float)$row['from_amount'],
			'toAmount'       => (float)$row['to_amount'],
			'fromCurrency'   => $row['from_currency'],
			'toCurrency'     => $row['to_currency'],
			'conversionRate' => (float)$row['conversion_rate'],
			'description'    => $row['description'] ?? '',
			'date'           => date('Y-m-d', (int)$row['date']),
			'created'        => (int)$row['created_at'],
		];
	}

	public function findAll(string $userId): array {
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_transfers')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->orderBy('date', 'DESC');
		return $this->rowsToArray($qb->executeQuery());
	}

	public function create(string $userId, array $data): array {
		$dateTs = !empty($data['date']) ? strtotime($data['date']) : time();
		$qb = $this->qb();
		$qb->insert('fintrack_transfers')->values([
			'user_id'         => $qb->createNamedParameter($userId),
			'from_account_id' => $qb->createNamedParameter((int)($data['fromAccountId'] ?? 0), IQueryBuilder::PARAM_INT),
			'to_account_id'   => $qb->createNamedParameter((int)($data['toAccountId'] ?? 0), IQueryBuilder::PARAM_INT),
			'from_amount'     => $qb->createNamedParameter((float)($data['fromAmount'] ?? 0)),
			'to_amount'       => $qb->createNamedParameter((float)($data['toAmount'] ?? 0)),
			'from_currency'   => $qb->createNamedParameter(strtoupper($data['fromCurrency'] ?? 'USD')),
			'to_currency'     => $qb->createNamedParameter(strtoupper($data['toCurrency'] ?? 'USD')),
			'conversion_rate' => $qb->createNamedParameter((float)($data['conversionRate'] ?? 1)),
			'description'     => $qb->createNamedParameter($data['description'] ?? ''),
			'date'            => $qb->createNamedParameter($dateTs, IQueryBuilder::PARAM_INT),
			'created_at'      => $qb->createNamedParameter($this->now(), IQueryBuilder::PARAM_INT),
		]);
		$qb->executeStatement();
		return array_merge($data, ['id' => (int)$this->db->lastInsertId('fintrack_transfers')]);
	}

	public function delete(string $userId, int $id): void {
		$this->assertOwner($userId, 'fintrack_transfers', $id);
		$qb = $this->qb();
		$qb->delete('fintrack_transfers')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
	}
}
