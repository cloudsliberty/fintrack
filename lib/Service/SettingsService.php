<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCP\DB\QueryBuilder\IQueryBuilder;

class SettingsService extends BaseService {

	/**
	 * Keys a client may write through POST /api/settings. Everything else
	 * (lock_* state, api_token, cached FX rates, tags, category rules, ...)
	 * is owned by a dedicated endpoint or by server code and must not be
	 * settable from the generic endpoint.
	 */
	public const CLIENT_WRITABLE_KEYS = [
		'date_format', 'week_start', 'fy_month', 'default_tx_type',
		'base_currency', 'exchangerate_host_api_key',
		'pwa_enabled', 'pwa_data_retention_days',
		'pin_protect_export_csv', 'pin_protect_import_csv', 'pin_protect_trash',
		'external_lock_enabled',
		'first_use_date', 'last_special_date_shown', 'last_seen_version',
		'last_anniversary_shown', 'last_donation_reminder_ym',
		'telemetry_country', 'telemetry_monthly_enabled',
	];

	/** Per-currency provider preference, e.g. fx_api_pref_SAR. */
	private const CLIENT_WRITABLE_PATTERN = '/^fx_api_pref_[A-Za-z0-9_-]{1,16}$/';

	/** Never returned by GET /api/settings. (Backups carry them too, but only encrypted — see BackupService.) */
	public const SECRET_KEYS = [
		'api_token',
		'lock_password_hash',
		'lock_reset_answer_hash',
		'exchangerate_host_api_key',
	];

	public static function isClientWritable(string $key): bool {
		return in_array($key, self::CLIENT_WRITABLE_KEYS, true)
			|| preg_match(self::CLIENT_WRITABLE_PATTERN, $key) === 1;
	}

	/** True for settings that must survive a restore untouched (lock state, tokens, FX key). */
	public static function isPreservedOnRestore(string $key): bool {
		return str_starts_with($key, 'lock_') || in_array($key, self::SECRET_KEYS, true);
	}

	/**
	 * Settings safe to hand to a client or write to a backup file: secrets
	 * removed. Adds exchangerate_host_api_key_set ('1'/'0') so the UI can
	 * show whether a key is stored without ever receiving it.
	 */
	public function getAllRedacted(string $userId): array {
		$all    = $this->getAll($userId);
		$hasKey = trim((string)($all['exchangerate_host_api_key'] ?? '')) !== '';
		foreach (self::SECRET_KEYS as $key) {
			unset($all[$key]);
		}
		$all['exchangerate_host_api_key_set'] = $hasKey ? '1' : '0';
		return $all;
	}

	protected function tableName(): string {
		return 'fintrack_settings';
	}

	public function get(string $userId, string $key, string $default = ''): string {
		$qb = $this->qb();
		$qb->select('value')->from('fintrack_settings')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->eq('key', $qb->createNamedParameter($key)));
		$result = $qb->executeQuery();
		$row    = $result->fetch();
		$result->closeCursor();
		return $row ? (string)$row['value'] : $default;
	}

	/**
	 * Upsert a single setting value.
	 *
	 * Previous implementation tried an UPDATE first and only INSERTed when the
	 * UPDATE reported 0 affected rows. That is unsafe: MySQL/MariaDB (mysqli
	 * without CLIENT_FOUND_ROWS) report the number of rows *changed*, not the
	 * number of rows *matched*. Re-saving a setting with the same value it
	 * already had — e.g. clicking "Save" on the settings page without editing
	 * anything — makes the UPDATE report 0 affected rows even though the row
	 * exists, so the code then tried to INSERT a duplicate row and hit the
	 * (user_id, key) unique constraint, throwing an exception and surfacing as
	 * "Error" when saving settings.
	 *
	 * We instead try the INSERT first and, if it fails specifically because
	 * the row already exists (unique constraint violation), fall back to an
	 * UPDATE. This is correct regardless of the DB driver's affected-row
	 * semantics.
	 */
	public function set(string $userId, string $key, string $value): void {
		// Existence is checked with a SELECT first so the normal path never
		// raises a constraint violation — that matters inside a DB
		// transaction (SettingsController::restore()), where on PostgreSQL a
		// failed INSERT would abort the whole transaction. The catch below
		// only covers a concurrent writer winning the race.
		if ($this->exists($userId, $key)) {
			$this->update($userId, $key, $value);
			return;
		}
		try {
			$qb = $this->qb();
			$qb->insert('fintrack_settings')->values([
				'user_id' => $qb->createNamedParameter($userId),
				'key'     => $qb->createNamedParameter($key),
				'value'   => $qb->createNamedParameter($value),
			]);
			$qb->executeStatement();
		} catch (\OCP\DB\Exception $e) {
			if ($e->getReason() !== \OCP\DB\Exception::REASON_UNIQUE_CONSTRAINT_VIOLATION) {
				throw $e;
			}
			$this->update($userId, $key, $value);
		}
	}

	private function exists(string $userId, string $key): bool {
		$qb = $this->qb();
		$qb->select('key')->from('fintrack_settings')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->eq('key', $qb->createNamedParameter($key)))
		   ->setMaxResults(1);
		$result = $qb->executeQuery();
		$row = $result->fetch();
		$result->closeCursor();
		return $row !== false;
	}

	private function update(string $userId, string $key, string $value): void {
		$qb = $this->qb();
		$qb->update('fintrack_settings')
		   ->set('value', $qb->createNamedParameter($value))
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
		   ->andWhere($qb->expr()->eq('key', $qb->createNamedParameter($key)));
		$qb->executeStatement();
	}

	public function getAll(string $userId): array {
		$qb = $this->qb();
		$qb->select('key', 'value')->from('fintrack_settings')
		   ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
		$result = $qb->executeQuery();
		$out    = [];
		while ($row = $result->fetch()) {
			$out[$row['key']] = $row['value'];
		}
		$result->closeCursor();
		return $out;
	}
}
