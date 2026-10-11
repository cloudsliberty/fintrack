# Changelog
All notable changes to FinTrack are documented in this file.

## [1.22.1] - 2026-08-08
### Changed
- **Backups now include secrets, encrypted.** The External Access token, PIN Lock (hashes, reset question, timeout) and exchangerate.host API key are sealed into one `secrets` block using Nextcloud's `ICrypto` (keyed from the server's `config.php` secret); everything else stays plain JSON. This replaces 1.21.1's behavior of leaving them out. Applies to the automatic pre-reset / pre-restore backups in Files, "Download Backup", and the browser fallback after a reset.
- Backup code rewritten into `BackupService` (compose, write to Files, seal/open secrets, restore merge). "Download Backup" now comes from the server (`GET /api/settings/backup`) so secrets never reach the browser in clear text.
- **Restore never changes your current PIN, token or API key.** The backup only fills ones that are missing (e.g. after Reset All Data); the PIN Lock is restored as one group and only if no PIN is set. If the backup came from another server (or is damaged) its secrets can't be opened — data still restores and the app says the secrets were skipped. Old plain-text `lock_*`/`api_token` in pre-1.21.1 backups are ignored.
- Backups gain `backupFormat: 2`.
- What's new modal: shown only for versions that have their own entry (1.22.0); patch releases just record the version.
### Docs
- README: backup/privacy wording, Nextcloud 32+, usage-ping section shortened, several stale notes removed.

## [1.22.0] - 2026-08-07
### Fixed
- **Balances with 1,000+ transactions.** The web UI and PWA now page through `/transactions` (stable `date, id` order, up to 5000 per request) instead of reading one truncated page, so account balances and totals are correct.
- **Currency defaults.** External submit, quick-add and any client that omits `currency` now use the target account's currency instead of `USD` (transactions create/update, recurring create).
- **Recurring.** `update()` now writes the currency (re-derived from the account). `advanceDate()` steps from the scheduled date, not "now", so overdue rules catch up and post on their scheduled dates; new `anchor_day` column (migration 1015) stops month-end drift (31st → Feb 28 → Mar 31).
- **Conversion rates.** Saving a transaction or importing CSV rows with a per-row rate no longer overwrites the currency's stored rate (opt in with `updateCurrencyRate`).
- **Restore.** Transactions/transfers restore oldest-first, and the whole restore (wipe + import) runs in one DB transaction that rolls back on error. If the Files safety snapshot can't be written, restore aborts before touching any data.
- **PWA toggle.** Disabling "Enable PWA access" really disables it and says so — the action parser never passed `el.checked`, so the box always acted as "on". (Fixes the same class of bug anywhere `el.checked` is used.)
- **Offline.** The service worker (cache v9) now caches the PWA page and manifest on installs whose URLs contain `/index.php/`; only API/auth routes are excluded.
- **Job retries.** Recurring auto-post caps catch-up at 60 per rule per run and backs off failing rules (15 min doubling to 24 h) instead of retrying them up to 60 times per run.
### Added
- First open: after the welcome screen, offers to create the default income/expense categories (same as Settings → Starter Set) when there are none.
- PWA Settings → **Appearance**: Dark, Light, or Automatic (dark 6 pm – 6 am).
- **What's new** modal once after an upgrade; it also sends the standard usage ping so the install ID is recorded on the new version (README updated).
- Alerts now read `FinTrack: <description> (<amount>)`.
### Changed
- Exception classes moved to `lib/Exception/` (`OCA\FinTrack\Exception`).
- `summary()` counts transactions with one `COUNT(*)` query instead of loading every row.

## [1.21.1] - 2026-08-06
### Security
- `POST /api/settings` now accepts only an explicit allowlist of keys (plus `fx_api_pref_<CODE>`); anything else (e.g. `lock_enabled`, lockout counters, `api_token`) is rejected with 400 and nothing is saved.
- `GET /api/settings` no longer returns `lock_password_hash`, `lock_reset_answer_hash`, `api_token` or the exchangerate.host API key. It returns `exchangerate_host_api_key_set` (`'1'`/`'0'`) instead; the Settings field is blank when a key is stored and a blank save keeps the saved key.
- Backups (Files and JSON export) no longer contain the FX API key, PIN hashes or lock counters. Restore ignores `lock_*`/`api_token` from the file and keeps the install's current PIN, token and FX key (an FX key in an older backup is used only if none is stored).
### Fixed
- `TransferService::create` validates accounts (both required, different, owned by the user) and amounts (finite, > 0; `toAmount` defaults to `fromAmount × conversionRate`); invalid requests return 400. Restore skips invalid transfers instead of aborting.
- `AccountsController` rejects account types other than asset / liability / revenue / expense (400).
### Docs
- README and in-app About now disclose the usage ping (GET with install ID, Nextcloud version, FinTrack version, country) and that the setting only controls the country. PWA About notes the PWA sends nothing.
- README: biometric PIN is stored encrypted in IndexedDB (not `sessionStorage`).
- Stale comments fixed (`/entry` → `/pwa`, `js/api.js` → `js/pwa-api.js`, job registration docblock, service worker cache version v6 → v8).

