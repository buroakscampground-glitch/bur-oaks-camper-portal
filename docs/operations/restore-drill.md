# Staging restore drill

## Current status

Production has Supabase Pro managed daily database backups. The isolated Bur Oaks Staging project exists and contains no production camper, billing, payment, document, authentication, or storage data. A full restore drill is pending the reviewed schema-only baseline; historical migrations must not be used as a substitute.

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

## Pass criteria

- Production remains untouched.
- The reviewed schema loads without historical reset migrations.
- Synthetic users can reach only their intended workspaces.
- Billing totals and credit allocations match the fixtures exactly.
- A second clean rebuild produces the same result.
