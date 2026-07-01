<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\AppInfo\Application;
use OCA\FinTrack\Service\SettingsService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUserSession;

class PageController extends Controller {

	public function __construct(
		IRequest                $request,
		private IURLGenerator   $urlGenerator,
		private IUserSession    $userSession,
		private SettingsService $settingsService,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * Main application page — authenticated users only.
	 * NoCSRFRequired is correct here because this is a GET page load (not a state-mutating request).
	 * CSRF tokens are enforced on all POST/PUT/DELETE API calls via the ApiController.
	 */
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(): TemplateResponse {
		$user   = $this->userSession->getUser();
		$userId = $user?->getUID() ?? '';

		// Ensure the user has an API token; create one if missing
		$apiToken = $this->settingsService->get($userId, 'api_token', '');
		if (empty($apiToken)) {
			$apiToken = bin2hex(random_bytes(32));
			$this->settingsService->set($userId, 'api_token', $apiToken);
		}

		// Derive the API base URL from a known route, stripping the last path segment
		$accountsUrl = $this->urlGenerator->linkToRouteAbsolute('fintrack.api.getAccounts');
		$apiBase     = substr($accountsUrl, 0, strrpos($accountsUrl, '/'));

		$params = [
			'userId'          => $userId,
			'displayName'     => $user?->getDisplayName() ?? '',
			'apiToken'        => $apiToken,
			'externalFormUrl' => $this->urlGenerator->linkToRouteAbsolute(
				'fintrack.page.externalForm',
				['token' => $apiToken]
			),
			'apiBase'         => $apiBase,
		];

		$response = new TemplateResponse(Application::APP_ID, 'main', $params);

		// NC32 CSP: 'self' for scripts and styles is sufficient.
		// Do NOT add 'unsafe-inline' — NC32 uses nonces for inline scripts via TemplateResponse.
		$csp = new ContentSecurityPolicy();
		$csp->addAllowedStyleDomain("'self'");
		$csp->addAllowedStyleDomain('fonts.googleapis.com');
		$csp->addAllowedFontDomain('fonts.gstatic.com');
		// Scripts: 'self' only — inline config is injected via a <script> tag in the template;
		// NC32's TemplateResponse automatically adds a nonce to script tags, so 'unsafe-inline'
		// is NOT needed and should NOT be set.
		$response->setContentSecurityPolicy($csp);

		return $response;
	}

	/**
	 * Public external entry form — no Nextcloud login required.
	 * Authentication is via the FinTrack API token embedded in the URL.
	 * NoCSRFRequired is correct: this is a GET page served to unauthenticated visitors.
	 */
	#[PublicPage]
	#[NoCSRFRequired]
	public function externalForm(string $token): TemplateResponse {
		// Validate token is not obviously empty
		$token = trim($token);

		// Build the public external API base — separate from the authenticated internal API
		$externalBase = $this->urlGenerator->linkToRouteAbsolute('fintrack.external.getAccounts');
		$externalBase = substr($externalBase, 0, strrpos($externalBase, '/'));

		$params = [
			'token'       => $token,
			'submitUrl'   => $this->urlGenerator->linkToRouteAbsolute('fintrack.external.submit'),
			'accountsUrl' => $this->urlGenerator->linkToRouteAbsolute('fintrack.external.getAccounts'),
			'categoriesUrl' => $this->urlGenerator->linkToRouteAbsolute('fintrack.external.getCategories'),
		];

		// Use the 'base' layout (no NC sidebar), same as before
		$response = new TemplateResponse(Application::APP_ID, 'external', $params, 'base');

		$csp = new ContentSecurityPolicy();
		$csp->addAllowedStyleDomain("'self'");
		$csp->addAllowedStyleDomain('fonts.googleapis.com');
		$csp->addAllowedFontDomain('fonts.gstatic.com');
		// External form is self-contained; no external script sources needed
		$response->setContentSecurityPolicy($csp);

		return $response;
	}
}
