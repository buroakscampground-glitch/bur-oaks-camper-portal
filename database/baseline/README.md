# Reviewed database baseline

This directory contains the reviewed schema-only snapshot of the production
`public` schema. It must never contain camper rows, billing rows,
authentication users, document contents, storage objects, database passwords,
or service-role keys.

Export a candidate only with a runtime-only production database password. To
keep it out of shell history, read it silently into a temporary shell variable:

```sh
read -s 'BUR_OAKS_DB_PASSWORD?Production database password: '
BUR_OAKS_PRODUCTION_DB_PASSWORD="$BUR_OAKS_DB_PASSWORD" npm run baseline:export
unset BUR_OAKS_DB_PASSWORD
```

The export command uses the fixed, reviewed production session-pooler address.
It passes the password through `PGPASSWORD` instead of command arguments, writes
through a temporary directory, scans the dump for row-copying statements, and
publishes `000_public_schema.sql` only after the automated gate passes. The
password must not be saved in `.env`, shell history, source control, or task
notes. Set `BUR_OAKS_PG_DUMP_BINARY` only when a reviewed native `pg_dump`
binary is not on `PATH`.

## Verified baseline

The October 8, 2026 baseline was generated through a project-scoped,
read-only Supabase connection, audited in full, and loaded into the isolated
Bur Oaks Staging project. It contains 59 tables, 36 Bur Oaks functions, 78
policies, and 12 application triggers. All 59 tables have row-level security
enabled. Exact post-restore validation found zero application rows in staging.

After export:

1. Run `npm run baseline:audit`.
2. Review the complete SQL file for production-specific defaults and grants.
3. Apply it only to the empty staging project.
4. Verify table counts, row-level security, policies, functions, and indexes.
5. Load separately authored synthetic fixtures; never dump production rows.
