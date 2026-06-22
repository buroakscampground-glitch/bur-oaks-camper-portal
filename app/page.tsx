import { ArrowRight, Leaf, ShieldCheck, TentTree } from 'lucide-react'

export default function HomePage() {
  return (
    <main className="welcome-page">
      <section className="welcome-panel">
        <nav className="welcome-topbar">
          <a href="/" className="welcome-brand">
            <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
            <span><strong>Bur Oaks</strong><small>Campground</small></span>
          </a>
          <span className="welcome-established">A site to remember · Est. 1972</span>
        </nav>

        <div className="welcome-content">
          <div className="welcome-eyebrow"><Leaf size={16} /> Welcome to Bur Oaks</div>
          <h1>Your campground, beautifully connected.</h1>
          <p>
            Pay invoices, follow campground news, manage your site, and stay
            connected to everything happening at Bur Oaks.
          </p>

          <div className="welcome-actions">
            <a href="/login" className="welcome-primary">
              Open camper portal <ArrowRight size={18} />
            </a>
            <a href="/admin" className="welcome-secondary">
              <ShieldCheck size={17} /> Admin access
            </a>
          </div>
        </div>

        <div className="welcome-callout">
          <TentTree size={22} />
          <span><small>One convenient place</small><strong>For your whole stay</strong></span>
        </div>
      </section>
    </main>
  )
}
