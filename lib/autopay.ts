import { supabase } from './supabase'

export type AutoPayPreference = 'electric' | 'rent' | 'both'

async function authenticatedRequest(path: string, body: object) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  if (!token) {
    throw new Error('Please sign in again to continue.')
  }

  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.error || 'Unable to update AutoPay.')
  }

  return result
}

export function getAutoPayStatus() {
  return authenticatedRequest('/api/autopay', { action: 'status' })
}

export function createAutoPayEnrollment(preference: AutoPayPreference) {
  return authenticatedRequest('/api/autopay', {
    action: 'enroll',
    preference,
  })
}

export function disableAutoPay() {
  return authenticatedRequest('/api/autopay', { action: 'disable' })
}

export function attemptAutoPay(invoiceId: string) {
  return authenticatedRequest('/api/process-autopay', { invoiceId })
}
