import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthCamperRecord } from './auth-account-match'
import { activeAccountPolicies, loadActiveAccountPolicies, type AccountPolicy } from './account-policies.ts'

export type AuthorizedBillingLink = {
  delegateEmail: string
  ownerLot: string
}


// Authorized family-account access. These links grant access only to billing
// and assigned campground documents. They never grant access to profiles,
// messages, maintenance records, or other camper data.
export function authorizedBillingLinks(policies: AccountPolicy[]): AuthorizedBillingLink[] {
  return activeAccountPolicies(policies)
    .filter((policy) => policy.policy_type === 'billing_delegate' && policy.subject_email && policy.lot_number)
    .map((policy) => ({ delegateEmail: normalizeBillingEmail(policy.subject_email), ownerLot: String(policy.lot_number) }))
}

export function normalizeBillingEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export function normalizeBillingLot(value: unknown) {
  return String(value || '').trim().toUpperCase()
}

export function billingOwnerLotsForEmail(email: unknown, policies: AccountPolicy[]) {
  const normalizedEmails = new Set(
    (Array.isArray(email) ? email : [email]).map(normalizeBillingEmail).filter(Boolean)
  )
  return authorizedBillingLinks(policies)
    .filter((link) => normalizedEmails.has(link.delegateEmail))
    .map((link) => link.ownerLot)
}

export function billingDelegateEmailsForLot(lotNumber: unknown, policies: AccountPolicy[]) {
  const normalizedLot = normalizeBillingLot(lotNumber)
  return authorizedBillingLinks(policies)
    .filter((link) => normalizeBillingLot(link.ownerLot) === normalizedLot)
    .map((link) => link.delegateEmail)
}

function realEmail(value: unknown) {
  const email = normalizeBillingEmail(value)
  return /^\S+@\S+\.\S+$/.test(email) && !email.endsWith('@no-email.buroaks.local') && !email.endsWith('@phone-login.buroakscampground.com') ? email : ''
}

export function authorizedDelegateProfilesForLot(lotNumber: unknown, campers: AuthCamperRecord[], policies: AccountPolicy[]) {
  const allowedEmails = new Set(billingDelegateEmailsForLot(lotNumber, policies).map(normalizeBillingEmail))
  if (!allowedEmails.size) return []

  return (campers || []).filter((camper) => {
    if (camper?.active === false || ['admin', 'maintenance'].includes(String(camper?.role || '').toLowerCase())) {
      return false
    }

    return [camper?.email, camper?.secondary_email]
      .map(normalizeBillingEmail)
      .some((email) => allowedEmails.has(email))
  })
}

export function authorizedContactEmails(profiles: AuthCamperRecord[]) {
  return Array.from(new Set(
    (profiles || [])
      .flatMap((profile) => [profile?.email, profile?.secondary_email])
      .map(realEmail)
      .filter(Boolean)
  ))
}

export async function loadAuthorizedContactProfiles(client: SupabaseClient, owner: AuthCamperRecord | null | undefined, suppliedPolicies?: AccountPolicy[]) {
  const policies = suppliedPolicies || await loadActiveAccountPolicies(client)
  const delegateEmails = billingDelegateEmailsForLot(owner?.lot_number, policies)
  if (!delegateEmails.length) return owner ? [owner] : []

  const { data, error } = await client
    .from('campers')
    .select('id,lot_number,first_name,last_name,email,secondary_email,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role')
    .eq('active', true)

  if (error) throw error

  const delegates = authorizedDelegateProfilesForLot(owner?.lot_number, (data || []) as AuthCamperRecord[], policies)
  const profiles: AuthCamperRecord[] = owner ? [owner, ...delegates] : delegates
  return profiles
    .filter((profile, index, all) => all.findIndex((candidate) => String(candidate.id) === String(profile.id)) === index)
}

export async function loadAuthorizedBillingCampers(client: SupabaseClient, email: unknown): Promise<AuthCamperRecord[]> {
  const lots = billingOwnerLotsForEmail(email, await loadActiveAccountPolicies(client))
  if (!lots.length) return []

  const { data, error } = await client
    .from('campers')
    .select('id,lot_number,first_name,last_name,rent_payment_plan,active,role')
    .eq('active', true)
    .in('lot_number', lots)

  if (error) throw error

  const lotOrder = new Map(lots.map((lot, index) => [normalizeBillingLot(lot), index]))
  return ((data || []) as AuthCamperRecord[])
    .filter((camper) => String(camper.role || 'camper').toLowerCase() === 'camper')
    .sort((left, right) =>
      Number(lotOrder.get(normalizeBillingLot(left.lot_number)) ?? 999) -
      Number(lotOrder.get(normalizeBillingLot(right.lot_number)) ?? 999)
    )
}

export async function loadAuthorizedDocumentCamper(client: SupabaseClient, email: unknown, camperId: unknown): Promise<AuthCamperRecord | null> {
  const lots = billingOwnerLotsForEmail(email, await loadActiveAccountPolicies(client)).map(normalizeBillingLot)
  if (!lots.length || !camperId) return null

  const { data, error } = await client
    .from('campers')
    .select('id,lot_number,first_name,last_name,rent_payment_plan,active,role')
    .eq('id', String(camperId))
    .maybeSingle()

  if (error) throw error
  if (!data || data.active === false || String(data.role || 'camper').toLowerCase() !== 'camper') return null

  return lots.includes(normalizeBillingLot(data.lot_number)) ? data as AuthCamperRecord : null
}
