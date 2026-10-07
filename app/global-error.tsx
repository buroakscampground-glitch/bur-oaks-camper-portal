'use client'

import { useEffect } from 'react'
import { safeErrorReference } from '../lib/error-reference'

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reference = safeErrorReference(error.digest)

  useEffect(() => {
    console.error('Bur Oaks root error', { name: error.name, reference: reference || 'unavailable' })
  }, [error.name, reference])

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#eef2eb', color: '#26382d', fontFamily: 'Arial, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '28px 20px', boxSizing: 'border-box' }}>
          <section style={{ width: 'min(520px, 100%)', boxSizing: 'border-box', padding: '36px', border: '1px solid #d5ddd3', borderRadius: '24px', background: '#fff', boxShadow: '0 24px 70px rgba(35,51,40,.14)', textAlign: 'center' }}>
            <p style={{ margin: '0 0 12px', color: '#80652e', fontSize: '12px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>Bur Oaks Campground</p>
            <h1 style={{ margin: '0 0 14px', fontFamily: 'Georgia, serif', fontSize: '34px', fontWeight: 500 }}>The portal needs a quick restart</h1>
            <p style={{ lineHeight: 1.6 }}>We couldn’t finish opening Bur Oaks. Your saved records are still protected.</p>
            <p style={{ lineHeight: 1.6, padding: '12px', borderRadius: '12px', background: '#fbf5e8' }}>If you just made a payment or sent a form, check its status before trying it again.</p>
            {reference && <p style={{ color: '#59665d', fontSize: '13px' }}>Support reference: <code>{reference}</code></p>}
            <button type="button" onClick={reset} style={{ minHeight: '46px', margin: '10px 5px 0', padding: '0 18px', border: 0, borderRadius: '999px', background: '#214b31', color: '#fff', cursor: 'pointer', fontSize: '15px', fontWeight: 800 }}>Try again</button>
            <a href="/" style={{ display: 'inline-flex', minHeight: '46px', alignItems: 'center', margin: '10px 5px 0', padding: '0 18px', borderRadius: '999px', background: '#e8eee8', color: '#214b31', fontSize: '15px', fontWeight: 800, textDecoration: 'none' }}>Return home</a>
          </section>
        </main>
      </body>
    </html>
  )
}
