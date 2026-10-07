# Database migration safety

This folder is historical production change history. It is **not** a clean-room
database baseline and must not be replayed wholesale against staging or a new
production project.

Why replay is blocked:

- The first migration alters tables that must already exist.
- Some migrations intentionally insert or update live operational data.
- `009_go_live_reset_and_document_templates.sql` contains launch-era deletes.
- Numeric prefixes are duplicated, so filename ordering is ambiguous.

Use `npm run migrations:audit` to see the current inventory. CI or recovery
workflows that expect a fresh-database baseline must run
`npm run migrations:baseline-check`; it exits unsuccessfully until a separate,
reviewed baseline exists.

Before applying any database change:

1. Prove the current production backup is healthy.
2. Test the exact migration against the data-free staging project.
3. Use additive changes where possible and provide a rollback.
4. Verify row-level security, affected indexes, and the portal build.
5. Apply to production once, then run read-only post-deploy checks.

Never place camper roster exports, billing records, service-role keys, database
passwords, or production data in this repository.

The replacement clean-room workflow lives in `database/baseline/README.md`.
Use `npm run baseline:export` with a runtime-only production database password to
create a schema-only candidate, then run `npm run baseline:audit` and inspect
the complete SQL before applying it to the empty staging project.
