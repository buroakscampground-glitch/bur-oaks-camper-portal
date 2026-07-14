'use client'

import {
  CalendarDays,
  ChevronDown,
  CloudSun,
  LogIn,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  UserPlus,
  X,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { useEffect, useState } from 'react'

const navItems = [
  ['About', '/about'],
  ['Amenities', '/amenities'],
  ['Events', '/events'],
  ['Gallery', '/gallery'],
  ['FAQ', '/faq'],
  ['Contact', '/contact'],
]

function weatherLabel(code: number) {
  if (code === 0) return 'Clear'
  if (code <= 3) return 'Partly cloudy'
  if (code <= 48) return 'Foggy'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  if (code <= 99) return 'Storms'
  return 'Current weather'
}

function PublicWeather() {
  const [weather, setWeather] = useState<{ temperature: number; code: number } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/weather', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setWeather({ temperature: data.temperature, code: data.code }))
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  return (
    <span className="public-weather">
      <CloudSun size={15} />
      <strong>{weather ? `${weather.temperature}°F` : 'Alhambra'}</strong>
      <small>{weather ? weatherLabel(weather.code) : 'Local weather'}</small>
    </span>
  )
}

export function PublicHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="public-header">
      <div className="public-announcement">
        <PublicWeather />
        <span className="public-season-line">A seasonal, members-only campground in Alhambra, Illinois</span>
        <div>
          <a href="tel:6184887927"><Phone size={13} /> 618-488-7927</a>
          <a href="mailto:buroakscampground@gmail.com"><Mail size={13} /> Email us</a>
        </div>
      </div>
      <div className="public-camper-strip">
        <span><strong>Current camper?</strong> Pay invoices, view documents, check events, and manage your site.</span>
        <a href="/login"><LogIn size={16} /> Open Camper Portal</a>
      </div>
      <nav className="public-nav" aria-label="Main navigation">
        <a href="/" className="public-logo" aria-label="Bur Oaks Campground home">
          <Image src="/bur-oaks-logo.png" alt="" width={60} height={60} sizes="60px" priority />
          <span><strong>Bur Oaks</strong><small>Campground · Est. 1972</small></span>
        </a>

        <button
          className="public-menu-button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X /> : <Menu />}
        </button>

        <div className={`public-nav-links ${open ? 'is-open' : ''}`}>
          {navItems.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className={pathname === href ? 'active' : ''}
              onClick={() => setOpen(false)}
            >
              {label}
            </a>
          ))}
          <a href="/availability" className="public-nav-availability">Membership info</a>
          <a href="/login" className="public-nav-portal"><LogIn size={16} /> Camper portal</a>
        </div>
      </nav>
    </header>
  )
}

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-footer-main">
        <div className="public-footer-brand">
          <Image src="/bur-oaks-logo.png" alt="Bur Oaks Campground" width={76} height={76} sizes="76px" />
          <div>
            <h2>A site to remember.</h2>
            <p>A peaceful seasonal community built around nature, friendship, and summers well spent.</p>
          </div>
        </div>
        <div>
          <h3>Explore</h3>
          <a href="/about">Our story</a>
          <a href="/amenities">Amenities</a>
          <a href="/events">Events</a>
          <a href="/gallery">Gallery</a>
          <a href="/seasonal-camping-near-st-louis">Camping near St. Louis</a>
          <a href="/seasonal-camping-near-edwardsville-il">Camping near Edwardsville</a>
        </div>
        <div>
          <h3>Plan a visit</h3>
          <a href="/availability">Membership information</a>
          <a href="/annual-rv-sites-metro-east">Annual RV sites</a>
          <a href="/members-only-seasonal-camping">How seasonal membership works</a>
          <a href="/faq">Frequently asked questions</a>
          <a href="/contact">Contact us</a>
          <a href="/reviews">Leave a Google review</a>
          <a href="/login">Camper portal</a>
        </div>
        <div>
          <h3>Find us</h3>
          <p><MapPin size={15} /> 10303 Oaks Rd.<br />Alhambra, IL 62001</p>
          <a href="tel:6184887927"><Phone size={15} /> 618-488-7927</a>
          <a href="mailto:buroakscampground@gmail.com"><Mail size={15} /> Email Bur Oaks</a>
          <div className="public-socials">
            <a href="https://www.facebook.com/pages/Bur-Oaks-Campground/108171435891984" aria-label="Facebook">f</a>
          </div>
        </div>
      </div>
      <div className="public-footer-bottom">
        <span>© 2026 Bur Oaks Campground</span>
        <span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></span>
      </div>
    </footer>
  )
}

function PublicMobileActions() {
  return (
    <nav className="public-mobile-actions" aria-label="Quick contact actions">
      <a href="tel:6184887927" data-analytics-location="mobile_action_bar">
        <Phone size={18} />
        <span>Call</span>
      </a>
      <a href="sms:+16188828063" data-analytics-location="mobile_action_bar">
        <MessageCircle size={18} />
        <span>Text</span>
      </a>
      <a href="/availability" data-analytics-location="mobile_action_bar">
        <UserPlus size={18} />
        <span>Membership</span>
      </a>
    </nav>
  )
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return <div className="public-site"><PublicHeader />{children}<PublicFooter /><PublicMobileActions /></div>
}

export function PageHero({
  eyebrow,
  title,
  description,
  image = '/campground.jpg',
}: {
  eyebrow: string
  title: string
  description: string
  image?: string
}) {
  return (
    <section className="public-page-hero">
      <Image src={image} alt="" fill sizes="100vw" className="public-page-hero-image" priority />
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <a href="#page-content" aria-label="Continue to page content"><ChevronDown /></a>
    </section>
  )
}

export function EventCard({ date, title, description, flyer }: { date: string; title: string; description: string; flyer?: string }) {
  return (
    <article className={`public-event-card ${flyer ? 'with-flyer' : ''}`}>
      {flyer && <img src={flyer} alt={`${title} event flyer`} />}
      <div>
        <span><CalendarDays size={17} /> {date}</span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </article>
  )
}
