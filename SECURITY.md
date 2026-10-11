# Security

Sleeve is preparing its first public release. Security fixes apply to the current main development line; no older release has a promised support window.

## Reporting

Use the repository's **Security → Report a vulnerability** flow when private vulnerability reporting is enabled. If it is unavailable, contact the maintainer privately through an established channel before sharing sensitive details. Public issues are appropriate for ordinary bugs, but must not contain credentials, listening exports, personal responses, or instructions for exploiting a live service. Enabling and verifying GitHub's private reporting flow is a remaining repository-publication step.

## Hosting boundaries

- Publish only the generated `dist/` directory. Never serve the checkout, `.git`, functions source, dependency directories or private configuration files.
- Provider secrets belong in Cloudflare Pages secrets or private local env files. The public Last.fm read key is intentionally visible in browser configuration; it is not a provider inference credential or a Last.fm account login.
- Public AI requests require the external `AI_BUDGET` Durable Object. Add an edge rate rule before launch; isolate-local limits do not prevent coordinated abuse.
- Do not log request bodies or generated personal writing. Keep diagnostics to task, model, status and timing.
- `npm run check` scans source and public output for known credential formats. `npm run check:secrets:history` also scans locally reachable Git history. These checks are useful guards, not proof that no secret of any format exists.

If a private credential is exposed, revoke or rotate it at its provider and review cached copies and Git history. Removing the current file alone does not remove historical copies. Never rewrite shared Git history without coordinating with its users.
