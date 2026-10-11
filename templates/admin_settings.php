<?php
/**
 * Admin Settings → FinTrack → Reset PIN.
 *
 * $l (IL10N) and p()/print_unescaped() are injected automatically by
 * Nextcloud's template engine, same as every other Nextcloud settings
 * template — no explicit `use` needed here.
 *
 * @var array $_
 * @var \OCP\IL10N $l
 */
\OCP\Util::addStyle('fintrack', 'app');
\OCP\Util::addScript('fintrack', 'fintrack-admin');

/** @var \OCA\FinTrack\Db\PinResetRequest[] $requests */
$requests = $_['pendingRequests'];
?>
<div id="fintrack-admin-settings" class="section">
	<h2><?php p($l->t('FinTrack — Reset PIN Requests')); ?></h2>
	<p class="settings-hint">
		<?php p($l->t('When a user is locked out of their FinTrack PIN and has no security question set (or has forgotten the answer too), they can request an admin clear it here. Approving removes the PIN lock for that user — they can set a fresh one from FinTrack → Settings → Pin Lock.')); ?>
	</p>

	<p id="fintrack-admin-empty" style="<?php echo empty($requests) ? '' : 'display:none'; ?>">
		<?php p($l->t('No pending requests.')); ?>
	</p>

	<table id="fintrack-admin-requests-table" class="grid" style="<?php echo empty($requests) ? 'display:none' : ''; ?>">
		<thead>
			<tr>
				<th><?php p($l->t('User')); ?></th>
				<th><?php p($l->t('Requested')); ?></th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			<?php foreach ($requests as $req): ?>
			<tr data-request-id="<?php p((string)$req->getId()); ?>">
				<td>
					<?php p($req->getDisplayName() !== '' ? $req->getDisplayName() : $req->getUserId()); ?>
					<span style="color:var(--color-text-maxcontrast)">(<?php p($req->getUserId()); ?>)</span>
				</td>
				<td>
					<span class="fintrack-admin-request-time" data-timestamp="<?php p((string)$req->getCreatedAt()); ?>">
						<?php p((string)$req->getCreatedAt()); ?>
					</span>
				</td>
				<td>
					<button type="button" class="button" data-fintrack-approve="<?php p((string)$req->getId()); ?>">
						<?php p($l->t('Approve & Clear PIN')); ?>
					</button>
				</td>
			</tr>
			<?php endforeach; ?>
		</tbody>
	</table>
</div>
