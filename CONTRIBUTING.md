# Contributing

## Prerequisites

- Node.js 20.19 or later
- npm
- [pre-commit](https://pre-commit.com/)

Install the JavaScript dependencies and Git hooks after cloning:

```bash
npm install
pre-commit install
```

The repository uses npm consistently. Commit `package-lock.json` when dependencies change.

## Quality checks

Run the complete local quality suite with:

```bash
npm run check
```

Individual commands are also available:

```bash
npm run lint
npm run lint:fix
npm run format:check
npm run format
npm test -- --run
npm run build
```

The pre-commit hooks check JSON and YAML files, whitespace, merge conflicts, private keys,
credentials, secrets, ESLint, and Prettier. Run every hook manually with:

```bash
pre-commit run --all-files
```

If you intentionally add a detected non-secret value, update `.secrets.baseline` with
`detect-secrets` and review the resulting diff before committing it.
