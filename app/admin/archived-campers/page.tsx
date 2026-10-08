'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { isUnbilledPumpOutWork } from '../../../lib/pump-out-status'
import { isInvoiceOutstanding } from '../../../lib/invoice-balance'
import { setCamperActiveAudited } from '../../../lib/admin-audited-actions'

export default function ArchivedCampersPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [billingStatus, setBillingStatus] = useState<Record<string, { openInvoices: number; balance: number; unbilledPumpOuts: number }>>({})
  const [message, setMessage] = useState('')
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [loadError, setLoadError] = useState('')
  const router = useRouter()

  useEffect(() => {
    checkAdmin()
  }, [])

  async function checkAdmin() {
    setLoadError('')
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError

      if (!user) {
        window.location.href = '/login'
        return
      }

      const { data: camper, error: roleError } = await supabase
        .from('campers')
        .select('role')
        .or(`email.ilike.${user.email?.trim().toLowerCase()},secondary_email.ilike.${user.email?.trim().toLowerCase()}`)
        .single()
      if (roleError) throw roleError

      if (!camper || camper.role?.toLowerCase() !== 'admin') {
        window.location.href = '/portal'
        return
      }

      await loadCampers()
    } catch {
      setLoadError('The camper archive or its billing status could not be loaded. Restore controls are blocked.')
    } finally {
      setCheckingAuth(false)
    }
  }

  async function loadCampers() {
    const { data, error } = await supabase
      .from('campers')
      .select('*')
      .eq('active', false)
      .order('lot_number', { ascending: true })
    if (error) throw error

    const archivedCampers = data || []
    setCampers(archivedCampers)

    const camperIds = archivedCampers.map((camper) => camper.id)
    if (!camperIds.length) {
      setBillingStatus({})
      return
    }

    const [invoiceResult, pumpOutResult] = await Promise.all([
      supabase.from('invoices').select('camper_id,status,total_due').in('camper_id', camperIds),
      supabase.from('sewer_pump_out_requests').select('camper_id,status,billed_at').in('camper_id', camperIds),
    ])
    if (invoiceResult.error || pumpOutResult.error) throw invoiceResult.error || pumpOutResult.error

    const nextStatus: Record<string, { openInvoices: number; balance: number; unbilledPumpOuts: number }> = {}
    for (const camper of archivedCampers) {
      const openInvoices = (invoiceResult.data || []).filter((invoice) =>
        invoice.camper_id === camper.id && isInvoiceOutstanding(invoice)
      )
      const unbilledPumpOuts = (pumpOutResult.data || []).filter((pumpOut) =>
        pumpOut.camper_id === camper.id && isUnbilledPumpOutWork(pumpOut)
      )
      nextStatus[camper.id] = {
        openInvoices: openInvoices.length,
        balance: openInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0),
        unbilledPumpOuts: unbilledPumpOuts.length,
      }
    }
    setBillingStatus(nextStatus)
  }

  async function restoreCamper(id: string) {
    const reason = window.prompt('Why is this camper being restored? This reason becomes part of the permanent campsite history.', '')?.trim() || ''
    if (reason.length < 5) { setMessage('Enter a clear restore reason before changing this camper.'); return }
    try {
      await setCamperActiveAudited(id, true, reason)
    } catch (error: any) {
      setMessage(error.message || 'The camper could not be restored.')
      return
    }

    setMessage('Camper restored!')
    loadCampers()
  }

  if (checkingAuth) {
    return (
      <main className="portal-loading"><Loader2 className="spin" /><h1>Loading camper archive…</h1></main>
    )
  }

  if (loadError) return <main className="portal-loading" role="alert"><AlertTriangle aria-hidden="true" /><h1>Camper archive is temporarily unavailable</h1><p>{loadError}</p><button className="portal-loading-retry" type="button" onClick={() => { setCheckingAuth(true); checkAdmin() }}>Try again</button></main>

  return (
    <main style={{ padding: '40px' }}>
      <a
  href="/admin"
  style={{
    display: 'inline-block',
    marginBottom: '20px',
    textDecoration: 'none',
    fontWeight: 'bold',
  }}
>
  ← Back to Dashboard
</a>
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
      <h1>Archived & Final Billing</h1>
      <p>Portal access is closed for everyone on this page. Final Billing means the office still has an unpaid invoice or an unbilled charge to finish.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', margin: '18px 0' }}>
        <a href="/admin/pump-outs" style={{ padding: '10px 14px', borderRadius: '10px', background: '#315f3d', color: '#fff', textDecoration: 'none', fontWeight: 800 }}>Add final pump-out</a>
        <a href="/admin/electric" style={{ padding: '10px 14px', borderRadius: '10px', background: '#315f3d', color: '#fff', textDecoration: 'none', fontWeight: 800 }}>Create final electric invoice</a>
      </div>

      {message && <p>{message}</p>}

      {campers.length === 0 && (
        <p>No archived campers found.</p>
      )}

      <div style={{ display: 'grid', gap: '12px', maxWidth: '900px' }}>
        {campers.map((camper) => {
          const billing = billingStatus[camper.id]
          const finalBilling = Boolean(billing && (billing.openInvoices > 0 || billing.unbilledPumpOuts > 0))

          return (
            <article key={camper.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '15px', padding: '16px', border: '1px solid #d9ddd5', borderRadius: '15px', background: '#fff' }}>
              <div>
                <span style={{ display: 'inline-block', marginBottom: '6px', padding: '5px 8px', borderRadius: '999px', background: finalBilling ? '#f7ead0' : '#e8ece9', color: finalBilling ? '#805d20' : '#59675e', fontSize: '10px', fontWeight: 900 }}>
                  {finalBilling ? 'FINAL BILLING' : 'ARCHIVED'}
                </span>
                <strong style={{ display: 'block' }}>Lot {camper.lot_number || '—'} · {camper.first_name} {camper.last_name}</strong>
                {finalBilling && <small style={{ display: 'block', marginTop: '5px', color: '#6b756e' }}>{billing.openInvoices} open invoice{billing.openInvoices === 1 ? '' : 's'} · ${billing.balance.toFixed(2)} due · {billing.unbilledPumpOuts} unbilled pump-out{billing.unbilledPumpOuts === 1 ? '' : 's'}</small>}
              </div>
              <button onClick={() => restoreCamper(camper.id)}>Restore Camper</button>
            </article>
          )
        })}
      </div>
    </main>
  )
}
