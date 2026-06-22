import { MapPinOff } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <main className="system-state-page">
      <section>
        <MapPinOff size={38} />
        <h1>We couldn’t find that page</h1>
        <p>The link may be outdated, or the page may have moved.</p>
        <a className="system-state-action" href="/">Return home</a>
      </section>
    </main>
  )
}
