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
  const normalizedEmail = normalizeEmail(email)
  const normalizedBillingLot = normalizePumpOutLot(billingLot)
  const link = multiSitePumpOutLinks.find((candidate) => (
    candidate.accountEmail === normalizedEmail &&
    normalizePumpOutLot(candidate.billingLot) === normalizedBillingLot
  ))

  return link
    ? link.serviceLots.map(normalizePumpOutLot)
    : normalizedBillingLot ? [normalizedBillingLot] : []
}

export function allowedPumpOutServiceLot(email: unknown, billingLot: unknown, requestedLot: unknown) {
  const normalizedRequestedLot = normalizePumpOutLot(requestedLot)
  return pumpOutServiceLotsForAccount(email, billingLot).includes(normalizedRequestedLot)
    ? normalizedRequestedLot
    : ''
}
