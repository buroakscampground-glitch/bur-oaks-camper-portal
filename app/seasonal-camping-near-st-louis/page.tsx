import { ArrowRight, CalendarDays, Car, Trees, Users } from 'lucide-react'
import { PageHero, PublicShell } from '../../components/PublicSite'
import { publicPageMetadata } from '../../lib/publicMetadata'

export const metadata = publicPageMetadata(
  'Seasonal Camping Near St. Louis',
  'A practical guide to seasonal camping near St. Louis, including annual sites, community life, travel convenience, and how to visit Bur Oaks Campground.',
  '/seasonal-camping-near-st-louis',
  '/site-photos/IMG_8008.jpeg',
)

export default function SeasonalCampingNearStLouisPage() {
  return (
    <PublicShell><main>
      <PageHero eyebrow="Seasonal camping guide" title="A weekend home base near St. Louis." description="Seasonal camping gives your family one familiar place to return to throughout the camping season—without starting over every weekend." image="/site-photos/IMG_8008.jpeg" />
      <section id="page-content" className="public-local-guide public-section">
        <div>
          <span className="public-kicker">Why campers choose seasonal</span>
          <h2>More time outside. Less time packing.</h2>
          <p>For families in the greater St. Louis and Metro East area, seasonal camping can turn an occasional trip into a regular part of life. Your camper stays at one annual site, your setup becomes familiar, and a spontaneous weekend outdoors takes far less planning.</p>
          <p>Bur Oaks Campground is located in Alhambra, Illinois. It is a private, gated, members-only community built for long-term seasonal campers rather than nightly or transient stays. Members return to the same community throughout the season and get to know the people around them.</p>
        </div>
        <aside><Trees /><span>Start with a visit</span><h3>Walk the campground before deciding.</h3><p>See the setting, ask about current openings, and learn whether seasonal membership fits your family.</p><a href="/availability">Request membership information <ArrowRight size={17} /></a></aside>
      </section>
      <section className="public-local-card-grid public-section">
        <article><Car /><h3>A practical drive from the region</h3><p>Bur Oaks serves campers throughout the Metro East and greater St. Louis area who want an outdoor home base they can revisit regularly.</p></article>
        <article><CalendarDays /><h3>A full season of weekends</h3><p>An annual site makes it easier to enjoy ordinary weekends, holiday traditions, campground events, and quiet evenings outside.</p></article>
        <article><Users /><h3>Familiar faces and community</h3><p>Seasonal camping means returning to the same neighbors, shared spaces, activities, and community expectations throughout the year.</p></article>
      </section>
      <section className="public-local-copy public-section">
        <span className="public-kicker">What to ask during a tour</span>
        <h2>Choose the campground that fits how you camp.</h2>
        <div><p>Ask about available site sizes, camper fit, membership policies, guest access, pets, seasonal events, and the process for joining. Because availability changes, a direct conversation and scheduled visit are the clearest way to understand current options.</p><p>Bur Oaks is not open to the general public for nightly camping. Prospective members are welcome to contact the campground and arrange a visit before choosing a seasonal site.</p></div>
      </section>
      <section className="public-cta"><div><span className="public-kicker">Your next season</span><h2>Come see if Bur Oaks feels like home.</h2></div><div><a href="/availability">Membership information <ArrowRight size={18} /></a><a href="/contact">Plan a tour</a></div></section>
    </main></PublicShell>
  )
}
