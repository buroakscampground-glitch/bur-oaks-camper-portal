import { Bike, CalendarDays, Fish, KeyRound, Leaf, PartyPopper, TentTree, Users } from 'lucide-react'
import { PageHero, PublicShell } from '../../components/PublicSite'

const amenities = [
  [KeyRound, 'Private gated community', 'A seasonal setting designed to feel secure, familiar, and truly yours.'],
  [TentTree, 'Annual seasonal sites', 'Create your own home base and enjoy the full camping season without packing up every weekend.'],
  [Fish, 'Water and outdoor recreation', 'Slow down by the water and enjoy the kind of days that never need an agenda.'],
  [CalendarDays, 'Seasonal events', 'Holiday weekends, games, gatherings, and community traditions all season long.'],
  [Bike, 'Room to explore', 'A relaxed campground setting for golf carts, bikes, walks, and outdoor play.'],
  [Users, 'Family-friendly atmosphere', 'A welcoming community where campers of every generation can feel at home.'],
  [PartyPopper, 'Community activities', 'Plenty of reasons to come together, laugh, compete, and make memories.'],
  [Leaf, 'Peaceful natural setting', 'Shady oaks, fresh air, and a quieter pace just a short drive from home.'],
]

export default function AmenitiesPage() {
  return <PublicShell><main><PageHero eyebrow="Campground amenities" title="Everything you need to settle in." description="Comfort, recreation, and community—surrounded by the natural character that makes Bur Oaks special." />
    <section id="page-content" className="public-section"><div className="public-section-heading"><div><span className="public-kicker">At Bur Oaks</span><h2>Designed for the whole season.</h2></div></div><div className="public-amenity-grid">{amenities.map(([Icon, title, body]) => <article key={title as string}><Icon /><h3>{title as string}</h3><p>{body as string}</p></article>)}</div></section>
    <section className="public-cta"><div><span className="public-kicker">See it for yourself</span><h2>Your seasonal home base is waiting.</h2></div><div><a href="/availability">Check availability</a><a href="/contact">Ask a question</a></div></section>
  </main></PublicShell>
}
