# Reviewed database baseline

This directory is reserved for a schema-only, human-reviewed snapshot of the
production `public` schema. It must never contain camper rows, billing rows,
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
notes.

After export:

1. Run `npm run baseline:audit`.
2. Review the complete SQL file for production-specific defaults and grants.
3. Apply it only to the empty staging project.
4. verify table counts, row-level security, policies, functions, and indexes.
5. Load separately authored synthetic fixtures; never dump production rows.
