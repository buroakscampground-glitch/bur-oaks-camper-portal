import { ArrowRight, CalendarDays, KeyRound, MessageCircle, Users } from 'lucide-react'
import { PageHero, PublicShell } from '../../components/PublicSite'
import LocalGuideTrust from '../../components/LocalGuideTrust'
import { publicPageMetadata } from '../../lib/publicMetadata'

export const metadata = publicPageMetadata(
  'How Members-Only Seasonal Camping Works',
  'Understand seasonal campground membership, annual sites, approved guests, tours, community expectations, and how to inquire at Bur Oaks Campground.',
  '/members-only-seasonal-camping',
  '/site-photos/IMG_8004.jpeg',
)

const questions = [
  ['What does members-only seasonal camping mean?', 'Bur Oaks is organized around annual-site members and approved guests rather than public nightly reservations.'],
  ['Can the public visit Bur Oaks?', 'Prospective members are welcome to request an arranged tour. The campground is not open for unplanned nightly or transient stays.'],
  ['What happens after I submit a membership inquiry?', 'The office receives your contact information, camper details, timing, and tour request in its follow-up queue and can contact you about the next appropriate step.'],
  ['Why does Bur Oaks review camper and site fit?', 'RV dimensions, site access, community expectations, and current openings differ. A conversation and visit help both the camper and campground make a thoughtful decision.'],
] as const

export default function MembersOnlySeasonalCampingPage() {
  return (
    <PublicShell><main>
      <PageHero eyebrow="Membership guide" title="A campground community—not a nightly stop." description="Members-only seasonal camping is built around annual sites, familiar neighbors, shared expectations, and a place that feels more like a second home." image="/site-photos/IMG_8004.jpeg" />
      <section id="page-content" className="public-local-guide public-section">
        <div>
          <span className="public-kicker">What members-only means</span>
          <h2>Private access creates a more familiar community.</h2>
          <p>Bur Oaks Campground is not open to the general public for nightly or transient camping. Campground access is for seasonal members and approved guests, helping create a setting where campers recognize their neighbors and understand the community’s expectations.</p>
          <p>Membership begins with a direct inquiry. Prospective campers can ask about availability, share information about their camper, schedule a visit, and review current seasonal options before deciding whether to join.</p>
        </div>
        <aside><KeyRound /><span>Membership inquiries welcome</span><h3>Start with a conversation.</h3><p>Call, text, or complete the membership form. Your information goes directly to the Bur Oaks office waitlist in the admin portal.</p><a href="/availability">Request membership information <ArrowRight size={17} /></a></aside>
      </section>
      <section className="public-membership-steps public-section">
        <article><b>01</b><MessageCircle /><h3>Tell us what you need</h3><p>Share your contact details, camper size, desired timing, and questions through the membership inquiry form.</p></article>
        <article><b>02</b><Users /><h3>Plan a campground visit</h3><p>Meet the team, walk the property, and get a feel for the seasonal community before choosing a site.</p></article>
        <article><b>03</b><CalendarDays /><h3>Review current options</h3><p>Availability changes throughout the season. The office will explain suitable openings and the next membership steps.</p></article>
      </section>
      <section className="public-local-copy public-section">
        <span className="public-kicker">Designed for seasonal life</span>
        <h2>What members can expect.</h2>
        <div><p>Bur Oaks is built around long-term seasonal camping, family-friendly activities, organized events, outdoor time, and neighbors who return throughout the season. Members keep their annual site as a familiar home base.</p><p>Campground rules and approved-guest policies help protect the private setting. Prospective members should review those expectations with the office during the inquiry and tour process.</p></div>
      </section>
      <LocalGuideTrust pageTitle="How Members-Only Seasonal Camping Works" pagePath="/members-only-seasonal-camping" questions={questions} />
      <section className="public-cta"><div><span className="public-kicker">Ready to learn more?</span><h2>Your membership inquiry goes directly to our office.</h2></div><div><a href="/availability">Start an inquiry <ArrowRight size={18} /></a><a href="sms:+16188828063">Text 618-882-8063</a></div></section>
    </main></PublicShell>
  )
}
