'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CreditCard,
  Minus,
  PackageCheck,
  Palette,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
} from 'lucide-react'
import { getCurrentCamper, supabase } from '../../../lib/supabase'

type PreviewProduct = {
  id: string
  name: string
  category: string
  description: string
  price: number
  image: string
  imageAlt: string
  blankImage: string
  mockupLayout: 'dual' | 'center' | 'polo' | 'hat' | 'leg' | 'left-chest' | 'split-chest'
  colors: Array<{ name: string; value: string }>
  sizes: string[]
  badge?: string
}

type LogoDirection = {
  id: string
  name: string
  label: string
  description: string
  image: string
  printImage: string
}

const logoDirections: LogoDirection[] = [
  {
    id: 'original',
    name: 'Original Oak & Campfire',
    label: 'Keep this one',
    description: 'Your full Bur Oaks scene and “A Site to Remember” artwork stays in the collection.',
    image: '/apparel-preview/original-heritage-logo.png',
    printImage: '/apparel-preview/print-original-heritage.png',
  },
  {
    id: 'heritage',
    name: 'Heritage Oak Badge',
    label: 'New option 1',
    description: 'A bold vintage badge built for tees, hoodies, and the back of a jacket.',
    image: '/apparel-preview/logo-heritage-badge.png',
    printImage: '/apparel-preview/print-heritage-badge.png',
  },
  {
    id: 'resort',
    name: 'Oaks Resort Mark',
    label: 'New option 2',
    description: 'A cleaner, classier mark that would work especially well on polos and hats.',
    image: '/apparel-preview/logo-resort-mark.png',
    printImage: '/apparel-preview/print-resort-mark.png',
  },
  {
    id: 'rec-hall',
    name: 'Rec Hall Patio',
    label: 'New option 3',
    description: 'Your covered patio, large attached pergola, and stone fireplace become the centerpiece.',
    image: '/apparel-preview/logo-rec-hall.png',
    printImage: '/apparel-preview/print-rec-hall.png',
  },
  {
    id: 'classic-oak',
    name: 'Classic Oak',
    label: 'Original shirt design',
    description: 'The clean oak-tree artwork from the classic tee, preserved as its own selectable design.',
    image: '/apparel-preview/logo-classic-oak.png',
    printImage: '/apparel-preview/print-classic-oak.png',
  },
  {
    id: 'established-1972',
    name: 'Established 1972',
    label: 'Original shirt design',
    description: 'The vintage Established 1972 tree and banner, now available across every garment.',
    image: '/apparel-preview/logo-established-1972.png',
    printImage: '/apparel-preview/print-established-1972.png',
  },
  {
    id: '30-years',
    name: '30 Years Under the Oaks',
    label: 'Anniversary design',
    description: 'The complete 30 Years anniversary badge remains available throughout the collection.',
    image: '/apparel-preview/logo-30-years.png',
    printImage: '/apparel-preview/print-30-years.png',
  },
]

const lightGarmentColors = new Set(['Cream', 'Heather', 'Gray', 'Sand', 'Khaki', 'Lake Blue'])
const darkGarmentColors = new Set(['Forest', 'Heather Green', 'Pine', 'Black', 'Charcoal', 'Navy', 'Vintage Green'])
const lightInkDesigns = new Set(['classic-oak', 'established-1972', '30-years'])

function compatibleColors(product: PreviewProduct, design: LogoDirection) {
  const preferredColors = lightInkDesigns.has(design.id) ? darkGarmentColors : lightGarmentColors
  const matches = product.colors.filter((color) => preferredColors.has(color.name))
  return matches.length ? matches : product.colors.slice(0, 1)
}

