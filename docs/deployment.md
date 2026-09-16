# Deploying UMCCR GitHub Portfolio

This document is for repository maintainers who deploy the application to GitHub
Pages.

## GitHub Pages deployment

The repository includes `.github/workflows/deploy.yml`. It tests and builds the Vite
application, uploads `dist`, and deploys it through GitHub Pages whenever `main` is
updated. The production Vite base path and React Router basename are configured for
`/github-portfolio-dashboard/`.

After a deployment change has been reviewed:

1. Merge the pull request into the repository's `main` branch.
2. Open **Settings → Pages** in GitHub.
3. Under **Build and deployment**, select **GitHub Actions** as the source.
4. Open the **Actions** tab and confirm the **Deploy UMCCR GitHub Portfolio** workflow succeeds.
5. Visit <https://umccr.github.io/github-portfolio-dashboard/>. A first deployment can take a few minutes.

Future pushes to `main` deploy automatically. The generated `404.html` allows direct
visits and browser refreshes on client-side routes such as `/overview` and
`/contributors`.

## Token safety

GitHub Pages is an internet-facing static host. Never commit or build a personal
access token into the application. Users should enter tokens through Settings, where
they are retained for the browser session only.
