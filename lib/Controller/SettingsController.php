<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\Service\AccountService;
use OCA\FinTrack\Service\BackupService;
use OCA\FinTrack\Service\BudgetService;
use OCA\FinTrack\Service\CategoryService;
use OCA\FinTrack\Service\CurrencyService;
use OCA\FinTrack\Service\RecurringService;
use OCA\FinTrack\Service\SettingsService;
use OCA\FinTrack\Service\TagUtil;
use OCA\FinTrack\Service\TransactionService;
use OCA\FinTrack\Service\TransferService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\CORS;
use OCP\AppFramework\Http\DataResponse;
use OCP\IDBConnection;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

class SettingsController extends BaseApiController {

	public function __construct(
		IRequest $request,
		IUserSession $userSession,
		private SettingsService $settingsService,
		private AccountService $accountService,
		private TransactionService $transactionService,
		private TransferService $transferService,
		private BudgetService $budgetService,
		private CategoryService $categoryService,
		private CurrencyService $currencyService,
		private RecurringService $recurringService,
		private BackupService $backupService,
		private LoggerInterface $logger,
		private IDBConnection $db,
	) {
		parent::__construct($request, $userSession);
	}

	/** GET /api/settings */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function index(): DataResponse {
		// Secrets (lock hashes, FX API key, api_token) never leave the server.
		return new DataResponse($this->settingsService->getAllRedacted($this->uid()));
	}

	/**
	 * POST /api/settings
	 * Only keys in SettingsService::CLIENT_WRITABLE_KEYS (plus fx_api_pref_*)
	 * are accepted. Anything else is rejected with 400 and nothing is saved,
	 * so lock state, lockout counters and the api_token can't be forged here.
	 */
	#[CORS]
	#[NoAdminRequired]
	public function save(): DataResponse {
		$uid    = $this->uid();
		$params = $this->jsonBody();
		$rejected = [];
		foreach ($params as $key => $value) {
			if (!SettingsService::isClientWritable((string)$key) || is_array($value) || is_object($value)) {
				$rejected[] = (string)$key;
			}
		}
		if ($rejected !== []) {
			return new DataResponse(['error' => 'Setting not allowed: ' . implode(', ', $rejected)], 400);
		}
		foreach ($params as $key => $value) {
			$this->settingsService->set($uid, (string)$key, (string)$value);
		}
		return new DataResponse(['status' => 'ok']);
	}

	/** GET /api/tags */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function tags(): DataResponse {
		$raw = $this->settingsService->get($this->uid(), 'tags', '[]');
		return new DataResponse(json_decode($raw, true) ?: []);
	}

	/** POST /api/tags */
	#[CORS]
	#[NoAdminRequired]
	public function saveTags(): DataResponse {
		$body = $this->jsonBody();
		$tags = $body['tags'] ?? [];
		if (!is_array($tags)) {
			$tags = [];
		}
		$tags = TagUtil::normalize($tags);
		$this->settingsService->set($this->uid(), 'tags', json_encode(array_values($tags)));
		return new DataResponse(['status' => 'ok']);
	}

	/**
	 * POST /api/tags/rename
	 * Renames a tag everywhere it's used: the saved/autosuggest tag list,
	 * every transaction, and every recurring rule. If the new name already
	 * exists somewhere, the two are merged rather than duplicated.
	 */
	#[CORS]
	#[NoAdminRequired]
	public function renameTag(): DataResponse {
		$uid = $this->uid();
		$body = $this->jsonBody();
		$oldTag = TagUtil::normalize([(string)($body['oldName'] ?? '')])[0] ?? '';
		$newTag = TagUtil::normalize([(string)($body['newName'] ?? '')])[0] ?? '';
		if ($oldTag === '' || $newTag === '') {
			return new DataResponse(['error' => 'Tag name required'], 400);
		}

		$tags = TagUtil::normalize(json_decode($this->settingsService->get($uid, 'tags', '[]'), true) ?: []);
		if (!in_array($oldTag, $tags, true)) {
			return new DataResponse(['error' => 'Tag not found'], 404);
		}
		if ($oldTag !== $newTag) {
			$tags = array_map(fn ($t) => $t === $oldTag ? $newTag : $t, $tags);
			$tags = TagUtil::normalize($tags);
			$this->settingsService->set($uid, 'tags', json_encode(array_values($tags)));
			$this->transactionService->renameTag($uid, $oldTag, $newTag);
			$this->recurringService->renameTag($uid, $oldTag, $newTag);
		}

		return new DataResponse(['status' => 'ok', 'tags' => array_values($tags)]);
	}

