<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\CORS;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\PublicPage;
use OCP\AppFramework\Http\DataResponse;
use OCP\Http\Client\IClientService;
use OCP\IRequest;
use OCP\IURLGenerator;

/**
 * LoginProxyController — relays Nextcloud core's Login Flow v2
 * (/index.php/login/v2, /index.php/login/v2/poll) so the FinTrack PWA
 * (see js/pwa-api.js) can authenticate the exact same way the Android app
 * does, without needing CORS headers on core routes it doesn't own.
 *
 * Both calls made here are server-to-server (this Nextcloud instance
 * calling its own core routes over HTTP) — no browser involved on that
 * hop, so no CORS applies there. #[CORS] is only needed on THIS
 * controller's own routes, which FinTrack does own.
 *
 * PublicPage + NoCSRFRequired: correct here because the whole point of
 * Login Flow v2 is to authenticate someone who has no NC session yet.
 */
class LoginProxyController extends Controller {

	public function __construct(
		IRequest                  $request,
		private IClientService    $clientService,
		private IURLGenerator     $urlGenerator,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	/** Base URL of this Nextcloud instance, without a trailing slash. */
	private function baseUrl(): string {
		return rtrim($this->urlGenerator->getAbsoluteURL('/'), '/');
	}

	/**
	 * True if $endpoint points at this same Nextcloud instance's own
	 * login/v2/poll route. Deliberately checks host + path shape against
	 * the live request (proxy-aware) rather than string-comparing against
	 * a separately-computed "base URL" — behind a reverse proxy those can
	 * differ in scheme or webroot even when both legitimately point at the
	 * same instance, which caused false-positive rejections. Scheme is
	 * intentionally ignored; only the host and path matter for this check.
	 * Still fully blocks the SSRF case that matters: no other host is ever
	 * accepted, so this proxy can't be pointed at an arbitrary URL.
	 */
	private function isOwnPollEndpoint(string $endpoint): bool {
		$parts = parse_url($endpoint);
		if ($parts === false || empty($parts['host'])) {
			return false;
		}
		$endpointHost = strtolower($parts['host']) . (isset($parts['port']) ? ':' . $parts['port'] : '');
		$requestHost  = strtolower($this->request->getServerHost());
		if ($endpointHost !== $requestHost) {
			return false;
		}
		$path = $parts['path'] ?? '';
		return (bool)preg_match('#(?:/index\.php)?/login/v2/poll/?$#', $path);
	}

	/**
	 * POST /login-proxy/init
	 * Starts a Login Flow v2 session server-side and hands the poll
	 * token/endpoint and the browser-facing login URL back to the PWA.
	 */
	#[PublicPage]
	#[NoCSRFRequired]
	#[CORS]
	public function init(): DataResponse {
		try {
			$client   = $this->clientService->newClient();
			$response = $client->post($this->baseUrl() . '/index.php/login/v2', [
				'headers' => [
					'OCS-APIREQUEST' => 'true',
					'Accept'         => 'application/json',
				],
				'timeout' => 8,
			]);
			$data = json_decode((string)$response->getBody(), true);
			if (!is_array($data) || empty($data['poll']['token']) || empty($data['poll']['endpoint']) || empty($data['login'])) {
				return new DataResponse(['error' => 'Unexpected response from login flow'], 502);
			}
			return new DataResponse([
				'poll'  => [
					'token'    => $data['poll']['token'],
					'endpoint' => $data['poll']['endpoint'],
				],
				'login' => $data['login'],
			]);
		} catch (\Exception $e) {
			return new DataResponse(['error' => 'Could not start login: ' . $e->getMessage()], 502);
		}
	}

	/**
	 * POST /login-proxy/poll
	 * Body: endpoint, token (both from init()'s response).
	 * Relays one poll attempt to core. Returns 202 while the person hasn't
	 * finished logging in yet, or the app credentials once they have.
	 */
	#[PublicPage]
	#[NoCSRFRequired]
	#[CORS]
	public function poll(): DataResponse {
		$endpoint = (string)$this->request->getParam('endpoint', '');
		$token    = (string)$this->request->getParam('token', '');

		if ($endpoint === '' || $token === '') {
			return new DataResponse(['error' => 'endpoint and token are required'], 400);
		}

		// Only ever relay to this same Nextcloud instance's own login/v2/poll
		// route — never to an arbitrary URL the caller supplies — so this
		// proxy can't be abused as an open server-side request relay (SSRF).
		if (!$this->isOwnPollEndpoint($endpoint)) {
			return new DataResponse(['error' => 'Invalid poll endpoint'], 400);
		}

		try {
			$client   = $this->clientService->newClient();
			$response = $client->post($endpoint, [
				'headers'     => [
					'OCS-APIREQUEST' => 'true',
					'Accept'         => 'application/json',
				],
				'body'        => ['token' => $token],
				'timeout'     => 8,
				'http_errors' => false,
			]);

			$status = $response->getStatusCode();
			if ($status === 404) {
				// Not completed yet — keep the PWA polling.
				return new DataResponse(['pending' => true], 202);
			}
			if ($status !== 200) {
				return new DataResponse(['error' => 'Login poll failed'], 502);
			}

			$data = json_decode((string)$response->getBody(), true);
			if (!is_array($data) || empty($data['loginName']) || empty($data['appPassword'])) {
				return new DataResponse(['error' => 'Unexpected response from login flow'], 502);
			}

			return new DataResponse([
				'server'      => $data['server'] ?? $this->baseUrl(),
				'loginName'   => $data['loginName'],
				'appPassword' => $data['appPassword'],
			]);
		} catch (\Exception $e) {
			return new DataResponse(['error' => 'Login poll failed: ' . $e->getMessage()], 502);
		}
	}
}
