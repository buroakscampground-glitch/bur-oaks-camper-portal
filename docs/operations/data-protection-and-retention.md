# Data protection and retention

## Systems of record

- Supabase database: camper profiles, invoices, credits, operational records, and authorization relationships.
- Supabase Storage: uploaded documents, signature evidence, meter photos, insurance files, and community media.
- Stripe: payment methods, checkout, charges, refunds, disputes, and payout evidence.
- Messaging providers: delivery state for operational email and SMS.

The downloadable System Health operations record is a convenience summary. It is not a substitute for any system of record and is not restorable.

## Protection priorities

1. Keep managed database backups enabled and review their freshness.
2. Run the guarded independent encrypted Storage export in `docs/operations/storage-backup.md`; database backups do not include Storage objects.
3. Perform restore drills only in isolated staging.
4. Keep secrets out of source control, exports, browser logs, screenshots, and support notes.
5. Use opaque request references instead of customer details when investigating failures.

## Retention decisions requiring owner and professional review

Before automatic deletion is introduced, document the legally and operationally required period for:

- invoices, payments, credits, refunds, and payout reconciliation;
- signed agreements and signature evidence;
- inactive camper profiles and authorized payer relationships;
- maintenance history, meter readings, and photos;
- office messages, notification delivery records, and moderation history;
- prospect and waitlist records;
- application request and error logs.

Until those periods are approved, prefer archival and access restriction over destructive deletion. Financial and signed-document history must never be silently overwritten.
