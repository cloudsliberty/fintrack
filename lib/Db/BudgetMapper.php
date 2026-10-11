<?php

declare(strict_types=1);

namespace OCA\FinTrack\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @extends QBMapper<Budget>
 *
 * QBMapper (Nextcloud's Entity/QBMapper base class, same one every core app's
 * DB layer is built on) generates the row↔Entity mapping and the basic
 * find/findAll/insert/update/delete scaffolding in one place, instead of each
 * service hand-writing its own column list in create(), update(), find() and
 * findAll() separately (as AccountService, TransactionService, RecurringService,
 * CategoryService, CurrencyService, TransferService still do — see BaseService).
 * This class is the reference implementation for migrating the rest of those
 * services onto the same pattern incrementally.
 */
class BudgetMapper extends QBMapper {

	public function __construct(IDBConnection $db) {
		parent::__construct($db, 'fintrack_budgets', Budget::class);
	}

	/** @return Budget[] */
	public function findAll(string $userId): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from($this->getTableName())
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->orderBy('name', 'ASC');
		return $this->findEntities($qb);
	}

	/**
	 * @throws DoesNotExistException if no row with this id belongs to this user
	 */
	public function findOwned(int $id, string $userId): Budget {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from($this->getTableName())
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
		   ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
		return $this->findEntity($qb);
	}
}
