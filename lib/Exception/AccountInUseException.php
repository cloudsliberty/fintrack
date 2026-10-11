<?php

declare(strict_types=1);

namespace OCA\FinTrack\Exception;

/**
 * Thrown by AccountService::delete() when the account has at least one
 * linked transaction or transfer. The account has already been marked
 * inactive by the time this is thrown; the message explains that to the
 * caller so the API/UI can show it instead of a generic error.
 */
class AccountInUseException extends \RuntimeException {
	public function __construct() {
		parent::__construct('This account has existing transactions and can\'t be deleted. It has been marked inactive instead.');
	}
}
