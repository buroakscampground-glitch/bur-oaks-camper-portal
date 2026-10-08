import { TentTree } from 'lucide-react'

export default function LoadingPage() {
  return (
    <div className="portal-loading" role="status" aria-live="polite" aria-busy="true">
      <TentTree size={32} aria-hidden="true" />
      <p>Loading Bur Oaks…</p>
      <span className="global-screen-reader-only">Please wait while the next page opens.</span>
    </div>
  )
}
