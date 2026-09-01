'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  Car,
  CheckCircle2,
  CircleDollarSign,
  ContactRound,
  Eye,
  FileText,
  FileUp,
  Gauge,
  History,
  LoaderCircle,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ReceiptText,
  Save,
  ShieldCheck,
  UserRound,
  UsersRound,
  Wrench,
  Zap,
} from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import AddressFinder from '../../../../components/AddressFinder'
import { isInvoiceDueThroughCurrentMonth, totalInvoiceBalance } from '../../../../lib/invoice-balance'

const MAX_INSURANCE_SIZE = 20 * 1024 * 1024
type HistoryView = 'activity' | 'documents' | 'billing' | 'site' | 'messages' | 'electric'

type Camper = {
  id: string
  lot_number: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  secondary_email: string | null
  phone: string | null
  alternate_phone: string | null
  second_profile_first_name: string | null
  second_profile_last_name: string | null
  second_profile_phone: string | null
  mailing_address_line1: string | null
  mailing_address_line2: string | null
  mailing_city: string | null
  mailing_state: string | null
  mailing_zip: string | null
  role: string | null
  active: boolean | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  license_plate: string | null
  vehicle_2_make: string | null
  vehicle_2_model: string | null
  vehicle_2_license_plate: string | null
  golf_cart_make: string | null
  golf_cart_color: string | null
  directory_opt_in: boolean | null
  directory_show_phone: boolean | null
  sms_opt_in: boolean | null
  sms_opt_in_at: string | null
  camper_since_date: string | null
  celebration_messages_opt_in: boolean | null
  event_reminders_opt_in: boolean | null
  office_notes: string | null
}

const emptyCamper: Camper = {
  id: '',
  lot_number: '',
  first_name: '',
  last_name: '',
  email: '',
  secondary_email: '',
  phone: '',
  alternate_phone: '',
  second_profile_first_name: '',
  second_profile_last_name: '',
  second_profile_phone: '',
  mailing_address_line1: '',
  mailing_address_line2: '',
  mailing_city: '',
  mailing_state: '',
  mailing_zip: '',
  role: 'camper',
  active: true,
  emergency_contact_name: '',
  emergency_contact_phone: '',
  vehicle_make: '',
  vehicle_model: '',
  license_plate: '',
  vehicle_2_make: '',
  vehicle_2_model: '',
  vehicle_2_license_plate: '',
  golf_cart_make: '',
  golf_cart_color: '',
  directory_opt_in: false,
  directory_show_phone: false,
  sms_opt_in: false,
  sms_opt_in_at: null,
  camper_since_date: '',
  celebration_messages_opt_in: false,
  event_reminders_opt_in: false,
  office_notes: '',
}

