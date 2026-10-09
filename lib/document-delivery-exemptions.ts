import { hasAccountPolicy, type AccountPolicy } from './account-policies.ts'

export function isDocumentDeliveryExcluded(camper: {
  id?: unknown
  lot_number?: unknown
}, policies: AccountPolicy[]) {
  return hasAccountPolicy(policies, 'document_delivery_exempt', camper)
}
