# Bur Oaks domain model

This document names the current systems of record and the boundaries that new code must preserve. It is intentionally conceptual until the reviewed schema-only baseline can generate exact Supabase row types. Production data must never be copied to fill that gap.

## Identity and occupancy

- **Person/account:** Supabase Auth owns credentials and sessions. A signed-in email is matched to an active `campers` record by the server authorization helpers; a browser-supplied role is never authoritative.
- **Camper/household:** `campers.id` is the durable account and billing owner used by invoices, documents, credits, messages, renewals, readings, and service requests. Primary and authorized-family access may expose the same household, but must not create a second financial owner.
- **Campsite:** `lot_number` is the campground-facing site label. It is useful for search and display, but `camper_id` remains the durable relationship key wherever it exists. A site label must not be used as authentication.
- **Contract/season:** signed renewal documents and `season_renewals` describe a camper's season decision and terms. A renewal override requires an actor, reason, and immutable audit entry.

## Money

- **Invoice:** `invoices.id` is the local charge record. `total_due`, status, payment method, payment reference, and processor state must agree before the portal calls an invoice paid. Canceled and void records remain evidence and are excluded from open balances.
- **Payment:** Stripe owns online collection and settlement truth; the local invoice and durable webhook ledger record the campground result. `manual_payments` owns checks, cash, and other office receipts. Every office payment uses an idempotent, audited server routine.
- **Allocation:** `manual_payment_allocations` and `account_credit_applications` explain which invoice received each dollar. A payment is not reconciled until received dollars equal invoice allocations plus credit saved.
- **Credit:** `account_credits` is a balance-bearing ledger record, not a negative invoice. Credits are created, applied, or voided through guarded server operations; history is preserved through applications and audit events.
- **Deposit:** Stripe payouts describe money arriving at the bank and are intentionally separate from the date a camper paid. Reconciliation never treats a payout as a new camper payment.
- **Audit event:** `admin_audit_events` is append-only evidence for financial and material camper changes. Corrections use a new compensating action; history is never silently rewritten.

## Documents and evidence

- **Document:** `documents.id` owns the assigned file, signer requirements, signature state, and authoritative `uploaded_at` timestamp. Storage objects are evidence referenced by database records; deleting or replacing a file must never erase signature history.
- **Renewal proof:** the final renewal PDF, signer proof, and renewal record must agree before a renewal is considered complete.
- **Meter evidence:** a meter reading and any uploaded photo are immutable source evidence for electric billing. At most one invoice may be created for the same authoritative reading period.

## Operations

- **Service request:** `maintenance_tickets` owns maintenance work from submission through completion. `sewer_pump_out_requests` owns pump-out service and its separate billing lifecycle. Repeated taps and network uncertainty must not create duplicate work or charges.
- **Communication:** office messages, notifications, delivery ledgers, consent records, and broadcasts are separate records. Provider success does not replace the local durable delivery result. SMS requires current consent for the exact normalized phone number.
- **Event:** the event record owns schedule and capacity. Household RSVP, dinner, and Thanksgiving answers must resolve to one authoritative campsite response for counts while preserving evidence of prior writes.
- **Scheduled operation:** `scheduled_reports` is the idempotency and outcome ledger for cron reports and Epson delivery. A `sent` printer result prevents a duplicate physical print; a failed or partial run remains visible for retry and System Health.

## Relationship rules

```text
Auth user email
  -> active camper/household
      -> campsite label
      -> invoices -> payments/allocations -> credits
      -> documents -> signatures/renewal proof
      -> meter readings -> electric invoice
      -> maintenance and pump-out requests
      -> messages, consent, and delivery history
      -> household event responses

Every protected mutation
  -> server authorization
  -> idempotency or duplicate guard
  -> authoritative record change
  -> immutable audit/delivery/event evidence
  -> correlation/request reference on failure
```

## Non-negotiable invariants

1. Production camper, billing, payment, document, and Storage records are never reset to make a deployment or test pass.
2. The browser never supplies an authoritative role, amount, camper owner, invoice owner, or permission decision.
3. Money uses local invoice and allocation records for campground accounting and Stripe records for processor collection and settlement; neither source silently substitutes for the other.
4. A write with an unknown network result is verified against its authoritative record before retry.
5. Every financial adjustment has an actor, reason, timestamp, and before/after evidence or a processor event receipt.
6. Read failures cannot appear as zero balances, empty queues, missing documents, or completed work.
7. Signed documents, meter photos, payment ledgers, and audit events are evidence and follow the documented retention policy.
8. Production and staging use separate database, Storage, Stripe, messaging, cron, and authentication credentials.

## Type migration order

Until generated schema types are available, manually maintained contracts must be narrow and normalized at the API boundary. Replace broad `any` values in this order:

1. payment, allocation, credit, invoice, payout, and authorization paths;
2. document signature, renewal, and meter-billing paths;
3. service requests and communication delivery paths;
4. read-only dashboards and presentation-only records.

After the schema-only baseline is restored into staging, generate Supabase database types there, review the diff against this model, and adopt them without connecting the build or tests to production.
