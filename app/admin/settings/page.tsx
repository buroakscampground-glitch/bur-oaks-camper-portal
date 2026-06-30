'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, CreditCard, Save, ShieldCheck } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { calculateCardProcessingFee, cardProcessingFeeSettings, loadPaymentFeeSettings } from '../../../lib/payment-fees'

function formatMoney(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

export default function AdminSettingsPage() {
  const fallback = cardProcessingFeeSettings()
  const [percent, setPercent] = useState(String(fallback.percent))
  const [flatCents, setFlatCents] = useState(String(fallback.flatCents))
  const [previewAmount, setPreviewAmount] = useState('500')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadSettings() {
      const settings = await loadPaymentFeeSettings(supabase)
      setPercent(String(settings.percent))
      setFlatCents(String(settings.flatCents))
      setLoading(false)
    }

    loadSettings()
  }, [])

  const feeSettings = {
    percent: Number(percent || 0),
    flatCents: Number(flatCents || 0),
    label: 'Card processing fee',
  }
  const amount = Number(previewAmount || 0)
  const processingFee = calculateCardProcessingFee(amount, feeSettings)
  const total = amount + processingFee

  async function saveSettings() {
    setMessage('')

    const percentValue = Number(percent)
    const flatCentsValue = Number(flatCents)

    if (!Number.isFinite(percentValue) || percentValue < 0) {
      setMessage('Enter a valid percentage fee.')
      return
    }

    if (!Number.isFinite(flatCentsValue) || flatCentsValue < 0) {
      setMessage('Enter a valid flat cents fee.')
      return
    }

    setSaving(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const updatedAt = new Date().toISOString()
    const { error } = await supabase.from('app_settings').upsert([
      {
        key: 'card_processing_fee_percent',
        value: String(percentValue),
        description: 'Card processing fee percentage charged to online card payments.',
        updated_at: updatedAt,
        updated_by: user?.email || null,
      },
      {
        key: 'card_processing_fee_flat_cents',
        value: String(Math.round(flatCentsValue)),
        description: 'Flat card processing fee in cents charged to online card payments.',
        updated_at: updatedAt,
        updated_by: user?.email || null,
      },
    ])

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(`Saved. New card fee is ${percentValue}% + ${Math.round(flatCentsValue)}¢.`)
  }

  return (
    <main className="admin-settings-page">
      <section className="admin-settings-hero">
        <a href="/admin"><ArrowLeft size={17} /> Back to Dashboard</a>
        <span><ShieldCheck size={16} /> Campground settings</span>
        <h1>Payment settings without the headache.</h1>
        <p>Adjust the card processing fee campers see before Stripe checkout. Changes apply to new checkout attempts immediately after saving.</p>
      </section>

      <section className="admin-settings-grid">
        <article className="admin-settings-card">
          <div className="admin-settings-heading">
            <span><CreditCard size={22} /></span>
            <div>
              <small>ONLINE CARD PAYMENTS</small>
              <h2>Card processing fee</h2>
              <p>This is passed through at checkout. The invoice balance stays clean, and the card total shows the fee separately.</p>
            </div>
          </div>

          {loading ? (
            <p className="admin-settings-message">Loading settings…</p>
          ) : (
            <>
              <div className="admin-settings-form">
                <label>
                  <span>Percent fee</span>
                  <input type="number" min="0" step="0.01" value={percent} onChange={(event) => setPercent(event.target.value)} />
                  <small>Example: 3 means 3%</small>
                </label>

                <label>
                  <span>Flat fee in cents</span>
                  <input type="number" min="0" step="1" value={flatCents} onChange={(event) => setFlatCents(event.target.value)} />
                  <small>Example: 30 means 30¢</small>
                </label>

                <label>
                  <span>Preview invoice amount</span>
                  <input type="number" min="0" step="0.01" value={previewAmount} onChange={(event) => setPreviewAmount(event.target.value)} />
                  <small>Use this to test what campers will see.</small>
                </label>
              </div>

              <div className="admin-settings-preview">
                <p><span>Invoice balance</span><strong>{formatMoney(amount)}</strong></p>
                <p><span>Processing fee</span><strong>{formatMoney(processingFee)}</strong></p>
                <p><span>Card pay total</span><strong>{formatMoney(total)}</strong></p>
              </div>

              <button type="button" onClick={saveSettings} disabled={saving}>
                <Save size={17} /> {saving ? 'Saving…' : 'Save processing fee'}
              </button>

              {message && <p className="admin-settings-message">{message}</p>}
            </>
          )}
        </article>

        <aside className="admin-settings-note">
          <h2>How this works</h2>
          <p>
            The portal uses a gross-up calculation so the processing fee covers the fee charged on the fee.
            That is why a $500 invoice at 3% + 30¢ is a little more than $15.30.
          </p>
          <p>
            If Stripe changes pricing, update the percentage and cents here. Campers will see the new fee before they pay.
          </p>
        </aside>
      </section>
    </main>
  )
}
