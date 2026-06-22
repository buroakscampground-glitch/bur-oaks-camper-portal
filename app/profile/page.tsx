'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { ShieldCheck, UsersRound } from 'lucide-react'

export default function ProfilePage() {
  const [camper, setCamper] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

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
      .eq('email', user.email)
      .single()

    setCamper(data)
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
      emergency_contact_name: camper.emergency_contact_name,
      emergency_contact_phone: camper.emergency_contact_phone,
      vehicle_make: camper.vehicle_make,
      vehicle_model: camper.vehicle_model,
      license_plate: camper.license_plate,
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
          <h2>Profile Information</h2>

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

          <input
            placeholder="Vehicle Make"
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
            placeholder="Vehicle Model"
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
            placeholder="License Plate"
            value={camper.license_plate || ''}
            onChange={(e) =>
              setCamper({
                ...camper,
                license_plate: e.target.value,
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