const previewProducts: PreviewProduct[] = [
  {
    id: 'classic-tree-tee',
    name: 'Classic Oak Tee',
    category: 'Front + back unisex tee',
    description: 'A simple, wearable oak-tree design with Bur Oaks details on both sides.',
    price: 24,
    badge: 'Campground favorite',
    image: '/apparel-preview/classic-tree-tee.jpg',
    imageAlt: 'Brown Bur Oaks Campground T-shirt shown from the front and back',
    blankImage: '/apparel-preview/blank-classic-tee.png',
    mockupLayout: 'dual',
    colors: [
      { name: 'Forest', value: '#244831' },
      { name: 'Cream', value: '#e9e2d0' },
      { name: 'Lake Blue', value: '#557c83' },
    ],
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  },
  {
    id: 'established-tee',
    name: 'Established 1972 Tee',
    category: 'Front + back unisex tee',
    description: 'A soft green tee with a small chest mark and a larger heritage oak on the back.',
    price: 26,
    badge: 'Front + back print',
    image: '/apparel-preview/established-tree-tee.jpg',
    imageAlt: 'Green Bur Oaks Established 1972 T-shirt shown from the front and back',
    blankImage: '/apparel-preview/blank-established-tee.png',
    mockupLayout: 'dual',
    colors: [
      { name: 'Heather Green', value: '#628364' },
      { name: 'Forest', value: '#244831' },
      { name: 'Cream', value: '#e9e2d0' },
    ],
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  },
  {
    id: 'rec-hall-hoodie',
    name: 'Rec Hall Hoodie',
    category: 'Midweight pullover hoodie',
    description: 'A warm Rec Hall layer for cool evenings, golf-cart rides, and nights around the fire.',
    price: 48,
    badge: 'Cool-night essential',
    image: '/apparel-preview/rec-hall-hoodie.png',
    imageAlt: 'Realistic forest green Bur Oaks Rec Hall hoodie mockup',
    blankImage: '/apparel-preview/blank-hoodie.png',
    mockupLayout: 'center',
    colors: [
      { name: 'Pine', value: '#183a29' },
      { name: 'Heather', value: '#8b918d' },
      { name: 'Black', value: '#222725' },
    ],
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  },
  {
    id: 'rec-hall-crewneck',
    name: 'Rec Hall Crewneck',
    category: 'Classic crewneck sweatshirt',
    description: 'The full Rec Hall artwork on a comfortable forest-heather crewneck.',
    price: 42,
    badge: 'New favorite',
    image: '/apparel-preview/rec-hall-crewneck.png',
    imageAlt: 'Realistic forest green Bur Oaks Rec Hall crewneck sweatshirt mockup',
    blankImage: '/apparel-preview/blank-crewneck.png',
    mockupLayout: 'center',
    colors: [
      { name: 'Forest', value: '#244831' },
      { name: 'Heather', value: '#8b918d' },
      { name: 'Black', value: '#222725' },
    ],
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  },
  {
    id: 'rec-hall-long-sleeve',
    name: 'Rec Hall Long Sleeve',
    category: 'Soft long-sleeve tee',
    description: 'A lighter long-sleeve option with the full evening Rec Hall artwork.',
    price: 34,
    badge: 'Three-season layer',
    image: '/apparel-preview/rec-hall-long-sleeve.png',
    imageAlt: 'Realistic forest green Bur Oaks Rec Hall long-sleeve T-shirt mockup',
    blankImage: '/apparel-preview/blank-long-sleeve.png',
    mockupLayout: 'center',
    colors: [
      { name: 'Forest', value: '#244831' },
      { name: 'Heather', value: '#8b918d' },
      { name: 'Charcoal', value: '#424846' },
    ],
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  },
  {
    id: 'rec-hall-tank',
    name: 'Rec Hall Tank',
    category: 'Soft summer tank',
    description: 'An easy summer tank with the Rec Hall, firepit, and live-music artwork.',
    price: 25,
    badge: 'Summer pick',
    image: '/apparel-preview/rec-hall-tank.png',
    imageAlt: 'Realistic forest green Bur Oaks Rec Hall tank top mockup',
    blankImage: '/apparel-preview/blank-tank.png',
    mockupLayout: 'center',
    colors: [
      { name: 'Forest', value: '#244831' },
      { name: 'Heather', value: '#8b918d' },
    ],
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
  },
  {
    id: 'campground-polo',
    name: 'Campground Polo',
    category: 'Embroidered polo',
    description: 'A clean office, golf, or event polo with a small embroidered Bur Oaks chest mark.',
    price: 38,
    badge: 'Embroidered look',
    image: '/apparel-preview/campground-polos.jpg',
    imageAlt: 'Navy, gray, tan, and charcoal Bur Oaks embroidered polo mockups',
    blankImage: '/apparel-preview/blank-polos.png',
    mockupLayout: 'polo',
    colors: [
      { name: 'Navy', value: '#263a4e' },
      { name: 'Gray', value: '#a9adae' },
      { name: 'Sand', value: '#c9b98f' },
      { name: 'Charcoal', value: '#353a39' },
    ],
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  },
  {
    id: 'anniversary-tee',
    name: '30 Years Under the Oaks Tee',
    category: 'Limited anniversary T-shirt',
    description: 'A special anniversary design featuring the oak, campsite, and “A Site to Remember.”',
    price: 27,
    badge: 'Anniversary edition',
    image: '/apparel-preview/anniversary-tee.jpg',
    imageAlt: 'Green Bur Oaks Campground 30 Years anniversary T-shirt mockup',
    blankImage: '/apparel-preview/blank-anniversary-tee.png',
    mockupLayout: 'center',
    colors: [
      { name: 'Vintage Green', value: '#3d4b38' },
      { name: 'Forest', value: '#244831' },
      { name: 'Heather', value: '#8b918d' },
    ],
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  },
  {
    id: 'campground-hat',
    name: 'Campground Hat',
    category: 'Embroidered cap',
    description: 'A classic structured campground cap with a compact embroidered logo treatment.',
    price: 29,
    badge: 'New accessory',
    image: '/apparel-preview/blank-hat.png',
    imageAlt: 'Forest green Bur Oaks campground cap',
    blankImage: '/apparel-preview/blank-hat.png',
    mockupLayout: 'hat',
    colors: [
      { name: 'Forest', value: '#183a29' },
      { name: 'Khaki', value: '#b7a477' },
      { name: 'Black', value: '#222725' },
    ],
    sizes: ['Adjustable'],
  },
  {
    id: 'campground-sweatpants',
    name: 'Campground Sweatpants',
    category: 'Fleece jogger sweatpants',
    description: 'Comfortable forest joggers with a compact upper-leg Bur Oaks mark.',
    price: 44,
    badge: 'New lounge layer',
    image: '/apparel-preview/blank-sweatpants.png',
    imageAlt: 'Forest green Bur Oaks sweatpants',
    blankImage: '/apparel-preview/blank-sweatpants.png',
    mockupLayout: 'leg',
    colors: [
      { name: 'Forest', value: '#183a29' },
      { name: 'Heather', value: '#8b918d' },
      { name: 'Black', value: '#222725' },
    ],
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  },
  {
    id: 'campground-quarter-zip',
    name: 'Campground Quarter-Zip',
    category: 'Midweight quarter-zip pullover',
    description: 'A polished layer with a small left-chest logo suited to staff, golf, and events.',
    price: 52,
    badge: 'New premium layer',
    image: '/apparel-preview/blank-quarter-zip.png',
    imageAlt: 'Forest green Bur Oaks quarter-zip pullover',
    blankImage: '/apparel-preview/blank-quarter-zip.png',
    mockupLayout: 'left-chest',
    colors: [
      { name: 'Forest', value: '#183a29' },
      { name: 'Navy', value: '#263a4e' },
      { name: 'Heather', value: '#8b918d' },
    ],
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  },
  {
    id: 'campground-full-zip',
    name: 'Campground Full-Zip',
    category: 'Full-zip fleece hoodie',
    description: 'An easy campground layer with a chest-sized logo placed clear of the zipper.',
    price: 58,
    badge: 'New cool-night layer',
    image: '/apparel-preview/blank-full-zip.png',
    imageAlt: 'Forest green Bur Oaks full-zip hoodie',
    blankImage: '/apparel-preview/blank-full-zip.png',
    mockupLayout: 'split-chest',
    colors: [
      { name: 'Forest', value: '#183a29' },
      { name: 'Heather', value: '#8b918d' },
      { name: 'Charcoal', value: '#424846' },
      { name: 'Black', value: '#222725' },
    ],
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  },
]

