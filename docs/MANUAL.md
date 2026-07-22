# FinTrack for Nextcloud

**A full-featured personal finance manager, built directly into Nextcloud.**

FinTrack lets you track accounts, income, expenses, transfers, recurring
bills, and budgets — all stored in your own Nextcloud database, under your
own control.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Nextcloud](https://img.shields.io/badge/Nextcloud-32-00679E)](https://nextcloud.com)
[![PHP](https://img.shields.io/badge/PHP-%3E%3D8.1-777bb4)](https://php.net)

☕ **Support the devoleper if FinTrack useful to you** <a href="https://www.paypal.me/jaleel1618"><img alt="PayPal Donate" src="https://img.shields.io/badge/PayPal-Donate-00457C?logo=paypal&logoColor=white"></a> <a href="https://ko-fi.com/jaleel1618"><img alt="Ko-fi Support" src="https://img.shields.io/badge/Ko--fi-Support-FF5E5B?logo=ko-fi&logoColor=white"></a>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [User Guide](#user-guide)
  * [Dashboard](#dashboard)
  * [Accounts](#accounts)
  * [Transactions](#transactions)
  * [Transfers](#transfers)
  * [Recurring Transactions](#recurring-transactions)
  * [Budgets](#budgets)
  * [Categories & Tags](#categories--tags)
  * [Currencies](#currencies)
  * [Reports](#reports)
  * [External API / Remote Entry](#external-api--remote-entry)
  * [Pin Lock](#pin-lock)
  * [Settings & Data Management](#settings--data-management)
- [Technical Documentation](#technical-documentation)
  * [Architecture](#architecture)
  * [Directory Structure](#directory-structure)
  * [Database Schema](#database-schema)
  * [Internal REST API](#internal-rest-api)
  * [Public/External API](#publicexternal-api)
  * [Admin API (Pin Lock reset queue)](#admin-api-pin-lock-reset-queue)
  * [Security Model](#security-model)
  * [Telemetry & Privacy](#telemetry--privacy)
  * [Frontend](#frontend)
- [Migration History](#migration-history)
- [Development](#development)
- [Troubleshooting / FAQ](#troubleshooting--faq)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

FinTrack is a self-hosted personal finance app that runs as a native
Nextcloud application. It follows a classic ledger model with four account
types (Asset, Liability, Revenue, Expense), and layers on transfers,
recurring transactions (posted server-side on schedule, not just when the
app happens to be open), budgets, multi-currency support with per-user
online rate lookups, an app-local Pin Lock, and a token-authenticated public
form for adding transactions on the go.

All financial data is scoped per Nextcloud user and stored exclusively in
your Nextcloud database. FinTrack does make two kinds of outbound network
calls — optional online exchange-rate lookups, and a minimal non-financial
usage ping — both covered in detail in
[Telemetry & Privacy](#telemetry--privacy) below; administrators evaluating
this app for a privacy-sensitive deployment should read that section before
relying on the older "no external calls at all" description that applied to
early 1.0.x releases.

## Features

**Accounts**

- Four account types: **Asset**, **Liability**, **Revenue**, and **Expense**
- Per-account currency, icon, color, description, and active/inactive status
- A compact/expanded view and per-section (active/inactive) collapse state, remembered per browser via `localStorage`
- Click-through from an account tile straight to its filtered transaction list

**Transactions**

- Income and expense entries with amount, date, description, category, tags, and notes
- Full-text search plus filters by type, account, category, tag, and date range — persisted per browser/device in `localStorage`, not synced server-side
- Confirmation dialog before deleting a transaction; deletion is a **soft delete** (see Recently Deleted, below), not immediate and permanent
- Source tracking per transaction (`manual`, `import`, `recurring`, `external`, `quick-add`) so you can always tell where an entry came from
- A per-transaction **conversion rate** snapshot for foreign-currency accounts, frozen at entry time

**Recently Deleted (recycle bin)**

- Deleting a transaction sets `deleted_at` instead of removing the row
- The last 100 deleted transactions per user are listed under Settings → Data Management, with **Restore**, **Delete Forever**, and **Empty Trash**
- Anything soft-deleted beyond the 100 most recent is hard-deleted automatically the next time a transaction is deleted

**Transfers**

- Move money between two accounts, including **cross-currency transfers** with a stored conversion rate and independently tracked source/destination amounts
- Fuzzy account search in the picker

**Recurring Transactions**

- Daily, weekly, bi-weekly, monthly, quarterly, or yearly schedules, with an optional **end date** after which the item automatically deactivates (shown as "Expired")
- Posted automatically server-side by a background job (see [Architecture](#architecture)) — no need to have the app open on the due date
- One-click "Post" action from the UI creates the transaction early and advances the schedule the same way the background job does
- The Dashboard's "Upcoming Recurring" card shows the next 3–5 items due within 5 days (including anything overdue)

**Budgets**

- Category-based spending budgets with configurable limits and periods
- Visual progress bars comparing spend-to-date against the limit
- Active/inactive toggle so old budgets don't clutter your view

**Categories & Tags**

- Custom categories per transaction type (income / expense / transfer), each with its own icon and color
- Renaming a category cascades to every transaction, recurring rule, and budget that referenced the old name (categories are matched by name, not id)
- Free-form tags, shared across transactions and recurring rules, with autosuggest
- Tags are **case-insensitive**: `TagUtil::normalize()` trims, lowercases, and dedupes every tag on every write path (manual entry, CSV import, external API, category/tag import) so "Food"/"food"/"FOOD" are always one tag
- Renaming a tag (Settings → Categories & Tags) updates it everywhere at once, merging into an existing tag of the new name if one already exists
- Quick-add a brand-new category inline from the transaction form or the external entry form
- Export/import categories + tags as one JSON payload; a "create defaults" action seeds a starter set of common categories and tags

**Multi-Currency**

- Define any number of currencies with code, display name, symbol, and a conversion rate
- A configurable **base currency** used to normalize dashboard/report totals
- Online rate lookup: [Frankfurter](https://api.frankfurter.dev) (free, no key, ECB reference rates, ~30 major currencies) tried first; falls back to [exchangerate.host](https://exchangerate.host) (requires a free personal API key) for currencies Frankfurter doesn't publish (SAR, AED, QAR, KWD, BHD, OMR, JOD, LBP, IQD, YER)
- A "Test Key" action pings exchangerate.host with a cheap, well-known pair (USD→EUR) so a bad key surfaces immediately, not mid-transaction
- Conversion rates used in totals always prefer a transaction's own frozen rate over today's live rate (see `transactionAmountInBase()` in the frontend), so historical totals never silently re-price when a rate changes later

**Dashboard & Reports**

- At-a-glance stats: Net Worth, Total Assets, Total Liabilities, Cash Flow
- Recent transactions feed, active-budget summary, upcoming recurring items
- Top spending categories breakdown
- Income vs. Expense chart with 3-month / 6-month / 1-year / 5-year / 10-year quick ranges (the underlying monthly-trend calculation supports up to 120 months)
- Report export (browser print-to-PDF)

**External / Remote Entry**

- A dedicated, mobile-friendly public web form for adding transactions **without logging into Nextcloud**, installable as its own Progressive Web App (per-token manifest + service worker) titled "FinTrack - `<your-domain>`" so multiple installs stay distinguishable
- A **Quick Add** GET endpoint for use from Shortcuts, automations, or bookmarklets
- Per-user, regenerable **API token** authenticating all external/public requests
- On-the-fly category creation from the external form
- Optional Pin Lock gate on the form itself (see [Pin Lock](#pin-lock))

**Pin Lock**

- An app-local PIN/passphrase layered on top of Nextcloud's own login — session timeout, lockout after 5 failed attempts (15-minute cooldown), a self-service security-question reset, and an admin-approval reset flow as a last resort
- **Protected Actions**: independently toggle whether CSV export, CSV import, Recently Deleted, and/or the External Entry Form require the PIN; turning a protection *off* itself requires the PIN

**Data Management**

- CSV import with column-mapping summary, per-row preview (New/Update/Duplicate/Invalid), rule-based auto-categorization, and a detailed post-import results dialog
- CSV **upsert**: re-importing an exported file updates matching transactions by their own id instead of duplicating them
- JSON export ("Download Backup") and a working **Restore from Backup** that writes the snapshot back into the database (not just the browser's in-memory copy)
- Automatic pre-reset/pre-restore backup to Nextcloud Files at `/fintrack/backup/`, falling back to a browser download if the Files write fails

**Security & Integration**

- Runs entirely inside your Nextcloud instance for all financial data
- Full Content-Security-Policy compliance (no `unsafe-inline`; nonce-based script loading; an explicit, narrow CSP allowance for the telemetry endpoint — see [Telemetry & Privacy](#telemetry--privacy))
- CSRF protection on every session-authenticated, state-changing request
- Ownership checks (`assertOwner`) on every update/delete so users cannot modify each other's records
- A minimal, non-financial usage ping to a third-party endpoint — opt-out is partial (see [Telemetry & Privacy](#telemetry--privacy))

## Screenshots

> *Add screenshots of the Dashboard, Transactions, Budgets, and External Entry form here, e.g.*
>
> `![Dashboard](docs/screenshots/dashboard.png)`

## Requirements

| Requirement | Version                                                           |
| ----------- | ------------------------------------------------------------------ |
| Nextcloud   | 32                                                                  |
| PHP         | 8.1+                                                               |
| Database    | Any DB supported by Nextcloud (MySQL/MariaDB, PostgreSQL, SQLite)  |

> FinTrack currently declares `min-version` and `max-version` of **32** in `appinfo/info.xml`. If you are running a different Nextcloud major version, check compatibility before installing.

## Installation

### Option A — Nextcloud App Store

1. Log in to Nextcloud as an administrator.
2. Go to **Apps** → search for **FinTrack**.
3. Click **Download and enable**.

### Option B — Manual install from this repository

```
# From your Nextcloud installation's apps directory
cd /path/to/nextcloud/apps
git clone https://github.com/cloudsliberty/fintrack.git
```

Then, as an admin, enable it via the **Apps** page, or from the command line:

```
sudo -u www-data php occ app:enable fintrack
```

Nextcloud runs the database migrations automatically on first load (see
[Migration History](#migration-history) for the full list), creating the
required tables.

### Verifying the install

```
sudo -u www-data php occ app:list | grep fintrack
```

### Background job

Recurring transactions are posted server-side by `PostDueRecurringJob`, a
standard Nextcloud `TimedJob` that runs on whatever schedule your instance's
background job method (cron.php, AJAX, or webcron) is configured to use —
see **Settings → Administration → Basic settings → Background jobs**. No
separate cron entry specific to FinTrack is required.

## Getting Started

1. Open **FinTrack** from the Nextcloud app menu (top navigation bar).
2. On first load, FinTrack automatically generates a personal **API token**
   for you (used by the external entry form and Quick Add), and shows a
   one-time welcome screen with an optional country field for adoption
   analytics — see [Telemetry & Privacy](#telemetry--privacy).
3. Create your first **Account** (e.g. a checking account as an *Asset* account).
4. Add a **Transaction**, or set up a **Recurring Transaction** for a regular bill.
5. Visit the **Dashboard** to see your net worth and cash flow update in real time.

---

## User Guide

### Dashboard

The Dashboard is FinTrack's home page and gives you an immediate financial snapshot:

- **Net Worth** — total assets minus total liabilities
- **Total Assets** / **Total Liabilities** — sums of active accounts of each type, converted to your base currency using each transaction's own frozen conversion rate (not today's live rate)
- **Cash Flow** — total revenue minus total expenses
- **Recent Transactions**, **Budget Overview**, **Top Spending Categories**
- **Upcoming Recurring** — the next 3–5 recurring items due within 5 days (including anything overdue), with a one-click **Post**

All monetary totals are normalized to your configured **base currency**.

### Accounts

FinTrack organizes accounts into four types, each with its own section in the sidebar:

| Type          | Typical use                                                        |
| ------------- | ------------------------------------------------------------------ |
| **Asset**     | Bank accounts, cash, savings, investments                          |
| **Liability** | Credit cards, loans, mortgages                                     |
| **Revenue**   | Income sources (salary, freelance, etc.)                           |
| **Expense**   | Buckets for tracking spend outside of standard categories          |

For each account you can set: name, type, currency, description, icon,
color, and an active/inactive flag. Clicking an account tile takes you
directly to its transactions, pre-filtered. Each type's page remembers a
compact/expanded toggle and active/inactive section collapse state per
browser (`localStorage`, not synced across devices).

**To add an account:** Sidebar → the relevant account type → **+ New Account**.

### Transactions

The **All Transactions** page is your full ledger.

- **Add** a transaction with type (income/expense), account, amount, date, description, category, tags, and notes.
- **Search** by description, category, or tag using the search box.
- **Filter** by type, account, category, tag, and date range simultaneously; a **Reset Filters** button clears all of them at once. Filters persist per browser/device (`localStorage`) across visits, but the sidebar's **All Transactions** link always opens with filters cleared — only direct "view this account's/category's transactions" links intentionally carry a filter over.
- **Edit or delete** any transaction from the list — deleting asks for confirmation and soft-deletes (see [Recently Deleted](#settings--data-management)).
- **Import CSV**: see [Categories & Tags](#categories--tags) / the CSV Import subsection under [Settings & Data Management](#settings--data-management) for the full workflow.

CSV columns recognized (case/space/underscore-insensitive, several aliases per field): `date`, `type`, `amount`, `description`/`desc`, `category`, `tags`/`tag` (semicolon-separated within the cell), `notes`/`note`, `conversionRate`/`conversion_rate`/`rate`/`exchangeRate`/`fxRate` (and spaced/cased variants), and `unique-key(for-updating)` (see CSV upsert, below).

### Transfers

Use **Transfers** to move funds between two of your own accounts. If the
source and destination accounts use different currencies, FinTrack stores
both the source amount, the destination amount, and the conversion rate
used — so historical transfers stay accurate even if your exchange rates
change later.

### Recurring Transactions

Set up a recurring transaction once — name, type, account, amount,
category, frequency (**daily / weekly / bi-weekly / monthly / quarterly /
yearly**), and an optional **end date** — and FinTrack tracks its next due
date.

- **Posted automatically**: a background job (`PostDueRecurringJob`, a
  Nextcloud `TimedJob` with a 15-minute minimum interval) checks every
  active recurring item across every user and posts anything due, up to 60
  catch-up posts per item per run so a long-offline instance doesn't loop
  forever. This runs independent of anyone opening the app.
- Click **Post** on a due recurring item in the UI to generate the
  transaction immediately and roll the schedule forward the same way.
- Once its end date has passed at the next scheduled posting, the item is
  automatically deactivated and shown as **Expired** rather than **Paused**.
- Transactions created this way are tagged with `recurring` and linked back
  to the recurring rule that generated them (`recurringId`).

### Budgets

Budgets track spend against a limit for a given category over a period (e.g. monthly).

- Set a name, category, limit amount, currency, period, and start date.
- The Dashboard and Budgets page both show a progress bar of amount spent vs. limit.
- Deactivate a budget instead of deleting it to keep historical context.

### Categories & Tags

- **Categories** are typed (income / expense / transfer) and each carries an icon and color. Renaming one cascades the new name onto every transaction, recurring rule, and budget that referenced the old name, since these are matched by category name rather than id.
- **Tags** are free-form, case-insensitive labels attachable to any transaction or recurring rule, with autosuggest. Every write path (manual entry, CSV import, the external API, category/tag import) runs new tags through the same normalization, so casing differences never create silent duplicates. Rename a tag from Settings to relabel it everywhere at once — merging into an existing tag if the target name is already in use.
- New categories can be created inline, directly from the transaction entry form or the external entry form.
- Settings → Data Management lets you **export** categories + tags as one JSON payload, **import** one (existing names are left alone; only new ones are added, so it's safe to re-run), or **generate a starter set** of common categories/tags with one click.

### Currencies

Define every currency you use with a **code** (e.g. `USD`), **display
name**, **symbol**, and a **conversion rate** relative to your base
currency. FinTrack uses these rates to normalize dashboard totals and to
compute transfer conversions.

Rates can be entered manually, or fetched online from **Settings →
Currencies**: FinTrack tries [Frankfurter](https://api.frankfurter.dev)
first (free, no API key, ECB reference rates covering roughly 30 major
currencies), then falls back to
[exchangerate.host](https://exchangerate.host) for currencies Frankfurter
doesn't publish — the Gulf currencies SAR, AED, QAR, KWD, BHD, OMR, JOD,
LBP, IQD, and YER are always routed straight to exchangerate.host, since
Frankfurter never has them. exchangerate.host requires a free personal API
key, entered in **Settings → Currency Rate API Key**, with a **Test Key**
button that pings a cheap, well-known pair (USD→EUR) so a bad key or
exhausted plan is caught immediately rather than mid-transaction on an
obscure pair. Every successfully fetched rate is remembered per currency
pair.

Whenever a rate is entered on a specific transaction (rather than fetched
generically), that rate becomes the currency's new "official" rate going
forward — but the transaction itself keeps its own frozen snapshot
regardless of later changes.

### Reports

The **Reports** page provides:

- Month-over-month income vs. expense charting, with 3-month, 6-month,
  1-year, 5-year, and 10-year quick-range shortcuts (the trend calculation
  supports up to 120 months of history)
- Net worth history across your asset accounts
- A **spend-by-category** breakdown
- An **Export Report** action (uses your browser's Print → Save as PDF)

### External API / Remote Entry

FinTrack ships with a token-authenticated way to log transactions
**without a Nextcloud login** — useful for quick entry from a phone.

1. Go to **External Access** in Settings to view your personal API token
   and the ready-to-use external entry link. Both are masked by default
   and, if Pin Lock's "External Entry Form" Protected Action is checked,
   require your PIN to reveal or copy.
2. Bookmark the external entry link (`.../entry/{your-token}`) to your
   phone's home screen. It installs as its own PWA — titled
   "FinTrack - `<your-domain>`" with a matching per-token manifest and
   service worker — so multiple FinTrack installs stay distinguishable
   and the shortcut behaves like a native app rather than a browser tab.
3. Regenerate your token at any time if you believe it's been exposed —
   this immediately invalidates the old link/token.

If the External Entry Form Protected Action is enabled, opening the entry
link itself first prompts for the app's Pin Lock PIN (`GET
/external/lock-status`, `POST /external/lock-verify`) before showing the
form — a separate, opt-in gate from the main app's own lock, so sharing
the link doesn't silently break for people who don't know a PIN even
exists, unless you've explicitly turned this on.

Two ways to submit data externally:

- **Form-based**: the hosted `/entry/{token}` page — a mobile-friendly
  form with account/category/tag dropdowns, inline category creation, and
  the optional PIN gate above.
- **Quick Add URL**: a single GET request for use in Shortcuts,
  automations, or a browser bookmarklet, e.g.:

```
https://your-nextcloud.example.com/index.php/apps/fintrack/external/quick-add
  ?key=YOUR_TOKEN&amount=12.50&type=expense&account=3&category=Coffee&description=Latte
```

See [Public/External API](#publicexternal-api) for full endpoint details.

### Pin Lock

An optional PIN/passphrase layered on top of your normal Nextcloud login —
useful on a shared device, or if your Nextcloud session stays logged in
longer than you'd like your finances to be visible. The PIN itself is
never stored in plain text, only a `password_hash()` of it, and every
check happens server-side.

- **Setup**: Settings → Pin Lock. Choosing a PIN also lets you set an
  auto-lock **timeout** (minutes of inactivity before the lock screen
  reappears), and optionally a security question/answer pair for
  self-service recovery.
- **Lockout**: 5 incorrect PIN attempts trigger a 15-minute lockout. The
  security-question flow has its own, independent 5-attempt/15-minute
  lockout, so being locked out of one doesn't block the other.
- **Forgot your PIN?** If a security question is set, answering it
  correctly clears the PIN (same effect as disabling it) so you can set a
  fresh one. If there's no question, or you've forgotten the answer too,
  **Request Admin Approval to Reset PIN** files a request visible under
  **Admin Settings → FinTrack** and sends a Nextcloud notification to
  every member of the `admin` group; any admin can **Approve & Clear PIN**
  from there. Getting back in on your own (correct PIN or correct
  security answer) automatically cancels any request you filed, since
  it's no longer needed — this also clears the corresponding admin
  notification.
- **Protected Actions**: once a PIN is set, choose which of the following
  require it — **Export CSV**, **Import CSV**, **Recently Deleted**, and
  **External Entry Form** — each an independent checkbox. The first three
  default **on**; External Entry Form defaults **off** (opt-in, since it
  affects anyone with the form link). Turning a protection **off**
  itself requires the PIN, so someone at an already-unlocked session
  can't quietly weaken it.

### Settings & Data Management

- **General**: base currency, and the Currency Rate API Key (with Test Key).
- **Categories & Tags**: see [above](#categories--tags).
- **Auto-Categorization Rules**: an ordered list of pattern → category
  rules consulted during CSV import for rows without an explicit
  category — first case-insensitive substring match wins, so put more
  specific patterns before general ones.
- **CSV Import**: upload a file, review the column-mapping summary and
  per-row preview (rows flagged New / **Update** / Duplicate / Invalid),
  then commit. A row whose `unique-key(for-updating)` column matches an
  existing transaction's own id **updates** that transaction in place
  (any field, any account); everything else is checked against a
  (date, type, amount, description) fingerprint to skip exact duplicates
  already on the account or repeated within the same file. After import,
  an **Import Results** dialog lists every failed row with its row
  number, the specific column, and why.
- **Export**: CSV (with the upsert key column included) or a full JSON
  backup ("Download Backup").
- **Restore from Backup**: upload a previously exported JSON backup to
  replace all of your current FinTrack data with its contents. Before
  anything is overwritten, whatever currently exists is itself
  snapshotted to Nextcloud Files the same way a reset's pre-backup works.
  Accounts are recreated first (getting new ids) and every other entity's
  account references are remapped accordingly; rows referencing an
  account missing from the backup are skipped rather than aborting the
  whole restore. The stored External Access API token is deliberately
  **not** overwritten by a restore, so an already-shared external form
  link doesn't silently break.
- **Recently Deleted**: the transaction recycle bin — see
  [Features](#features).
- **Error Logs**: recent FinTrack-related entries surfaced from
  Nextcloud's own logger, for troubleshooting without needing shell
  access to `nextcloud.log`.
- **Starter Set**: one-click default categories + tags.
- **Reset All Data**: permanently deletes every FinTrack record for your
  account (accounts, transactions, transfers, budgets, categories,
  currencies, recurring rules, and settings/tags/API token). A full JSON
  snapshot is written to `/fintrack/backup/` in your Nextcloud Files
  first; if that write fails for any reason, the reset still proceeds but
  the same data is handed back to the browser as a downloadable file
  instead, so nothing is lost silently.
- **About**: version and credits, plus the [telemetry](#telemetry--privacy)
  disclosure and the country-sharing toggle.

---

## Technical Documentation

### Architecture

FinTrack is a standard Nextcloud app built on the **AppFramework**
(MVC-style: Controllers → Services → Database), with a **vanilla
JavaScript** single-page frontend (no build step, no framework dependency)
rendered into the Nextcloud page shell.

```
Browser (fintrack-main.js / fintrack-core.js)
        │  fetch() + NC requesttoken (CSRF)
        ▼
Per-resource Controller (Accounts/Transactions/Transfers/Budgets/
Categories/Currencies/Recurring/Settings/Lock)  — session-authenticated
        │
        ▼
Service layer (AccountService, TransactionService, ...)
        │
        ▼
Nextcloud QueryBuilder → your configured DB (MySQL/MariaDB/PostgreSQL/SQLite)
```

The external, no-login flow is a parallel, deliberately isolated path:

```
Browser (fintrack-external.js, public /entry/{token} page)
        │  fetch() + X-FinTrack-Token header (no NC session)
        ▼
ExternalController (#[PublicPage], token-authenticated)
        │
        ▼
Same Service layer, scoped to the token's owning user
```

Recurring transactions have a second entry point that never goes through
a browser at all:

```
Nextcloud's background-job runner (cron.php / AJAX / webcron)
        │  invokes roughly every 15 minutes
        ▼
PostDueRecurringJob (TimedJob)
        │  RecurringService::findAllDue() → RecurringService::post()
        ▼
Same Service layer, iterated per due item, per user
```

Admin-facing PIN-reset approval is a third, admin-only surface:

```
Browser (Admin Settings → FinTrack page, fintrack-admin.js)
        │  fetch() + NC requesttoken
        ▼
AdminLockController::approve()  (no #[NoAdminRequired] — admin-only by default)
        │
        ▼
LockService::approveRequest()
```

This app used to have a single ~700-line `ApiController` handling every
resource; it is now split one controller per resource
(`AccountsController`, `TransactionsController`, `TransfersController`,
`BudgetsController`, `CategoriesController`, `CurrenciesController`,
`RecurringController`, `SettingsController`, `LockController`), the
standard Nextcloud pattern, sharing common request/CSRF/auth helpers via
`BaseApiController`.

### Directory Structure

```
fintrack/
├── appinfo/
│   ├── info.xml            # App metadata, version, Nextcloud compatibility
│   └── routes.php          # Route table (page, API, external API, admin)
├── css/
│   └── app.css             # Application styling
├── img/
│   └── app.svg             # Navigation icon
├── js/
│   ├── fintrack-main.js    # Bootstrap / state management / telemetry ping (loads first)
│   ├── fintrack-core.js    # Main SPA logic: pages, modals, rendering, client-side balances
│   ├── fintrack-external.js# Logic for the public /entry/{token} form
│   └── fintrack-admin.js   # Admin Settings → FinTrack (Pin Lock reset queue) page logic
├── lib/
│   ├── AppInfo/
│   │   └── Application.php        # App bootstrap; registers the background job + notifier
│   ├── BackgroundJob/
│   │   └── PostDueRecurringJob.php# Server-side recurring-transaction poster (TimedJob)
│   ├── Controller/
│   │   ├── BaseApiController.php  # Shared uid()/jsonBody()/CSRF conventions
│   │   ├── PageController.php     # Renders the SPA shell, external form, PWA manifest/SW
│   │   ├── AccountsController.php
│   │   ├── TransactionsController.php  # + Recently Deleted endpoints
│   │   ├── TransfersController.php
│   │   ├── BudgetsController.php
│   │   ├── CategoriesController.php    # + export/import/create-defaults
│   │   ├── CurrenciesController.php    # + exchange-rate lookup/test
│   │   ├── RecurringController.php     # + manual "post"
│   │   ├── SettingsController.php      # + tags/category-rules/token/summary/reset/restore
│   │   ├── LockController.php          # Pin Lock: status/setup/disable/verify/reset flow
│   │   ├── AdminLockController.php     # Admin-only: approve a PIN reset request
│   │   └── ExternalController.php      # Public, token-authenticated JSON API
│   ├── Db/
│   │   ├── Budget.php / BudgetMapper.php               # QBMapper-based (reference pattern)
│   │   └── PinResetRequest.php / PinResetRequestMapper.php
│   ├── Migration/
│   │   └── Version1000...–Version1012...php  # See Migration History
│   ├── Notification/
│   │   └── Notifier.php            # Renders the "pin_reset_request" admin notification
│   ├── Service/
│   │   ├── BaseService.php         # Shared QueryBuilder helpers, assertOwner(), deleteAll()
│   │   ├── AccountService.php
│   │   ├── TransactionService.php  # CRUD, CSV bulkImport(), Recently Deleted, tag rename
│   │   ├── TransferService.php
│   │   ├── BudgetService.php       # QBMapper-based (see Db/Budget*)
│   │   ├── CategoryService.php     # incl. rename cascade
│   │   ├── CurrencyService.php
│   │   ├── RecurringService.php    # incl. findAllDue() for the background job
│   │   ├── SettingsService.php     # per-user key/value store; insert-then-update upsert
│   │   ├── LockService.php         # Pin Lock business logic + admin-reset workflow
│   │   └── TagUtil.php             # Case-insensitive tag normalization, used everywhere
│   └── Settings/
│       ├── AdminSection.php        # "FinTrack" entry in Nextcloud Admin Settings nav
│       └── AdminSettings.php       # Renders the Pin Lock reset-request queue
├── templates/
│   ├── main.php             # SPA shell (authenticated)
│   ├── external.php         # Standalone public entry-form page (PWA-installable)
│   └── admin_settings.php   # Admin Settings → FinTrack page
└── composer.json
```

### Database Schema

All tables are prefixed `fintrack_`. Every table except `fintrack_settings`
(inherently per-user/key) and `fintrack_pin_resets` (its own `user_id`
column plays the same role) carries a `user_id` column, and every query
filters on it — there is no cross-user data access at the query layer.

| Table                   | Key columns                                                                                                                                                                          | Notes                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `fintrack_accounts`     | `id, user_id, name, type, currency, description, icon, color, active, created_at`                                                                                                     | `type` ∈ {asset, liability, revenue, expense}                        |
| `fintrack_transactions` | `id, user_id, account_id, type, amount(15,4), currency, conversion_rate(15,8) nullable, description, category, tags(JSON text), notes, date, source, recurring_id, deleted_at nullable, created_at` | Indexed on `user_id`, `account_id`, `date`, `type`; `deleted_at IS NULL` filters every normal query, non-null is the recycle bin |
| `fintrack_transfers`    | `id, user_id, from_account_id, to_account_id, from_amount, to_amount, from_currency, to_currency, conversion_rate(15,8), description, date, created_at`                              |                                                                        |
| `fintrack_budgets`      | `id, user_id, name, limit_amt, currency, period, category, active, start_date, created_at`                                                                                            | Managed via `BudgetMapper` (QBMapper), the reference pattern for the app |
| `fintrack_categories`   | `id, user_id, name, type, icon, color`                                                                                                                                                | Referenced by name (not id) from transactions/recurring/budgets       |
| `fintrack_currencies`   | `id, user_id, code, name, symbol, rate(15,8)`                                                                                                                                         |                                                                        |
| `fintrack_recurring`    | `id, user_id, name, type, account_id, amount, currency, frequency, next_date, end_date nullable, last_posted, category, description, tags, active, created_at`                       | Indexed on `user_id`, `next_date`                                     |
| `fintrack_settings`     | `id, user_id, key, value`                                                                                                                                                             | Unique on `(user_id, key)`; also stores each user's `api_token`, Pin Lock config, telemetry preferences, etc. |
| `fintrack_pin_resets`   | `id, user_id, display_name, status, created_at, resolved_at nullable`                                                                                                                 | One row per "Request Admin Approval to Reset PIN"; `status` ∈ {pending, approved, cancelled} |

Columns removed by later migrations no longer exist in a current install:
the investment-account metadata columns (`is_investment`,
`purchase_price`, `purchase_date`, `settled_date`, `settled_price`,
`location`) added in 1.x and the `import_key` upsert column are both gone
— see [Migration History](#migration-history).

### Internal REST API

All routes below live under the app's route prefix (typically
`/index.php/apps/fintrack/...` or `/apps/fintrack/...` depending on your
Nextcloud URL rewriting). They require an authenticated Nextcloud session;
mutating requests (POST/PUT/DELETE) require the standard Nextcloud CSRF
`requesttoken` header, which the bundled JS client attaches automatically.

| Method | Route                              | Description                                                                       |
| ------ | ----------------------------------- | ---------------------------------------------------------------------------------- |
| GET    | `/api/accounts`                     | List the current user's accounts                                                  |
| POST   | `/api/accounts`                     | Create an account                                                                 |
| PUT    | `/api/accounts/{id}`                | Update an account                                                                 |
| DELETE | `/api/accounts/{id}`                | Delete an account                                                                 |
| GET    | `/api/transactions`                 | List transactions (filters: `accountId, type, category, source, from, to, limit, offset`) |
| POST   | `/api/transactions`                 | Create a transaction                                                              |
| POST   | `/api/transactions/import`          | Bulk-import: `{ accountId, transactions: [...] }` — see `bulkImport()`            |
| PUT    | `/api/transactions/{id}`            | Update a transaction                                                              |
| DELETE | `/api/transactions/{id}`            | Soft-delete a transaction (moves it to Recently Deleted)                         |
| GET    | `/api/transactions/trash`           | List the Recently Deleted recycle bin (most recent first, capped at 100)         |
| POST   | `/api/transactions/trash/{id}/restore` | Restore a soft-deleted transaction                                            |
| DELETE | `/api/transactions/trash/{id}`      | Permanently delete one transaction from the recycle bin                          |
| POST   | `/api/transactions/trash/empty`     | Permanently empty the entire recycle bin                                         |
| GET    | `/api/transfers`                    | List transfers                                                                    |
| POST   | `/api/transfers`                    | Create a transfer                                                                 |
| DELETE | `/api/transfers/{id}`               | Delete a transfer                                                                 |
| GET    | `/api/budgets`                      | List budgets                                                                      |
| POST   | `/api/budgets`                      | Create a budget                                                                   |
| PUT    | `/api/budgets/{id}`                 | Update a budget                                                                   |
| DELETE | `/api/budgets/{id}`                 | Delete a budget                                                                   |
| GET    | `/api/categories`                   | List categories                                                                   |
| POST   | `/api/categories`                   | Create a category                                                                 |
| PUT    | `/api/categories/{id}`              | Update a category (cascades a rename to transactions/recurring/budgets)          |
| DELETE | `/api/categories/{id}`              | Delete a category                                                                 |
| GET    | `/api/categories/export`            | Export categories + tags as one JSON payload                                     |
| POST   | `/api/categories/import`            | Import categories + tags (existing names/tags are left alone)                    |
| POST   | `/api/categories/create-defaults`   | Seed a starter set of common categories + tags                                   |
| GET    | `/api/currencies`                   | List currencies                                                                   |
| POST   | `/api/currencies`                   | Create a currency                                                                 |
| PUT    | `/api/currencies/{id}`              | Update a currency                                                                 |
| DELETE | `/api/currencies/{id}`              | Delete a currency                                                                 |
| GET    | `/api/exchange-rate?from=&to=`      | Live rate lookup — Frankfurter first, exchangerate.host fallback (see [Currencies](#currencies)) |
| POST   | `/api/exchange-rate/test`           | Test an exchangerate.host API key (body: optional `apiKey`, else the saved one)   |
| GET    | `/api/recurring`                    | List recurring rules                                                             |
| POST   | `/api/recurring`                    | Create a recurring rule                                                          |
| PUT    | `/api/recurring/{id}`               | Update a recurring rule                                                          |
| DELETE | `/api/recurring/{id}`               | Delete a recurring rule                                                          |
| POST   | `/api/recurring/{id}/post`          | Post a due recurring rule → creates a transaction, advances `next_date`, wrapped in try/catch so failures return a normal JSON error |
| GET    | `/api/summary`                      | Dashboard summary (base currency, counts, currencies)                            |
| GET    | `/api/settings`                     | Get the current user's settings                                                  |
| POST   | `/api/settings`                     | Save settings (the `api_token` key is stripped/blocked on this endpoint)         |
| GET    | `/api/tags`                         | Get the user's saved tag list                                                    |
| POST   | `/api/tags`                         | Save the user's tag list (normalized case-insensitively)                        |
| POST   | `/api/tags/rename`                  | Rename a tag everywhere: saved list, transactions, recurring rules — merges into an existing tag of the new name if present |
| GET    | `/api/category-rules`               | Get auto-categorization rules (ordered `{pattern, category}` pairs)              |
| POST   | `/api/category-rules`               | Save auto-categorization rules                                                   |
| GET    | `/api/token`                        | Get the current External Access API token                                       |
| POST   | `/api/token/regenerate`             | Generate a new API token (invalidates the old one)                              |
| POST   | `/api/reset`                        | Delete ALL of the user's FinTrack data, after a best-effort backup to Files      |
| POST   | `/api/settings/restore`             | Replace ALL of the user's FinTrack data with a previously exported JSON backup  |
| GET    | `/api/lock/status`                  | Pin Lock status: enabled, timeout, locked-until, pending admin-reset request     |
| POST   | `/api/lock/setup`                   | Set/change the PIN (body: `newPassword, currentPassword?, timeoutMinutes, resetQuestion?, resetAnswer?`) |
| POST   | `/api/lock/disable`                 | Disable the PIN (body: `currentPassword`)                                       |
| POST   | `/api/lock/verify`                  | Verify a PIN attempt (body: `password`) — 423 if locked out, 401 if wrong        |
| GET    | `/api/lock/reset-question`          | Get the configured security question, if any                                    |
| POST   | `/api/lock/reset-verify`            | Verify the security answer (body: `answer`) — clears the PIN on success        |
| POST   | `/api/lock/request-admin-reset`     | File/refresh a "Request Admin Approval to Reset PIN" request                    |

Request bodies are accepted as `application/json`; `BaseApiController::jsonBody()`
falls back to standard form-encoded parameters (`getParams()`) for
compatibility when the content type isn't JSON.

### Public/External API

These routes are marked `#[PublicPage]` and bypass the Nextcloud
session/authentication middleware entirely. Instead, they are
authenticated by a per-user **API token**, checked against the
`fintrack_settings` table (`key = 'api_token'`).

**Authentication:** send the token either as an `X-FinTrack-Token` header,
or as a `token` query/body parameter. The Quick Add endpoint additionally
accepts `key`.

| Method | Route                  | Description                                                                                                                                 |
| ------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/external/accounts`   | List the token owner's **active** accounts (minimal fields only)                                                                            |
| GET    | `/external/categories` | List the token owner's categories                                                                                                           |
| POST   | `/external/categories` | Create a category (`name`, `type`, `icon`, `color`)                                                                                         |
| GET    | `/external/tags`       | List the token owner's saved tags, for the form's autosuggest                                                                                |
| GET    | `/external/lock-status`| Whether the External Entry Form should show a PIN gate (opt-in, see [Pin Lock](#pin-lock))                                                  |
| POST   | `/external/lock-verify`| Verify the app PIN for the external form (same 5-attempt/15-minute lockout as the main app)                                                 |
| POST   | `/external/submit`     | Submit a transaction (`type, accountId, amount, description, category, tags, notes, date`)                                                  |
| GET    | `/external/quick-add`  | Submit a transaction via query string, ideal for bookmarklets/automations (`key, amount, type, account, category, description, date, tags`) |

Example — quick-add via `curl`:

```
curl "https://your-nextcloud.example.com/index.php/apps/fintrack/external/quick-add?key=YOUR_TOKEN&amount=9.99&type=expense&account=1&category=Groceries"
```

Example — form submit via `curl`:

```
curl -X POST https://your-nextcloud.example.com/index.php/apps/fintrack/external/submit \
  -H "X-FinTrack-Token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"expense","accountId":1,"amount":42.50,"description":"Dinner","category":"Food","tags":["out"]}'
```

All external endpoints return `401` with an `{"error": "..."}` body if the
token is missing or invalid, and `400` with a descriptive error for
validation failures. If the token owner has opted the external form into
Pin Lock, `lock-status`/`lock-verify` gate the form itself before any of
the above are reachable from the hosted page (the raw API endpoints are
not themselves additionally rate-limited beyond the lock's own 5-attempt
counter).

### Admin API (Pin Lock reset queue)

Requires Nextcloud admin rights (no `#[NoAdminRequired]` attribute on
`AdminLockController`, which is the deliberate default for that
controller).

| Method | Route                                | Description                                                                 |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------ |
| POST   | `/admin/lock-reset/{id}/approve`      | "Approve & Clear PIN" — clears the requesting user's PIN and resolves the request |

Rendered UI lives at **Admin Settings → FinTrack**
(`AdminSettings::getForm()`), listing every pending request
(`LockService::listPendingRequests()`), oldest first. `fintrack-admin.js`
wires the Approve button via `fetch()` with the Nextcloud CSRF
`requesttoken` header, removing the row from the table on success without
a full page reload.

### Security Model

- **Per-user data isolation**: every service query filters on `user_id`;
  `BaseService::assertOwner()` verifies row ownership before any
  update/delete.
- **CSRF protection**: all session-authenticated, state-changing endpoints
  enforce Nextcloud's built-in CSRF token by default; GET endpoints are
  marked `#[NoCSRFRequired]` since they don't mutate state.
- **Token-based auth for public routes**: `ExternalController` routes are
  `#[PublicPage]` + `#[NoCSRFRequired]` by design (no NC session exists on
  these requests), relying entirely on the `X-FinTrack-Token`/`key` secret.
  Regenerating the token immediately revokes the old one. The External
  Access token is deliberately excluded from JSON backups, the pre-reset/
  pre-restore snapshot, and the restore endpoint, so restoring an old
  backup can never silently swap out a token that's already embedded in a
  shared form link; it regenerates on next load if ever cleared.
- **Pin Lock**: PINs and security-question answers are stored only as
  `password_hash()` output, verified server-side with `password_verify()`,
  never compared or transmitted in plain text beyond the single request
  that sets or checks them. Rate-limited independently for the PIN itself
  and for the security-question reset (5 attempts / 15-minute lockout
  each). The admin-approval fallback requires a real Nextcloud
  administrator to act, and notifies the whole `admin` group, not a
  single hardcoded account.
- **Content-Security-Policy**: no `unsafe-inline` scripts; configuration
  is passed to the frontend via a JSON `data-config` attribute (read by
  `fintrack-main.js`), and all script tags go through
  `\OCP\Util::addScript()` so Nextcloud attaches the correct per-request
  nonce automatically. The main app page's CSP explicitly allowlists
  `script.google.com` and `script.googleusercontent.com` under
  `connect-src` — narrowly, for the telemetry ping only (see next
  section); the external entry form's CSP does not include this
  allowance, since it never sends a telemetry ping itself.
- **Least-privilege settings endpoint**: `POST /api/settings` explicitly
  strips any `api_token` key from the request body, so the token can only
  be rotated via the dedicated regenerate endpoint.

### Telemetry & Privacy

FinTrack sends a small, non-financial usage ping to a Google Apps Script
endpoint operated by the developer
(`USAGE_WEBHOOK_URL` in `fintrack-main.js`). This is a real, currently-live
feature and should be disclosed to end users and evaluated against your
organization's data-handling policies before deployment in a
privacy-sensitive environment — it is **not** covered by the app's
"all data stays in your Nextcloud database" framing, which applies only
to financial data (accounts, transactions, transfers, budgets, categories,
currencies, recurring rules).

**What is sent, and when.** `sendTelemetryPing()` fires from three call
sites, all sending the same payload shape:

1. The one-time **welcome screen** shown on first use of the main app
   (`showWelcomeConsentModal()` / `submitWelcomeConsent()`).
2. An **anniversary check-in**, shown roughly every four months (three
   times a year) counted from the install's first-use date
   (`getAnniversaryCheckpoint()`), regardless of which emoji reaction the
   user picks.
3. The **monthly donation reminder**, shown once a month; the ping fires
   when the reminder is closed by any means (its own "Maybe later" button
   or the modal's × close), not only on an explicit action.

The payload (`timestamp, instanceId, country, ncVersion, ftVersion`)
contains:

- `timestamp` — client time, ISO 8601.
- `instanceId` — a random 16-byte hex ID generated once per install
  (`Version1005Date20260709000000`, stored as the app config value
  `telemetry_id`, read via Nextcloud's `IAppManager`-independent
  `IConfig::getAppValue()`). It is **not** Nextcloud's own
  `instanceid` system value and is not derived from any account,
  username, or email.
- `country` — included only if the user has chosen one (welcome screen,
  or later from Settings → About); otherwise sent as an empty string.
- `ncVersion` / `ftVersion` — the running Nextcloud and FinTrack version
  numbers.

No name, email, account identifier, IP-derived location, or financial
data of any kind (account balances, transaction amounts, categories,
payees, budgets) is ever included, by design — this is enforced only at
the application-code level (the fields simply aren't gathered into the
payload), not by any platform-level guarantee.

**User control.** Settings → About discloses this and exposes exactly one
control: a country dropdown / "share country" checkbox
(`telemetry_country`, `telemetry_monthly_enabled`). Turning this off (or
never picking a country) sends an empty `country` field on every future
ping. **There is no UI control that stops the ping itself from being
sent** — the welcome/anniversary/reminder triggers are unconditional; only
the country field is gated.

**Network/CSP details.** The request is a `fetch(..., {method: 'GET',
mode: 'no-cors'})` — fire-and-forget, response ignored, and any failure
(network error, ad-blocker, offline) is caught and silently ignored so it
never affects the rest of the app. `PageController::index()`'s CSP
explicitly allows `connect-src` to `script.google.com` (the request
target) and `script.googleusercontent.com` (Apps Script's actual 302
redirect target for its response, which must also be allowlisted or the
browser blocks the redirect even though the initial domain is permitted).

**Blocking it entirely.** Since there is no in-app opt-out for the ping
itself, administrators who need to guarantee no outbound calls at all for
this app should block `script.google.com` and
`script.googleusercontent.com` at the network/firewall level for the
Nextcloud host — the app fails silently and continues working normally
without them reachable, per the try/catch around `sendTelemetryPing()`.

This is separate from the optional, per-lookup **exchange-rate calls** to
Frankfurter/exchangerate.host, which only fire when a user actively
requests an online rate and are not a background/periodic ping.

### Frontend

- **No build step** — plain JavaScript, loaded via `\OCP\Util::addScript()`.
- `fintrack-main.js` bootstraps configuration/state (must load before
  `fintrack-core.js`), owns client-side balance/total math
  (`transactionAmountInBase()`, `getAccountBalance()`,
  `getAccountBalanceInBase()`, `getTotalByType()` — the latter three
  convert through each transaction's own frozen rate, not today's live
  rate), and drives the welcome/anniversary/donation-reminder/telemetry
  flow described above.
- `fintrack-core.js` implements the rest of the authenticated SPA: page
  routing (`data-page` sidebar links + `#page-*` containers), modals, CRUD
  forms, transaction filtering (persisted to `localStorage` — see
  `ftTxFilterStorageKey()`), CSV import (preview/mapping/results dialogs),
  Recently Deleted, Pin Lock screens, Settings, and dashboard/report
  rendering. All HTML injected via `innerHTML` uses `data-action` /
  `data-change` / `data-input` / `data-blur` attributes for CSP-safe,
  delegated event handling rather than inline event handlers.
- `fintrack-external.js` is a small, self-contained script powering only
  the public `/entry/{token}` page (account/category/tag loading,
  category quick-add, the optional PIN gate, transaction submission).
- `fintrack-admin.js` powers only the Admin Settings → FinTrack page (the
  Pin Lock reset-request queue's Approve button), and never loads
  alongside the other three.

---

## Migration History

Each entry is a `SimpleMigrationStep` under `lib/Migration/`, named
`Version<NNNN>Date<YYYYMMDDHHMMSS>`. Nextcloud runs any not-yet-applied
migration automatically on app load/upgrade.

| Version | Summary |
| ------- | ------- |
| 1000 | Initial schema: `fintrack_accounts`, `fintrack_transactions`, `fintrack_transfers`, `fintrack_budgets`, `fintrack_categories`, `fintrack_currencies`, `fintrack_recurring`, `fintrack_settings` |
| 1001 | Adds `conversion_rate` to transactions (per-transaction frozen exchange rate) |
| 1002 | Adds investment-account metadata columns (`is_investment`, `purchase_price`, `purchase_date`, `settled_date`, `settled_price`) |
| 1003 | Adds `location` (investment-related) |
| 1004 | **Drops** all of the 1002/1003 investment columns — the investment-account feature (buy/sell tracking) was removed; existing investment accounts kept their core data |
| 1005 | Generates a random `telemetry_id` app config value (see [Telemetry & Privacy](#telemetry--privacy)) |
| 1006 | Creates `fintrack_pin_resets` (the admin-approval PIN reset queue) |
| 1007 | Adds `end_date` to recurring transactions |
| 1008 | Adds `deleted_at` to transactions (soft-delete / Recently Deleted) |
| 1009 | Adds `import_key` to transactions (first CSV-upsert key design, epoch-millisecond, set only at creation) |
| 1010 | **Drops** `import_key` — replaced by using each transaction's own `id` as the upsert key, since every transaction already has one and the separate key left pre-migration rows unmatchable |
| 1011 | One-time data migration: lowercases and dedupes every existing tag (settings' saved tag list, transaction tags, recurring-rule tags) now that tags are case-insensitive app-wide (`TagUtil::normalize()`) |
| 1012 | Deletes any leftover `tx_filter_*` rows from `fintrack_settings` — transaction filter persistence moved entirely to browser `localStorage` and is no longer synced server-side |

## Development

```
# Clone into your Nextcloud apps directory
git clone https://github.com/cloudsliberty/fintrack.git apps/fintrack

# Install PHP dependencies (if any are added beyond the base autoloader)
cd apps/fintrack
composer install

# Enable the app
sudo -u www-data php occ app:enable fintrack

# Re-run migrations after schema changes
sudo -u www-data php occ upgrade
```

Namespace: `OCA\FinTrack\` (PSR-4, mapped to `lib/`), per `composer.json`.

To add a new migration, create a class under `lib/Migration/` following
Nextcloud's `SimpleMigrationStep` convention (see
[Migration History](#migration-history) for naming) and bump `<version>`
in `appinfo/info.xml`.

**Service layer conventions**: most services (`AccountService`,
`TransactionService`, `TransferService`, `CategoryService`,
`CurrencyService`, `RecurringService`) extend `BaseService` and hand-roll
their own QueryBuilder CRUD + row↔array mapping. `BudgetService`/
`BudgetMapper` instead use Nextcloud's `QBMapper`/`Entity` base classes,
which generate that boilerplate — this is the intended reference pattern
for migrating the others incrementally, not a permanent inconsistency.

**Tags**: always normalize through `TagUtil::normalize()` on any new code
path that accepts tags from a user (or from an import/external source)
before persisting — see [Categories & Tags](#categories--tags) for the
rationale.

## Troubleshooting / FAQ

**My external entry link doesn't work.** Make sure you're using the full
link shown on the **External Access** page, and that the token wasn't
recently regenerated (which invalidates the old link). If you've turned
on the External Entry Form Protected Action, confirm you also know your
Pin Lock PIN, since opening the link will now prompt for it.

**A CSV import row failed.** Check the **Import Results** dialog shown
after import — each failed row is reported individually with its row
number, the specific column, and why (e.g. invalid date, non-positive
amount). Valid rows in the same file are still imported, and rows already
present are reported as duplicates or updates rather than failures.

**I re-imported a CSV and got duplicates instead of updates.** Only rows
whose `unique-key(for-updating)` column matches an existing transaction's
own id are updated in place; a blank or non-matching key always inserts a
new row. Re-export first to get a file with that column populated, or
match rows by date/type/amount/description instead (handled automatically
for key-less rows).

**Dashboard totals look wrong across currencies.** Confirm your currency
conversion rates and base currency under **Currencies** / **Settings**.
Totals prefer each transaction's own frozen conversion rate over today's
live rate, by design, so a rate change only affects new transactions, not
historical totals — check a specific transaction's stored rate if a total
looks stale rather than assuming the currency's current rate applies
everywhere.

**I forgot my Pin Lock PIN and the security question too.** Use **Request
Admin Approval to Reset PIN** from the lock screen; any Nextcloud
administrator can approve it from **Admin Settings → FinTrack**, which
clears your PIN so you can set a new one.

**Is my data sent anywhere outside my Nextcloud server?** Your financial
data (accounts, transactions, transfers, budgets, categories, currencies,
recurring rules) never leaves your Nextcloud database. FinTrack does make
optional exchange-rate calls (Frankfurter/exchangerate.host) when you use
online rate lookups, and sends a minimal, non-financial usage ping to a
Google Apps Script endpoint at a few points in the app's lifecycle — see
[Telemetry & Privacy](#telemetry--privacy) for exactly what that contains
and how to block it at the network level if needed.

## Contributing

Issues and pull requests are welcome. Please open an issue first for
significant changes so they can be discussed before implementation.
Report bugs at: <https://github.com/cloudsliberty/fintrack/issues>

## License

FinTrack is licensed under the **AGPL-3.0-or-later** license. See the
`LICENSE` file for details.
