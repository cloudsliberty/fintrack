<?php

declare(strict_types=1);

namespace OCA\FinTrack\Notification;

use OCA\FinTrack\AppInfo\Application;
use OCP\IURLGenerator;
use OCP\L10N\IFactory;
use OCP\Notification\INotification;
use OCP\Notification\INotifier;

/**
 * Turns FinTrack's raw notifications into the human-readable text/icon/link
 * shown in the notification bell:
 * - "pin_reset_request" (LockService::notifyAdmins()) — "User [Username] has
 *   requested to revoke their FinTrack PIN access." (admins only)
 * - "recurring_due" (AlertService::notifyRecurringDue()) — a recurring
 *   transaction reached its trigger date.
 * - "transaction_reminder" (AlertService::notifyTransactionReminder()) — a
 *   custom reminder date set on a transaction arrived.
 */
class Notifier implements INotifier {

	public function __construct(
		private IFactory $l10nFactory,
		private IURLGenerator $urlGenerator,
	) {
	}

	public function getID(): string {
		return Application::APP_ID;
	}

	public function getName(): string {
		return 'FinTrack';
	}

	/** @throws \InvalidArgumentException when this notifier can't handle the given notification, per the INotifier contract */
	public function prepare(INotification $notification, string $languageCode): INotification {
		if ($notification->getApp() !== Application::APP_ID) {
			throw new \InvalidArgumentException('Notification not from FinTrack');
		}

		$subject = $notification->getSubject();
		if (!in_array($subject, ['pin_reset_request', 'recurring_due', 'transaction_reminder'], true)) {
			throw new \InvalidArgumentException('Unknown FinTrack notification subject');
		}

		$l = $this->l10nFactory->get(Application::APP_ID, $languageCode);
		$params = $notification->getSubjectParameters();
		$icon = $this->urlGenerator->getAbsoluteURL(
			$this->urlGenerator->imagePath(Application::APP_ID, 'app.svg')
		);
		$notification->setIcon($icon);

		if ($subject === 'recurring_due') {
			$text   = trim((string)($params['description'] ?? '')) ?: trim((string)($params['name'] ?? ''));
			$amount = number_format((float)($params['amount'] ?? 0), 2) . ' ' . ($params['currency'] ?? '');
			// "FinTrack: <description> (<amount>)" — the prefix tells the
			// bell entry's source at a glance. Notifications already stored
			// before the upgrade pick this up too, since they're rendered on read.
			$notification->setParsedSubject(
				'FinTrack: ' . ($text !== '' ? $text : $l->t('Untitled')) . ' (' . trim($amount) . ')'
			);
			$notification->setLink($this->urlGenerator->linkToRouteAbsolute('fintrack.page.index'));
			return $notification;
		}

		if ($subject === 'transaction_reminder') {
			$description = trim((string)($params['description'] ?? ''));
			$amount      = trim(number_format((float)($params['amount'] ?? 0), 2) . ' ' . ($params['currency'] ?? ''));
			$notification->setParsedSubject(
				'FinTrack: ' . ($description !== '' ? $description : $l->t('Transaction')) . ' (' . $amount . ')'
			);
			$notification->setLink($this->urlGenerator->linkToRouteAbsolute('fintrack.page.index'));
			return $notification;
		}

		$username = $params['username'] ?? $l->t('A user');
		$notification->setParsedSubject(
			$l->t('User %s has requested to revoke their FinTrack PIN access.', [$username])
		);
		// Sends the admin straight to the Reset PIN queue under Admin Settings.
		$notification->setLink($this->urlGenerator->getAbsoluteURL('/settings/admin/' . Application::APP_ID));

		return $notification;
	}
}