export default function CamperDetailPage() {
  const params = useParams()
  const router = useRouter()
  const camperId = String(params.id || '')

  const [camper, setCamper] = useState<Camper>(emptyCamper)
  const [invoices, setInvoices] = useState<any[]>([])
  const [camperDocuments, setCamperDocuments] = useState<any[]>([])
  const [insuranceDocuments, setInsuranceDocuments] = useState<any[]>([])
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null)
  const [uploadingInsurance, setUploadingInsurance] = useState(false)
  const [scannedDocumentFile, setScannedDocumentFile] = useState<File | null>(null)
  const [scannedDocumentName, setScannedDocumentName] = useState('')
  const [scannedDocumentType, setScannedDocumentType] = useState('Signed Lease')
  const [uploadingScannedDocument, setUploadingScannedDocument] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [annualLotRent, setAnnualLotRent] = useState('')
  const [savingAnnualRent, setSavingAnnualRent] = useState(false)
  const [message, setMessage] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [internalHistory, setInternalHistory] = useState<any | null>(null)
  const [historyView, setHistoryView] = useState<HistoryView>('activity')
  const [historyError, setHistoryError] = useState('')

  useEffect(() => {
    loadCamper()
  }, [camperId])

  async function loadCamper() {
    setLoading(true)
    setMessage('')

    const [camperResult, invoiceResult, documentResult] = await Promise.all([
      supabase.from('campers').select('*').eq('id', camperId).single(),
      supabase.from('invoices').select('*').eq('camper_id', camperId),
      supabase
        .from('documents')
        .select('*')
        .eq('camper_id', camperId)
        .order('created_at', { ascending: false })
    ])

    if (camperResult.error || !camperResult.data) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setCamper({ ...emptyCamper, ...camperResult.data })
    setInvoices(invoiceResult.data || [])
    const documents = documentResult.data || []
    setCamperDocuments(documents)
    setInsuranceDocuments(documents.filter((document) => document.document_type === 'Golf Cart Insurance'))

    const currentLotNumber = String(camperResult.data.lot_number || '').trim()
    if (currentLotNumber) {
      const { data: lotRows } = await supabase
        .from('lots')
        .select('lot_rent_amount')
        .eq('lot_number', currentLotNumber)
        .limit(1)

      const savedRent = lotRows?.[0]?.lot_rent_amount
      setAnnualLotRent(savedRent === null || savedRent === undefined ? '' : String(savedRent))
    } else {
      setAnnualLotRent('')
    }

    await loadInternalHistory()
    setLoading(false)
  }

  async function loadInternalHistory() {
    setHistoryError('')
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Your admin login has expired. Please sign in again.')
      const response = await fetch(`/api/admin-site-history?camperId=${encodeURIComponent(camperId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.camper) throw new Error(result?.error || 'The internal history could not be loaded.')
      setInternalHistory(result)
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'The internal history could not be loaded.')
    }
  }

  function updateField<K extends keyof Camper>(field: K, value: Camper[K]) {
    setCamper((current) => ({ ...current, [field]: value }))
  }

  async function saveCamper() {
    if (!camper.first_name?.trim() || !camper.last_name?.trim()) {
      setMessage('First and last name are required.')
      return
    }

    if (!camper.email?.trim()) {
      setMessage('An email address is required for this camper record.')
      return
    }

    const mailingAddressIncomplete =
      !camper.mailing_address_line1?.trim() ||
      !camper.mailing_city?.trim() ||
      !camper.mailing_state?.trim() ||
      !camper.mailing_zip?.trim()

    setSaving(true)
    setMessage('Saving camper profile…')

    const { data, error } = await supabase
      .from('campers')
      .update({
        lot_number: camper.lot_number?.trim() || null,
        first_name: camper.first_name.trim(),
        last_name: camper.last_name.trim(),
        email: camper.email.trim().toLowerCase(),
        secondary_email: camper.secondary_email?.trim()
          ? camper.secondary_email.trim().toLowerCase()
          : null,
        phone: camper.phone?.trim() || null,
        alternate_phone: camper.alternate_phone?.trim() || null,
        second_profile_first_name: camper.second_profile_first_name?.trim() || null,
        second_profile_last_name: camper.second_profile_last_name?.trim() || null,
        second_profile_phone: camper.second_profile_phone?.trim() || null,
        mailing_address_line1: camper.mailing_address_line1?.trim() || null,
        mailing_address_line2: camper.mailing_address_line2?.trim() || null,
        mailing_city: camper.mailing_city?.trim() || null,
        mailing_state: camper.mailing_state?.trim() || null,
        mailing_zip: camper.mailing_zip?.trim() || null,
        role: camper.role || 'camper',
        active: camper.active !== false,
        emergency_contact_name: camper.emergency_contact_name?.trim() || null,
        emergency_contact_phone: camper.emergency_contact_phone?.trim() || null,
        vehicle_make: camper.vehicle_make?.trim() || null,
        vehicle_model: camper.vehicle_model?.trim() || null,
        license_plate: camper.license_plate?.trim() || null,
        vehicle_2_make: camper.vehicle_2_make?.trim() || null,
        vehicle_2_model: camper.vehicle_2_model?.trim() || null,
        vehicle_2_license_plate: camper.vehicle_2_license_plate?.trim() || null,
        golf_cart_make: camper.golf_cart_make?.trim() || null,
        golf_cart_color: camper.golf_cart_color?.trim() || null,
        directory_opt_in: Boolean(camper.directory_opt_in),
        directory_show_phone: Boolean(camper.directory_opt_in && camper.directory_show_phone),
        sms_opt_in: Boolean(camper.sms_opt_in),
        sms_opt_in_at: camper.sms_opt_in
          ? camper.sms_opt_in_at || new Date().toISOString()
          : null,
        camper_since_date: camper.camper_since_date || null,
        office_notes: camper.office_notes?.trim() || null,
      })
      .eq('id', camperId)
      .select('*')
      .single()

    if (error || !data) {
      setMessage(error?.message || 'Unable to save this camper.')
      setSaving(false)
      return
    }

    setCamper({ ...emptyCamper, ...data })
    setMessage(
      mailingAddressIncomplete
        ? 'Camper profile saved successfully. Mailing address is still needed.'
        : 'Camper profile saved successfully.',
    )
    setSaving(false)
  }

  async function saveAnnualLotRent() {
    const currentLotNumber = String(camper.lot_number || '').trim()
    if (!currentLotNumber) {
      setMessage('Add a lot or site number before saving annual lot rent.')
      return
    }

    const normalizedRent = annualLotRent.trim()
    const rentAmount = normalizedRent === '' ? null : Number(normalizedRent)
    if (rentAmount !== null && (!Number.isFinite(rentAmount) || rentAmount < 0)) {
      setMessage('Enter a valid annual lot rent amount.')
      return
    }

    setSavingAnnualRent(true)
    setMessage('Saving annual lot rent…')

    const { data: lotRows, error: lookupError } = await supabase
      .from('lots')
      .select('id')
      .eq('lot_number', currentLotNumber)
      .limit(1)

    if (lookupError) {
      setMessage(lookupError.message || 'Unable to find this lot record.')
      setSavingAnnualRent(false)
      return
    }

    const existingLot = lotRows?.[0]
    const result = existingLot
      ? await supabase.from('lots').update({ lot_rent_amount: rentAmount }).eq('id', existingLot.id)
      : await supabase.from('lots').insert({
          lot_number: currentLotNumber,
          camper_id: camperId,
          lot_rent_amount: rentAmount,
        })

    if (result.error) {
      setMessage(result.error.message || 'Unable to save annual lot rent.')
      setSavingAnnualRent(false)
      return
    }

    setAnnualLotRent(rentAmount === null ? '' : String(rentAmount))
    setMessage('Annual lot rent saved successfully.')
    setSavingAnnualRent(false)
  }

  function isAllowedInsuranceFile(file: File) {
    return (
      /\.(pdf|docx|doc|png|jpe?g|webp|heic)$/i.test(file.name) ||
      [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/heic',
      ].includes(file.type)
    )
  }

  function scannedDocumentDefaultName(file: File) {
    const cleanBaseName = file.name
      .replace(/\.(pdf|docx|doc|png|jpe?g|webp|heic)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim()

    if (cleanBaseName) return cleanBaseName

    return `${scannedDocumentType} - ${camper.first_name || ''} ${camper.last_name || ''}`.trim()
  }

  async function uploadGolfCartInsurance() {
    if (!insuranceFile) {
      setMessage('Choose a golf cart insurance file first.')
      return
    }

    if (!isAllowedInsuranceFile(insuranceFile)) {
      setMessage('Golf cart insurance must be a PDF, Word document, or image.')
      return
    }

    if (insuranceFile.size > MAX_INSURANCE_SIZE) {
      setMessage('Golf cart insurance files must be 20 MB or smaller.')
      return
    }

    setUploadingInsurance(true)
    setMessage('Uploading golf cart insurance…')

    const safeName = insuranceFile.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const filePath = `${camperId}/golf-cart-insurance/${crypto.randomUUID()}-${safeName}`

    try {
      const { error: uploadError } = await supabase.storage
        .from('camper-documents')
        .upload(filePath, insuranceFile, {
          contentType: insuranceFile.type || undefined,
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { error: rowError } = await supabase.from('documents').insert({
        camper_id: camperId,
        document_name: `Golf Cart Insurance - ${camper.first_name || ''} ${camper.last_name || ''}`.trim(),
        document_type: 'Golf Cart Insurance',
        file_url: filePath,
        signature_status: 'not_required',
      })

      if (rowError) {
        await supabase.storage.from('camper-documents').remove([filePath])
        throw rowError
      }

      setInsuranceFile(null)
      setMessage('Golf cart insurance uploaded successfully.')
      await loadCamper()
    } catch (error: any) {
      setMessage(error.message || 'Unable to upload golf cart insurance.')
    } finally {
      setUploadingInsurance(false)
    }
  }

  async function uploadScannedDocument() {
    if (!scannedDocumentFile) {
      setMessage('Choose a scanned document first.')
      return
    }

    if (!isAllowedInsuranceFile(scannedDocumentFile)) {
      setMessage('Scanned camper documents must be a PDF, Word document, or image.')
      return
    }

    if (scannedDocumentFile.size > MAX_INSURANCE_SIZE) {
      setMessage('Scanned camper documents must be 20 MB or smaller.')
      return
    }

    const cleanDocumentName = (scannedDocumentName.trim() || scannedDocumentDefaultName(scannedDocumentFile)).trim()
    if (!cleanDocumentName) {
      setMessage('Add a document name before uploading.')
      return
    }

    setUploadingScannedDocument(true)
    setMessage('Uploading scanned camper document…')

    const safeName = scannedDocumentFile.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const filePath = `${camperId}/scanned-documents/${crypto.randomUUID()}-${safeName}`

    try {
      const { error: uploadError } = await supabase.storage
        .from('camper-documents')
        .upload(filePath, scannedDocumentFile, {
          contentType: scannedDocumentFile.type || undefined,
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { error: rowError } = await supabase.from('documents').insert({
        camper_id: camperId,
        document_name: cleanDocumentName,
        document_type: scannedDocumentType,
        file_url: filePath,
        signature_status: 'not_required',
      })

      if (rowError) {
        await supabase.storage.from('camper-documents').remove([filePath])
        throw rowError
      }

      setScannedDocumentFile(null)
      setScannedDocumentName('')
      setScannedDocumentType('Signed Lease')
      setMessage('Scanned document uploaded to this camper’s portal documents.')
      await loadCamper()
    } catch (error: any) {
      setMessage(error.message || 'Unable to upload scanned camper document.')
    } finally {
      setUploadingScannedDocument(false)
    }
  }

  async function openInsuranceDocument(document: any) {
    router.push(`/documents/view/${document.id}`)
  }

  if (loading) {
    return (
      <main className="admin-camper-profile-page">
        <div className="admin-camper-profile-loading">
          <LoaderCircle className="admin-spin" size={28} />
          Loading camper profile…
        </div>
      </main>
    )
  }

  if (notFound) {
    return (
      <main className="admin-camper-profile-page">
        <div className="admin-camper-profile-loading">Camper not found.</div>
      </main>
    )
  }

  const openInvoices = invoices.filter((invoice) => invoice.status !== 'paid')
  const balanceDue = totalInvoiceBalance(invoices.filter((invoice) => isInvoiceDueThroughCurrentMonth(invoice)))
  const initials = `${camper.first_name?.[0] || ''}${camper.last_name?.[0] || ''}`.toUpperCase()
  const history = internalHistory
  const historyCounts: Record<HistoryView, number> = {
    activity: Number(history?.summary?.activityItems || 0),
    documents: Number(history?.summary?.totalDocuments || 0),
    billing: Number(history?.summary?.totalInvoices || 0),
    site: Number(history?.summary?.totalNotices || 0) + Number(history?.summary?.maintenanceItems || 0) + Number(history?.summary?.pumpOuts || 0),
    messages: Number(history?.summary?.messages || 0),
    electric: Number(history?.summary?.electricReadings || 0),
  }

  return (
    <main className="admin-camper-profile-page">
      <header className="admin-camper-profile-header">
        <button type="button" onClick={() => router.push('/admin/campers')}>
          <ArrowLeft size={17} /> Back to campers
        </button>
        <div className="admin-camper-profile-identity">
          <span>{initials || <UserRound size={28} />}</span>
          <div>
            <small>CAMPER PROFILE · LOT {camper.lot_number || 'UNASSIGNED'}</small>
            <h1>{camper.first_name} {camper.last_name}</h1>
            <p><Mail size={14} /> {camper.email}{camper.secondary_email ? ` · ${camper.secondary_email}` : ''}</p>
          </div>
        </div>
      </header>

      <section className="admin-camper-profile-summary" aria-label="Camper account summary">
        <article>
          <span className="green"><FileText size={20} /></span>
          <div><small>Total invoices</small><strong>{invoices.length}</strong></div>
        </article>
        <article>
          <span className="gold"><Gauge size={20} /></span>
          <div><small>Open invoices</small><strong>{openInvoices.length}</strong></div>
        </article>
        <article>
          <span className="blue"><CircleDollarSign size={20} /></span>
          <div><small>Balance due</small><strong>${balanceDue.toFixed(2)}</strong></div>
        </article>
        <article>
          <span className="plum"><CalendarDays size={20} /></span>
          <div><small>Annual lot rent</small><strong>{annualLotRent ? `$${Number(annualLotRent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Not entered'}</strong></div>
        </article>
      </section>

      {message && (
        <div className={`admin-camper-profile-message ${message.includes('successfully') ? 'success' : ''}`} role="status">
          {message.includes('successfully') && <CheckCircle2 size={17} />}
          {message}
        </div>
      )}

      <section className="admin-camper-heart" id="camper-history" aria-labelledby="camper-history-title">
        <div className="admin-camper-heart-heading">
          <div className="admin-camper-heart-icon"><History size={23} /></div>
          <div>
            <small>ADMIN ONLY · PERMANENT CAMPER RECORD</small>
            <h2 id="camper-history-title">Complete camper history</h2>
            <p>One private place for every signed document, charge, payment, message, meter reading, site-care item, work order, pump-out, and renewal decision.</p>
          </div>
          <span className="admin-camper-heart-lock"><ShieldCheck size={16} /> Internal information</span>
        </div>

        {historyError && <div className="admin-camper-history-error"><strong>History could not load.</strong><span>{historyError}</span><button type="button" onClick={loadInternalHistory}>Try again</button></div>}

        {history && <>
          <div className="admin-camper-heart-summary">
            <article><small>Recorded activity</small><strong>{history.summary.activityItems}</strong><span>All saved events</span></article>
            <article><small>Signed documents</small><strong>{history.summary.signedDocuments} of {history.summary.totalDocuments}</strong><span>Signature records kept</span></article>
            <article><small>Paid invoices</small><strong>{history.summary.paidInvoices} of {history.summary.totalInvoices}</strong><span>{history.summary.lateInvoices} paid late / past due</span></article>
            <article><small>Current balance</small><strong>${Number(history.summary.openBalance || 0).toFixed(2)}</strong><span>All open invoices</span></article>
          </div>

          <nav className="admin-camper-history-tabs" aria-label="Camper history sections">
            <HistoryTab active={historyView === 'activity'} onClick={() => setHistoryView('activity')} icon={<History />} label="All activity" count={historyCounts.activity} />
            <HistoryTab active={historyView === 'documents'} onClick={() => setHistoryView('documents')} icon={<FileText />} label="Documents" count={historyCounts.documents} />
            <HistoryTab active={historyView === 'billing'} onClick={() => setHistoryView('billing')} icon={<ReceiptText />} label="Billing & payments" count={historyCounts.billing} />
            <HistoryTab active={historyView === 'site'} onClick={() => setHistoryView('site')} icon={<Wrench />} label="Site & maintenance" count={historyCounts.site} />
            <HistoryTab active={historyView === 'messages'} onClick={() => setHistoryView('messages')} icon={<MessageCircle />} label="Messages" count={historyCounts.messages} />
            <HistoryTab active={historyView === 'electric'} onClick={() => setHistoryView('electric')} icon={<Zap />} label="Electric" count={historyCounts.electric} />
          </nav>

          <div className="admin-camper-history-content">
            {historyView === 'activity' && <HistoryList empty="No activity has been recorded for this camper yet.">
              {(history.activity || []).map((item: any) => <article className="admin-history-row" key={item.id}>
                <span className={`admin-history-type ${String(item.type || '').toLowerCase()}`}>{item.type}</span>
                <div><strong>{item.title}</strong><p>{item.detail || 'Saved to camper history'}</p></div>
                <time>{formatHistoryDate(item.date)}</time>
                {item.type === 'Document' && item.source_id && <button type="button" onClick={() => router.push(`/documents/view/${item.source_id}`)}>Open</button>}
              </article>)}
            </HistoryList>}

            {historyView === 'documents' && <HistoryList empty="No documents are saved for this camper yet.">
              {(history.documents || []).map((document: any) => <article className="admin-history-document" key={document.id}>
                <span className={String(document.signature_status || '').toLowerCase() === 'signed' ? 'signed' : 'pending'}><FileText size={19} /></span>
                <div><small>{document.document_type || 'DOCUMENT'}</small><strong>{document.document_name || 'Camper document'}</strong><p>{documentSignatureSummary(document)}</p>{document.signature_record_hash && <em><ShieldCheck size={13} /> Secure signature proof saved</em>}</div>
                <button type="button" onClick={() => router.push(`/documents/view/${document.id}`)}><Eye size={15} /> Open document</button>
              </article>)}
            </HistoryList>}

            {historyView === 'billing' && <HistoryList empty="No invoices are saved for this camper yet.">
              {(history.invoices || []).map((invoice: any) => <article className="admin-history-invoice" key={invoice.id}>
                <div className="admin-history-invoice-top"><div><small>{invoice.invoice_type || 'INVOICE'}</small><strong>{invoice.invoice_number || 'Invoice'}</strong></div><span className={String(invoice.status || '').toLowerCase()}>{invoice.status || 'Open'}</span><b>${Number(invoice.total_due || 0).toFixed(2)}</b></div>
                <p>Due {formatHistoryDate(invoice.due_date)}{invoice.paid_at ? ` · Paid ${formatHistoryDate(invoice.paid_at)}` : ''}{invoice.payment_method ? ` · ${invoice.payment_method}` : ''}{invoice.is_late ? ' · Late/past due' : ''}</p>
                {!!invoice.invoice_items?.length && <ul>{invoice.invoice_items.map((item: any) => <li key={item.id}><span>{item.description || 'Charge'}</span><strong>${Number(item.total ?? item.unit_price ?? 0).toFixed(2)}</strong></li>)}</ul>}
                <button type="button" onClick={() => router.push(`/admin/invoices/${invoice.id}`)}>Open invoice</button>
              </article>)}
            </HistoryList>}

            {historyView === 'site' && <HistoryList empty="No site-care, maintenance, or pump-out history is saved yet.">
              {(history.notices || []).map((item: any) => <HistoryDetailRow key={`notice-${item.id}`} label="Site care" title={item.title || 'Site-care notice'} detail={`${item.status || 'Open'}${item.priority ? ` · ${item.priority}` : ''}${item.message ? ` · ${item.message}` : ''}`} date={item.resolved_at || item.ready_for_review_at || item.created_at} />)}
              {(history.maintenance || []).map((item: any) => <HistoryDetailRow key={`maintenance-${item.id}`} label="Maintenance" title={item.title || 'Work order'} detail={`${item.status || 'Open'}${item.priority ? ` · ${item.priority}` : ''}${item.description ? ` · ${item.description}` : ''}`} date={item.completed_at || item.created_at} />)}
              {(history.pumpOuts || []).map((item: any) => <HistoryDetailRow key={`pump-${item.id}`} label="Pump-out" title={`Lot ${item.lot_number || camper.lot_number || '—'} pump-out`} detail={`${item.status || 'Requested'} · $${Number(item.charge_amount || 0).toFixed(2)}${item.billed_at ? ' · Billed' : ''}${item.notes ? ` · ${item.notes}` : ''}`} date={item.completed_at || item.requested_at} />)}
            </HistoryList>}

            {historyView === 'messages' && <HistoryList empty="No office messages are saved for this camper yet.">
              {(history.messages || []).map((item: any) => <article className="admin-history-message" key={item.id}><div><span>{item.sender_role === 'camper' ? 'Camper → Office' : 'Office → Camper'}</span><time>{formatHistoryDate(item.created_at)}</time></div><strong>{item.sender_name || (item.sender_role === 'camper' ? `${camper.first_name} ${camper.last_name}` : 'Bur Oaks Office')}</strong><p>{item.body}</p></article>)}
            </HistoryList>}

            {historyView === 'electric' && <HistoryList empty="No electric readings are saved for this camper yet.">
              {(history.readings || []).map((item: any) => <article className="admin-history-electric" key={item.id}><div><small>READING DATE</small><strong>{formatHistoryDate(item.reading_date)}</strong></div><div><small>PREVIOUS</small><strong>{Number(item.previous_reading || 0).toLocaleString()}</strong></div><div><small>CURRENT</small><strong>{Number(item.current_reading || 0).toLocaleString()}</strong></div><div><small>USAGE</small><strong>{Number(item.kwh_used || 0).toLocaleString()} kWh</strong></div><div><small>CHARGE</small><strong>${Number(item.amount_due || 0).toFixed(2)}</strong></div><span>{item.invoice_id ? 'Invoiced' : 'Reading saved'}</span></article>)}
            </HistoryList>}
          </div>
        </>}
      </section>

      <div className="admin-camper-profile-grid">
        <ProfileSection icon={<UserRound />} kicker="BASIC INFORMATION" title="Camper & portal details">
          <div className="admin-camper-form-grid two">
            <Field label="First name" value={camper.first_name} onChange={(value) => updateField('first_name', value)} />
            <Field label="Last name" value={camper.last_name} onChange={(value) => updateField('last_name', value)} />
            <Field label="Lot / site number" value={camper.lot_number} onChange={(value) => updateField('lot_number', value)} icon={<MapPin />} />
            <Field label="Camper since" type="date" value={camper.camper_since_date} onChange={(value) => updateField('camper_since_date', value)} icon={<CalendarDays />} />
            <label className="admin-camper-field">
              <span>Portal role</span>
              <select value={camper.role || 'camper'} onChange={(event) => updateField('role', event.target.value)}>
                <option value="camper">Camper</option>
                <option value="admin">Administrator</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </label>
            <label className="admin-camper-field">
              <span>Record status</span>
              <select value={camper.active === false ? 'archived' : 'active'} onChange={(event) => updateField('active', event.target.value === 'active')}>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
        </ProfileSection>

        <ProfileSection icon={<CircleDollarSign />} kicker="BILLING & RENT" title="Annual lot rent">
          <p className="admin-camper-panel-note">
            Enter the full lot rent for the year for Site {camper.lot_number || 'Unassigned'}. This is saved separately from invoices and the rest of the camper profile.
          </p>
          <div className="admin-camper-rent-entry">
            <label className="admin-camper-field">
              <span>Annual lot rent</span>
              <div className="admin-camper-money-field">
                <i>$</i>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={annualLotRent}
                  onChange={(event) => setAnnualLotRent(event.target.value)}
                  placeholder="0.00"
                />
              </div>
            </label>
            <button type="button" onClick={saveAnnualLotRent} disabled={savingAnnualRent || !camper.lot_number}>
              {savingAnnualRent ? <LoaderCircle className="admin-spin" size={17} /> : <Save size={17} />}
              {savingAnnualRent ? 'Saving…' : 'Save Annual Rent'}
            </button>
          </div>
        </ProfileSection>

        <ProfileSection icon={<ContactRound />} kicker="CONTACT" title="Profile 1 & portal emails">
          <div className="admin-camper-form-grid">
            <Field label="Primary email address" type="email" value={camper.email} onChange={(value) => updateField('email', value)} icon={<Mail />} />
            <Field label="Second email address" type="email" value={camper.secondary_email} onChange={(value) => updateField('secondary_email', value)} icon={<Mail />} />
            <Field label="Profile 1 phone number" type="tel" value={camper.phone} onChange={(value) => updateField('phone', value)} icon={<Phone />} />
            <Field label="Second phone number" type="tel" value={camper.alternate_phone} onChange={(value) => updateField('alternate_phone', value)} icon={<Phone />} />
          </div>
          <div className="admin-camper-directory-options sms">
            <label>
              <input
                type="checkbox"
                checked={Boolean(camper.sms_opt_in)}
                onChange={(event) => {
                  updateField('sms_opt_in', event.target.checked)
                  updateField('sms_opt_in_at', event.target.checked ? camper.sms_opt_in_at || new Date().toISOString() : null)
                }}
              />
              <span><strong>Camper agreed to receive text alerts</strong><small>Use only after they have given permission. Texts use the profile 1 phone number.</small></span>
            </label>
            <div className="directory-safety-note">
              <ShieldCheck size={16} /> Personal birthday and anniversary greetings: {camper.celebration_messages_opt_in ? 'Camper opted in' : 'Not opted in'}.
            </div>
            <div className="directory-safety-note">
              <ShieldCheck size={16} /> Wednesday event reminders: {camper.sms_opt_in ? 'Included with Text Alerts' : 'Text Alerts are off'}.
            </div>
          </div>
        </ProfileSection>

        <ProfileSection icon={<MapPin />} kicker="REQUIRED" title="Mailing address">
          <p className="admin-camper-panel-note">
            Required so Bur Oaks can mail paper notices, leases, billing items, or other campground documents if needed.
          </p>
          <AddressFinder
            initialAddress={[
              camper.mailing_address_line1,
              camper.mailing_city,
              camper.mailing_state,
              camper.mailing_zip,
            ].filter(Boolean).join(', ')}
            onSelect={(address) => {
              updateField('mailing_address_line1', address.line1)
              updateField('mailing_city', address.city)
              updateField('mailing_state', address.state)
              updateField('mailing_zip', address.zip)
            }}
          />
          <div className="admin-camper-form-grid">
            <Field label="Street address" name="mailing-address-line1" autoComplete="address-line1" value={camper.mailing_address_line1} onChange={(value) => updateField('mailing_address_line1', value)} />
            <Field label="Address line 2" name="mailing-address-line2" autoComplete="address-line2" value={camper.mailing_address_line2} onChange={(value) => updateField('mailing_address_line2', value)} />
          </div>
          <div className="admin-camper-form-grid three">
            <Field label="City" name="mailing-city" autoComplete="address-level2" value={camper.mailing_city} onChange={(value) => updateField('mailing_city', value)} />
            <Field label="State" name="mailing-state" autoComplete="address-level1" value={camper.mailing_state} onChange={(value) => updateField('mailing_state', value)} />
            <Field label="ZIP" name="mailing-zip" autoComplete="postal-code" value={camper.mailing_zip} onChange={(value) => updateField('mailing_zip', value)} />
          </div>
        </ProfileSection>

        <ProfileSection icon={<UsersRound />} kicker="OPTIONAL" title="Profile 2">
          <div className="admin-camper-form-grid three">
            <Field label="Profile 2 first name" value={camper.second_profile_first_name} onChange={(value) => updateField('second_profile_first_name', value)} />
            <Field label="Profile 2 last name" value={camper.second_profile_last_name} onChange={(value) => updateField('second_profile_last_name', value)} />
            <Field label="Profile 2 phone" type="tel" value={camper.second_profile_phone} onChange={(value) => updateField('second_profile_phone', value)} icon={<Phone />} />
          </div>
        </ProfileSection>

        <ProfileSection icon={<UsersRound />} kicker="SAFETY" title="Emergency contact">
          <div className="admin-camper-form-grid two">
            <Field label="Contact name" value={camper.emergency_contact_name} onChange={(value) => updateField('emergency_contact_name', value)} />
            <Field label="Contact phone" type="tel" value={camper.emergency_contact_phone} onChange={(value) => updateField('emergency_contact_phone', value)} icon={<Phone />} />
          </div>
        </ProfileSection>

        <ProfileSection icon={<Car />} kicker="VEHICLES" title="Vehicle & golf cart">
          <div className="admin-camper-form-grid three">
            <Field label="Vehicle 1 make" value={camper.vehicle_make} onChange={(value) => updateField('vehicle_make', value)} />
            <Field label="Vehicle 1 model" value={camper.vehicle_model} onChange={(value) => updateField('vehicle_model', value)} />
            <Field label="Vehicle 1 license plate" value={camper.license_plate} onChange={(value) => updateField('license_plate', value)} />
            <Field label="Vehicle 2 make" value={camper.vehicle_2_make} onChange={(value) => updateField('vehicle_2_make', value)} />
            <Field label="Vehicle 2 model" value={camper.vehicle_2_model} onChange={(value) => updateField('vehicle_2_model', value)} />
            <Field label="Vehicle 2 license plate" value={camper.vehicle_2_license_plate} onChange={(value) => updateField('vehicle_2_license_plate', value)} />
            <Field label="Golf cart make" value={camper.golf_cart_make} onChange={(value) => updateField('golf_cart_make', value)} />
            <Field label="Golf cart color" value={camper.golf_cart_color} onChange={(value) => updateField('golf_cart_color', value)} />
          </div>
          <div className="admin-camper-insurance-box">
            <div>
              <span><ShieldCheck size={18} /> Golf cart insurance</span>
              <p>Upload proof of insurance for this camper’s golf cart. PDF, Word, or image files are accepted.</p>
            </div>

            <label className="admin-camper-insurance-upload">
              <FileUp size={18} />
              <span>{insuranceFile ? insuranceFile.name : 'Choose insurance file'}</span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.heic,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                onChange={(event) => setInsuranceFile(event.target.files?.[0] || null)}
              />
            </label>

            <button type="button" onClick={uploadGolfCartInsurance} disabled={uploadingInsurance || !insuranceFile}>
              {uploadingInsurance ? <LoaderCircle className="admin-spin" size={16} /> : <FileUp size={16} />}
              {uploadingInsurance ? 'Uploading…' : 'Upload Insurance'}
            </button>

            <div className="admin-camper-insurance-list">
              {insuranceDocuments.length === 0 ? (
                <small>No golf cart insurance uploaded yet.</small>
              ) : (
                insuranceDocuments.map((document) => (
                  <button key={document.id} type="button" onClick={() => openInsuranceDocument(document)}>
                    <Eye size={15} />
                    <span>{document.document_name}</span>
                    <em>{document.created_at ? new Date(document.created_at).toLocaleDateString() : 'Saved'}</em>
                  </button>
                ))
              )}
            </div>
          </div>
        </ProfileSection>

        <ProfileSection icon={<UsersRound />} kicker="COMMUNITY" title="Camper directory">
          <div className="admin-camper-directory-options">
            <label>
              <input type="checkbox" checked={Boolean(camper.directory_opt_in)} onChange={(event) => updateField('directory_opt_in', event.target.checked)} />
              <span><strong>Include in camper directory</strong><small>Other opted-in campers can find their name and lot number.</small></span>
            </label>
            <label className={!camper.directory_opt_in ? 'disabled' : ''}>
              <input type="checkbox" checked={Boolean(camper.directory_show_phone)} disabled={!camper.directory_opt_in} onChange={(event) => updateField('directory_show_phone', event.target.checked)} />
              <span><strong>Show phone number</strong><small>Their email and emergency details always stay private.</small></span>
            </label>
          </div>
        </ProfileSection>

        <ProfileSection icon={<FileText />} kicker="PRIVATE OFFICE NOTES" title="Admin-only notes">
          <label className="admin-camper-field">
            <span>Office notes</span>
            <textarea
              value={camper.office_notes || ''}
              onChange={(event) => updateField('office_notes', event.target.value)}
              placeholder="Examples: prefers text, call before entering site, lease notes, special billing notes..."
            />
          </label>
        </ProfileSection>

        <ProfileSection icon={<FileUp />} kicker="SCANNED COPIES" title="Upload signed camper documents">
          <p className="admin-camper-panel-note">
            Add scanned leases, signed renewals, paper forms, or other camper-specific documents here.
            They will appear in this camper’s portal document center as completed copies.
          </p>

          <div className="admin-camper-scan-upload">
            <div className="admin-camper-form-grid two">
              <label className="admin-camper-field">
                <span>Document name</span>
                <input
                  value={scannedDocumentName}
                  onChange={(event) => setScannedDocumentName(event.target.value)}
                  placeholder="Example: 2026 Signed Seasonal Lease"
                />
              </label>
              <label className="admin-camper-field">
                <span>Document type</span>
                <select value={scannedDocumentType} onChange={(event) => setScannedDocumentType(event.target.value)}>
                  <option value="Signed Lease">Signed Lease</option>
                  <option value="Signed Renewal">Signed Renewal</option>
                  <option value="Campground Form">Campground Form</option>
                  <option value="Paper Notice">Paper Notice</option>
                  <option value="Camper Upload">Camper Upload</option>
                  <option value="Other Document">Other Document</option>
                </select>
              </label>
            </div>

            <div className="admin-camper-document-upload-row">
              <label className="admin-camper-insurance-upload">
                <FileUp size={18} />
                <span>{scannedDocumentFile ? scannedDocumentFile.name : 'Choose scanned document'}</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.heic,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null
                    setScannedDocumentFile(file)
                    if (file && !scannedDocumentName.trim()) {
                      setScannedDocumentName(scannedDocumentDefaultName(file))
                    }
                  }}
                />
              </label>

              <button type="button" onClick={uploadScannedDocument} disabled={uploadingScannedDocument || !scannedDocumentFile}>
                {uploadingScannedDocument ? <LoaderCircle className="admin-spin" size={16} /> : <FileUp size={16} />}
                {uploadingScannedDocument ? 'Uploading…' : 'Upload to Camper Portal'}
              </button>
            </div>
          </div>

          <div className="admin-camper-document-list">
            {camperDocuments.length === 0 ? (
              <small>No documents are saved for this camper yet.</small>
            ) : (
              camperDocuments.map((document) => (
                <button key={document.id} type="button" onClick={() => openInsuranceDocument(document)}>
                  <Eye size={15} />
                  <span>{document.document_name}</span>
                  <em>{document.document_type || 'Document'} · {document.created_at ? new Date(document.created_at).toLocaleDateString() : 'Saved'}</em>
                </button>
              ))
            )}
          </div>
        </ProfileSection>
      </div>

      <div className="admin-camper-save-bar">
        <div>
          <strong>Ready to update this camper?</strong>
          <span>Changes apply immediately across the portal.</span>
          {message && <span className="admin-camper-save-feedback" role="status">{message}</span>}
        </div>
        <button type="button" onClick={saveCamper} disabled={saving}>
          {saving ? <LoaderCircle className="admin-spin" size={18} /> : <Save size={18} />}
          {saving ? 'Saving…' : 'Save Camper Profile'}
        </button>
      </div>
    </main>
  )
}

