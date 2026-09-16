# Project Structure & Conventions

## Layout

```
src/
  App.jsx              # Routes (lazy-loaded pages), Layout, RequireAnalysis guard
  main.jsx             # React entry
  config/
    dashboard.js       # Fixed org list, labels, storage keys, legal notice — single source of truth
  context/
    AppContext.jsx     # AppProvider: fetch orchestration, analysis model, all app state
    app-context.js     # AppContext object + useApp() hook (kept separate for react-refresh)
    ThemeContext.jsx   # ThemeProvider + useTheme()
    __tests__/
  services/
    github.js          # GitHub REST client: fetch + IndexedDB cache + rate-limit events
    analytics.js       # Pure functions: health score, bus factor, analytical model
    cache.js           # IndexedDB persistence of the last analysis (1h TTL)
    __tests__/
  hooks/               # Reusable hooks (e.g. useSortedData)
    __tests__/
  pages/               # Route-level components (Overview, Repositories, Contributors, ...)
    __tests__/
  components/          # Shared UI (UI.jsx exports C helpers + Spinner, Navbar, banners, ...)
    __tests__/
  utils/               # Pure helpers (formatNumber, markdown)
    __tests__/
  styles/global.css    # Global styles + CSS custom properties for theming
  test/setup.js        # Shared Vitest/jsdom setup (test infrastructure, not specs)
```

Every source directory keeps its specs in a sibling `__tests__/` folder. `src/test/`
is reserved for shared test _infrastructure_ (the Vitest setup file, and any future
fixtures or helpers) rather than specs.

## Architectural conventions

- **State lives in `AppContext`.** Data fetching, the analytical model, issues/pulls
  data, rate-limit state, pins, and selected org scope are all coordinated in
  `AppProvider`. Consume via `useApp()` from `context/app-context.js`. Don't scatter
  fetch logic into pages.
- **Services are the only place that touch the network or IndexedDB.** Pages and
  components call context actions; context calls `services/github.js` and
  `services/analytics.js`. Keep `analytics.js` functions pure and unit-tested.
- **Context/hook split for Fast Refresh.** The context object + `useApp` hook live in a
  plain `.js` file (`app-context.js`) while the provider lives in the `.jsx`. ESLint's
  `react-refresh/only-export-components` enforces this — follow the existing pattern.
- **Errors use string codes.** `github.js` throws `RATE_LIMIT`, `FORBIDDEN`,
  `NOT_FOUND`, `STATS_PENDING`, or `HTTP_<status>`; callers map these to user messages.
  Reuse these codes rather than inventing new error shapes.
- **Rate limit via custom event.** `github.js` dispatches a `rate-limit-update` window
  event; `AppContext` listens and persists it. Preserve this decoupling.
- **Routing.** Pages are lazy-loaded and (except Settings) wrapped in `RequireAnalysis`,
  which blocks until the fixed portfolio has loaded/hydrated.
- **Theming.** Prefer CSS custom properties (`var(--...)`) and the `C` style helpers in
  `components/UI.jsx` over hard-coded colors, so light/dark themes stay consistent.

## Testing conventions

- Specs live in a `__tests__/` folder next to the code they cover, named
  `<subject>.test.js` / `.test.jsx` (e.g. `src/services/__tests__/analytics.selection.test.js`,
  `src/components/__tests__/Navbar.test.jsx`).
- From inside `__tests__/`, the module under test is `../Name` and cross-directory
  imports are `../../dir/name`. `vi.mock()` paths resolve relative to the test file, so
  they follow the same rule.
- Where one source module has several spec files, prefix them with the module name so
  they group together: `analytics.selection.test.js`, `analytics.healthMetrics.test.js`,
  `github.credentialCache.test.js`.
- Use Vitest + Testing Library. jsdom is the environment; `globals: true` is enabled so
  `describe/it/expect` need no imports.
- Vitest uses its default discovery glob, so a spec placed outside `__tests__/` still
  runs. Keep it in `__tests__/` anyway for consistency.
- Do not add tests unless the task calls for them, but when adding features or fixing
  bugs, add specs in the matching `__tests__/` folder.

## Naming

- Components: `PascalCase.jsx`. Hooks: `useXxx.js`. Services/utils/config:
  `camelCase.js`. Keep new files consistent with these patterns and place them in the
  matching directory.
