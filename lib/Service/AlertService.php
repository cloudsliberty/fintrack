<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

use OCA\FinTrack\AppInfo\Application;
use OCP\Notification\IManager as INotificationManager;
use Psr\Log\LoggerInterface;

/**
 * Sends and clears the per-user Nextcloud alerts (entries in the
 * notification bell) FinTrack raises:
 *
 * - "recurring_due": a recurring transaction reached its trigger date.
 * - "transaction_reminder": a custom reminder date set on any transaction
 *   (money lent/borrowed, upcoming bill, recharge ...) arrived.
 *
 * Rendering lives in Notification\Notifier. Every method swallows failures
 * (notifications app disabled, DB hiccup ...) and logs them: an alert that
 * can't be sent must never break posting a recurring transaction or saving
 * a transaction.
 */
class AlertService {

	public function __construct(
		private INotificationManager $notificationManager,
		private LoggerInterface $logger,
	) {
	}

	/**
	 * @param array $rule raw fintrack_recurring row (needs id, name, amount, currency, next_date)
	 */
	public function notifyRecurringDue(string $userId, array $rule): bool {
		try {
			$dueTs = (int)$rule['next_date'];
			$notification = $this->notificationManager->createNotification();
			$notification->setApp(Application::APP_ID)
				->setUser($userId)
				->setDateTime(new \DateTime())
				// One alert per occurrence: rule id + the due date it fired for.
				->setObject('recurring_due', $rule['id'] . ':' . $dueTs)
				->setSubject('recurring_due', [
					'name'     => (string)$rule['name'],
					// What the posted transaction is called (post() uses description, else name).
					'description' => (string)(($rule['description'] ?? '') !== '' ? $rule['description'] : $rule['name']),
					'amount'   => (float)$rule['amount'],
					'currency' => (string)$rule['currency'],
					'type'     => (string)($rule['type'] ?? 'expense'),
					'date'     => date('Y-m-d', $dueTs),
				]);
			$this->notificationManager->notify($notification);
			return true;
		} catch (\Throwable $e) {
			$this->logger->warning('FinTrack: could not send recurring alert for #{id}: {msg}', [
				'id' => $rule['id'] ?? '?', 'msg' => $e->getMessage(), 'app' => Application::APP_ID,
			]);
			return false;
		}
	}

	/**
	 * @param array $tx raw fintrack_transactions row (needs id, description, amount, currency, reminder_date)
	 */
	public function notifyTransactionReminder(string $userId, array $tx): bool {
		try {
			$notification = $this->notificationManager->createNotification();
			$notification->setApp(Application::APP_ID)
				->setUser($userId)
				->setDateTime(new \DateTime())
				->setObject('transaction_reminder', (string)$tx['id'])
				->setSubject('transaction_reminder', [
					'description' => (string)($tx['description'] ?? ''),
					'amount'      => (float)$tx['amount'],
					'currency'    => (string)$tx['currency'],
					'type'        => (string)($tx['type'] ?? 'expense'),
					'date'        => date('Y-m-d', (int)$tx['date']),
				]);
			$this->notificationManager->notify($notification);
			return true;
		} catch (\Throwable $e) {
			$this->logger->warning('FinTrack: could not send reminder alert for transaction #{id}: {msg}', [
				'id' => $tx['id'] ?? '?', 'msg' => $e->getMessage(), 'app' => Application::APP_ID,
			]);
			return false;
		}
	}

	/** Removes any pending reminder alert for a transaction (deleted, or reminder cleared/changed). */
	public function clearTransactionReminder(int $transactionId): void {
		try {
			$notification = $this->notificationManager->createNotification();
			$notification->setApp(Application::APP_ID)->setObject('transaction_reminder', (string)$transactionId);
			$this->notificationManager->markProcessed($notification);
		} catch (\Throwable $e) {
			// Best effort only.
		}
	}
}
