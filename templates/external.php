<?php
/**
 * FinTrack external entry point — templates/external.php
 *
 * Was previously a self-contained token-authenticated quick-entry form
 * (fintrack-external.js). Replaced by the FinTrack PWA (see
 * FinTrackPWA/README.md): a full offline-capable app that authenticates
 * via Nextcloud's Login Flow v2 (through LoginProxyController) and talks
 * to the same internal REST API (api/...) the Nextcloud app uses, rather than
 * the limited token-only external/... endpoints.
 *
 * Assets copied in from the PWA build, in load order matching its
 * index.html (crypto -> db -> pin -> api -> app -> sections):
 *   js/pwa-crypto.js, js/pwa-db.js, js/pwa-pin.js, js/pwa-api.js,
 *   js/pwa-app.js, js/pwa-sections.js, css/pwa.css, img/pwa-icons/*.
 *
 * @var array $_
 */
\OCP\Util::addStyle('fintrack', 'pwa');
\OCP\Util::addScript('fintrack', 'pwa-crypto');
\OCP\Util::addScript('fintrack', 'pwa-db');
\OCP\Util::addScript('fintrack', 'pwa-pin');
\OCP\Util::addScript('fintrack', 'pwa-api');
\OCP\Util::addScript('fintrack', 'pwa-app');
\OCP\Util::addScript('fintrack', 'pwa-sections');
?>
<div id="app-root" data-server-url="<?php echo htmlspecialchars($_['serverUrl'], ENT_QUOTES, 'UTF-8'); ?>" data-sw-url="<?php echo htmlspecialchars($_['swUrl'], ENT_QUOTES, 'UTF-8'); ?>" data-icon-base="<?php echo htmlspecialchars($_['iconBase'], ENT_QUOTES, 'UTF-8'); ?>" data-fintrack-version="<?php echo htmlspecialchars($_['fintrackVersion'], ENT_QUOTES, 'UTF-8'); ?>"></div>
