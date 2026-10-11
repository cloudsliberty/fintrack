<?php

declare(strict_types=1);

namespace OCA\FinTrack\Controller;

use OCA\FinTrack\Service\CurrencyService;
use OCA\FinTrack\Service\SettingsService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Attribute\CORS;
use OCP\AppFramework\Http\DataResponse;
use OCP\Http\Client\IClientService;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

class CurrenciesController extends BaseApiController {

	public function __construct(
		IRequest $request,
		IUserSession $userSession,
		private CurrencyService $currencyService,
		private SettingsService $settingsService,
		private IClientService $clientService,
		private LoggerInterface $logger,
	) {
		parent::__construct($request, $userSession);
	}

	/** GET /api/currencies */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function index(): DataResponse {
		return new DataResponse($this->currencyService->findAll($this->uid()));
	}

	/** POST /api/currencies */
	#[CORS]
	#[NoAdminRequired]
	public function create(): DataResponse {
		return new DataResponse($this->currencyService->create($this->uid(), $this->jsonBody()));
	}

	/** PUT /api/currencies/{id} */
	#[CORS]
	#[NoAdminRequired]
	public function update(int $id): DataResponse {
		return new DataResponse($this->currencyService->update($this->uid(), $id, $this->jsonBody()));
	}

	/** DELETE /api/currencies/{id} */
	#[CORS]
	#[NoAdminRequired]
	public function destroy(int $id): DataResponse {
		try {
			$this->currencyService->delete($this->uid(), $id);
			return new DataResponse(['status' => 'ok']);
		} catch (\OCA\FinTrack\Exception\CurrencyInUseException $e) {
			return new DataResponse(['error' => $e->getMessage()], 409);
		}
	}

	/**
	 * GET /api/exchange-rate?from=USD&to=INR
	 * Fetches a live conversion rate. Tries the free Frankfurter API first
	 * (https://api.frankfurter.dev — see "About" in Settings); Frankfurter only
	 * publishes ECB reference rates (~30 major currencies), so Gulf currencies
	 * such as SAR/AED are never in that set. For those — or for any pair
	 * Frankfurter can't resolve — we fall back to exchangerate.host
	 * (https://api.exchangerate.host/convert?from=SAR&to=INR), which requires a
	 * free personal access key stored in Settings → Currency Rate API Key.
	 */
	#[NoCSRFRequired]
	#[CORS]
	#[NoAdminRequired]
	public function exchangeRate(): DataResponse {
		$from = strtoupper(trim((string)$this->request->getParam('from', '')));
		$to   = strtoupper(trim((string)$this->request->getParam('to', '')));
		if ($from === '' || $to === '') {
			return new DataResponse(['error' => 'from and to currency codes are required'], 400);
		}
		if ($from === $to) {
			return new DataResponse(['from' => $from, 'to' => $to, 'rate' => 1.0]);
		}

		// Per-currency API preference (Settings → Currencies): 'auto' (try
		// Frankfurter first, fall back to exchangerate.host), 'frankfurter',
		// or 'exchangerate_host'. Keyed by the "from" currency since that's
		// the one the person picked a preference for. Defaults to 'auto'
		// for anyone who hasn't set one, preserving prior behavior.
		//
		// Written as three explicit branches (rather than one combined
		// "should we try Frankfurter" boolean) so it's unambiguous: a
		// manually-selected provider is used strictly, with NO fallback to
		// the other provider — fallback only ever happens under 'auto'.
		$apiPref = $this->settingsService->get($this->uid(), 'fx_api_pref_' . $from, 'auto');

		if ($apiPref === 'exchangerate_host') {
			return $this->fetchExchangerateHostRate($from, $to);
		}

		$unsupportedByFrankfurter = ['SAR', 'AED', 'QAR', 'KWD', 'BHD', 'OMR', 'JOD', 'LBP', 'IQD', 'YER'];
		$frankfurterCoversPair = !in_array($from, $unsupportedByFrankfurter, true) && !in_array($to, $unsupportedByFrankfurter, true);

		if ($apiPref === 'frankfurter') {
			if ($frankfurterCoversPair) {
				$result = $this->tryFrankfurterRate($from, $to);
				if ($result !== null) {
					$this->saveLastFetchedRate($from, $to, (float)$result['rate']);
					return new DataResponse($result);
				}
			}
			// Explicit Frankfurter-only preference but no rate available —
			// fail fast instead of silently using exchangerate.host, which
			// the person didn't choose.
			return new DataResponse(['error' => "Frankfurter has no rate for $from → $to. Choose \"Automatic\" or exchangerate.host in Settings → Currencies to allow the fallback, or enter the rate manually."], 422);
		}

		// $apiPref === 'auto' (or any legacy/unrecognized value): try
		// Frankfurter, then fall back to exchangerate.host.
		if ($frankfurterCoversPair) {
			$result = $this->tryFrankfurterRate($from, $to);
			if ($result !== null) {
				$this->saveLastFetchedRate($from, $to, (float)$result['rate']);
				return new DataResponse($result);
			}
		}
		return $this->fetchExchangerateHostRate($from, $to);
	}

