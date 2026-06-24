'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, CheckCircle2, ClipboardList, ImagePlus, Wrench, X } from 'lucide-react'
import { getCurrentCamper, supabase } from '../../lib/supabase'
import { MaintenanceBadge } from '../../components/MaintenanceBadge'
import MaintenancePhotos from '../../components/MaintenancePhotos'
import MaintenanceConversation from '../../components/MaintenanceConversation'

function getMaintenanceDisplayStatus(ticket?: any) {
  if (!ticket) return 'Open'
  if (!ticket.admin_approved) return 'Awaiting Office Approval'
  return ticket.status || 'Open'
}

export default function MaintenanceRequestPage() {
  const [camper, setCamper] = useState<any>(null)
  const [tickets, setTickets] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('General')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState('')
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [expandedTicketId, setExpandedTicketId] = useState('')
  const router = useRouter()

  useEffect(() => {
    loadPage()

    const refresh = () => loadPage()
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [])

  useEffect(() => {
    const urls = photoFiles.map((file) => URL.createObjectURL(file))
    setPhotoPreviews(urls)

    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [photoFiles])

  async function loadPage() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = '/login'
      return
    }

    setUserId(user.id)

    const camperData = await getCurrentCamper()

    setCamper(camperData)

    if (camperData) {
      const { data: ticketData } = await supabase
        .from('maintenance_tickets')
        .select('*')
        .eq('lot_number', camperData.lot_number)
        .order('created_at', { ascending: false })

      setTickets(ticketData || [])
    }

    setLoading(false)
  }

  async function submitRequest() {
    if (!title || !description) {
      setMessage('Please add a title and description.')
      return
    }

    setSubmitting(true)
    setMessage('Submitting your request…')

    const uploadedPaths: string[] = []

    if (photoFiles.length > 0) {
      if (!userId) {
        setMessage('Please sign in again before uploading photos.')
        setSubmitting(false)
        return
      }

      const folder = `${userId}/${crypto.randomUUID()}`

      for (const file of photoFiles) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
        const path = `${folder}/${crypto.randomUUID()}-${safeName}`
        const { error: uploadError } = await supabase.storage
          .from('maintenance-photos')
          .upload(path, file, { contentType: file.type, upsert: false })

        if (uploadError) {
          if (uploadedPaths.length) {
            await supabase.storage.from('maintenance-photos').remove(uploadedPaths)
          }
          setMessage(`Photo upload failed: ${uploadError.message}`)
          setSubmitting(false)
          return
        }

        uploadedPaths.push(path)
      }
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      if (uploadedPaths.length) {
        await supabase.storage.from('maintenance-photos').remove(uploadedPaths)
      }
      setMessage('Please sign in again before submitting your request.')
      setSubmitting(false)
      return
    }

    const response = await fetch('/api/maintenance-request', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        description,
        category,
        photoUrls: uploadedPaths,
      }),
    })
    const result = await response.json().catch(() => null)

    if (!response.ok || !result?.success) {
      if (uploadedPaths.length) {
        await supabase.storage.from('maintenance-photos').remove(uploadedPaths)
      }
      setMessage(result?.error || 'Unable to submit maintenance request.')
      setSubmitting(false)
      return
    }

    let alertMessage = ''
    if (result.emailStatus === 'skipped') {
      alertMessage = ` Email alerts are not fully configured: ${result.emailMessage || 'missing email setup'}.`
    } else if (result.emailStatus === 'failed') {
      alertMessage = ` The request was saved, but the email alert failed: ${result.emailMessage || 'email provider error'}.`
    }

    setTitle('')
    setDescription('')
    setCategory('General')
    setPhotoFiles([])
    setMessage(`✅ Maintenance request submitted. The office will review it before work is assigned.${alertMessage}`)
    setSubmitting(false)
    loadPage()
  }

  function selectPhotos(files: FileList | null) {
    const selected = Array.from(files || [])

    if (selected.length > 3) {
      setMessage('Please choose no more than 3 photos.')
      return
    }

    const invalidFile = selected.find(
      (file) => !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024
    )

    if (invalidFile) {
      setMessage('Photos must be image files no larger than 5 MB each.')
      return
    }

    setMessage('')
    setPhotoFiles(selected)
  }

  if (loading) {
    return <div style={{ padding: '40px' }}>Loading...</div>
  }

  return (
    <main className="camper-maintenance-page">
      <section className="camper-maintenance-hero">
        <button type="button" onClick={() => router.push('/portal')}>← Back to Portal</button>
        <span><Wrench size={17} /> Maintenance requests</span>
        <h1>Tell us what needs attention at your site.</h1>
        <p>Submit the issue, attach photos if helpful, and track the status once the office reviews and approves the work.</p>
        <div className="camper-maintenance-stats">
          <article><small>Your lot</small><strong>{camper?.lot_number || 'N/A'}</strong></article>
          <article><small>Active requests</small><strong>{tickets.filter((ticket) => ticket.status !== 'Completed').length}</strong></article>
          <article><small>Completed</small><strong>{tickets.filter((ticket) => ticket.status === 'Completed').length}</strong></article>
        </div>
      </section>

      <div className="camper-maintenance-layout">
        <section className="camper-maintenance-form-card">
          <div className="camper-maintenance-card-heading">
            <span><ClipboardList size={20} /></span>
            <div>
              <small>NEW REQUEST</small>
              <h2>Submit a Request</h2>
              <p>Lot {camper?.lot_number || 'N/A'} — {camper?.first_name} {camper?.last_name}</p>
            </div>
          </div>

          <label>
            <span>Issue title</span>
            <input placeholder="Example: Water leak behind camper" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <label>
            <span>Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option>General</option>
              <option>Electric</option>
              <option>Water</option>
              <option>Gate</option>
              <option>Roads</option>
              <option>Rec Hall</option>
              <option>Bathroom</option>
              <option>Tree / Grounds</option>
            </select>
          </label>

          <label>
            <span>Description</span>
            <textarea placeholder="Describe what is happening and where we should look..." value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>

          <div className="maintenance-upload-box">
            <div className="maintenance-upload-heading">
              <span><Camera size={20} /></span>
              <div>
                <strong>Add photos</strong>
                <small>Optional · Up to 3 images · 5 MB each</small>
              </div>
            </div>

            <label className="maintenance-file-picker">
              <ImagePlus size={19} />
              <span>{photoFiles.length ? 'Choose different photos' : 'Choose photos'}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(event) => selectPhotos(event.target.files)} />
            </label>

            {photoPreviews.length > 0 && (
              <div className="maintenance-preview-grid">
                {photoPreviews.map((url, index) => (
                  <div className="maintenance-preview" key={url}>
                    <img src={url} alt={`Selected maintenance photo ${index + 1}`} />
                    <button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => setPhotoFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button className="camper-maintenance-submit" onClick={submitRequest} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Request'}
          </button>

          {message && <p className="camper-maintenance-message">{message}</p>}
        </section>

        <section className="camper-maintenance-list-card">
          <div className="camper-maintenance-card-heading">
            <span><CheckCircle2 size={20} /></span>
            <div>
              <small>REQUEST HISTORY</small>
              <h2>My Maintenance Requests</h2>
              <p>Approved work will be updated by the maintenance team.</p>
            </div>
          </div>

          {tickets.length === 0 && (
            <div className="camper-maintenance-empty">
              <Wrench size={30} />
              <h3>No requests yet</h3>
              <p>When you submit a request, it will show up here.</p>
            </div>
          )}

          <div className="camper-maintenance-ticket-list">
            {tickets.map((ticket) => (
              <article key={ticket.id} className={`camper-maintenance-ticket ${String(ticket.status || 'open').toLowerCase().replace(/\s+/g, '-')}`}>
                <div>
                  <small>{new Date(ticket.created_at).toLocaleDateString()} · {ticket.category}</small>
                  <h3>{ticket.title}</h3>
                </div>
                {ticket.admin_approved ? (
                  <MaintenanceBadge kind="status" value={ticket.status} />
                ) : (
                  <span className="camper-maintenance-approval-badge">Awaiting Office Approval</span>
                )}
                <p>{ticket.description}</p>
                <p className="camper-maintenance-status-note">
                  Current status: <strong>{getMaintenanceDisplayStatus(ticket)}</strong>
                  {ticket.completed_at ? ` · Completed ${new Date(ticket.completed_at).toLocaleDateString()}` : ''}
                </p>
                <MaintenancePhotos paths={ticket.photo_urls} />
                <button
                  className="camper-maintenance-note-toggle"
                  type="button"
                  onClick={() => setExpandedTicketId(expandedTicketId === ticket.id ? '' : ticket.id)}
                >
                  {expandedTicketId === ticket.id ? 'Hide notes' : 'View / add notes'}
                </button>
                {expandedTicketId === ticket.id && (
                  <MaintenanceConversation
                    ticketId={ticket.id}
                    camperId={camper?.id}
                    authorName={`${camper?.first_name || ''} ${camper?.last_name || ''}`.trim() || 'Camper'}
                    authorRole="camper"
                  />
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
