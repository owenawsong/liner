# Contributing to Sleeve

Use Node.js 22 or 24 and run `npm ci`, then `npm run check`. The frontend is plain browser ES modules; there is no framework compilation step. See [README.md](README.md) for local development and [deployment instructions](docs/DEPLOYMENT.md) for hosting.

The demo and local file analysis work without API keys. Use synthetic histories in tests and reports. Keep private keys in a local file outside the checkout; never attach listening archives, `.dev.vars`, personal provider responses or unredacted logs to issues and pull requests. A Last.fm read key used in the public browser build is visible to visitors and must be provisioned for that use.

Before submitting a change:

- Run `npm run check` and `npm run check:secrets:history`.
- For UI changes, inspect a narrow mobile view and a desktop view, keyboard focus, the relevant light/dark themes, and missing-data states. Describe which journeys you actually checked.
- For statistical changes, use a small synthetic record with a hand-checkable expected result. Missing observations must remain missing; do not interpret absent history as zero listening.
- For AI changes, preserve locally computed facts, privacy controls, bounded requests and exact candidate identity checks. Live provider evaluations consume account quota and must be deliberate.
- Preserve saved browser storage and existing routes. Any migration needs a recovery path.

Explain the change, its reason, verification and remaining limitations in the pull request. Contributions are covered by this project's MIT license; external code, artwork and datasets must retain their own applicable notices and rights.
