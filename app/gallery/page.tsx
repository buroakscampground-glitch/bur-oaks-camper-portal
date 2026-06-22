import { PageHero, PublicShell } from '../../components/PublicSite'

const photos = [
  ['/campground.jpg', 'The lake at Bur Oaks'],
  ['/gallery-1.jpg', 'Campground life'],
  ['/gallery-2.jpg', 'A day outdoors'],
  ['/gallery-3.jpg', 'Fishing lake'],
  ['/gallery-4.jpg', 'Summer evening'],
  ['/gallery-5.jpg', 'Bur Oaks scenery'],
]

export default function GalleryPage() {
  return <PublicShell><main><PageHero eyebrow="Photo gallery" title="This is what getting away looks like." description="A glimpse of the scenery, seasons, and simple moments that make Bur Oaks memorable." />
    <section id="page-content" className="public-gallery public-section">{photos.map(([src, alt], index) => <figure key={src} className={`gallery-${index + 1}`}><img src={src} alt={alt} /><figcaption>{alt}</figcaption></figure>)}</section>
  </main></PublicShell>
}
