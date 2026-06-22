import { PageHero, PublicShell } from '../../components/PublicSite'

const questions = [
  ['Is Bur Oaks open for overnight camping?', 'Bur Oaks is a seasonal, members-only campground offering annual site rentals rather than nightly transient camping.'],
  ['Where is the campground located?', 'We are located at 10303 Oaks Road in Alhambra, Illinois 62001.'],
  ['How do I check site availability?', 'Use our availability page, call 618-488-7927, or email buroakscampground@gmail.com.'],
  ['Is Bur Oaks family friendly?', 'Yes. Bur Oaks is built around a welcoming, family-friendly community with events and outdoor activities throughout the season.'],
  ['How do current campers access their account?', 'Select Camper Portal from the top navigation to pay invoices, view documents, see events, and manage campground requests.'],
  ['Where can I find upcoming events?', 'Public highlights are listed on our Events page. Current campers can find full details and updates in the camper portal.'],
]

export default function FaqPage() {
  return <PublicShell><main><PageHero eyebrow="Frequently asked questions" title="A few things to know before you visit." description="Quick answers about seasonal camping, availability, and life at Bur Oaks." />
    <section id="page-content" className="public-faq public-section">{questions.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>
    <section className="public-note-card"><span>Still curious?</span><h2>We would be happy to help.</h2><p>Reach out and our campground team will point you in the right direction.</p><a href="/contact">Contact Bur Oaks</a></section>
  </main></PublicShell>
}
