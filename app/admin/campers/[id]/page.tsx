'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Car,
  CheckCircle2,
  CircleDollarSign,
  ContactRound,
  Eye,
  FileText,
  FileUp,
  Gauge,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { supabase } from '../../../../lib/supabase'

const MAX_INSURANCE_SIZE = 20 * 1024 * 1024

type Camper = {
  id: string
  lot_number: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  secondary_email: string | null
  phone: string | null
  role: string | null
  active: boolean | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  license_plate: string | null
  golf_cart_make: string | null
  golf_cart_color: string | null
  directory_opt_in: boolean | null
  directory_show_phone: boolean | null
}

const emptyCamper: Camper = {
  id: '',
  lot_number: '',
  first_name: '',
  last_name: '',
  email: '',
  secondary_email: '',
  phone: '',
  role: 'camper',
  active: true,
  emergency_contact_name: '',
  emergency_contact_phone: '',
  vehicle_make: '',
  vehicle_model: '',
  license_plate: '',
  golf_cart_make: '',
  golf_cart_color: '',
  directory_opt_in: false,
  directory_show_phone: false,
}

export default function CamperDetailPage() {
  const params = useParams()
  const router = useRouter()
  const camperId = String(params.id || '')

  const [camper, setCamper] = useState<Camper>(emptyCamper)
  const [invoices, setInvoices] = useState<any[]>([])
  const [insuranceDocuments, setInsuranceDocuments] = useState<any[]>([])
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null)
  const [uploadingInsurance, setUploadingInsurance] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    loadCamper()
  }, [camperId])

  async function loadCamper() {
    setLoading(true)
    setMessage('')

    const [camperResult, invoiceResult, insuranceResult] = await Promise.all([
      supabase.from('campers').select('*').eq('id', camperId).single(),
      supabase.from('invoices').select('*').eq('camper_id', camperId),
      supabase
        .from('documents')
        .select('*')
        .eq('camper_id', camperId)
        .eq('document_type', 'Golf Cart Insurance')
        .order('created_at', { ascending: false }),
    ])

    if (camperResult.error || !camperResult.data) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setCamper({ ...emptyCamper, ...camperResult.data })
    setInvoices(invoiceResult.data || [])
    setInsuranceDocuments(insuranceResult.data || [])
    setLoading(false)
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
        role: camper.role || 'camper',
        active: camper.active !== false,
        emergency_contact_name: camper.emergency_contact_name?.trim() || null,
        emergency_contact_phone: camper.emergency_contact_phone?.trim() || null,
        vehicle_make: camper.vehicle_make?.trim() || null,
        vehicle_model: camper.vehicle_model?.trim() || null,
        license_plate: camper.license_plate?.trim() || null,
        golf_cart_make: camper.golf_cart_make?.trim() || null,
        golf_cart_color: camper.golf_cart_color?.trim() || null,
        directory_opt_in: Boolean(camper.directory_opt_in),
        directory_show_phone: Boolean(camper.directory_opt_in && camper.directory_show_phone),
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
    setMessage('Camper profile saved successfully.')
    setSaving(false)
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
  const balanceDue = openInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total_due || 0),
    0,
  )
  const initials = `${camper.first_name?.[0] || ''}${camper.last_name?.[0] || ''}`.toUpperCase()

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
          <span className="plum"><ShieldCheck size={20} /></span>
          <div><small>Portal role</small><strong>{camper.role || 'camper'}</strong></div>
        </article>
      </section>

      {message && (
        <div className={`admin-camper-profile-message ${message.includes('successfully') ? 'success' : ''}`} role="status">
          {message.includes('successfully') && <CheckCircle2 size={17} />}
          {message}
        </div>
      )}

      <div className="admin-camper-profile-grid">
        <ProfileSection icon={<UserRound />} kicker="BASIC INFORMATION" title="Camper & portal details">
          <div className="admin-camper-form-grid two">
            <Field label="First name" value={camper.first_name} onChange={(value) => updateField('first_name', value)} />
            <Field label="Last name" value={camper.last_name} onChange={(value) => updateField('last_name', value)} />
            <Field label="Lot / site number" value={camper.lot_number} onChange={(value) => updateField('lot_number', value)} icon={<MapPin />} />
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

        <ProfileSection icon={<ContactRound />} kicker="CONTACT" title="Phone & email">
          <div className="admin-camper-form-grid">
            <Field label="Primary email address" type="email" value={camper.email} onChange={(value) => updateField('email', value)} icon={<Mail />} />
            <Field label="Second email address" type="email" value={camper.secondary_email} onChange={(value) => updateField('secondary_email', value)} icon={<Mail />} />
            <Field label="Phone number" type="tel" value={camper.phone} onChange={(value) => updateField('phone', value)} icon={<Phone />} />
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
            <Field label="Vehicle make" value={camper.vehicle_make} onChange={(value) => updateField('vehicle_make', value)} />
            <Field label="Vehicle model" value={camper.vehicle_model} onChange={(value) => updateField('vehicle_model', value)} />
            <Field label="License plate" value={camper.license_plate} onChange={(value) => updateField('license_plate', value)} />
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
      </div>

      <div className="admin-camper-save-bar">
        <div><strong>Ready to update this camper?</strong><span>Changes apply immediately across the portal.</span></div>
        <button type="button" onClick={saveCamper} disabled={saving}>
          {saving ? <LoaderCircle className="admin-spin" size={18} /> : <Save size={18} />}
          {saving ? 'Saving…' : 'Save Camper Profile'}
        </button>
      </div>
    </main>
  )
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
}: {
  label: string
  value: string | null
  onChange: (value: string) => void
  type?: string
  icon?: React.ReactNode
}) {
  return (
    <label className="admin-camper-field">
      <span>{label}</span>
      <div className={icon ? 'with-icon' : ''}>
        {icon}
        <input type={type} value={value || ''} onChange={(event) => onChange(event.target.value)} />
      </div>
    </label>
  )
}
