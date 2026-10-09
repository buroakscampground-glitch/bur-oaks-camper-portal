import { activeAccountPolicies, hasAccountPolicy, normalizePolicyLot, policiesForCamper, type AccountPolicy } from './account-policies.ts'

export function normalizeBillingLot(value: unknown) {
  return normalizePolicyLot(value)
}

export function isNoBillingLot(value: unknown, policies: AccountPolicy[]) {
  return hasAccountPolicy(policies, 'billing_disabled', { lot_number: value })
}

export function noBillingReason(value: unknown, policies: AccountPolicy[]) {
  return activeAccountPolicies(policies).find((policy) => policy.policy_type === 'billing_disabled' && normalizeBillingLot(policy.lot_number) === normalizeBillingLot(value))?.reason || ''
}

export function isLotRentExemptCamper(camper: {
  id?: unknown
  lot_number?: unknown
}, policies: AccountPolicy[]) {
  return hasAccountPolicy(policies, 'lot_rent_exempt', camper)
}

export function lotRentExemptionReason(camper: {
  id?: unknown
  lot_number?: unknown
}, policies: AccountPolicy[]) {
  return policiesForCamper(policies, camper).find((policy) => policy.policy_type === 'lot_rent_exempt')?.reason || ''
}
