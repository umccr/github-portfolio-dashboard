# Product

## What this is

**UMCCR GitHub Portfolio** is an internal, browser-only dashboard for the public
repositories and contributors of two GitHub organizations: **OrcaBus** and **umccr**
(labelled "UMCCR"). Production site: https://umccr.github.io/github-portfolio-dashboard/

It is a fork of [AOSSIE-Org/OrgExplorer](https://github.com/AOSSIE-Org/OrgExplorer),
modified for internal UMCCR use and licensed under **GNU GPL v3**. If a modified build
is distributed, the corresponding source must be provided and the GPL notices preserved.

## Core constraints (do not violate)

- **No backend.** The app is 100% client-side and reads directly from the GitHub REST
  API. Never introduce a server, proxy, or data store outside the browser.
- **Fixed portfolio.** The organization list is intentionally hard-coded to `OrcaBus`
  and `umccr` in `src/config/dashboard.js`. Do not add arbitrary organization
  discovery or a general org picker.
- **Token safety is critical.** This is deployed to an internet-facing static host
  (GitHub Pages). Never commit, build, or hard-code a Personal Access Token. Tokens are
  entered by the user in Settings and live in `sessionStorage` only (one per org). They
  are never written to the IndexedDB cache and are forgotten when the session ends.

## Features

- Combined and per-organization overview
- Repository search, sorting, activity/language/contributor filters, and locally pinned
  repositories
- Contributor profiles and downloadable activity reports
- Rolling 1/3/6/12-month contributor commit filters
- Pull request, issue, activity, and governance views
- Optional per-organization fine-grained PATs for higher API limits and complete analysis
- Light and dark themes

## Data & storage model

- **sessionStorage**: per-org PATs (cleared on session end / Forget in Settings).
- **localStorage**: repository pins, theme choice, organization scope, rate-limit metadata.
- **IndexedDB**: cached GitHub API responses (`github-dashboard-api-cache-v1`) and the
  last built analysis (`github-dashboard-analysis-v1`, 1-hour TTL).

Caching exists because the unauthenticated GitHub budget is only ~60 requests/hour; a
PAT raises it to ~5,000/hour. Preserve caching behavior when changing data fetching.
