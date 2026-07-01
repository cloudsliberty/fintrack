<div align="center">

# 💰 FinTrack for Nextcloud

**A full-featured personal finance manager, built directly into Nextcloud.**

Track accounts, transactions, transfers, budgets, and recurring bills — all stored in your own database, under your own control. No third-party servers, no subscriptions, no tracking.

![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)
![Nextcloud](https://img.shields.io/badge/Nextcloud-32-00679E?logo=nextcloud&logoColor=white)
![PHP](https://img.shields.io/badge/PHP-%3E%3D8.1-777bb4?logo=php&logoColor=white)
![Status](https://img.shields.io/badge/status-alpha-orange.svg)

[Features](#-features) • [Installation](#-installation) • [Documentation](#-documentation) • [API](#-api) • [Contributing](#-contributing)

</div>

---

## 📸 Screenshots

<!-- Add screenshots here, e.g. -->
<!-- <img src="docs/screenshots/dashboard.png" width="800" alt="FinTrack Dashboard"> -->

> _Screenshots coming soon — see [Getting Started](#-quick-start) to try it yourself._

## ✨ Features

- 🏦 **Four account types** — Asset, Expense, Revenue, Liability, each with icon, color, and currency
- 💸 **Transactions** — income/expense tracking with search, multi-field filtering, tags, and notes
- 🔁 **Recurring transactions** — daily to yearly schedules that auto-post and self-advance
- 🔄 **Transfers** — including cross-currency transfers with stored conversion rates
- 📊 **Budgets** — category-based limits with visual progress tracking
- 🏷️ **Categories & tags** — fully customizable, with inline quick-add
- 🌍 **Multi-currency** — custom currencies and conversion rates, normalized to a base currency
- 📈 **Dashboard & reports** — net worth, cash flow, top spending categories, income vs. expense charts
- 📥 **CSV import** — bulk import with a template and per-row error reporting
- 📱 **Remote entry** — a token-authenticated public form (and Quick Add URL) for logging transactions from your phone, no Nextcloud login required
- 🔒 **Privacy-first** — all data lives in your Nextcloud database; nothing is sent to third parties

## 📋 Requirements

| Requirement | Version |
|---|---|
| Nextcloud | 32 |
| PHP | 8.1+ |
| Database | MySQL / MariaDB / PostgreSQL / SQLite (anything Nextcloud supports) |

## 🚀 Installation

### From the Nextcloud App Store
Go to **Apps** → search **FinTrack** → **Download and enable**.

### Manual install
```bash
cd /path/to/nextcloud/apps
git clone https://github.com/cloudsliberty/fintrack.git
sudo -u www-data php occ app:enable fintrack
```

Nextcloud will run the initial database migration automatically on first load.

## ⚡ Quick Start

1. Open **FinTrack** from the Nextcloud app menu.
2. Create your first **Account** (e.g. a checking account under *Asset*).
3. Add a **Transaction**, or set up a **Recurring Transaction** for a regular bill.
4. Check your **Dashboard** — net worth and cash flow update instantly.
5. Grab your personal link under **External API** to add transactions from your phone without logging in.

## 📖 Documentation

The full user guide and technical reference — every feature, the complete database schema, and the full internal + external REST API — lives in:

➡️ **[docs/MANUAL.md](docs/MANUAL.md)**

## 🔌 API

FinTrack exposes two REST surfaces:

- **Internal API** (`/api/...`) — session-authenticated, used by the app itself
- **External API** (`/external/...`) — token-authenticated, no Nextcloud login required, for remote/automated entry

```bash
# Quick-add an expense from a shortcut, automation, or bookmarklet
curl "https://your-nextcloud.example.com/index.php/apps/fintrack/external/quick-add?key=YOUR_TOKEN&amount=9.99&type=expense&account=1&category=Groceries"
```

Full endpoint reference: [docs/MANUAL.md#-api](docs/MANUAL.md#publicexternal-api)

## 🛠️ Development

```bash
git clone https://github.com/cloudsliberty/fintrack.git apps/fintrack
cd apps/fintrack
composer install
sudo -u www-data php occ app:enable fintrack
```

Namespace: `OCA\FinTrack\` (PSR-4, mapped to `lib/`). See [docs/MANUAL.md](docs/MANUAL.md#development) for architecture, directory structure, and migration guidance.

## 🤝 Contributing

Issues and pull requests are welcome! Please open an issue first for significant changes so they can be discussed before implementation.

🐛 [Report a bug](https://github.com/cloudsliberty/fintrack/issues)

## 📄 License

FinTrack is licensed under [AGPL-3.0-or-later](LICENSE).
