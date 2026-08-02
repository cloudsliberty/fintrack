# Contributing to FinTrack 🚀

First off, thank you for considering contributing to **FinTrack**! It's contributors like you that make FinTrack a great open-source tool for the Nextcloud community.

Whether you're fixing a bug, adding a new feature, improving documentation, or reporting an issue, all contributions are welcome.

---

## Table of Contents
1. [Code of Conduct](#code-of-conduct)
2. [How Can I Contribute?](#how-can-i-contribute)
   - [Reporting Bugs](#reporting-bugs)
   - [Suggesting Enhancements](#suggesting-enhancements)
   - [Pull Requests](#pull-requests)
3. [Development Setup](#development-setup)
4. [Coding Guidelines](#coding-guidelines)
5. [Support the Project](#support-the-project)

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please report any unacceptable behavior to [clouds.liberty@gmail.com](mailto:clouds.liberty@gmail.com).

---

## How Can I Contribute?

### Reporting Bugs

Before creating a bug report, please check the [existing issues](https://github.com/cloudsliberty/fintrack/issues) to ensure it hasn't already been reported.

When submitting a bug report, please include:
* **A clear and descriptive title.**
* **Steps to reproduce the issue.**
* **Expected vs. actual behavior.**
* **Environment details:** Nextcloud version, FinTrack app version, browser/PWA mode, and OS.
* **Screenshots or logs** (if applicable and safe to share without exposing personal financial data).

### Suggesting Enhancements

Enhancement suggestions are tracked as [GitHub Issues](https://github.com/cloudsliberty/fintrack/issues). 

When creating a feature request, please provide:
* **A clear summary of the feature.**
* **The motivation behind the request** (how does this solve a problem or improve FinTrack?).
* **Any design thoughts or UI/UX mockups** if applicable.

### Pull Requests

1. **Fork the Repository:** Create your own fork of `cloudsliberty/fintrack`.
2. **Create a Feature Branch:** `git checkout -b feature/your-feature-name` or `fix/your-bug-fix`.
3. **Keep Commits Clean:** Write clear, concise commit messages.
4. **Test Your Changes:** Ensure your code works properly within a local Nextcloud development environment and in PWA mode.
5. **Submit a Pull Request:** Push to your fork and open a PR against the `main` branch.

---

## Development Setup

FinTrack is built as a native Nextcloud application with PWA capabilities.

### Prerequisites
* A local **Nextcloud server** instance (e.g., via Docker).
* **Node.js** (LTS version recommended) & **npm**.
* **PHP** (matching your Nextcloud server requirement).

### Getting Started

1. **Clone the repository into your Nextcloud apps folder:**
   ```bash
   cd /path/to/nextcloud/apps/
   git clone [https://github.com/cloudsliberty/fintrack.git](https://github.com/cloudsliberty/fintrack.git)
   cd fintrack
