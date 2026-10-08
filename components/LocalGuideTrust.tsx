import Image from 'next/image'
import { ArrowRight, MapPin } from 'lucide-react'

const siteUrl = 'https://www.buroakscampground.com'

export type LocalGuideQuestion = readonly [question: string, answer: string]

export default function LocalGuideTrust({
  pageTitle,
  pagePath,
  questions,
}: {
  pageTitle: string
  pagePath: string
  questions: readonly LocalGuideQuestion[]
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Bur Oaks Campground', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: pageTitle, item: `${siteUrl}${pagePath}` },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: questions.map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
      />

      <section className="public-local-proof public-section" aria-labelledby="local-proof-heading">
        <div className="public-local-proof-heading">
          <span className="public-kicker">Real Bur Oaks photos</span>
          <h2 id="local-proof-heading">See the campground you are asking about.</h2>
          <p>These are current photographs of the seasonal sites and lake at Bur Oaks—not stock campground images.</p>
        </div>
        <div className="public-local-proof-grid">
          <figure><Image src="/site-photos/IMG_7996.jpeg" alt="Tree-covered seasonal RV sites along a gravel campground lane at Bur Oaks" width={640} height={480} sizes="(max-width: 780px) 100vw, 34vw" /><figcaption>Wooded seasonal RV sites</figcaption></figure>
          <figure><Image src="/site-photos/IMG_8008.jpeg" alt="Bur Oaks lake, lawn, and clubhouse in Alhambra, Illinois" width={1428} height={1071} sizes="(max-width: 780px) 100vw, 34vw" /><figcaption>Lake and clubhouse setting</figcaption></figure>
          <figure><Image src="/site-photos/IMG_8012.jpeg" alt="Lake fountain surrounded by mature trees at Bur Oaks Campground" width={480} height={640} sizes="(max-width: 780px) 100vw, 34vw" /><figcaption>Campground lake and fountain</figcaption></figure>
        </div>
      </section>

      <section className="public-local-visit public-section">
        <div>
          <span className="public-kicker">Visit before you decide</span>
          <h2>Bur Oaks is in Alhambra, Illinois.</h2>
          <p>Find us at 10303 Oaks Road, Alhambra, IL 62001. Because Bur Oaks is a private members-only campground, prospective campers should request a tour instead of arriving for overnight camping.</p>
        </div>
        <div className="public-local-visit-actions">
          <a href="https://www.google.com/maps/dir/?api=1&destination=10303+Oaks+Rd,+Alhambra,+IL+62001" target="_blank" rel="noreferrer"><MapPin size={18} /> Get driving directions</a>
          <a href="/availability#membership-inquiry">Request a campground tour <ArrowRight size={18} /></a>
        </div>
      </section>

      <section className="public-local-faq public-section" aria-labelledby="local-faq-heading">
        <div>
          <span className="public-kicker">Questions before a visit</span>
          <h2 id="local-faq-heading">Straight answers about seasonal camping.</h2>
        </div>
        <div>
          {questions.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
        </div>
      </section>
    </>
  )
}
