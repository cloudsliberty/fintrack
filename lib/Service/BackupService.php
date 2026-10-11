<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Security\ICrypto;
use Psr\Log\LoggerInterface;

/**
 * Builds, writes and reads FinTrack backup files.
 *
 * A backup is one JSON document holding all of a user's data. Secrets —
 * the External Access token, the PIN Lock (hashes, reset question, timeout)
 * and the exchangerate.host API key — ARE included, but never in plain text:
 * they are sealed into a single `secrets` envelope encrypted with Nextcloud's
 * ICrypto (authenticated encryption keyed from this instance's `secret` in
 * config.php). The rest of the file is plain JSON, so only the secrets need
 * the instance key.
 *
 * Consequences worth knowing:
 *  - A backup restored on the SAME instance recovers its secrets.
 *  - On another instance (different config.php secret) or if the envelope is
 *    damaged, the data still restores; the secrets just can't be opened and
 *    are skipped (see openSecrets()).
 *  - Treat the file as sensitive anyway: the data itself is unencrypted.
 */
class BackupService {

	public const FORMAT_VERSION = 2;

	/** Settings that make up the sealed `secrets` envelope. */
	public const SEALED_KEYS = [
		'api_token',
		'exchangerate_host_api_key',
		'lock_enabled',
		'lock_password_hash',
		'lock_reset_question',
		'lock_reset_answer_hash',
		'lock_timeout_minutes',
	];

	/** The PIN Lock settings; restored together or not at all. */
	private const LOCK_GROUP = [
		'lock_enabled', 'lock_password_hash', 'lock_reset_question',
		'lock_reset_answer_hash', 'lock_timeout_minutes',
	];

	public function __construct(
		private AccountService $accountService,
		private TransactionService $transactionService,
		private TransferService $transferService,
		private BudgetService $budgetService,
		private CategoryService $categoryService,
		private CurrencyService $currencyService,
		private RecurringService $recurringService,
		private SettingsService $settingsService,
		private IRootFolder $rootFolder,
		private ICrypto $crypto,
		private LoggerInterface $logger,
	) {
	}

	/**
	 * Every piece of the user's data as one array, ready to be JSON-encoded.
	 * $reason says why it was made (manual-export, pre-reset-backup, ...).
	 */
	public function compose(string $uid, string $reason): array {
		$all = $this->settingsService->getAll($uid);

		// Everything except secrets and live lockout counters goes in the
		// open `settings` block. Lock counters (failed attempts, locked
		// until) are install state, not data — restoring a stale lockout
		// would be wrong.
		$settings = [];
		foreach ($all as $key => $value) {
			$key = (string)$key;
			if (in_array($key, self::SEALED_KEYS, true) || str_starts_with($key, 'lock_')) {
				continue;
			}
			$settings[$key] = $value;
		}

		$secrets = [];
		foreach (self::SEALED_KEYS as $key) {
			if (isset($all[$key]) && (string)$all[$key] !== '') {
				$secrets[$key] = (string)$all[$key];
			}
		}

		return [
			'backupFormat' => self::FORMAT_VERSION,
			'exportedAt'   => date('c'),
			'reason'       => $reason,
			'accounts'     => $this->accountService->findAll($uid),
			'transactions' => $this->transactionService->findAll($uid, ['limit' => 0]),
			'transfers'    => $this->transferService->findAll($uid),
			'budgets'      => $this->budgetService->findAll($uid),
			'categories'   => $this->categoryService->findAll($uid),
			'currencies'   => $this->currencyService->findAll($uid),
			'recurring'    => $this->recurringService->findAll($uid),
			'settings'     => $settings,
			'secrets'      => $this->seal($secrets),
		];
	}

	/** Encrypts the secrets map into the envelope stored in the backup file. */
	public function seal(array $secrets): ?array {
		if ($secrets === []) {
			return null;
		}
		return [
			'v'    => 1,
			'alg'  => 'nextcloud-icrypto',
			'data' => $this->crypto->encrypt((string)json_encode($secrets)),
		];
	}

	/**
	 * Decrypts a backup's `secrets` envelope. Returns only allowlisted keys
	 * with string values; an empty array if there is no envelope or it can't
	 * be opened (other instance, tampered, unknown version). Never throws.
	 */
	public function openSecrets(mixed $envelope): array {
		if (!is_array($envelope) || (int)($envelope['v'] ?? 0) !== 1 || !is_string($envelope['data'] ?? null)) {
			return [];
		}
		try {
			$decoded = json_decode($this->crypto->decrypt($envelope['data']), true);
		} catch (\Throwable $e) {
			$this->logger->warning('FinTrack: backup secrets could not be decrypted (different instance or damaged file): ' . $e->getMessage(), ['app' => 'fintrack']);
			return [];
		}
		if (!is_array($decoded)) {
			return [];
		}
		$out = [];
		foreach (self::SEALED_KEYS as $key) {
			if (isset($decoded[$key]) && is_string($decoded[$key]) && $decoded[$key] !== '') {
				$out[$key] = $decoded[$key];
			}
		}
		return $out;
	}

	/**
	 * Which secrets a restore should end up with. The install's CURRENT
	 * secrets always win — restoring a backup never changes your PIN,
	 * token or API key. The backup only fills what is missing (typically
	 * after "Reset All Data", or on a fresh install):
	 *   - api_token / FX key: taken from the backup if none is set;
	 *   - PIN Lock: taken from the backup as one group, and only if no PIN
	 *     is set now.
	 *
	 * @param array $current  secrets/lock settings the install has right now
	 * @param array $fromBackup  result of openSecrets()
	 */
	public function mergeForRestore(array $current, array $fromBackup): array {
		$result = $current;
		foreach (['api_token', 'exchangerate_host_api_key'] as $key) {
			if (trim((string)($result[$key] ?? '')) === '' && isset($fromBackup[$key])) {
				$result[$key] = $fromBackup[$key];
			}
		}
		if (trim((string)($result['lock_password_hash'] ?? '')) === ''
			&& isset($fromBackup['lock_password_hash'])) {
			foreach (self::LOCK_GROUP as $key) {
				if (isset($fromBackup[$key])) {
					$result[$key] = $fromBackup[$key];
				}
			}
		}
		return $result;
	}

	/**
	 * Writes the backup JSON to /fintrack/backup/ in the user's own
	 * Nextcloud Files (created on first use). Returns the path of the
	 * created file (relative to the user's root), or null if it could not
	 * be written. May throw on storage errors; callers treat a throw and a
	 * null the same way.
	 */
	public function writeToFiles(string $uid, array $data): ?string {
		$userFolder = $this->rootFolder->getUserFolder($uid);

		$appFolder = $userFolder->nodeExists('fintrack')
			? $userFolder->get('fintrack')
			: $userFolder->newFolder('fintrack');
		if (!($appFolder instanceof Folder)) {
			return null;
		}

		$backupFolder = $appFolder->nodeExists('backup')
			? $appFolder->get('backup')
			: $appFolder->newFolder('backup');
		if (!($backupFolder instanceof Folder)) {
			return null;
		}

		$json = json_encode($data, JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE);
		if ($json === false) {
			return null;
		}

		$filename = 'fintrack-backup-' . date('Y-m-d-His') . '.json';
		$backupFolder->newFile($filename)->putContent($json);

		return '/fintrack/backup/' . $filename;
	}
}
