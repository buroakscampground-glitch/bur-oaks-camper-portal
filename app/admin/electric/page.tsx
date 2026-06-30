'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { attemptAutoPay } from '../../../lib/autopay'
import { applyAvailableCreditsToInvoice, formatCreditMoney } from '../../../lib/account-credits'
import { invoiceTextSummary, notifyInvoiceCreated } from '../../../lib/client-invoice-texts'
import { defaultCampgroundBillingSettings, loadCampgroundBillingSettings } from '../../../lib/campground-settings'

export default function AdminElectricPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [readings, setReadings] = useState<any[]>([])
  const [pumpOuts, setPumpOuts] = useState<any[]>([])
  const [siteServiceCharges, setSiteServiceCharges] = useState<any[]>([])
  const [accountCredits, setAccountCredits] = useState<any[]>([])
  const [camperId, setCamperId] = useState('')
  const [previousReading, setPreviousReading] = useState('')
  const [currentReading, setCurrentReading] = useState('')
  const [rate, setRate] = useState('0.23')
  const [includeSecondMeter, setIncludeSecondMeter] = useState(false)
  const [secondMeterReason, setSecondMeterReason] = useState('Meter replaced or site move')
  const [secondPreviousReading, setSecondPreviousReading] = useState('')
  const [secondCurrentReading, setSecondCurrentReading] = useState('')
  const [secondRate, setSecondRate] = useState('')
  const [readingDate, setReadingDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [includeWaterTrash, setIncludeWaterTrash] = useState(false)
  const [waterTrashFee, setWaterTrashFee] = useState('20')
  const [waterTrashFeeOptions, setWaterTrashFeeOptions] = useState(defaultCampgroundBillingSettings.waterTrashFees)
  const [newCreditAmount, setNewCreditAmount] = useState('')
  const [newCreditReason, setNewCreditReason] = useState('Electric billing credit')
  const [newCreditNotes, setNewCreditNotes] = useState('')
  const [searchText, setSearchText] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const currentReadingRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function dateInputToday() {
    const today = new Date()
    const offset = today.getTimezoneOffset()
    const localToday = new Date(today.getTime() - offset * 60 * 1000)
    return localToday.toISOString().split('T')[0]
  }

  useEffect(() => {
    loadCampers()
    loadReadings()
    loadPumpOuts()
    loadSiteServiceCharges()
    loadAccountCredits()
    loadSettings()
  }, [])

  async function loadSettings() {
    const settings = await loadCampgroundBillingSettings(supabase)
    setRate(String(settings.electricDefaultRate))
    setWaterTrashFeeOptions(settings.waterTrashFees)
    setWaterTrashFee(String(settings.waterTrashFees[0] || 0))
  }

  async function loadCampers() {
    const { data } = await supabase.from('campers').select('*').order('lot_number')
    setCampers(data || [])
  }

  async function loadReadings() {
    const { data } = await supabase
      .from('electric_readings')
      .select('*')
      .order('reading_date', { ascending: false })

    setReadings(data || [])
  }

  async function loadPumpOuts() {
    const { data } = await supabase
      .from('sewer_pump_out_requests')
      .select('*')
      .is('billed_at', null)
      .neq('status', 'cancelled')
      .order('requested_at', { ascending: true })

    setPumpOuts(data || [])
  }

  async function loadSiteServiceCharges() {
    const { data } = await supabase
      .from('site_service_charges')
      .select('*')
      .is('billed_at', null)
      .is('cancelled_at', null)
      .order('performed_at', { ascending: true })

    setSiteServiceCharges(data || [])
  }

  async function loadAccountCredits() {
    const { data } = await supabase
      .from('account_credits')
      .select('*')
      .eq('status', 'active')
      .gt('remaining_amount', 0)
      .order('created_at', { ascending: true })

    setAccountCredits(data || [])
  }

  const filteredReadings = useMemo(() => {
    const search = searchText.trim().toLowerCase()
    if (!search) return readings

    return readings.filter((reading) => {
      const camper = campers.find((c) => c.id === reading.camper_id)
      const lot = camper?.lot_number?.toString() || ''
      const name = `${camper?.first_name || ''} ${camper?.last_name || ''}`.toLowerCase()
      const readingDateText = reading.reading_date?.toString().toLowerCase() || ''

      return (
        lot.includes(search) ||
        name.includes(search) ||
        readingDateText.includes(search)
      )
    })
  }, [campers, readings, searchText])

  const totalKwh = filteredReadings.reduce((sum, reading) => sum + Number(reading.kwh_used || 0), 0)
  const totalAmountDue = filteredReadings.reduce((sum, reading) => sum + Number(reading.amount_due || 0), 0)
const averageUsage =
  filteredReadings.length > 0
    ? Math.round(totalKwh / filteredReadings.length)
    : 0
    const liveUsage =
  Number(currentReading || 0) -
  Number(previousReading || 0)

const liveAmount =
  liveUsage > 0
    ? liveUsage * Number(rate || 0)
    : 0
const liveSecondUsage =
  includeSecondMeter
    ? Number(secondCurrentReading || 0) - Number(secondPreviousReading || 0)
    : 0
const liveSecondRate = Number(secondRate || rate || 0)
const liveSecondAmount =
  includeSecondMeter && liveSecondUsage > 0
    ? liveSecondUsage * liveSecondRate
    : 0

const selectedWaterTrashFee = includeWaterTrash ? Number(waterTrashFee || 0) : 0
const selectedPumpOuts = pumpOuts.filter((request) => request.camper_id === camperId)
const pumpOutChargeTotal = selectedPumpOuts.reduce((sum, request) => sum + Number(request.charge_amount || 10), 0)
const selectedSiteServices = siteServiceCharges.filter((charge) => charge.camper_id === camperId)
const siteServiceChargeTotal = selectedSiteServices.reduce((sum, charge) => sum + Number(charge.charge_amount || 0), 0)
const selectedAccountCredits = accountCredits.filter((credit) => credit.camper_id === camperId)
const availableCreditTotal = selectedAccountCredits.reduce((sum, credit) => sum + Number(credit.remaining_amount || 0), 0)
const newCreditValue = Number(newCreditAmount || 0)
const estimatedCreditTotal =
  availableCreditTotal + (Number.isFinite(newCreditValue) && newCreditValue > 0 ? newCreditValue : 0)
const liveInvoiceTotal = liveAmount + liveSecondAmount + selectedWaterTrashFee + pumpOutChargeTotal + siteServiceChargeTotal
const liveInvoiceAfterCredits = Math.max(0, liveInvoiceTotal - estimatedCreditTotal)

  async function saveElectricAndCreateInvoice() {
    setMessage('')
    setSaving(true)

    if (!camperId || !previousReading || !currentReading || !rate || !readingDate || !dueDate) {
      setMessage('Please fill out all fields.')
      setSaving(false)
      return
    }

    const previous = Number(previousReading)
    const current = Number(currentReading)
    const rateNumber = Number(rate)
    const secondPrevious = Number(secondPreviousReading)
    const secondCurrent = Number(secondCurrentReading)
    const secondRateNumber = Number(secondRate || rate)
    const waterTrashAmount = includeWaterTrash ? Number(waterTrashFee) : 0
    const creditAmountToAdd = Number(newCreditAmount || 0)
    const kwhUsed = current - previous
    const amountDue = Number((kwhUsed * rateNumber).toFixed(2))
    const secondKwhUsed = includeSecondMeter ? secondCurrent - secondPrevious : 0
    const secondAmountDue = includeSecondMeter ? Number((secondKwhUsed * secondRateNumber).toFixed(2)) : 0

    if (!Number.isFinite(previous) || !Number.isFinite(current) || !Number.isFinite(rateNumber) || !Number.isFinite(waterTrashAmount)) {
      setMessage('Please enter valid numeric values for readings and rate.')
      setSaving(false)
      return
    }

    if (includeSecondMeter && (!secondPreviousReading || !secondCurrentReading)) {
      setMessage('Please enter both second meter readings, or turn off the second meter option.')
      setSaving(false)
      return
    }

    if (includeSecondMeter && (!Number.isFinite(secondPrevious) || !Number.isFinite(secondCurrent) || !Number.isFinite(secondRateNumber))) {
      setMessage('Please enter valid numeric values for the second meter.')
      setSaving(false)
      return
    }

    if (previous < 0 || current < 0 || rateNumber <= 0 || waterTrashAmount < 0 || (includeSecondMeter && (secondPrevious < 0 || secondCurrent < 0 || secondRateNumber <= 0))) {
      setMessage('Readings and rate must be positive values.')
      setSaving(false)
      return
    }

    if (includeWaterTrash && !waterTrashFeeOptions.includes(waterTrashAmount)) {
      setMessage('Please choose an approved water/trash fee.')
      setSaving(false)
      return
    }

    if (current <= previous) {
      setMessage('Current reading must be greater than previous reading.')
      setSaving(false)
      return
    }

    if (includeSecondMeter && secondCurrent <= secondPrevious) {
      setMessage('Second meter current reading must be greater than the second meter previous reading.')
      setSaving(false)
      return
    }

    if (newCreditAmount.trim() && (!Number.isFinite(creditAmountToAdd) || creditAmountToAdd <= 0)) {
      setMessage('Please enter a valid credit amount, or leave the credit box blank.')
      setSaving(false)
      return
    }

    if (creditAmountToAdd > 0 && !newCreditReason.trim()) {
      setMessage('Please enter a reason for the credit.')
      setSaving(false)
      return
    }

    const parsedDate = new Date(readingDate)
    if (Number.isNaN(parsedDate.getTime())) {
      setMessage('Please provide a valid reading date.')
      setSaving(false)
      return
    }

    if (parsedDate > new Date()) {
      setMessage('Meter reading date cannot be in the future. Use the invoice due date field for future due dates.')
      setSaving(false)
      return
    }

    const parsedDueDate = new Date(dueDate)
    if (Number.isNaN(parsedDueDate.getTime())) {
      setMessage('Please provide a valid invoice due date.')
      setSaving(false)
      return
    }

    const { data: existingReading, error: existingError } = await supabase
      .from('electric_readings')
      .select('id')
      .eq('camper_id', camperId)
      .eq('reading_date', readingDate)
      .limit(1)
      .maybeSingle()

    if (existingError) {
      setMessage(existingError.message)
      setSaving(false)
      return
    }

    if (existingReading) {
      setMessage('A reading already exists for this camper on the selected date.')
      setSaving(false)
      return
    }

    const { data: freshPumpOuts, error: pumpOutLookupError } = await supabase
      .from('sewer_pump_out_requests')
      .select('*')
      .eq('camper_id', camperId)
      .is('billed_at', null)
      .neq('status', 'cancelled')
      .order('requested_at', { ascending: true })

    if (pumpOutLookupError) {
      setMessage(pumpOutLookupError.message)
      setSaving(false)
      return
    }

    const activePumpOuts = freshPumpOuts || []
    const pumpOutTotal = Number(activePumpOuts.reduce((sum, request) => sum + Number(request.charge_amount || 10), 0).toFixed(2))

    const { data: freshSiteServices, error: siteServiceLookupError } = await supabase
      .from('site_service_charges')
      .select('*')
      .eq('camper_id', camperId)
      .is('billed_at', null)
      .is('cancelled_at', null)
      .order('performed_at', { ascending: true })

    if (siteServiceLookupError) {
      setMessage(siteServiceLookupError.message)
      setSaving(false)
      return
    }

    const activeSiteServices = freshSiteServices || []
    const siteServiceTotal = Number(activeSiteServices.reduce((sum, charge) => sum + Number(charge.charge_amount || 0), 0).toFixed(2))
    const totalDue = Number((amountDue + secondAmountDue + waterTrashAmount + pumpOutTotal + siteServiceTotal).toFixed(2))

    const selectedCamper = campers.find((c) => c.id === camperId)
    const invoiceNumber = `ELECTRIC-${selectedCamper?.lot_number || 'UNKNOWN'}-${Date.now()}`

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        camper_id: camperId,
        invoice_number: invoiceNumber,
        invoice_type: [
          'Electric',
          includeSecondMeter ? 'Second Meter' : '',
          includeWaterTrash ? 'Water/Trash' : '',
          pumpOutTotal > 0 ? 'Sewer Pump-Out' : '',
          siteServiceTotal > 0 ? 'Site Services' : '',
        ].filter(Boolean).join(' + '),
        subtotal: totalDue,
        late_fee: 0,
        total_due: totalDue,
        due_date: dueDate,
        status: 'sent',
      })
      .select()
      .single()

    if (invoiceError || !invoice) {
      setMessage(invoiceError?.message || 'Failed to create electric invoice.')
      setSaving(false)
      return
    }

    const invoiceItems = [
      {
        invoice_id: invoice.id,
        description: `Electric Usage - Main meter - ${kwhUsed} kWh used @ $${rateNumber.toFixed(2)}/kWh`,
        quantity: kwhUsed,
        unit_price: rateNumber,
        total: amountDue,
      },
    ]

    if (includeSecondMeter) {
      invoiceItems.push({
        invoice_id: invoice.id,
        description: `${secondMeterReason || 'Second meter'} - ${secondKwhUsed} kWh used @ $${secondRateNumber.toFixed(2)}/kWh`,
        quantity: secondKwhUsed,
        unit_price: secondRateNumber,
        total: secondAmountDue,
      })
    }

    if (includeWaterTrash) {
      invoiceItems.push({
        invoice_id: invoice.id,
        description: `Water/Trash Fee - $${waterTrashAmount.toFixed(2)}`,
        quantity: 1,
        unit_price: waterTrashAmount,
        total: waterTrashAmount,
      })
    }

    if (pumpOutTotal > 0) {
      invoiceItems.push({
        invoice_id: invoice.id,
        description: `${activePumpOuts.length} Sewer Pump-Out${activePumpOuts.length === 1 ? '' : 's'} @ $10.00 each`,
        quantity: activePumpOuts.length,
        unit_price: activePumpOuts.length ? Number((pumpOutTotal / activePumpOuts.length).toFixed(2)) : 10,
        total: pumpOutTotal,
      })
    }

    for (const charge of activeSiteServices) {
      invoiceItems.push({
        invoice_id: invoice.id,
        description: `${charge.service_label} - ${new Date(charge.performed_at).toLocaleDateString()}`,
        quantity: 1,
        unit_price: Number(charge.charge_amount || 0),
        total: Number(charge.charge_amount || 0),
      })
    }

    const { error: itemError } = await supabase.from('invoice_items').insert(invoiceItems)

    if (itemError) {
      await supabase.from('invoices').delete().eq('id', invoice.id)
      setMessage(itemError.message)
      setSaving(false)
      return
    }

    const readingRows = [
      {
        camper_id: camperId,
        reading_date: readingDate,
        previous_reading: previous,
        current_reading: current,
        kwh_used: kwhUsed,
        rate_per_kwh: rateNumber,
        amount_due: amountDue,
        invoice_id: invoice.id,
      },
    ]

    if (includeSecondMeter) {
      readingRows.push({
        camper_id: camperId,
        reading_date: readingDate,
        previous_reading: secondPrevious,
        current_reading: secondCurrent,
        kwh_used: secondKwhUsed,
        rate_per_kwh: secondRateNumber,
        amount_due: secondAmountDue,
        invoice_id: invoice.id,
      })
    }

    const { error: readingError } = await supabase.from('electric_readings').insert(readingRows)

    if (readingError) {
      await supabase.from('invoice_items').delete().eq('invoice_id', invoice.id)
      await supabase.from('invoices').delete().eq('id', invoice.id)
      setMessage(readingError.message)
      setSaving(false)
      return
    }

    if (activePumpOuts.length > 0) {
      const { error: pumpOutBillingError } = await supabase
        .from('sewer_pump_out_requests')
        .update({
          billed_invoice_id: invoice.id,
          billed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in('id', activePumpOuts.map((request) => request.id))

      if (pumpOutBillingError) {
        setMessage(`Electric invoice was created, but pump-out requests were not marked billed: ${pumpOutBillingError.message}`)
        setSaving(false)
        return
      }
    }

    if (activeSiteServices.length > 0) {
      const { error: siteServiceBillingError } = await supabase
        .from('site_service_charges')
        .update({
          billed_invoice_id: invoice.id,
          billed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in('id', activeSiteServices.map((charge) => charge.id))

      if (siteServiceBillingError) {
        setMessage(`Electric invoice was created, but site service charges were not marked billed: ${siteServiceBillingError.message}`)
        setSaving(false)
        return
      }
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (creditAmountToAdd > 0) {
      const camperName = `${selectedCamper?.first_name || ''} ${selectedCamper?.last_name || ''}`.trim() || 'Camper'
      const { error: creditInsertError } = await supabase.from('account_credits').insert({
        camper_id: camperId,
        lot_number: selectedCamper?.lot_number || null,
        camper_name: camperName,
        original_amount: Number(creditAmountToAdd.toFixed(2)),
        remaining_amount: Number(creditAmountToAdd.toFixed(2)),
        reason: newCreditReason.trim(),
        notes: newCreditNotes.trim() || null,
        created_by: user?.email || null,
      })

      if (creditInsertError) {
        setMessage(`Electric invoice was created, but the new account credit could not be added: ${creditInsertError.message}`)
        setSaving(false)
        return
      }
    }

    let creditResult = { appliedTotal: 0, remainingDue: totalDue, paidInFull: false }
    try {
      creditResult = await applyAvailableCreditsToInvoice({
        client: supabase,
        camperId,
        invoiceId: invoice.id,
        invoiceTotal: totalDue,
        appliedBy: user?.email || null,
      })
    } catch (creditError: any) {
      setMessage(`Electric invoice was created, but account credit could not be applied: ${creditError.message}`)
      setSaving(false)
      return
    }

    let resultMessage = `Electric invoice created. Main meter: ${kwhUsed} kWh × $${rateNumber.toFixed(2)} = $${amountDue.toFixed(2)}`

    if (includeSecondMeter) {
      resultMessage += ` + ${secondMeterReason || 'Second meter'}: ${secondKwhUsed} kWh × $${secondRateNumber.toFixed(2)} = $${secondAmountDue.toFixed(2)}`
    }

    if (includeWaterTrash) {
      resultMessage += ` + Water/Trash: $${waterTrashAmount.toFixed(2)}`
    }

    if (pumpOutTotal > 0) {
      resultMessage += ` + Sewer Pump-Outs: ${activePumpOuts.length} × $10.00 = $${pumpOutTotal.toFixed(2)}`
    }

    if (siteServiceTotal > 0) {
      resultMessage += ` + Site Services: ${activeSiteServices.length} charge${activeSiteServices.length === 1 ? '' : 's'} = $${siteServiceTotal.toFixed(2)}`
    }

    resultMessage += ` — Total before credit: $${totalDue.toFixed(2)}.`

    if (creditAmountToAdd > 0) {
      resultMessage += ` New credit added: ${formatCreditMoney(creditAmountToAdd)}.`
    }

    if (creditResult.appliedTotal > 0) {
      resultMessage += ` Account credit applied: ${formatCreditMoney(creditResult.appliedTotal)}.`
    }

    resultMessage += ` Remaining due: ${formatCreditMoney(creditResult.remainingDue)} by ${dueDate}.`

    if (creditResult.paidInFull) {
      resultMessage += ' Credit covered the full invoice.'
    } else {
      try {
        const autoPay = await attemptAutoPay(invoice.id)

        if (autoPay.charged) {
          resultMessage += ' — paid automatically.'
        }
      } catch (error: any) {
        resultMessage += ` — AutoPay was not completed: ${error.message}`
      }
    }

    try {
      const textResult = await notifyInvoiceCreated(invoice.id)
      resultMessage += invoiceTextSummary(textResult)
    } catch (error: any) {
      resultMessage += ` Text alert failed: ${error.message || 'unknown error'}.`
    }

    setMessage(resultMessage)
    setPreviousReading('')
    setCurrentReading('')
    setIncludeSecondMeter(false)
    setSecondMeterReason('Meter replaced or site move')
    setSecondPreviousReading('')
    setSecondCurrentReading('')
    setSecondRate('')
    setReadingDate('')
    setDueDate('')
    setIncludeWaterTrash(false)
    setWaterTrashFee('20')
    setNewCreditAmount('')
    setNewCreditReason('Electric billing credit')
    setNewCreditNotes('')
    setSearchText('')
    loadReadings()
    loadPumpOuts()
    loadSiteServiceCharges()
    loadAccountCredits()
    setSaving(false)
  }

  return (
    <main className="page">
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
      <div className="container">
        <section className="card">
          <p className="muted">BUR OAKS CAMPGROUND</p>
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
          <h1>Electric Billing</h1>
          <p className="muted">Enter meter readings and automatically create an electric invoice.</p>

          <select
  value={camperId}
  onChange={async (e) => {
	    const selectedId = e.target.value
	    setCamperId(selectedId)
	
	    if (!selectedId) return

      const today = dateInputToday()
      setReadingDate(today)
      setDueDate(today)
	
	    const { data } = await supabase
	      .from('electric_readings')
	      .select('*')
	      .eq('camper_id', selectedId)
	      .order('reading_date', { ascending: false })
	      .limit(1)
	      .maybeSingle()

    if (data) {
  setPreviousReading(
    String(data.current_reading)
  )

setTimeout(() => {
  currentReadingRef.current?.focus()
}, 100)
}
  }} style={{ display: 'block', width: '100%', marginBottom: '12px' }}>
            <option value="">Select Camper</option>
            {campers.map((camper) => (
              <option key={camper.id} value={camper.id}>
                Lot {camper.lot_number} - {camper.first_name} {camper.last_name}
              </option>
            ))}
          </select>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', marginBottom: '12px' }}>
            <label style={{ display: 'grid', gap: '6px' }}>
              <span style={{ fontWeight: 800 }}>Meter reading date</span>
              <input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} />
              <small className="muted">The date the meter was read.</small>
            </label>

            <label style={{ display: 'grid', gap: '6px' }}>
              <span style={{ fontWeight: 800 }}>Invoice due date</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              <small className="muted">This can be a future date.</small>
            </label>
          </div>

          <input placeholder="Previous Reading" value={previousReading} onChange={(e) => setPreviousReading(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }} />

          <input
  ref={currentReadingRef}
  placeholder="Current Reading" value={currentReading} onChange={(e) => setCurrentReading(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }} />
{Number(currentReading) > Number(previousReading) && (
  <section
  className="card"
  style={{
    marginBottom: '12px',
    background: '#eef4ea',
    border: '2px solid #2f5d3a',
  }}
>
    <h2>{liveUsage} kWh</h2>
    <p className="muted">Estimated Usage</p>

    <h2>
      ${liveAmount.toFixed(2)}
    </h2>
	    <p className="muted">Estimated Charge</p>

    <div style={{ display: 'grid', gap: '8px', marginTop: '12px', padding: '12px', borderRadius: '12px', background: '#fff' }}>
      <p style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', margin: 0 }}>
        <span>Electric: {liveUsage} kWh × ${Number(rate || 0).toFixed(2)}</span>
        <strong>${liveAmount.toFixed(2)}</strong>
      </p>

      {includeSecondMeter && liveSecondUsage > 0 && (
        <p style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', margin: 0 }}>
          <span>{secondMeterReason || 'Second meter'}: {liveSecondUsage} kWh × ${liveSecondRate.toFixed(2)}</span>
          <strong>${liveSecondAmount.toFixed(2)}</strong>
        </p>
      )}

      {includeWaterTrash && (
        <p style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', margin: 0 }}>
          <span>Water/Trash fee</span>
          <strong>${selectedWaterTrashFee.toFixed(2)}</strong>
        </p>
      )}

      {pumpOutChargeTotal > 0 && (
        <p style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', margin: 0 }}>
          <span>{selectedPumpOuts.length} sewer pump-out{selectedPumpOuts.length === 1 ? '' : 's'} × $10.00</span>
          <strong>${pumpOutChargeTotal.toFixed(2)}</strong>
        </p>
      )}

      {siteServiceChargeTotal > 0 && (
        <p style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', margin: 0 }}>
          <span>{selectedSiteServices.length} site service charge{selectedSiteServices.length === 1 ? '' : 's'}</span>
          <strong>${siteServiceChargeTotal.toFixed(2)}</strong>
        </p>
      )}

      {estimatedCreditTotal > 0 && (
        <p style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', margin: 0, color: '#2f5d3a' }}>
          <span>Account credit{newCreditValue > 0 ? ' including new credit' : ''}</span>
          <strong>-{formatCreditMoney(Math.min(estimatedCreditTotal, liveInvoiceTotal))}</strong>
        </p>
      )}
    </div>

    {(includeSecondMeter || includeWaterTrash || pumpOutChargeTotal > 0 || siteServiceChargeTotal > 0 || estimatedCreditTotal > 0) && (
      <>
        <h2>
          ${liveInvoiceAfterCredits.toFixed(2)}
        </h2>
        <p className="muted">
          Estimated Total After Credits
          {includeSecondMeter ? ' with second meter' : ''}
          {includeWaterTrash ? ' with Water/Trash' : ''}
          {pumpOutChargeTotal > 0 ? ` + ${selectedPumpOuts.length} sewer pump-out${selectedPumpOuts.length === 1 ? '' : 's'}` : ''}
          {siteServiceChargeTotal > 0 ? ` + ${selectedSiteServices.length} site service charge${selectedSiteServices.length === 1 ? '' : 's'}` : ''}
        </p>
      </>
    )}
  </section>
)}
          <input placeholder="Rate per kWh" value={rate} onChange={(e) => setRate(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }} />

          <section
            style={{
              marginBottom: '14px',
              padding: '16px',
              border: includeSecondMeter ? '2px solid #2f5d3a' : '1px solid #d8ded5',
              borderRadius: '14px',
              background: includeSecondMeter ? '#eef6eb' : '#f8faf7',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              <input
                checked={includeSecondMeter}
                onChange={(e) => setIncludeSecondMeter(e.target.checked)}
                style={{ marginTop: '3px' }}
                type="checkbox"
              />
              <span>
                Add a second meter reading
                <small
                  style={{
                    display: 'block',
                    marginTop: '4px',
                    color: '#6b7280',
                    fontWeight: 'normal',
                    lineHeight: 1.4,
                  }}
                >
                  Use this only if a meter was replaced, broke, or the camper moved sites during this billing period.
                </small>
              </span>
            </label>

            {includeSecondMeter && (
              <div style={{ display: 'grid', gap: '12px', marginTop: '14px' }}>
                <label style={{ display: 'grid', gap: '6px' }}>
                  <span style={{ fontWeight: 800 }}>Reason shown on invoice</span>
                  <select value={secondMeterReason} onChange={(e) => setSecondMeterReason(e.target.value)}>
                    <option>Meter replaced or site move</option>
                    <option>Old meter before replacement</option>
                    <option>New meter after replacement</option>
                    <option>Moved sites during billing period</option>
                    <option>Backup meter reading</option>
                  </select>
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                  <input
                    placeholder="Second previous reading"
                    value={secondPreviousReading}
                    onChange={(e) => setSecondPreviousReading(e.target.value)}
                  />
                  <input
                    placeholder="Second current reading"
                    value={secondCurrentReading}
                    onChange={(e) => setSecondCurrentReading(e.target.value)}
                  />
                </div>

                <input
                  placeholder={`Second meter rate, blank uses $${Number(rate || 0).toFixed(2)}`}
                  value={secondRate}
                  onChange={(e) => setSecondRate(e.target.value)}
                />

                {liveSecondUsage > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '12px', borderRadius: '12px', background: '#ffffff' }}>
                    <span>{liveSecondUsage} kWh second meter charge</span>
                    <strong>${liveSecondAmount.toFixed(2)}</strong>
                  </div>
                )}
              </div>
            )}
          </section>

          <section
            style={{
              marginBottom: '14px',
              padding: '16px',
              border: includeWaterTrash ? '2px solid #2f5d3a' : '1px solid #d8ded5',
              borderRadius: '14px',
              background: includeWaterTrash ? '#eef6eb' : '#f8faf7',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              <input
                checked={includeWaterTrash}
                onChange={(e) => setIncludeWaterTrash(e.target.checked)}
                style={{ marginTop: '3px' }}
                type="checkbox"
              />
              <span>
                Add water/trash fee to this electric bill
                <small
                  style={{
                    display: 'block',
                    marginTop: '4px',
                    color: '#6b7280',
                    fontWeight: 'normal',
                    lineHeight: 1.4,
                  }}
                >
                  Use this when electric and water/trash billing go out together.
                </small>
              </span>
            </label>

            {includeWaterTrash && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '10px',
                  marginTop: '14px',
                }}
              >
                {waterTrashFeeOptions.map((fee) => (
                  <label
                    key={fee}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px',
                      border: waterTrashFee === String(fee) ? '2px solid #2f5d3a' : '1px solid #d8ded5',
                      borderRadius: '12px',
                      background: waterTrashFee === String(fee) ? '#ffffff' : '#f3f5f1',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      checked={waterTrashFee === String(fee)}
                      onChange={() => setWaterTrashFee(String(fee))}
                      type="radio"
                    />
                    <strong>${fee} water/trash</strong>
                  </label>
                ))}
              </div>
            )}
          </section>

          {camperId && (
            <section
              style={{
                marginBottom: '14px',
                padding: '16px',
                border: pumpOutChargeTotal > 0 ? '2px solid #9f1d1d' : '1px solid #d8ded5',
                borderRadius: '14px',
                background: pumpOutChargeTotal > 0 ? '#fff3ef' : '#f8faf7',
              }}
            >
              <strong>Sewer pump-out charges</strong>
              <p className="muted" style={{ marginBottom: 0 }}>
                {pumpOutChargeTotal > 0
                  ? `${selectedPumpOuts.length} unbilled pump-out request${selectedPumpOuts.length === 1 ? '' : 's'} will be added automatically: $${pumpOutChargeTotal.toFixed(2)}.`
                  : 'No unbilled sewer pump-outs for this camper.'}
              </p>
            </section>
          )}

          {camperId && (
            <section
              style={{
                marginBottom: '14px',
                padding: '16px',
                border: siteServiceChargeTotal > 0 ? '2px solid #b97721' : '1px solid #d8ded5',
                borderRadius: '14px',
                background: siteServiceChargeTotal > 0 ? '#fff8e8' : '#f8faf7',
              }}
            >
              <strong>Site service charges</strong>
              <p className="muted" style={{ marginBottom: siteServiceChargeTotal > 0 ? '10px' : 0 }}>
                {siteServiceChargeTotal > 0
                  ? `${selectedSiteServices.length} unbilled site service charge${selectedSiteServices.length === 1 ? '' : 's'} will be added automatically: $${siteServiceChargeTotal.toFixed(2)}.`
                  : 'No unbilled weed eating, spraying, or pressure washing charges for this camper.'}
              </p>
              {siteServiceChargeTotal > 0 && (
                <div style={{ display: 'grid', gap: '6px' }}>
                  {selectedSiteServices.map((charge) => (
                    <p key={charge.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', margin: 0, fontSize: '13px' }}>
                      <span>{charge.service_label}</span>
                      <strong>${Number(charge.charge_amount || 0).toFixed(2)}</strong>
                    </p>
                  ))}
                </div>
              )}
            </section>
          )}

          {camperId && (
            <section
              style={{
                marginBottom: '14px',
                padding: '16px',
                border: estimatedCreditTotal > 0 ? '2px solid #2f5d3a' : '1px solid #d8ded5',
                borderRadius: '14px',
                background: estimatedCreditTotal > 0 ? '#eef6eb' : '#f8faf7',
              }}
            >
              <strong>Account credits for this electric bill</strong>
              <p className="muted" style={{ marginBottom: '12px' }}>
                Existing credits apply automatically. You can also add a one-time credit here before creating this electric invoice.
              </p>

              {availableCreditTotal > 0 && (
                <div style={{ marginBottom: '12px', padding: '12px', borderRadius: '12px', background: '#fff' }}>
                  <p style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', margin: 0 }}>
                    <span>Existing available credit</span>
                    <strong>{formatCreditMoney(availableCreditTotal)}</strong>
                  </p>
                </div>
              )}

              <div style={{ display: 'grid', gap: '10px' }}>
                <input
                  placeholder="Add new credit amount, optional"
                  value={newCreditAmount}
                  onChange={(e) => setNewCreditAmount(e.target.value)}
                  inputMode="decimal"
                />

                <select value={newCreditReason} onChange={(e) => setNewCreditReason(e.target.value)}>
                  <option>Electric billing credit</option>
                  <option>Maintenance credit</option>
                  <option>Overpayment credit</option>
                  <option>Billing adjustment</option>
                  <option>Courtesy credit</option>
                  <option>Manual correction</option>
                </select>

                <textarea
                  placeholder="Credit notes, optional"
                  value={newCreditNotes}
                  onChange={(e) => setNewCreditNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {estimatedCreditTotal > 0 && (
                <div style={{ display: 'grid', gap: '6px', marginTop: '12px', padding: '12px', borderRadius: '12px', background: '#fff' }}>
                  <p style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', margin: 0 }}>
                    <span>Estimated invoice before credits</span>
                    <strong>${liveInvoiceTotal.toFixed(2)}</strong>
                  </p>
                  <p style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', margin: 0, color: '#2f5d3a' }}>
                    <span>Estimated credit applied</span>
                    <strong>-{formatCreditMoney(Math.min(estimatedCreditTotal, liveInvoiceTotal))}</strong>
                  </p>
                  <p style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', margin: 0 }}>
                    <span>Estimated amount camper will owe</span>
                    <strong>{formatCreditMoney(liveInvoiceAfterCredits)}</strong>
                  </p>
                </div>
              )}
            </section>
          )}

          <button onClick={saveElectricAndCreateInvoice} disabled={saving}>
            {saving ? 'Saving…' : includeWaterTrash ? 'Save Reading + Create Combined Invoice' : 'Save Reading + Create Invoice'}
          </button>

          {message && <p style={{ color: '#b02a37' }}>{message}</p>}
        </section>

        <section className="card" style={{ marginTop: '25px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <p className="muted" style={{ margin: 0 }}>Search readings</p>
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search by lot, camper name, or date"
                style={{ width: '100%', maxWidth: '320px' }}
              />
            </div>
            <div style={{ textAlign: 'right' }}>
              <p className="muted" style={{ margin: 0 }}>Filtered readings</p>
              <h2 style={{ margin: 0 }}>{filteredReadings.length}</h2>
            </div>
          </div>

          <div className="grid grid-3" style={{ marginTop: '20px', gap: '12px' }}>
            <section className="card">
  <h2>{filteredReadings.length}</h2>
  <p className="muted">Lifetime Readings</p>
</section>

<section className="card">
  <h2>{totalKwh.toLocaleString()} kWh</h2>
  <p className="muted">Lifetime Usage</p>
</section>

<section className="card">
  <h2>${totalAmountDue.toFixed(2)}</h2>
  <p className="muted">Lifetime Revenue</p>
</section>

<section className="card">
  <h2>{averageUsage.toLocaleString()} kWh</h2>
  <p className="muted">Average Usage</p>
</section>
          </div>

          {filteredReadings.length === 0 ? (
            <div style={{ marginTop: '20px' }}>
              <h2>No matching electric readings found.</h2>
              <p className="muted">Adjust your search or add a new reading above.</p>
            </div>
          ) : (
            <div style={{ marginTop: '20px', display: 'grid', gap: '16px' }}>
              {filteredReadings.map((reading) => {
                const camper = campers.find((c) => c.id === reading.camper_id)

                return (
                  <section className="card" key={`${reading.id}-${reading.reading_date}`}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '20px', alignItems: 'center' }}>
                      <div>
                        <p className="muted" style={{ margin: 0 }}>
                          Camper
                        </p>
                        <h2 style={{ margin: '8px 0' }}>
                          Lot {camper?.lot_number || '—'} • {camper?.first_name || 'Unknown'} {camper?.last_name || ''}
                        </h2>

                        <p style={{ margin: '4px 0' }}>
                          Reading Date: <strong>{reading.reading_date}</strong>
                        </p>
                        <p style={{ margin: '4px 0' }}>
                          Previous: <strong>{reading.previous_reading}</strong>
                        </p>
                        <p style={{ margin: '4px 0' }}>
                          Current: <strong>{reading.current_reading}</strong>
                        </p>
                        <p style={{ margin: '4px 0' }}>
                          Rate: <strong>${reading.rate_per_kwh}</strong> per kWh
                        </p>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <h2>{reading.kwh_used} kWh</h2>
                        <h2 style={{ color: '#2f5d3a' }}>${Number(reading.amount_due || 0).toFixed(2)}</h2>
                      </div>
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
