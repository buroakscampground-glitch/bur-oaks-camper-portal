import { billingOwnerLotsForEmail } from './authorized-billing.ts'
import { activeAccountPolicies, type AccountPolicy } from './account-policies.ts'

type MultiSitePumpOutLink = {
  accountEmail: string
  billingLot: string
  serviceLots: string[]
}

function multiSitePumpOutLinks(policies: AccountPolicy[]): MultiSitePumpOutLink[] {
  const links = new Map<string, MultiSitePumpOutLink>()
  for (const policy of activeAccountPolicies(policies).filter((row) => row.policy_type === 'pump_out_service_access')) {
    const accountEmail = String(policy.subject_email || '').trim().toLowerCase()
    const billingLot = normalizePumpOutLot(policy.lot_number)
    const serviceLot = normalizePumpOutLot(policy.related_lot_number)
    if (!accountEmail || !billingLot || !serviceLot) continue
    const key = `${accountEmail}:${billingLot}`
    const existing = links.get(key) || { accountEmail, billingLot, serviceLots: [billingLot] }
    if (!existing.serviceLots.includes(serviceLot)) existing.serviceLots.push(serviceLot)
    links.set(key, existing)
  }
  return [...links.values()]
}

function normalizeEmails(value: unknown) {
  return (Array.isArray(value) ? value : [value])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
}

function normalizePumpOutLot(value: unknown) {
  return String(value || '').trim().replace(/^#/, '').replace(/^\$/, '').toUpperCase()
}

export function pumpOutServiceLotsForAccount(email: unknown, billingLot: unknown, policies: AccountPolicy[]) {
  return pumpOutServiceAccountsForAccount(email, billingLot, policies).map((account) => account.serviceLot)
}

export function pumpOutServiceAccountsForAccount(email: unknown, billingLot: unknown, policies: AccountPolicy[]) {
  const normalizedEmails = new Set(normalizeEmails(email))
  const normalizedBillingLot = normalizePumpOutLot(billingLot)
  const link = multiSitePumpOutLinks(policies).find((candidate) => (
    normalizedEmails.has(candidate.accountEmail) &&
    normalizePumpOutLot(candidate.billingLot) === normalizedBillingLot
  ))

  const accounts: Array<{ serviceLot: string; billingLot: string }> = []
  if (normalizedBillingLot) accounts.push({ serviceLot: normalizedBillingLot, billingLot: normalizedBillingLot })
  if (link) {
    link.serviceLots.map(normalizePumpOutLot).forEach((serviceLot) => {
      if (!accounts.some((account) => account.serviceLot === serviceLot)) {
        accounts.push({ serviceLot, billingLot: normalizePumpOutLot(link.billingLot) })
      }
    })
  }
  billingOwnerLotsForEmail(email, policies).map(normalizePumpOutLot).forEach((ownerLot) => {
    if (!accounts.some((account) => account.serviceLot === ownerLot)) {
      accounts.push({ serviceLot: ownerLot, billingLot: ownerLot })
    }
  })
  return accounts
}

export function allowedPumpOutServiceLot(email: unknown, billingLot: unknown, requestedLot: unknown, policies: AccountPolicy[]) {
  const normalizedRequestedLot = normalizePumpOutLot(requestedLot)
  return pumpOutServiceLotsForAccount(email, billingLot, policies).includes(normalizedRequestedLot)
    ? normalizedRequestedLot
    : ''
}

export function pumpOutBillingLotForService(email: unknown, billingLot: unknown, requestedLot: unknown, policies: AccountPolicy[]) {
  const normalizedRequestedLot = normalizePumpOutLot(requestedLot)
  return pumpOutServiceAccountsForAccount(email, billingLot, policies)
    .find((account) => account.serviceLot === normalizedRequestedLot)?.billingLot || ''
}
