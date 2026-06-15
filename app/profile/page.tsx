'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

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

    const { error } = await supabase
      .from('campers')
      .update({
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
      })
      .eq('id', camper.id)

    if (error) {
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