## [1.21.0] - 2026-08-05
### Added
- **Nextcloud alerts for recurring transactions.** The background job now raises an alert (notification bell) for each recurring transaction on its exact trigger date, right after it posts. Enable/disable per rule from the rule's details (Nextcloud app: *Nextcloud alert* selector; PWA: checkbox). Default on, including existing rules.
- **Custom transaction reminders.** Any transaction can have an optional *Reminder date* (repayment of lent/borrowed money, upcoming bills, recharges…). A Nextcloud alert fires on that date, once; editing the date re-arms it, clearing/deleting the transaction removes the pending alert. Available in the Nextcloud app and PWA.
- **Settings → Report an Issue** (directly after About): opens `https://github.com/cloudsliberty/fintrack/issues/new`, with a prompt to attach the logs file downloadable from Settings. Added to both the Nextcloud app and the PWA.
- **Log file header.** *Settings → Download Logs* now starts with the Nextcloud instance UUID, FinTrack version, Nextcloud version and generation time. The file downloads even when no errors were captured.
- DB migration `Version1014`: `fintrack_recurring.alert_enabled`, `fintrack_transactions.reminder_date` / `reminder_sent`. New API fields: `alertEnabled` (recurring), `reminderDate` / `reminderSent` (transactions). Both are optional on write, so older clients (e.g. Android) are unaffected.
### Fixed
- **PWA — account pre-fill:** *New transaction* from inside an account's transaction screen now pre-fills that account.
- **PWA — dark mode headers:** modal/page headings ("New Transaction", "New Account", "New Transfer"…) were black on the dark background; now use the high-contrast app text colour.
- **PWA — clear (×) buttons:** now centred on the input regardless of wrapper height or Nextcloud's global button styles. The transaction *Search description* filter now has a clear button too.
- **PWA — dropdown selectors:** selected text was clipped halfway (Transaction/Account *Type*, Currency, Frequency, Period, PIN timeout…). Fixed globally for every `select`: auto height, proper line-height/padding, consistent font size, dark option lists.
- Service worker cache bumped (v7 → v8).

## [1.20.0] - 2026-08-04
### Added — Phase 1: PWA UI layout & alignment
- **Login/PIN screens** now vertically centered in the viewport, not just horizontally.
- **Accounts, Categories, Budgets, Transfers**: list rows now lay out in a responsive grid (`.list-grid`, same `auto-fill`/`minmax` pattern as the dashboard's stat cards) instead of one stacked column, so wide desktop screens actually get used — still collapses to a single column on mobile.
- **Accounts page**: account icon/emoji now renders next to the account name (`icon` was already a form field and saved correctly, it just was never displayed in the list — Categories already did this correctly, Accounts now matches it).
- **Search/filter boxes** added to the top of the Accounts and Categories pages for live client-side filtering by name.
- **Settings → About App**: GitHub/PayPal/Ko-fi buttons now share one `.ft-btn-link` class (uniform padding, border-radius, min-width) — previously GitHub used `.ft-btn-outline`'s sizing while the other two had their own smaller inline padding.
- **Currencies → Edit Currency modal**: now shows "Last updated: …" under the conversion-rate field (reusing the same `fx_last_rate_ts_*` settings keys the Transfer and New Transaction forms already read), updated live after a successful "Fetch live rate".
### Added — Phase 2: Offline caching
- **Service worker precache completed**: every icon size the manifest references (72–512px, maskable, apple-touch-icon) is now precached, not just 192/512 — icons could previously 404 offline even though the app shell itself loaded fine.
- **Audited offline login/PIN/session flow** (bootstrap → renderPinUnlock → FT_PIN.tryUnlock → enterApp): this was already built correctly — PIN unlock tries the local IndexedDB-encrypted decrypt first and only touches the network as a secondary check, session/settings-refresh calls are all wrapped so a network failure never throws past them, and the offline-inactivity wipe check reads purely from IndexedDB. No changes needed here beyond the icon caching above.
- **Deliberately not caching API responses** (`/index.php/...`) in Service Worker Cache Storage, despite "API entry points" being requested — that data is financial and already has a correct, secure offline story via encrypted IndexedDB (see `pwa-db.js`/`pwa-crypto.js`); caching it as plaintext HTTP responses in Cache Storage as well would be a real security regression, not just a style choice, so this file keeps that boundary intact.
- Service worker cache bumped again (v6 → v7).

## [1.19.8] - 2026-08-04
### Fixed
- **Scrolling — changed strategy entirely.** After several rounds of `!important` overrides aimed at making `html`/`body` scroll natively still not fixing it (including the fullscreen-specific override in 1.19.7, which — on checking browser vendor bug history — Chrome has never actually needed; that theory was wrong), stopped fighting Nextcloud core's cascade for the document-level scroll container. `#app-root` is now its own fixed-height (`100dvh`), self-scrolling box (`overflow-y: auto`), completely independent of whatever `html`/`body`/`#content` do above it — those are now pinned to `height:100%; overflow:hidden` on purpose, so there's exactly one scroll container and it's ours.
- **Deprecation warning**: `apple-mobile-web-app-capable` is Chrome-deprecated in favor of `mobile-web-app-capable`. Both are now emitted — Safari still only honors the apple- prefixed one, Chrome wants the new one.
- Service worker cache bumped again (v5 → v6).

## [1.19.7] - 2026-08-04
### Fixed
- **Scrolling broke again, specifically once fullscreen engaged**: the 1.19.6 fix made fullscreen actually work via the Fullscreen API — but Chrome/Safari's own UA stylesheet forces `overflow: hidden` on whatever element is the live Fullscreen target the instant it engages, which silently wins over our existing overflow rules and only shows up after fullscreen kicks in (not before, which is why earlier scroll fixes looked like they worked in testing). Added an explicit `html:fullscreen`/`:-webkit-full-screen` override.
- **Filter bar on the All Transactions page is now a collapsible `<div>`** (account/category/date/search + tags + Reset All Filters), collapsed/expanded via a "Filters" header button, defaults expanded, shows a "•" indicator when filters are active while collapsed.
- Service worker cache bumped again (v4 → v5).

## [1.19.6] - 2026-08-04
### Fixed
- **Actual root cause of "not scrollable" / "not fullscreen":** the 1.19.5 changelog claimed the viewport `<meta>` tag had been moved into `Util::addHeader()` along with manifest/favicon/apple-touch-icon — it hadn't; the call was simply never written. Without `width=device-width`, mobile browsers rendered the PWA at a ~980px desktop fallback width and zoomed-to-fit, which broke native touch scrolling and made the page visibly fail to fill the screen even in an installed window. Also added `viewport-fit=cover`, which `env(safe-area-inset-*)` throughout `pwa.css` already assumed was present.
- **Fullscreen never actually engaged:** `display:"fullscreen"` in the manifest is only a request — most browsers (Chrome for Android included) silently fall back to `standalone` for installed PWAs, and nothing in the code was calling the separate Fullscreen API that's actually required to hide the status/nav chrome. `pwa-app.js` now requests it via `element.requestFullscreen()` on the first tap after launch (Fullscreen API requires a user gesture, so it can't fire on load), only when running in an installed display mode.
- Service worker cache bumped again (v3 → v4).

