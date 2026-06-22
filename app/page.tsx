import { ArrowRight, CalendarDays, Fish, Leaf, ShieldCheck, Sparkles, TentTree, Users } from 'lucide-react'
import { EventCard, PublicShell } from '../components/PublicSite'

const gallery = [
  '/campground.jpg',
  '/gallery-1.jpg',
  '/gallery-2.jpg',
  '/gallery-3.jpg',
  '/gallery-4.jpg',
  '/gallery-5.jpg',
]

export default function HomePage() {
  return (
    <PublicShell>
      <main>
        <section className="public-home-hero">
          <div className="public-home-overlay" />
          <div className="public-home-copy">
            <span className="public-eyebrow"><Leaf size={15} /> Now welcoming seasonal camping inquiries</span>
            <h1>Find your place<br /><em>under the oaks.</em></h1>
            <p>Discover a private seasonal campground where your site becomes a second home—and every summer comes with more time outdoors, more community, and more memories.</p>
            <div className="public-hero-actions">
              <a href="/availability">Check seasonal availability <ArrowRight size={18} /></a>
              <a href="/contact">Plan a campground tour</a>
            </div>
            <div className="public-prospect-note"><ShieldCheck size={15} /> Private gated community <span /> <Users size={15} /> Family-friendly <span /> <TentTree size={15} /> Annual sites</div>
          </div>
          <div className="public-home-facts">
            <span><strong>1972</strong><small>Established</small></span>
            <span><strong>Seasonal</strong><small>Members-only community</small></span>
            <span><strong>Alhambra</strong><small>Southern Illinois</small></span>
          </div>
        </section>

        <section className="public-first-look public-section">
          <div className="public-section-heading">
            <div>
              <span className="public-kicker">Picture your summers here</span>
              <h2>A first look at life at Bur Oaks.</h2>
            </div>
            <a href="/gallery">Explore the full gallery <ArrowRight size={16} /></a>
          </div>
          <div className="public-first-look-grid">
            <figure className="public-first-look-main"><img src={gallery[3]} alt="A peaceful summer day at Bur Oaks" /><figcaption>Room to slow down</figcaption></figure>
            <figure><img src={gallery[1]} alt="Bur Oaks campground scenery" /><figcaption>Nature close by</figcaption></figure>
            <figure><img src={gallery[4]} alt="Evening at Bur Oaks" /><figcaption>Evenings that linger</figcaption></figure>
            <figure className="public-first-look-wide"><img src={gallery[5]} alt="Seasonal camping at Bur Oaks" /><figcaption>Your seasonal home base</figcaption></figure>
          </div>
          <div className="public-new-camper-invite">
            <div><span>New to Bur Oaks?</span><h3>Come walk the campground before choosing your site.</h3></div>
            <p>Meet the team, experience the community, and learn what seasonal camping can look like for your family.</p>
            <a href="/contact">Schedule a visit <ArrowRight size={17} /></a>
          </div>
        </section>

        <section className="public-intro public-section">
          <div>
            <span className="public-kicker">Why campers choose Bur Oaks</span>
            <h2>More than a campsite.<br />A place you belong.</h2>
          </div>
          <div>
            <p>Trade the rush of everyday life for shady oaks, still water, campfire evenings, and neighbors who become family. Bur Oaks is a gated seasonal community made for slowing down and reconnecting.</p>
            <a href="/about" className="public-text-link">Our story <ArrowRight size={16} /></a>
          </div>
        </section>

        <section className="public-feature-grid public-section">
          <article><TentTree /><span>01</span><h3>Your seasonal home base</h3><p>Settle into your own annual site and make every weekend feel like a true getaway.</p></article>
          <article><Fish /><span>02</span><h3>Nature at your doorstep</h3><p>Quiet water, mature trees, open air, and space to enjoy the outdoors your way.</p></article>
          <article><Users /><span>03</span><h3>A genuine community</h3><p>Family-friendly events and familiar faces turn neighbors into lasting friends.</p></article>
        </section>

        <section className="public-image-story public-section">
          <div className="public-image-stack">
            <img src={gallery[1]} alt="A peaceful day at Bur Oaks" />
            <img src={gallery[2]} alt="Campground scenery" />
            <span><Sparkles size={18} /> Unhurried by nature</span>
          </div>
          <div>
            <span className="public-kicker">Life at the campground</span>
            <h2>Simple moments become favorite memories.</h2>
            <p>Morning coffee outside. Kids riding by. A full calendar of gatherings. A quiet sunset when the day winds down. That is the rhythm of Bur Oaks.</p>
            <ul>
              <li><ShieldCheck /> Private gated seasonal community</li>
              <li><CalendarDays /> Events throughout the camping season</li>
              <li><Leaf /> Family-friendly outdoor setting</li>
            </ul>
            <a href="/gallery" className="public-dark-button">View the gallery <ArrowRight size={17} /></a>
          </div>
        </section>

        <section className="public-events-preview public-section">
          <div className="public-section-heading">
            <div><span className="public-kicker">On the calendar</span><h2>There is always something happening.</h2></div>
            <a href="/events">See all events <ArrowRight size={16} /></a>
          </div>
          <div className="public-event-grid">
            <EventCard flyer="/event-flyer-1.png" date="May 23" title="Memorial Day Weekend" description="Kick off summer with a full holiday weekend at the campground." />
            <EventCard flyer="/event-flyer-2.png" date="May 23" title="Mouse Races & Silent Auction" description="An evening of community fun, friendly competition, and fundraising." />
            <EventCard flyer="/event-flyer-3.png" date="Summer 2026" title="3 Bag Summer Series" description="A season-long series made for players, spectators, and good company." />
          </div>
        </section>

        <section className="public-cta">
          <div><span className="public-kicker">Your next chapter outdoors</span><h2>Come see what makes Bur Oaks feel like home.</h2></div>
          <div><a href="/availability">Check availability <ArrowRight size={18} /></a><a href="/login">Camper portal</a></div>
        </section>
      </main>
    </PublicShell>
  )
}