	/**
	 * POST /api/tags/delete
	 * Deletes a tag from the saved/autosuggest list — blocked if it's still
	 * attached to any transaction or recurring rule (mirrors the category
	 * deletion restraint). Renaming remains available as an alternative.
	 */
	#[CORS]
	#[NoAdminRequired]
	public function deleteTag(): DataResponse {
		$uid = $this->uid();
		$body = $this->jsonBody();
		$tag = TagUtil::normalize([(string)($body['tag'] ?? '')])[0] ?? '';
		if ($tag === '') {
			return new DataResponse(['error' => 'Tag name required'], 400);
		}
		if ($this->transactionService->hasTag($uid, $tag) || $this->recurringService->hasTag($uid, $tag)) {
			return new DataResponse(['error' => 'This tag is used by existing transactions and can\'t be deleted. Rename it instead if needed.'], 409);
		}
		$tags = TagUtil::normalize(json_decode($this->settingsService->get($uid, 'tags', '[]'), true) ?: []);
		$tags = array_values(array_filter($tags, fn ($t) => $t !== $tag));
		$this->settingsService->set($uid, 'tags', json_encode($tags));
		return new DataResponse(['status' => 'ok', 'tags' => $tags]);
	}

	/**
	 * GET /api/category-rules
	 * Rule-based auto-categorization rules used by CSV import: an ordered
	 * list of {pattern, category} pairs. When an imported row has no
	 * category of its own, TransactionService::bulkImport() matches its
	 * description against these rules (first match wins) and fills the
	 * category in automatically. Stored per-user as JSON in settings,
	 * mirroring how 'tags' is stored.
	 */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function categoryRules(): DataResponse {
		$raw = $this->settingsService->get($this->uid(), 'categoryRules', '[]');
		return new DataResponse(json_decode($raw, true) ?: []);
	}

	/** POST /api/category-rules */
	#[CORS]
	#[NoAdminRequired]
	public function saveCategoryRules(): DataResponse {
		$body  = $this->jsonBody();
		$rules = $body['rules'] ?? [];
		if (!is_array($rules)) {
			$rules = [];
		}
		// Keep order (it determines match priority) but drop incomplete rows.
		$clean = [];
		foreach ($rules as $rule) {
			$pattern  = trim((string)($rule['pattern'] ?? ''));
			$category = trim((string)($rule['category'] ?? ''));
			if ($pattern !== '' && $category !== '') {
				$clean[] = ['pattern' => $pattern, 'category' => $category];
			}
		}
		$this->settingsService->set($this->uid(), 'categoryRules', json_encode($clean));
		return new DataResponse($clean);
	}

	/**
	 * GET /api/settings/backup
	 * The same backup document the automatic pre-reset backup writes, for the
	 * "Download Backup" button. Secrets (token, PIN Lock, FX key) are inside
	 * but encrypted — see BackupService.
	 */
	#[NoCSRFRequired]
	#[NoAdminRequired]
	public function backup(): DataResponse {
		return new DataResponse($this->backupService->compose($this->uid(), 'manual-export'));
	}

	/** GET /api/token */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function getToken(): DataResponse {
		return new DataResponse(['token' => $this->settingsService->get($this->uid(), 'api_token', '')]);
	}

	/** POST /api/token/regenerate */
	#[CORS]
	#[NoAdminRequired]
	public function regenerateToken(): DataResponse {
		$token = bin2hex(random_bytes(32));
		$this->settingsService->set($this->uid(), 'api_token', $token);
		return new DataResponse(['token' => $token]);
	}

	/** GET /api/summary */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function summary(): DataResponse {
		$uid          = $this->uid();
		$accounts     = $this->accountService->findAll($uid);
		$currencies   = $this->currencyService->findAll($uid);
		$baseCurrency = $this->settingsService->get($uid, 'base_currency', 'USD');

		return new DataResponse([
			'baseCurrency'      => $baseCurrency,
			'totalAccounts'     => count($accounts),
			// COUNT(*) query — not a load of every transaction row just to count them.
			'totalTransactions' => $this->transactionService->countAll($uid),
			'currencies'        => $currencies,
		]);
	}

