'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { CheckCircle2, ClipboardCheck, Eye, FileUp, ShieldCheck, UsersRound } from 'lucide-react'

export default function ProfilePage() {
  const router = useRouter()
  const [camper, setCamper] = useState<any>(null)
  const [insuranceDocuments, setInsuranceDocuments] = useState<any[]>([])
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null)
  const [uploadingInsurance, setUploadingInsurance] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [insuranceMessage, setInsuranceMessage] = useState('')

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = '/login'
      return
    }

    const { data } = await supabase
      .from('campers')
      .select('*')
      .or(`email.ilike.${user.email?.trim().toLowerCase()},secondary_email.ilike.${user.email?.trim().toLowerCase()}`)
      .single()

    setCamper(data)

    if (data?.id) {
      const { data: documents } = await supabase
        .from('documents')
        .select('*')
        .eq('camper_id', data.id)
        .eq('document_type', 'Golf Cart Insurance')

      setInsuranceDocuments(documents || [])
    }

    setLoading(false)
  }

  async function saveProfile() {
    if (!camper) return

    setSaving(true)
    setMessage('')

    const profileUpdates = {
      first_name: camper.first_name,
      last_name: camper.last_name,
      phone: camper.phone,
      second_profile_first_name: camper.second_profile_first_name,
      second_profile_last_name: camper.second_profile_last_name,
      second_profile_phone: camper.second_profile_phone,
      emergency_contact_name: camper.emergency_contact_name,
      emergency_contact_phone: camper.emergency_contact_phone,
      vehicle_make: camper.vehicle_make,
      vehicle_model: camper.vehicle_model,
      license_plate: camper.license_plate,
      vehicle_2_make: camper.vehicle_2_make,
      vehicle_2_model: camper.vehicle_2_model,
      vehicle_2_license_plate: camper.vehicle_2_license_plate,
      golf_cart_make: camper.golf_cart_make,
      golf_cart_color: camper.golf_cart_color,
    }

    const { error } = await supabase
      .from('campers')
      .update({
        ...profileUpdates,
        directory_opt_in: Boolean(camper.directory_opt_in),
        directory_show_phone: Boolean(
          camper.directory_opt_in && camper.directory_show_phone
        ),
      })
      .eq('id', camper.id)

    if (error && /directory_(opt_in|show_phone)/i.test(error.message)) {
      const { error: fallbackError } = await supabase
        .from('campers')
        .update(profileUpdates)
        .eq('id', camper.id)

      setMessage(
        fallbackError
          ? fallbackError.message
          : 'Profile saved. Directory preferences will be available after setup is complete.'
      )
    } else if (error) {
      setMessage(error.message)
    } else {
      setMessage('✅ Profile Updated Successfully')
    }

    setSaving(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function uploadGolfCartInsurance() {
    if (!insuranceFile) {
      setInsuranceMessage('Choose your golf cart insurance file first.')
      return
    }

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    if (!token) {
      window.location.href = '/login'
      return
    }

    setUploadingInsurance(true)
    setInsuranceMessage('Uploading your golf cart insurance…')

    const formData = new FormData()
    formData.append('file', insuranceFile)

    try {
      const response = await fetch('/api/upload-golf-cart-insurance', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        setInsuranceMessage(result.error || 'Unable to upload your insurance.')
        return
      }

      setInsuranceFile(null)
      setInsuranceDocuments((current) => [result.document, ...current])
      setInsuranceMessage('✅ Golf cart insurance uploaded successfully.')
    } catch {
      setInsuranceMessage('Unable to upload your insurance. Please try again.')
    } finally {
      setUploadingInsurance(false)
    }
  }

  async function openInsuranceDocument(documentId: string) {
    router.push(`/documents/view/${documentId}`)
  }

  if (loading) {
    return (
      <div style={{ padding: '40px' }}>
        Loading Profile...
      </div>
    )
  }

  if (!camper) {
    return (
      <div style={{ padding: '40px' }}>
        Unable to load profile.
      </div>
    )
  }

  const profileChecklist = [
    { label: 'Phone number', complete: Boolean(camper.phone) },
    { label: 'Second profile optional', complete: Boolean(camper.second_profile_first_name || camper.secondary_email) },
    { label: 'Emergency contact', complete: Boolean(camper.emergency_contact_name && camper.emergency_contact_phone) },
    { label: 'Vehicle information', complete: Boolean(camper.vehicle_make && camper.vehicle_model && camper.license_plate) },
    { label: 'Directory choice', complete: camper.directory_opt_in !== null && camper.directory_opt_in !== undefined },
    { label: 'Golf cart insurance', complete: insuranceDocuments.length > 0 },
  ]
  const completeItems = profileChecklist.filter((item) => item.complete).length
  const completionPercent = Math.round((completeItems / profileChecklist.length) * 100)

  return (
    <main className="page">
      <div className="container">

        <section
          className="card"
          style={{
            marginBottom: '25px',
            background:
              'linear-gradient(135deg,#ffffff 0%,#eef4ea 100%)',
          }}
        >
          <p className="muted">BUR OAKS CAMPGROUND</p>

          <h1>
            👤 {camper.first_name} {camper.last_name}
          </h1>

          <h2 style={{ color: '#2f5d3a' }}>
            Lot {camper.lot_number}
          </h2>

          <p className="muted">
            Manage your camper information.
          </p>
        </section>

        <section className="card camper-profile-checkup" style={{ marginBottom: '25px' }}>
          <div className="camper-profile-checkup-heading">
            <span><ClipboardCheck size={22} /></span>
            <div>
              <small>PROFILE CHECKUP</small>
              <h2>{completionPercent}% complete</h2>
              <p className="muted">Complete information helps the office contact you quickly and keeps campground records launch-ready.</p>
            </div>
          </div>
          <div className="camper-profile-checklist">
            {profileChecklist.map((item) => (
              <span className={item.complete ? 'done' : ''} key={item.label}>
                {item.complete ? <CheckCircle2 size={16} /> : <i />}
                {item.label}
              </span>
            ))}
          </div>
        </section>

        <section className="card directory-preferences" style={{ marginBottom: '25px' }}>
          <div className="directory-preferences-heading">
            <span><UsersRound size={22} /></span>
            <div>
              <h2>Camper Directory</h2>
              <p className="muted">
                You are private by default. Choose whether other signed-in campers can find you.
              </p>
            </div>
          </div>

          <label className="privacy-toggle">
            <input
              type="checkbox"
              checked={Boolean(camper.directory_opt_in)}
              onChange={(event) =>
                setCamper({
                  ...camper,
                  directory_opt_in: event.target.checked,
                  directory_show_phone: event.target.checked
                    ? Boolean(camper.directory_show_phone)
                    : false,
                })
              }
            />
            <span>
              <strong>List me in the camper directory</strong>
              <small>Shares your name and lot number with signed-in campers.</small>
            </span>
          </label>

          <label className={`privacy-toggle secondary ${!camper.directory_opt_in ? 'disabled' : ''}`}>
            <input
              type="checkbox"
              checked={Boolean(camper.directory_show_phone)}
              disabled={!camper.directory_opt_in}
              onChange={(event) =>
                setCamper({ ...camper, directory_show_phone: event.target.checked })
              }
            />
            <span>
              <strong>Also share my phone number</strong>
              <small>Your email, vehicles, and emergency contacts are never shown.</small>
            </span>
          </label>

          <div className="directory-safety-note">
            <ShieldCheck size={16} /> You can change these choices at any time.
          </div>

          <div style={{ marginTop: '16px' }}>
            <button onClick={saveProfile} disabled={saving}>
              {saving ? 'Saving…' : 'Save Directory Preferences'}
            </button>
            {message && <p style={{ marginBottom: 0 }}>{message}</p>}
          </div>
        </section>

        <section className="card" style={{ marginBottom: '25px' }}>
          <h2>Profile 1 Information</h2>
          <p style={{ marginTop: '-4px', color: '#66736a' }}>
            Primary camper/signature profile for this site.
          </p>

          <input
            placeholder="First Name"
            value={camper.first_name || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                first_name: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Last Name"
            value={camper.last_name || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                last_name: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Phone Number"
            value={camper.phone || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                phone: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            value={camper.email || ''}
            disabled
            style={{
              width: '100%',
              marginBottom: '12px',
              background: '#f3f4f6',
            }}
          />

          <input
            value={camper.lot_number || ''}
            disabled
            style={{
              width: '100%',
              marginBottom: '12px',
              background: '#f3f4f6',
            }}
          />
        </section>

        <section className="card" style={{ marginBottom: '25px' }}>
          <h2>Profile 2 Information</h2>
          <p style={{ marginTop: '-4px', color: '#66736a' }}>
            Optional second camper/signature profile. This helps when two people need to sign leases for the same site.
          </p>

          <input
            placeholder="Second profile first name"
            value={camper.second_profile_first_name || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                second_profile_first_name: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Second profile last name"
            value={camper.second_profile_last_name || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                second_profile_last_name: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Second profile phone"
            value={camper.second_profile_phone || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                second_profile_phone: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            value={camper.secondary_email || 'Second portal email not added yet'}
            disabled
            style={{
              width: '100%',
              marginBottom: '12px',
              background: '#f3f4f6',
            }}
          />

        </section>

        <section className="card" style={{ marginBottom: '25px' }}>
          <h2>Emergency Contact</h2>

          <input
            placeholder="Emergency Contact Name"
            value={camper.emergency_contact_name || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                emergency_contact_name: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Emergency Contact Phone"
            value={camper.emergency_contact_phone || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                emergency_contact_phone: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />
        </section>

        <section className="card" style={{ marginBottom: '25px' }}>
          <h2>Vehicle Information</h2>
          <p style={{ marginTop: '-4px', color: '#66736a' }}>
            Add the main vehicle and an optional second vehicle for the site.
          </p>

          <input
            placeholder="Vehicle 1 Make"
            value={camper.vehicle_make || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                vehicle_make: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Vehicle 1 Model"
            value={camper.vehicle_model || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                vehicle_model: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Vehicle 1 License Plate"
            value={camper.license_plate || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                license_plate: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Vehicle 2 Make"
            value={camper.vehicle_2_make || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                vehicle_2_make: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Vehicle 2 Model"
            value={camper.vehicle_2_model || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                vehicle_2_model: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Vehicle 2 License Plate"
            value={camper.vehicle_2_license_plate || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                vehicle_2_license_plate: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />
        </section>

        <section className="card" style={{ marginBottom: '25px' }}>
          <h2>Golf Cart Information</h2>

          <input
            placeholder="Golf Cart Make"
            value={camper.golf_cart_make || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                golf_cart_make: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Golf Cart Color"
            value={camper.golf_cart_color || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                golf_cart_color: e.target.value,
              })
            }
            style={{ width: '100%', marginBottom: '12px' }}
          />

          <div className="camper-insurance-upload-box">
            <div>
              <span><ShieldCheck size={18} /> Golf cart insurance</span>
              <p>
                Upload your current golf cart insurance card or proof of coverage.
                PDF, Word, or photo files are accepted.
              </p>
            </div>

            <label className="camper-insurance-upload-button">
              <FileUp size={18} />
              <span>{insuranceFile ? insuranceFile.name : 'Choose insurance file'}</span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.heic,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                onChange={(event) => setInsuranceFile(event.target.files?.[0] || null)}
              />
            </label>

            <button type="button" onClick={uploadGolfCartInsurance} disabled={uploadingInsurance || !insuranceFile}>
              {uploadingInsurance ? 'Uploading…' : 'Upload Golf Cart Insurance'}
            </button>

            {insuranceMessage && <p className="camper-insurance-message">{insuranceMessage}</p>}

            <div className="camper-insurance-list">
              {insuranceDocuments.length === 0 ? (
                <small>No golf cart insurance is on file yet.</small>
              ) : (
                insuranceDocuments.map((document) => (
                  <button key={document.id} type="button" onClick={() => openInsuranceDocument(document.id)}>
                    <Eye size={15} />
                    <span>{document.document_name}</span>
                    <em>{document.created_at ? new Date(document.created_at).toLocaleDateString() : 'Saved'}</em>
                  </button>
                ))
              )}
            </div>
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>

          {message && (
            <p style={{ marginTop: '15px' }}>
              {message}
            </p>
          )}
        </section>

        <section className="card">
          <h2>Account Actions</h2>

          <button
            onClick={handleSignOut}
            style={{
              background: '#cc0000',
              color: 'white',
            }}
          >
            Sign Out
          </button>
        </section>

      </div>
    </main>
  )
}
