# Sleeve release readiness — October 10, 2026

## Decision

The source is substantially closer to an open-source release and is ready for a maintainer review. **Production launch is still gated.** A passing local build does not demonstrate a working, abuse-resistant public AI service.

This preparation has not pushed commits, changed repository visibility, deployed resources, or changed the existing public site.

## Completed locally

- MIT license selected by the maintainer, contribution instructions, vulnerability-reporting guidance, privacy disclosures and third-party notices.
- Locked JSZip 3.10.1 and Wrangler 4.149.0; Node.js 22/24 documented. ZIP support ships in the app instead of depending on a runtime CDN.
- Explicit public build allowlist. Private env files, Git, dependencies, scripts, tests and Functions source are excluded from uploaded assets. Build targets and symlinks are checked before replacing generated output.
- Cloudflare Pages configuration includes Functions and the external shared-budget binding. Preview builds deliberately lack the production budget binding. The Windows helper stages the same public build outside the checkout.
- Read-only CI configured for Linux/Windows and Node.js 22/24, using pinned action revisions: tests, public build, credential scans, Functions compilation, budget Worker dry-run and dependency audit. **The remote CI matrix has not run for this unpushed revision.**
- No owner-specific Last.fm key in source. An explicitly supplied public read key can be injected into the build. An unconfigured installation gives actionable setup feedback and never invents history for a username. Private writer keys remain outside public assets.
- API request/body checks, bounded artwork lookups, exact identity checks, HTTPS artwork hosts, private error headers and JSON 404/405 responses. Public AI fails closed without its shared budget; a stalled budget RPC times out.
- Static CSP and security headers; external theme initialization and image-failure handling compatible with the CSP. Privacy is linked from setup, Settings and the footer.
- Fixed filtered-empty analysis crashes, a mobile Data button overflow, and tab switching that left readers near the footer. Keyboard focus and reduced-motion handling were improved.
- Offline shell includes all browser modules and the local ZIP reader. Failed refreshes retain a healthy cached module; only Sleeve's old caches are removed; API responses and arbitrary same-origin files are not cached.
- Importer tolerates malformed row shapes and invalid values. Synthetic ZIP checks cover twelve months, duplicates, short/skipped plays, podcasts, damaged/unrelated ZIPs and incompatible mixed-service imports without network access.

## Verification evidence

| Check | Result and scope |
| --- | --- |
| `npm run check` | 129 tests pass; public build, source/output scan, Functions compilation and budget Worker dry-run succeed. Test AI requests use synthetic inputs and mocked providers. |
| `npm audit --audit-level=high` | No known dependency vulnerabilities reported at the time of this review. This does not establish absence of vulnerabilities. |
| Reachable Git history scan | No recognized private credential matches. One historical public Last.fm read-key reference remains in `36caedc3e281`, `config.js`. Current source is neutral. Unreachable/remote-only history and unrecognized formats are outside this scan. |
| Local browser checks before interruption | Analytical routes at 320px, Overview at 414/1440px, filtered-empty states, wrapped Data action, keyboard/focus and reduced-motion behavior; no observed runtime errors or horizontal overflow in those checks. Tab switching returned to the start of the new content. |
| Local HTTP checks before interruption | Security headers served; unknown API returned JSON 404, GET on AI returned 405 with Allow POST, local JSZip returned JavaScript. Privacy page displayed correctly after an explicit reload. |
| Synthetic import | The bundled JSZip and production parser processed 52 entries into 50 deduplicated music rows, one podcast and 48 counted plays over twelve months. A fresh, isolated localhost browser imported that ZIP through the file input, completed setup with writing unavailable, displayed 48 plays and preserved the record after reload. The one automatic writer request was intercepted locally; no provider request was sent. |
| Offline behavior | Four service-worker tests cover cached error recovery, cache misses, cache isolation and shell completeness. In the isolated localhost browser, the worker was explicitly registered, HTTP cache disabled and network requests blocked. An uncached API probe failed; reloading still displayed the saved 48-play timeline and loaded JSZip from the offline shell. Network access was restored afterward. Hosted HTTPS registration/update still needs verification. |

The browser connection was restored after an interruption and the local ZIP/persistence/offline checks were completed. Test imports and the explicit service-worker registration used an isolated `localhost` origin, separate from the user's `127.0.0.1` profiles. Existing saved user histories were not deleted or replaced during this work.

## Hosting state observed read-only

On October 10, 2026, the authenticated Cloudflare CLI showed:

- Existing Pages project `liner` at `liner-c7u.pages.dev`, linked to Git, with production branch **`main`**.
- Latest production source shown as **`268114c`**, preceding this preparation. The current local changes are not live there.
- Encrypted production secret names `OPENROUTER_API_KEY` and `NVIDIA_API_KEY` present. Values were not read; presence does not verify validity or which credential is stored.
- `sleeve-ai-budget` Worker lookup returned **404 / code 10007**. The shared-budget Worker is not provisioned under that name.

## Remaining launch gates, in order

1. **Repository release review:** review the diff and third-party notices; run the configured remote CI matrix after an approved push. Enable GitHub private vulnerability reporting and verify a usable private reporting route before public visibility. Review the historical public read key's ownership/usage; do not rewrite shared history without coordinating.
2. **Hosting configuration:** compare the existing Pages settings with the file-managed configuration, ensure a supported build system, Node.js 22/24, build command `npm run build` and output `dist`. Supply the application's approved public Last.fm key. Provision `sleeve-ai-budget` and verify the Pages production `AI_BUDGET` binding. See [DEPLOYMENT.md](DEPLOYMENT.md).
3. **AI account and abuse controls:** verify the encrypted OpenRouter secret and actual account limits/terms. Add platform rate/abuse controls before public AI. Confirm preview isolation and NVIDIA's local-only restriction. Provider free availability and model quality are not guaranteed by the shared budget.
4. **Hosted user journey:** test a new/sparse Last.fm account and a consented large/resumed account, missing artwork, provider failures, exclusions, repeat visits, all main mobile routes and keyboard navigation. Repeat browser ZIP setup/persistence and service-worker update/offline reload checks on HTTPS.
5. **Bounded hosted AI evaluation:** use synthetic or explicitly consented data on the public Functions route to verify profile, curation, year and question tasks; served model, semantic accuracy, latency, cache reuse, fallback consumption and quota exhaustion. The earlier [model evaluation](AI_MODEL_EVALUATION.md) records local evidence and limitations, not production certification.

Community ratings remain optional attributed links or existing approved-source context; no unapproved AOTY/RYM scraping was added. Newer-song mood/tempo/key coverage remains the documented [audio-data pilot](RELEASE_REVIEW.md), not fabricated measurements or an established population comparison.

An approved preview deployment is the next hosting action after these local changes are reviewed. Public launch should follow the hosted checks above.