	/**
	 * POST /api/reset
	 * Permanently deletes ALL of the current user's FinTrack data
	 * (accounts, transactions, transfers, budgets, categories, currencies,
	 * recurring rules, and settings/tags/API token). Used by the
	 * "Reset All Data" button in Settings.
	 *
	 * Before anything is deleted, a full JSON snapshot of the user's data is
	 * written to their Nextcloud Files at /fintrack/backup/ so an accidental
	 * or regretted reset isn't unrecoverable. If that write fails for any
	 * reason (permissions, storage quota, etc.) the reset still proceeds —
	 * losing the safety copy shouldn't block a user-requested deletion — but
	 * the full backup payload is included in the response instead, so the
	 * frontend can fall back to offering it as a browser download.
	 */
	#[CORS]
	#[NoAdminRequired]
	public function reset(): DataResponse {
		$uid = $this->uid();

		$backupData = $this->backupService->compose($uid, 'pre-reset-backup');
		$backupPath = null;
		$backupError = null;
		try {
			$backupPath = $this->backupService->writeToFiles($uid, $backupData);
		} catch (\Throwable $e) {
			$backupError = $e->getMessage();
			$this->logger->warning('FinTrack: pre-reset backup to Files failed, falling back to client-side download: ' . $e->getMessage(), ['app' => 'fintrack']);
		}

		// Delete child/dependent records first, then parents.
		$this->transactionService->deleteAll($uid);
		$this->transferService->deleteAll($uid);
		$this->recurringService->deleteAll($uid);
		$this->budgetService->deleteAll($uid);
		$this->accountService->deleteAll($uid);
		$this->categoryService->deleteAll($uid);
		$this->currencyService->deleteAll($uid);
		$this->settingsService->deleteAll($uid);

		$response = ['status' => 'ok', 'backupPath' => $backupPath];
		if ($backupPath === null) {
			// Files-app backup didn't happen — hand the data back so the
			// browser can offer it as a downloadable .json file instead.
			$response['backupFallback'] = $backupData;
			$response['backupError'] = $backupError;
		}
		return new DataResponse($response);
	}

