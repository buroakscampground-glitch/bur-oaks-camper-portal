const noBillingLotKeys = new Set(['48'])

export function normalizeBillingLot(value: unknown) {
  return String(value || '').trim().replace(/^lot\s*/i, '').replace(/[^a-z0-9]/gi, '').toUpperCase()
}

export function isNoBillingLot(value: unknown) {
  return noBillingLotKeys.has(normalizeBillingLot(value))
}

export function noBillingReason(value: unknown) {
  return isNoBillingLot(value) ? 'Lot 48 is an active camper site with billing disabled.' : ''
}
