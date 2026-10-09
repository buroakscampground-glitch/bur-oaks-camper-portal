'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight, CheckCircle2, CircleHelp, Clock3, Download, Loader2, Search, Users } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { achExpectedLabel } from '../../../lib/ach-expected-date'
import { associationFeeAmount, associationFeeBucket, associationFeeSiteBucket, isAssociationFeeExemptCamper, isPhysicalAssociationFeeCamper } from '../../../lib/association-fees'

type View = 'owes' | 'processing' | 'paid' | 'missing' | 'exempt' | 'all'

function formatMoney(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AssociationFeesPage() {
  const router = useRouter()
  const [campers, setCampers] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [view, setView] = useState<View>('owes')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  async function loadAssociationFees() {
    setLoading(true)
    setLoadError('')
    try {
      const [camperResult, invoiceResult] = await Promise.all([
        supabase.from('campers').select('id,first_name,last_name,lot_number,active,role').eq('active', true).order('lot_number', { ascending: true }),
        supabase.from('invoices').select('id,camper_id,invoice_number,invoice_type,total_due,subtotal,late_fee,due_date,status,paid_at,payment_method,ach_expected_date').ilike('invoice_type', '%association%fee%').order('due_date', { ascending: false }),
      ])
      if (camperResult.error) throw camperResult.error
      if (invoiceResult.error) throw invoiceResult.error
      setCampers((camperResult.data || []).filter(isPhysicalAssociationFeeCamper))
      setInvoices((invoiceResult.data || []).filter((invoice) => associationFeeBucket(invoice) !== 'excluded'))
    } catch (error) {
      console.error('Unable to load association fees:', error)
      setCampers([])
      setInvoices([])
      setLoadError('The active campsite roster or association fee records could not be verified. No totals on this screen should be treated as current.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAssociationFees() }, [])

  const roster = useMemo(() => campers.map((camper) => {
    const feeInvoices = invoices.filter((invoice) => String(invoice.camper_id) === String(camper.id))
    const bucket = isAssociationFeeExemptCamper(camper) ? 'exempt' : associationFeeSiteBucket(feeInvoices)
    const matching = bucket === 'exempt' ? [] : feeInvoices.filter((invoice) => associationFeeBucket(invoice) === bucket)
    const displayInvoice = matching[0] || null
    return {
      camper,
      invoices: matching,
      displayInvoice,
      bucket,
      amount: matching.reduce((sum, invoice) => sum + associationFeeAmount(invoice), 0),
    }
  }), [campers, invoices])

  const counts = useMemo(() => ({
    owes: roster.filter((row) => row.bucket === 'owes'),
    processing: roster.filter((row) => row.bucket === 'processing'),
    paid: roster.filter((row) => row.bucket === 'paid'),
    missing: roster.filter((row) => row.bucket === 'missing'),
    exempt: roster.filter((row) => row.bucket === 'exempt'),
  }), [roster])

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return roster
      .filter((row) => view === 'all' || row.bucket === view)
      .filter((row) => !term || `${row.camper.first_name || ''} ${row.camper.last_name || ''} ${row.camper.lot_number || ''} ${row.displayInvoice?.invoice_number || ''} ${row.bucket}`.toLowerCase().includes(term))
      .sort((left, right) => String(left.camper.lot_number || '').localeCompare(String(right.camper.lot_number || ''), undefined, { numeric: true }))
  }, [roster, search, view])

  const total = (items: typeof roster) => items.reduce((sum, row) => sum + row.amount, 0)

  function exportRows() {
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const csvRows = [
      ['Status', 'Lot', 'Camper', 'Invoice', 'Amount', 'Due date', 'Paid date', 'Payment method'],
      ...rows.map((row) => [row.bucket, row.camper.lot_number, `${row.camper.first_name || ''} ${row.camper.last_name || ''}`.trim(), row.displayInvoice?.invoice_number, row.displayInvoice ? row.amount.toFixed(2) : '', row.displayInvoice?.due_date, row.displayInvoice?.paid_at, row.displayInvoice?.payment_method]),
    ]
    const url = URL.createObjectURL(new Blob([csvRows.map((row) => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'Association-Fee-Campground-Roster.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <main className="portal-loading"><Loader2 className="portal-loading-spinner" aria-hidden="true" /><h1>Loading association fees…</h1><p>Checking the active campsite roster and authoritative invoice records.</p></main>
  if (loadError) return <main className="portal-loading" role="alert"><AlertTriangle aria-hidden="true" /><h1>Association fees are temporarily unavailable</h1><p>{loadError}</p><button type="button" className="portal-loading-retry" onClick={loadAssociationFees}>Try again</button></main>

  return (
    <main className="association-fee-page">
      <section className="association-fee-hero">
        <button type="button" onClick={() => router.push('/admin')}>← Back to Dashboard</button>
        <div><span><Users size={18} /> Complete campsite register</span><h1>Association Fees</h1><p>Every active physical campsite is included, with fee records separated into owes, ACH processing, paid, and needs review.</p></div>
        <button type="button" className="association-fee-export" onClick={exportRows}><Download size={17} /> Export shown</button>
      </section>

      <section className="association-fee-stats" aria-label="Association fee totals">
        <button type="button" className={view === 'owes' ? 'active owes' : 'owes'} onClick={() => setView('owes')}><small>Owes</small><strong>{formatMoney(total(counts.owes))}</strong><em>{counts.owes.length} campsite{counts.owes.length === 1 ? '' : 's'}</em></button>
        <button type="button" className={view === 'processing' ? 'active processing' : 'processing'} onClick={() => setView('processing')}><small>ACH processing</small><strong>{formatMoney(total(counts.processing))}</strong><em>{counts.processing.length} underway</em></button>
        <button type="button" className={view === 'paid' ? 'active paid' : 'paid'} onClick={() => setView('paid')}><small>Paid</small><strong>{formatMoney(total(counts.paid))}</strong><em>{counts.paid.length} campsite{counts.paid.length === 1 ? '' : 's'}</em></button>
        <button type="button" className={view === 'missing' ? 'active missing' : 'missing'} onClick={() => setView('missing')}><small>No fee record</small><strong>{counts.missing.length}</strong><em>Review—never assumed owed</em></button>
        <button type="button" className={view === 'exempt' ? 'active exempt' : 'exempt'} onClick={() => setView('exempt')}><small>Exempt</small><strong>{counts.exempt.length}</strong><em>No association fee due</em></button>
        <button type="button" className={view === 'all' ? 'active all' : 'all'} onClick={() => setView('all')}><small>Campground sites</small><strong>{roster.length}</strong><em>Active physical campsites</em></button>
      </section>

      <section className="association-fee-panel">
        <div className="association-fee-toolbar">
          <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, lot, or invoice…" /></label>
          <span>{rows.length} shown</span>
        </div>
        <p className="association-fee-note">The campground total comes from the active physical campsite roster—not the number of invoices. A missing fee record is flagged for office review and is never automatically treated as money owed.</p>
        <div className="association-fee-list">
          {rows.map((row) => {
            const { camper, bucket, displayInvoice: invoice } = row
            const camperName = `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Unknown camper'
            const processingLabel = bucket === 'processing' ? achExpectedLabel(invoice) : ''
            return <article key={camper.id} className={`association-fee-row ${bucket}`}>
              <div className="association-fee-camper"><span>Lot {camper.lot_number || '—'}</span><strong>{camperName}</strong><small>{invoice ? `Invoice #${invoice.invoice_number || '—'}` : 'No Association Fee invoice found'}</small></div>
              <div><small>Association fee</small><strong>{invoice ? formatMoney(row.amount) : '—'}</strong></div>
              <div><small>{bucket === 'paid' ? 'Paid on' : bucket === 'missing' || bucket === 'exempt' ? 'Record status' : 'Due date'}</small><strong>{bucket === 'missing' ? 'Needs office review' : bucket === 'exempt' ? 'Owner-approved exemption' : formatDate(bucket === 'paid' ? invoice?.paid_at : invoice?.due_date)}</strong></div>
              <div><small>{bucket === 'processing' ? 'ACH status' : bucket === 'paid' ? 'Payment method' : 'Next step'}</small><strong>{bucket === 'processing' ? (processingLabel || 'Payment underway') : bucket === 'paid' ? (invoice?.payment_method || 'Recorded paid') : bucket === 'missing' ? 'Verify before billing' : bucket === 'exempt' ? 'Do not create fee' : 'Payment still due'}</strong></div>
              <span className={`association-fee-status ${bucket}`}>{bucket === 'owes' ? <><AlertTriangle size={15} /> Owes</> : bucket === 'processing' ? <><Clock3 size={15} /> Processing</> : bucket === 'paid' ? <><CheckCircle2 size={15} /> Paid</> : bucket === 'exempt' ? <><CheckCircle2 size={15} /> Exempt</> : <><CircleHelp size={15} /> No record</>}</span>
              <button type="button" onClick={() => router.push(invoice ? `/admin/invoices/${invoice.id}` : `/admin/campers/${camper.id}`)}>{invoice ? 'Open invoice' : 'Review camper'} <ArrowRight size={15} /></button>
            </article>
          })}
          {rows.length === 0 && <div className="association-fee-empty"><CheckCircle2 size={34} /><h2>No matching campsites</h2><p>Try another status or search.</p></div>}
        </div>
      </section>
    </main>
  )
}
