'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarDays, Car, CheckCircle2, CircleDollarSign, FileText, Gauge, Home, MapPin, Phone, ShieldCheck, TentTree, UserRound, Wrench } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function formatDate(value?: string) {
  if (!value) return 'Not recorded'
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function MySitePage() {
  const router = useRouter()
  const [camper, setCamper] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [maintenance, setMaintenance] = useState<any[]>([])
  const [electric, setElectric] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSite()
  }, [])

  async function loadSite() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = '/login'
      return
    }

    const { data: camperData } = await supabase
      .from('campers')
      .select('*')
      .or(`email.ilike.${user.email?.trim().toLowerCase()},secondary_email.ilike.${user.email?.trim().toLowerCase()}`)
      .single()

    if (!camperData) {
      setLoading(false)
      return
    }

    setCamper(camperData)

    const [invoiceResult, documentResult, maintenanceResult, electricResult] = await Promise.all([
      supabase.from('invoices').select('*').eq('camper_id', camperData.id),
      supabase.from('documents').select('*').eq('camper_id', camperData.id),
      supabase.from('maintenance_tickets').select('*').eq('lot_number', camperData.lot_number).order('created_at', { ascending: false }).limit(5),
      supabase.from('electric_readings').select('*').eq('camper_id', camperData.id).order('reading_date', { ascending: false }).limit(6),
    ])

    setInvoices(invoiceResult.data || [])
    setDocuments(documentResult.data || [])
    setMaintenance(maintenanceResult.data || [])
    setElectric(electricResult.data || [])
    setLoading(false)
  }

  if (loading) {
    return <main className="my-site-page"><div className="portal-loading"><Home size={34} /><p>Opening your site profile…</p></div></main>
  }

  const openInvoices = invoices.filter((invoice) => invoice.status !== 'paid')
  const openBalance = openInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)
  const documentsNeedingSignature = documents.filter((document) => document.signature_status !== 'signed' && document.signature_status !== 'not_required')
  const insuranceDocs = documents.filter((document) => document.document_type === 'Golf Cart Insurance')
  const activeMaintenance = maintenance.filter((ticket) => ticket.status !== 'Completed')
  const latestElectric = electric[0]

  return (
    <main className="my-site-page">
      <section className="my-site-hero">
        <button type="button" onClick={() => router.push('/portal')}><ArrowLeft size={17} /> Back to portal</button>
        <span><Home size={17} /> MY SITE</span>
        <h1>Lot {camper?.lot_number || '—'}</h1>
        <p>Your Bur Oaks home base: documents, payments, insurance, maintenance, and electric history in one place.</p>
      </section>

      <section className="my-site-status-grid">
        <a href="/invoices" className={openInvoices.length ? 'attention' : 'complete'}><CircleDollarSign /><small>Open balance</small><strong>${openBalance.toFixed(2)}</strong><span>{openInvoices.length} invoice{openInvoices.length === 1 ? '' : 's'}</span><em>{openInvoices.length ? 'Needs review' : 'Ready'}</em></a>
        <a href="/documents" className={documentsNeedingSignature.length ? 'attention' : 'complete'}><FileText /><small>Documents</small><strong>{documentsNeedingSignature.length ? `${documentsNeedingSignature.length} pending` : 'Complete'}</strong><span>{documents.length} total files</span><em>{documentsNeedingSignature.length ? 'Signature needed' : 'Ready'}</em></a>
        <a href="/profile" className={insuranceDocs.length ? 'complete' : 'attention'}><ShieldCheck /><small>Insurance</small><strong>{insuranceDocs.length ? 'Uploaded' : 'Needed'}</strong><span>Golf cart insurance</span><em>{insuranceDocs.length ? 'On file' : 'Upload needed'}</em></a>
        <a href="/maintenance" className={activeMaintenance.length ? 'attention' : 'complete'}><Wrench /><small>Maintenance</small><strong>{activeMaintenance.length ? `${activeMaintenance.length} active` : 'Clear'}</strong><span>Recent site requests</span><em>{activeMaintenance.length ? 'In progress' : 'Ready'}</em></a>
      </section>

      <div className="my-site-layout">
        <section className="my-site-card">
          <div className="my-site-card-heading"><UserRound /><div><small>CAMPER DETAILS</small><h2>{camper?.first_name || 'Camper'} {camper?.last_name || ''}</h2></div></div>
          <div className="my-site-detail-list">
            <p><Phone size={15} /><span><small>Phone</small><strong>{camper?.phone || 'Not added'}</strong></span></p>
            <p><CalendarDays size={15} /><span><small>Emergency contact</small><strong>{camper?.emergency_contact_name || 'Not added'} {camper?.emergency_contact_phone ? `· ${camper.emergency_contact_phone}` : ''}</strong></span></p>
            <p><Car size={15} /><span><small>Vehicle</small><strong>{[camper?.vehicle_make, camper?.vehicle_model, camper?.license_plate].filter(Boolean).join(' · ') || 'Not added'}</strong></span></p>
            <p><ShieldCheck size={15} /><span><small>Directory</small><strong>{camper?.directory_opt_in ? 'Opted in' : 'Not listed'}</strong></span></p>
          </div>
          <a href="/profile">Update profile</a>
        </section>

        <section className="my-site-card">
          <div className="my-site-card-heading"><Gauge /><div><small>ELECTRIC HISTORY</small><h2>{latestElectric ? `${latestElectric.kwh_used || 0} kWh latest` : 'No readings yet'}</h2></div></div>
          <div className="my-site-meter">
            <strong>${Number(latestElectric?.amount_due || 0).toFixed(2)}</strong>
            <span>{latestElectric ? `Last read ${formatDate(latestElectric.reading_date)}` : 'Electric readings will appear here.'}</span>
          </div>
          <div className="my-site-mini-list">
            {electric.slice(0, 3).map((reading) => (
              <p key={reading.id}><span>{formatDate(reading.reading_date)}</span><strong>{reading.kwh_used} kWh · ${Number(reading.amount_due || 0).toFixed(2)}</strong></p>
            ))}
            {electric.length === 0 && <p><span>No history yet</span><strong>Check back after the first reading.</strong></p>}
          </div>
          <a href="/electric">View electric history</a>
        </section>
      </div>

      <section className="my-site-card my-site-wide my-site-map-card">
        <div className="my-site-card-heading"><MapPin /><div><small>CAMPGROUND MAP</small><h2>Your Bur Oaks map preview</h2></div></div>
        <div className="my-site-map-layout">
          <div className="my-site-map-visual" aria-label="Bur Oaks campground map preview">
            <span className="my-site-map-lake">Lake</span>
            <span className="my-site-map-site">Lot {camper?.lot_number || '—'}</span>
            <span className="my-site-map-rec">Rec Hall</span>
            <span className="my-site-map-gate">Gate</span>
            <span className="my-site-map-trail"><TentTree size={15} /> Oaks</span>
          </div>
          <div className="my-site-map-copy">
            <small>Coming into the weekend</small>
            <h3>Know where the fun, services, and your site are.</h3>
            <p>This is the start of the interactive campground map area. Next we can turn it into clickable lots, occupied/vacant status, camper lookup, and maintenance links.</p>
            <a href="/amenities">View amenities</a>
          </div>
        </div>
      </section>

      <section className="my-site-card my-site-wide">
        <div className="my-site-card-heading"><CheckCircle2 /><div><small>RECENT SITE ACTIVITY</small><h2>What’s happening at Lot {camper?.lot_number || '—'}</h2></div></div>
        <div className="my-site-activity-grid">
          <article><small>Latest maintenance</small><strong>{maintenance[0]?.title || 'No recent requests'}</strong><span>{maintenance[0] ? maintenance[0].status : 'All quiet'}</span></article>
          <article><small>Newest document</small><strong>{documents[0]?.document_name || 'No documents yet'}</strong><span>{documents[0]?.signature_status || 'Nothing assigned'}</span></article>
          <article><small>Next step</small><strong>{documentsNeedingSignature.length ? 'Sign documents' : openInvoices.length ? 'Review balance' : 'Enjoy the campground'}</strong><span>{documentsNeedingSignature.length ? 'Documents waiting' : openInvoices.length ? 'Payment available' : 'You are caught up'}</span></article>
        </div>
      </section>
    </main>
  )
}
