'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="system-state-page">
      <section>
        <AlertTriangle size={38} />
        <h1>Something went wrong</h1>
        <p>We couldn’t load this part of the portal. Your information has not been changed.</p>
        <button onClick={reset}><RefreshCw size={17} /> Try again</button>
        <a href="/">Return home</a>
      </section>
    </main>
  )
}
