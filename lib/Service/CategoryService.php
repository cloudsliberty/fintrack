<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCA\FinTrack\Exception\CategoryInUseException;
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

	private function findRawByName(string $userId, string $name): ?array {
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_categories')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->eq('name', $qb->createNamedParameter($name)));
		$row = $qb->executeQuery()->fetch();
		return $row ?: null;
	}

	private function findRawById(string $userId, int $id): ?array {
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_categories')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
		   ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
		$row = $qb->executeQuery()->fetch();
		return $row ?: null;
	}

	/**
	 * Finds a category by name, creating it if it doesn't already exist.
	 * Used by the "create default categories" settings action and anywhere
	 * else a category needs to be guaranteed to exist before use.
	 */
	public function ensureCategory(string $userId, string $name, string $type = 'expense', string $icon = ''): array {
		$existing = $this->findRawByName($userId, $name);
		if ($existing) {
			return $this->mapRow($existing);
		}
		return $this->create($userId, ['name' => $name, 'type' => $type, 'icon' => $icon]);
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
		$before = $this->findRawById($userId, $id);
		$oldName = $before['name'] ?? null;
		$newName = $data['name'] ?? '';

		$qb = $this->qb();
		$qb->update('fintrack_categories')
		   ->set('name',  $qb->createNamedParameter($newName))
		   ->set('type',  $qb->createNamedParameter($data['type'] ?? 'expense'))
		   ->set('icon',  $qb->createNamedParameter($data['icon'] ?? ''))
		   ->set('color', $qb->createNamedParameter($data['color'] ?? '#4f8ef7'))
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();

		// Categories are referenced by name (not id) on transactions/recurring/
		// budgets, so renaming one here previously left every existing entry
		// pointing at the old, now-nonexistent name. Cascade the rename.
		if ($oldName !== null && $oldName !== '' && $oldName !== $newName) {
			$this->cascadeRename($userId, $oldName, $newName);
		}

		return array_merge($data, ['id' => $id]);
	}

	private function cascadeRename(string $userId, string $oldName, string $newName): void {
		foreach (['fintrack_transactions', 'fintrack_recurring', 'fintrack_budgets'] as $table) {
			$qb = $this->qb();
			$qb->update($table)
			   ->set('category', $qb->createNamedParameter($newName))
			   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			   ->andWhere($qb->expr()->eq('category', $qb->createNamedParameter($oldName)));
			$qb->executeStatement();
		}
	}

	public function delete(string $userId, int $id): void {
		$this->assertOwner($userId, 'fintrack_categories', $id);
		$row = $this->findRawById($userId, $id);
		$name = $row['name'] ?? '';
		if ($name !== '' && $this->isNameInUse($userId, $name)) {
			throw new CategoryInUseException();
		}
		$qb = $this->qb();
		$qb->delete('fintrack_categories')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
	}

	private function isNameInUse(string $userId, string $name): bool {
		foreach (['fintrack_transactions', 'fintrack_recurring', 'fintrack_budgets'] as $table) {
			$qb = $this->qb();
			$qb->select('id')->from($table)
			   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			   ->andWhere($qb->expr()->eq('category', $qb->createNamedParameter($name)))
			   ->setMaxResults(1);
			if ($qb->executeQuery()->fetch()) {
				return true;
			}
		}
		return false;
	}
}
