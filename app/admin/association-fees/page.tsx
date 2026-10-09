'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Download, Loader2, Search, Users } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { achExpectedLabel } from '../../../lib/ach-expected-date'
import { associationFeeAmount, associationFeeBucket, associationFeeYear, type AssociationFeeBucket } from '../../../lib/association-fees'

type View = 'owes' | 'processing' | 'paid' | 'all'

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
  const [invoices, setInvoices] = useState<any[]>([])
  const [view, setView] = useState<View>('owes')
  const [year, setYear] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  async function loadAssociationFees() {
    setLoading(true)
    setLoadError('')
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('id,camper_id,invoice_number,invoice_type,total_due,subtotal,late_fee,due_date,status,paid_at,payment_method,ach_expected_date,campers(first_name,last_name,lot_number)')
        .ilike('invoice_type', '%association%fee%')
        .order('due_date', { ascending: false })

      if (error) throw error
      setInvoices((data || []).filter((invoice) => associationFeeBucket(invoice) !== 'excluded'))
    } catch (error) {
      console.error('Unable to load association fees:', error)
      setInvoices([])
      setLoadError('Association fee records could not be verified. No totals on this screen should be treated as current.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAssociationFees() }, [])

  const years = useMemo(() => [...new Set(invoices.map(associationFeeYear).filter((value) => value !== 'No year'))].sort().reverse(), [invoices])
  const scopedInvoices = useMemo(() => year === 'all' ? invoices : invoices.filter((invoice) => associationFeeYear(invoice) === year), [invoices, year])
  const counts = useMemo(() => ({
    owes: scopedInvoices.filter((invoice) => associationFeeBucket(invoice) === 'owes'),
    processing: scopedInvoices.filter((invoice) => associationFeeBucket(invoice) === 'processing'),
    paid: scopedInvoices.filter((invoice) => associationFeeBucket(invoice) === 'paid'),
  }), [scopedInvoices])

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return scopedInvoices
      .filter((invoice) => view === 'all' || associationFeeBucket(invoice) === view)
      .filter((invoice) => {
        const camper = Array.isArray(invoice.campers) ? invoice.campers[0] : invoice.campers
        return !term || `${camper?.first_name || ''} ${camper?.last_name || ''} ${camper?.lot_number || ''} ${invoice.invoice_number || ''} ${invoice.status || ''}`.toLowerCase().includes(term)
      })
      .sort((left, right) => {
        const order: Record<AssociationFeeBucket, number> = { owes: 0, processing: 1, paid: 2, excluded: 3 }
        const bucketOrder = order[associationFeeBucket(left)] - order[associationFeeBucket(right)]
        if (bucketOrder) return bucketOrder
        const leftCamper = Array.isArray(left.campers) ? left.campers[0] : left.campers
        const rightCamper = Array.isArray(right.campers) ? right.campers[0] : right.campers
        return String(leftCamper?.lot_number || '').localeCompare(String(rightCamper?.lot_number || ''), undefined, { numeric: true })
      })
  }, [scopedInvoices, search, view])

  const total = (items: any[]) => items.reduce((sum, invoice) => sum + associationFeeAmount(invoice), 0)

  function exportRows() {
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const csvRows = [
      ['Status', 'Lot', 'Camper', 'Invoice', 'Amount', 'Due date', 'Paid date', 'Payment method'],
      ...rows.map((invoice) => {
        const camper = Array.isArray(invoice.campers) ? invoice.campers[0] : invoice.campers
        return [associationFeeBucket(invoice), camper?.lot_number, `${camper?.first_name || ''} ${camper?.last_name || ''}`.trim(), invoice.invoice_number, associationFeeAmount(invoice).toFixed(2), invoice.due_date, invoice.paid_at, invoice.payment_method]
      }),
    ]
    const url = URL.createObjectURL(new Blob([csvRows.map((row) => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `Association-Fees-${year === 'all' ? 'All-Years' : year}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <main className="portal-loading"><Loader2 className="portal-loading-spinner" aria-hidden="true" /><h1>Loading association fees…</h1><p>Checking the authoritative invoice records.</p></main>
  if (loadError) return <main className="portal-loading" role="alert"><AlertTriangle aria-hidden="true" /><h1>Association fees are temporarily unavailable</h1><p>{loadError}</p><button type="button" className="portal-loading-retry" onClick={loadAssociationFees}>Try again</button></main>

  return (
    <main className="association-fee-page">
      <section className="association-fee-hero">
        <button type="button" onClick={() => router.push('/admin')}>← Back to Dashboard</button>
        <div><span><Users size={18} /> Separate fee register</span><h1>Association Fees</h1><p>One clean list showing who owes, whose ACH is processing, and who paid—without ordinary invoices mixed in.</p></div>
        <button type="button" className="association-fee-export" onClick={exportRows}><Download size={17} /> Export shown</button>
      </section>

      <section className="association-fee-stats" aria-label="Association fee totals">
        <button type="button" className={view === 'owes' ? 'active owes' : 'owes'} onClick={() => setView('owes')}><small>Owes</small><strong>{formatMoney(total(counts.owes))}</strong><em>{counts.owes.length} invoice{counts.owes.length === 1 ? '' : 's'}</em></button>
        <button type="button" className={view === 'processing' ? 'active processing' : 'processing'} onClick={() => setView('processing')}><small>ACH processing</small><strong>{formatMoney(total(counts.processing))}</strong><em>{counts.processing.length} underway</em></button>
        <button type="button" className={view === 'paid' ? 'active paid' : 'paid'} onClick={() => setView('paid')}><small>Paid</small><strong>{formatMoney(total(counts.paid))}</strong><em>{counts.paid.length} invoice{counts.paid.length === 1 ? '' : 's'}</em></button>
        <button type="button" className={view === 'all' ? 'active all' : 'all'} onClick={() => setView('all')}><small>All fee records</small><strong>{scopedInvoices.length}</strong><em>Open, processing & paid</em></button>
      </section>

      <section className="association-fee-panel">
        <div className="association-fee-toolbar">
          <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, lot, or invoice…" /></label>
          <select aria-label="Fee year" value={year} onChange={(event) => setYear(event.target.value)}><option value="all">All years</option>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <span>{rows.length} shown</span>
        </div>
        <p className="association-fee-note">Only issued Association Fee invoices appear here. Canceled and void invoices are excluded. Processing ACH stays separate so it is never counted as paid or asked for twice.</p>
        <div className="association-fee-list">
          {rows.map((invoice) => {
            const bucket = associationFeeBucket(invoice)
            const camper = Array.isArray(invoice.campers) ? invoice.campers[0] : invoice.campers
            const camperName = `${camper?.first_name || ''} ${camper?.last_name || ''}`.trim() || 'Unknown camper'
            const processingLabel = bucket === 'processing' ? achExpectedLabel(invoice) : ''
            return <article key={invoice.id} className={`association-fee-row ${bucket}`}>
              <div className="association-fee-camper"><span>Lot {camper?.lot_number || '—'}</span><strong>{camperName}</strong><small>Invoice #{invoice.invoice_number || '—'}</small></div>
              <div><small>Association fee</small><strong>{formatMoney(associationFeeAmount(invoice))}</strong></div>
              <div><small>{bucket === 'paid' ? 'Paid on' : 'Due date'}</small><strong>{formatDate(bucket === 'paid' ? invoice.paid_at : invoice.due_date)}</strong></div>
              <div><small>{bucket === 'processing' ? 'ACH status' : bucket === 'paid' ? 'Payment method' : 'Next step'}</small><strong>{bucket === 'processing' ? (processingLabel || 'Payment underway') : bucket === 'paid' ? (invoice.payment_method || 'Recorded paid') : 'Payment still due'}</strong></div>
              <span className={`association-fee-status ${bucket}`}>{bucket === 'owes' ? <><AlertTriangle size={15} /> Owes</> : bucket === 'processing' ? <><Clock3 size={15} /> Processing</> : <><CheckCircle2 size={15} /> Paid</>}</span>
              <button type="button" onClick={() => router.push(`/admin/invoices/${invoice.id}`)}>Open invoice <ArrowRight size={15} /></button>
            </article>
          })}
          {rows.length === 0 && <div className="association-fee-empty"><CheckCircle2 size={34} /><h2>No matching association fees</h2><p>Try another status, year, or search.</p></div>}
        </div>
      </section>
    </main>
  )
}
