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

    const { data: camperData, error } = await supabase
      .from('campers')
      .select('*')
      .eq('email', user.email)
      .single()

    if (error) {
      console.error(error)
      setLoading(false)
      return
    }

    setCamper(camperData)
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
      })
      .eq('id', camper.id)

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Profile updated successfully.')
    }

    setSaving(false)
  }

  async function handleSignOut() {
    try {
      await supabase.auth.signOut()
      await fetch('/api/auth/logout', {
        method: 'POST',
      })
    } catch (err) {
      console.error(err)
    }

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
        Unable to load camper profile.
      </div>
    )
  }

  return (
    <main className="page">
      <div className="container">
        <section className="card">
          <h1>My Profile</h1>
          <p className="muted">
            Update your camper information below.
          </p>
        </section>

        <section
          className="card"
          style={{ marginTop: '20px' }}
        >
          <h2>Profile Information</h2>

          <div style={{ marginBottom: '15px' }}>
            <label>First Name</label>
            <input
              type="text"
              value={camper.first_name || ''}
              onChange={(e) =>
                setCamper({
                  ...camper,
                  first_name: e.target.value,
                })
              }
              style={{
                width: '100%',
                padding: '10px',
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label>Last Name</label>
            <input
              type="text"
              value={camper.last_name || ''}
              onChange={(e) =>
                setCamper({
                  ...camper,
                  last_name: e.target.value,
                })
              }
              style={{
                width: '100%',
                padding: '10px',
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label>Phone Number</label>
            <input
              type="text"
              value={camper.phone || ''}
              onChange={(e) =>
                setCamper({
                  ...camper,
                  phone: e.target.value,
                })
              }
              style={{
                width: '100%',
                padding: '10px',
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label>Email Address</label>
            <input
              type="text"
              value={camper.email || ''}
              disabled
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#f3f3f3',
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label>Lot Number</label>
            <input
              type="text"
              value={camper.lot_number || ''}
              disabled
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#f3f3f3',
              }}
            />
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
          >
            {saving
              ? 'Saving...'
              : 'Save Profile'}
          </button>

          {message && (
            <p style={{ marginTop: '15px' }}>
              {message}
            </p>
          )}
        </section>

        <section
          className="card"
          style={{ marginTop: '20px' }}
        >
          <button onClick={handleSignOut}>
            Sign Out
          </button>
        </section>
      </div>
    </main>
  )
}