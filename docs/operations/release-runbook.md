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

## Emergency action controls

Three server-only Vercel environment variables can pause high-risk actions while leaving the rest of the portal available. A missing variable and `true` both mean enabled. Set a variable to `false`, redeploy the current production commit, and confirm its state under **Admin → System Health → High-risk actions**.

- `BUR_OAKS_BILLING_CHECKOUT_ENABLED` pauses creation of new Stripe checkout sessions. Existing invoices and payments are unchanged.
- `BUR_OAKS_RENEWAL_DECISIONS_ENABLED` pauses new camper non-renewal decisions. Prior decisions and documents are unchanged.
- `BUR_OAKS_MANUAL_TEXTS_ENABLED` pauses manual text campaigns before a campaign or delivery record is created. Automated transactional notices are unchanged.

After the incident, correct and verify the underlying problem before setting the control to `true` and redeploying. Never use a switch to conceal or rewrite a payment, decision, or message that already occurred.

## Performance budgets and real-user signals

When Google Analytics is configured, the browser reports the standard CLS, FCP, INP, LCP, and TTFB metrics as a `web_vital` event. Reports contain only the metric, rating, broad workspace group, navigation type, and whether the target budget was met. They never include the URL, record ID, account identity, email, phone, invoice, or form contents.

The initial good-experience budgets are CLS ≤ 0.1, FCP ≤ 1.8 seconds, INP ≤ 200 milliseconds, LCP ≤ 2.5 seconds, and TTFB ≤ 800 milliseconds. Review trends by `route_group` (`public`, `camper`, `admin`, `maintenance_staff`, or `community`) rather than attempting to identify a camper. A release that materially worsens a core workspace should be corrected or rolled back even when the functional gate passes.