function formatHistoryDate(value?: string | null) {
  if (!value) return 'Date not recorded'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function documentSignatureSummary(document: any) {
  const status = String(document.signature_status || '').toLowerCase()
  const names = [document.signed_name, document.second_signed_name].filter(Boolean).join(' and ')
  if (status === 'signed') return `Fully signed${names ? ` by ${names}` : ''}${document.signed_at ? ` on ${formatHistoryDate(document.signed_at)}` : ''}.`
  if (status === 'pending_second_signature') return `Partly signed${names ? ` by ${names}` : ''}; waiting for the second signature.`
  if (status === 'not_required') return `Saved on ${formatHistoryDate(document.created_at)}; no electronic signature required.`
  if (status === 'declined') return 'Camper declined this document.'
  return `Waiting for signature · Added ${formatHistoryDate(document.created_at)}`
}

function HistoryTab({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return <button className={active ? 'active' : ''} type="button" onClick={onClick}>{icon}<span>{label}</span><strong>{count}</strong></button>
}

function HistoryList({ children, empty }: { children: React.ReactNode; empty: string }) {
  const items = Array.isArray(children) ? children.flat(Infinity).filter(Boolean) : children ? [children] : []
  return items.length ? <div className="admin-camper-history-list">{children}</div> : <div className="admin-camper-history-empty"><History size={27} /><strong>{empty}</strong></div>
}

function HistoryDetailRow({ label, title, detail, date }: { label: string; title: string; detail: string; date?: string | null }) {
  return <article className="admin-history-row"><span className="admin-history-type">{label}</span><div><strong>{title}</strong><p>{detail}</p></div><time>{formatHistoryDate(date)}</time></article>
}

function ProfileSection({
  icon,
  kicker,
  title,
  children,
}: {
  icon: React.ReactNode
  kicker: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="admin-camper-profile-panel">
      <div className="admin-camper-profile-panel-heading">
        <span>{icon}</span>
        <div><small>{kicker}</small><h2>{title}</h2></div>
      </div>
      <div className="admin-camper-profile-panel-body">{children}</div>
    </section>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  icon,
  name,
  autoComplete,
}: {
  label: string
  value: string | null
  onChange: (value: string) => void
  type?: string
  icon?: React.ReactNode
  name?: string
  autoComplete?: string
}) {
  return (
    <label className="admin-camper-field">
      <span>{label}</span>
      <div className={icon ? 'with-icon' : ''}>
        {icon}
        <input
          type={type}
          name={name}
          autoComplete={autoComplete}
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  )
}
