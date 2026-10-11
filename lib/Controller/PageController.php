<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\AppInfo\Application;
use OCA\FinTrack\Service\SettingsService;
use OCP\App\IAppManager;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\Util;
use OCP\IUserSession;

class PageController extends Controller {

	public function __construct(
		IRequest                $request,
		private IURLGenerator   $urlGenerator,
		private IUserSession    $userSession,
		private SettingsService $settingsService,
		private IAppManager     $appManager,
		private IConfig         $config,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/**
	 * Main application page — authenticated users only.
	 * NoCSRFRequired is correct here because this is a GET page load (not a state-mutating request).
	 * CSRF tokens are enforced on all POST/PUT/DELETE API calls via the per-resource API controllers.
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
		$accountsUrl = $this->urlGenerator->linkToRouteAbsolute('fintrack.accounts.index');
		$apiBase     = substr($accountsUrl, 0, strrpos($accountsUrl, '/'));

		// Dedicated, random telemetry instance ID for this FinTrack install —
		// generated once on install/upgrade by Version1005Date20260709000000.
		// Deliberately separate from Nextcloud's own system instanceid, and
		// never derived from any user-identifying data. Read lazily here too
		// (not just in the migration) as a safety net in case it's ever empty.
		$instanceId = $this->config->getAppValue(Application::APP_ID, 'telemetry_id', '');
		if ($instanceId === '') {
			$instanceId = bin2hex(random_bytes(16));
			$this->config->setAppValue(Application::APP_ID, 'telemetry_id', $instanceId);
		}

		$params = [
			'userId'          => $userId,
			'displayName'     => $user?->getDisplayName() ?? '',
			'userEmail'       => $user?->getEMailAddress() ?? '',
			'apiToken'        => $apiToken,
			'externalFormUrl' => $this->urlGenerator->linkToRouteAbsolute('fintrack.page.externalForm'),
			'apiBase'         => $apiBase,
			'logoUrl'         => $this->urlGenerator->imagePath(Application::APP_ID, 'app.svg'),
			// Used only by the first-run welcome screen, the periodic anniversary
			// check-in, and the monthly donation reminder — all three send the
			// same minimal, non-identifying usage ping (installation ID, country
			// if voluntarily provided, and version numbers only — never name,
			// email, or any financial data). See fintrack-main.js sendTelemetryPing().
			'nextcloudVersion' => implode('.', Util::getVersion()),
			'fintrackVersion'  => $this->appManager->getAppVersion(Application::APP_ID),
			'instanceId'       => $instanceId,
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
		// connect-src defaults to 'self' under NC32, which blocks the minimal, non-identifying
		// telemetry ping fintrack-main.js sends (see sendTelemetryPing()) to Google Apps Script.
		// Explicitly allow that endpoint. Apps Script web apps 302-redirect the actual
		// response to script.googleusercontent.com/macros/echo?... — both domains needed
		// or the browser blocks the redirect target even though script.google.com is allowed.
		$csp->addAllowedConnectDomain('https://script.google.com');
		$csp->addAllowedConnectDomain('https://script.googleusercontent.com');
		$response->setContentSecurityPolicy($csp);

		return $response;
	}

	/**
	 * Public FinTrack PWA shell — no Nextcloud session required to load the
	 * page itself. Replaces the old token-in-URL quick-entry form: the PWA
	 * authenticates via Nextcloud's own Login Flow v2 (relayed through
	 * LoginProxyController) and then talks to the full internal REST API
	 * (api/...) over HTTP Basic Auth with the resulting app password —
	 * same as the Android app, full read/write access once logged in.
	 * NoCSRFRequired is correct: this is a GET page served pre-login.
	 */
	#[PublicPage]
	#[NoCSRFRequired]
	public function externalForm(): TemplateResponse {
		$params = [
			// Prefills the PWA's "server" field with this instance's own
			// address, since it's already known when served from inside it.
			'serverUrl'         => $this->urlGenerator->getAbsoluteURL('/'),
			'manifestUrl'       => $this->urlGenerator->linkToRoute('fintrack.page.externalManifest'),
			'swUrl'             => $this->urlGenerator->linkToRoute('fintrack.page.externalServiceWorker'),
			// Same file Nextcloud itself uses for the FinTrack app icon (nav bar,
			// app menu) — pointing the favicon straight at it instead of the
			// separately-generated pwa-icons/*.png guarantees they're identical,
			// not just visually similar.
			'iconUrl'           => $this->urlGenerator->imagePath(Application::APP_ID, 'app.svg'),
			'appleTouchIconUrl' => $this->urlGenerator->imagePath(Application::APP_ID, 'pwa-icons/apple-touch-icon.png'),
			// Directory prefix pwa-app.js appends filenames like "icon-96.png" to.
			'iconBase'          => $this->urlGenerator->imagePath(Application::APP_ID, 'pwa-icons/icon-192.png'),
			// Same source as the Main App's "About" version line — IAppManager
			// reads this from info.xml and Nextcloud's own app-info cache keeps
			// it fast, so no separate DB caching is needed on FinTrack's side.
			'fintrackVersion'   => $this->appManager->getAppVersion(Application::APP_ID),
		];
		// imagePath() above returns a full file path; trim it back to just the directory.
		$params['iconBase'] = substr($params['iconBase'], 0, strrpos($params['iconBase'], '/') + 1);

		// Every <head>-only tag (manifest, icons, viewport meta, theme-color)
		// MUST go through Util::addHeader() — confirmed from Nextcloud's own
		// core/templates/layout.base.php: our template's own output (which is
		// what templates/external.php used to put these tags in) is rendered
		// inside <body><div id="content">, not <head>. That's not just a
		// favicon cosmetic issue — it meant <link rel="manifest"> itself was
		// never actually discoverable in <head>, so the browser had no way to
		// know this page was installable at all, and beforeinstallprompt could
		// never fire no matter what the client-side JS did.
		// Missing until now despite the comment above claiming otherwise —
		// this was the actual root cause of the "not scrollable" / "not
		// fullscreen" reports. Without it, mobile browsers render the page
		// at a desktop fallback width (~980px) and zoom-to-fit, which both
		// breaks native touch scrolling and makes the page visibly NOT
		// fill the screen (looks like it never left the browser chrome,
		// even when display:fullscreen is honored). viewport-fit=cover is
		// also required for the env(safe-area-inset-*) calls already used
		// throughout pwa.css to do anything at all.
		Util::addHeader('meta', ['name' => 'viewport', 'content' => 'width=device-width, initial-scale=1, viewport-fit=cover']);
		Util::addHeader('link', ['rel' => 'manifest', 'href' => $params['manifestUrl']]);
		Util::addHeader('link', ['rel' => 'icon', 'type' => 'image/svg+xml', 'href' => $params['iconUrl']]);
		Util::addHeader('link', ['rel' => 'apple-touch-icon', 'href' => $params['appleTouchIconUrl']]);
		Util::addHeader('meta', ['name' => 'apple-mobile-web-app-capable', 'content' => 'yes']);
		// Chrome deprecated apple-mobile-web-app-capable in favor of this
		// standardized equivalent; keep both since Safari still only
		// recognizes the apple- prefixed one.
		Util::addHeader('meta', ['name' => 'mobile-web-app-capable', 'content' => 'yes']);
		Util::addHeader('meta', ['name' => 'apple-mobile-web-app-status-bar-style', 'content' => 'black-translucent']);
		Util::addHeader('meta', ['name' => 'apple-mobile-web-app-title', 'content' => 'FinTrack']);
		Util::addHeader('meta', ['name' => 'theme-color', 'content' => '#4f8ef7']);
		Util::addHeader('title', [], 'FinTrack');

		// Use the 'base' layout (no NC sidebar), same as before
		$response = new TemplateResponse(Application::APP_ID, 'external', $params, 'base');

		$csp = new ContentSecurityPolicy();
		$csp->addAllowedStyleDomain("'self'");
		$csp->addAllowedStyleDomain('fonts.googleapis.com');
		$csp->addAllowedFontDomain('fonts.gstatic.com');
		// The PWA talks to this same origin's own /login-proxy and /api routes only.
		$response->setContentSecurityPolicy($csp);

		return $response;
	}

	/**
	 * GET /pwa/manifest.webmanifest
	 * Web app manifest for the merged FinTrack PWA, so "Add to Home Screen"
	 * installs a standalone app pointed at this Nextcloud instance.
	 */
	#[PublicPage]
	#[NoCSRFRequired]
	public function externalManifest(): DataDisplayResponse {
		$startUrl = $this->urlGenerator->linkToRoute('fintrack.page.externalForm');
		$domain   = $this->request->getServerHost();
		$title    = 'FinTrack - ' . $domain;
		$icon     = fn (string $name, string $size) => [
			'src'   => $this->urlGenerator->imagePath(Application::APP_ID, "pwa-icons/$name"),
			'sizes' => $size,
			'type'  => 'image/png',
		];

		$manifest = [
			'name'             => $title,
			'short_name'       => 'FinTrack',
			'description'      => 'Personal finance manager for your Nextcloud server.',
			'start_url'        => $startUrl,
			'scope'            => $startUrl,
			'display'          => 'fullscreen',
			'display_override' => ['fullscreen', 'standalone', 'minimal-ui'],
			'orientation'      => 'portrait-primary',
			'background_color' => '#0f172a',
			'theme_color'      => '#4f8ef7',
			'icons'            => [
				$icon('icon-72.png', '72x72'),
				$icon('icon-96.png', '96x96'),
				$icon('icon-128.png', '128x128'),
				$icon('icon-144.png', '144x144'),
				$icon('icon-152.png', '152x152'),
				$icon('icon-192.png', '192x192') + ['purpose' => 'any'],
				$icon('icon-384.png', '384x384'),
				$icon('icon-512.png', '512x512') + ['purpose' => 'any'],
				$icon('icon-maskable-512.png', '512x512') + ['purpose' => 'maskable'],
			],
		];

		$response = new DataDisplayResponse(
			json_encode($manifest, JSON_UNESCAPED_SLASHES),
			200,
			['Content-Type' => 'application/manifest+json']
		);
		return $response;
	}

	/**
	 * GET /pwa/sw.js
	 * Service worker for the merged FinTrack PWA. Caches only the static
	 * app shell (HTML/CSS/JS/icons) for offline-launch resilience — same
	 * policy as the standalone PWA build (see FinTrackPWA/service-worker.js):
	 * it deliberately never caches anything under /index.php/... (the live
	 * API), since financial data must only ever be persisted encrypted, via
	 * IndexedDB (see pwa-db.js/pwa-crypto.js), never as plaintext responses
	 * in the browser's (unencrypted) Cache Storage.
	 *
	 * The script lives one path segment below the page it controls
	 * (/pwa/sw.js vs /pwa), so its default scope (/pwa/) would NOT
	 * cover the page itself. Service-Worker-Allowed widens that scope to
	 * /pwa to match what pwa-app.js registers with.
	 */
	#[PublicPage]
	#[NoCSRFRequired]
	public function externalServiceWorker(): DataDisplayResponse {
		$pagePath  = $this->urlGenerator->linkToRoute('fintrack.page.externalForm');
		// Bumped (v1 -> ... -> v9; current value is $cacheName below) to force every existing install to
		// purge its old cache — several rounds of PWA fixes (scrolling,
		// manifest display mode, favicon, viewport meta, etc.) were
		// invisible to already-installed users because the old cache-first
		// strategy kept serving the stale HTML page/manifest/CSS/JS it had
		// cached on first install, no matter how many times those files
		// changed server-side. v4: viewport meta tag added (was missing
		// entirely, despite the 1.19.5 changelog claiming otherwise) and
		// pwa-app.js changed to request true Fullscreen API on first tap.
		$cacheName = 'fintrack-pwa-shell-v9';

		$shellFiles = array_map(
			fn (string $url) => "'" . addslashes($url) . "'",
			[
				$pagePath,
				$this->urlGenerator->linkToRoute('fintrack.page.externalManifest'),
				$this->urlGenerator->linkTo(Application::APP_ID, 'css/pwa.css'),
				$this->urlGenerator->linkTo(Application::APP_ID, 'js/pwa-crypto.js'),
				$this->urlGenerator->linkTo(Application::APP_ID, 'js/pwa-db.js'),
				$this->urlGenerator->linkTo(Application::APP_ID, 'js/pwa-pin.js'),
				$this->urlGenerator->linkTo(Application::APP_ID, 'js/pwa-api.js'),
				$this->urlGenerator->linkTo(Application::APP_ID, 'js/pwa-app.js'),
				$this->urlGenerator->linkTo(Application::APP_ID, 'js/pwa-sections.js'),
				$this->urlGenerator->imagePath(Application::APP_ID, 'app.svg'),
				$this->urlGenerator->imagePath(Application::APP_ID, 'pwa-icons/apple-touch-icon.png'),
				// Every icon size the manifest references — previously only 192/512
				// were precached, so "Add to Home Screen"/app-switcher icons could
				// still 404 offline on a cold cache even though the app shell itself
				// loaded fine.
				$this->urlGenerator->imagePath(Application::APP_ID, 'pwa-icons/icon-72.png'),
				$this->urlGenerator->imagePath(Application::APP_ID, 'pwa-icons/icon-96.png'),
				$this->urlGenerator->imagePath(Application::APP_ID, 'pwa-icons/icon-128.png'),
				$this->urlGenerator->imagePath(Application::APP_ID, 'pwa-icons/icon-144.png'),
				$this->urlGenerator->imagePath(Application::APP_ID, 'pwa-icons/icon-152.png'),
				$this->urlGenerator->imagePath(Application::APP_ID, 'pwa-icons/icon-192.png'),
				$this->urlGenerator->imagePath(Application::APP_ID, 'pwa-icons/icon-384.png'),
				$this->urlGenerator->imagePath(Application::APP_ID, 'pwa-icons/icon-512.png'),
				$this->urlGenerator->imagePath(Application::APP_ID, 'pwa-icons/icon-maskable-512.png'),
			]
		);
		$shellFilesJs = implode(",\n\t", $shellFiles);

		$js = <<<JS
// FinTrack — merged PWA service worker (auto-generated).
const CACHE_NAME = '{$cacheName}';
const SHELL_FILES = [
	{$shellFilesJs}
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
	);
	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	const url = new URL(event.request.url);
	// Never touch the live API/auth routes — only ever serve/cache the static
	// shell, and only for shell files. (The shell page and manifest themselves
	// live under /index.php/ on installs without pretty URLs, so that prefix
	// alone can no longer mean "API".)
	if (/\/apps\/fintrack\/(api|external|login-proxy|admin)\//.test(url.pathname)) return;
	if (!SHELL_FILES.some((f) => new URL(f, self.location.origin).pathname === url.pathname)) return;

	// Network-first, cache-fallback: whenever there's a connection, always
	// fetch the current version (so code/CSS/manifest updates take effect
	// immediately, no stale-cache surprises) and refresh the cache with it;
	// only fall back to whatever's cached when the network request fails,
	// which is what actually makes the PWA loadable offline.
	event.respondWith(
		fetch(event.request)
			.then((fresh) => {
				const copy = fresh.clone();
				caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
				return fresh;
			})
			.catch(() => caches.match(event.request))
	);
});
JS;

		return new DataDisplayResponse($js, 200, [
			'Content-Type'            => 'application/javascript',
			'Service-Worker-Allowed'  => $pagePath,
		]);
	}
}
