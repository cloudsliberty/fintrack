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
		private SettingsService $settingsService,
		private AccountService $accountService,
	) {
		parent::__construct($db);
	}

	/** Merge any newly-used tags into the saved tag list (mirrors TransactionService). */
	private function persistNewTags(string $userId, array $tags): void {
		if (empty($tags)) {
			return;
		}
		$existing = TagUtil::normalize(json_decode($this->settingsService->get($userId, 'tags', '[]'), true) ?: []);
		$merged   = TagUtil::normalize(array_merge($existing, $tags));
		if ($merged !== $existing) {
			$this->settingsService->set($userId, 'tags', json_encode(array_values($merged)));
		}
	}

	/** Renames a tag on every recurring rule that uses it (mirrors TransactionService::renameTag()). */
	public function renameTag(string $userId, string $oldTag, string $newTag): int {
		$oldTag = TagUtil::normalize([$oldTag])[0] ?? '';
		$newTag = TagUtil::normalize([$newTag])[0] ?? '';
		if ($oldTag === '' || $newTag === '' || $oldTag === $newTag) {
			return 0;
		}
		$select = $this->qb();
		$select->select('id', 'tags')->from('fintrack_recurring')
			->where($select->expr()->eq('user_id', $select->createNamedParameter($userId)));
		$result = $select->executeQuery();
		$updated = 0;
		while ($row = $result->fetch()) {
			$tags = json_decode((string)$row['tags'], true);
			if (!is_array($tags) || !in_array($oldTag, $tags, true)) {
				continue;
			}
			$renamed = array_map(fn ($t) => $t === $oldTag ? $newTag : $t, $tags);
			$renamed = TagUtil::normalize($renamed);
			$update = $this->qb();
			$update->update('fintrack_recurring')
				->set('tags', $update->createNamedParameter(json_encode(array_values($renamed))))
				->where($update->expr()->eq('id', $update->createNamedParameter((int)$row['id'], IQueryBuilder::PARAM_INT)));
			$update->executeStatement();
			$updated++;
		}
		$result->closeCursor();
		return $updated;
	}

	/** True if any recurring rule of this user still carries the given tag. */
	public function hasTag(string $userId, string $tag): bool {
		$tag = TagUtil::normalize([$tag])[0] ?? '';
		if ($tag === '') return false;
		$select = $this->qb();
		$select->select('tags')->from('fintrack_recurring')
			->where($select->expr()->eq('user_id', $select->createNamedParameter($userId)));
		$result = $select->executeQuery();
		while ($row = $result->fetch()) {
			$tags = json_decode((string)$row['tags'], true);
			if (is_array($tags) && in_array($tag, $tags, true)) {
				$result->closeCursor();
				return true;
			}
		}
		$result->closeCursor();
		return false;
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
			'endDate'     => !empty($row['end_date']) ? date('Y-m-d', (int)$row['end_date']) : null,
			'lastPosted'  => !empty($row['last_posted']) ? date('Y-m-d', (int)$row['last_posted']) : null,
			'category'    => $row['category'] ?? '',
			'description' => $row['description'] ?? '',
			'tags'        => json_decode($row['tags'] ?? '[]', true) ?: [],
			'active'      => (bool)(int)$row['active'],
			// Nextcloud alert on the trigger date; rows from before 1.21.0 default to on.
			'alertEnabled' => !isset($row['alert_enabled']) || (bool)(int)$row['alert_enabled'],
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

	/**
	 * Every active recurring item, across every user, whose next_date has
	 * arrived — used by PostDueRecurringJob (a background TimedJob) so
	 * recurring transactions get posted on schedule even if nobody opens the
	 * app that day. Each returned row is a raw DB row (with user_id) rather
	 * than the mapped/camelCase shape findAll() returns, since the caller
	 * needs user_id to call post() for the right user.
	 */
	public function findAllDue(int $asOf): array {
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_recurring')
		   ->where($qb->expr()->eq('active', $qb->createNamedParameter(1, IQueryBuilder::PARAM_INT)))
		   ->andWhere($qb->expr()->lte('next_date', $qb->createNamedParameter($asOf, IQueryBuilder::PARAM_INT)))
		   ->andWhere($qb->expr()->orX(
			   $qb->expr()->isNull('end_date'),
			   $qb->expr()->gte('end_date', $qb->createNamedParameter($asOf, IQueryBuilder::PARAM_INT))
		   ));
		$result = $qb->executeQuery();
		$rows = $result->fetchAll();
		$result->closeCursor();
		return $rows;
	}

	public function create(string $userId, array $data): array {
		$tags = $data['tags'] ?? [];
		if (is_string($tags)) {
			$tags = array_filter(array_map('trim', explode(',', $tags)));
		}
		$tags = TagUtil::normalize($tags);
		$accountId = (int)($data['accountId'] ?? 0);
		$account = $this->accountService->find($userId, $accountId);
		// A rule's currency is its account's currency; a caller-supplied one
		// (e.g. a backup restore) is only honoured when it names a currency.
		$currency = strtoupper(trim((string)($data['currency'] ?? '')) ?: (string)$account['currency']);
		$nextTs = !empty($data['nextDate']) ? strtotime($data['nextDate']) : time();
		$qb = $this->qb();
		$qb->insert('fintrack_recurring')->values([
			'user_id'     => $qb->createNamedParameter($userId),
			'name'        => $qb->createNamedParameter($data['name'] ?? ''),
			'type'        => $qb->createNamedParameter($data['type'] ?? 'expense'),
			'account_id'  => $qb->createNamedParameter($accountId, IQueryBuilder::PARAM_INT),
			'amount'      => $qb->createNamedParameter((float)($data['amount'] ?? 0)),
			'currency'    => $qb->createNamedParameter($currency),
			'frequency'   => $qb->createNamedParameter($data['frequency'] ?? 'monthly'),
			'next_date'   => $qb->createNamedParameter($nextTs, IQueryBuilder::PARAM_INT),
			'anchor_day'  => $qb->createNamedParameter((int)date('j', $nextTs), IQueryBuilder::PARAM_INT),
			'end_date'    => !empty($data['endDate'])
				? $qb->createNamedParameter(strtotime($data['endDate'] . ' 23:59:59'), IQueryBuilder::PARAM_INT)
				: $qb->createNamedParameter(null),
			'last_posted' => $qb->createNamedParameter(null),
			'category'    => $qb->createNamedParameter($data['category'] ?? ''),
			'description' => $qb->createNamedParameter($data['description'] ?? ''),
			'tags'        => $qb->createNamedParameter(json_encode(array_values($tags))),
			'active'      => $qb->createNamedParameter((int)($data['active'] ?? 1), IQueryBuilder::PARAM_INT),
			'alert_enabled' => $qb->createNamedParameter((int)($data['alertEnabled'] ?? 1), IQueryBuilder::PARAM_INT),
			'created_at'  => $qb->createNamedParameter($this->now(), IQueryBuilder::PARAM_INT),
		]);
		$qb->executeStatement();
		$this->persistNewTags($userId, $tags);
		return array_merge($data, ['id' => (int)$this->db->lastInsertId('fintrack_recurring'), 'currency' => $currency]);
	}

	public function update(string $userId, int $id, array $data): array {
		$this->assertOwner($userId, 'fintrack_recurring', $id);
		$accountId = (int)($data['accountId'] ?? 0);
		$account = $this->accountService->find($userId, $accountId);
		// Always re-derive the currency from the (possibly changed) account so
		// the rule can't keep posting in the previous account's currency.
		$currency = strtoupper(trim((string)$account['currency']));
		$nextTs = !empty($data['nextDate']) ? strtotime($data['nextDate']) : time();

		// Anchor day: re-anchor only when the person actually moved the next
		// date. Saving an untouched rule (its next_date may already be a
		// clamped Feb 28) must keep the original day-of-month (31).
		$curQb = $this->qb();
		$curQb->select('next_date', 'anchor_day')->from('fintrack_recurring')
		      ->where($curQb->expr()->eq('id', $curQb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$curResult = $curQb->executeQuery();
		$curRow = $curResult->fetch();
		$curResult->closeCursor();
		$anchorDay = ($curRow && (int)$curRow['next_date'] === $nextTs && !empty($curRow['anchor_day']))
			? (int)$curRow['anchor_day']
			: (int)date('j', $nextTs);
		$tags = $data['tags'] ?? [];
		if (is_string($tags)) {
			$tags = array_filter(array_map('trim', explode(',', $tags)));
		}
		$tags = TagUtil::normalize($tags);
		$qb = $this->qb();
		$qb->update('fintrack_recurring')
		   ->set('name',        $qb->createNamedParameter($data['name'] ?? ''))
		   ->set('type',        $qb->createNamedParameter($data['type'] ?? 'expense'))
		   ->set('account_id',  $qb->createNamedParameter($accountId, IQueryBuilder::PARAM_INT))
		   ->set('amount',      $qb->createNamedParameter((float)($data['amount'] ?? 0)))
		   ->set('currency',    $qb->createNamedParameter($currency))
		   ->set('frequency',   $qb->createNamedParameter($data['frequency'] ?? 'monthly'))
		   ->set('next_date',   $qb->createNamedParameter($nextTs, IQueryBuilder::PARAM_INT))
		   ->set('anchor_day',  $qb->createNamedParameter($anchorDay, IQueryBuilder::PARAM_INT))
		   ->set('end_date',    !empty($data['endDate'])
			   ? $qb->createNamedParameter(strtotime($data['endDate'] . ' 23:59:59'), IQueryBuilder::PARAM_INT)
			   : $qb->createNamedParameter(null))
		   ->set('category',    $qb->createNamedParameter($data['category'] ?? ''))
		   ->set('description', $qb->createNamedParameter($data['description'] ?? ''))
		   ->set('tags',        $qb->createNamedParameter(json_encode(array_values($tags))))
		   ->set('active',      $qb->createNamedParameter((int)($data['active'] ?? 1), IQueryBuilder::PARAM_INT));
		// Only touched when the client actually sends it, so older clients
		// (e.g. the Android app) that don't know about alerts can't silently
		// switch a rule's alert back on when they save it.
		if (array_key_exists('alertEnabled', $data)) {
			$qb->set('alert_enabled', $qb->createNamedParameter((int)(bool)$data['alertEnabled'], IQueryBuilder::PARAM_INT));
		}
		$qb->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
		$this->persistNewTags($userId, $tags);
		return array_merge($data, ['id' => $id, 'currency' => $currency]);
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
		// Post on the SCHEDULED date (so an overdue rule that catches up
		// books each occurrence on its own day, not all on today). A rule
		// posted manually before it is due books today instead of a future date.
		$scheduledTs = (int)$row['next_date'];
		$txDate      = date('Y-m-d', min($scheduledTs, time()));
		$tx = $this->transactionService->create($userId, [
			'accountId'   => $rec['accountId'],
			'type'        => $rec['type'],
			'amount'      => $rec['amount'],
			'currency'    => $rec['currency'],
			'description' => $rec['description'] ?: $rec['name'],
			'category'    => $rec['category'],
			'tags'        => array_merge($rec['tags'], ['recurring']),
			'date'        => $txDate,
			'source'      => 'recurring',
			'recurringId' => $id,
		]);

		$anchorDay = !empty($row['anchor_day']) ? (int)$row['anchor_day'] : (int)date('j', $scheduledTs);
		$nextTs = $this->advanceDate($scheduledTs, $rec['frequency'], $anchorDay);
		$endTs = !empty($row['end_date']) ? (int)$row['end_date'] : null;
		$expired = $endTs !== null && $nextTs > $endTs;

		$upQb = $this->qb();
		$upQb->update('fintrack_recurring')
		     ->set('last_posted', $upQb->createNamedParameter($this->now(), IQueryBuilder::PARAM_INT))
		     ->set('next_date',   $upQb->createNamedParameter($nextTs, IQueryBuilder::PARAM_INT));
		if ($expired) {
			// Passed its end date — stop here rather than posting forever;
			// same effect as pausing it, but automatic.
			$upQb->set('active', $upQb->createNamedParameter(0, IQueryBuilder::PARAM_INT));
		}
		$upQb->where($upQb->expr()->eq('id', $upQb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$upQb->executeStatement();

		return ['transaction' => $tx, 'nextDate' => date('Y-m-d', $nextTs), 'expired' => $expired];
	}

	/**
	 * Next occurrence after $fromTs (the SCHEDULED date, never "now", so an
	 * overdue rule steps forward one period at a time and catches up).
	 * Month-based frequencies keep $anchorDay, clamped to the target month's
	 * length: anchor 31 gives Jan 31, Feb 28, Mar 31 (no drift to the 28th).
	 */
	private function advanceDate(int $fromTs, string $frequency, int $anchorDay): int {
		$d = (new \DateTime())->setTimestamp($fromTs);
		switch ($frequency) {
			case 'daily':
				return $d->modify('+1 day')->getTimestamp();
			case 'weekly':
				return $d->modify('+1 week')->getTimestamp();
			case 'biweekly':
				return $d->modify('+2 weeks')->getTimestamp();
			case 'quarterly':
				$months = 3;
				break;
			case 'yearly':
				$months = 12;
				break;
			default:
				$months = 1;
		}
		$total = ((int)$d->format('Y')) * 12 + ((int)$d->format('n') - 1) + $months;
		$year  = intdiv($total, 12);
		$month = $total % 12 + 1;
		$day   = min(max($anchorDay, 1), (int)(new \DateTime(sprintf('%04d-%02d-01', $year, $month)))->format('t'));
		return $d->setDate($year, $month, $day)->getTimestamp();
	}
}
