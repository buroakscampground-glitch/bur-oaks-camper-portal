import { ArrowRight, CakeSlice, CalendarDays, ClipboardList, Megaphone, ShieldCheck, Soup, Sparkles } from 'lucide-react'

const tools = [
  { href: '/community/birthdays', title: 'Birthdays', note: 'See upcoming birthdays and send approved greetings.', icon: CakeSlice, tone: 'rose' },
  { href: '/community/announcements', title: 'Announcements', note: 'Post complete camper updates and optional short texts.', icon: Megaphone, tone: 'gold' },
  { href: '/community/events', title: 'All Events', note: 'Create events and keep the campground calendar current.', icon: CalendarDays, tone: 'green' },
  { href: '/community/dinners', title: 'Saturday Dinners', note: 'Plan headcounts and see what everyone is bringing.', icon: Soup, tone: 'orange' },
  { href: '/community/rsvps', title: 'RSVP Organizer', note: 'See Going, Maybe, and Not Going responses by event.', icon: ClipboardList, tone: 'blue' },
]

export default function CommunityHomePage() {
  return (
    <main className="community-home">
      <section className="community-home-hero">
        <div><span><Sparkles size={17} /> EVENT COORDINATOR</span><h1>Everything for the fun side of Bur Oaks.</h1><p>Plan events, celebrate campers, post announcements, and keep attendance organized from one simple workspace.</p></div>
      </section>
      <section className="community-access-note"><ShieldCheck size={22} /><div><strong>Your workspace is intentionally limited.</strong><p>This login cannot open billing, invoices, financial reports, maintenance, camper management, leases, or owner settings.</p></div></section>
      <section className="community-tool-grid">
        {tools.map((tool) => {
          const Icon = tool.icon
          return <a className={tool.tone} href={tool.href} key={tool.href}><span><Icon size={24} /></span><div><h2>{tool.title}</h2><p>{tool.note}</p></div><ArrowRight size={19} /></a>
        })}
      </section>
    </main>
  )
}
