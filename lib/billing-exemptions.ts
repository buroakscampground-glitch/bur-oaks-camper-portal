const noBillingLotKeys = new Set(['48'])

function normalizedName(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '')
}

export function normalizeBillingLot(value: unknown) {
  return String(value || '').trim().replace(/^lot\s*/i, '').replace(/[^a-z0-9]/gi, '').toUpperCase()
}

export function isNoBillingLot(value: unknown) {
  return noBillingLotKeys.has(normalizeBillingLot(value))
}

export function noBillingReason(value: unknown) {
  return isNoBillingLot(value) ? 'Lot 48 is an active camper site with billing disabled.' : ''
}

export function isLotRentExemptCamper(camper: {
  lot_number?: unknown
  first_name?: unknown
  last_name?: unknown
}) {
  return normalizeBillingLot(camper?.lot_number) === '47'
    && normalizedName(camper?.first_name) === 'charlie'
    && normalizedName(camper?.last_name) === 'kimball'
}

export function lotRentExemptionReason(camper: {
  lot_number?: unknown
  first_name?: unknown
  last_name?: unknown
}) {
  return isLotRentExemptCamper(camper)
    ? 'Charlie Kimball is a staff camper and is exempt from lot rent. Other campsite charges remain enabled.'
    : ''
}
