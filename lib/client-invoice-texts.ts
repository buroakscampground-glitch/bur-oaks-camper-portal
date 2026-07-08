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
  const textResult = result?.text || result
  const emailResult = result?.email
  let summary = ''

  if (textResult?.status === 'sent') summary += ' Text alert sent.'
  else if (textResult?.status === 'failed') summary += ` Text alert failed: ${textResult.error || 'unknown error'}.`
  else if (textResult?.status === 'skipped') summary += ` Text alert skipped: ${textResult.reason || 'not eligible'}.`

  if (emailResult?.status === 'sent') summary += ' Email notice sent.'
  else if (emailResult?.status === 'failed') summary += ` Email notice failed: ${emailResult.error || 'unknown error'}.`
  else if (emailResult?.status === 'skipped') summary += ` Email notice skipped: ${emailResult.reason || 'not eligible'}.`

  return summary
}

export function legacyInvoiceTextSummary(result: any) {
  if (!result) return ''
  if (result.status === 'sent') return ' Text alert sent.'
  if (result.status === 'failed') return ` Text alert failed: ${result.error || 'unknown error'}.`
  if (result.status === 'skipped') return ` Text alert skipped: ${result.reason || 'not eligible'}.`
  return ''
}
