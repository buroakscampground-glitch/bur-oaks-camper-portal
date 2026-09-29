import { billingOwnerLotsForEmail } from './authorized-billing.ts'

type MultiSitePumpOutLink = {
  accountEmail: string
  billingLot: string
  serviceLots: string[]
}

const multiSitePumpOutLinks: MultiSitePumpOutLink[] = [
  {
    accountEmail: 'neter85@gmail.com',
    billingLot: '18',
    serviceLots: ['18', 'TEMP 1'],
  },
]

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function normalizePumpOutLot(value: unknown) {
  return String(value || '').trim().replace(/^#/, '').replace(/^\$/, '').toUpperCase()
}

export function pumpOutServiceLotsForAccount(email: unknown, billingLot: unknown) {
  return pumpOutServiceAccountsForAccount(email, billingLot).map((account) => account.serviceLot)
}

export function pumpOutServiceAccountsForAccount(email: unknown, billingLot: unknown) {
  const normalizedEmail = normalizeEmail(email)
  const normalizedBillingLot = normalizePumpOutLot(billingLot)
  const link = multiSitePumpOutLinks.find((candidate) => (
    candidate.accountEmail === normalizedEmail &&
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
  billingOwnerLotsForEmail(email).map(normalizePumpOutLot).forEach((ownerLot) => {
    if (!accounts.some((account) => account.serviceLot === ownerLot)) {
      accounts.push({ serviceLot: ownerLot, billingLot: ownerLot })
    }
  })
  return accounts
}

export function allowedPumpOutServiceLot(email: unknown, billingLot: unknown, requestedLot: unknown) {
  const normalizedRequestedLot = normalizePumpOutLot(requestedLot)
  return pumpOutServiceLotsForAccount(email, billingLot).includes(normalizedRequestedLot)
    ? normalizedRequestedLot
    : ''
}

export function pumpOutBillingLotForService(email: unknown, billingLot: unknown, requestedLot: unknown) {
  const normalizedRequestedLot = normalizePumpOutLot(requestedLot)
  return pumpOutServiceAccountsForAccount(email, billingLot)
    .find((account) => account.serviceLot === normalizedRequestedLot)?.billingLot || ''
}
