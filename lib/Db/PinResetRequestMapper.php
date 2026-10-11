<?php

declare(strict_types=1);

namespace OCA\FinTrack\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

/**
 * @extends QBMapper<PinResetRequest>
 */
class PinResetRequestMapper extends QBMapper {

	public function __construct(IDBConnection $db) {
		parent::__construct($db, 'fintrack_pin_resets', PinResetRequest::class);
	}

	/**
	 * The one outstanding ("pending") request for this user, if any. Users
	 * only ever have at most one pending request at a time — requestAdminReset()
	 * reuses this instead of creating a duplicate row/notification.
	 */
	public function findPendingForUser(string $userId): ?PinResetRequest {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from($this->getTableName())
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->eq('status', $qb->createNamedParameter('pending')));
		try {
			return $this->findEntity($qb);
		} catch (DoesNotExistException $e) {
			return null;
		}
	}

	/** @return PinResetRequest[] oldest-first, so the admin queue reads like a FIFO line */
	public function findAllPending(): array {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from($this->getTableName())
		   ->where($qb->expr()->eq('status', $qb->createNamedParameter('pending')))
		   ->orderBy('created_at', 'ASC');
		return $this->findEntities($qb);
	}

	/** @throws DoesNotExistException if no row with this id exists */
	public function findById(int $id): PinResetRequest {
		$qb = $this->db->getQueryBuilder();
		$qb->select('*')->from($this->getTableName())
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		return $this->findEntity($qb);
	}
}
