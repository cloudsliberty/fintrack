<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCP\DB\QueryBuilder\IQueryBuilder;

class TransactionService extends BaseService {

	public function __construct(
		\OCP\IDBConnection $db,
		private AccountService $accountService,
		private CurrencyService $currencyService,
		private SettingsService $settingsService,
		private AlertService $alertService,
	) {
		parent::__construct($db);
	}

	protected function tableName(): string { return 'fintrack_transactions'; }


	protected function mapRow(array $row): array {
		return [
			'id'             => (int)$row['id'],
			'accountId'      => (int)$row['account_id'],
			'type'           => $row['type'],
			'amount'         => (float)$row['amount'],
			'currency'       => $row['currency'],
			'conversionRate' => isset($row['conversion_rate']) && $row['conversion_rate'] !== null
				? (float)$row['conversion_rate']
				: null,
			'description'    => $row['description'] ?? '',
			'category'       => $row['category'] ?? '',
			'tags'           => json_decode($row['tags'] ?? '[]', true) ?: [],
			'notes'          => $row['notes'] ?? '',
			'date'           => date('Y-m-d', (int)$row['date']),
			'source'         => $row['source'] ?? 'manual',
			'recurringId'    => isset($row['recurring_id']) ? (int)$row['recurring_id'] : null,
			'created'        => (int)$row['created_at'],
			// Custom Nextcloud-alert reminder (1.21.0): null when none is set.
			'reminderDate'   => !empty($row['reminder_date']) ? date('Y-m-d', (int)$row['reminder_date']) : null,
			'reminderSent'   => !empty($row['reminder_sent']),
			'deletedAt'      => isset($row['deleted_at']) && $row['deleted_at'] !== null ? (int)$row['deleted_at'] : null,
		];
	}

	/**
	 * Work out the conversion rate (this currency -> base currency) that should be
	 * persisted alongside a transaction.
	 *
	 * - If the transaction's currency IS the base currency, no rate is needed at all.
	 * - If the caller supplied an explicit rate (e.g. typed into the "Conversion Rate"
	 *   field on the transaction form, or a CSV column), use it as THIS transaction's
	 *   frozen snapshot. It does NOT touch the currency's stored rate unless the
	 *   caller explicitly opts in with $updateCurrencyRate (a historical CSV row or an
	 *   edit of an old transaction must never silently re-price everything else).
	 * - Otherwise fall back to whatever rate is currently on file for that currency,
	 *   so old callers/integrations that don't send a rate still work.
	 *
	 * @return float|null null when no conversion is needed (currency === base).
	 */
	private function resolveConversionRate(string $userId, string $currency, mixed $suppliedRate, bool $updateCurrencyRate = false): ?float {
		$base = strtoupper($this->settingsService->get($userId, 'base_currency', 'USD'));
		$currency = strtoupper($currency);

		if ($currency === $base) {
			return null;
		}

		if ($suppliedRate !== null && $suppliedRate !== '') {
			$rate = (float)$suppliedRate;
			if ($rate > 0) {
				if ($updateCurrencyRate) {
					$this->currencyService->setRateForCode($userId, $currency, $rate);
				}
				return $rate;
			}
		}

		// No usable rate supplied — fall back to whatever is currently on file.
		$existing = $this->currencyService->findByCode($userId, $currency);
		return $existing ? (float)$existing['rate'] : 1.0;
	}

	/**
	 * Merge any newly-used tags into the user's saved tag list (settings key
	 * 'tags'), so they show up in autosuggest everywhere — including entries
	 * made via the external form or CSV import, not just the main app.
	 */
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

