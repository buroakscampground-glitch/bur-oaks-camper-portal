import { supabase } from './supabase'

type PrintResult = {
  success?: unknown
  message?: unknown
  error?: unknown
}

export async function printCompletedWorkOrder(ticketId: string) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { success: false, message: 'Work order was completed, but the printer request needs a signed-in session.' }

  try {
    const response = await fetch('/api/maintenance-completion-print', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId }),
    })
    const result = await response.json().catch(() => ({})) as PrintResult
    if (!response.ok || !result.success) {
      return { success: false, message: `Work order was completed, but the Epson print failed: ${String(result.error || 'unknown printer error')}` }
    }
    return { success: true, message: String(result.message || 'Completed work order sent to the first Epson printer.') }
  } catch (error: unknown) {
    return { success: false, message: `Work order was completed, but the Epson print failed: ${error instanceof Error ? error.message : 'network error'}` }
  }
}
