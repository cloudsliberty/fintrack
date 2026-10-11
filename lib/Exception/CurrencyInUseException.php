<?php

declare(strict_types=1);

namespace OCA\FinTrack\Exception;

/** Thrown by CurrencyService::delete() when the currency is still used by an account or transaction. */
class CurrencyInUseException extends \RuntimeException {
	public function __construct() {
		parent::__construct('This currency is used by an account or transaction and can\'t be removed.');
	}
}
