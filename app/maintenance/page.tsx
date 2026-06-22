'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ImagePlus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { MaintenanceBadge } from '../../components/MaintenanceBadge'
import MaintenancePhotos from '../../components/MaintenancePhotos'

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
  const router = useRouter()

  useEffect(() => {
    loadPage()
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

    const { data: camperData } = await supabase
      .from('campers')
      .select('*')
      .eq('email', user.email)
      .single()

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

    const { error } = await supabase
      .from('maintenance_tickets')
      .insert({
        title,
        description,
        category,
        status: 'Open',
        reported_by: `${camper?.first_name || ''} ${camper?.last_name || ''}`,
        lot_number: camper?.lot_number || '',
        ...(uploadedPaths.length ? { photo_urls: uploadedPaths } : {}),
      })

    if (error) {
      if (uploadedPaths.length) {
        await supabase.storage.from('maintenance-photos').remove(uploadedPaths)
      }
      setMessage(error.message)
      setSubmitting(false)
      return
    }

    setTitle('')
    setDescription('')
    setCategory('General')
    setPhotoFiles([])
    setMessage('✅ Maintenance request submitted!')
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
    <main className="page">
      <div className="container">
        <section
          className="card"
          style={{
            marginBottom: '25px',
            background:
              'linear-gradient(135deg, #ffffff 0%, #eef4ea 100%)',
          }}
        >
          <p className="muted">BUR OAKS CAMPGROUND</p>
<button
  onClick={() => router.push('/portal')}
  style={{
    marginBottom: '20px',
    background: '#6b7280',
    color: 'white',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
  }}
>
  ← Back to Portal
</button>
          <h1>🔧 Maintenance Requests</h1>

          <h2 style={{ color: '#2f5d3a' }}>
            {tickets.length} Request
            {tickets.length !== 1 ? 's' : ''}
          </h2>

          <p className="muted">
            Report campground issues and track request status.
          </p>
        </section>

        <section
          className="card"
          style={{ marginBottom: '25px' }}
        >
          <h2>Submit a Request</h2>

          <p className="muted">
            Lot {camper?.lot_number || 'N/A'} —{' '}
            {camper?.first_name} {camper?.last_name}
          </p>

          <input
            placeholder="Issue Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginBottom: '12px',
            }}
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginBottom: '12px',
            }}
          >
            <option>General</option>
            <option>Electric</option>
            <option>Water</option>
            <option>Gate</option>
            <option>Roads</option>
            <option>Rec Hall</option>
            <option>Bathroom</option>
            <option>Tree / Grounds</option>
          </select>

          <textarea
            placeholder="Describe the issue..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              minHeight: '130px',
              marginBottom: '12px',
            }}
          />

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
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                onChange={(event) => selectPhotos(event.target.files)}
              />
            </label>

            {photoPreviews.length > 0 && (
              <div className="maintenance-preview-grid">
                {photoPreviews.map((url, index) => (
                  <div className="maintenance-preview" key={url}>
                    <img src={url} alt={`Selected maintenance photo ${index + 1}`} />
                    <button
                      type="button"
                      aria-label={`Remove photo ${index + 1}`}
                      onClick={() =>
                        setPhotoFiles((current) =>
                          current.filter((_, fileIndex) => fileIndex !== index)
                        )
                      }
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={submitRequest} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Request'}
          </button>

          {message && (
            <p style={{ marginTop: '10px' }}>
              {message}
            </p>
          )}
        </section>

        <section className="card">
          <h2>My Maintenance Requests</h2>

          {tickets.length === 0 && (
            <p className="muted">
              You have not submitted any maintenance
              requests yet.
            </p>
          )}

          {tickets.map((ticket) => (
            <section
              key={ticket.id}
              className="card"
              style={{
                marginTop: '15px',
                borderLeft: `7px solid ${
                  ticket.status === 'Completed'
                    ? '#16a34a'
                    : ticket.status === 'In Progress'
                    ? '#2563eb'
                    : ticket.status === 'Waiting Parts'
                    ? '#f97316'
                    : '#6b7280'
                }`,
              }}
            >
              <p className="muted">
                {new Date(
                  ticket.created_at
                ).toLocaleDateString()}
              </p>

              <h3>{ticket.title}</h3>

              <p>
                <strong>Category:</strong>{' '}
                {ticket.category}
              </p>

              <p>
                <strong>Status:</strong>{' '}
                <MaintenanceBadge kind="status" value={ticket.status} />
              </p>

              <p>{ticket.description}</p>

              <MaintenancePhotos paths={ticket.photo_urls} />
            </section>
          ))}
        </section>
      </div>
    </main>
  )
}
