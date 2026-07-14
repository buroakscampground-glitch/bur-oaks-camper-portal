import { PageHero, PublicShell } from '../../components/PublicSite'
import { publicPageMetadata } from '../../lib/publicMetadata'

export const metadata = publicPageMetadata('Campground Gallery', 'View real photos of Bur Oaks Campground, including its lake, shaded seasonal sites, green space, and community setting.', '/gallery')

const photos = [
  ['/site-photos/IMG_8008.jpeg', 'Lake and clubhouse views'],
  ['/site-photos/IMG_8010.jpeg', 'Peaceful water at Bur Oaks'],
  ['/site-photos/IMG_8004.jpeg', 'Shaded seasonal sites'],
  ['/site-photos/IMG_8012.jpeg', 'Fountain on the lake'],
  ['/site-photos/IMG_8006.jpeg', 'Campground green space'],
  ['/site-photos/IMG_8007.jpeg', 'A quiet place to unwind'],
  ['/site-photos/IMG_8005.jpeg', 'Under the oaks'],
  ['/site-photos/IMG_8002.jpeg', 'Room to relax'],
  ['/site-photos/IMG_7997.jpeg', 'Campground moments'],
  ['/site-photos/IMG_7996.jpeg', 'Summer at Bur Oaks'],
  ['/site-photos/IMG_7995.jpeg', 'Seasonal camping life'],
  ['/site-photos/IMG_7994.jpeg', 'Around the campground'],
  ['/site-photos/IMG_7992.jpeg', 'Outdoor memories'],
  ['/site-photos/IMG_7991.jpeg', 'A place to belong'],
  ['/site-photos/IMG_7985.jpeg', 'Bur Oaks scenery'],
  ['/site-photos/IMG_8014.jpeg', 'Campground views'],
  ['/site-photos/IMG_8019.jpeg', 'Life around Bur Oaks'],
]

export default function GalleryPage() {
  return <PublicShell><main><PageHero eyebrow="Photo gallery" title="This is what getting away looks like." description="A glimpse of the scenery, seasons, and simple moments that make Bur Oaks memorable." />
    <section id="page-content" className="public-gallery public-section">{photos.map(([src, alt], index) => <figure key={src} className={`gallery-${(index % 6) + 1}`}><img src={src} alt={alt} /><figcaption>{alt}</figcaption></figure>)}</section>
  </main></PublicShell>
}
