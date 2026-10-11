<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCA\FinTrack\Exception\LockedOutException;
use OCA\FinTrack\AppInfo\Application;
use OCA\FinTrack\Db\PinResetRequest;
use OCA\FinTrack\Db\PinResetRequestMapper;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\IGroupManager;
use OCP\Notification\IManager as INotificationManager;

/**
 * A lightweight PIN/passphrase gate that sits *on top of* Nextcloud's own
 * authentication — it does not replace it. Nextcloud already required a full
 * login to reach this app; this adds a second, app-local check (with its own
 * inactivity timeout and lockout after repeated failures) for people who
 * share a logged-in Nextcloud session/device and want their finances behind
 * one more layer, e.g. a shared family tablet that stays logged into
 * Nextcloud all day.
 *
 * The PIN itself is never stored in plain text — only a password_hash() of
 * it — and verification always happens server-side; the client never gets
 * to decide "was that PIN correct".
 */
class LockService {

	private const MAX_ATTEMPTS = 5;
	private const LOCKOUT_SECONDS = 15 * 60; // 15 minutes
	private const DEFAULT_TIMEOUT_MINUTES = 10;

	public function __construct(
		private SettingsService $settings,
		private PinResetRequestMapper $resetRequestMapper,
		private IGroupManager $groupManager,
		private INotificationManager $notificationManager,
	) {
	}

	public function status(string $userId): array {
		$enabled = $this->settings->get($userId, 'lock_enabled', '0') === '1';
		$lockedUntil = (int)$this->settings->get($userId, 'lock_locked_until', '0');
		return [
			'enabled'           => $enabled,
			'timeoutMinutes'    => (int)$this->settings->get($userId, 'lock_timeout_minutes', (string)self::DEFAULT_TIMEOUT_MINUTES),
			'lockedUntil'       => $lockedUntil > time() ? $lockedUntil : null,
			// Whether this user currently has an outstanding "Request Admin
			// Approval to Reset PIN" request awaiting action — lets the lock
			// screen show "request sent" instead of the button again.
			'pendingAdminReset' => $this->resetRequestMapper->findPendingForUser($userId) !== null,
		];
	}

	/**
	 * Sets or changes the PIN/passphrase. If a PIN is already configured, the
	 * caller must supply the correct current PIN as $currentPassword — this
	 * stops someone from silently swapping out the lock on an already-open
	 * session without knowing the existing PIN.
	 *
	 * $resetQuestion/$resetAnswer are optional and only written when a
	 * non-empty value is supplied, so leaving them blank on an update keeps
	 * whatever was set before. The answer is hashed the same way as the PIN
	 * itself — it's never stored or compared in plain text — and compared
	 * case-insensitively/trimmed so small differences in capitalization or
	 * stray whitespace don't lock someone out of their own reset flow.
	 */
	public function setup(
		string $userId,
		string $newPassword,
		?string $currentPassword,
		int $timeoutMinutes,
		?string $resetQuestion = null,
		?string $resetAnswer = null,
	): array {
		if (strlen($newPassword) < 4) {
			throw new \InvalidArgumentException('PIN/passphrase must be at least 4 characters');
		}
		$existingHash = $this->settings->get($userId, 'lock_password_hash', '');
		if ($existingHash !== '') {
			if ($currentPassword === null || !password_verify($currentPassword, $existingHash)) {
				throw new \InvalidArgumentException('Current PIN is required to change it');
			}
		}
		$this->settings->set($userId, 'lock_password_hash', password_hash($newPassword, PASSWORD_DEFAULT));
		$this->settings->set($userId, 'lock_enabled', '1');
		$this->settings->set($userId, 'lock_timeout_minutes', (string)max(1, $timeoutMinutes));
		if ($resetQuestion !== null && trim($resetQuestion) !== '') {
			$this->settings->set($userId, 'lock_reset_question', trim($resetQuestion));
		}
		if ($resetAnswer !== null && trim($resetAnswer) !== '') {
			$normalized = mb_strtolower(trim($resetAnswer));
			$this->settings->set($userId, 'lock_reset_answer_hash', password_hash($normalized, PASSWORD_DEFAULT));
		}
		$this->clearFailedAttempts($userId);
		return $this->status($userId);
	}

	public function disable(string $userId, string $currentPassword): array {
		$existingHash = $this->settings->get($userId, 'lock_password_hash', '');
		if ($existingHash !== '' && !password_verify($currentPassword, $existingHash)) {
			throw new \InvalidArgumentException('Incorrect PIN');
		}
		$this->settings->set($userId, 'lock_enabled', '0');
		$this->settings->set($userId, 'lock_password_hash', '');
		$this->clearFailedAttempts($userId);
		return $this->status($userId);
	}

