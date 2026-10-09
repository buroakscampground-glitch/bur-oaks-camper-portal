import type { SupabaseClient } from '@supabase/supabase-js'

export type AccountPolicyType = 'billing_disabled' | 'lot_rent_exempt' | 'document_delivery_exempt' | 'billing_delegate' | 'pump_out_service_access'

export type AccountPolicy = {
  id: string
  policy_key?: string | null
  policy_type: AccountPolicyType
  camper_id?: string | null
  lot_number?: string | null
  subject_email?: string | null
  related_lot_number?: string | null
  reason: string
  effective_on: string
  expires_on?: string | null
  active: boolean
  created_at?: string | null
  created_by?: string | null
  updated_at?: string | null
  updated_by?: string | null
}

export type PolicyCamper = { id?: unknown; lot_number?: unknown }

export function normalizePolicyLot(value: unknown) {
  return String(value || '').trim().replace(/^lot\s*/i, '').replace(/[^a-z0-9]/gi, '').toUpperCase()
}

export function normalizePolicyEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export function campgroundDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
}

export function activeAccountPolicies(policies: AccountPolicy[], date = campgroundDate()) {
  return (policies || []).filter((policy) => policy.active !== false && policy.effective_on <= date && (!policy.expires_on || policy.expires_on >= date))
}

export function policiesForCamper(policies: AccountPolicy[], camper: PolicyCamper, date = campgroundDate()) {
  const camperId = String(camper?.id || '')
  const lot = normalizePolicyLot(camper?.lot_number)
  return activeAccountPolicies(policies, date).filter((policy) => (
    (policy.camper_id && String(policy.camper_id) === camperId) ||
    (!policy.camper_id && normalizePolicyLot(policy.lot_number) === lot)
  ))
}

export function hasAccountPolicy(policies: AccountPolicy[], type: AccountPolicyType, camper: PolicyCamper, date = campgroundDate()) {
  return policiesForCamper(policies, camper, date).some((policy) => policy.policy_type === type)
}

export async function loadActiveAccountPolicies(client: SupabaseClient, date = campgroundDate()) {
  const { data, error } = await client
    .from('camper_account_policies')
    .select('id,policy_key,policy_type,camper_id,lot_number,subject_email,related_lot_number,reason,effective_on,expires_on,active,created_at,created_by,updated_at,updated_by')
    .eq('active', true)
    .lte('effective_on', date)
    .or(`expires_on.is.null,expires_on.gte.${date}`)
    .order('policy_type', { ascending: true })
  if (error) throw error
  return (data || []) as AccountPolicy[]
}

export async function loadAccountPoliciesForCamper(client: SupabaseClient, camper: PolicyCamper, date = campgroundDate()) {
  return policiesForCamper(await loadActiveAccountPolicies(client, date), camper, date)
}

export const accountPolicyLabels: Record<AccountPolicyType, string> = {
  billing_disabled: 'Billing disabled',
  lot_rent_exempt: 'Lot rent exempt',
  document_delivery_exempt: 'Renewal documents exempt',
  billing_delegate: 'Authorized billing contact',
  pump_out_service_access: 'Additional pump-out site access',
}
