# Tech Stack & Commands

## Stack

- **React 18** with **React Router 6** (hash-free client routing; routes are lazy-loaded
  in `src/App.jsx`).
- **Vite 8** build tooling. `base` is `/github-portfolio-dashboard/` in production and
  `/` in dev.
- **Tailwind CSS 4** via `@tailwindcss/vite`, plus a global stylesheet at
  `src/styles/global.css` and inline styles using CSS custom properties (e.g.
  `var(--text2)`) for theming.
- **recharts** for charts, **react-icons** (Feather / `Fi*`) for icons,
  **vite-plugin-svgr** for SVG imports.
- **Vitest** + **@testing-library/react** + **jsdom** for tests
  (`src/test/setup.js`).
- JavaScript + JSX only. No TypeScript. `type: module` (ESM everywhere).
- Requires **Node.js >= 20.19**. Use **npm** (commit `package-lock.json` on dep changes).

## Commands

```bash
npm install          # install deps
npm run dev          # Vite dev server (run manually; do not launch from the agent)
npm run build        # production build (also emits 404.html SPA fallback)
npm run preview       # preview the production build
npm test -- --run    # run the test suite once (non-watch)
npm run coverage     # tests with v8 coverage
npm run lint         # eslint, fails on any warning (--max-warnings=0)
npm run lint:fix     # eslint autofix
npm run format       # prettier write
npm run format:check # prettier check
npm run check        # lint + format:check + tests + build (full local gate)
```

Run `npm run check` before considering a change complete. It mirrors CI.

> Dev servers and watch mode are long-running — never start them from an automated
> command. Always use `npm test -- --run` (single run), not watch mode.

## Formatting & lint rules

Prettier (`.prettierrc.json`): **no semicolons**, single quotes, `arrowParens: avoid`,
`printWidth: 100`, `trailingComma: all`, LF line endings. Match this style exactly.

ESLint (`eslint.config.js`) treats `react-hooks/exhaustive-deps` and
`rules-of-hooks` as **errors**. Keep hook dependency arrays complete and correct.
`coverage/`, `dist/`, and `node_modules/` are ignored.

## Pre-commit

The repo uses [pre-commit](https://pre-commit.com/) (`pre-commit install`) with hooks
for JSON/YAML checks, whitespace, merge conflicts, private keys, credentials/secrets
scanning (detect-secrets), ESLint, and Prettier. If you intentionally add a flagged
non-secret, update `.secrets.baseline` with `detect-secrets` and review the diff.

## Deployment

GitHub Pages via `.github/workflows/deploy.yml` on pushes to `main`. The build copies
`index.html` to `404.html` so direct visits / reloads of client routes resolve. See
`docs/deployment.md`.
