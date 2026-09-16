# UMCCR GitHub Portfolio

An internal, browser-only dashboard for the public repositories and contributors in
[OrcaBus](https://github.com/OrcaBus) and [UMCCR](https://github.com/umccr).

Production site: <https://umccr.github.io/github-portfolio-dashboard/>

The portfolio is intentionally fixed to these two organizations. The app has no
backend and reads data directly from the GitHub REST API.

## Features

- Combined and per-organization overview
- Repository search, sorting, activity filters, language filters, and contributor filters
- Locally pinned repositories that remain at the top of the repository table
- Contributor profiles and downloadable activity reports
- Rolling 1, 3, 6, and 12-month contributor commit filters
- Pull request, issue, activity, and governance views
- Optional organization-specific GitHub Personal Access Tokens for higher API limits and complete analysis
- Light and dark themes

## Run locally

Requirements: Node.js 20.19 or later and npm.

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
npm run preview
```

Run the test suite with:

```bash
npm test -- --run
```

## Configuration

The fixed organization list and browser storage keys live in
`src/config/dashboard.js`.

No token is required for the standard view. For complete analysis of both
organizations, create one fine-grained token owned by UMCCR and another owned by
OrcaBus, each with read-only access to the repositories the dashboard must inspect.
The tokens are stored separately in `sessionStorage`, are never written to the app's
cache, and are forgotten when the browser session ends or when **Forget** is used in
Settings.

Repository pins, theme choice, and rate-limit metadata are stored in `localStorage`.
Fetched GitHub responses and the latest analysis are cached in IndexedDB. Clearing
site data removes all of these preferences and cached results.

Because this is a client-side application, any script running on the same origin can
access browser storage. Deploy only trusted builds, use dedicated least-privilege
tokens, and avoid sharing a deployment origin with unrelated applications.

## Attribution and license

This application is based on OrgExplorer by AOSSIE and has been modified for internal UMCCR use. Licensed under GNU GPL v3.

The upstream project is [AOSSIE-Org/OrgExplorer](https://github.com/AOSSIE-Org/OrgExplorer).
The complete license text is retained in [LICENSE](LICENSE). If this modified version
is distributed, provide the corresponding source and preserve the GPL notices.
