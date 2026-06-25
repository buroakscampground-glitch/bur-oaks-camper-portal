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
  const [secondaryEmail, setSecondaryEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [invitingEmail, setInvitingEmail] = useState<string | null>(null)
  const [setupLink, setSetupLink] = useState('')
  const [portalStatuses, setPortalStatuses] = useState<Record<string, 'pending' | 'accepted'>>({})
  const [camperHealth, setCamperHealth] = useState<Record<string, any>>({})
  const [bulkSending, setBulkSending] = useState(false)
  const [search, setSearch] = useState('')
  const router = useRouter()
  async function loadCampers() {
    const { data } = await supabase
      .from('campers')
      .select('*')
      .eq('active', true)
      .order('lot_number', { ascending: true })

    const activeCampers = data || []
    setCampers(activeCampers)
    loadCamperHealth(activeCampers)
  }

  async function loadCamperHealth(activeCampers: any[]) {
    const camperIds = activeCampers.map((camper) => camper.id)
    const lotNumbers = activeCampers.map((camper) => String(camper.lot_number || '')).filter(Boolean)

    if (!camperIds.length) {
      setCamperHealth({})
      return
    }

    const [invoiceResult, documentResult, maintenanceResult, insuranceResult, pumpOutResult] = await Promise.all([
      supabase.from('invoices').select('camper_id,total_due,status').in('camper_id', camperIds),
      supabase.from('documents').select('camper_id,signature_status').in('camper_id', camperIds),
      supabase.from('maintenance_tickets').select('lot_number,status,admin_approved').in('lot_number', lotNumbers),
      supabase.from('documents').select('camper_id,document_type').in('camper_id', camperIds).eq('document_type', 'Golf Cart Insurance'),
      supabase.from('sewer_pump_out_requests').select('camper_id,status,billed_at').in('camper_id', camperIds),
    ])

    const health: Record<string, any> = {}
    const insuranceIds = new Set((insuranceResult.data || []).map((doc) => String(doc.camper_id)))

    activeCampers.forEach((camper) => {
      const camperInvoices = (invoiceResult.data || []).filter((invoice) => invoice.camper_id === camper.id)
      const openInvoices = camperInvoices.filter((invoice) => invoice.status !== 'paid')
      const unsignedDocs = (documentResult.data || []).filter((doc) => {
        const status = String(doc.signature_status || '').toLowerCase()
        return doc.camper_id === camper.id && status !== 'signed' && status !== 'not_required'
      })
      const activeMaintenance = (maintenanceResult.data || []).filter((ticket) =>
        String(ticket.lot_number || '') === String(camper.lot_number || '') &&
        ticket.admin_approved === true &&
        ticket.status !== 'Completed'
      )
      const activePumpOuts = (pumpOutResult.data || []).filter((request) =>
        request.camper_id === camper.id &&
        request.status !== 'cancelled' &&
        !request.billed_at
      )

      health[camper.id] = {
        openBalance: openInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0),
        openInvoices: openInvoices.length,
        unsignedDocs: unsignedDocs.length,
        activeMaintenance: activeMaintenance.length,
        activePumpOuts: activePumpOuts.length,
        insuranceOnFile: insuranceIds.has(String(camper.id)),
      }
    })

    setCamperHealth(health)
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
    setSecondaryEmail('')
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
          secondary_email: secondaryEmail.trim() ? secondaryEmail.trim().toLowerCase() : null,
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
          secondary_email: secondaryEmail.trim() ? secondaryEmail.trim().toLowerCase() : null,
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

  async function createPortalAccount(camper: any, targetEmail?: string) {
    const email = String(targetEmail || camper.email || '').trim().toLowerCase()

    if (!email || email.endsWith('@no-email.buroaks.local')) {
      setMessage('Add a real email before creating a portal account.')
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
          body: JSON.stringify({ camperId: camper.id, email }),
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
      } else if (result.delivery === 'email-service') {
        setMessage(`Portal invite sent from Bur Oaks to ${email}.`)
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

  async function sendBulkPortalInvites() {
    const confirmed = window.confirm(
      'Send the next batch of portal invite emails to campers who have not accepted and were not emailed recently?'
    )

    if (!confirmed) return

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    if (!token) {
      setMessage('Please sign in again before sending bulk invites.')
      return
    }

    setBulkSending(true)
    setSetupLink('')
    setMessage('Sending the next batch of portal invite emails…')

    try {
      const response = await fetch('/api/bulk-portal-invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ batchSize: 50 }),
      })

      const result = await response.json()

      if (!response.ok) {
        setMessage(result.error || 'Unable to send bulk portal invites.')
        return
      }

      const sentCount = result.sent?.length || 0
      const failedCount = result.failed?.length || 0
      const remaining = result.remaining || 0

      if (sentCount === 0 && failedCount === 0) {
        setMessage('No unsent portal invites are waiting right now. Accepted accounts and recently emailed campers were skipped.')
      } else {
        setMessage(`Sent ${sentCount} portal invite${sentCount === 1 ? '' : 's'}. ${failedCount ? `${failedCount} failed. ` : ''}${remaining} still waiting for a future batch.`)
      }

      loadPortalStatuses()
    } catch {
      setMessage('Bulk invites could not be sent. Please try again.')
    } finally {
      setBulkSending(false)
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

      <section className="admin-camper-bulk-invites">
        <div>
          <strong>Bulk portal invitations</strong>
        <span>
          Send password setup emails in batches of 50. Accepted accounts and campers emailed recently are skipped automatically.
          {' '}Accepted: {Object.values(portalStatuses).filter((status) => status === 'accepted').length} · Pending: {Object.values(portalStatuses).filter((status) => status === 'pending').length}
        </span>
        </div>
        <button type="button" onClick={sendBulkPortalInvites} disabled={bulkSending}>
          {bulkSending ? 'Sending Batch…' : 'Send Next Batch of Portal Invites'}
        </button>
      </section>

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
        placeholder="Second Email (optional)"
        value={secondaryEmail}
        onChange={(e) =>
          setSecondaryEmail(e.target.value)
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
            <span>Copy this link and send it privately to the camper. Do not open it from your admin account.</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(setupLink)
              setMessage('Secure setup link copied. Send it privately to the camper.')
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
        .includes(searchText) ||
      camper.secondary_email
        ?.toLowerCase()
        .includes(searchText)
    )
  })
  .map((camper) => (
    (() => {
      const health = camperHealth[camper.id] || {}
      const needsAttention =
        health.openInvoices ||
        health.unsignedDocs ||
        health.activeMaintenance ||
        health.activePumpOuts ||
        !health.insuranceOnFile ||
        !camper.phone

      return (
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

  {camper.secondary_email && (
    <div>Second email: {camper.secondary_email}</div>
  )}

  <div>{camper.phone || 'No phone on file'}</div>

  <div className="admin-camper-health-strip">
    <span className={portalStatuses[camper.email?.toLowerCase()] === 'accepted' ? 'good' : 'warn'}>
      Portal {portalStatuses[camper.email?.toLowerCase()] === 'accepted' ? 'accepted' : 'not accepted'}
    </span>
    <span className={health.openInvoices ? 'warn' : 'good'}>
      {health.openInvoices ? `$${Number(health.openBalance || 0).toFixed(2)} open` : 'Balance clear'}
    </span>
    <span className={health.unsignedDocs ? 'warn' : 'good'}>
      {health.unsignedDocs ? `${health.unsignedDocs} unsigned` : 'Docs clear'}
    </span>
    <span className={health.activePumpOuts ? 'warn' : 'good'}>
      {health.activePumpOuts ? `${health.activePumpOuts} pump-out` : 'No pump-out'}
    </span>
    <span className={health.insuranceOnFile ? 'good' : 'warn'}>
      {health.insuranceOnFile ? 'Insurance filed' : 'Insurance missing'}
    </span>
    <span className={needsAttention ? 'warn' : 'good'}>
      {needsAttention ? 'Needs review' : 'Healthy'}
    </span>
  </div>
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
                createPortalAccount(camper, camper.email)
              }}
            >
              {invitingEmail === camper.email ? 'Sending Invite…' : 'Invite Primary Email'}
            </button>
          )}
          {camper.secondary_email && (
            <button
              type="button"
              disabled={invitingEmail === camper.secondary_email}
              onClick={(event) => {
                event.stopPropagation()
                createPortalAccount(camper, camper.secondary_email)
              }}
            >
              {invitingEmail === camper.secondary_email ? 'Sending Invite…' : 'Invite Second Email'}
            </button>
          )}
        </div>
      )
    })()
  ))}
    </main>
  )
}
