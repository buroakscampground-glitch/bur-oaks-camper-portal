import { supabase } from './supabase'

export async function notifyInvoiceCreated(invoiceId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    return { status: 'skipped', reason: 'No signed-in admin session.' }
  }

  const response = await fetch('/api/invoice-texts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ invoiceId }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    return { status: 'failed', error: data?.error || 'Invoice text could not be sent.' }
  }

  return data.result || { status: 'skipped', reason: 'No text result returned.' }
}

export function invoiceTextSummary(result: any) {
  if (!result) return ''
  if (result.status === 'sent') return ' Text alert sent.'
  if (result.status === 'failed') return ` Text alert failed: ${result.error || 'unknown error'}.`
  if (result.status === 'skipped') return ` Text alert skipped: ${result.reason || 'not eligible'}.`
  return ''
}
