# Deploying Sleeve

Sleeve uses **Cloudflare Pages with Pages Functions**, plus a separate Worker for the shared AI request budget. The historical Pages project name is `liner`; the budget Worker is `sleeve-ai-budget`. The root Wrangler configuration now describes Pages, not a static Workers deployment.

## Account state checked October 10, 2026

Initial read-only checks found production branch **`main`**, source `268114c`, and no `sleeve-ai-budget` Worker. With the maintainer's subsequent authorization, that Worker was provisioned and the Pages production binding was added. Pages build settings now use `npm run build`, `dist`, build image 3 and Node.js 22. The approved public Last.fm read key is configured for builds, and the supplied OpenRouter key was installed as an encrypted production secret. OpenRouter's key-status endpoint returned 200. Preview environments retain no production budget binding or writer secret. See [release readiness](RELEASE_READINESS.md) for deployment evidence and remaining gates.

## Reproduce the release locally

Use Node.js 22 or 24 and npm. Wrangler is pinned to 4.149.0 and JSZip to 3.10.1 in the lockfile.

```sh
npm ci
npm run check
npm audit --audit-level=high
node scripts/check-secrets.mjs --history
```

`npm run check` scans source for credentials, runs the tests, builds public assets, scans the resulting files, compiles Pages Functions and dry-runs the budget Worker. The dry-run creates local bundles without deploying or calling an AI provider. It does not verify a Cloudflare account's resources, provider quota, or production secrets. The history scan is an additional publication gate; rotating credentials does not remove committed values from Git history.

GitHub Actions runs these gates on Linux and Windows with Node.js 22 and 24. It has read-only repository permissions and no deployment credentials. Audit results reflect the dependency advisory database at the time of the run.

## Public build boundary

```sh
npm run build
```

Only `dist/` is a public asset directory. The builder copies an explicit root-file list, browser `.js` modules, supported artwork assets, the public audio audit, and optional `_headers` / `_redirects`. JSZip's pinned minified browser file and license are copied explicitly from its package into `assets/vendor/`. No other `node_modules`, Functions source, scripts, tests, docs, Git files, `.env`, or `.dev.vars` are public assets. `_routes.json` invokes Functions only for `/api/*`.

The builder rejects symlinked public inputs. It can clean only the project's generated `dist/`; `--out-dir <path>` requires a fresh or empty external directory and refuses to overwrite its existing contents. Use a fresh external output for private local staging. The code, archives, and user profile data are not bundled from local browser storage.

`LASTFM_API_KEY` is an optional build environment variable: a 32-character hexadecimal **public browser read key**. When provided, it is inserted into generated `dist/config.js`; it is visible to every visitor. The source `config.js` stays blank. Obtain and review the application's own Last.fm key before enabling public Last.fm access. With no configured key, the demo and local archive views work; users can supply their own key in Settings.

**AI provider tokens are different:** never pass them to frontend configuration or build substitutions. Keep them in private local files or Cloudflare encrypted secrets. The builder does not copy environment variables other than the explicit public Last.fm key.

## Local preview

```sh
npm run preview
```

Open `http://127.0.0.1:5178`. Statistics and the demo need no AI secret. Rebuild/restart after editing source because the preview serves the public snapshot. Windows users can use `scripts/dev.ps1` for a fresh external staging folder and optional private local configuration.

For optional local AI, pass the **path** of a private dotenv file outside `dist/`, never a token value in a command argument:

```sh
npm exec -- wrangler pages dev dist --env-file /absolute/private/path/.dev.vars --port 5178
```

The file can contain `OPENROUTER_API_KEY` and, for localhost prototyping only, `NVIDIA_API_KEY`. This command does not load a separate local Durable Object implementation. For a full local shared-budget test, start `sleeve-ai-budget` with Wrangler in a separate terminal and keep the configured external binding. The automated budget tests exercise its admission rules without provider requests. `AI_BUDGET_REQUIRED=1` makes local AI fail closed when a binding is absent.

## Prepare hosting before an approved deployment

