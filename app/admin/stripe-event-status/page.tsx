'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, TriangleAlert } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

type StripeEventStatus = {
  event: { id: string; type: string; created: number }
  paymentIntent: null | {
    id: string
    status: string
    amount: number
    currency: string
    created: number
    description: string | null
    receiptEmail: string | null
    metadata: Record<string, string>
    paymentMethodTypes: string[]
    lastPaymentError: null | { code: string | null; declineCode: string | null; message: string | null; type: string | null }
  }
}

export default function StripeEventStatusPage() {
  const [result, setResult] = useState<StripeEventStatus | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const eventId = new URLSearchParams(window.location.search).get('eventId') || ''
      const { data } = await supabase.auth.getSession()
      const response = await fetch(`/api/admin-stripe-event-status?eventId=${encodeURIComponent(eventId)}`, {
        headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Stripe could not verify this event.')
      setResult(payload as StripeEventStatus)
    }

    void load().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'Stripe could not verify this event.')
    })
  }, [])

  if (error) return <main className="portal-loading" role="alert"><TriangleAlert /><h1>Stripe verification failed</h1><p>{error}</p></main>
  if (!result) return <main className="portal-loading"><h1>Checking Stripe…</h1><p>This is read-only and will not charge, refund, or edit an invoice.</p></main>

  return <main className="portal-loading">
    <CheckCircle2 />
    <h1>Stripe verification complete</h1>
    <pre style={{ maxWidth: 860, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', textAlign: 'left' }}>{JSON.stringify(result, null, 2)}</pre>
  </main>
}
