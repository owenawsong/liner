# Sleeve release readiness — October 10, 2026

## Decision

The prepared release is now deployed to **[liner-c7u.pages.dev](https://liner-c7u.pages.dev)**, with a tested [preview](https://sleeve-preview.liner-c7u.pages.dev). The [release PR](https://github.com/owenawsong/liner/pull/1) was merged into `main`; the repository remains private with MIT licensing. Public repository visibility is a separate final publication step. Anonymous AI limits and a small hosted evaluation do not establish unlimited availability or perfect interpretation.

The maintainer authorized hosting work after the initial local preparation. Source was pushed, the budget Worker provisioned, Pages build/runtime settings and encrypted secrets configured, and preview/production deployments uploaded. No paid tier was introduced. Frontend, analysis, recommendations, prompts, validation and server/budget code remain in the open-source plan; private credentials and user data are excluded.

## Completed locally

- MIT license selected by the maintainer, contribution instructions, vulnerability-reporting guidance, privacy disclosures and third-party notices.
- Locked JSZip 3.10.1 and Wrangler 4.149.0; Node.js 22/24 documented. ZIP support ships in the app instead of depending on a runtime CDN.
- Explicit public build allowlist. Private env files, Git, dependencies, scripts, tests and Functions source are excluded from uploaded assets. Build targets and symlinks are checked before replacing generated output.
- Cloudflare Pages configuration includes Functions and the external shared-budget binding. Preview builds deliberately lack the production budget binding. The Windows helper stages the same public build outside the checkout.
- Read-only CI configured for Linux/Windows and Node.js 22/24, using pinned action revisions: tests, public build, credential scans, Functions compilation, budget Worker dry-run and dependency audit. All four jobs passed at `0a791d1` ([run](https://github.com/owenawsong/liner/actions/runs/38105658493)); the latest run is linked in the release PR. CI uncovered Windows short-path alias handling and a timer-test synchronization issue; both were repaired.
- No owner-specific Last.fm key in source. An explicitly supplied public read key can be injected into the build. An unconfigured installation gives actionable setup feedback and never invents history for a username. Private writer keys remain outside public assets.
- API request/body checks, bounded artwork lookups, exact identity checks, HTTPS artwork hosts, private error headers and JSON 404/405 responses. Public AI fails closed without its shared budget; a stalled budget RPC times out.
- Static CSP and security headers; external theme initialization and image-failure handling compatible with the CSP. Privacy is linked from setup, Settings and the footer.
- Fixed filtered-empty analysis crashes, a mobile Data button overflow, and tab switching that left readers near the footer. Keyboard focus and reduced-motion handling were improved.
- Offline shell includes all browser modules and the local ZIP reader. Failed refreshes retain a healthy cached module; only Sleeve's old caches are removed; API responses and arbitrary same-origin files are not cached.
- Importer tolerates malformed row shapes and invalid values. Synthetic ZIP checks cover twelve months, duplicates, short/skipped plays, podcasts, damaged/unrelated ZIPs and incompatible mixed-service imports without network access.

## Verification evidence

| Check | Result and scope |
| --- | --- |
| `npm run check` | 140 tests pass locally, including the follow-up question guard; public build, source/output scan, Functions compilation and budget Worker dry-run succeed. Linux skips the Windows-specific case test. Unit AI requests use synthetic inputs and mocked providers. |
| `npm audit --audit-level=high` | No known dependency vulnerabilities reported at the time of this review. This does not establish absence of vulnerabilities. |
| Reachable Git history scan | No recognized private credential matches. One historical public Last.fm read-key reference remains in `36caedc3e281`, `config.js`. Current source is neutral. Unreachable/remote-only history and unrecognized formats are outside this scan. |
| Local browser checks before interruption | Analytical routes at 320px, Overview at 414/1440px, filtered-empty states, wrapped Data action, keyboard/focus and reduced-motion behavior; no observed runtime errors or horizontal overflow in those checks. Tab switching returned to the start of the new content. |
| Local HTTP checks before interruption | Security headers served; unknown API returned JSON 404, GET on AI returned 405 with Allow POST, local JSZip returned JavaScript. Privacy page displayed correctly after an explicit reload. |
| Synthetic import | The bundled JSZip and production parser processed 52 entries into 50 deduplicated music rows, one podcast and 48 counted plays over twelve months. A fresh, isolated localhost browser imported that ZIP through the file input, completed setup with writing unavailable, displayed 48 plays and preserved the record after reload. The one automatic writer request was intercepted locally; no provider request was sent. |
| Offline behavior | Four service-worker tests cover cached error recovery, cache misses, cache isolation and shell completeness. In isolated localhost and hosted HTTPS preview checks, HTTP cache was disabled and network requests blocked. An uncached API probe failed; reloading still displayed the saved 48-play timeline and loaded JSZip from the offline shell. Network access was restored afterward. Broader cross-browser update behavior remains additional QA. |

The browser connection was restored after an interruption and the local ZIP/persistence/offline checks were completed. Test imports and the explicit service-worker registration used an isolated `localhost` origin, separate from the user's `127.0.0.1` profiles. Existing saved user histories were not deleted or replaced during this work.

## Hosting state observed read-only

On October 10, 2026, the authenticated Cloudflare CLI showed:

- Existing Pages project `liner` at `liner-c7u.pages.dev`, linked to Git, with production branch **`main`**.
- Latest production source shown as **`268114c`**, preceding this preparation. The current local changes are not live there.
- Encrypted production secret names `OPENROUTER_API_KEY` and `NVIDIA_API_KEY` present. Values were not read; presence does not verify validity or which credential is stored.
- `sleeve-ai-budget` Worker lookup returned **404 / code 10007**. The shared-budget Worker is not provisioned under that name.

Those were the initial observations. Subsequent authorized work closed the missing Worker/configuration gates:

- `sleeve-ai-budget` deployed with the SQLite `AIBudget` namespace; production Pages binds it as `AI_BUDGET`. It now enforces shared 19/minute and 900/day provider attempts, plus durable visitor 12/ten-minute and 60/day attempts. Daily pseudonymous visitor counters have an idle cleanup alarm. Limit denial/rollover and no-inference-on-denial are covered by tests; deliberately exhausting the live account budget was not attempted.
- Build command `npm run build`, output `dist`, build image 3 and Node.js 22 configured. Account-specific Last.fm build configuration is stored encrypted to survive file-managed uploads; its generated browser value remains public. The encrypted production OpenRouter key returned 200 from the provider's key-status endpoint. That endpoint's deprecated rate field does not verify the account's exact daily free allowance.
- Preview has no writer key or production budget binding; its POST AI route returned 503. Production unknown API routes return JSON 404 and invalid AI methods return 405. Static CSP/nosniff headers and local JSZip were verified. Probes for env/Git/server/package paths returned SPA HTML, not source or credentials.
- Hosted preview checked at 320px across all nine destinations with no observed horizontal overflow or runtime errors. Synthetic ZIP setup, reload persistence and HTTPS offline reload succeeded with network disabled and HTTP cache disabled. Production preserved the existing saved profile list; it was not cleared.
- Last.fm invalid-format and missing-user feedback and the owner's live lookup were checked. The preview imported **12,641 recorded plays / 598 artists**, completed preparation with writing unavailable, and reopened the record after reload. Sparse-history and interrupted-checkpoint behavior also has automated coverage; a separately consented interrupted live account test remains broader QA.
- Initial production upload `aa014bb9-89dd-4047-9fc9-dfcea1f53336` at source `bd07ec5` succeeded. Follow-up build-variable fixes shipped at `f806df7f`; year validation shipped at [e1cf1687](https://e1cf1687.liner-c7u.pages.dev) from `0a791d1`. GitHub's automatic production deployment [aaf36a61](https://aaf36a61.liner-c7u.pages.dev) succeeded from merge `8a7b503`. The required budget, Node version and encrypted Last.fm/provider configuration were verified afterward. The local 5195 preview was rebuilt from the release source and retained its synthetic saved record.

## Hosted AI evaluation

Only synthetic facts were submitted manually on the production Functions route. No provider token was exposed in browser code or test output.

| Task | Result |
| --- | --- |
| Structured profile | Dots, 200, 3.746 s; kept Alpha's decline, Delta's rise and Gamma's return attached to the supplied artists. |
| Sparse candidate curation | 503 fallback; no unsupported selection displayed. |
| Candidate curation with complete per-candidate evidence | Dots, 200, 3.262 s; four distinct supplied IDs and connected seed reasons. |
| Year | Initial Dots response, 200, 1.907 s, promoted selected counts into an annual-leader claim. Prompt revision alone did not resolve it. The v21 year cache and server validator now reject unscoped leadership language, excessive numbers and overlong prose. The same sparse synthetic fixture returned a safe 503 fallback in 3.671 s; no unsupported text was served. A separate synthetic provider inspection confirmed that Dots still sometimes exceeds the numeric budget. Year-writing availability remains a quality limitation, rather than a demonstrated success. |
| Calculated question commentary | Initial Dots response, 200, 1.730 s, preserved decline/rise and Alpha's continuing presence. A subsequent post-merge check, 200, 6.178 s, inferred a "direct rotation swap" from concurrent changes. The follow-up prompt and v20 question cache add a guard against swap, handoff, replacement and causal wording. Regression tests verify rejection and fallback; this phrasing guard is not a semantic proof for every answer. |
| Repeated profile | Cache hit, 200, 109 ms; reused the same served model/output. |

This is a small functional/semantic spot check, not a p95 benchmark or proof that every accepted sentence is correct. Model interpretation remains labeled and exact calculations remain available when writing fails. [Earlier model evaluation](AI_MODEL_EVALUATION.md) records provider restrictions and local evidence. The error copy now describes unavailable supported writing instead of assuming every validation failure means busy providers.

## First experience follow-up

The next release improves preparation and discovery without changing repository visibility:

- Three separate preparation stages show actual artist-check counts and writing/recommendation state. Writing starts concurrently with metadata; saved checkpoints resume completed work. A deadline also releases services that ignore cancellation. The play-history read remains determinate only once its source reports a total.
- Setup offers an early profile preview and keeps statistics available on writing failures. First ZIP imports open Overview. Short histories explain the missing comparison period instead of treating it as zero listening.
- Checked starting records appear before curation/artwork finish; late writing does not reshuffle them. Save/pass/already-heard actions have feedback and Undo. Discovery uses an indeterminate activity indicator while external checks run, rather than presenting its internal weighted phases as a measured percentage.
- Version 22 shares output validation with a fixed six-case synthetic evaluation. Failures distinguish provider availability, invalid formatting, unsupported output, quota and deadlines. Year input is restricted to the selected year. Observed sound/motivation claims from listener connections are withheld in both server and browser checks.
- The maintainer replaced the invalid local OpenRouter credential; the new value is stored encrypted in production configuration. It is absent from source and public assets. Public model routes still use the shared attempt budget and deny data collection; NVIDIA remains localhost-only.

Local verification: 163 tests pass, both server bundles compile, source/public output scans have no blocking findings, and the dependency audit reports no known vulnerabilities. This follow-up has browser action/layout checks at 320px for the username form, independent preparation failures, Overview and Discover. Normal field/button heights are 56/46px on the checked desktop form. An isolated synthetic ZIP imported 48 counted plays, preserved them on reload, and allowed exploration while a held metadata adapter was still running. Additional ZIPs imported 20 plays over ten days and 12,000 plays over 24 months. The short history explained the absent comparison baseline and produced catalogue records connected to its two artists; the larger import completed preparation and opened Overview. Discover Save/Undo, secondary opinion links and two starting-record layout were checked. Screenshot capture was unreliable in this browser session, so these are DOM/layout/action checks, not a completed visual review across browsers.

The [fixed live AI evaluation](AI_MODEL_EVALUATION.md#fixed-launch-evaluation--october-10-follow-up) reports accepted and withheld outputs separately. It exposed continued year/curation limitations and a provider 502. It does not establish model quality for every profile or public capacity. [The beta guide](BETA_REVIEW.md) provides the next real-user review; no external participants have been contacted or counted as tested.

## Remaining publication and quality work

1. **Public repository:** enable public visibility when the maintainer is ready, then immediately enable and verify private vulnerability reporting. GitHub describes that feature for public repositories; its API returned 404 while this repository is private. No visibility change was made. Review the historical public read key's ownership/usage; do not rewrite shared history without coordinating.
2. **Broader user coverage:** test separately consented new/sparse and interrupted live accounts, exclusion edits, keyboard routes, missing-artwork/provider-failure states and update behavior in additional browsers. The hosted import/offline/mobile evidence above covers specific checked paths.
3. **AI quality and capacity:** grow a fixed synthetic semantic evaluation, assess latency distributions and review real provider capacity before promotion. The account budget caps attempts, not successful preparations or guaranteed availability. Shared-IP visitors share an allowance; anonymous limits do not prevent all coordinated abuse. Add zone-level controls when hosting on a custom domain that supports them.

Community ratings remain optional attributed links or existing approved-source context; no unapproved AOTY/RYM scraping was added. Newer-song mood/tempo/key coverage remains the documented [audio-data pilot](RELEASE_REVIEW.md), not fabricated measurements or an established population comparison.

See [DEPLOYMENT.md](DEPLOYMENT.md) for reproducible self-hosting and environment boundaries. The public site is deployed; public repository release and broader quality/capacity work remain explicit next steps.