1. Compare `wrangler.jsonc` with the existing Cloudflare Pages project's settings. Adding `pages_build_output_dir` opts the project into file-managed configuration; it becomes the source of truth. Use the V2 build system or later. Do not blindly replace account resources from another deployment.
2. Review the external Worker name and Durable Object migration in `ai-budget/wrangler.jsonc`. Deploy that Worker before enabling public AI. Its `AIBudget` class is bound as `AI_BUDGET` in the Pages production configuration. Pages cannot define its own Durable Object class.
3. Add `OPENROUTER_API_KEY` as an **encrypted production Pages secret**. Configure it in the dashboard without pasting it into source or command arguments. Verify the account's actual free quota and provider terms. Public writing refuses to spend without `AI_BUDGET`.
4. Configure the Pages build command `npm run build`, output `dist`, and Node.js 22 or 24. Provide the optional public `LASTFM_API_KEY` as a build variable. Pages compiles repository `functions/` separately; do not upload the repository root as assets.
5. Review production hostname, domain ownership, preview access and platform request/rate controls. Read the privacy and third-party notices. Confirm metadata/API usage terms and a release review of generated writing.

Cloudflare documents the configuration migration and external Durable Object requirement. [Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/), [Durable Object bindings](https://developers.cloudflare.com/pages/functions/bindings/#durable-objects)

The budget allows 19 attempts per rolling minute and 900 per UTC day. Provider fallbacks also consume slots; cached results do not. This is one shared public account budget, not a per-user allowance or an availability guarantee.

Durable visitor limits also allow at most 12 provider attempts per ten minutes and 60 per UTC day for a day-specific digest of the connecting IP. Shared networks share that allowance. Raw IPs and listening facts are not sent to budget storage. Counters roll over daily; an idle-counter alarm removes the previous day's state ten minutes after midnight UTC. These controls limit quota spending across isolates; they do not authenticate visitors or prevent all coordinated abuse. Add zone-level request controls when serving a custom domain that supports them.

## Preview and production policy

The checked-in preview environment deliberately has **no `AI_BUDGET` binding**. Public previews can test statistics, layouts and graceful unavailable-writing states without spending the production AI quota. Do not give untrusted pull-request builds provider secrets. A deliberate AI preview needs a separately provisioned budget Worker and its own approved credential/configuration; do not silently borrow the production counter.

The following commands are prepared for a separately approved hosting step; running them creates or updates remote resources:

```sh
npm run deploy:budget
npm run deploy:preview
```

The preview command uses branch `sleeve-preview`. Confirm that this branch is not the Pages project's configured production branch before running it. For production, deploy the reviewed `dist/` with Wrangler Pages using the project's **actual** configured production branch; it is not inferred by this repository. Neither tests nor CI deploy automatically.

The observed production branch is currently `main`; recheck it at deployment time. After the budget Worker, production binding, secrets and build configuration have been reviewed, a separately approved production upload would use:

```sh
npm exec -- wrangler pages deploy dist --project-name liner --branch main
```

Run the full checks and rebuild with the approved public Last.fm build variable before that upload. Do not assume an earlier developer build has the intended public configuration.

## Verify the hosted release

- Landing page, mobile navigation, all analysis destinations, synthetic demo labeling and local ZIP import work with AI unavailable.
- Confirm `/api/*` routes run as Functions and unknown API routes do not return the SPA HTML. Check security headers for both static responses and Function responses; Pages `_headers` alone does not protect Function responses.
- Confirm `.dev.vars`, `.env`, `.git/config`, source `functions/`, package files and scripts are absent from the uploaded asset list. A SPA fallback may return HTML with status 200 for a missing path: inspect the body, not only the status.
- Verify the production Durable Object binding, request-limit behavior and OpenRouter failure handling without disclosing tokens or listening summaries in logs. Use a consented test profile and a bounded generation check only after deployment approval.
- Verify the service-worker update and offline ZIP library; source changes should be visible after refreshing, and an older shell must not hide the release.

The dry-run proves bundle construction, not that these hosting gates have been satisfied. No deployment is performed by the preparation commands.