## [1.19.5] - 2026-08-04
### Fixed
- **Found the actual root cause of "not installable" via Nextcloud's own `layout.base.php` source**: `templates/external.php`'s own `<link>`/`<meta>` tags (manifest, favicon, apple-touch-icon, viewport metas) were being rendered inside `<body><div id="content">`, not `<head>` — that's just how the 'base' layout works, our template's output *is* the body content, full stop. This meant `<link rel="manifest">` was never actually discoverable in `<head>` at all, so the browser had no way to know the page was installable — `beforeinstallprompt` could never fire no matter what the client-side JS did. All of these are now injected via `Util::addHeader()` (Nextcloud's actual supported mechanism, confirmed against core's real head-rendering order), and stripped from the template file, which now only contains real body content.
- **Install prompt listener attached too late**: `beforeinstallprompt` was only listened for after `DOMContentLoaded` (inside `bootstrap()`), but the event can fire earlier than that — a missed event is gone for that page load with no way to recover it. Moved the listener to script-parse time, before anything else runs.
- **Scrolling**: added explicit overrides for Nextcloud's actual core selectors confirmed from its source (`body#body-public.layout-base`, `#content.app-public`), on top of the generic ones from last round, in case core CSS targets those specifically with higher specificity.
- Service worker cache bumped again (v2 → v3) since `pwa-app.js` changed.

## [1.19.4] - 2026-08-04
### Fixed
- **Scroll/install still not working, likely from testing during the broken window**: 1.19.0–1.19.2 had a fatal registration error that broke the *entire app* (not just PWA routes) until 1.19.2/1.19.3 fixed it — any PWA testing done before then was against a non-functional app, not the actual fix.
- Hardened the scroll CSS with `!important` on `html`/`body`/`#app-root` overflow and height, in case Nextcloud's own core CSS was overriding it on source order.
### Note
Please test in a **private/incognito window** this time — this rules out any leftover service worker, cached manifest, or installed-PWA state from the broken versions in one step, with no manual cache-clearing needed.

## [1.19.3] - 2026-08-04
### Fixed
- **Fatal PHP error**: `Cannot use OCP\Util as Util because the name is already in use` — `use OCP\Util;` was accidentally added twice to `PageController.php` in 1.19.1. Removed the duplicate.

## [1.19.2] - 2026-08-03
### Fixed
- **App failed to install/enable**: `Call to undefined method IRegistrationContext::registerBackgroundJob()`. This call was in `Application.php` since before this round of changes — `IRegistrationContext` has no such method; background jobs must be registered via `<background-jobs>` in `appinfo/info.xml` instead. Fixed by removing the invalid call and adding `PostDueRecurringJob` to info.xml the correct way. This was breaking `occ app:enable` and every page load (WebDAV sync clients included) entirely.

