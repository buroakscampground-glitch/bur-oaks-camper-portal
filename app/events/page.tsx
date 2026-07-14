import EventFlyerShowcase from '../../components/EventFlyerShowcase'
import { PageHero, PublicShell } from '../../components/PublicSite'
import { publicPageMetadata } from '../../lib/publicMetadata'

export const metadata = publicPageMetadata('Campground Events', 'See upcoming seasonal events, holiday weekends, family activities, and community traditions at Bur Oaks Campground.', '/events')

export default function EventsPage() {
  return <PublicShell><main><PageHero eyebrow="Campground calendar" title="Good times are part of the tradition." description="From holiday weekends to friendly competitions, the Bur Oaks calendar keeps the community connected." />
    <section id="page-content" className="public-section"><EventFlyerShowcase context="public" showPast /></section>
    <section className="public-note-card"><span>Current campers</span><h2>Full event details live in your portal.</h2><p>See announcements, RSVP information, and the latest campground calendar.</p><a href="/login">Open camper portal</a></section>
  </main></PublicShell>
}
