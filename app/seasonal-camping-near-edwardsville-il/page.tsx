import { ArrowRight, CalendarDays, MapPin, Trees, Users } from 'lucide-react'
import { PageHero, PublicShell } from '../../components/PublicSite'
import { publicPageMetadata } from '../../lib/publicMetadata'

export const metadata = publicPageMetadata(
  'Seasonal Camping Near Edwardsville, IL',
  'Explore private, members-only seasonal camping near Edwardsville, Illinois. Learn about annual RV sites, campground tours, and membership at Bur Oaks Campground.',
  '/seasonal-camping-near-edwardsville-il',
  '/site-photos/IMG_8010.jpeg',
)

export default function SeasonalCampingNearEdwardsvillePage() {
  return (
    <PublicShell><main>
      <PageHero eyebrow="Camping near Edwardsville, Illinois" title="A seasonal campground to come back to." description="Keep your camper at one annual site and spend more of the camping season enjoying the outdoors with people you know." image="/site-photos/IMG_8010.jpeg" />
      <section id="page-content" className="public-local-guide public-section">
        <div>
          <span className="public-kicker">A home base in the Metro East</span>
          <h2>Seasonal camping without the weekly setup.</h2>
          <p>Campers searching near Edwardsville, Glen Carbon, Troy, and the surrounding Metro East often want more than a place to park for one night. A seasonal site gives you one familiar outdoor home base for the camping season, so your camper and setup are ready when you are.</p>
          <p>Bur Oaks Campground is in Alhambra, Illinois. We are a private, gated, members-only campground centered on annual seasonal sites, community, and repeat visits—not nightly or transient camping.</p>
        </div>
        <aside><MapPin /><span>See Bur Oaks in person</span><h3>Request a campground tour.</h3><p>Walk the grounds, talk through membership, and ask about current seasonal-site availability.</p><a href="/availability#membership-inquiry">Request a tour <ArrowRight size={17} /></a></aside>
      </section>
      <section className="public-local-card-grid public-section">
        <article><CalendarDays /><h3>Your camper stays put</h3><p>Spend less time packing, towing, and rebuilding camp—and more time enjoying regular weekends throughout the season.</p></article>
        <article><Trees /><h3>A wooded outdoor setting</h3><p>Return to mature trees, shared outdoor spaces, a lake, and a setting designed for seasonal campground life.</p></article>
        <article><Users /><h3>A familiar community</h3><p>Members come back to the same campground and neighbors, making it easier to build traditions and friendships over time.</p></article>
      </section>
      <section className="public-local-copy public-section">
        <span className="public-kicker">Before you choose a seasonal site</span>
        <h2>Visit, ask questions, and make sure it fits.</h2>
        <div><p>During a tour, ask about site sizes, camper fit, membership policies, guests, pets, amenities, seasonal events, and the joining process. Availability changes, so contacting the Bur Oaks office is the best way to learn what may be open.</p><p>Prospective members can request a visit through our membership form. Your request goes directly to the campground waitlist in our office portal, where the Bur Oaks team can follow up with you.</p></div>
      </section>
      <section className="public-cta"><div><span className="public-kicker">Interested in Bur Oaks?</span><h2>Start with a conversation and a tour.</h2></div><div><a href="/availability#membership-inquiry">Request membership information <ArrowRight size={18} /></a><a href="tel:6184887927">Call 618-488-7927</a></div></section>
    </main></PublicShell>
  )
}
