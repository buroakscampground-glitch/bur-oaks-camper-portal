export type AssuranceStatus = 'protected' | 'active' | 'review'

export type AssuranceItem = {
  key: string
  label: string
  status: AssuranceStatus
  detail: string
}

const lastRecoveryEvidence = '2026-10-08'
const nextQuarterlyReview = '2027-01-08'

function configured(value: string | undefined, pattern?: RegExp) {
  const normalized = String(value || '').trim()
  return Boolean(normalized && (!pattern || pattern.test(normalized)))
}

function reviewStatus(today: string): AssuranceStatus {
  return today > nextQuarterlyReview ? 'review' : 'protected'
}

export function getPlatformAssurance(today = new Date().toISOString().slice(0, 10), environment = process.env) {
  const analyticsReady = configured(environment.NEXT_PUBLIC_GA_MEASUREMENT_ID, /^G-[A-Z0-9]+$/)
  const releaseReady = configured(environment.VERCEL_GIT_COMMIT_SHA, /^[a-f0-9]{7,40}$/i)
  const ownerAlertsReady = environment.OWNER_TEXT_ALERTS_ENABLED !== 'false'
    && configured(environment.TWILIO_ACCOUNT_SID)
    && configured(environment.TWILIO_AUTH_TOKEN)
    && configured(environment.TWILIO_PHONE_NUMBER)
    && configured(environment.OWNER_ALERT_PHONES || environment.ADMIN_ALERT_PHONES || environment.OWNER_ALERT_PHONE || environment.ADMIN_ALERT_PHONE)

  const monitoring: AssuranceItem[] = [
    { key: 'exception-queue', label: 'Operational exception queue', status: 'active', detail: 'Billing, documents, messages, work orders, pump-outs, printing, and delivery failures are checked here.' },
    {
      key: 'owner-alerts', label: 'Outside-the-portal failure alerts', status: ownerAlertsReady ? 'active' : 'review',
      detail: ownerAlertsReady ? 'Owner text alerts are configured for critical scheduled-job and provider failures.' : 'Owner text alerts are not configured; review the alert destination before relying on unattended jobs.',
    },
    {
      key: 'performance', label: 'Privacy-safe performance monitoring', status: analyticsReady ? 'active' : 'review',
      detail: analyticsReady ? 'Core Web Vitals are collected by broad workspace only; camper identity and record URLs are excluded.' : 'Performance collection is not configured. Functional health checks still run, but real-user speed trends are unavailable.',
    },
    {
      key: 'release', label: 'Production release identity', status: releaseReady ? 'active' : 'review',
      detail: releaseReady ? `Running release ${environment.VERCEL_GIT_COMMIT_SHA!.slice(0, 12)} is available to health checks and failure records.` : 'The hosting platform did not provide a release identifier to this runtime.',
    },
  ]

  const protection: AssuranceItem[] = [
    { key: 'database-backups', label: 'Managed database backups', status: reviewStatus(today), detail: `Daily managed backups were confirmed ${lastRecoveryEvidence}; quarterly evidence review is due ${nextQuarterlyReview}.` },
    { key: 'offsite-storage', label: 'Encrypted offsite Storage copy', status: reviewStatus(today), detail: `A checksum-verified encrypted copy was retained outside Supabase and Vercel on ${lastRecoveryEvidence}; quarterly evidence review is due ${nextQuarterlyReview}.` },
    { key: 'staging-recovery', label: 'Isolated staging recovery drill', status: reviewStatus(today), detail: `The reviewed schema and synthetic journeys were rebuilt twice on ${lastRecoveryEvidence} without copying or changing production records.` },
    { key: 'retention', label: 'Archive-first retention guardrail', status: 'protected', detail: 'Automatic destructive deletion is disabled. Financial, signed-document, camper, message, meter, and operational evidence stays preserved until an owner-approved professional schedule replaces this guardrail.' },
  ]

  return { monitoring, protection, lastRecoveryEvidence, nextQuarterlyReview }
}
