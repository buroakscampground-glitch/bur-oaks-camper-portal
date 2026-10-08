# Synthetic staging fixtures

`fixtures.sql` contains only fictional records for signed-in staging journeys.
Every identity uses the reserved `.invalid` domain, every campsite begins with
`TEST-`, phone numbers are absent, consent flags are off, and provider IDs are
clearly inert. Do not replace these with production records.

The fixture transaction refuses to run unless `public.app_settings` already
contains the exact marker `environment = staging`. Establish that marker only
after independently verifying the Supabase project reference is the isolated
Bur Oaks Staging project. The fixture must never create its own marker.

After loading, verify fixture IDs, counts, RLS behavior for all three roles,
and that no email, SMS, printer, payment, webhook, cron, or Storage provider was
contacted. Re-running the fixture is idempotent because every row has a fixed
synthetic UUID and uses `ON CONFLICT DO NOTHING`.

The three staging Auth passwords are random and stored only in the Mac login
Keychain under service `Bur Oaks Staging Test Accounts`. They must never be
placed in source control, `.env` files, screenshots, traces, or task notes. The
staging browser suite disables screenshots and traces and clears the password
field before assertions so a failed journey cannot retain a credential.

Run `npm run staging:verify` from the repository on the authorized Bur Oaks Mac.
The guarded runner resolves only the fixed staging project, reads temporary API
authority and random test passwords from the Mac login Keychain, explicitly
empties every payment, email, SMS, printer, webhook, and cron credential, builds
the app against staging, and runs the 360-pixel signed-in and reversible write
journeys. Write tests clean matching fictional records before and after every
case, including failures; they never copy or address production records. The
runner also creates the private staging-only meter-photo bucket when absent and
proves that one fictional photo can become one linked electric invoice before
removing the test photo and operational rows. When no Stripe test credential is
configured, the checkout journey must fail closed and leave its invoice exactly
unchanged; never substitute a live Stripe key to make that test pass.
