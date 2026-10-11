<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCA\FinTrack\Exception\CurrencyInUseException;
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
		$cur = $this->findById($userId, $id);
		if ($cur && $this->isCodeInUse($userId, $cur['code'])) {
			throw new CurrencyInUseException();
		}
		$qb = $this->qb();
		$qb->delete('fintrack_currencies')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
	}

	private function findById(string $userId, int $id): ?array {
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_currencies')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
		   ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
		$row = $qb->executeQuery()->fetch();
		return $row ? $this->mapRow($row) : null;
	}

	private function isCodeInUse(string $userId, string $code): bool {
		$qb = $this->qb();
		$qb->select('id')->from('fintrack_accounts')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->eq('currency', $qb->createNamedParameter($code)))
		   ->setMaxResults(1);
		if ($qb->executeQuery()->fetch()) {
			return true;
		}
		$qb = $this->qb();
		$qb->select('id')->from('fintrack_transactions')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->eq('currency', $qb->createNamedParameter($code)))
		   ->setMaxResults(1);
		return (bool)$qb->executeQuery()->fetch();
	}

	/**
	 * Look up a single currency by its code for this user, or null if not found.
	 */
	public function findByCode(string $userId, string $code): ?array {
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_currencies')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->eq('code', $qb->createNamedParameter(strtoupper($code))));
		$result = $qb->executeQuery();
		$row    = $result->fetch();
		$result->closeCursor();
		return $row ? $this->mapRow($row) : null;
	}

	/**
	 * Set/update the stored rate for a currency code, used whenever a person enters
	 * a fresh conversion rate on a transaction — that rate becomes the new "official"
	 * rate for the currency going forward. If the currency doesn't exist yet for this
	 * user (e.g. it was only ever used inline on a transaction), create it.
	 */
	public function setRateForCode(string $userId, string $code, float $rate): array {
		$code = strtoupper($code);
		$existing = $this->findByCode($userId, $code);
		if ($existing) {
			return $this->update($userId, $existing['id'], array_merge($existing, ['rate' => $rate]));
		}
		return $this->create($userId, [
			'code'   => $code,
			'name'   => $code,
			'symbol' => $code,
			'rate'   => $rate,
		]);
	}
}
