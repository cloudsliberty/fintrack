<?php

declare(strict_types=1);

namespace OCA\FinTrack\Db;

use OCP\AppFramework\Db\Entity;

/**
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getName()
 * @method void setName(string $name)
 * @method float getLimitAmt()
 * @method void setLimitAmt(float $limitAmt)
 * @method string getCurrency()
 * @method void setCurrency(string $currency)
 * @method string getPeriod()
 * @method void setPeriod(string $period)
 * @method string getCategory()
 * @method void setCategory(string $category)
 * @method bool getActive()
 * @method void setActive(bool $active)
 * @method int getStartDate()
 * @method void setStartDate(int $startDate)
 * @method int getCreatedAt()
 * @method void setCreatedAt(int $createdAt)
 */
class Budget extends Entity {
	protected $userId;
	protected $name;
	protected $limitAmt;
	protected $currency;
	protected $period;
	protected $category;
	protected $active;
	protected $startDate;
	protected $createdAt;

	public function __construct() {
		// Entity::__construct() registers each property's PHP type so
		// fromRow()/toRow() cast automatically instead of every mapper
		// hand-rolling (int)/(bool)/(float) casts on every column, every method.
		$this->addType('limitAmt', 'float');
		$this->addType('active', 'boolean');
		$this->addType('startDate', 'integer');
		$this->addType('createdAt', 'integer');
	}
}
