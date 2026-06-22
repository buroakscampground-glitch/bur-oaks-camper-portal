import { Clock, Mail, MapPin, Phone } from 'lucide-react'
import { PageHero, PublicShell } from '../../components/PublicSite'

export default function ContactPage() {
  return <PublicShell><main><PageHero eyebrow="Contact Bur Oaks" title="Let’s talk about your next season." description="Questions about availability or campground life? We’re ready to help." />
    <section id="page-content" className="public-contact public-section"><div className="public-contact-copy"><span className="public-kicker">Get in touch</span><h2>We would love to hear from you.</h2><p>Call or email the campground team and we will help with availability, membership questions, and planning a visit.</p><div className="public-contact-cards"><a href="tel:6184887927"><Phone /><span><small>Call us</small><strong>618-488-7927</strong></span></a><a href="mailto:buroakscampground@gmail.com"><Mail /><span><small>Email us</small><strong>buroakscampground@gmail.com</strong></span></a><div><MapPin /><span><small>Visit us</small><strong>10303 Oaks Rd., Alhambra, IL</strong></span></div><div><Clock /><span><small>Response time</small><strong>We’ll get back to you soon</strong></span></div></div></div><div className="public-map-card"><div><MapPin /><h3>Bur Oaks Campground</h3><p>10303 Oaks Road<br />Alhambra, Illinois 62001</p><a href="https://maps.google.com/?q=10303+Oaks+Rd+Alhambra+IL+62001">Get directions</a></div></div></section>
  </main></PublicShell>
}
