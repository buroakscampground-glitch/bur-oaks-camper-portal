'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

export default function AdminCampersPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [lotNumber, setLotNumber] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [invitingEmail, setInvitingEmail] = useState<string | null>(null)
  const [setupLink, setSetupLink] = useState('')
  const [portalStatuses, setPortalStatuses] = useState<Record<string, 'pending' | 'accepted'>>({})
  const [search, setSearch] = useState('')
  const router = useRouter()
  async function loadCampers() {
    const { data } = await supabase
      .from('campers')
      .select('*')
      .eq('active', true)
      .order('lot_number', { ascending: true })

    setCampers(data || [])
  }

  async function loadPortalStatuses() {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return

    const response = await fetch('/api/portal-account-status', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    if (!response.ok) return
    const result = await response.json()
    setPortalStatuses(result.statuses || {})
  }

  useEffect(() => {
    loadCampers()
    loadPortalStatuses()

    const statusTimer = window.setInterval(loadPortalStatuses, 30_000)
    return () => window.clearInterval(statusTimer)
  }, [])

  function clearForm() {
    setLotNumber('')
    setFirstName('')
    setLastName('')
    setEmail('')
    setPhone('')
    setEditingId(null)
  }

  async function saveCamper() {
    if (editingId) {
      const { error } = await supabase
        .from('campers')
        .update({
          lot_number: lotNumber,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
        })
        .eq('id', editingId)

      if (error) {
        setMessage(error.message)
        return
      }

      setMessage('Camper updated!')
    } else {
      const { error } = await supabase
        .from('campers')
        .insert({
          lot_number: lotNumber,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          active: true,
        })

      if (error) {
        setMessage(error.message)
        return
      }

      setMessage('Camper added!')
    }

    clearForm()
    loadCampers()
  }

  function editCamper(camper: any) {
    router.push(`/admin/campers/${camper.id}`)
  }

  async function archiveCamper(id: string) {
    const confirmArchive = confirm(
      'Are you sure you want to archive this camper?'
    )

    if (!confirmArchive) return

    const { error } = await supabase
      .from('campers')
      .update({ active: false })
      .eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

    setMessage('Camper archived!')
    loadCampers()
  }

  async function createPortalAccount(email: string) {
    if (!email || email.endsWith('@no-email.buroaks.local')) {
      setMessage('Add the camper’s real email before creating a portal account.')
      return
    }

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    if (!token) {
      setMessage('Please sign in again before sending an invitation.')
      return
    }

    setInvitingEmail(email)
    setSetupLink('')
    setMessage(`Sending portal invitation to ${email}…`)

    try {
      const response = await fetch(
        '/api/create-camper-account',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ email }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setMessage(result.error || 'Failed to create account')
        return
      }

      if (result.delivery === 'manual' && result.setupUrl) {
        setSetupLink(result.setupUrl)
        setMessage(`Email sending is temporarily limited. A secure one-time setup link is ready for ${email}.`)
      } else {
        setMessage(`Portal invite sent to ${email}. Ask them to check their inbox and spam folder.`)
      }
      loadPortalStatuses()
    } catch {
      setMessage('The invitation could not be sent. Please try again.')
    } finally {
      setInvitingEmail(null)
    }
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'Arial' }}>
      
<button
  onClick={() => router.push('/admin')}
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
  ← Back to Dashboard
</button>
      <h1>Manage Campers</h1>

      <h2 id="camper-editor">
        {editingId
          ? 'Edit Camper'
          : 'Add Camper'}
      </h2>

      <input
        placeholder="Lot Number"
        value={lotNumber}
        onChange={(e) =>
          setLotNumber(e.target.value)
        }
      />

      <input
        placeholder="First Name"
        value={firstName}
        onChange={(e) =>
          setFirstName(e.target.value)
        }
      />

      <input
        placeholder="Last Name"
        value={lastName}
        onChange={(e) =>
          setLastName(e.target.value)
        }
      />

      <input
        placeholder="Email"
        value={email}
        onChange={(e) =>
          setEmail(e.target.value)
        }
      />

      <input
        placeholder="Phone"
        value={phone}
        onChange={(e) =>
          setPhone(e.target.value)
        }
      />

      <button onClick={saveCamper}>
        {editingId
          ? 'Update Camper'
          : 'Add Camper'}
      </button>

      {editingId && (
        <button onClick={clearForm}>
          Cancel Edit
        </button>
      )}

      {message && <p className="admin-camper-message" role="status" aria-live="polite">{message}</p>}
      {setupLink && (
        <div className="admin-camper-setup-link">
          <div>
            <strong>One-time portal setup link</strong>
            <span>Copy this link and send it privately to Dawn. Do not open it from your admin account.</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(setupLink)
              setMessage('Secure setup link copied. Send it privately to Dawn Finley.')
            }}
          >
            Copy Setup Link
          </button>
        </div>
      )}

      <h2>Current Campers</h2>
<input
  placeholder="Search by lot, name, or email..."
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  style={{
    marginBottom: '15px',
    padding: '8px',
    width: '300px',
  }}
/>
      {campers
  .filter((camper) => {
    const searchText = search.toLowerCase()

    return (
      camper.lot_number
        ?.toString()
        .toLowerCase()
        .includes(searchText) ||
      camper.first_name
        ?.toLowerCase()
        .includes(searchText) ||
      camper.last_name
        ?.toLowerCase()
        .includes(searchText) ||
      camper.email
        ?.toLowerCase()
        .includes(searchText)
    )
  })
  .map((camper) => (
        <div
  key={camper.id}
  style={{
    marginBottom: '12px',
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    cursor: 'pointer',
  }}
  onClick={() =>
    router.push(`/admin/campers/${camper.id}`)
  }
>
          <div>
  <div className="admin-camper-name-row">
    <strong>
      Lot {camper.lot_number} - {camper.first_name} {camper.last_name}
    </strong>
    {camper.email?.endsWith('@no-email.buroaks.local') ? (
      <span className="portal-account-status none">Not Set Up</span>
    ) : portalStatuses[camper.email?.toLowerCase()] === 'accepted' ? (
      <span className="portal-account-status accepted">Accepted</span>
    ) : portalStatuses[camper.email?.toLowerCase()] === 'pending' ? (
      <span className="portal-account-status pending">Invite Pending</span>
    ) : (
      <span className="portal-account-status none">Not Set Up</span>
    )}
  </div>

  <div>
    {camper.email?.endsWith('@no-email.buroaks.local')
      ? 'Email not added'
      : camper.email}
  </div>

  <div>{camper.phone || 'No phone on file'}</div>
</div>

          <br />

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              editCamper(camper)
            }}
          >
            Edit
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              archiveCamper(camper.id)
            }}
          >
            Archive
          </button>

          {!camper.email?.endsWith('@no-email.buroaks.local') && (
            <button
              type="button"
              disabled={invitingEmail === camper.email}
              onClick={(event) => {
                event.stopPropagation()
                createPortalAccount(camper.email)
              }}
            >
              {invitingEmail === camper.email ? 'Sending Invite…' : 'Create Portal Account'}
            </button>
          )}
        </div>
      ))}
    </main>
  )
}
