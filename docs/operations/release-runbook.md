# Production release runbook

## Before changing code

1. State whether the work reads or writes camper, billing, payment, document, messaging, or storage data.
2. Keep unrelated user changes out of the release.
3. For database work, prove the current managed backup is healthy, rehearse the exact change in staging, and record a rollback or compensating action.
4. Never test destructive behavior against production.

## Required gate

Run `npm run verify:release`. A release is not ready unless every command succeeds:

- dependency audit;
- application tests;
- route-aware TypeScript validation;
- migration inventory audit;
- optimized production build;
- Chromium entry and access-boundary checks at required phone widths and desktop.

The same gate runs through GitHub Actions on pull requests and pushes to `main`. Production secrets and production data are not provided to that job.

## Deployment

1. Commit one coherent, reversible change.
2. Push the reviewed commit to `main`.
3. Wait for Vercel to report success; do not assume that a push equals a deployment.
4. Confirm `/api/health` returns HTTP 200, `ok: true`, the expected release, `Cache-Control: no-store`, and an `x-request-id` header.
5. Check the affected live pages and their recognizable content.
6. For role changes, verify one allowed and one denied path without submitting data.
7. For provider workflows, verify the downstream provider state without replaying a payment or message.

## Recovery

Application-only releases roll back to the preceding known-good commit. Database changes must remain backward compatible until the application is verified. Financial mistakes are corrected with audited compensating records, never by silently rewriting history.