	/** Fall back to exchangerate.host, which covers Gulf and other currencies Frankfurter doesn't publish. */
	private function fetchExchangerateHostRate(string $from, string $to): DataResponse {
		$apiKey = trim($this->settingsService->get($this->uid(), 'exchangerate_host_api_key', ''));
		if ($apiKey === '') {
			return new DataResponse([
				'error'        => "$from → $to isn't available from the free Frankfurter rate service. Add a free exchangerate.host API key in Settings → Currency Rate API Key to enable this pair, or enter the rate manually.",
				'needsApiKey'  => true,
				'signupUrl'    => 'https://exchangerate.host/signup',
			], 422);
		}

		try {
			$client   = $this->clientService->newClient();
			$response = $client->get('https://api.exchangerate.host/convert', [
				'query'       => ['from' => $from, 'to' => $to, 'amount' => 1, 'access_key' => $apiKey],
				'timeout'     => 8,
				// Nextcloud's HTTP client throws on any non-2xx response by default,
				// which previously made a 4xx/5xx from exchangerate.host (invalid key,
				// wrong plan, rate limit, etc.) indistinguishable from a genuine network
				// failure — both ended up in the catch block below and always showed the
				// same "could not reach" message. Disabling http_errors lets us read the
				// actual response body and report what really went wrong.
				'http_errors' => false,
			]);

			$status = $response->getStatusCode();
			$data   = json_decode($response->getBody(), true);

			if ($status < 200 || $status >= 300 || empty($data['success']) || !isset($data['result'])) {
				$msg = $data['error']['info']
					?? $data['error']['type']
					?? (is_array($data) ? "HTTP $status from exchangerate.host" : 'malformed response');
				$this->logger->warning('FinTrack: exchangerate.host convert {from}->{to} failed: HTTP {status} — {msg}', [
					'from' => $from, 'to' => $to, 'status' => $status, 'msg' => $msg,
				]);
				return new DataResponse(['error' => "exchangerate.host could not convert $from → $to ($msg). Please enter the rate manually."], 422);
			}

			$rate = $data['info']['quote'] ?? ($data['result'] / max($data['query']['amount'] ?? 1, 1));
			$this->saveLastFetchedRate($from, $to, (float)$rate);
			return new DataResponse(['from' => $from, 'to' => $to, 'rate' => (float)$rate, 'date' => $data['date'] ?? null, 'source' => 'exchangerate.host']);
		} catch (\Exception $e) {
			// A true network-level failure (DNS, TLS, timeout, connection refused) —
			// this is the only case that should still show the generic "could not
			// reach" message. We now log the real exception so it's diagnosable from
			// nextcloud.log instead of only ever seeing the friendly UI text.
			$this->logger->warning('FinTrack: exchangerate.host convert {from}->{to} threw: {msg}', [
				'from' => $from, 'to' => $to, 'msg' => $e->getMessage(), 'exception' => $e,
			]);
			return new DataResponse([
				'error' => "Could not reach exchangerate.host for $from → $to. Please check the API key in Settings, or enter the rate manually.",
			], 422);
		}
	}

