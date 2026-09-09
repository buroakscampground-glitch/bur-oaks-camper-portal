import { supabase } from './supabase'

export async function removeAdminInvoiceLateFee(invoiceId: string) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    window.location.href = '/login'
    throw new Error('Please sign in again.')
  }

  const response = await fetch('/api/admin-invoice-late-fee', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ invoiceId }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'The late fee could not be removed.')
  return result as { success: true; removedFee: number; totalDue: number; message: string }
}
