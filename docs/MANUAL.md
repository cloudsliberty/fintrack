# FinTrack for Nextcloud

**A full-featured personal finance manager, built directly into Nextcloud.**

FinTrack lets you track accounts, income, expenses, transfers, recurring bills, and budgets — all stored in your own Nextcloud database, under your own control. No third-party servers, no subscriptions, no ads.

![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)
![Nextcloud](https://img.shields.io/badge/Nextcloud-32-00679E?logo=nextcloud&logoColor=white)
![PHP](https://img.shields.io/badge/PHP-%3E%3D8.1-777bb4?logo=php&logoColor=white)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Screenshots](#screenshots)
- [Requirements](#requirements)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [User Guide](#user-guide)
  - [Dashboard](#dashboard)
  - [Accounts](#accounts)
  - [Transactions](#transactions)
  - [Transfers](#transfers)
  - [Recurring Transactions](#recurring-transactions)
  - [Budgets](#budgets)
  - [Categories & Tags](#categories--tags)
  - [Currencies](#currencies)
  - [Reports](#reports)
  - [External API / Remote Entry](#external-api--remote-entry)
  - [Settings](#settings)
- [Technical Documentation](#technical-documentation)
  - [Architecture](#architecture)
  - [Directory Structure](#directory-structure)
  - [Database Schema](#database-schema)
  - [Internal REST API](#internal-rest-api)
  - [Public/External API](#publicexternal-api)
  - [Security Model](#security-model)
  - [Frontend](#frontend)
- [Development](#development)
- [Troubleshooting / FAQ](#troubleshooting--faq)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

FinTrack is a self-hosted personal finance app that runs as a native Nextcloud application. It follows a classic double-entry-inspired ledger model with four account types (Asset, Expense, Revenue, Liability), and layers on transfers, recurring transactions, budgets, multi-currency support, and a token-authenticated public form for adding transactions on the go — all without leaving your own Nextcloud instance.

All data is scoped per Nextcloud user and stored exclusively in your Nextcloud database (no external API calls, no telemetry).

## Features

**Accounts**
- Four account types: **Asset**, **Expense**, **Revenue**, and **Liability**
- Per-account currency, icon, color, description, and active/inactive status
- Click-through from an account tile straight to its filtered transaction list

**Transactions**
- Income and expense entries with amount, date, description, category, tags, and notes
- Full-text search plus filters by type, account, category, and date range
- Bulk **CSV import** with a downloadable template and per-row error reporting (a bad row is skipped and reported, not fatal to the whole import)
- Source tracking per transaction (`manual`, `import`, `recurring`, `external`, `quick-add`) so you can always tell where an entry came from

**Transfers**
- Move money between two accounts, including **cross-currency transfers** with a stored conversion rate and independently tracked source/destination amounts

**Recurring Transactions**
- Automate bills and income with **daily, weekly, bi-weekly, monthly, quarterly, or yearly** schedules
- One-click "Post" action creates the transaction and automatically advances the next due date
- Dashboard/notification surfacing of recurring items that are due

**Budgets**
- Category-based spending budgets with configurable limits and periods
- Visual progress bars comparing spend-to-date against the limit
- Active/inactive toggle so old budgets don't clutter your view

**Categories & Tags**
- Custom categories per transaction type (income / expense / transfer), each with its own icon and color
- Free-form tags for cross-cutting labels (e.g. "monthly", "reimbursable")
- Quick-add a brand-new category inline while entering a transaction — no need to leave the form

**Multi-Currency**
- Define any number of currencies with code, display name, symbol, and a custom conversion rate
- A configurable **base currency** used to normalize dashboard totals (net worth, cash flow, etc.)

**Dashboard & Reports**
- At-a-glance stats: **Net Worth**, **Total Assets**, **Total Liabilities**, and **Cash Flow**
- Recent transactions feed and active-budget summary widgets
- Top spending categories breakdown
- Income vs. Expense chart and report export (print-to-PDF)

**External / Remote Entry**
- A dedicated, mobile-friendly public web form for adding transactions **without logging into Nextcloud** — ideal for bookmarking on a phone home screen
- A **Quick Add** GET endpoint for use from shortcuts, automations, or bookmarklets
- Per-user **API token** (regenerable at any time) that authenticates all external/public requests
- On-the-fly category creation from the external form

**Data & Portability**
- CSV import with a downloadable template
- Print-to-PDF report export
- Every table is scoped to `user_id`, so data never leaks across Nextcloud accounts

**Security & Integration**
- Runs entirely inside your Nextcloud instance — your data never leaves your server
- Full Content-Security-Policy compliance (no `unsafe-inline`, nonce-based script loading)
- CSRF protection on every session-authenticated, state-changing request
- Ownership checks (`assertOwner`) on every update/delete so users cannot modify each other's records

## Screenshots

> _Add screenshots of the Dashboard, Transactions, Budgets, and External Entry form here, e.g._
>
> `![Dashboard](docs/screenshots/dashboard.png)`

## Requirements

| Requirement | Version |
|---|---|
| Nextcloud | 32 |
| PHP | 8.1+ |
| Database | Any DB supported by Nextcloud (MySQL/MariaDB, PostgreSQL, SQLite) |

> FinTrack currently declares `min-version` and `max-version` of **32** in `appinfo/info.xml`. If you are running a different Nextcloud major version, check compatibility before installing.

## Installation

### Option A — Nextcloud App Store
1. Log in to Nextcloud as an administrator.
2. Go to **Apps** → search for **FinTrack**.
3. Click **Download and enable**.

### Option B — Manual install from this repository
```bash
# From your Nextcloud installation's apps directory
cd /path/to/nextcloud/apps
git clone https://github.com/cloudsliberty/fintrack.git
```
Then, as an admin, enable it via the **Apps** page, or from the command line:
```bash
sudo -u www-data php occ app:enable fintrack
```

Nextcloud will automatically run the database migration (`lib/Migration/Version1000Date20250101000000.php`) on first load, creating the required tables (see [Database Schema](#database-schema)).

### Verifying the install
```bash
sudo -u www-data php occ app:list | grep fintrack
```

## Getting Started

1. Open **FinTrack** from the Nextcloud app menu (top navigation bar).
2. On first load, FinTrack automatically generates a personal **API token** for you (used by the external entry form and Quick Add — see [External API](#external-api--remote-entry)).
3. Create your first **Account** (e.g. a checking account as an *Asset* account).
4. Add a **Transaction**, or set up a **Recurring Transaction** for a regular bill.
5. Visit the **Dashboard** to see your net worth and cash flow update in real time.

---

## User Guide

### Dashboard
The Dashboard is FinTrack's home page and gives you an immediate financial snapshot:

- **Net Worth** — total assets minus total liabilities
- **Total Assets** — sum of all active Asset accounts
- **Total Liabilities** — sum of all active Liability accounts
- **Cash Flow** — total revenue minus total expenses
- **Recent Transactions** — your latest entries, with a link to the full list
- **Budget Overview** — progress bars for your active budgets
- **Top Spending Categories** — where your expense money is going

All monetary totals are normalized to your configured **base currency**.

### Accounts
FinTrack organizes accounts into four types, each with its own section in the sidebar:

| Type | Typical use |
|---|---|
| **Asset** | Bank accounts, cash, savings, investments |
| **Expense** | Optional buckets for tracking spend outside of standard categories |
| **Revenue** | Income sources (salary, freelance, etc.) |
| **Liability** | Credit cards, loans, mortgages |

For each account you can set: name, type, currency, description, icon, color, and an active/inactive flag. Clicking an account tile takes you directly to its transactions, pre-filtered.

**To add an account:** Sidebar → the relevant account type → **+ New Account**.

### Transactions
The **All Transactions** page is your full ledger.

- **Add** a transaction with type (income/expense), account, amount, date, description, category, tags, and notes.
- **Search** by description, category, or tag using the search box.
- **Filter** by type, account, category, and date range simultaneously.
- **Edit or delete** any transaction from the list.
- **Import CSV**: click **Import CSV**, download the template if needed, then upload a CSV of transactions into a single account. Each row is validated independently — a malformed row (bad amount, unparseable date, etc.) is skipped and reported in an error list, while all valid rows are still imported.

CSV columns expected: `date, type, amount, description, category, tags, notes` (tags separated by semicolons within the cell).

### Transfers
Use **Transfers** to move funds between two of your own accounts. If the source and destination accounts use different currencies, FinTrack stores both the source amount, the destination amount, and the conversion rate used — so historical transfers stay accurate even if your exchange rates change later.

### Recurring Transactions
Set up a recurring transaction once — name, type, account, amount, category, and frequency (**daily / weekly / bi-weekly / monthly / quarterly / yearly**) — and FinTrack will track its next due date.

- Click **Post** on a due recurring item to generate the actual transaction and automatically roll the schedule forward to the next date.
- Recurring items can be toggled active/inactive without deleting them.
- Transactions created this way are tagged with `recurring` and linked back to the recurring rule that generated them.

### Budgets
Budgets track spend against a limit for a given category over a period (e.g. monthly).

- Set a name, category, limit amount, currency, period, and start date.
- The Dashboard and Budgets page both show a progress bar of amount spent vs. limit.
- Deactivate a budget instead of deleting it to keep historical context.

### Categories & Tags
- **Categories** are typed (income / expense / transfer) and each carries an icon and color for quick visual scanning.
- **Tags** are free-form labels you can attach to any transaction for cross-cutting organization (e.g. `#reimbursable`, `#vacation`).
- New categories can also be created inline, directly from the transaction entry form or the external entry form.

### Currencies
Define every currency you use with a **code** (e.g. `USD`), **display name**, **symbol**, and a **conversion rate** relative to your base currency. FinTrack uses these rates to normalize dashboard totals and to compute transfer conversions.

> Conversion rates are entered manually — FinTrack does not fetch live exchange rates from an external service, keeping it fully self-contained.

### Reports
The **Reports** page provides:
- Month-over-month income vs. expense charting
- Net worth history across your asset accounts
- A **spend-by-category** breakdown
- An **Export Report** action (uses your browser's Print → Save as PDF)

### External API / Remote Entry
FinTrack ships with a token-authenticated way to log transactions **without a Nextcloud login** — useful for quick entry from a phone.

1. Go to **External API** in the sidebar to view your personal API token and the ready-to-use external entry link.
2. Bookmark the external entry link (`.../entry/{your-token}`) to your phone's home screen for a native-app-like quick-add experience.
3. Regenerate your token at any time if you believe it's been exposed — this immediately invalidates the old link/token.

Two ways to submit data externally:
- **Form-based**: the hosted `/entry/{token}` page — a mobile-friendly form with account/category dropdowns and inline category creation.
- **Quick Add URL**: a single GET request for use in Shortcuts, automations, or a browser bookmarklet, e.g.:
  ```
  https://your-nextcloud.example.com/index.php/apps/fintrack/external/quick-add
    ?key=YOUR_TOKEN&amount=12.50&type=expense&account=3&category=Coffee&description=Latte
  ```

See [Public/External API](#publicexternal-api) for full endpoint details.

### Settings
- Set your **base currency** used for dashboard normalization.
- Manage your global **tags** list.
- View/regenerate your **API token**.

---

## Technical Documentation

### Architecture
FinTrack is a standard Nextcloud app built on the **AppFramework** (MVC-style: Controllers → Services → Database), with a **vanilla JavaScript** single-page frontend (no build step, no framework dependency) rendered into the Nextcloud page shell.

```
Browser (fintrack-main.js / fintrack-core.js)
        │  fetch() + NC requesttoken (CSRF)
        ▼
PageController / ApiController  (session-authenticated)
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

### Directory Structure
```
fintrack/
├── appinfo/
│   ├── info.xml            # App metadata, version, Nextcloud compatibility
│   └── routes.php          # Route table (page, API, external API)
├── css/
│   └── app.css             # Application styling
├── img/
│   └── app.svg             # Navigation icon
├── js/
│   ├── fintrack-main.js    # Bootstrap / state management (loads first)
│   ├── fintrack-core.js    # Main SPA logic: pages, modals, rendering
│   └── fintrack-external.js# Logic for the public /entry/{token} form
├── lib/
│   ├── AppInfo/
│   │   └── Application.php # App bootstrap (OCP\AppFramework\App)
│   ├── Controller/
│   │   ├── PageController.php     # Renders the SPA shell + external form
│   │   ├── ApiController.php      # Authenticated JSON REST API
│   │   └── ExternalController.php # Public, token-authenticated JSON API
│   ├── Migration/
│   │   └── Version1000Date20250101000000.php  # Initial DB schema
│   └── Service/
│       ├── BaseService.php        # Shared QueryBuilder helpers, ownership checks
│       ├── AccountService.php
│       ├── TransactionService.php
│       ├── TransferService.php
│       ├── BudgetService.php
│       ├── CategoryService.php
│       ├── CurrencyService.php
│       ├── RecurringService.php
│       └── SettingsService.php
├── templates/
│   ├── main.php             # SPA shell (authenticated)
│   └── external.php         # Standalone public entry-form page
└── composer.json
```

### Database Schema
All tables are created by `Version1000Date20250101000000` and are prefixed `fintrack_`. Every table (except `fintrack_settings`, which is inherently per-user/key) carries a `user_id` column, and all queries filter on it — there is no cross-user data access at the query layer.

| Table | Key columns | Notes |
|---|---|---|
| `fintrack_accounts` | `id, user_id, name, type, currency, description, icon, color, active, created_at` | `type` ∈ {asset, expense, revenue, liability} |
| `fintrack_transactions` | `id, user_id, account_id, type, amount(15,4), currency, description, category, tags(JSON text), notes, date, source, recurring_id, created_at` | Indexed on `user_id`, `account_id`, `date`, `type` |
| `fintrack_transfers` | `id, user_id, from_account_id, to_account_id, from_amount, to_amount, from_currency, to_currency, conversion_rate(15,8), description, date, created_at` | |
| `fintrack_budgets` | `id, user_id, name, limit_amt, currency, period, category, active, start_date, created_at` | |
| `fintrack_categories` | `id, user_id, name, type, icon, color` | |
| `fintrack_currencies` | `id, user_id, code, name, symbol, rate(15,8)` | Unique on `(user_id, code)` |
| `fintrack_recurring` | `id, user_id, name, type, account_id, amount, currency, frequency, next_date, last_posted, category, description, tags, active, created_at` | Indexed on `user_id`, `next_date` |
| `fintrack_settings` | `id, user_id, key, value` | Unique on `(user_id, key)`; also stores each user's `api_token` |

### Internal REST API
All routes below live under the app's route prefix (typically `/index.php/apps/fintrack/...` or `/apps/fintrack/...` depending on your Nextcloud URL rewriting). They require an authenticated Nextcloud session; mutating requests (POST/PUT/DELETE) require the standard Nextcloud CSRF `requesttoken` header, which the bundled JS client attaches automatically.

| Method | Route | Description |
|---|---|---|
| GET | `/api/accounts` | List the current user's accounts |
| POST | `/api/accounts` | Create an account |
| PUT | `/api/accounts/{id}` | Update an account |
| DELETE | `/api/accounts/{id}` | Delete an account |
| GET | `/api/transactions` | List transactions (filters: `accountId, type, category, from, to, limit, offset`) |
| POST | `/api/transactions` | Create a transaction |
| POST | `/api/transactions/import` | Bulk-import transactions: `{ accountId, transactions: [...] }` |
| PUT | `/api/transactions/{id}` | Update a transaction |
| DELETE | `/api/transactions/{id}` | Delete a transaction |
| GET | `/api/transfers` | List transfers |
| POST | `/api/transfers` | Create a transfer |
| DELETE | `/api/transfers/{id}` | Delete a transfer |
| GET | `/api/budgets` | List budgets |
| POST | `/api/budgets` | Create a budget |
| PUT | `/api/budgets/{id}` | Update a budget |
| DELETE | `/api/budgets/{id}` | Delete a budget |
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create a category |
| PUT | `/api/categories/{id}` | Update a category |
| DELETE | `/api/categories/{id}` | Delete a category |
| GET | `/api/currencies` | List currencies |
| POST | `/api/currencies` | Create a currency |
| PUT | `/api/currencies/{id}` | Update a currency |
| DELETE | `/api/currencies/{id}` | Delete a currency |
| GET | `/api/recurring` | List recurring rules |
| POST | `/api/recurring` | Create a recurring rule |
| PUT | `/api/recurring/{id}` | Update a recurring rule |
| DELETE | `/api/recurring/{id}` | Delete a recurring rule |
| POST | `/api/recurring/{id}/post` | Post a due recurring rule → creates a transaction, advances `next_date` |
| GET | `/api/summary` | Dashboard summary (base currency, counts, currencies) |
| GET | `/api/settings` | Get the current user's settings |
| POST | `/api/settings` | Save settings (the `api_token` key is ignored/blocked on this endpoint) |
| GET | `/api/tags` | Get the user's saved tag list |
| POST | `/api/tags` | Save the user's tag list |
| GET | `/api/token` | Get the current API token |
| POST | `/api/token/regenerate` | Generate a new API token (invalidates the old one) |

Request bodies are accepted as `application/json`; the API also falls back to standard form-encoded parameters (`getParams()`) for compatibility.

### Public/External API
These routes are marked `#[PublicPage]` and bypass the Nextcloud session/authentication middleware entirely. Instead, they are authenticated by a per-user **API token**, checked against the `fintrack_settings` table (`key = 'api_token'`).

**Authentication:** send the token either as an `X-FinTrack-Token` header, or as a `token` query/body parameter. The Quick Add endpoint additionally accepts `key`.

| Method | Route | Description |
|---|---|---|
| GET | `/external/accounts` | List the token owner's **active** accounts (minimal fields only) |
| GET | `/external/categories` | List the token owner's categories |
| POST | `/external/categories` | Create a category (`name`, `type`, `icon`, `color`) |
| POST | `/external/submit` | Submit a transaction (`type, accountId, amount, description, category, tags, notes, date`) |
| GET | `/external/quick-add` | Submit a transaction via query string, ideal for bookmarklets/automations (`key, amount, type, account, category, description, date, tags`) |

Example — quick-add via `curl`:
```bash
curl "https://your-nextcloud.example.com/index.php/apps/fintrack/external/quick-add?key=YOUR_TOKEN&amount=9.99&type=expense&account=1&category=Groceries"
```

Example — form submit via `curl`:
```bash
curl -X POST https://your-nextcloud.example.com/index.php/apps/fintrack/external/submit \
  -H "X-FinTrack-Token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"expense","accountId":1,"amount":42.50,"description":"Dinner","category":"Food","tags":["out"]}'
```

All external endpoints return `401` with an `{"error": "..."}` body if the token is missing or invalid, and `400` with a descriptive error for validation failures.

### Security Model
- **Per-user data isolation**: every service query filters on `user_id`; `BaseService::assertOwner()` verifies row ownership before any update or delete.
- **CSRF protection**: all session-authenticated, state-changing endpoints (`ApiController` POST/PUT/DELETE) enforce Nextcloud's built-in CSRF token. GET endpoints are marked `#[NoCSRFRequired]` since they don't mutate state.
- **Token-based auth for public routes**: `ExternalController` routes are `#[PublicPage]` + `#[NoCSRFRequired]` by design (no NC session exists on these requests), relying entirely on the `X-FinTrack-Token`/`key` secret for authorization. Regenerating the token immediately revokes the old one.
- **Content-Security-Policy**: FinTrack avoids `unsafe-inline` scripts entirely. Configuration is passed to the frontend via a JSON `data-config` attribute (read by `fintrack-main.js`), and all script tags are registered through `\OCP\Util::addScript()` so Nextcloud can attach the correct per-request nonce automatically.
- **Least-privilege settings endpoint**: `POST /api/settings` explicitly strips any `api_token` key from the request body, so the token can only be rotated via the dedicated regenerate endpoint.

### Frontend
- **No build step** — plain JavaScript, loaded via `\OCP\Util::addScript()`.
- `fintrack-main.js` bootstraps configuration/state (must load before `fintrack-core.js`).
- `fintrack-core.js` implements the whole authenticated SPA: page routing (`data-page` sidebar links + `#page-*` containers), modals, CRUD forms, filtering (`filterTransactions()`), CSV import (`showImportCsvModal()`, `downloadCsvTemplate()`), and dashboard/report rendering (`renderDashboard()`, `renderReportsPage()`).
- `fintrack-external.js` is a small, self-contained script that powers only the public `/entry/{token}` page (account/category loading, category quick-add, transaction submission).

---

## Development

```bash
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

To add a new migration, create a new class under `lib/Migration/` following Nextcloud's `SimpleMigrationStep` convention and bump the app `<version>` in `appinfo/info.xml`.

## Troubleshooting / FAQ

**My external entry link doesn't work.**
Make sure you're using the full link shown on the **External API** page, and that the token wasn't recently regenerated (which invalidates the old link).

**A CSV import row failed.**
Check the error list shown after import — each failed row is reported individually with its row number and reason (e.g. invalid date, non-positive amount). Valid rows in the same file are still imported.

**Dashboard totals look wrong across currencies.**
Confirm your currency conversion rates and base currency under **Currencies** / **Settings** — FinTrack normalizes totals using the rates you provide; it does not fetch live rates automatically.

**Is my data sent anywhere outside my Nextcloud server?**
No. All reads/writes go through your Nextcloud database via the Service layer; there are no outbound calls to third-party APIs.

## Contributing
Issues and pull requests are welcome. Please open an issue first for significant changes so they can be discussed before implementation. Report bugs at: https://github.com/cloudsliberty/fintrack/issues

## License
FinTrack is licensed under the **AGPL-3.0-or-later** license. See the `LICENSE` file for details.
