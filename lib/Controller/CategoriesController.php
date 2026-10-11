<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\Service\CategoryService;
use OCA\FinTrack\Service\SettingsService;
use OCA\FinTrack\Service\TagUtil;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\CORS;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;

class CategoriesController extends BaseApiController {

	public function __construct(
		IRequest $request,
		IUserSession $userSession,
		private CategoryService $categoryService,
		private SettingsService $settingsService,
	) {
		parent::__construct($request, $userSession);
	}

	/** GET /api/categories */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function index(): DataResponse {
		return new DataResponse($this->categoryService->findAll($this->uid()));
	}

	/** POST /api/categories */
	#[CORS]
	#[NoAdminRequired]
	public function create(): DataResponse {
		return new DataResponse($this->categoryService->create($this->uid(), $this->jsonBody()));
	}

	/** PUT /api/categories/{id} */
	#[CORS]
	#[NoAdminRequired]
	public function update(int $id): DataResponse {
		return new DataResponse($this->categoryService->update($this->uid(), $id, $this->jsonBody()));
	}

	/** DELETE /api/categories/{id} */
	#[CORS]
	#[NoAdminRequired]
	public function destroy(int $id): DataResponse {
		try {
			$this->categoryService->delete($this->uid(), $id);
			return new DataResponse(['status' => 'ok']);
		} catch (\OCA\FinTrack\Exception\CategoryInUseException $e) {
			return new DataResponse(['error' => $e->getMessage()], 409);
		}
	}

	/**
	 * GET /api/categories/export
	 * Returns categories + tags together as a single importable JSON payload.
	 */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function export(): DataResponse {
		$uid  = $this->uid();
		$tags = json_decode($this->settingsService->get($uid, 'tags', '[]'), true) ?: [];
		return new DataResponse([
			'categories' => $this->categoryService->findAll($uid),
			'tags'       => $tags,
		]);
	}

	/**
	 * POST /api/categories/import
	 * Body: { categories: [{name,type,icon,color}, ...], tags: [string, ...] }
	 * Existing categories (matched by name) and tags are left alone; only new
	 * ones are added, so importing is safe to repeat.
	 */
	#[CORS]
	#[NoAdminRequired]
	public function import(): DataResponse {
		$uid  = $this->uid();
		$body = $this->jsonBody();

		$importedCategories = 0;
		foreach (($body['categories'] ?? []) as $cat) {
			if (empty($cat['name'])) {
				continue;
			}
			$existing = array_filter($this->categoryService->findAll($uid), fn ($c) => $c['name'] === $cat['name']);
			if (empty($existing)) {
				$this->categoryService->create($uid, [
					'name'  => $cat['name'],
					'type'  => $cat['type'] ?? 'expense',
					'icon'  => $cat['icon'] ?? '',
					'color' => $cat['color'] ?? '#4f8ef7',
				]);
				$importedCategories++;
			}
		}

		$existingTags = TagUtil::normalize(json_decode($this->settingsService->get($uid, 'tags', '[]'), true) ?: []);
		$incomingTags = TagUtil::normalize(array_map('strval', $body['tags'] ?? []));
		$newTags      = array_values(array_diff($incomingTags, $existingTags));
		if (!empty($newTags)) {
			$this->settingsService->set($uid, 'tags', json_encode(array_values(array_merge($existingTags, $newTags))));
		}

		return new DataResponse([
			'importedCategories' => $importedCategories,
			'importedTags'       => count($newTags),
		]);
	}

	/**
	 * POST /api/categories/create-defaults
	 * Seeds a starter set of common categories + tags — handy for a fresh
	 * install or after "Reset All Data".
	 */
	#[CORS]
	#[NoAdminRequired]
	public function createDefaults(): DataResponse {
		$uid = $this->uid();

		$defaults = [
			['name' => 'Groceries',      'type' => 'expense', 'icon' => '🛒'],
			['name' => 'Rent/Mortgage',  'type' => 'expense', 'icon' => '🏠'],
			['name' => 'Utilities',      'type' => 'expense', 'icon' => '💡'],
			['name' => 'Transport',      'type' => 'expense', 'icon' => '🚗'],
			['name' => 'Dining Out',     'type' => 'expense', 'icon' => '🍽️'],
			['name' => 'Entertainment',  'type' => 'expense', 'icon' => '🎬'],
			['name' => 'Healthcare',     'type' => 'expense', 'icon' => '💊'],
			['name' => 'Education',      'type' => 'expense', 'icon' => '🎓'],
			['name' => 'Shopping',       'type' => 'expense', 'icon' => '🛍️'],
			['name' => 'Insurance',      'type' => 'expense', 'icon' => '🛡️'],
			['name' => 'Subscriptions',  'type' => 'expense', 'icon' => '📶'],
			['name' => 'Travel',         'type' => 'expense', 'icon' => '✈️'],
			['name' => 'Salary',         'type' => 'income',  'icon' => '💼'],
			['name' => 'Freelance',      'type' => 'income',  'icon' => '💻'],
			['name' => 'Investments',    'type' => 'income',  'icon' => '📈'],
			['name' => 'Gifts',          'type' => 'income',  'icon' => '🎁'],
			['name' => 'Other Income',   'type' => 'income',  'icon' => '💰'],
		];

		$created = 0;
		$existingNames = array_map(fn ($c) => $c['name'], $this->categoryService->findAll($uid));
		foreach ($defaults as $cat) {
			if (!in_array($cat['name'], $existingNames, true)) {
				$this->categoryService->create($uid, $cat);
				$created++;
			}
		}

		$defaultTags = ['recurring', 'monthly', 'essential', 'one-time', 'business', 'personal', 'reimbursable'];
		$existingTags = TagUtil::normalize(json_decode($this->settingsService->get($uid, 'tags', '[]'), true) ?: []);
		$newTags = array_values(array_diff($defaultTags, $existingTags));
		if (!empty($newTags)) {
			$this->settingsService->set($uid, 'tags', json_encode(array_values(array_merge($existingTags, $newTags))));
		}

		return new DataResponse(['createdCategories' => $created, 'createdTags' => count($newTags)]);
	}
}
