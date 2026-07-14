import { ExternalLink, MessageCircle, Star } from 'lucide-react'
import { PageHero, PublicShell } from '../../components/PublicSite'
import { publicPageMetadata } from '../../lib/publicMetadata'

const googleReviewUrl = 'https://g.page/r/CY2ZKbfx9qWQEBM/review'

export const metadata = publicPageMetadata(
  'Review Bur Oaks Campground',
  'Share your genuine experience at Bur Oaks Campground by leaving a review on Google.',
  '/reviews',
  '/site-photos/IMG_8014.jpeg',
)

export default function ReviewsPage() {
  return (
    <PublicShell><main>
      <PageHero eyebrow="Share your experience" title="Help others get to know Bur Oaks." description="A genuine review from a camper or guest helps prospective members understand our seasonal community." image="/site-photos/IMG_8014.jpeg" />
      <section id="page-content" className="public-local-guide public-section">
        <div>
          <span className="public-kicker">Google reviews</span>
          <h2>Tell people what your time here has been like.</h2>
          <p>Whether you value the wooded setting, the lake, campground events, or the friendships you have made, your honest feedback helps people decide whether Bur Oaks may be a good fit for their family.</p>
          <p>Reviews should reflect your genuine experience. Bur Oaks does not require a positive review or offer an incentive in exchange for one.</p>
          <a className="public-inline-action" href={googleReviewUrl} target="_blank" rel="noreferrer">Leave a review on Google <ExternalLink size={17} /></a>
        </div>
        <aside className="public-review-qr-card"><img src="/bur-oaks-google-review-qr.svg" alt="QR code linking to the Bur Oaks Campground Google review form" /><span>Scan with your phone</span><h3>Open the Google review form.</h3><p>Point your phone camera at the code, then tap the link that appears.</p></aside>
      </section>
      <section className="public-local-card-grid public-section">
        <article><Star /><h3>Be specific</h3><p>Mention the part of your real experience that would be most helpful to someone learning about the campground.</p></article>
        <article><MessageCircle /><h3>Keep it genuine</h3><p>Your own words are more useful than a script. Positive, mixed, and constructive feedback are all welcome.</p></article>
        <article><ExternalLink /><h3>Post directly to Google</h3><p>The review button and QR code both lead to the official Bur Oaks Campground Google review form.</p></article>
      </section>
    </main></PublicShell>
  )
}
