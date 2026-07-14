import { ArrowRight, CalendarDays, ClipboardCheck, Fish, Leaf, MapPinned, Quote, ShieldCheck, Sparkles, Star, TentTree, Users } from 'lucide-react'
import Image from 'next/image'
import EventFlyerShowcase from '../components/EventFlyerShowcase'
import { PublicShell } from '../components/PublicSite'
import { publicPageMetadata } from '../lib/publicMetadata'

export const metadata = publicPageMetadata(
  'Private Seasonal Camping Near St. Louis',
  'Join the seasonal site interest list for Bur Oaks, a private family-friendly campground with annual RV sites, lake views, and community events in Alhambra, Illinois.',
  '/',
  '/site-photos/IMG_8008.jpeg',
)

const gallery = [
  '/site-photos/IMG_8008.jpeg',
  '/site-photos/IMG_8010.jpeg',
  '/site-photos/IMG_8004.jpeg',
  '/site-photos/IMG_8012.jpeg',
  '/site-photos/IMG_8006.jpeg',
  '/site-photos/IMG_8007.jpeg',
]

export default function HomePage() {
  return (
    <PublicShell>
      <main>
        <section className="public-home-hero">
          <Image src="/site-photos/IMG_8008.jpeg" alt="" fill sizes="100vw" className="public-home-hero-image" priority />
          <div className="public-home-overlay" />
          <div className="public-home-copy">
            <span className="public-eyebrow"><Leaf size={15} /> Private seasonal camping community</span>
            <h1>Claim your summers<br /><em>under the oaks.</em></h1>
            <p>Bur Oaks is a private seasonal campground where annual sites are limited, summers feel easy, and your camper can become a true weekend home base.</p>
            <div className="public-hero-actions">
              <a href="/availability#membership-inquiry">Join the seasonal interest list <ArrowRight size={18} /></a>
              <a href="/contact">Plan a campground tour</a>
            </div>
            <div className="public-prospect-note"><ShieldCheck size={15} /> Private gated community <span /> <Users size={15} /> Family-friendly <span /> <TentTree size={15} /> Limited annual sites</div>
          </div>
          <div className="public-home-facts">
            <span><strong>1972</strong><small>Established</small></span>
            <span><strong>Private</strong><small>Seasonal community</small></span>
            <span><strong>Interest list</strong><small>Future openings</small></span>
          </div>
        </section>

        <section className="public-waitlist-band">
          <div>
            <span><ClipboardCheck size={17} /> Seasonal site interest list</span>
            <strong>Want to be considered when the right site opens?</strong>
            <p>Share your camper details once and the office will have your information ready for future availability and tours.</p>
          </div>
          <a href="/availability#membership-inquiry">Request membership information <ArrowRight size={17} /></a>
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
            <figure className="public-first-look-main"><Image src={gallery[0]} alt="Bur Oaks lake and clubhouse" fill sizes="(max-width: 700px) 100vw, 52vw" /><figcaption>The lake at the heart of Bur Oaks</figcaption></figure>
            <figure><Image src={gallery[2]} alt="Shaded campground road at Bur Oaks" fill sizes="(max-width: 700px) 100vw, 24vw" /><figcaption>Sites tucked under mature oaks</figcaption></figure>
            <figure><Image src={gallery[3]} alt="Bur Oaks fountain on the lake" fill sizes="(max-width: 700px) 100vw, 24vw" /><figcaption>Quiet water views</figcaption></figure>
            <figure className="public-first-look-wide"><Image src={gallery[1]} alt="Bur Oaks lakefront seasonal campground" fill sizes="(max-width: 700px) 100vw, 48vw" /><figcaption>Your seasonal home base</figcaption></figure>
          </div>
          <div className="public-new-camper-invite">
            <div><span>New to Bur Oaks?</span><h3>Come walk the campground before choosing your site.</h3></div>
            <p>Meet the team, experience the community, and learn whether seasonal camping at Bur Oaks is the right fit for your family.</p>
            <a href="/availability#membership-inquiry">Request a visit <ArrowRight size={17} /></a>
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
          <article><TentTree /><span>01</span><h3>Your seasonal home base</h3><p>Leave the camper here, skip the weekend setup, and make every trip feel easier.</p></article>
          <article><Fish /><span>02</span><h3>Nature at your doorstep</h3><p>Quiet water, mature trees, open air, and space to enjoy the outdoors your way.</p></article>
          <article><Users /><span>03</span><h3>A genuine community</h3><p>Saturday dinners, family-friendly events, and familiar faces turn neighbors into lasting friends.</p></article>
        </section>

        <section className="public-membership-pull public-section">
          <div>
            <span className="public-kicker">Why the interest list matters</span>
            <h2>Seasonal sites are personal. The right fit matters.</h2>
            <p>Bur Oaks is not a quick overnight stop. It is a private seasonal community, so we like to understand your camper, timing, and what kind of site would make sense before openings are discussed.</p>
          </div>
          <div className="public-membership-pull-grid">
            <article><strong>01</strong><span>Tell us your setup</span><small>Camper type, length, timing, and what you are hoping for.</small></article>
            <article><strong>02</strong><span>Tour when it fits</span><small>See the roads, lakes, community spaces, and seasonal rhythm in person.</small></article>
            <article><strong>03</strong><span>Stay on the radar</span><small>When future openings make sense, the office knows how to reach you.</small></article>
          </div>
        </section>

        <section className="public-image-story public-section">
          <div className="public-image-stack">
            <Image src={gallery[4]} alt="A peaceful day at Bur Oaks" width={1428} height={1071} sizes="(max-width: 700px) 88vw, 44vw" />
            <Image src={gallery[5]} alt="Campground scenery" width={1428} height={1071} sizes="(max-width: 700px) 52vw, 26vw" />
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

        <section className="public-real-photo-band public-section">
          <div>
            <span className="public-kicker">Real Bur Oaks views</span>
            <h2>Not stock photos. This is the actual place.</h2>
            <p>From shady seasonal sites to the lakefront, these views show the easygoing pace campers come back to all season long.</p>
          </div>
          <div className="public-real-photo-strip">
            {[
              ['/site-photos/IMG_7997.jpeg', 'Campground moments'],
              ['/site-photos/IMG_8002.jpeg', 'Room to relax'],
              ['/site-photos/IMG_8014.jpeg', 'Summer scenery'],
              ['/site-photos/IMG_8019.jpeg', 'Life around Bur Oaks'],
            ].map(([src, caption]) => (
              <figure key={src}>
                <Image src={src} alt={caption} fill sizes="(max-width: 700px) 100vw, 34vw" />
                <figcaption>{caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="public-reviews public-section" aria-labelledby="guest-reviews-title">
          <div className="public-section-heading">
            <div>
              <span className="public-kicker">Campers say it best</span>
              <h2 id="guest-reviews-title">A community people remember.</h2>
            </div>
            <a href="https://www.google.com/maps/search/?api=1&query=Bur+Oaks+Campground+Alhambra+IL" target="_blank" rel="noreferrer" data-analytics-event="google_review_click">Read Google reviews <ArrowRight size={16} /></a>
          </div>
          <div className="public-review-summary">
            <strong>4.5</strong>
            <span>{Array.from({ length: 5 }).map((_, index) => <Star key={index} size={18} fill="currentColor" />)}</span>
            <p>Google rating from 29 reviews</p>
          </div>
          <div className="public-review-grid">
            <article><Quote /><blockquote>“Overall an amazing place for family and friends to hang out.”</blockquote><span>Google review</span></article>
            <article><Quote /><blockquote>“This is the first weekend for us and we absolutely love it.”</blockquote><span>Google review</span></article>
            <article><Quote /><blockquote>“Great people, great fun.”</blockquote><span>Google review</span></article>
          </div>
        </section>

        <section className="public-events-preview public-section">
          <div className="public-section-heading">
            <div><span className="public-kicker">On the calendar</span><h2>There is always something happening.</h2></div>
            <a href="/events">See all events <ArrowRight size={16} /></a>
          </div>
          <EventFlyerShowcase context="public" limit={3} />
        </section>

        <section className="public-visit public-section">
          <figure><Image src={gallery[2]} alt="Shaded seasonal campground road at Bur Oaks" fill sizes="(max-width: 900px) 100vw, 52vw" /></figure>
          <div>
            <span className="public-kicker"><MapPinned size={16} /> Plan a visit</span>
            <h2>See the campground before choosing your site.</h2>
            <p>Bur Oaks is a private, gated seasonal community. Contact our team to arrange a tour, learn how seasonal membership works, and make sure someone is ready to welcome you.</p>
            <address>10303 Oaks Rd.<br />Alhambra, IL 62001</address>
            <div>
              <a href="https://www.google.com/maps/dir/?api=1&destination=10303+Oaks+Rd,+Alhambra,+IL+62001" target="_blank" rel="noreferrer">Get directions <ArrowRight size={17} /></a>
              <a href="/availability#membership-inquiry">Join interest list</a>
            </div>
          </div>
        </section>

        <section className="public-guides public-section">
          <div className="public-section-heading">
            <div><span className="public-kicker">Helpful camping guides</span><h2>Know what seasonal camping offers.</h2></div>
          </div>
          <div className="public-guide-card-grid">
            <a href="/seasonal-camping-near-st-louis"><span>Local guide</span><h3>Seasonal camping near St. Louis</h3><p>Compare the rhythm of an annual site with packing for a different campground every weekend.</p><b>Read the guide <ArrowRight size={15} /></b></a>
            <a href="/seasonal-camping-near-edwardsville-il"><span>Edwardsville area guide</span><h3>Seasonal camping near Edwardsville</h3><p>Explore a private, members-only seasonal camping option for families across the Metro East.</p><b>Explore the local guide <ArrowRight size={15} /></b></a>
            <a href="/annual-rv-sites-metro-east"><span>RV site guide</span><h3>Annual RV sites in the Metro East</h3><p>Learn what to consider when choosing a long-term seasonal home base for your camper.</p><b>Explore annual sites <ArrowRight size={15} /></b></a>
            <a href="/members-only-seasonal-camping"><span>Membership guide</span><h3>How members-only camping works</h3><p>Understand seasonal membership, approved guests, tours, community expectations, and next steps.</p><b>Learn how it works <ArrowRight size={15} /></b></a>
          </div>
        </section>

        <section className="public-cta">
          <div><span className="public-kicker">Your next chapter outdoors</span><h2>Come see what makes Bur Oaks feel like home.</h2></div>
          <div><a href="/availability#membership-inquiry">Join seasonal interest list <ArrowRight size={18} /></a><a href="/login">Camper portal</a></div>
        </section>
      </main>
    </PublicShell>
  )
}
