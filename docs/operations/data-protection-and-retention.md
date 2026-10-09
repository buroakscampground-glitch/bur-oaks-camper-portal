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

## Current safe retention rule

Bur Oaks uses an archive-first rule: the application does not automatically
delete camper, billing, payment, signed-document, message, meter, photo, or
operational evidence. Inactive records may be hidden from routine work and
access may be restricted, but preserved evidence is not silently rewritten or
destroyed. This conservative rule remains in force until the owner approves a
written replacement after accounting, insurance, and legal review.

| Record class | Current application rule | Before any future deletion |
| --- | --- | --- |
| Invoices, payments, credits, refunds, payout and closeout evidence | Preserve; correct through audited compensating records | Written accounting and legal retention period, litigation hold check, verified export |
| Signed agreements, signatures, renewal and authorization evidence | Preserve the final document and proof | Written legal and insurance period, relationship check, verified export |
| Active or inactive camper and payer relationships | Archive and restrict access; do not hard-delete | Confirm no financial, document, access, or service record still depends on it |
| Maintenance, pump-out, meter readings, photos and site-care evidence | Preserve with the campsite history | Written insurance and operational period, evidence-hold check |
| Office messages and delivery records | Preserve while they explain an action, notice, consent, or failure | Written communications period and audit-dependency check |
| Prospect and waitlist records | Keep lifecycle status and removal/unsubscribe evidence | Approved marketing/privacy period and suppression-list protection |
| Technical logs and analytics | Keep privacy-minimized data under provider controls; never add secrets or record contents | Confirm the data is not required for an open incident or audit |

Any future cleanup must first ship as a reviewed, reversible preview that shows
counts by record class. It must never cascade through financial or signed
evidence, run from a browser-only role, or treat an inactive camper as proof
that related records are disposable.

## Professional review still required

Before automatic deletion is introduced, document the legally and operationally required period for:

- invoices, payments, credits, refunds, and payout reconciliation;
- signed agreements and signature evidence;
- inactive camper profiles and authorized payer relationships;
- maintenance history, meter readings, and photos;
- office messages, notification delivery records, and moderation history;
- prospect and waitlist records;
- application request and error logs.

Until those periods are approved, the safe rule above is the operative policy. Review the backup, restore-drill, and retention evidence at least quarterly; System Health turns that dated evidence into a visible review item when due.
