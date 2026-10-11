<?php

declare(strict_types=1);

namespace OCA\FinTrack\Exception;

/**
 * Thrown by CategoryService::delete() when the category is still
 * referenced by at least one transaction, recurring rule, or budget.
 */
class CategoryInUseException extends \RuntimeException {
	public function __construct() {
		parent::__construct('This category is used by existing transactions and can\'t be deleted. Rename it instead if needed.');
	}
}
