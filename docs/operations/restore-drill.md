# Staging restore drill

## Current status

Production has Supabase Pro managed daily database backups. On October 8, 2026,
the reviewed schema-only baseline was restored successfully into the isolated
Bur Oaks Staging project. Validation found 59 public tables, 78 policies, 12
application triggers, row-level security on all 59 tables, and exactly zero
application rows. The 37th public staging function is Supabase's pre-existing
`rls_auto_enable` safeguard; the baseline itself contains the 36 Bur Oaks
functions present in production. No production camper, billing, payment,
document, authentication, or storage data was copied.

The first synthetic journey layer is also complete. Three confirmed staging
Auth identities use reserved `.invalid` emails, no phone numbers, no consent,
and random Keychain-only passwords. The fixture includes one `TEST-01` camper,
office administrator, maintenance user, campsite, two invoices, a credit,
document, meter reading, maintenance request, pump-out request, renewal, event,
RSVP, and office message. A local staging build with Stripe, email, SMS,
printer, webhook, and cron credentials removed proved all three roles can sign
in and see their intended records; camper and maintenance accounts were denied
the office workspace. The drill also caught missing base table grants in the
first snapshot. The baseline was corrected with the exact read-only production
grant catalog before all three journeys passed. Two subsequent clean rebuilds
completed in 4.82 and 4.84 seconds. Each returned all 59 RLS-protected tables,
78 policies, and the expected fictional fixtures without touching production.

The first reversible write layer now covers camper maintenance submission and
rapid-duplicate protection, pump-out creation and replay protection, electronic
signature proof and replay rejection, and administrator credit creation,
immutable audit history, and voiding. Matching fictional operational rows are
removed before and after every test; immutable staging audit evidence remains by
design. That drill exposed eight Admin-only privileged functions with browser
role execution grants. The permission-only correction was proven in staging:
anonymous and camper RPC calls are denied while the role-checked Admin routes
continue to work through `service_role`. A clean rebuild then exposed that the
baseline had granted PostgreSQL's default `PUBLIC` function privilege before
its service-only grants. The baseline now explicitly revokes `PUBLIC`, `anon`,
and `authenticated` access, and a permanent regression test covers all eight
functions. The final ten-journey run passed, including meter-photo upload,
electric invoice creation, invoice linkage, and reversible cleanup. With no
Stripe test credential present, checkout was proven to fail closed and leave
the invoice unchanged; an actual Stripe test-mode session and webhook remain a
provider-integration follow-up rather than a recovery blocker.

## Non-negotiable safeguards

- Never restore into the production project during a drill.
- Never reset the production database password merely to complete the export.
- Never copy production rows, authentication users, document contents, or storage objects into staging.
- Use synthetic identities under reserved `.invalid` domains and obviously fictional lot identifiers.
- Record the start time, finish time, schema version, validation results, recovery point, and cleanup result.

## Drill procedure

1. Generate the schema-only candidate with the guarded baseline workflow in `database/baseline/README.md`.
2. Run `npm run baseline:audit` and manually inspect the entire SQL file for row-copying statements, secrets, production URLs, and production-specific defaults.
3. Apply the approved schema only to Bur Oaks Staging.
4. Verify expected tables, primary keys, row-level security, policies, functions, triggers, and indexes before adding records.
5. Load separately authored synthetic fixtures for one camper, one office administrator, one maintenance user, representative invoices and credits, one unsigned document, one meter reading, and one maintenance request.
6. Point a staging-only application deployment at staging-specific Supabase, Stripe test-mode, messaging test, storage, and cron credentials.
7. Run the golden browser journeys: login routing, account balance, payment handoff in Stripe test mode, document visibility, maintenance submission, and role denial.
8. Delete the drill fixtures or rebuild staging from the approved schema to prove repeatability.
9. Record recovery time objective achieved, latest recoverable point, defects found, and the next drill date.

For Storage, use only a successfully verified encrypted archive and its matching receipt from `docs/operations/storage-backup.md`. Decrypt and restore it only into the isolated staging project after the staging schema and synthetic access controls are ready. Compare the restored object count, total bytes, and checksums to the encrypted manifest; never restore a drill object into production.

## Pass criteria

- Production remains untouched.
- The reviewed schema loads without historical reset migrations.
- Synthetic users can reach only their intended workspaces.
- Billing totals and credit allocations match the fixtures exactly.
- A second clean rebuild produces the same result.
