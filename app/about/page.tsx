import { Heart, Leaf, ShieldCheck, Users } from 'lucide-react'
import { PageHero, PublicShell } from '../../components/PublicSite'

export default function AboutPage() {
  return (
    <PublicShell>
      <main>
        <PageHero eyebrow="Our story" title="Welcome to Bur Oaks." description="A seasonal campground where nature, community, and tradition come together." />
        <section id="page-content" className="public-editorial public-section">
          <div><span className="public-kicker">A site to remember</span><h2>Built for summers that matter.</h2></div>
          <div><p>Bur Oaks Resort provides annual site rentals within a private, gated community in Alhambra, Illinois. For generations, families have come here to step away from the ordinary and make room for what matters most.</p><p>Our campground is warm, welcoming, and grounded in a simple idea: the best places do more than give you somewhere to stay. They give you a sense of belonging.</p></div>
        </section>
        <section className="public-about-photo-row public-section">
          <figure><img src="/site-photos/IMG_8008.jpeg" alt="Bur Oaks lake and clubhouse" /><figcaption>Lakefront views</figcaption></figure>
          <figure><img src="/site-photos/IMG_8004.jpeg" alt="Seasonal sites under mature trees" /><figcaption>Shaded seasonal sites</figcaption></figure>
          <figure><img src="/site-photos/IMG_8010.jpeg" alt="Bur Oaks lake reflections" /><figcaption>Quiet days outdoors</figcaption></figure>
        </section>
        <section className="public-values public-section">
          <article><Leaf /><h3>Rooted in nature</h3><p>Mature trees, peaceful water, and the freedom to spend your days outside.</p></article>
          <article><Users /><h3>Made for community</h3><p>A place where familiar faces become good friends and everyone feels welcome.</p></article>
          <article><Heart /><h3>Centered on family</h3><p>Seasonal traditions and easygoing fun that bring every generation together.</p></article>
          <article><ShieldCheck /><h3>Private and cared for</h3><p>A members-only, gated setting supported by a team that takes pride in Bur Oaks.</p></article>
        </section>
        <section className="public-quote"><blockquote>“You’re not just a camper here—you’re part of the Bur Oaks family.”</blockquote><a href="/availability">Plan your visit</a></section>
      </main>
    </PublicShell>
  )
}
