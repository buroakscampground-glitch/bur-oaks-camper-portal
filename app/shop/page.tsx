import { ShoppingBag } from 'lucide-react'
import { PageHero, PublicShell } from '../../components/PublicSite'

export default function ShopPage() {
  return <PublicShell><main><PageHero eyebrow="Bur Oaks shop" title="Take a little campground spirit with you." description="Official Bur Oaks merchandise and seasonal favorites." />
    <section id="page-content" className="public-empty-state public-section"><ShoppingBag /><span className="public-kicker">Shop update</span><h2>Fresh campground gear is on the way.</h2><p>We are preparing the next collection. Follow Bur Oaks or check back soon for new merchandise.</p><a href="/contact">Contact us</a></section>
  </main></PublicShell>
}
