<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCP\DB\QueryBuilder\IQueryBuilder;

/**
 * Backs the PWA session UID / remote-wipe system. Each PWA install (a
 * browser + Nextcloud account pairing) generates its own UID client-side
 * at first login and registers it here. Settings → External Access - PWA
 * lists these so a person can spot a device they no longer use/trust and
 * revoke it — the PWA's own periodic status() check then finds its UID
 * gone and wipes its local cached data on the next sync/refresh.
 */
class PwaSessionService extends BaseService {

	protected function tableName(): string { return 'fintrack_pwa_sessions'; }

	protected function mapRow(array $row): array {
		return [
			'uid'        => $row['uid'],
			'label'      => $row['label'] ?? '',
			'createdAt'  => (int)$row['created_at'],
			'lastSeenAt' => (int)$row['last_seen_at'],
		];
	}

	/** Registers a new session UID, or updates the label/last-seen if it already exists (re-login on the same device). */
	public function register(string $userId, string $uid, string $label): array {
		$existing = $this->find($userId, $uid);
		$now = $this->now();
		if ($existing) {
			$qb = $this->qb();
			$qb->update($this->tableName())
			   ->set('label', $qb->createNamedParameter($label))
			   ->set('last_seen_at', $qb->createNamedParameter($now, IQueryBuilder::PARAM_INT))
			   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
			   ->andWhere($qb->expr()->eq('uid', $qb->createNamedParameter($uid)));
			$qb->executeStatement();
			return $this->find($userId, $uid);
		}
		$qb = $this->qb();
		$qb->insert($this->tableName())
		   ->values([
		   	'user_id'      => $qb->createNamedParameter($userId),
		   	'uid'          => $qb->createNamedParameter($uid),
		   	'label'        => $qb->createNamedParameter($label),
		   	'created_at'   => $qb->createNamedParameter($now, IQueryBuilder::PARAM_INT),
		   	'last_seen_at' => $qb->createNamedParameter($now, IQueryBuilder::PARAM_INT),
		   ]);
		$qb->executeStatement();
		return $this->find($userId, $uid);
	}

	/** Lightweight heartbeat — called on the PWA's periodic sync so "last seen" stays current in the Settings list. */
	public function touch(string $userId, string $uid): void {
		$qb = $this->qb();
		$qb->update($this->tableName())
		   ->set('last_seen_at', $qb->createNamedParameter($this->now(), IQueryBuilder::PARAM_INT))
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->eq('uid', $qb->createNamedParameter($uid)));
		$qb->executeStatement();
	}

	/** True if this UID is still a valid, non-revoked session — a miss here (deleted row) is the PWA's wipe signal. */
	public function isValid(string $userId, string $uid): bool {
		return $this->find($userId, $uid) !== null;
	}

	public function find(string $userId, string $uid): ?array {
		$qb = $this->qb();
		$qb->select('*')->from($this->tableName())
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->eq('uid', $qb->createNamedParameter($uid)));
		$row = $qb->executeQuery()->fetch();
		return $row ? $this->mapRow($row) : null;
	}

	public function findAll(string $userId): array {
		$qb = $this->qb();
		$qb->select('*')->from($this->tableName())
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->orderBy('last_seen_at', 'DESC');
		return $this->rowsToArray($qb->executeQuery());
	}

	/** Revokes (deletes) a session UID — the person's "invalidate this device" action in Settings. */
	public function revoke(string $userId, string $uid): void {
		$qb = $this->qb();
		$qb->delete($this->tableName())
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->eq('uid', $qb->createNamedParameter($uid)));
		$qb->executeStatement();
	}
}
