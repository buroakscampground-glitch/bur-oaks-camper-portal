import { supabase } from './supabase'

async function auditedPost(path: string, body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession()
  if (!data.session?.access_token) throw new Error('Your admin session expired. Sign in again before making this change.')
  const response = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'The audited office change could not be saved.')
  return result
}

export function setCamperActiveAudited(camperId: string, active: boolean, reason: string) {
  return auditedPost('/api/admin-camper-active', { camperId, active, reason })
}

export function createAccountCreditAudited(input: { camperId: string; amount: number; reason: string; notes?: string }) {
  return auditedPost('/api/admin-account-credits', { action: 'create', ...input })
}

export function voidAccountCreditAudited(creditId: string, reason: string) {
  return auditedPost('/api/admin-account-credits', { action: 'void', creditId, reason })
}

export function updateCamperProfileAudited(camperId: string, patch: Record<string, unknown>, reason: string) {
  return auditedPost('/api/admin-camper-profile', { action: 'profile', camperId, patch, reason })
}

export function updateCamperRentTermsAudited(camperId: string, annualRent: number | null, paymentPlan: string, reason: string) {
  return auditedPost('/api/admin-camper-profile', { action: 'rent-terms', camperId, annualRent, paymentPlan, reason })
}