	/**
	 * Renames a tag on every transaction that uses it (including trashed
	 * ones, so restoring a trashed transaction later still shows the current
	 * name). If a transaction already has the new name too, the two are
	 * merged rather than duplicated. Returns the number of rows updated.
	 */
	public function renameTag(string $userId, string $oldTag, string $newTag): int {
		$oldTag = TagUtil::normalize([$oldTag])[0] ?? '';
		$newTag = TagUtil::normalize([$newTag])[0] ?? '';
		if ($oldTag === '' || $newTag === '' || $oldTag === $newTag) {
			return 0;
		}
		$select = $this->qb();
		$select->select('id', 'tags')->from('fintrack_transactions')
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
			$update->update('fintrack_transactions')
				->set('tags', $update->createNamedParameter(json_encode(array_values($renamed))))
				->where($update->expr()->eq('id', $update->createNamedParameter((int)$row['id'], IQueryBuilder::PARAM_INT)));
			$update->executeStatement();
			$updated++;
		}
		$result->closeCursor();
		return $updated;
	}

	/** True if any transaction of this user still carries the given tag. */
	public function hasTag(string $userId, string $tag): bool {
		$tag = TagUtil::normalize([$tag])[0] ?? '';
		if ($tag === '') return false;
		$select = $this->qb();
		$select->select('tags')->from('fintrack_transactions')
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

	public function findAll(string $userId, array $filters = []): array {
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_transactions')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->isNull('deleted_at'))
		   // id tiebreaker keeps limit/offset pages stable (many rows share a date).
		   ->orderBy('date', 'DESC')
		   ->addOrderBy('id', 'DESC');

		if (!empty($filters['accountId'])) {
			$qb->andWhere($qb->expr()->eq('account_id', $qb->createNamedParameter((int)$filters['accountId'], IQueryBuilder::PARAM_INT)));
		}
		if (!empty($filters['type'])) {
			$qb->andWhere($qb->expr()->eq('type', $qb->createNamedParameter($filters['type'])));
		}
		if (!empty($filters['category'])) {
			$qb->andWhere($qb->expr()->eq('category', $qb->createNamedParameter($filters['category'])));
		}
		if (!empty($filters['source'])) {
			$qb->andWhere($qb->expr()->eq('source', $qb->createNamedParameter($filters['source'])));
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

	/** Number of non-deleted transactions — one COUNT query, no row loading. */
	public function countAll(string $userId): int {
		$qb = $this->qb();
		$qb->select($qb->func()->count('*', 'cnt'))->from('fintrack_transactions')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->isNull('deleted_at'));
		$result = $qb->executeQuery();
		$row = $result->fetch();
		$result->closeCursor();
		return (int)($row['cnt'] ?? 0);
	}

	public function find(string $userId, int $id): ?array {
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_transactions')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
		   ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->isNull('deleted_at'));
		$row = $qb->executeQuery()->fetch();
		return $row ? $this->mapRow($row) : null;
	}


	public function create(string $userId, array $data): array {
		$tags = $data['tags'] ?? [];
		if (is_string($tags)) {
			$tags = array_filter(array_map('trim', explode(',', $tags)));
		}
		$tags = TagUtil::normalize($tags);
		$dateTs = !empty($data['date']) ? strtotime($data['date']) : time();
		$accountId = (int)($data['accountId'] ?? $data['account_id'] ?? 0);
		$account = $this->accountService->find($userId, $accountId);
		// Callers that don't send a currency (external submit, quick-add, old
		// clients) get the target account's currency, never a blind 'USD'.
		$currency = strtoupper(trim((string)($data['currency'] ?? '')) ?: (string)$account['currency']);
		$conversionRate = $this->resolveConversionRate($userId, $currency, $data['conversionRate'] ?? null, !empty($data['updateCurrencyRate']));
		$reminderTs = $this->parseReminderDate($data['reminderDate'] ?? null);

		$qb = $this->qb();
		$qb->insert('fintrack_transactions')->values([
			'user_id'         => $qb->createNamedParameter($userId),
			'account_id'      => $qb->createNamedParameter($accountId, IQueryBuilder::PARAM_INT),
			'type'            => $qb->createNamedParameter($data['type'] ?? 'expense'),
			'amount'          => $qb->createNamedParameter((float)($data['amount'] ?? 0)),
			'currency'        => $qb->createNamedParameter($currency),
			'conversion_rate' => $qb->createNamedParameter($conversionRate),
			'description'     => $qb->createNamedParameter($data['description'] ?? ''),
			'category'        => $qb->createNamedParameter($data['category'] ?? ''),
			'tags'            => $qb->createNamedParameter(json_encode(array_values($tags))),
			'notes'           => $qb->createNamedParameter($data['notes'] ?? ''),
			'date'            => $qb->createNamedParameter($dateTs, IQueryBuilder::PARAM_INT),
			'source'          => $qb->createNamedParameter($data['source'] ?? 'manual'),
			'recurring_id'    => $qb->createNamedParameter($data['recurringId'] ?? null),
			'created_at'      => $qb->createNamedParameter($this->now(), IQueryBuilder::PARAM_INT),
			'reminder_date'   => $qb->createNamedParameter($reminderTs, $reminderTs === null ? IQueryBuilder::PARAM_NULL : IQueryBuilder::PARAM_INT),
			// A backup restore carries reminderSent through so already-fired reminders don't alert again.
			'reminder_sent'   => $qb->createNamedParameter(($reminderTs !== null && !empty($data['reminderSent'])) ? 1 : 0, IQueryBuilder::PARAM_INT),
		]);
		$qb->executeStatement();
		$id = (int)$this->db->lastInsertId('fintrack_transactions');
		$this->persistNewTags($userId, $tags);
		return $this->mapRow([
			'id'              => $id,
			'account_id'      => $accountId,
			'type'            => $data['type'] ?? 'expense',
			'amount'          => $data['amount'] ?? 0,
			'currency'        => $currency,
			'conversion_rate' => $conversionRate,
			'description'     => $data['description'] ?? '',
			'category'        => $data['category'] ?? '',
			'tags'            => json_encode(array_values($tags)),
			'notes'           => $data['notes'] ?? '',
			'date'            => $dateTs,
			'source'          => $data['source'] ?? 'manual',
			'recurring_id'    => $data['recurringId'] ?? null,
			'created_at'      => $this->now(),
			'reminder_date'   => $reminderTs,
			'reminder_sent'   => ($reminderTs !== null && !empty($data['reminderSent'])) ? 1 : 0,
		]);
	}

	/** Reminder dates arrive as 'Y-m-d' (or empty/null for none); stored as a midnight timestamp like every other date column. */
	private function parseReminderDate(mixed $value): ?int {
		if ($value === null || $value === '' || $value === false) {
			return null;
		}
		$ts = strtotime((string)$value);
		return $ts === false ? null : $ts;
	}

	/**
	 * Every non-deleted transaction, across every user, whose custom
	 * reminder date has arrived and hasn't alerted yet — used by
	 * PostDueRecurringJob. Raw rows (with user_id), like
	 * RecurringService::findAllDue().
	 */
	public function findAllDueReminders(int $asOf): array {
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_transactions')
		   ->where($qb->expr()->isNotNull('reminder_date'))
		   ->andWhere($qb->expr()->lte('reminder_date', $qb->createNamedParameter($asOf, IQueryBuilder::PARAM_INT)))
		   ->andWhere($qb->expr()->eq('reminder_sent', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)))
		   ->andWhere($qb->expr()->isNull('deleted_at'));
		$result = $qb->executeQuery();
		$rows = $result->fetchAll();
		$result->closeCursor();
		return $rows;
	}

	public function markReminderSent(int $id): void {
		$qb = $this->qb();
		$qb->update('fintrack_transactions')
		   ->set('reminder_sent', $qb->createNamedParameter(1, IQueryBuilder::PARAM_INT))
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
	}

	/**
	 * Bulk-import transactions from parsed CSV rows into a single account.
	 * Each row is validated independently — one bad row does not abort the
	 * whole import, it's just reported back in 'errors'.
	 *
	 * Duplicate detection: a row is considered a duplicate — and skipped,
	 * not imported — if its (date, type, amount, description) fingerprint
	 * matches either a transaction already stored on this account, or an
	 * earlier row already accepted from this same CSV file. This catches
	 * both "re-importing the same statement file twice" and "the bank's
	 * export itself contains the same line twice", without relying on the
	 * user to dedupe the file by hand first.
	 *
	 * Auto-categorization: rows that don't include a category are matched
	 * against the user's saved category rules (settings key
	 * 'categoryRules') — an ordered list of {pattern, category} pairs. The
	 * first rule whose pattern is found in the row's description
	 * (case-insensitive substring match) fills in that category. Rows that
	 * already specify a category are left untouched.
	 *
	 * @param array $rows Each row: ['date','type','amount','description','category','tags','notes']
	 * @return array{imported:int, failed:int, duplicates:int, autoCategorized:int, errors:string[]}
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

		// Fingerprints of every transaction already on this account, so a
		// re-imported file (or a CSV containing rows already entered by hand)
		// doesn't create duplicate entries. Only consulted for rows that
		// don't match an existing row by id (see below) — a key-matched
		// row always updates that row directly, fingerprint or not.
		$existingFingerprints = [];
		foreach ($this->findAll($userId, ['accountId' => $accountId, 'limit' => 100000]) as $existing) {
			$existingFingerprints[$this->importFingerprint(
				strtotime((string)($existing['date'] ?? '')) ?: null,
				$existing['type'] ?? '',
				(float)($existing['amount'] ?? 0),
				$existing['description'] ?? ''
			)] = true;
		}

		// id set for this user's existing (non-deleted) transactions, so a
		// "unique-key(for-updating)" value from the CSV can be checked for
		// a match with a single in-memory lookup instead of one query per
		// row. Raw single-column fetch, deliberately not routed through
		// rowsToArray()/mapRow(), which expect a full transaction row.
		$existingIds = [];
		$idQb = $this->qb();
		$idQb->select('id')->from('fintrack_transactions')
		     ->where($idQb->expr()->eq('user_id', $idQb->createNamedParameter($userId)))
		     ->andWhere($idQb->expr()->isNull('deleted_at'));
		$idResult = $idQb->executeQuery();
		while ($r = $idResult->fetch()) {
			$existingIds[(int)$r['id']] = true;
		}
		$idResult->closeCursor();

		// Rule-based auto-categorization: an ordered list of {pattern,
		// category} pairs (see SettingsController::categoryRules /
		// saveCategoryRules). Only applied to rows that don't already
		// specify a category — an explicit category column always wins.
		$categoryRules = json_decode($this->settingsService->get($userId, 'categoryRules', '[]'), true) ?: [];

		$imported        = 0;
		$updated         = 0;
		$duplicates      = 0;
		$autoCategorized = 0;
		$errors          = [];
		$seenInBatch     = [];

		foreach ($rows as $i => $row) {
			$rowNum = $i + 2; // +1 for 0-index, +1 for the CSV header row
			$normRow = $this->normalizeRowKeys($row);

			$type = strtolower(trim((string)($this->rowValue($normRow, ['type']) ?? 'expense')));
			if (!in_array($type, ['income', 'expense'], true)) {
				$type = 'expense';
			}

			$amount = (float)($this->rowValue($normRow, ['amount']) ?? 0);
			if ($amount <= 0) {
				$errors[] = ['row' => $rowNum, 'column' => 'amount', 'message' => 'Amount must be greater than zero'];
				continue;
			}

			$dateRaw = trim((string)($this->rowValue($normRow, ['date']) ?? ''));
			$dateTs  = strtotime($dateRaw);
			if ($dateRaw === '' || $dateTs === false) {
				$errors[] = ['row' => $rowNum, 'column' => 'date', 'message' => 'Invalid or missing date'];
				continue;
			}

			$description = (string)($this->rowValue($normRow, ['description', 'desc']) ?? '');

			$tags = $this->rowValue($normRow, ['tags', 'tag', 'tags (separated by ;)']) ?? [];
			if (is_string($tags)) {
				$tags = array_filter(array_map('trim', explode(';', $tags)));
			}
			// Tags are case-insensitive throughout the app — lowercase on the
			// way in so an imported "Food" and an existing "food" are treated
			// as the same tag instead of silently creating a duplicate.
			$tags = TagUtil::normalize($tags);

			$category = trim((string)($this->rowValue($normRow, ['category']) ?? ''));
			if ($category === '' && !empty($categoryRules)) {
				$matched = $this->matchCategoryRule($categoryRules, $description);
				if ($matched !== '') {
					$category = $matched;
					$autoCategorized++;
				}
			}

			// Optional per-row conversion rate — lets historical imported
			// transactions keep the exchange rate that applied on their own
			// date rather than picking up whatever rate is current at
			// import time. Matched against several header spellings
			// ('conversionRate', 'conversion_rate', 'Conversion rate',
			// 'rate', 'exchange rate', ...) via rowValue()'s normalization,
			// since real-world CSV headers rarely match one exact casing.
			$rowRate = $this->rowValue($normRow, [
				'conversionRate', 'conversion_rate', 'conversion rate',
				'rate', 'exchangeRate', 'exchange rate', 'fxRate', 'fx rate',
			]);

			$transactionData = [
				'accountId'      => $accountId,
				'type'           => $type,
				'amount'         => $amount,
				'currency'       => $account['currency'],
				'conversionRate' => $rowRate,
				'description'    => $description,
				'category'       => $category,
				'tags'           => $tags,
				'notes'          => (string)($this->rowValue($normRow, ['notes', 'note']) ?? ''),
				'date'           => $dateRaw,
				'source'         => 'import',
			];

			// ── Upsert: does this row carry a unique-key(for-updating) that
			// matches an existing transaction's id? If so, update that row
			// in place instead of inserting — regardless of the fingerprint
			// duplicate check below, which only applies to key-less rows.
			// Soft-deleted transactions are excluded from $existingIds: a
			// key that belonged to a since-deleted row inserts a fresh one
			// instead of resurrecting it.
			$importKeyRaw = $this->rowValue($normRow, [
				'unique-key(for-updating)', 'uniquekeyforupdating', 'unique_key', 'uniquekey', 'key',
			]);
			$matchedId = null;
			if ($importKeyRaw !== null && trim((string)$importKeyRaw) !== '') {
				$candidateId = (int)trim((string)$importKeyRaw);
				if ($candidateId > 0 && isset($existingIds[$candidateId])) {
					$matchedId = $candidateId;
				}
			}

			if ($matchedId !== null) {
				try {
					$this->update($userId, $matchedId, $transactionData);
					$updated++;
				} catch (\Exception $e) {
					$errors[] = ['row' => $rowNum, 'column' => 'general', 'message' => $e->getMessage()];
				}
				continue;
			}

			// No key match (or no key at all) — brand-new row. Same
			// fingerprint-based duplicate detection as before: skip if this
			// exact (date, type, amount, description) combination already
			// exists on this account, or already appeared earlier in this
			// same file.
			$fingerprint = $this->importFingerprint($dateTs, $type, $amount, $description);
			if (isset($existingFingerprints[$fingerprint]) || isset($seenInBatch[$fingerprint])) {
				$duplicates++;
				continue;
			}
			$seenInBatch[$fingerprint] = true;

			try {
				$this->create($userId, $transactionData);
				$imported++;
			} catch (\Exception $e) {
				$errors[] = ['row' => $rowNum, 'column' => 'general', 'message' => $e->getMessage()];
			}
		}

		return [
			'imported'        => $imported,
			'updated'         => $updated,
			'failed'          => count($errors),
			'duplicates'      => $duplicates,
			'autoCategorized' => $autoCategorized,
			'errors'          => $errors,
		];
	}

	/**
	 * Rule-based auto-categorization for CSV import rows that don't specify
	 * a category. Rules are an ordered list of ['pattern' => ..., 'category'
	 * => ...] pairs (see SettingsController::categoryRules); the first rule
	 * whose pattern appears as a case-insensitive substring of the
	 * transaction description wins, so more specific rules should be listed
	 * before more general ones. Returns '' when nothing matches.
	 */
	private function matchCategoryRule(array $rules, string $description): string {
		$description = strtolower(trim($description));
		if ($description === '') {
			return '';
		}
		foreach ($rules as $rule) {
			$pattern  = strtolower(trim((string)($rule['pattern'] ?? '')));
			$category = trim((string)($rule['category'] ?? ''));
			if ($pattern === '' || $category === '') {
				continue;
			}
			if (str_contains($description, $pattern)) {
				return $category;
			}
		}
		return '';
	}

	/**
	 * Builds a stable dedup key for a transaction: same day + type + amount
	 * (to the cent) + normalized description. Date is truncated to the day
	 * (not the exact timestamp) since CSV exports commonly drop the
	 * time-of-day, and normalizing case/whitespace on the description avoids
	 * missing duplicates over trivial formatting differences between exports.
	 */
	/**
	 * Normalizes a parsed CSV row's keys so column matching survives the
	 * header-naming differences real-world files show up with — spaces,
	 * underscores, and casing all collapse to the same key ('Conversion
	 * rate', 'conversion_rate', 'conversionRate' all become
	 * 'conversionrate'). Used together with rowValue() below instead of
	 * indexing $row directly.
	 */
	private function normalizeRowKeys(array $row): array {
		$out = [];
		foreach ($row as $k => $v) {
			$norm = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', (string)$k));
			$out[$norm] = $v;
		}
		return $out;
	}

	/**
	 * Looks up a value in a normalized row (see normalizeRowKeys()) by
	 * trying each alias in order, normalized the same way. Returns null if
	 * none of the aliases are present or all are empty strings.
	 */
	private function rowValue(array $normRow, array $aliases) {
		foreach ($aliases as $alias) {
			$normAlias = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $alias));
			if (isset($normRow[$normAlias]) && $normRow[$normAlias] !== '') {
				return $normRow[$normAlias];
			}
		}
		return null;
	}

	private function importFingerprint($dateTs, string $type, float $amount, string $description): string {
		$day = $dateTs ? date('Y-m-d', (int)$dateTs) : '';
		$desc = strtolower(trim(preg_replace('/\s+/', ' ', $description)));
		return $day . '|' . $type . '|' . number_format($amount, 2, '.', '') . '|' . $desc;
	}

	public function update(string $userId, int $id, array $data): array {
		$this->assertOwner($userId, 'fintrack_transactions', $id);
		$accountId = (int)($data['accountId'] ?? $data['account_id'] ?? 0);
		$account = $this->accountService->find($userId, $accountId);
		$tags = $data['tags'] ?? [];
		if (is_string($tags)) {
			$tags = array_filter(array_map('trim', explode(',', $tags)));
		}
		$tags = TagUtil::normalize($tags);
		$dateTs = !empty($data['date']) ? strtotime($data['date']) : time();
		$currency = strtoupper(trim((string)($data['currency'] ?? '')) ?: (string)$account['currency']);
		$conversionRate = $this->resolveConversionRate($userId, $currency, $data['conversionRate'] ?? null, !empty($data['updateCurrencyRate']));

		$qb = $this->qb();
		$qb->update('fintrack_transactions')
		   ->set('account_id',      $qb->createNamedParameter($accountId, IQueryBuilder::PARAM_INT))
		   ->set('type',            $qb->createNamedParameter($data['type'] ?? 'expense'))
		   ->set('amount',          $qb->createNamedParameter((float)($data['amount'] ?? 0)))
		   ->set('currency',        $qb->createNamedParameter($currency))
		   ->set('conversion_rate', $qb->createNamedParameter($conversionRate))
		   ->set('description',     $qb->createNamedParameter($data['description'] ?? ''))
		   ->set('category',        $qb->createNamedParameter($data['category'] ?? ''))
		   ->set('tags',            $qb->createNamedParameter(json_encode(array_values($tags))))
		   ->set('notes',           $qb->createNamedParameter($data['notes'] ?? ''))
		   ->set('date',            $qb->createNamedParameter($dateTs, IQueryBuilder::PARAM_INT));

		// Reminder: only touched when the client sends the key (older
		// clients — Android, CSV import updates — leave it alone). A changed
		// date re-arms the alert (reminder_sent back to 0); an unchanged one
		// must NOT, or saving an unrelated edit would re-fire an alert that
		// already went out.
		$reminderChanged = false;
		if (array_key_exists('reminderDate', $data)) {
			$newReminderTs = $this->parseReminderDate($data['reminderDate']);
			$curQb = $this->qb();
			$curQb->select('reminder_date')->from('fintrack_transactions')
			      ->where($curQb->expr()->eq('id', $curQb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
			$curResult = $curQb->executeQuery();
			$curRow = $curResult->fetch();
			$curResult->closeCursor();
			$curTs = ($curRow && !empty($curRow['reminder_date'])) ? (int)$curRow['reminder_date'] : null;
			if ($newReminderTs !== $curTs) {
				$reminderChanged = true;
				$qb->set('reminder_date', $qb->createNamedParameter($newReminderTs, $newReminderTs === null ? IQueryBuilder::PARAM_NULL : IQueryBuilder::PARAM_INT))
				   ->set('reminder_sent', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT));
			}
		}

		$qb->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
		if ($reminderChanged) {
			// Drop a stale alert for the old date from the bell.
			$this->alertService->clearTransactionReminder($id);
		}
		$this->persistNewTags($userId, $tags);
		return array_merge($data, ['id' => $id, 'currency' => $currency, 'conversionRate' => $conversionRate]);
	}

	// Max number of deleted transactions kept in the recycle bin per user —
	// matches the "last 100" cap requested for Settings → Data Management.
	private const TRASH_LIMIT = 100;

	/**
	 * Soft-deletes a transaction (sets deleted_at) instead of removing the
	 * row, so it shows up in the Data Management "Recently Deleted" list
	 * and can be restored. Immediately prunes the trash back down to
	 * TRASH_LIMIT afterward — the oldest deleted transactions beyond that
	 * cap are hard-deleted for good, same as before this existed.
	 */
	public function delete(string $userId, int $id): void {
		$this->assertOwner($userId, 'fintrack_transactions', $id);
		$qb = $this->qb();
		$qb->update('fintrack_transactions')
		   ->set('deleted_at', $qb->createNamedParameter($this->now(), IQueryBuilder::PARAM_INT))
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)));
		$qb->executeStatement();
		// A deleted transaction shouldn't leave its reminder alert in the bell.
		$this->alertService->clearTransactionReminder($id);
		$this->pruneTrash($userId);
	}

	/** Lists this user's deleted transactions, most recently deleted first, capped at TRASH_LIMIT. */
	public function findTrash(string $userId): array {
		$qb = $this->qb();
		$qb->select('*')->from('fintrack_transactions')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->isNotNull('deleted_at'))
		   ->orderBy('deleted_at', 'DESC')
		   ->setMaxResults(self::TRASH_LIMIT);
		return $this->rowsToArray($qb->executeQuery());
	}

	/** Restores a soft-deleted transaction back to normal (deleted_at = NULL). */
	public function restore(string $userId, int $id): array {
		$this->assertOwner($userId, 'fintrack_transactions', $id);
		$qb = $this->qb();
		$qb->update('fintrack_transactions')
		   ->set('deleted_at', $qb->createNamedParameter(null))
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
		   ->andWhere($qb->expr()->isNotNull('deleted_at'));
		$affected = $qb->executeStatement();
		if ($affected === 0) {
			throw new \Exception('Transaction not found in recycle bin');
		}
		return $this->find($userId, $id) ?? [];
	}

	/** Permanently removes one transaction from the recycle bin — cannot be undone. */
	public function permanentlyDelete(string $userId, int $id): void {
		$this->assertOwner($userId, 'fintrack_transactions', $id);
		$qb = $this->qb();
		$qb->delete('fintrack_transactions')
		   ->where($qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT)))
		   ->andWhere($qb->expr()->isNotNull('deleted_at'));
		$qb->executeStatement();
	}

	/** Empties the entire recycle bin for this user — cannot be undone. */
	public function emptyTrash(string $userId): void {
		$qb = $this->qb();
		$qb->delete('fintrack_transactions')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->isNotNull('deleted_at'));
		$qb->executeStatement();
	}

	/** Hard-deletes anything past the TRASH_LIMIT most-recently-deleted rows for this user. */
	private function pruneTrash(string $userId): void {
		$qb = $this->qb();
		$qb->select('id')->from('fintrack_transactions')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->isNotNull('deleted_at'))
		   ->orderBy('deleted_at', 'DESC')
		   ->setFirstResult(self::TRASH_LIMIT);
		// Raw id-only fetch, deliberately not routed through rowsToArray()/
		// mapRow() — mapRow() expects a full transaction row (account_id,
		// amount, tags, date, ...) and this is a single-column select.
		$overflowIds = [];
		$result = $qb->executeQuery();
		while ($row = $result->fetch()) {
			$overflowIds[] = (int)$row['id'];
		}
		$result->closeCursor();
		if (empty($overflowIds)) {
			return;
		}
		$del = $this->qb();
		$del->delete('fintrack_transactions')
		    ->where($del->expr()->in('id', $del->createNamedParameter($overflowIds, IQueryBuilder::PARAM_INT_ARRAY)));
		$del->executeStatement();
	}
}
