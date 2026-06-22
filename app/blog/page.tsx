import { ArrowRight, BookOpen } from 'lucide-react'
import { PageHero, PublicShell } from '../../components/PublicSite'

export default function BlogPage() {
  return <PublicShell><main><PageHero eyebrow="Stories from Bur Oaks" title="Campground news and notes." description="Seasonal updates, community stories, and ideas for making the most of life outdoors." />
    <section id="page-content" className="public-blog-grid public-section"><article className="featured"><img src="/campground.jpg" alt="Bur Oaks lake" /><div><span>Campground life</span><h2>Welcome to a new season at Bur Oaks</h2><p>Longer days, familiar faces, and a full summer ahead. Here is to another season of making memories.</p><a href="/events">See what’s happening <ArrowRight /></a></div></article><article className="public-empty-state"><BookOpen /><h3>More stories coming soon</h3><p>Check back for campground updates and community highlights.</p></article></section>
  </main></PublicShell>
}
