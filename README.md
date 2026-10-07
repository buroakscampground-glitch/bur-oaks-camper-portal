# Bur Oaks Campground platform

This repository contains the production public website, camper portal, office workspace, maintenance workspace, community tools, billing workflows, documents, events, messaging, and operational automation for Bur Oaks Campground.

## Safety first

- Production camper, billing, payment, document, authentication, and storage data must never be copied into source control or synthetic test fixtures.
- Historical SQL in `migrations/` is not a clean-room bootstrap and must not be replayed wholesale.
- Database work begins in the isolated staging project with synthetic records and a reviewed recovery plan.
- The System Health **operations record** is a dated summary for office reference. It is not a database backup and cannot restore the platform.

## Local development

1. Install Node.js 24.
2. Copy `.env.example` to `.env.local` and use credentials for the intended environment.
3. Install dependencies with `npm ci`.
4. Start the application with `npm run dev`.

Never place passwords, service-role keys, production exports, or camper records in the repository.

## Required release verification

Run the complete gate before production changes:

```bash
npm run verify:release
```

The gate runs the dependency audit, all application tests, route-aware TypeScript validation, migration audit, production build, and real Chromium checks at 360, 390, and 430-pixel phone widths plus desktop. Browser fixtures use inert `.invalid` values and do not submit forms.

## Operational references

- [Release runbook](docs/operations/release-runbook.md)
- [Restore drill](docs/operations/restore-drill.md)
- [Data protection and retention](docs/operations/data-protection-and-retention.md)
- [Migration safety](migrations/README.md)
- [Schema-only baseline workflow](database/baseline/README.md)