function normalizeLot(value: unknown) {
  return String(value || '').trim().toUpperCase()
}

function garmentColorFilter(colorName: string) {
  const filters: Record<string, string> = {
    Cream: 'brightness(1.42) saturate(.35) sepia(.12)',
    Heather: 'grayscale(.68) brightness(1.18) contrast(.88)',
    Gray: 'grayscale(.82) brightness(1.28) contrast(.86)',
    Khaki: 'sepia(.45) saturate(.72) brightness(1.25)',
    Sand: 'sepia(.5) saturate(.68) brightness(1.3)',
    Black: 'grayscale(.82) brightness(.52) contrast(1.22)',
    Charcoal: 'grayscale(.72) brightness(.69) contrast(1.12)',
    Navy: 'hue-rotate(78deg) saturate(.7) brightness(.76)',
    'Lake Blue': 'hue-rotate(95deg) saturate(.66) brightness(1.02)',
  }

  return filters[colorName] || 'none'
}

function ProductMockup({ product, design, colorName, large = false }: { product: PreviewProduct; design: LogoDirection; colorName?: string; large?: boolean }) {
  const logoCount = product.mockupLayout === 'dual' ? 2 : product.mockupLayout === 'polo' ? 4 : 1
  const shownColor = colorName || product.colors[0].name

  return (
    <span className={`apparel-live-mockup layout-${product.mockupLayout} product-${product.id} design-${design.id}${large ? ' large' : ''}`} data-color={shownColor}>
      <img className="apparel-live-garment" style={{ filter: garmentColorFilter(shownColor) }} src={product.blankImage} alt={`${product.name} in ${shownColor} with ${design.name}`} />
      {Array.from({ length: logoCount }, (_, index) => (
        <img className={`apparel-live-logo logo-${index + 1}`} src={design.printImage} alt="" aria-hidden="true" key={index} />
      ))}
    </span>
  )
}

