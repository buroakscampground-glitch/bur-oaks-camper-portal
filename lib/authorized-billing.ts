export type AuthorizedBillingLink = {
  delegateEmail: string
  ownerLot: string
}

// Billing-only family access. These links never grant access to profiles,
// documents, messages, maintenance records, or other camper data.
export const authorizedBillingLinks: AuthorizedBillingLink[] = [
  { delegateEmail: 'dmonke69@yahoo.com', ownerLot: 'FF2' },
  { delegateEmail: 'stacymcnish@yahoo.com', ownerLot: 'FF12' },
  { delegateEmail: 'neter85@gmail.com', ownerLot: 'TEMP 1' },
]

export function normalizeBillingEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export function normalizeBillingLot(value: unknown) {
  return String(value || '').trim().toUpperCase()
}

export function billingOwnerLotsForEmail(email: unknown) {
  const normalizedEmail = normalizeBillingEmail(email)
  return authorizedBillingLinks
    .filter((link) => link.delegateEmail === normalizedEmail)
    .map((link) => link.ownerLot)
}

export function billingDelegateEmailsForLot(lotNumber: unknown) {
  const normalizedLot = normalizeBillingLot(lotNumber)
  return authorizedBillingLinks
    .filter((link) => normalizeBillingLot(link.ownerLot) === normalizedLot)
    .map((link) => link.delegateEmail)
}

export async function loadAuthorizedBillingCampers(client: any, email: unknown) {
  const lots = billingOwnerLotsForEmail(email)
  if (!lots.length) return []

  const { data, error } = await client
    .from('campers')
    .select('id,lot_number,first_name,last_name,active,role')
    .eq('active', true)
    .in('lot_number', lots)

  if (error) throw error

  const lotOrder = new Map(lots.map((lot, index) => [normalizeBillingLot(lot), index]))
  return (data || [])
    .filter((camper: any) => String(camper.role || 'camper').toLowerCase() === 'camper')
    .sort((left: any, right: any) =>
      Number(lotOrder.get(normalizeBillingLot(left.lot_number)) ?? 999) -
      Number(lotOrder.get(normalizeBillingLot(right.lot_number)) ?? 999)
    )
}

