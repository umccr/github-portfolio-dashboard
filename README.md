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
- Pull request, issue, activity, and governance views
- Optional GitHub Personal Access Token for higher API limits and complete analysis
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

## Deploy to GitHub Pages

The repository includes `.github/workflows/deploy.yml`. It tests and builds the Vite
application, uploads `dist`, and deploys it through GitHub Pages whenever `main` is
updated. The production Vite base path and React Router basename are configured for
`/github-portfolio-dashboard/`.

After the `init` branch has been pushed and reviewed:

1. Merge `init` into the repository's `main` branch.
2. Open **Settings → Pages** in GitHub.
3. Under **Build and deployment**, select **GitHub Actions** as the source.
4. Open the **Actions** tab and confirm the **Deploy UMCCR GitHub Portfolio** workflow succeeds.
5. Visit <https://umccr.github.io/github-portfolio-dashboard/>. A first deployment can take a few minutes.

Future pushes to `main` deploy automatically. The generated `404.html` allows direct
visits and browser refreshes on client-side routes such as `/overview` and
`/contributors`.

GitHub Pages is an internet-facing static host. Never commit or build a personal
access token into the application; users should continue entering tokens through
Settings, where they are retained for the browser session only.

## Configuration

The fixed organization list and browser storage keys live in
`src/config/dashboard.js`.

No token is required for the standard view. For complete analysis, create a
fine-grained GitHub token with read-only access to the repositories the dashboard
must inspect. The token is kept in `sessionStorage`, is never written to the app's
cache, and is forgotten when the browser session ends or when **Forget** is used in
Settings.

Repository pins, theme choice, and rate-limit metadata are stored in `localStorage`.
Fetched GitHub responses and the latest analysis are cached in IndexedDB. Clearing
site data removes all of these preferences and cached results.

Because this is a client-side application, any script running on the same origin can
access browser storage. Deploy only trusted builds, use a dedicated least-privilege
token, and avoid sharing a deployment origin with unrelated applications.

## Attribution and license

This application is based on OrgExplorer by AOSSIE and has been modified for internal UMCCR use. Licensed under GNU GPL v3.

The upstream project is [AOSSIE-Org/OrgExplorer](https://github.com/AOSSIE-Org/OrgExplorer).
The complete license text is retained in [LICENSE](LICENSE). If this modified version
is distributed, provide the corresponding source and preserve the GPL notices.
