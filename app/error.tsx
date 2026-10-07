'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { safeErrorReference } from '../lib/error-reference'

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reference = safeErrorReference(error.digest)

  useEffect(() => {
    console.error('Bur Oaks route error', { name: error.name, reference: reference || 'unavailable' })
  }, [error.name, reference])

  return (
    <main className="system-state-page">
      <section>
        <AlertTriangle size={38} />
        <h1>Something went wrong</h1>
        <p>We couldn’t finish loading this part of Bur Oaks.</p>
        <p className="system-state-guidance">If you just made a payment or sent a form, check its status before trying it again.</p>
        {reference && <p className="system-state-reference">Support reference: <code>{reference}</code></p>}
        <button onClick={reset}><RefreshCw size={17} /> Try again</button>
        <a className="system-state-action" href="/">Return home</a>
      </section>
    </main>
  )
}
