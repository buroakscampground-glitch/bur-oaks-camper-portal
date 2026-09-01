'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, CreditCard, Droplets, Gauge, Mail, MessageSquareText, Save, ShieldCheck, SprayCan } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { calculateCardProcessingFee, cardProcessingFeeSettings, loadPaymentFeeSettings } from '../../../lib/payment-fees'
import {
  campgroundSettingKeys,
  defaultCampgroundBillingSettings,
  loadCampgroundBillingSettings,
} from '../../../lib/campground-settings'

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
  const [electricRate, setElectricRate] = useState(String(defaultCampgroundBillingSettings.electricDefaultRate))
  const [waterTrashFees, setWaterTrashFees] = useState(defaultCampgroundBillingSettings.waterTrashFees.join(', '))
  const [sewerPumpOutFee, setSewerPumpOutFee] = useState(String(defaultCampgroundBillingSettings.sewerPumpOutFee))
  const [siteServiceAmounts, setSiteServiceAmounts] = useState<Record<string, string>>(
    Object.fromEntries(defaultCampgroundBillingSettings.siteServices.map((service) => [service.type, String(service.amount)]))
  )

  useEffect(() => {
    async function loadSettings() {
      const [paymentSettings, billingSettings] = await Promise.all([
        loadPaymentFeeSettings(supabase),
        loadCampgroundBillingSettings(supabase),
      ])
      setPercent(String(paymentSettings.percent))
      setFlatCents(String(paymentSettings.flatCents))
      setElectricRate(String(billingSettings.electricDefaultRate))
      setWaterTrashFees(billingSettings.waterTrashFees.join(', '))
      setSewerPumpOutFee(String(billingSettings.sewerPumpOutFee))
      setSiteServiceAmounts(Object.fromEntries(billingSettings.siteServices.map((service) => [service.type, String(service.amount)])))
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

  function serviceSettingKey(type: string) {
    if (type === 'full_weed_eat') return campgroundSettingKeys.siteServiceFullWeedEat
    if (type === 'half_weed_eat') return campgroundSettingKeys.siteServiceHalfWeedEat
    if (type === 'spray_weeds') return campgroundSettingKeys.siteServiceSprayWeeds
    if (type === 'half_spray_weeds') return campgroundSettingKeys.siteServiceHalfSprayWeeds
    if (type === 'trash_pickup') return campgroundSettingKeys.siteServiceTrashPickup
    return campgroundSettingKeys.siteServicePressureWash
  }

  async function saveBillingSettings() {
    setMessage('')

    const electricRateValue = Number(electricRate)
    const sewerPumpOutValue = Number(sewerPumpOutFee)
    const waterTrashValues = waterTrashFees
      .split(',')
      .map((fee) => Number(fee.trim()))
      .filter((fee) => Number.isFinite(fee) && fee >= 0)

    if (!Number.isFinite(electricRateValue) || electricRateValue <= 0) {
      setMessage('Enter a valid electric rate.')
      return
    }

    if (!waterTrashValues.length) {
      setMessage('Enter at least one water/trash fee option, like 20, 25.')
      return
    }

    if (!Number.isFinite(sewerPumpOutValue) || sewerPumpOutValue < 0) {
      setMessage('Enter a valid sewer pump-out fee.')
      return
    }

    const serviceRows = []
    for (const service of defaultCampgroundBillingSettings.siteServices) {
      const amount = Number(siteServiceAmounts[service.type])
      if (!Number.isFinite(amount) || amount < 0) {
        setMessage(`Enter a valid amount for ${service.label}.`)
        return
      }
      serviceRows.push({
        key: serviceSettingKey(service.type),
        value: String(amount),
        description: `Default charge for ${service.label.toLowerCase()}.`,
      })
    }

    setSaving(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const updatedAt = new Date().toISOString()
    const rows = [
      {
        key: campgroundSettingKeys.electricDefaultRate,
        value: String(electricRateValue),
        description: 'Default electric billing rate per kWh.',
      },
      {
        key: campgroundSettingKeys.waterTrashFees,
        value: waterTrashValues.join(','),
        description: 'Comma-separated water/trash fee options shown on electric billing.',
      },
      {
        key: campgroundSettingKeys.sewerPumpOutFee,
        value: String(sewerPumpOutValue),
        description: 'Default sewer pump-out charge added to the next electric bill.',
      },
      ...serviceRows,
    ].map((row) => ({ ...row, updated_at: updatedAt, updated_by: user?.email || null }))

    const { error } = await supabase.from('app_settings').upsert(rows)

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Saved billing defaults. New electric bills and site charges will use these amounts.')
  }

  function updateServiceAmount(type: string, value: string) {
    setSiteServiceAmounts((current) => ({ ...current, [type]: value }))
  }

  return (
    <main className="admin-settings-page">
      <section className="admin-settings-hero">
        <a href="/admin"><ArrowLeft size={17} /> Back to Dashboard</a>
        <span><ShieldCheck size={16} /> Campground settings</span>
        <h1>Payment settings without the headache.</h1>
        <p>Adjust the card checkout fee campers see before Stripe checkout. This only applies to online card payments, not cash, check, or office-posted payments.</p>
      </section>

      {message && <p className="admin-settings-message admin-settings-global-message">{message}</p>}

      <section className="admin-settings-grid">
        <article className="admin-settings-card">
          <div className="admin-settings-heading">
            <span><CreditCard size={22} /></span>
            <div>
              <small>ONLINE CARD PAYMENTS</small>
              <h2>Card processing fee</h2>
              <p>This is passed through only at Stripe checkout. The invoice balance stays clean, and the card total shows the fee separately.</p>
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
            If Stripe changes pricing, update the percentage and cents here. Campers will see the card-only fee before they pay online.
          </p>
        </aside>
      </section>

      <section className="admin-settings-grid admin-settings-wide-grid">
        <article className="admin-settings-card">
          <div className="admin-settings-heading">
            <span><Gauge size={22} /></span>
            <div>
              <small>MONTHLY BILLING DEFAULTS</small>
              <h2>Electric, water/trash, and pump-outs</h2>
              <p>These are the default amounts used when you create electric bills or campers request pump-outs.</p>
            </div>
          </div>

          {loading ? (
            <p className="admin-settings-message">Loading settings…</p>
          ) : (
            <>
              <div className="admin-settings-form">
                <label>
                  <span>Default electric rate per kWh</span>
                  <input type="number" min="0" step="0.01" value={electricRate} onChange={(event) => setElectricRate(event.target.value)} />
                  <small>Example: 0.23 means 23¢ per kWh.</small>
                </label>

                <label>
                  <span>Water/trash fee choices</span>
                  <input value={waterTrashFees} onChange={(event) => setWaterTrashFees(event.target.value)} placeholder="20, 25" />
                  <small>Separate choices with commas, like 20, 25.</small>
                </label>

                <label>
                  <span>Sewer pump-out fee</span>
                  <input type="number" min="0" step="0.01" value={sewerPumpOutFee} onChange={(event) => setSewerPumpOutFee(event.target.value)} />
                  <small>Used when a camper hits the pump-out request button.</small>
                </label>
              </div>

              <button type="button" onClick={saveBillingSettings} disabled={saving}>
                <Save size={17} /> {saving ? 'Saving…' : 'Save billing defaults'}
              </button>
            </>
          )}
        </article>

        <article className="admin-settings-card">
          <div className="admin-settings-heading">
            <span><SprayCan size={22} /></span>
            <div>
              <small>SITE SERVICE PRICES</small>
              <h2>Weed eating, spraying, and pressure washing</h2>
              <p>These prices appear on the site-service charge page. Misc charges can still be entered by hand.</p>
            </div>
          </div>

          <div className="admin-settings-service-list">
            {defaultCampgroundBillingSettings.siteServices.map((service) => (
              <label key={service.type}>
                <span>{service.label}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={siteServiceAmounts[service.type] || ''}
                  onChange={(event) => updateServiceAmount(service.type, event.target.value)}
                />
              </label>
            ))}
          </div>

          <button type="button" onClick={saveBillingSettings} disabled={saving}>
            <Save size={17} /> {saving ? 'Saving…' : 'Save service prices'}
          </button>
        </article>
      </section>

      <section className="admin-settings-link-grid">
        <a href="/admin/texts">
          <MessageSquareText size={22} />
          <span><small>TEXT ALERTS</small><strong>Manage camper texting</strong><em>Opt-ins, urgent alerts, and message history</em></span>
        </a>
        <a href="/admin/email-test">
          <Mail size={22} />
          <span><small>EMAIL HEALTH</small><strong>Test email alerts</strong><em>Resend setup and delivery checks</em></span>
        </a>
        <a href="/admin/electric">
          <Droplets size={22} />
          <span><small>BILLING FLOW</small><strong>Create electric bills</strong><em>Uses the defaults saved above</em></span>
        </a>
      </section>
    </main>
  )
}
