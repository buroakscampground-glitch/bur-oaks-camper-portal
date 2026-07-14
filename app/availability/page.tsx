import { ArrowRight, Mail, Phone, Trees } from 'lucide-react'
import { PageHero, PublicShell } from '../../components/PublicSite'
import WaitlistInterestForm from './WaitlistInterestForm'
import { publicPageMetadata } from '../../lib/publicMetadata'

export const metadata = publicPageMetadata('Membership Information and Availability', 'Request information about seasonal membership and annual RV site availability at Bur Oaks Campground.', '/availability')

export default function AvailabilityPage() {
  return <PublicShell><main><PageHero eyebrow="Membership information & availability" title="Find your place at Bur Oaks." description="Interested in an annual site? Start a conversation with our campground team." />
    <section id="page-content" className="public-availability public-section"><div><span className="public-kicker">Seasonal membership</span><h2>Your weekends could look different.</h2><p>Bur Oaks offers annual site rentals within a private, gated community. Availability changes throughout the season, so the best way to learn what is open is to contact us directly.</p><div className="public-process"><span><b>01</b><strong>Join the list</strong><small>Tell us what you’re looking for.</small></span><span><b>02</b><strong>Plan a visit</strong><small>See the campground and community.</small></span><span><b>03</b><strong>Find your site</strong><small>Review current seasonal options.</small></span></div></div><aside><Trees /><span>Start here</span><h3>Ask about current openings</h3><p>Our team will share the latest information and help arrange your visit.</p><a href="tel:6184887927"><Phone size={17} /> Call 618-488-7927</a><a href="mailto:buroakscampground@gmail.com?subject=Seasonal%20Site%20Availability"><Mail size={17} /> Email about availability</a></aside></section>
    <section className="public-section public-waitlist-section"><div><span className="public-kicker">Automatic office waitlist</span><h2>Get on our seasonal site list.</h2><p>Fill this out once and your information goes straight to the Bur Oaks office waitlist. When we have availability or want to schedule a visit, we will know how to reach you.</p></div><WaitlistInterestForm /></section>
    <section className="public-cta"><div><span className="public-kicker">Already a camper?</span><h2>Your campground account is one click away.</h2></div><div><a href="/login">Open camper portal <ArrowRight size={17} /></a></div></section>
  </main></PublicShell>
}
