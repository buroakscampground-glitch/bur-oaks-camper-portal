'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleDollarSign, Search, Undo2, WalletCards, XCircle } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { formatCreditMoney } from '../../../lib/account-credits'

function camperName(camper: any) {
  return `${camper?.first_name || ''} ${camper?.last_name || ''}`.trim() || 'Camper'
}

function formatDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function AdminCreditsPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [credits, setCredits] = useState<any[]>([])
  const [applications, setApplications] = useState<any[]>([])
  const [camperId, setCamperId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('Overpayment credit')
  const [notes, setNotes] = useState('')
  const [filter, setFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingId, setSavingId] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [camperResult, creditResult, applicationResult] = await Promise.all([
      supabase.from('campers').select('id,first_name,last_name,lot_number,email,active,role').eq('active', true).order('lot_number'),
      supabase.from('account_credits').select('*').order('created_at', { ascending: false }),
      supabase.from('account_credit_applications').select('*, invoices(invoice_number)').order('applied_at', { ascending: false }).limit(200),
    ])

    if (camperResult.error) setMessage(camperResult.error.message)
    if (creditResult.error) setMessage(creditResult.error.message)
    if (applicationResult.error && !['42P01', 'PGRST205'].includes(applicationResult.error.code || '')) {
      setMessage(applicationResult.error.message)
    }

    setCampers((camperResult.data || []).filter((camper) => !['admin', 'maintenance'].includes(String(camper.role || 'camper').toLowerCase())))
    setCredits(creditResult.data || [])
    setApplications(applicationResult.data || [])
  }

  async function addCredit() {
    setMessage('')
    const selectedCamper = campers.find((camper) => camper.id === camperId)
    const creditAmount = Number(amount)

    if (!selectedCamper) return setMessage('Choose a camper first.')
    if (!Number.isFinite(creditAmount) || creditAmount <= 0) return setMessage('Enter a valid credit amount.')
    if (!reason.trim()) return setMessage('Enter a reason for the credit.')

    setSaving(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase.from('account_credits').insert({
      camper_id: selectedCamper.id,
      lot_number: selectedCamper.lot_number || null,
      camper_name: camperName(selectedCamper),
      original_amount: creditAmount,
      remaining_amount: creditAmount,
      reason: reason.trim(),
      notes: notes.trim() || null,
      created_by: user?.email || null,
    })

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(`${formatCreditMoney(creditAmount)} credit added for Lot ${selectedCamper.lot_number || '—'}.`)
    setAmount('')
    setNotes('')
    await loadData()
  }

  async function voidCredit(credit: any) {
    const confirmed = window.confirm(`Void the remaining ${formatCreditMoney(credit.remaining_amount)} credit for ${credit.camper_name}?`)
    if (!confirmed) return

    setSavingId(credit.id)
    const { error } = await supabase
      .from('account_credits')
      .update({
        status: 'voided',
        remaining_amount: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', credit.id)

    setSavingId('')
    setMessage(error ? error.message : 'Credit voided.')
    if (!error) loadData()
  }

  const activeCredits = credits.filter((credit) => credit.status === 'active' && Number(credit.remaining_amount || 0) > 0)
  const usedCredits = credits.filter((credit) => credit.status === 'used' || Number(credit.remaining_amount || 0) <= 0)
  const totalActiveCredit = activeCredits.reduce((sum, credit) => sum + Number(credit.remaining_amount || 0), 0)

  const visibleCredits = useMemo(() => {
    const term = search.trim().toLowerCase()
    return credits.filter((credit) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'active' ? credit.status === 'active' && Number(credit.remaining_amount || 0) > 0 : credit.status === filter)
      const matchesSearch =
        !term ||
        `${credit.camper_name || ''} ${credit.lot_number || ''} ${credit.reason || ''} ${credit.notes || ''}`
          .toLowerCase()
          .includes(term)

      return matchesFilter && matchesSearch
    })
  }, [credits, filter, search])

  const selectedCamper = campers.find((camper) => camper.id === camperId)

  return (
    <main className="admin-credits-page">
      <section className="admin-credits-hero">
        <a href="/admin">← Back to dashboard</a>
        <span><WalletCards size={17} /> ACCOUNT CREDITS</span>
        <h1>Track overpayments and office credits.</h1>
        <p>Add a credit when someone overpays, you make an adjustment, or you work something out. Future invoices automatically use available credits first.</p>
      </section>

      <section className="admin-credit-stats">
        <article><small>Active credits</small><strong>{activeCredits.length}</strong></article>
        <article><small>Credit balance</small><strong>{formatCreditMoney(totalActiveCredit)}</strong></article>
        <article><small>Used credits</small><strong>{usedCredits.length}</strong></article>
      </section>

      <section className="admin-credit-form">
        <div>
          <span><CircleDollarSign size={16} /> Add credit</span>
          <h2>Create account credit</h2>
          <p>This does not charge the camper. It reduces future bills until the credit is used up.</p>
        </div>

        <label>
          <span>Camper / lot</span>
          <select value={camperId} onChange={(event) => setCamperId(event.target.value)}>
            <option value="">Select camper</option>
            {campers.map((camper) => (
              <option key={camper.id} value={camper.id}>
                Lot {camper.lot_number || '—'} · {camperName(camper)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Credit amount</span>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
        </label>

        <label>
          <span>Reason</span>
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Overpayment credit" />
        </label>

        <label className="admin-credit-notes">
          <span>Notes</span>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional office note" />
        </label>

        <button type="button" onClick={addCredit} disabled={saving}>
          <CheckCircle2 size={16} /> {saving ? 'Adding…' : `Add credit${selectedCamper ? ` for Lot ${selectedCamper.lot_number || '—'}` : ''}`}
        </button>
      </section>

      <section className="admin-credit-toolbar">
        <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lot, camper, reason, or note" /></label>
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="active">Active credits</option>
          <option value="used">Used</option>
          <option value="voided">Voided</option>
          <option value="all">All</option>
        </select>
      </section>

      <section className="admin-credit-list">
        {visibleCredits.map((credit) => {
          const creditApplications = applications.filter((application) => application.credit_id === credit.id)
          const remaining = Number(credit.remaining_amount || 0)
          const isActive = credit.status === 'active' && remaining > 0

          return (
            <article className={credit.status} key={credit.id}>
              <span>{isActive ? 'Active' : credit.status}</span>
              <div>
                <small>Lot {credit.lot_number || 'N/A'} · Added {formatDate(credit.created_at)}</small>
                <h2>{credit.camper_name}</h2>
                <p>{credit.reason}{credit.notes ? ` · ${credit.notes}` : ''}</p>
                {creditApplications.length > 0 && (
                  <em>
                    Applied to {creditApplications.length} invoice{creditApplications.length === 1 ? '' : 's'}.
                  </em>
                )}
              </div>
              <div className="admin-credit-amount">
                <strong>{formatCreditMoney(remaining)}</strong>
                <small>remaining of {formatCreditMoney(credit.original_amount)}</small>
              </div>
              <div className="admin-credit-actions">
                {isActive && (
                  <button className="danger" type="button" onClick={() => voidCredit(credit)} disabled={savingId === credit.id}>
                    <XCircle size={15} /> Void
                  </button>
                )}
              </div>
            </article>
          )
        })}

        {visibleCredits.length === 0 && (
          <div className="admin-credit-empty">
            <Undo2 size={34} />
            <h2>No credits found</h2>
            <p>Credits you add for campers will appear here.</p>
          </div>
        )}
      </section>

      {message && <p className="admin-credit-message">{message}</p>}
    </main>
  )
}
