<?php

declare(strict_types=1);

namespace OCA\FinTrack\Db;

use OCP\AppFramework\Db\Entity;

/**
 * A user's "Request Admin Approval to Reset PIN" request (see LockService).
 * One row per request; status moves from 'pending' to either 'approved'
 * (an admin cleared the PIN) or 'cancelled' (the user got back in on their
 * own — correct PIN or security question — before an admin acted).
 *
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getDisplayName()
 * @method void setDisplayName(string $displayName)
 * @method string getStatus()
 * @method void setStatus(string $status)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 * @method int|null getResolvedAt()
 * @method void setResolvedAt(?int $resolvedAt)
 */
class PinResetRequest extends Entity {
	protected $userId;
	protected $displayName;
	protected $status;
	protected $createdAt;
	protected $resolvedAt;

	public function __construct() {
		$this->addType('createdAt', 'integer');
		$this->addType('resolvedAt', 'integer');
	}
}
