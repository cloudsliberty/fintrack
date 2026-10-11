<?php

declare(strict_types=1);

namespace OCA\FinTrack\BackgroundJob;

use OCA\FinTrack\Service\AlertService;
use OCA\FinTrack\Service\RecurringService;
use OCA\FinTrack\Service\TransactionService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;
use OCP\IConfig;
use Psr\Log\LoggerInterface;

/**
 * Posts due recurring transactions server-side, for every user, on a
 * schedule — so recurring items are posted on time even if the person
 * doesn't happen to open the app that day. Previously this only happened
 * client-side (isDue() in fintrack-core.js) when someone loaded the
 * Recurring page, which meant nothing was posted at all if the app went
 * unopened past a due date.
 *
 * Registered as a Nextcloud TimedJob via <background-jobs> in
 * appinfo/info.xml (not in Application::register()), which
 * Nextcloud's own background job runner (cron.php / AJAX / webcron, per the
 * server's admin settings) invokes roughly on the configured interval. This
 * class only decides *when it's next allowed to run at all*; setInterval()
 * below is that outer bound — the actual per-item due dates are evaluated
 * fresh against the database on every run.
 *
 * Since 1.21.0 the same run also raises the Nextcloud alerts (notification
 * bell): one per recurring transaction posted on its trigger date (unless
 * that rule's alert is switched off), and one per custom transaction
 * reminder whose reminder date has arrived.
 */
class PostDueRecurringJob extends TimedJob {

	public function __construct(
		ITimeFactory $time,
		private RecurringService $recurringService,
		private TransactionService $transactionService,
		private AlertService $alertService,
		private LoggerInterface $logger,
		private IConfig $config,
	) {
		parent::__construct($time);
		// Due items are checked at most this often; 15 minutes is frequent
		// enough that a daily recurring item posts within 15 minutes of
		// midnight, without hammering the DB every request.
		$this->setInterval(15 * 60);
	}

	protected function run($argument): void {
		$now = $this->time->getTime();
		// A single item can be overdue by more than one cycle (e.g. the
		// instance was offline for a week) — cap the catch-up posts per item
		// so a bad/ancient row can't loop indefinitely.
		$maxCatchUpPerItem = 60;

		$posted = 0;
		$failed = 0;
		$postedPerRule = [];
		$failedThisRun = [];

		// findAllDue() is re-queried after every pass, since posting advances
		// next_date and a heavily overdue rule is still due after one catch-up
		// post. Each rule is capped at $maxCatchUpPerItem posts per run, and a
		// rule that fails is dropped for the rest of THIS run and then backs
		// off across runs (see isInBackoff()) — before, a failing rule was
		// retried on every one of up to 60 passes, every 15 minutes, forever.
		while (true) {
			$progressed = false;
			foreach ($this->recurringService->findAllDue($now) as $row) {
				$ruleId = (int)$row['id'];
				if (isset($failedThisRun[$ruleId])
					|| ($postedPerRule[$ruleId] ?? 0) >= $maxCatchUpPerItem
					|| $this->isInBackoff($ruleId, $now)) {
					continue;
				}
				try {
					$this->recurringService->post((string)$row['user_id'], $ruleId);
					$posted++;
					$postedPerRule[$ruleId] = ($postedPerRule[$ruleId] ?? 0) + 1;
					$progressed = true;
					$this->clearBackoff($ruleId);
					// $row is the pre-post snapshot, so next_date is still the
					// trigger date that just fired. Alert only after a
					// successful post: post() moves next_date forward, so a rule
					// can't alert twice for one occurrence, whereas a rule whose
					// post keeps failing would otherwise alert on every retry.
					if ((int)($row['alert_enabled'] ?? 1) === 1) {
						$this->alertService->notifyRecurringDue((string)$row['user_id'], $row);
					}
				} catch (\Exception $e) {
					$failed++;
					$failedThisRun[$ruleId] = true;
					$this->recordFailure($ruleId, $now);
					$this->logger->warning('FinTrack: failed to auto-post recurring #{id} for {user}: {msg}', [
						'id'  => $row['id'],
						'user' => $row['user_id'],
						'msg' => $e->getMessage(),
						'app' => 'fintrack',
					]);
				}
			}
			if (!$progressed) {
				break;
			}
		}

		$this->sendDueReminders($now);

		if ($posted > 0 || $failed > 0) {
			$this->logger->info('FinTrack: auto-posted {posted} recurring transaction(s), {failed} failed', [
				'posted' => $posted,
				'failed' => $failed,
				'app'    => 'fintrack',
			]);
		}
	}

	// ── Failure backoff ──
	// A rule that throws is retried after 15 min, 30 min, 1 h ... capped at
	// 24 h, tracked in app config (no schema change). Cleared on success.

	private function isInBackoff(int $ruleId, int $now): bool {
		return (int)$this->config->getAppValue('fintrack', 'recurring_retry_after_' . $ruleId, '0') > $now;
	}

	private function recordFailure(int $ruleId, int $now): void {
		$count = (int)$this->config->getAppValue('fintrack', 'recurring_fail_count_' . $ruleId, '0') + 1;
		$delay = min(15 * 60 * (2 ** min($count - 1, 7)), 24 * 3600);
		$this->config->setAppValue('fintrack', 'recurring_fail_count_' . $ruleId, (string)$count);
		$this->config->setAppValue('fintrack', 'recurring_retry_after_' . $ruleId, (string)($now + $delay));
	}

	private function clearBackoff(int $ruleId): void {
		$this->config->deleteAppValue('fintrack', 'recurring_fail_count_' . $ruleId);
		$this->config->deleteAppValue('fintrack', 'recurring_retry_after_' . $ruleId);
	}

	/**
	 * Custom transaction reminders: alert once per transaction whose
	 * reminder date has arrived, then mark it sent so it never alerts twice
	 * (editing the reminder date re-arms it — see TransactionService::update()).
	 */
	private function sendDueReminders(int $now): void {
		try {
			$rows = $this->transactionService->findAllDueReminders($now);
		} catch (\Throwable $e) {
			$this->logger->warning('FinTrack: could not look up due reminders: {msg}', [
				'msg' => $e->getMessage(),
				'app' => 'fintrack',
			]);
			return;
		}
		$sent = 0;
		foreach ($rows as $row) {
			if ($this->alertService->notifyTransactionReminder((string)$row['user_id'], $row)) {
				// Only marked sent when the alert actually went out, so a
				// transient failure retries on the next run.
				$this->transactionService->markReminderSent((int)$row['id']);
				$sent++;
			}
		}
		if ($sent > 0) {
			$this->logger->info('FinTrack: sent {sent} transaction reminder alert(s)', [
				'sent' => $sent,
				'app'  => 'fintrack',
			]);
		}
	}
}
