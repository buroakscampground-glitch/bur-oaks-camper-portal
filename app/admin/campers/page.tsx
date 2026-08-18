'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { isSystemPortalAccount } from '../../../lib/camper-records'

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
  const [bulkConfirmMode, setBulkConfirmMode] = useState<'new_batch' | 'resend_pending' | null>(null)
  const [search, setSearch] = useState('')
  const [portalFilter, setPortalFilter] = useState<'accepted' | 'pending' | 'none'>('accepted')
  const router = useRouter()
  async function loadCampers() {
    const { data } = await supabase
      .from('campers')
      .select('*')
      .eq('active', true)
      .order('lot_number', { ascending: true })

    const activeCampers = (data || []).filter((camper) => !isSystemPortalAccount(camper))
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

  function cleanEmail(value: unknown) {
    return String(value || '').trim().toLowerCase()
  }

  function getPortalStatus(camper: any) {
    const primaryStatus = portalStatuses[cleanEmail(camper.email)]
    const secondaryStatus = portalStatuses[cleanEmail(camper.secondary_email)]

    if (primaryStatus === 'accepted' || secondaryStatus === 'accepted') return 'accepted'
    if (primaryStatus === 'pending' || secondaryStatus === 'pending') return 'pending'
    return 'none'
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
      setMessage('Please sign in again before creating a fresh setup link.')
      return
    }

    setInvitingEmail(email)
    setSetupLink('')
    setMessage(`Creating a fresh password reset link for ${email}…`)

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
        setMessage(`A fresh one-time password reset link is ready for ${email}. Copy it below and send it privately.`)
      } else if (result.delivery === 'email-service') {
        setMessage(`Fresh password reset email sent from Bur Oaks to ${email}. Ask them to use the newest email and check junk/spam if needed.`)
      } else {
        setMessage(`Fresh password reset email sent to ${email}. Ask them to use the newest email and check junk/spam.`)
      }
      loadPortalStatuses()
    } catch {
      setMessage('The fresh password reset link could not be sent. Please try again.')
    } finally {
      setInvitingEmail(null)
    }
  }

  async function sendBulkPortalInvites(
    mode: 'new_batch' | 'resend_pending' = 'new_batch',
    confirmed = false
  ) {
    const resendingPending = mode === 'resend_pending'
    if (!confirmed) {
      setBulkConfirmMode(mode)
      return
    }

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    if (!token) {
      setMessage('Please sign in again before sending bulk setup links.')
      return
    }

    setBulkSending(true)
    setBulkConfirmMode(null)
    setSetupLink('')
    setMessage(resendingPending
      ? 'Resending fresh 24-hour setup emails to Invite Pending campers…'
      : 'Sending the next batch of fresh portal setup emails…')

    try {
      const response = await fetch('/api/bulk-portal-invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ batchSize: 50, mode }),
      })

      const result = await response.json()

      if (!response.ok) {
        setMessage(result.error || 'Unable to send bulk portal setup links.')
        return
      }

      const sentCount = result.sent?.length || 0
      const failedCount = result.failed?.length || 0
      const remaining = result.remaining || 0

      if (sentCount === 0 && failedCount === 0) {
        setMessage('No unsent portal setup links are waiting right now. Accepted accounts and recently emailed campers were skipped automatically.')
      } else {
        setMessage(`${resendingPending ? 'Resent' : 'Sent'} ${sentCount} fresh 24-hour setup link${sentCount === 1 ? '' : 's'}. ${failedCount ? `${failedCount} failed. ` : ''}${remaining} still waiting for a future batch.`)
      }

      loadPortalStatuses()
    } catch {
      setMessage('Bulk setup links could not be sent. Please try again.')
    } finally {
      setBulkSending(false)
    }
  }

  const portalGroups = {
    accepted: campers.filter((camper) => getPortalStatus(camper) === 'accepted'),
    pending: campers.filter((camper) => getPortalStatus(camper) === 'pending'),
    none: campers.filter((camper) => getPortalStatus(camper) === 'none'),
  }

  const visibleCampers = portalGroups[portalFilter].filter((camper) => {
    const searchText = search.trim().toLowerCase()
    if (!searchText) return true

    return [
      camper.lot_number,
      camper.first_name,
      camper.last_name,
      camper.email,
      camper.secondary_email,
    ].some((value) => String(value || '').toLowerCase().includes(searchText))
  })

  const portalFilterLabels = {
    accepted: 'Accepted',
    pending: 'Invite Pending',
    none: 'Not Set Up',
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
          <strong>Bulk portal setup links</strong>
        <span>
          Send fresh password setup emails in batches of 50. Accepted accounts and campers emailed recently are skipped automatically.
          {' '}Campers accepted: {portalGroups.accepted.length} · Pending: {portalGroups.pending.length} · Not set up: {portalGroups.none.length}
        </span>
        </div>
        <button type="button" onClick={() => sendBulkPortalInvites('new_batch')} disabled={bulkSending}>
          {bulkSending ? 'Sending Batch…' : 'Send Next Batch of Fresh Setup Links'}
        </button>
        <button type="button" onClick={() => sendBulkPortalInvites('resend_pending')} disabled={bulkSending || portalGroups.pending.length === 0}>
          {bulkSending ? 'Sending…' : `Resend ${portalGroups.pending.length} Invite Pending`}
        </button>
        {bulkConfirmMode && !bulkSending && (
          <div style={{ width: '100%', padding: '14px', borderRadius: '12px', background: '#fff3d6', border: '1px solid #d8b96f' }}>
            <strong>Confirm email send</strong>
            <p style={{ margin: '8px 0 12px' }}>
              {bulkConfirmMode === 'resend_pending'
                ? `Send a fresh 24-hour setup email to all ${portalGroups.pending.length} campers marked Invite Pending? Accepted accounts and campers who were never invited will be skipped.`
                : 'Send the next batch of fresh setup emails? Accepted accounts and campers emailed recently will be skipped.'}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <button type="button" onClick={() => sendBulkPortalInvites(bulkConfirmMode, true)}>
                {bulkConfirmMode === 'resend_pending'
                  ? `Confirm and Send ${portalGroups.pending.length}`
                  : 'Confirm and Send Batch'}
              </button>
              <button type="button" onClick={() => setBulkConfirmMode(null)}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      <section className="admin-portal-rollout" aria-labelledby="portal-rollout-title">
        <div className="admin-portal-rollout-heading">
          <div>
            <span>Portal rollout tracker</span>
            <h2 id="portal-rollout-title">Who is set up?</h2>
            <p>Choose a status to see the campers in that group. Counts update automatically as setup links are accepted.</p>
          </div>
          <strong>{campers.length} active campers</strong>
        </div>

        <div className="admin-portal-rollout-tabs" role="tablist" aria-label="Portal setup status">
          {(['accepted', 'pending', 'none'] as const).map((status) => (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={portalFilter === status}
              className={`${status} ${portalFilter === status ? 'active' : ''}`}
              onClick={() => {
                setPortalFilter(status)
                setSearch('')
              }}
            >
              <span>{portalFilterLabels[status]}</span>
              <strong>{portalGroups[status].length}</strong>
              <small>
                {status === 'accepted'
                  ? 'Portal completed'
                  : status === 'pending'
                    ? 'Link sent, waiting'
                    : 'Ready for a setup link'}
              </small>
            </button>
          ))}
        </div>
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
            <strong>Fresh one-time password reset link</strong>
            <span>This is the newest link. Copy it and send it privately if the email did not arrive. Do not open it from your admin account.</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(setupLink)
              setMessage('Fresh setup link copied. Send it privately to the camper.')
            }}
          >
            Copy Fresh Reset Link
          </button>
        </div>
      )}

      <div className="admin-portal-list-heading">
        <div>
          <span>Showing portal status</span>
          <h2>{portalFilterLabels[portalFilter]}</h2>
        </div>
        <strong>{visibleCampers.length} camper{visibleCampers.length === 1 ? '' : 's'}</strong>
      </div>
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
      {visibleCampers
  .map((camper) => (
    (() => {
      const health = camperHealth[camper.id] || {}
      const portalStatus = getPortalStatus(camper)
      const needsAttention =
        health.openInvoices ||
        health.unsignedDocs ||
        health.activeMaintenance ||
        health.activePumpOuts ||
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
    ) : portalStatus === 'accepted' ? (
      <span className="portal-account-status accepted">Accepted</span>
    ) : portalStatus === 'pending' ? (
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
    <span className={portalStatus === 'accepted' ? 'good' : 'warn'}>
      Portal {portalStatus === 'accepted' ? 'accepted' : 'not accepted'}
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
    <span className={health.insuranceOnFile ? 'good' : 'info'}>
      {health.insuranceOnFile ? 'Insurance filed' : 'Insurance optional'}
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
              {invitingEmail === camper.email ? 'Sending Reset Link…' : 'Reset Password / Send Fresh Link'}
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
              {invitingEmail === camper.secondary_email ? 'Sending Reset Link…' : 'Reset Password for Second Email'}
            </button>
          )}
        </div>
      )
    })()
  ))}
    </main>
  )
}