	/**
	 * POST /api/exchange-rate/test
	 * Health-check for the exchangerate.host API key, used by the "Test Key"
	 * button in Settings. Pings the API with a cheap, well-known pair
	 * (USD → EUR) so a bad key, wrong plan, or rate-limit shows up
	 * immediately at save-time instead of mid-transaction on some obscure
	 * pair like SAR → INR.
	 *
	 * Accepts an optional 'apiKey' in the JSON body so the currently-typed
	 * value can be tested before it's saved; falls back to the saved key
	 * if none is provided.
	 */
	#[CORS]
	#[NoAdminRequired]
	public function testExchangeRateApiKey(): DataResponse {
		$body   = $this->jsonBody();
		$apiKey = trim((string)($body['apiKey'] ?? ''));
		if ($apiKey === '') {
			$apiKey = trim($this->settingsService->get($this->uid(), 'exchangerate_host_api_key', ''));
		}
		if ($apiKey === '') {
			return new DataResponse(['ok' => false, 'message' => 'No API key to test — paste one in the field first.'], 400);
		}

		try {
			$client   = $this->clientService->newClient();
			$response = $client->get('https://api.exchangerate.host/convert', [
				'query'       => ['from' => 'USD', 'to' => 'EUR', 'amount' => 1, 'access_key' => $apiKey],
				'timeout'     => 8,
				'http_errors' => false,
			]);

			$status = $response->getStatusCode();
			$data   = json_decode($response->getBody(), true);

			if ($status < 200 || $status >= 300 || empty($data['success']) || !isset($data['result'])) {
				$msg = $data['error']['info']
					?? $data['error']['type']
					?? (is_array($data) ? "HTTP $status from exchangerate.host" : 'malformed response');
				$this->logger->info('FinTrack: exchangerate.host key test failed: HTTP {status} — {msg}', [
					'status' => $status, 'msg' => $msg,
				]);
				return new DataResponse(['ok' => false, 'message' => "Key test failed: $msg"], 200);
			}

			return new DataResponse(['ok' => true, 'message' => 'Key works — sample rate 1 USD = ' . $data['result'] . ' EUR.']);
		} catch (\Exception $e) {
			$this->logger->info('FinTrack: exchangerate.host key test threw: {msg}', ['msg' => $e->getMessage()]);
			return new DataResponse(['ok' => false, 'message' => 'Could not reach exchangerate.host: ' . $e->getMessage()], 200);
		}
	}

	/**
	 * Remembers the last successfully fetched online rate for a given
	 * currency pair, keyed per-pair (e.g. "fx_last_rate_USD_INR") in the
	 * same per-user settings table already loaded in full on every page
	 * load (see SettingsController::index / boot() in fintrack-main.js) —
	 * so retrieval on the client is free, no extra round-trip needed.
	 */
	/**
	 * Remembers the last successfully fetched online rate for a given
	 * currency pair, keyed per-pair (e.g. "fx_last_rate_USD_INR") plus its
	 * fetch timestamp ("fx_last_rate_ts_USD_INR", unix seconds) in the
	 * same per-user settings table already loaded in full on every page
	 * load (see SettingsController::index / boot() in fintrack-main.js) —
	 * so retrieval on the client is free, no extra round-trip needed. The
	 * timestamp backs the "Last updated: ..." sub-label shown next to the
	 * conversion-rate field on the New Transaction / New Transfer forms.
	 */
	private function saveLastFetchedRate(string $from, string $to, float $rate): void {
		$this->settingsService->set($this->uid(), 'fx_last_rate_' . $from . '_' . $to, (string)$rate);
		$this->settingsService->set($this->uid(), 'fx_last_rate_ts_' . $from . '_' . $to, (string)time());
	}

	/** Returns ['from'=>,'to'=>,'rate'=>,'date'=>] from Frankfurter, or null if unavailable. */
	private function tryFrankfurterRate(string $from, string $to): ?array {
		try {
			$client   = $this->clientService->newClient();
			$response = $client->get('https://api.frankfurter.dev/v1/latest', [
				'query'   => ['from' => $from, 'to' => $to],
				'timeout' => 8,
			]);
			$data = json_decode($response->getBody(), true);
			$rate = $data['rates'][$to] ?? null;
			if ($rate === null) {
				return null;
			}
			return ['from' => $from, 'to' => $to, 'rate' => (float)$rate, 'date' => $data['date'] ?? null, 'source' => 'frankfurter'];
		} catch (\Exception $e) {
			return null;
		}
	}
}