	/**
	 * POST /api/settings/restore
	 * Replaces ALL of the current user's FinTrack data with the contents of
	 * a previously exported JSON backup (see BackupService::compose() /
	 * "Download Backup"). This is the missing counterpart to reset(): until
	 * now "Restore Backup" only parsed the file into the browser's local
	 * copy of the data, which is never persisted in Nextcloud mode (state
	 * mutations go through the API, not local storage) — so the restore
	 * silently vanished on the next page load. This actually writes it to
	 * the database.
	 *
	 * Whatever is about to be overwritten is snapshotted to Files first
	 * (same safety net reset() uses), so restoring the wrong file isn't
	 * unrecoverable either.
	 *
	 * Only accounts carry an id that other rows depend on (transactions,
	 * transfers, recurring reference accountId; categories are referenced
	 * by name everywhere, so they need no remapping). Accounts are
	 * recreated first and an old-id -> new-id map is built from that, then
	 * used to fix up every account reference on the way back in. Rows that
	 * reference an account id missing from the backup are skipped rather
	 * than failing the whole restore.
	 */
	#[CORS]
	#[NoAdminRequired]
	public function restore(): DataResponse {
		$uid  = $this->uid();
		$body = $this->jsonBody();

		if (!isset($body['accounts']) || !is_array($body['accounts'])
			|| !isset($body['transactions']) || !is_array($body['transactions'])) {
			return new DataResponse(['error' => 'Invalid backup file'], 400);
		}

		// Safety snapshot of what's about to be replaced. If it can't be
		// written, stop here — nothing has been touched yet — rather than
		// wiping data with no way back.
		try {
			if ($this->backupService->writeToFiles($uid, $this->backupService->compose($uid, 'pre-restore-backup')) === null) {
				throw new \RuntimeException('Backup folder is not writable');
			}
		} catch (\Throwable $e) {
			$this->logger->warning('FinTrack: pre-restore backup to Files failed, restore aborted: ' . $e->getMessage(), ['app' => 'fintrack']);
			return new DataResponse(['error' => 'Restore aborted: could not save a safety backup of your current data to Nextcloud Files (' . $e->getMessage() . '). Nothing was changed.'], 500);
		}

		// What this install has right now (PIN Lock, token, FX key, lockout
		// counters) — captured before the wipe so restoring a backup can
		// never disable the PIN or change the token or API key.
		$current = [];
		foreach ($this->settingsService->getAll($uid) as $key => $value) {
			if (SettingsService::isPreservedOnRestore((string)$key)) {
				$current[(string)$key] = (string)$value;
			}
		}

		// The backup's encrypted secrets are opened here. They only FILL GAPS
		// (e.g. after "Reset All Data" or on a fresh install); anything this
		// install already has is kept. If the envelope can't be opened
		// (another instance's backup, damaged file) the data still restores.
		$backupSecrets   = $this->backupService->openSecrets($body['secrets'] ?? null);
		$secretsPresent  = is_array($body['secrets'] ?? null);
		$finalSecrets    = $this->backupService->mergeForRestore($current, $backupSecrets);
		$secretsRestored = array_keys(array_diff_assoc($finalSecrets, $current));

		// Final settings map built in PHP so each key is written exactly once
		// (no duplicate-key INSERT inside the transaction). Plain `settings`
		// from the file never carry lock_*/api_token (older backups that still
		// hold them in plain text are ignored); a plain-text FX key from an
		// old backup is used only if nothing else provides one.
		$backupSettings = is_array($body['settings'] ?? null) ? $body['settings'] : [];
		$newSettings = [];
		foreach ($backupSettings as $key => $value) {
			$key = (string)$key;
			if (str_starts_with($key, 'lock_') || $key === 'api_token' || $key === 'exchangerate_host_api_key_set' || is_array($value) || is_object($value)) {
				continue;
			}
			$newSettings[$key] = (string)$value;
		}
		foreach ($finalSecrets as $key => $value) {
			if ($key === 'exchangerate_host_api_key' && trim($value) === '' && isset($newSettings[$key])) {
				continue;
			}
			$newSettings[$key] = $value;
		}

		// Oldest first, so ids/ordering come back chronological. Currency rates
		// come from the backup's currency table (restored below) — importing a
		// transaction never rewrites them, so no transaction's rate "wins".
		$byDateAsc = static function (array $x, array $y): int {
			return [(string)($x['date'] ?? ''), (int)($x['id'] ?? 0)] <=> [(string)($y['date'] ?? ''), (int)($y['id'] ?? 0)];
		};
		$transactions = array_values(array_filter($body['transactions'], 'is_array'));
		usort($transactions, $byDateAsc);
		$transfers = array_values(array_filter((array)($body['transfers'] ?? []), 'is_array'));
		usort($transfers, $byDateAsc);

		$accountIdMap = [];
		$txCount = 0;

		// All-or-nothing: the wipe and the re-import share one DB transaction,
		// so a failure part-way rolls back to the untouched data.
		$this->db->beginTransaction();
		try {
			// Wipe existing data first — same child-before-parent order reset() uses.
			$this->transactionService->deleteAll($uid);
			$this->transferService->deleteAll($uid);
			$this->recurringService->deleteAll($uid);
			$this->budgetService->deleteAll($uid);
			$this->accountService->deleteAll($uid);
			$this->categoryService->deleteAll($uid);
			$this->currencyService->deleteAll($uid);
			$this->settingsService->deleteAll($uid);

			// Currencies and categories carry no foreign keys of their own.
			foreach (($body['currencies'] ?? []) as $c) {
				$this->currencyService->create($uid, $c);
			}
			foreach (($body['categories'] ?? []) as $c) {
				$this->categoryService->create($uid, $c);
			}

			// Accounts get new ids on insert — map old -> new so every other
			// entity below can be repointed at the right account.
			foreach ($body['accounts'] as $a) {
				$created = $this->accountService->create($uid, $a);
				if (isset($a['id'])) {
					$accountIdMap[(int)$a['id']] = $created['id'];
				}
			}

			foreach ($transactions as $t) {
				$newAccountId = $accountIdMap[(int)($t['accountId'] ?? 0)] ?? null;
				if ($newAccountId === null) {
					continue;
				}
				$t['accountId'] = $newAccountId;
				unset($t['updateCurrencyRate']);
				$this->transactionService->create($uid, $t);
				$txCount++;
			}

			foreach ($transfers as $t) {
				$fromId = $accountIdMap[(int)($t['fromAccountId'] ?? 0)] ?? null;
				$toId   = $accountIdMap[(int)($t['toAccountId'] ?? 0)] ?? null;
				if ($fromId === null || $toId === null) {
					continue;
				}
				$t['fromAccountId'] = $fromId;
				$t['toAccountId']   = $toId;
				try {
					$this->transferService->create($uid, $t);
				} catch (\InvalidArgumentException $e) {
					// Skip malformed rows instead of aborting a restore mid-way.
					$this->logger->warning('FinTrack: skipped invalid transfer in restore: ' . $e->getMessage(), ['app' => 'fintrack']);
				}
			}

			foreach (($body['budgets'] ?? []) as $b) {
				$this->budgetService->create($uid, $b);
			}

			foreach (($body['recurring'] ?? []) as $r) {
				$newAccountId = $accountIdMap[(int)($r['accountId'] ?? 0)] ?? null;
				if ($newAccountId === null) {
					continue;
				}
				$r['accountId'] = $newAccountId;
				$this->recurringService->create($uid, $r);
			}

			foreach ($newSettings as $key => $value) {
				$this->settingsService->set($uid, (string)$key, $value);
			}

			$this->db->commit();
		} catch (\Throwable $e) {
			$this->db->rollBack();
			$this->logger->error('FinTrack: restore failed and was rolled back: ' . $e->getMessage(), ['app' => 'fintrack']);
			return new DataResponse(['error' => 'Restore failed and was rolled back; your existing data is unchanged. (' . $e->getMessage() . ')'], 500);
		}

		return new DataResponse([
			'status'   => 'ok',
			'imported' => [
				'accounts'     => count($accountIdMap),
				'transactions' => $txCount,
			],
			// Which secrets came back from the backup (names only, never values).
			'secretsRestored'  => array_values($secretsRestored),
			// True when the file had a secrets envelope this instance couldn't open.
			'secretsUnreadable' => $secretsPresent && $backupSecrets === [],
		]);
	}
}