	/**
	 * @return array{ok:bool} on success
	 * @throws \RuntimeException with code 423 semantics (locked out) or 401 (wrong PIN)
	 */
	public function verify(string $userId, string $password): array {
		$lockedUntil = (int)$this->settings->get($userId, 'lock_locked_until', '0');
		if ($lockedUntil > time()) {
			throw new LockedOutException($lockedUntil);
		}

		$hash = $this->settings->get($userId, 'lock_password_hash', '');
		if ($hash === '' || !password_verify($password, $hash)) {
			$attempts = (int)$this->settings->get($userId, 'lock_failed_attempts', '0') + 1;
			$this->settings->set($userId, 'lock_failed_attempts', (string)$attempts);
			if ($attempts >= self::MAX_ATTEMPTS) {
				$until = time() + self::LOCKOUT_SECONDS;
				$this->settings->set($userId, 'lock_locked_until', (string)$until);
				$this->settings->set($userId, 'lock_failed_attempts', '0');
				throw new LockedOutException($until);
			}
			throw new \InvalidArgumentException('Incorrect PIN (' . (self::MAX_ATTEMPTS - $attempts) . ' attempt(s) left before a 15-minute lockout)');
		}

		$this->clearFailedAttempts($userId);
		// A successful PIN entry means the person got back in on their own —
		// any outstanding "Request Admin Approval to Reset PIN" request is now
		// moot. See cancelPendingReset() / the State Safeguard note there.
		$this->cancelPendingReset($userId);
		return ['ok' => true];
	}

	/**
	 * Returns the configured "forgot PIN" security question for this user, or
	 * null if none was ever set (in which case the "Forgot PIN?" link on the
	 * lock screen has nothing to fall back to and shouldn't be offered).
	 */
	public function getResetQuestion(string $userId): ?string {
		$q = $this->settings->get($userId, 'lock_reset_question', '');
		return $q !== '' ? $q : null;
	}

	/**
	 * Verifies the answer to the security question and, if correct, disables
	 * the PIN lock entirely (same end-state as LockService::disable()) so the
	 * person can get back into the app and set a fresh PIN from Settings —
	 * mirroring a typical "forgot password" reset flow. Uses its own attempt
	 * counter/lockout, separate from the PIN's own, so someone locked out of
	 * PIN attempts isn't also blocked from a legitimate reset, and vice versa.
	 *
	 * @return array{ok:bool}
	 * @throws LockedOutException|\InvalidArgumentException
	 */
	public function verifyResetAnswer(string $userId, string $answer): array {
		$lockedUntil = (int)$this->settings->get($userId, 'lock_reset_locked_until', '0');
		if ($lockedUntil > time()) {
			throw new LockedOutException($lockedUntil);
		}

		$hash = $this->settings->get($userId, 'lock_reset_answer_hash', '');
		$normalized = mb_strtolower(trim($answer));
		if ($hash === '' || $normalized === '' || !password_verify($normalized, $hash)) {
			$attempts = (int)$this->settings->get($userId, 'lock_reset_failed_attempts', '0') + 1;
			$this->settings->set($userId, 'lock_reset_failed_attempts', (string)$attempts);
			if ($attempts >= self::MAX_ATTEMPTS) {
				$until = time() + self::LOCKOUT_SECONDS;
				$this->settings->set($userId, 'lock_reset_locked_until', (string)$until);
				$this->settings->set($userId, 'lock_reset_failed_attempts', '0');
				throw new LockedOutException($until);
			}
			throw new \InvalidArgumentException('Incorrect answer (' . (self::MAX_ATTEMPTS - $attempts) . ' attempt(s) left before a 15-minute lockout)');
		}

		// Correct answer — reset attempt counters for both the PIN and the
		// security question, then drop the PIN lock so the person can log
		// back in and set a new one.
		$this->settings->set($userId, 'lock_reset_failed_attempts', '0');
		$this->settings->set($userId, 'lock_reset_locked_until', '0');
		$this->settings->set($userId, 'lock_enabled', '0');
		$this->settings->set($userId, 'lock_password_hash', '');
		$this->clearFailedAttempts($userId);
		// Same reasoning as verify(): the person is back in on their own now,
		// via the security question, so any pending admin request is moot.
		$this->cancelPendingReset($userId);
		return ['ok' => true];
	}

