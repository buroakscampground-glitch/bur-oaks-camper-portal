import { supabase } from './supabase'

export async function saveSmsConsentPreference(
  enabled: boolean,
  options: { preserveExistingOptOuts?: boolean } = {}
) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Please sign in again before changing text alerts.')

  const response = await fetch('/api/sms-consent', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      enabled,
      preserveExistingOptOuts: Boolean(options.preserveExistingOptOuts),
    }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.camper) {
    throw new Error(result?.error || 'Unable to update text alerts.')
  }
  return result.camper
}
