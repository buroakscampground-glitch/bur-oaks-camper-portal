import { ArrowRight, CheckCircle2, Ruler, ShieldCheck, TentTree } from 'lucide-react'
import { PageHero, PublicShell } from '../../components/PublicSite'
import { publicPageMetadata } from '../../lib/publicMetadata'

export const metadata = publicPageMetadata(
  'Annual RV Sites in the Metro East',
  'Learn how annual RV sites work, what to consider when choosing a seasonal campground, and how to ask about openings at Bur Oaks Campground.',
  '/annual-rv-sites-metro-east',
  '/site-photos/IMG_7996.jpeg',
)

export default function AnnualRvSitesMetroEastPage() {
  return (
    <PublicShell><main>
      <PageHero eyebrow="Annual RV site guide" title="Give your camper a seasonal home." description="An annual site lets you return to one familiar campground throughout the season and spend more of each visit enjoying the outdoors." image="/site-photos/IMG_7996.jpeg" />
      <section id="page-content" className="public-local-guide public-section">
        <div>
          <span className="public-kicker">Annual sites explained</span>
          <h2>Your setup stays. The weekend gets easier.</h2>
          <p>With an annual RV site, your camper remains at the campground for the season instead of traveling to a different destination each trip. That can reduce setup time, make short visits more realistic, and give your family a dependable place to relax.</p>
          <p>Bur Oaks offers seasonal membership and annual sites in a private community in Alhambra, Illinois. It is designed for members and approved guests—not nightly or transient camping.</p>
        </div>
        <aside><TentTree /><span>Current openings change</span><h3>Ask about your camper and preferred site.</h3><p>Tell us your camper size, timing, and what matters most to your family. We will explain current options and help arrange a visit.</p><a href="/availability">Join the seasonal interest list <ArrowRight size={17} /></a></aside>
      </section>
      <section className="public-local-card-grid public-section">
        <article><Ruler /><h3>Camper and site fit</h3><p>Share your camper size and setup needs so the campground team can discuss suitable seasonal options.</p></article>
        <article><ShieldCheck /><h3>Community policies</h3><p>Review membership, guest, pet, access, and campground policies before selecting an annual site.</p></article>
        <article><CheckCircle2 /><h3>The full experience</h3><p>Consider the setting, events, shared spaces, neighboring sites, and the kind of weekends you want to create.</p></article>
      </section>
      <section className="public-local-copy public-section">
        <span className="public-kicker">A good annual-site checklist</span>
        <h2>Look beyond the campsite itself.</h2>
        <div><p>A strong seasonal fit includes the drive from home, site layout, campground atmosphere, guest rules, family activities, pet policies, maintenance expectations, and how easy it is to communicate with the office.</p><p>Bur Oaks encourages prospective members to visit, meet the team, experience the community, and ask questions before making a decision. The goal is a seasonal home base you will look forward to returning to.</p></div>
      </section>
      <section className="public-cta"><div><span className="public-kicker">Find your site</span><h2>Tell us what you are looking for.</h2></div><div><a href="/availability">Request site information <ArrowRight size={18} /></a><a href="tel:6184887927">Call 618-488-7927</a></div></section>
    </main></PublicShell>
  )
}
