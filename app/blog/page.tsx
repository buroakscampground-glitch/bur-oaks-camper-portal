import { ArrowRight } from 'lucide-react'
import Image from 'next/image'
import { PageHero, PublicShell } from '../../components/PublicSite'
import { publicPageMetadata } from '../../lib/publicMetadata'

export const metadata = publicPageMetadata('Campground News and Guides', 'Read seasonal camping guides, Bur Oaks community stories, event updates, and ideas for enjoying campground life.', '/blog')

export default function BlogPage() {
  return <PublicShell><main><PageHero eyebrow="Stories from Bur Oaks" title="Campground news and notes." description="Seasonal updates, community stories, and ideas for making the most of life outdoors." />
    <section id="page-content" className="public-blog-grid public-section">
      <article className="featured"><Image src="/campground.jpg" alt="Bur Oaks lake" width={1600} height={900} sizes="(max-width: 700px) 100vw, 55vw" /><div><span>Campground life</span><h2>Welcome to a new season at Bur Oaks</h2><p>Longer days, familiar faces, and a full summer ahead. Explore the event calendar, plan time around the lake, and make the most of another season under the oaks.</p><a href="/events">See what’s happening <ArrowRight /></a></div></article>
      <div className="public-guide-card-grid">
        <a href="/seasonal-camping-near-st-louis"><span>Local camping guide</span><h3>How seasonal camping near St. Louis works</h3><p>Learn how an annual site changes the camping routine and what families should compare before choosing a seasonal campground.</p><b>Read the guide <ArrowRight size={15} /></b></a>
        <a href="/seasonal-camping-near-edwardsville-il"><span>Metro East guide</span><h3>Seasonal camping near Edwardsville</h3><p>See why Alhambra can be a practical seasonal home base for families from Edwardsville and communities across the Metro East.</p><b>Explore the area guide <ArrowRight size={15} /></b></a>
        <a href="/annual-rv-sites-metro-east"><span>RV site checklist</span><h3>What to ask about an annual RV site</h3><p>Compare site setting, community expectations, events, access, maintenance, and tour options before making a long-term choice.</p><b>Review the checklist <ArrowRight size={15} /></b></a>
        <a href="/members-only-seasonal-camping"><span>Membership guide</span><h3>What members-only camping means</h3><p>Understand seasonal membership, approved guests, tours, community expectations, and how to ask about availability.</p><b>Learn how membership works <ArrowRight size={15} /></b></a>
      </div>
    </section>
  </main></PublicShell>
}