	/**
	 * The "Request Admin Approval to Reset PIN" flow — a last-resort fallback
	 * for someone locked out of App Lock with no security question set (or
	 * who's forgotten the answer to it too). Files a pending request, visible
	 * to admins under Admin Settings → FinTrack, and notifies every member of
	 * the "admin" group via Nextcloud's normal notification system.
	 *
	 * Idempotent: a user only ever has one outstanding request at a time —
	 * calling this again while one is already pending just returns the
	 * current status without filing a duplicate or re-notifying admins.
	 */
	public function requestAdminReset(string $userId, string $displayName): array {
		if ($this->resetRequestMapper->findPendingForUser($userId) === null) {
			$request = new PinResetRequest();
			$request->setUserId($userId);
			$request->setDisplayName($displayName);
			$request->setStatus('pending');
			$request->setCreatedAt(time());
			$request = $this->resetRequestMapper->insert($request);
			$this->notifyAdmins($userId, $displayName, (int)$request->getId());
		}
		return $this->status($userId);
	}

	/**
	 * State Safeguard: if the person gets back into the app on their own —
	 * correct PIN (verify()) or correct security-question answer
	 * (verifyResetAnswer()) — while a "Request Admin Approval to Reset PIN"
	 * request is still pending, that request is no longer needed. Cancelling
	 * it here (rather than leaving it pending forever) also clears the
	 * corresponding Nextcloud notification from admins' bell icon, and
	 * removes the row from the Admin Settings queue.
	 */
	public function cancelPendingReset(string $userId): void {
		$request = $this->resetRequestMapper->findPendingForUser($userId);
		if ($request !== null) {
			$request->setStatus('cancelled');
			$request->setResolvedAt(time());
			$this->resetRequestMapper->update($request);
			$this->clearRequestNotifications((int)$request->getId());
		}
	}

	/** @return PinResetRequest[] pending requests, oldest first, for the Admin Settings queue */
	public function listPendingRequests(): array {
		return $this->resetRequestMapper->findAllPending();
	}

	/**
	 * Admin-side "Approve & Clear PIN" action. Deletes the PIN hash for the
	 * requesting user (same end-state as disable()/verifyResetAnswer()) and
	 * marks the request resolved. The user can log in to FinTrack normally
	 * afterwards and set a fresh PIN from Settings → App Lock if they want one.
	 *
	 * @return array{ok:bool, userId:string}
	 * @throws \InvalidArgumentException if the request doesn't exist or was already resolved
	 */
	public function approveRequest(int $requestId): array {
		try {
			$request = $this->resetRequestMapper->findById($requestId);
		} catch (DoesNotExistException $e) {
			throw new \InvalidArgumentException('This request no longer exists');
		}
		if ($request->getStatus() !== 'pending') {
			throw new \InvalidArgumentException('This request has already been resolved');
		}

		$userId = $request->getUserId();
		$this->settings->set($userId, 'lock_enabled', '0');
		$this->settings->set($userId, 'lock_password_hash', '');
		$this->clearFailedAttempts($userId);
		// Also lift any security-question lockout, so the user isn't left
		// unable to set a fresh question/answer pair for another 15 minutes.
		$this->settings->set($userId, 'lock_reset_failed_attempts', '0');
		$this->settings->set($userId, 'lock_reset_locked_until', '0');

		$request->setStatus('approved');
		$request->setResolvedAt(time());
		$this->resetRequestMapper->update($request);
		$this->clearRequestNotifications($requestId);

		return ['ok' => true, 'userId' => $userId];
	}

	/** Notifies every member of the "admin" group about a new pending request. */
	private function notifyAdmins(string $userId, string $displayName, int $requestId): void {
		$adminGroup = $this->groupManager->get('admin');
		if ($adminGroup === null) {
			return;
		}
		$subjectName = $displayName !== '' ? $displayName : $userId;
		foreach ($adminGroup->getUsers() as $admin) {
			$notification = $this->notificationManager->createNotification();
			$notification->setApp(Application::APP_ID)
				->setUser($admin->getUID())
				->setDateTime(new \DateTime())
				->setObject('pin_reset_request', (string)$requestId)
				->setSubject('pin_reset_request', ['username' => $subjectName]);
			$this->notificationManager->notify($notification);
		}
	}

	/** Removes the Nextcloud notification(s) tied to a request once it's resolved (approved or cancelled). */
	private function clearRequestNotifications(int $requestId): void {
		$notification = $this->notificationManager->createNotification();
		$notification->setApp(Application::APP_ID)->setObject('pin_reset_request', (string)$requestId);
		$this->notificationManager->markProcessed($notification);
	}

	private function clearFailedAttempts(string $userId): void {
		$this->settings->set($userId, 'lock_failed_attempts', '0');
		$this->settings->set($userId, 'lock_locked_until', '0');
	}
}
