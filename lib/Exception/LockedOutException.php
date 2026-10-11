<?php

declare(strict_types=1);

namespace OCA\FinTrack\Exception;

class LockedOutException extends \RuntimeException {
	public function __construct(public readonly int $lockedUntil) {
		parent::__construct('Too many incorrect attempts. Try again later.');
	}
}
