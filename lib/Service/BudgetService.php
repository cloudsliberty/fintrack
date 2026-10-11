<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCA\FinTrack\Db\Budget;
use OCA\FinTrack\Db\BudgetMapper;
use OCP\AppFramework\Db\DoesNotExistException;

/**
 * Thin service layer over BudgetMapper (QBMapper). All the row↔array column
 * mapping and CRUD boilerplate the other Service classes still hand-roll
 * (see BaseService/AccountService/TransactionService etc.) now lives once,
 * in BudgetMapper + the Budget entity — this class just translates between
 * the Entity and the plain array shape the controller/JS already expect, so
 * nothing above this layer had to change.
 */
class BudgetService {

	public function __construct(
		private BudgetMapper $mapper,
	) {
	}

	private function toArray(Budget $b): array {
		return [
			'id'        => $b->getId(),
			'name'      => $b->getName(),
			'limit'     => $b->getLimitAmt(),
			'currency'  => $b->getCurrency(),
			'period'    => $b->getPeriod(),
			'category'  => $b->getCategory() ?? '',
			'active'    => $b->getActive(),
			'startDate' => date('Y-m-d', $b->getStartDate()),
			'created'   => $b->getCreatedAt(),
		];
	}

	private function fromData(Budget $b, string $userId, array $data): Budget {
		$b->setUserId($userId);
		$b->setName((string)($data['name'] ?? ''));
		$b->setLimitAmt((float)($data['limit'] ?? 0));
		$b->setCurrency(strtoupper((string)($data['currency'] ?? 'USD')));
		$b->setPeriod((string)($data['period'] ?? 'monthly'));
		$b->setCategory((string)($data['category'] ?? ''));
		$b->setActive((bool)($data['active'] ?? true));
		$b->setStartDate(!empty($data['startDate']) ? strtotime($data['startDate']) : time());
		return $b;
	}

	public function findAll(string $userId): array {
		return array_map(fn (Budget $b) => $this->toArray($b), $this->mapper->findAll($userId));
	}

	public function create(string $userId, array $data): array {
		$budget = $this->fromData(new Budget(), $userId, $data);
		$budget->setCreatedAt(time());
		return $this->toArray($this->mapper->insert($budget));
	}

	public function update(string $userId, int $id, array $data): array {
		$budget = $this->findOwnedOrFail($userId, $id);
		$this->fromData($budget, $userId, $data);
		return $this->toArray($this->mapper->update($budget));
	}

	public function delete(string $userId, int $id): void {
		$this->mapper->delete($this->findOwnedOrFail($userId, $id));
	}

	/** Delete every budget belonging to this user. Used by "Reset All Data". */
	public function deleteAll(string $userId): void {
		foreach ($this->mapper->findAll($userId) as $budget) {
			$this->mapper->delete($budget);
		}
	}

	private function findOwnedOrFail(string $userId, int $id): Budget {
		try {
			return $this->mapper->findOwned($id, $userId);
		} catch (DoesNotExistException $e) {
			throw new \Exception('Not found or access denied');
		}
	}
}
