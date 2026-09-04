export type AuthorizedBillingLink = {
  delegateEmail: string
  ownerLot: string
}


// Authorized family-account access. These links grant access only to billing
// and assigned campground documents. They never grant access to profiles,
// messages, maintenance records, or other camper data.
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

function realEmail(value: unknown) {
  const email = normalizeBillingEmail(value)
  return /^\S+@\S+\.\S+$/.test(email) && !email.endsWith('@no-email.buroaks.local') && !email.endsWith('@phone-login.buroakscampground.com') ? email : ''
}

export function authorizedDelegateProfilesForLot(lotNumber: unknown, campers: any[]) {
  const allowedEmails = new Set(billingDelegateEmailsForLot(lotNumber).map(normalizeBillingEmail))
  if (!allowedEmails.size) return []

  return (campers || []).filter((camper: any) => {
    if (camper?.active === false || ['admin', 'maintenance'].includes(String(camper?.role || '').toLowerCase())) {
      return false
    }

    return [camper?.email, camper?.secondary_email]
      .map(normalizeBillingEmail)
      .some((email) => allowedEmails.has(email))
  })
}

export function authorizedContactEmails(profiles: any[]) {
  return Array.from(new Set(
    (profiles || [])
      .flatMap((profile: any) => [profile?.email, profile?.secondary_email])
      .map(realEmail)
      .filter(Boolean)
  ))
}

export async function loadAuthorizedContactProfiles(client: any, owner: any) {
  const delegateEmails = billingDelegateEmailsForLot(owner?.lot_number)
  if (!delegateEmails.length) return owner ? [owner] : []

  const { data, error } = await client
    .from('campers')
    .select('id,lot_number,first_name,last_name,email,secondary_email,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role')
    .eq('active', true)

  if (error) throw error

  const delegates = authorizedDelegateProfilesForLot(owner?.lot_number, data || [])
  return [owner, ...delegates]
    .filter(Boolean)
    .filter((profile, index, all) => all.findIndex((candidate) => String(candidate.id) === String(profile.id)) === index)
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

export async function loadAuthorizedDocumentCamper(client: any, email: unknown, camperId: unknown) {
  const lots = billingOwnerLotsForEmail(email).map(normalizeBillingLot)
  if (!lots.length || !camperId) return null

  const { data, error } = await client
    .from('campers')
    .select('id,lot_number,first_name,last_name,active,role')
    .eq('id', String(camperId))
    .maybeSingle()

  if (error) throw error
  if (!data || data.active === false || String(data.role || 'camper').toLowerCase() !== 'camper') return null

  return lots.includes(normalizeBillingLot(data.lot_number)) ? data : null
}