## [1.19.1] - 2026-07-31
### Fixed
- **Root cause found for "none of the recent PWA fixes seem to have taken effect" (favicon, fullscreen, install prompt, scrolling all still looked old):** the service worker's cache name never changed across several rounds of fixes, and its old strategy was cache-first — so every already-installed PWA kept being served the stale HTML page, manifest, CSS, and JS it originally cached, no matter how many times those files changed on the server. Fixed by (a) bumping the cache name to force every existing install to purge its stale cache, and (b) switching the fetch strategy to network-first-with-cache-fallback, so future updates take effect immediately when online, while still keeping true offline capability as the fallback.
- **Favicon** now also injected via `Util::addHeader()` (Nextcloud's actually-supported mechanism for adding tags to the real page `<head>`) in addition to the template's own `<link>` tag — the plain template tag was apparently not reliably surfacing into the rendered `<head>` under the 'base' layout, which is why the favicon kept showing as Nextcloud's own icon even after pointing it at `app.svg`.
- **CSS bug**: the top-margin/gap reset introduced last round accidentally targeted `#app-content` — which is this app's own scrollable content container, not a Nextcloud wrapper — forcing `padding: 0 !important` onto it and fighting its own intended padding. Removed from the reset selector list.
### Note
If you already have the PWA installed from before this version, fully close all its open tabs/windows (or uninstall and reinstall it) once after updating — an already-running service worker keeps serving its old cache until every tab using it is closed, even after the server has the fix.

## [1.19.0] - 2026-07-31
### Changed
- **Currency badge**: default-currency indicator emoji changed from 🏅 to ⭐ (PWA Currencies page).
- **Currencies page live refresh**: fetching/saving a rate now re-renders the page immediately (the "1 base = X.XXXX" column previously stayed stale until a manual browser refresh, since the save handler never re-rendered after persisting).
- **Exchange-rate provider selection rewritten as an explicit 3-way branch** (auto / Frankfurter-only / exchangerate.host-only) instead of one combined boolean — a manually-selected provider now strictly never falls back to the other, with no ambiguity.
- **Ko-fi donation link** (`ko-fi.com/jaleel1618`) added alongside PayPal in: About FinTrack (Nextcloud app), the monthly donation reminder, the special-day alert (which had no donate links at all before), the PWA's About App card, and `info.xml`.
- **Biometric enable modal**: removed the "works every time you reopen the app, not just while it's still open" sentence.
- **PWA manifest**: display mode changed from `standalone` to `fullscreen` (with a `standalone`/`minimal-ui` fallback chain for browsers that don't support fullscreen).
- **PWA install prompt** now shows every time the app opens (previously suppressed forever after a "No", or for 3 days after "Later").
### Added
- **PWA layout modernization**: native document-level scrolling instead of a nested overflow container; aggressive top-margin/padding reset so there's no empty gap above the FinTrack header under Nextcloud's base layout; full-width content on screens larger than mobile (previously centered with a max-width); sticky desktop sidebar.
- **Bottom navigation redesign**: exactly 5 buttons on mobile — Dashboard, Transactions, Accounts, and Transfers, plus a **More** button that pops up a vertically-stacked menu (Recurring, Budgets, Categories & Tags, Currencies, Settings, Log Out) directly above it. Desktop keeps the full sidebar list.

## [1.18.1] - 2026-07-31
### Fixed
- **PWA favicon now uses the exact same icon file as the Nextcloud app.** Previously it pointed at a separately-generated `pwa-icons/icon-192.png`; it now points directly at `img/app.svg` — the same file Nextcloud itself uses for FinTrack's icon in its nav bar/app menu — so the two are guaranteed identical rather than just visually similar. (The PWA manifest icons and Apple touch icon, which need raster PNGs for platform/format reasons, are unchanged.)

## [1.18.0] - 2026-07-31
### Changed
- **Terminology**: "main app"/"Main App" replaced with "Nextcloud app" everywhere in the PWA codebase.
- **Nextcloud app wording**: removed the stale account-deletion warning text (accounts in use are marked inactive, never orphaned, so it no longer applied); removed the legacy "Share this link..." PWA paragraph; **Form URL** renamed to **PWA URL** and changed from a masked/PIN-gated text box to a plain clickable link + Copy URL button, since the PWA link no longer embeds a secret token; both exchangerate.host footer notes (Settings → General and the Currencies page) updated to the new wording.
- **PWA: no more default account pre-selection.** New Transaction, New Transfer (From/To), New Recurring Rule, and New Budget no longer default their account/currency picker to the first item — all four now require an explicit choice.
- **PWA modernization**: real fixed bottom navigation bar on mobile (previously a horizontally-scrolling row), centered max-width content on desktop, custom outline SVG nav icons replacing emoji, smaller font on the Type dropdown so options fit, `document.title` set to "FinTrack" (previously unset, relying on a generic Nextcloud default).
- **Biometric unlock now persists across full browser/app restarts.** Previously the cached PIN behind the biometric gate lived only in `sessionStorage` (cleared on tab/browser close), so biometric only worked within a single warm session. It's now stored (encrypted at rest with a random per-device key) in IndexedDB, so Face/Touch ID/device unlock works every time the app is reopened — documented clearly in code as a device-presence gate, not a hardware-secured credential, since the PIN itself remains the actual encryption key material.
### Added
- **Currency rate caching with a visible timestamp.** Extended an existing (but timestamp-less) last-fetched-rate cache with `fx_last_rate_ts_*`; the New Transaction and Transfer forms (Nextcloud app and PWA) now auto-prefill the conversion rate from the last successfully fetched value for that pair and show a "Last updated: ..." sub-label next to the Fetch button.
- **Recurring: Expiry Date field added to the PWA form.** The backend and Nextcloud app already fully supported an optional end date for recurring rules; the PWA form was simply missing the field. Now shown on the rule list too ("next ... · ends ...").
- **Offline mode.** The PWA now works meaningfully offline:
  - The **only** write action allowed while offline is creating a new transaction — it's queued locally (encrypted, in a per-identity IndexedDB store) instead of hitting the network. Every other create/edit/delete action (accounts, transfers, recurring rules, budgets, categories, tags, currencies, and editing existing transactions) is blocked with an explanatory message via a new shared `offlineGuard()` helper.
  - Queued transactions sync automatically once connectivity returns (proactive `online`/`offline` event detection, not just inferred from failed requests), on every app open, and via a manual "Sync Now" button.
  - **Duplicate detection before upload**: each queued entry's date+amount is checked against the transactions already on the server; a match prompts "A transaction with matching date (...) and amount (...) already exists. Do you still want to upload this entry?" before that specific entry uploads — declining discards just that one entry without blocking the rest of the queue.
  - New **Settings → Offline Pending Sync** dashboard lists every queued entry with a per-entry discard option and a manual sync button.
### Fixed
- **Lockout Cleanup**: PWA modal dialogs are appended to `document.body`, outside `#app-root` — so re-rendering the shell or PIN-unlock screen on a session timeout, inactivity re-lock, or logout never actually closed an open modal underneath it. Now closed explicitly at every lock/logout trigger, in both the Nextcloud app and the PWA.
- **`fuzzyCombo()` clear ('×') button misalignment**, fixed with a more robust flex-based centering approach instead of the previous absolute-position + transform trick; combo inputs and dropdown options also now truncate with an ellipsis instead of letting long selected text overflow illegibly.
- The PWA's `pending` IndexedDB object store had been scaffolded with the wrong keyPath (`id` instead of `key`) and was never actually wired up to anything — discovered and fixed while building the offline queue on top of it (recreated via a DB version bump; it held no data since it was unused).

## [1.17.4] - 2026-07-30
### Fixed
- **Revoking a PWA session didn't actually log the device out.** The PWA called its register endpoint (an upsert) on every single app open, which silently re-created a revoked session's row before the status check ever ran — so the revoke was undone by the very next login, and a fresh row appeared in its place instead of the device being logged out. Fixed by having the PWA remember locally (once, per device) that it already registered — every later app-open now only checks status instead of re-registering, so a revoked (deleted) row is correctly treated as "revoked" instead of "never seen."

## [1.17.3] - 2026-07-30
### Added
- **PWA session UID / remote-wipe system.** Every PWA install (a browser + Nextcloud account pairing) now generates its own session UID at login and registers it server-side (new `fintrack_pwa_sessions` table, migration `Version1013`, `PwaSessionService`, `PwaSessionsController`). *Settings → External Access - PWA* in the Main App lists every registered device with its last-synced time and a **Revoke** button — revoking deletes that UID server-side, and the PWA's own periodic check (on every app open, plus every 5 minutes while the tab stays open) notices the miss and immediately logs out and wipes that device's local cached data.
- **PWA data retention (inactivity auto-wipe).** *Settings → PWA data retention (days)* controls how long a PWA install can sit unused before it wipes its own local cache. Checked fully client-side and offline-capable at PWA cold-start, before even asking for the PIN — if the cached "last active" timestamp is older than the retention window, the device wipes and drops back to the login screen instead of prompting for a PIN just to discard it.

## [1.17.2] - 2026-07-30
### Changed
- **The old token-in-URL "External Entry Form" is fully replaced by the FinTrack PWA.** Route moved from `/apps/fintrack/entry` to `/apps/fintrack/pwa`. Settings → External Access is now **External Access - PWA**: the form-link label reads "Progressive Web App (PWA)" with updated copy, and the old "this link embeds your API token" warning line is removed since the PWA authenticates via full Nextcloud Login Flow v2, not a token in the URL.
- **PWA access requires Pin Lock (Mandatory PIN Policy).** A new Settings toggle enables/disables PWA access; turning it on without a PIN set prompts PIN creation first instead of silently allowing an unlocked PWA. Attempting to disable Pin Lock while PWA access is on now warns that PWA will be disabled too, and does so on confirm.
- **Per-currency live-rate provider selection**, replacing the previous always-try-Frankfurter-then-fallback behavior. Each currency on the Currencies page now has its own **Automatic** / **Frankfurter only** / **exchangerate.host only** dropdown (stored per-currency, no migration needed). The Currencies page footer note now discloses that exchangerate.host's free tier is capped at 100 lookups.
- **Deletion restraints, enforced server-side, everywhere:**
  - **Accounts** — deleting one with any linked transaction or transfer is blocked; it's marked inactive instead, with an explanatory message, instead of failing silently. The confirmation countdown for account deletion is now **5 seconds** (was 3).
  - **Categories** — blocked from deletion while used by any transaction, recurring rule, or budget (`CategoryInUseException`, 409).
  - **Tags** — new dedicated `POST /api/tags/delete` endpoint blocks deletion while a tag is still attached to any transaction or recurring rule (previously tag deletion had no usage check at all); a rename option was added next to each tag chip, cascading to every past transaction and recurring rule that used it.
  - **Currencies** — blocked from deletion while used by any account or transaction (previously only checked "used by an account" client-side, with no server-side enforcement at all).
- **Transfers: "Amount Received" is now a real readonly field**, calculated as Amount × Conversion Rate, instead of only showing the converted amount as inline text (Main App and PWA both).
- **Telemetry**: a missing/unshared country now reports `"world"` instead of a blank string.
- **info.xml**: version bumped, `productivity`/`office` categories added (`productivity` isn't a valid Nextcloud category enum value — see Fixed below — replaced with `organization`), description rewritten to the current feature set, "About FinTrack" made non-collapsible.
### Fixed
- **App failed to install with "appinfo file cannot be read."** Nextcloud validates `info.xml`'s `<category>` values against a fixed schema enum (`dashboard, security, customization, files, integration, monitoring, multimedia, office, organization, social, tools, games, search, workflow, ai`) — `productivity` isn't one of them, so the file failed XSD validation on `occ app:enable`. Replaced with `organization`.
### Added — PWA feature parity with the Main App
- **Fuzzy-search combo dropdowns** (with clear buttons) for Account and Category everywhere a picker or filter appears: Transactions (filters + New/Edit Transaction), Recurring (create/edit), Transfers (From/To account). New shared `fuzzyCombo()`/`tagComboInput()` components and `combo`/`tagcombo` field types in the PWA's form builder back all of them from one implementation.
- **Tags on the Transactions page**: a fuzzy combo filter with dismissible chips (previously there was no tag filter at all), plus a **Reset All Filters** button that appears whenever any filter is active.
- **Live currency conversion in the New/Edit Transaction modal** — a Conversion Rate field (manual entry or one-tap online fetch) appears when the selected account's currency differs from the base currency, matching the Main App.
- **Transfers**: From/To accounts converted to fuzzy combos; added Conversion Rate (manual + live-fetch) and the readonly Amount Received field described above.
- **Recurring rules**: explicit **Edit** action (previously only available by clicking the row); Account/Category converted to fuzzy combos; Tags converted to a chip input.
- **Categories & Tags page**: clicking a category now navigates to Transactions filtered to it (editing moved to its own button); tag chips gained a rename option (cascades to history) and now navigate to filtered Transactions on click; delete failures (in-use) now show the real reason instead of failing silently.
- **Currencies page**: delete button removed (currency deletion is Main-App-only, per the restraint above); added a live FX-rate fetch button next to the manual rate field in the edit modal; footer note pointing to the Main App for provider configuration.
- **External API page removed entirely** — it was a leftover from before the PWA merge and served no purpose once the PWA itself became the full-featured client.
- **Accounts page**: 5-second cancellable delete countdown (previously instant, after a plain confirm); clicking an account tile now navigates to Transactions filtered to that account, clearing other filters; in-use deletions show the "marked inactive" message rather than a generic error.
### Added — Login screen & Settings
- **App version now fetched dynamically** from Nextcloud's own app-info (`IAppManager::getAppVersion()`, the same source the Main App's About section uses) instead of a hardcoded placeholder — shown on the login/PIN screens and the new About App card in PWA Settings.
- **PIN input is center-aligned** on the unlock screen.
- **Biometric authentication (WebAuthn)**, with an important caveat documented in code: the PIN itself is the actual local-encryption key material, so this is a device-presence gate (Face/Touch ID, Windows Hello) layered on a PIN cached only in `sessionStorage` — not a hardware-backed replacement for the PIN, and it degrades safely to normal PIN entry once the tab/session ends.
  - Offered as a one-time prompt right after the first successful PIN setup or adoption on a device.
  - Auto-attempted on the unlock screen when enabled, with a manual "Unlock with biometrics" button too.
  - Enable/disable toggle in PWA Settings.
- **PWA Settings page**: removed the Base Currency editor (now shown as a badge on the Currencies page instead) and removed "Disable PIN" entirely (governed centrally by the Mandatory PIN Policy); added the Biometric toggle and a new About App card (version, developer info, GitHub link).

## [1.16.2] - 2026-07-16
### Fixed
- **Posting a recurring transaction ("Post" / "Post All Due") could fail with a bare, unhelpful 500 error and no message.** `RecurringController::post()` was the one mutating endpoint on this controller with no `try/catch` around it (unlike `create()`/`update()`), so any failure underneath — e.g. the recurring item no longer existing, or its linked account having been removed — bubbled up as an uncaught exception instead of a normal JSON error. It's now wrapped the same way as `create()`/`update()`, so the UI shows the real reason (e.g. "Recurring transaction not found") instead of a generic failure.
### Changed
- **Currencies sidebar icon replaced with a banknote-style SVG** (rectangle with a $ mark), using the same `currentColor` fill/opacity scheme as every other sidebar icon so it matches automatically in light/dark mode and the collapsed sidebar.

## [1.16.1] - 2026-07-16
### Fixed
- **CSV export summary showed currency symbols that render as an unreadable character for some currencies** (SAR's ﷼ in particular, depending on the opening app's encoding/font). The Total Income / Total Expense / Difference lines at the top of an exported CSV now show the currency **code** instead (e.g. `1,234.56 USD`), which is always plain ASCII. Per-row amounts were already unformatted plain numbers and unaffected.
### Added
- **Disabling a Protected Actions module now itself requires the PIN.** Previously any of the four checkboxes (Export CSV, Import CSV, Recently Deleted, External Entry Form) could be unchecked with no authentication at all — which defeated the point, since anyone at the keyboard could just turn a protection off before doing the thing it was meant to gate. Turning a module's protection **on** is unchanged (no PIN needed to make something more secure); turning one **off** now prompts for the PIN first, same as the actions it protects.

## [1.16.0] - 2026-07-16
### Changed
- **CSV upsert key simplified to the transaction's own id — the separate `import_key` column is gone.** The previous approach (Version1009: a generated epoch-millisecond key, set only at creation time) had a real gap: transactions created before that migration ran had no key at all and could never be matched by CSV upsert until manually re-exported once. Since every transaction already has a unique, permanent id, there's no need for a second identifier — `unique-key(for-updating)` in exports/imports now is simply each transaction's id. `fintrack_transactions.import_key` is dropped (migration `Version1010`); `TransactionService::bulkImport()`/`create()`/`mapRow()` no longer reference it.
- **"App Lock" renamed to "Pin Lock"** throughout Settings — section header, button labels, toast messages, and the admin PIN-reset-request page.
- **Pin Lock now protects four actions individually instead of one all-or-nothing switch.** New **Protected Actions** checklist under Settings → Pin Lock: exporting transactions to CSV (newly protected — previously not gated at all), importing transactions from CSV, viewing Recently Deleted, and the External Entry Form. The first three default **on** (matching how Import CSV and Recently Deleted already behaved — unconditionally gated whenever a PIN was set); External Entry Form stays **off** by default, unchanged from before. Removed the External Entry Form's old explanatory footnote ("Only takes effect once a PIN is set above...") since it's now self-evident from being grouped with the other three under Protected Actions.

## [1.15.3] - 2026-07-15
### Fixed
- **Opening "All Transactions" from the sidebar no longer carries over previously saved filters.** The Transactions page persists its filters (search, type, account, category, tag, date range) across visits by design, for links like "view this account's transactions" — but that meant a stale filter from a prior visit silently narrowed the list the next time someone just clicked **All Transactions** in the sidebar, with no visible reason why rows were missing. The sidebar link now clears all saved filters before navigating; deep links that intentionally set a filter (`navigateToTransactions()`, used by "view all" links elsewhere in the app) are unaffected since they call the page router directly, bypassing the sidebar's click handler.
### Changed
- **More fitting sidebar icons.** All Transactions (was a swap/transfer-style icon, easy to confuse with Transfers) is now a ledger/checklist icon; Revenue Accounts (was a generic trend-line arrow) is now a stacked-coins icon; Liability Accounts (was a plain info/exclamation circle — a poor fit for "debt") is now a minus-circle icon; Currencies (was a literal `$` glyph) is now a wallet icon.

## [1.15.2] - 2026-07-15
### Added
- **Detailed CSV import error reporting.** Previously a failed row only counted toward a generic "N invalid" figure with no explanation, and even the server's own per-row error messages (`TransactionService::bulkImport()` already built them) were discarded on the frontend — only a flat toast like "Imported 3, 17 failed" was shown. Row failures are now structured as `{row, column, message}` (e.g. `{row: 5, column: "amount", message: "Amount must be greater than zero"}`, `{row: 12, column: "date", message: "Invalid or missing date"}`), and a new **Import Results** dialog lists every failed row with its row number, the specific column that failed, and why — for both the Nextcloud-backed import and the standalone/demo fallback.
- **CSV-based update (upsert) via a new `unique-key(for-updating)` column.** Exporting transactions (Export CSV) now includes this column, populated with each transaction's `import_key` — its creation time as a raw epoch-millisecond number, assigned once and never changed. Re-importing that file matches each row against its key: a match **updates** the existing transaction in place (any account, any field) instead of creating a duplicate; a blank or non-matching key inserts a new transaction as before. The downloadable import template also includes the column, left blank on every sample row since blank always means "new". The CSV import preview table now shows an **Update** status (in addition to New/Duplicate/Invalid) for rows the client can already tell will match, and the results dialog reports an "N updated" count separately from "N imported". Backed by a new `fintrack_transactions.import_key` column (migration `Version1009`, indexed with `user_id`) — existing transactions created before this migration have no key until they're next exported, so they're unmatchable by CSV upsert until then but otherwise behave exactly as before.

## [1.15.0] - 2026-07-15
### Added
- **Icons on every modal dialog title** — Add Currency 💱, New/Edit Account 🏦, New/Edit/View Transaction 🧾, Deleting… ⏳, Recently Deleted 🗑️, New Transfer 🔁, New/Edit Budget 🎯, New/Edit Category 🏷️, Manage Tags 🏷️, New/Edit Recurring Transaction ⏱️, PIN Required 🔐, Import Transactions from CSV 📥, Reset All Data ⚠️, and the delete-confirmation dialogs (Delete Account, Delete Transaction, Delete Forever, Empty Trash) 🗑️.
- **CSV import now pre-selects the account already active in the Transactions filter.** If you filtered the Transactions page down to one account and then opened Import CSV from there, the import account dropdown previously always defaulted to the first account in the list regardless of context — now it pre-selects whichever account the Transactions filter currently has set (still changeable before importing).

## [1.14.2] - 2026-07-15
### Fixed
- **"View Recently Deleted" always failed with a 500.** `TransactionService::findTrash()` ran every row through `mapRow()` twice: once implicitly inside `rowsToArray()` (which already maps each row), then again explicitly on the *already-mapped* result. The second pass fed `mapRow()` an array shaped like `{accountId, tags: [...], date: "2026-07-10", ...}` instead of a raw DB row — in particular `tags` was already a decoded array, and passing an array into `json_decode()` (which requires a `string`) threw an uncaught `TypeError` under this file's `strict_types=1`, producing an unhandled 500 on every call. `pruneTrash()` had the same double-mapping pattern on a partial (`id`-only) select. Fixed by having `mapRow()` carry `deletedAt` through directly (so `findTrash()` just needs one pass via `rowsToArray()`) and having `pruneTrash()` read its single `id` column straight off the query result instead of routing it through `mapRow()` at all.
### Added
- **Icons on every Settings section header** — External Access 🔗, General Preferences ⚙️, App Lock 🔒, Data Management 🗄️ (and its subsections: Data Overview 📊, Categories & Tags 🏷️, Export ⬆️, Import ⬇️, Starter Set ✨, Backup Data 💾, Restore from Backup ♻️, Recently Deleted 🗑️, Error Logs 🪲, Import Transactions from CSV 📥, Auto-Categorization Rules 🧠), About FinTrack ℹ️, plus API Token 🔑 and External Entry Form 📱 under External Access.

## [1.14.1] - 2026-07-14
### Added
- **"Reset Filters" button on the Transactions page.** Previously only date range had a clear button ("Clear dates"); search, type, account, category, and tag filters had to be cleared one at a time. Replaced with a single **Reset Filters** button that clears all seven filter fields at once, shown whenever any of them is active.

## [1.14.0] - 2026-07-14
### Added
- **Recently Deleted (recycle bin) now requires the App Lock PIN to open**, same as the API token/form URL and backup export — `showTrashModal()` is gated behind `requirePin()`.
- **Custom "Install as an app?" prompt on the external entry form**, replacing the browser's default install banner with three explicit choices: **Yes** (triggers the real install), **Maybe Later** (dismisses for now but deliberately isn't persisted, so it's offered again next time), and **Cancel** (persisted in `localStorage` — never asked again on that browser/device). Nothing is sent to the server; the choice lives entirely in the browser's own `localStorage`.
- **External form / installed-PWA branding**: page title, `<title>`, and the installed app's home-screen name are now **"FinTrack - `<your-domain>`"** (e.g. "FinTrack - cloud.example.com") instead of a generic "FinTrack — Add Transaction", so multiple installed instances (different Nextcloud servers) are distinguishable. The PWA icon now explicitly matches the main app's icon (`app.svg`) via a proper `<link rel="icon">`/`<link rel="apple-touch-icon">`, which the page was previously missing entirely.

## [1.13.0] - 2026-07-14
### Added
- **Delete confirmation for accounts and transactions.** Both previously deleted immediately on click with no confirmation at all. Deleting an account now shows a confirm dialog, then (on confirm) a **3-second cancellable countdown** before it actually happens — a "Cancel" button on the countdown aborts with nothing deleted. Deleting a transaction shows a confirm dialog (no countdown, since it's now recoverable — see below).
- **Transactions recycle bin** — Settings → Data Management → **Recently Deleted**. Deleting a transaction no longer removes it outright: `TransactionService::delete()` now soft-deletes (sets `deleted_at` instead of `DELETE`-ing the row), and the last **100** deleted transactions per user are listed here with **Restore**, **Delete Forever**, and **Empty Trash**. Anything soft-deleted beyond the 100 most recent is hard-deleted automatically (`pruneTrash()`), same cap the request asked for. New endpoints: `GET /api/transactions/trash`, `POST /api/transactions/trash/{id}/restore`, `DELETE /api/transactions/trash/{id}`, `POST /api/transactions/trash/empty`. New migration `Version1008` adds the `deleted_at` column (nullable, indexed with `user_id`); all existing transaction queries (`findAll()`, `find()`, CSV-import duplicate detection) now filter `deleted_at IS NULL` so trashed items are invisible everywhere except the recycle bin itself.

## [1.12.0] - 2026-07-13
### Fixed
- **API Token and External Entry Form URL in Settings → External Access were visible/copyable with no PIN check**, even when App Lock was configured — the token field only self-masked by default (a plain "Show" toggle, no gate), and the Form URL field wasn't masked at all despite embedding that same token in a query param. Both now default to masked and route their Show/Copy actions through the existing `requirePin()` gate (same protection tier already used for backup export, CSV import, and full reset) — when a PIN is set, revealing or copying either one now prompts for it first; when no PIN is configured, behavior is unchanged.
- **Account/Dashboard/Reports totals for foreign-currency accounts converted using today's live currency rate instead of each transaction's own historical rate, disagreeing with the per-transaction totals shown everywhere else in the app.** `getAccountBalance()`/`getAccountIncome()`/`getAccountExpense()` sum native-currency amounts (correct, unchanged), but the Accounts page, `getTotalByType()`, and the Reports/Dashboard asset totals then converted that native sum with `convertAmount()` — the *current* currency table rate — rather than honoring `transactionAmountInBase()`'s per-transaction `conversionRate` snapshot the way Dashboard/Reports category and income/expense totals already did. Whenever the live rate had moved since a transaction (or CSV import) recorded its own rate, the account-level totals silently re-priced at today's rate and disagreed with the transaction-level totals. Added `getAccountBalanceInBase()` / `getAccountIncomeInBase()` / `getAccountExpenseInBase()`, which sum each transaction through `transactionAmountInBase()`, and switched every base-currency total (Accounts page stats, `getTotalByType()`, Dashboard total assets, Asset Allocation) to use them.
- **CSV import ignored the per-row `conversionRate` column for foreign-currency accounts, silently falling back to the currency's last-saved rate instead.** `TransactionService::bulkImport()` matched CSV column names by exact key only (`conversionRate`, `conversionrate`, `conversion_rate`, `rate`) — any other real-world header spelling, like `Conversion rate` with a space, didn't match, so `$rowRate` stayed `null` and every row silently repriced at whatever rate happened to be on file. Row lookups (date, type, amount, description, category, tags, notes, conversion rate) now go through a normalized, alias-tolerant matcher (`normalizeRowKeys()` / `rowValue()`) that ignores case, spaces, and underscores, so `Conversion rate`, `conversion_rate`, `conversionRate`, `Rate`, and `Exchange Rate` are all recognized.
- The CSV import modal now shows a column-mapping summary (which file header matched which expected field, and which weren't found) and a per-row preview table before import, with duplicate rows (matched against both the account's existing transactions and repeats within the same file) and invalid rows highlighted.
- The downloadable import template now includes a worked example of a `conversionRate` value on a foreign-currency row, instead of leaving that column blank on every sample row.

## [1.11.9] - 2026-07-13
### Added
- **Recurring transactions can now have an end date.** New optional "Ends On" field on the recurring transaction form — leave it blank to repeat indefinitely (previous behavior), or set a date and the item automatically pauses itself instead of posting once its next occurrence would fall after that date. The Recurring page now shows an "Expired" status badge (instead of "Paused") when it stopped this way, and the ends-on date under "Next Due" for anything that has one.
- **5 Years and 10 Years quick shortcuts on the Reports page**, alongside the existing 3 Months / 6 Months / 1 Year presets. The monthly trend chart's internal cap was also raised from 36 to 120 months so the 10 Years view isn't truncated.
- **Direct keyboard entry for account/category icons.** The emoji picker field was read-only (grid selection only) — it now accepts typing or pasting any emoji straight from your keyboard's own emoji picker, in addition to choosing from FinTrack's built-in grid. The button preview updates live as you type. The built-in grid also gained ~30 additional icons (food, transport, pets, health, clothing, and more).
### Fixed
- **The External Access API token was bundled into JSON backups and restores alongside the currency-rate API key**, both living unprotected in the same flat settings blob. The External Access token is a live per-install auth secret (used by the External Entry Form link), not user data — it's now excluded from "Download Backup", the server-side pre-reset/pre-restore snapshot, and the restore endpoint, the same way it was already protected from being overwritten via the regular Settings save. It regenerates automatically on next page load if a restore clears it. The currency-rate API key is unaffected and continues to back up and restore normally.
### Changed
- **The "Welcome to FinTrack!" toast on every app open** now shows "Welcome back!" or a time-of-day greeting (Good morning/afternoon/evening, based on local time), picked at random per load, instead of the same first-time-user message every single time.

## [1.10.0] - 2026-07-09
### Added
- **Upcoming Recurring card on the Dashboard.** Shows the next 3–5 recurring transactions due in the next 5 days (including anything already overdue), with a relative due label (Today/Tomorrow/In Nd/Overdue Nd) and a one-click "Post" from the Recurring page's row action. Empty state shown when nothing is due in the window.
- **Rule-based auto-categorization on CSV import.** New "Auto-Categorization Rules" section in Settings → Data Management: an ordered list of pattern → category rules. On import, any row without a category has its description checked against these rules (first case-insensitive substring match wins) and is categorized automatically; rows with an explicit category are left untouched. The import result toast now reports how many rows were auto-categorized. New endpoints: `GET/POST /api/category-rules`.
- **Automatic backup before Reset All Data.** Before a reset deletes anything, a full JSON snapshot of the user's data is now written to Nextcloud Files at `/fintrack/backup/fintrack-backup-<timestamp>.json`. If that write fails (permissions, quota, etc.), the reset still proceeds but the browser downloads the same JSON snapshot instead, so the data is never lost silently. The reset confirmation dialog now explains this.

## [1.9.1] - 2026-07-08
### Fixed
- **Exchange rate lookups for exchangerate.host-only pairs (e.g. SAR → INR) always failed with a generic "Could not reach exchangerate.host" error, even when the API key was valid.** Nextcloud's HTTP client throws an exception on any non-2xx response by default, so a real error from exchangerate.host (invalid key for the plan, missing parameter, rate limit, etc.) was indistinguishable from a genuine network failure and was always replaced with the same generic message. The request now reads the actual response body/status instead of letting the client throw on non-2xx, and reports the real reason back to the user.
- Both failure paths (HTTP error responses and true network exceptions) are now logged via the standard Nextcloud logger (`nextcloud.log`), so future issues are diagnosable server-side instead of only ever showing the friendly UI text.
- The exchangerate.host request now explicitly sends `amount=1`, matching the exact request shape known to succeed.
### Added
- **"Test Key" button in Settings → Currency Rate API Key.** Pings exchangerate.host with a cheap, well-known pair (USD → EUR) using the key currently typed in the field (no need to save first) and shows a clear ✅/❌ result inline, so key problems are caught immediately instead of mid-transaction on an obscure currency pair.
- New endpoint: `POST /api/exchange-rate/test`.

## [1.9.0] - 2026-07-08
### Changed
- Removed the investment-account feature (buy/sell tracking, purchase price/date, settlement, location) entirely. Existing investment accounts keep their core data; only the investment-specific metadata columns were dropped.
### Fixed
- Settings save-as-upsert now tries `INSERT` first and falls back to `UPDATE` on a unique-constraint violation, instead of relying on driver-specific "rows affected" semantics that could cause saving unchanged settings to fail.

---
Earlier history predates this file. See the [GitHub repository](https://github.com/cloudsliberty/fintrack) for full commit history.
