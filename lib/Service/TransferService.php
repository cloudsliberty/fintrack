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

	/**
	 * Creates a transfer after validating it.
	 *
	 * @throws \InvalidArgumentException on bad accounts/amounts/date (callers map to HTTP 400)
	 */
	public function create(string $userId, array $data): array {
		$fromId = filter_var($data['fromAccountId'] ?? null, FILTER_VALIDATE_INT);
		$toId   = filter_var($data['toAccountId'] ?? null, FILTER_VALIDATE_INT);
		if ($fromId === false || $toId === false || $fromId < 1 || $toId < 1) {
			throw new \InvalidArgumentException('Both a source and a destination account are required.');
		}
		if ($fromId === $toId) {
			throw new \InvalidArgumentException('Source and destination accounts must be different.');
		}
		// Both accounts must exist and belong to this user.
		foreach ([$fromId, $toId] as $accountId) {
			try {
				$this->assertOwner($userId, 'fintrack_accounts', $accountId);
			} catch (\Throwable $e) {
				throw new \InvalidArgumentException('Account not found.');
			}
		}

		$fromAmount = $this->positiveAmount($data['fromAmount'] ?? null, 'Transfer amount');
		$rate       = isset($data['conversionRate']) && $data['conversionRate'] !== ''
			? $this->positiveAmount($data['conversionRate'], 'Conversion rate')
			: 1.0;
		// toAmount is optional: default to the converted from-amount.
		$toAmount = isset($data['toAmount']) && $data['toAmount'] !== ''
			? $this->positiveAmount($data['toAmount'], 'Received amount')
			: $fromAmount * $rate;

		$dateTs = time();
		if (!empty($data['date'])) {
			$parsed = strtotime((string)$data['date']);
			if ($parsed === false) {
				throw new \InvalidArgumentException('Invalid date.');
			}
			$dateTs = $parsed;
		}
		$data['fromAccountId']  = $fromId;
		$data['toAccountId']    = $toId;
		$data['fromAmount']     = $fromAmount;
		$data['toAmount']       = $toAmount;
		$data['conversionRate'] = $rate;
		$qb = $this->qb();
		$qb->insert('fintrack_transfers')->values([
			'user_id'         => $qb->createNamedParameter($userId),
			'from_account_id' => $qb->createNamedParameter($fromId, IQueryBuilder::PARAM_INT),
			'to_account_id'   => $qb->createNamedParameter($toId, IQueryBuilder::PARAM_INT),
			'from_amount'     => $qb->createNamedParameter($fromAmount),
			'to_amount'       => $qb->createNamedParameter($toAmount),
			'from_currency'   => $qb->createNamedParameter(strtoupper($data['fromCurrency'] ?? 'USD')),
			'to_currency'     => $qb->createNamedParameter(strtoupper($data['toCurrency'] ?? 'USD')),
			'conversion_rate' => $qb->createNamedParameter($rate),
			'description'     => $qb->createNamedParameter($data['description'] ?? ''),
			'date'            => $qb->createNamedParameter($dateTs, IQueryBuilder::PARAM_INT),
			'created_at'      => $qb->createNamedParameter($this->now(), IQueryBuilder::PARAM_INT),
		]);
		$qb->executeStatement();
		return array_merge($data, ['id' => (int)$this->db->lastInsertId('fintrack_transfers')]);
	}

	/** Finite number > 0, or InvalidArgumentException. */
	private function positiveAmount(mixed $value, string $label): float {
		if (!is_numeric($value)) {
			throw new \InvalidArgumentException($label . ' must be a number.');
		}
		$n = (float)$value;
		if (!is_finite($n) || $n <= 0) {
			throw new \InvalidArgumentException($label . ' must be greater than zero.');
		}
		return $n;
	}

	public function delete(string $userId, int $id): void {
		$this->assertOwner($userId, 'fintrack_transfers', $id);
		$qb = $this->qb();
		$qb->delete('fintrack_transfers')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
	}
}