export default function ApparelPreviewPage() {
  const [camper, setCamper] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null)
  const [selectedColor, setSelectedColor] = useState(previewProducts[0].colors[0].name)
  const [selectedSize, setSelectedSize] = useState(previewProducts[0].sizes[1])
  const [quantity, setQuantity] = useState(1)
  const [previewMessage, setPreviewMessage] = useState('')
  const builderRef = useRef<HTMLElement>(null)

  useEffect(() => {
    async function verifyPreviewAccess() {
      try {
        const isLocalDesignPreview =
          (['localhost', '127.0.0.1'].includes(window.location.hostname) ||
            window.location.hostname.endsWith('.vercel.app')) &&
          new URLSearchParams(window.location.search).get('design') === '1'

        if (isLocalDesignPreview) {
          setCamper({ first_name: 'Rachel', last_name: 'Test', lot_number: '1001' })
          return
        }

        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          window.location.replace('/login')
          return
        }

        const camperData = await getCurrentCamper()

        if (!camperData || normalizeLot(camperData.lot_number) !== '1001') {
          window.location.replace('/portal')
          return
        }

        setCamper(camperData)
      } catch (error) {
        console.error('Unable to open apparel preview:', error)
        window.location.replace('/portal')
      } finally {
        setLoading(false)
      }
    }

    verifyPreviewAccess()
  }, [])

  const product = useMemo(
    () => previewProducts.find((item) => item.id === selectedId) || null,
    [selectedId]
  )
  const selectedDesign = logoDirections.find((item) => item.id === selectedDesignId) || null
  const availableColors = product && selectedDesign ? compatibleColors(product, selectedDesign) : []
  const color = availableColors.find((item) => item.name === selectedColor) || availableColors[0]
  const estimatedTotal = (product?.price || 0) * quantity

  function chooseProduct(nextProduct: PreviewProduct) {
    if (!selectedDesign) {
      setPreviewMessage('Choose a logo first, then tap a clothing item.')
      return
    }
    const nextColors = compatibleColors(nextProduct, selectedDesign)
    setSelectedId(nextProduct.id)
    setSelectedColor(nextColors[0].name)
    setSelectedSize(nextProduct.sizes[Math.min(1, nextProduct.sizes.length - 1)])
    setQuantity(1)
    setPreviewMessage('')
    window.setTimeout(() => builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  if (loading || !camper) {
    return (
      <main className="apparel-preview-page">
        <div className="apparel-preview-loading">
          <ShoppingBag size={34} />
          <p>Opening the Lot 1001 apparel preview…</p>
        </div>
      </main>
    )
  }

  return (
    <main className="apparel-preview-page">
      <div className="apparel-preview-shell">
        <header className="apparel-preview-hero">
          <nav>
            <a href="/portal"><ArrowLeft size={17} /> Back to camper portal</a>
            <span><ShieldCheck size={15} /> Lot 1001 test only</span>
          </nav>

          <div className="apparel-preview-hero-copy">
            <div className="apparel-preview-mark">
              <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
            </div>
            <div>
              <small><Sparkles size={14} /> A PREVIEW FOR RACHEL</small>
              <h1>Bur Oaks Outfitters</h1>
              <p>Campground favorites, made to order and shipped directly to your door.</p>
            </div>
          </div>

          <div className="apparel-preview-test-banner">
            <strong>Preview mode</strong>
            <span>No order will be placed and no payment will be collected on this test screen.</span>
          </div>
        </header>

        <section className="apparel-preview-assurance" aria-label="Future Printful service details">
          <article><CreditCard size={19} /><span><strong>Secure checkout</strong><small>Camper pays Printful directly</small></span></article>
          <article><PackageCheck size={19} /><span><strong>Made to order</strong><small>No campground inventory</small></span></article>
          <article><Truck size={19} /><span><strong>Direct delivery</strong><small>Printed and shipped to the camper</small></span></article>
        </section>

        <section className="apparel-preview-intro">
          <div>
            <small><Palette size={14} /> THE LOGO LAB</small>
            <h2>Compare all seven Bur Oaks designs.</h2>
          </div>
          <p>Step 1: choose a logo. The clothing stays blank until you choose an item to open in the large preview.</p>
        </section>

        <section className="apparel-preview-logo-grid" aria-label="Bur Oaks logo directions">
          {logoDirections.map((design) => {
            const active = design.id === selectedDesignId

            return (
              <button className={`${active ? 'active ' : ''}design-${design.id}`} type="button" onClick={() => { setSelectedDesignId(design.id); setSelectedId(null); setPreviewMessage('') }} key={design.id}>
                <span className="apparel-preview-logo-image"><img src={design.image} alt={design.name} /></span>
                <span className="apparel-preview-logo-copy">
                  <small>{design.label}</small>
                  <strong>{design.name}</strong>
                  <p>{design.description}</p>
                  <em>{active ? <><Check size={14} /> Logo selected</> : <>Select this logo <ChevronRight size={14} /></>}</em>
                </span>
              </button>
            )
          })}
        </section>

        <section className="apparel-preview-intro apparel-preview-collection-intro">
          <div>
            <small>CHOOSE YOUR ITEM</small>
            <h2>Pick blank clothing to preview.</h2>
          </div>
          <p>Step 2: tap any blank item. We’ll open a large picture and place your selected logo on that item only.</p>
        </section>

        <section className="apparel-preview-products" aria-label="Preview apparel products">
          {previewProducts.map((item) => {
            const active = item.id === selectedId
            return (
              <button className={active ? 'active' : ''} type="button" onClick={() => chooseProduct(item)} key={item.id}>
                <span className="apparel-preview-card-badge">{item.badge}</span>
                <span className="apparel-preview-product-stage">
                  <img className="apparel-blank-card-garment" src={item.blankImage} alt={`Blank ${item.name}`} />
                </span>
                <span className="apparel-preview-product-copy">
                  <small>{item.category}</small>
                  <strong>{item.name}</strong>
                  <em>From ${item.price.toFixed(2)}</em>
                </span>
                <span className="apparel-preview-select-label">{active ? <><Check size={15} /> Showing below</> : selectedDesign ? <>Preview with logo <ChevronRight size={15} /></> : <>Choose a logo first</>}</span>
              </button>
            )
          })}
        </section>

        {product && selectedDesign && color && <section className="apparel-preview-builder" ref={builderRef}>
          <div className="apparel-preview-builder-visual">
            <ProductMockup product={product} design={selectedDesign} colorName={color.name} large />
            <small>Live preview · {color.name} · {selectedDesign.name}</small>
          </div>

          <div className="apparel-preview-builder-options">
            <span className="apparel-preview-builder-kicker">YOUR SELECTION</span>
            <h2>{product.name}</h2>
            <p>{product.description}</p>
            <div className="apparel-preview-design-chip">
              <img src={selectedDesign.image} alt="" />
              <span><small>Logo direction being compared</small><strong>{selectedDesign.name}</strong></span>
            </div>

            <fieldset>
              <legend>Color <strong>{color.name}</strong></legend>
              <div className="apparel-preview-swatches">
                {availableColors.map((item) => (
                  <button
                    aria-label={`Choose ${item.name}`}
                    aria-pressed={selectedColor === item.name}
                    className={selectedColor === item.name ? 'active' : ''}
                    type="button"
                    onClick={() => setSelectedColor(item.name)}
                    key={item.name}
                  >
                    <i style={{ background: item.value }} />
                    {item.name}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Size <strong>{selectedSize}</strong></legend>
              <div className="apparel-preview-sizes">
                {product.sizes.map((size) => (
                  <button className={selectedSize === size ? 'active' : ''} type="button" onClick={() => setSelectedSize(size)} key={size}>{size}</button>
                ))}
              </div>
            </fieldset>

            <div className="apparel-preview-purchase-row">
              <div className="apparel-preview-quantity" aria-label="Preview quantity">
                <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Decrease quantity"><Minus size={16} /></button>
                <strong>{quantity}</strong>
                <button type="button" onClick={() => setQuantity((value) => Math.min(10, value + 1))} aria-label="Increase quantity"><Plus size={16} /></button>
              </div>
              <div className="apparel-preview-price">
                <small>Preview total</small>
                <strong>${estimatedTotal.toFixed(2)}</strong>
              </div>
            </div>

            <button className="apparel-preview-checkout" type="button" onClick={() => setPreviewMessage('Preview complete—nothing was ordered and no payment was taken.')}>
              <ShoppingBag size={18} /> Preview secure checkout
            </button>
            <small className="apparel-preview-shipping-note">Shipping and applicable tax would be calculated by Printful at checkout.</small>
            {previewMessage && <p className="apparel-preview-message"><Check size={16} /> {previewMessage}</p>}
          </div>
        </section>}

        {!product && <section className="apparel-preview-empty-builder">
          <Palette size={25} />
          <div><strong>{selectedDesign ? 'Now choose a blank clothing item.' : 'Choose a logo, then choose clothing.'}</strong><span>Your large customized preview will appear here.</span></div>
        </section>}

        <footer className="apparel-preview-footer">
          <img src="/bur-oaks-logo.png" alt="" />
          <div><strong>Bur Oaks Outfitters</strong><small>Test presentation for Lot 1001 · Not available to other campers</small></div>
          <a href="/portal">Return to portal</a>
        </footer>
      </div>
    </main>
  )
}
