'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, CheckCircle2, ClipboardCheck, Gauge } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { attemptAutoPay } from '../../../lib/autopay'
import { createInvoiceBundle, formatCreditMoney } from '../../../lib/account-credits'
import { invoiceTextSummary, notifyInvoiceCreated } from '../../../lib/client-invoice-texts'
import { defaultCampgroundBillingSettings, loadCampgroundBillingSettings } from '../../../lib/campground-settings'
import { buildMonthlyBillingChecklist } from '../../../lib/meter-billing-checklist'
import {
  campgroundAverageUsage,
  compareElectricUsage,
  groupedUsageHistory,
} from '../../../lib/electric-reading-safeguards'
import { electricChargeRowsSignature, electricWaterReviewKey } from '../../../lib/electric-invoice-review'

export default function AdminElectricPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [readings, setReadings] = useState<any[]>([])
  const [pumpOuts, setPumpOuts] = useState<any[]>([])
  const [siteServiceCharges, setSiteServiceCharges] = useState<any[]>([])
  const [accountCredits, setAccountCredits] = useState<any[]>([])
  const [meterSubmissions, setMeterSubmissions] = useState<any[]>([])
  const [billingChecklist, setBillingChecklist] = useState<any[]>([])
  const [checklistCounts, setChecklistCounts] = useState<Record<string, number>>({})
  const [checklistFilter, setChecklistFilter] = useState('all')
  const [checklistMonth, setChecklistMonth] = useState('')
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
  const [manualPumpChargeOption, setManualPumpChargeOption] = useState('none')
  const [manualPumpCustomAmount, setManualPumpCustomAmount] = useState('')
  const [newCreditAmount, setNewCreditAmount] = useState('')
  const [newCreditReason, setNewCreditReason] = useState('Electric billing credit')
  const [newCreditNotes, setNewCreditNotes] = useState('')
  const [searchText, setSearchText] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [approvedWaterTrashKey, setApprovedWaterTrashKey] = useState('')
  const [approvedAdditionalChargesKey, setApprovedAdditionalChargesKey] = useState('')
  const [meterDraft, setMeterDraft] = useState<any>(null)
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
    loadMeterSubmissions()
    loadBillingChecklist()
    loadSettings()
  }, [])

  useEffect(() => {
    const refresh = () => {
      loadMeterSubmissions()
      loadBillingChecklist()
    }
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  useEffect(() => {
    if (!campers.length || meterDraft) return
    const draftId = new URLSearchParams(window.location.search).get('meterDraft')
    if (!draftId) return

    async function loadMeterDraft() {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) return
      const response = await fetch(`/api/meter-readings?id=${encodeURIComponent(draftId!)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json().catch(() => ({}))
      const draft = result.submission
      if (!response.ok || !draft) {
        setMessage(result.error || 'That meter photo could not be loaded.')
        return
      }

      const selectedId = String(draft.camper_id || '')
      const selectedCamper = campers.find((camper) => camper.id === selectedId)
      if (!selectedCamper) {
        setMessage(`The billing record for Lot ${draft.lot_number || '—'} could not be found.`)
        return
      }

      const { data: latest } = await supabase
        .from('electric_readings')
        .select('*')
        .eq('camper_id', selectedId)
        .order('reading_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      const today = dateInputToday()
      setMeterDraft(draft)
      setApprovedWaterTrashKey('')
      setApprovedAdditionalChargesKey('')
      setCamperId(selectedId)
      setPreviousReading(latest ? String(latest.current_reading) : '')
      setCurrentReading(String(draft.reviewed_reading ?? draft.submitted_reading ?? draft.detected_reading ?? ''))
      setReadingDate(String(draft.captured_at || '').slice(0, 10) || today)
      setDueDate(today)
      setMessage(`Meter photo for Lot ${draft.lot_number} loaded. Review the photo, reading, usage, and other charges before creating the invoice.`)
      window.setTimeout(() => currentReadingRef.current?.focus(), 100)
    }

    loadMeterDraft()
  }, [campers, meterDraft])

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

  async function loadMeterSubmissions() {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) return
    const response = await fetch('/api/meter-readings', { headers: { Authorization: `Bearer ${token}` } })
    const result = await response.json().catch(() => ({}))
    if (response.ok) {
      setMeterSubmissions((result.submissions || []).filter((item: any) => item.status !== 'retake' && !item.invoice_id))
    }
  }

  async function loadBillingChecklist() {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) return
    const response = await fetch('/api/meter-readings?checklist=1', { headers: { Authorization: `Bearer ${token}` } })
    const result = await response.json().catch(() => ({}))
    if (response.ok) {
      setBillingChecklist(result.entries || [])
      setChecklistCounts(result.counts || {})
      setChecklistMonth(result.monthStart || '')
      return
    }

    // Admin accounts can have more than one campground profile. In that case,
    // use the signed-in admin's normal RLS access instead of leaving the tracker empty.
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()
    const [lotsResult, campersResult, submissionsResult, invoicesResult] = await Promise.all([
      supabase.from('lots').select('lot_number,meter_number,camper_id'),
      supabase.from('campers').select('id,first_name,last_name,lot_number,role,active'),
      supabase
        .from('meter_reading_submissions')
        .select('id,camper_id,lot_number,status,detected_reading,submitted_reading,reviewed_reading,captured_at,invoice_id,ocr_text')
        .gte('captured_at', monthStart)
        .neq('status', 'cancelled')
        .order('captured_at', { ascending: false }),
      supabase
        .from('invoices')
        .select('id,camper_id,status,created_at,paid_at,invoice_type')
        .gte('created_at', monthStart)
        .ilike('invoice_type', '%Electric%')
        .order('created_at', { ascending: false }),
    ])
    if (lotsResult.error || campersResult.error || submissionsResult.error || invoicesResult.error) return
    const fallback = buildMonthlyBillingChecklist({
      lots: lotsResult.data || [],
      campers: campersResult.data || [],
      submissions: submissionsResult.data || [],
      invoices: invoicesResult.data || [],
    })
    setBillingChecklist(fallback.entries)
    setChecklistCounts(fallback.counts)
    setChecklistMonth(monthStart)
  }

  function draftReading(draft: any) {
    const value = [draft?.reviewed_reading, draft?.submitted_reading, draft?.detected_reading]
      .find((candidate) => candidate !== null && candidate !== undefined && Number.isFinite(Number(candidate)) && Number(candidate) > 0)
    return value === undefined ? '' : String(value)
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
const selectedUsageHistory = useMemo(
  () => groupedUsageHistory(readings, camperId),
  [readings, camperId]
)
const allCampersAverageUsage = useMemo(
  () => campgroundAverageUsage(readings),
  [readings]
)
const liveCombinedUsage = Math.max(0, liveUsage) + Math.max(0, liveSecondUsage)
const liveUsageComparison = compareElectricUsage(
  liveCombinedUsage,
  selectedUsageHistory,
  allCampersAverageUsage
)

const selectedWaterTrashFee = includeWaterTrash ? Number(waterTrashFee || 0) : 0
const manualPumpChargeInput =
  manualPumpChargeOption === 'custom'
    ? Number(manualPumpCustomAmount || 0)
    : manualPumpChargeOption === '10' || manualPumpChargeOption === '20'
      ? Number(manualPumpChargeOption)
      : 0
const manualPumpCharge = Number.isFinite(manualPumpChargeInput)
  ? Number(manualPumpChargeInput.toFixed(2))
  : 0
const selectedPumpOuts = pumpOuts.filter((request) => request.camper_id === camperId)
const pumpOutChargeTotal = selectedPumpOuts.reduce((sum, request) => sum + Number(request.charge_amount || 10), 0)
const pumpOutUnitPreview = selectedPumpOuts.length ? Number((pumpOutChargeTotal / selectedPumpOuts.length).toFixed(2)) : 10
const selectedSiteServices = siteServiceCharges.filter((charge) => charge.camper_id === camperId)
const siteServiceChargeTotal = selectedSiteServices.reduce((sum, charge) => sum + Number(charge.charge_amount || 0), 0)
const selectedAccountCredits = accountCredits.filter((credit) => credit.camper_id === camperId)
const availableCreditTotal = selectedAccountCredits.reduce((sum, credit) => sum + Number(credit.remaining_amount || 0), 0)
const newCreditValue = Number(newCreditAmount || 0)
const estimatedCreditTotal =
  availableCreditTotal + (Number.isFinite(newCreditValue) && newCreditValue > 0 ? newCreditValue : 0)
const liveInvoiceTotal = liveAmount + liveSecondAmount + selectedWaterTrashFee + manualPumpCharge + pumpOutChargeTotal + siteServiceChargeTotal
const liveInvoiceAfterCredits = Math.max(0, liveInvoiceTotal - estimatedCreditTotal)
const filteredBillingChecklist = checklistFilter === 'all'
  ? billingChecklist
  : billingChecklist.filter((item) => item.status === checklistFilter)
const completedCount = Number(checklistCounts.no_bill || 0) + Number(checklistCounts.invoice_created || 0) + Number(checklistCounts.paid || 0)
const remainingCount = Math.max(0, billingChecklist.length - completedCount)
const waterTrashReviewKey = electricWaterReviewKey(camperId, includeWaterTrash, selectedWaterTrashFee)
const additionalChargesReviewKey = [
  camperId,
  includeSecondMeter
    ? `second:${secondMeterReason}:${secondPreviousReading}:${secondCurrentReading}:${secondRate}`
    : 'second:none',
  `manual-pump:${manualPumpChargeOption}:${manualPumpCustomAmount}`,
  `pump-outs:${electricChargeRowsSignature(selectedPumpOuts)}`,
  `site-services:${electricChargeRowsSignature(selectedSiteServices)}`,
  `credits:${electricChargeRowsSignature(selectedAccountCredits)}:${newCreditAmount}:${newCreditReason}:${newCreditNotes}`,
].join('|')
const waterTrashReviewed = Boolean(camperId) && approvedWaterTrashKey === waterTrashReviewKey
const additionalChargesReviewed = Boolean(camperId) && approvedAdditionalChargesKey === additionalChargesReviewKey
const billingReviewComplete = waterTrashReviewed && additionalChargesReviewed

  async function saveElectricAndCreateInvoice() {
    setMessage('')
    setSaving(true)

    if (!camperId || !previousReading || !currentReading || !rate || !readingDate || !dueDate) {
      setMessage('Please fill out all fields.')
      setSaving(false)
      return
    }

    if (!waterTrashReviewed) {
      setMessage('Invoice not created. Review and approve the Water/Trash decision first.')
      setSaving(false)
      return
    }

    if (!additionalChargesReviewed) {
      setMessage('Invoice not created. Review and approve all additional charges and credits first.')
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
    const manualPumpAmountInput =
      manualPumpChargeOption === 'custom'
        ? Number(manualPumpCustomAmount)
        : manualPumpChargeOption === '10' || manualPumpChargeOption === '20'
          ? Number(manualPumpChargeOption)
          : 0
    const manualPumpAmount = Number.isFinite(manualPumpAmountInput)
      ? Number(manualPumpAmountInput.toFixed(2))
      : 0
    const creditAmountToAdd = Number(newCreditAmount || 0)
    const kwhUsed = current - previous
    const amountDue = Number((kwhUsed * rateNumber).toFixed(2))
    const secondKwhUsed = includeSecondMeter ? secondCurrent - secondPrevious : 0
    const secondAmountDue = includeSecondMeter ? Number((secondKwhUsed * secondRateNumber).toFixed(2)) : 0
    const combinedKwhUsed = kwhUsed + secondKwhUsed
    const selectedCamper = campers.find((c) => c.id === camperId)

    if (manualPumpChargeOption === 'custom' && (!Number.isFinite(manualPumpAmountInput) || manualPumpAmountInput < 0.01)) {
      setMessage('Please enter a manual pumping charge of at least $0.01, or choose None.')
      setSaving(false)
      return
    }

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

    if (previous < 0 || current < 0 || rateNumber <= 0 || waterTrashAmount < 0 || manualPumpAmount < 0 || (includeSecondMeter && (secondPrevious < 0 || secondCurrent < 0 || secondRateNumber <= 0))) {
      setMessage('Readings and rate must be positive values.')
      setSaving(false)
      return
    }

    if (includeWaterTrash && !waterTrashFeeOptions.includes(waterTrashAmount)) {
      setMessage('Please choose an approved water/trash fee.')
      setSaving(false)
      return
    }

    if (current < previous) {
      setMessage('Current reading cannot be below the previous reading.')
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

    const usageComparison = compareElectricUsage(
      combinedKwhUsed,
      selectedUsageHistory,
      allCampersAverageUsage
    )

    if (usageComparison.status !== 'normal') {
      const warningType = usageComparison.status === 'high' ? 'HIGH' : 'LOW'
      const comparisonDetails = usageComparison.recentAverage > 0
        ? `\nRecent average: ${Math.round(usageComparison.recentAverage).toLocaleString()} kWh\n${usageComparison.comparisonLabel}`
        : '\nThere is not enough history for a campsite average.'
      const previousDetails = usageComparison.previousUsage > 0
        ? `\nPrevious billing period: ${Math.round(usageComparison.previousUsage).toLocaleString()} kWh`
        : ''
      const confirmed = window.confirm(
        `Please double-check this ${warningType} electric reading for Lot ${selectedCamper?.lot_number || '—'}.\n\nPrevious meter: ${previous.toLocaleString()}\nCurrent meter: ${current.toLocaleString()}\nUsage being billed: ${combinedKwhUsed.toLocaleString()} kWh${comparisonDetails}${previousDetails}\nEstimated electric charge: $${(amountDue + secondAmountDue).toFixed(2)}\n\nAre you sure these readings are correct?`
      )

      if (!confirmed) {
        setMessage('Invoice not created. Please recheck the meter reading.')
        setSaving(false)
        return
      }
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
    if (
      electricChargeRowsSignature(activePumpOuts) !== electricChargeRowsSignature(selectedPumpOuts) ||
      electricChargeRowsSignature(activeSiteServices) !== electricChargeRowsSignature(selectedSiteServices)
    ) {
      setApprovedAdditionalChargesKey('')
      await Promise.all([loadPumpOuts(), loadSiteServiceCharges()])
      setMessage('Invoice not created. A pump-out or site-service charge changed while you were reviewing. Check the updated charges and approve them again.')
      setSaving(false)
      return
    }
    const siteServiceTotal = Number(activeSiteServices.reduce((sum, charge) => sum + Number(charge.charge_amount || 0), 0).toFixed(2))
    const totalDue = Number((amountDue + secondAmountDue + waterTrashAmount + manualPumpAmount + pumpOutTotal + siteServiceTotal).toFixed(2))
    if (kwhUsed === 0 && totalDue <= 0) {
      setMessage('No invoice was created. This site has no usage or other charges; use “No Usage — Complete Reading” on the meter review screen.')
      setSaving(false)
      return
    }

    const invoiceNumber = `ELECTRIC-${selectedCamper?.lot_number || 'UNKNOWN'}-${Date.now()}`

    const invoiceItems: Array<{ description: string; quantity: number; unit_price: number; total: number }> = []
    if (kwhUsed > 0) {
      invoiceItems.push({
        description: `Electric Usage - Main meter - ${kwhUsed} kWh used @ $${rateNumber.toFixed(2)}/kWh`,
        quantity: kwhUsed,
        unit_price: rateNumber,
        total: amountDue,
      })
    }

    if (includeSecondMeter) {
      invoiceItems.push({
        description: `${secondMeterReason || 'Second meter'} - ${secondKwhUsed} kWh used @ $${secondRateNumber.toFixed(2)}/kWh`,
        quantity: secondKwhUsed,
        unit_price: secondRateNumber,
        total: secondAmountDue,
      })
    }

    if (includeWaterTrash) {
      invoiceItems.push({
        description: `Water/Trash Fee - $${waterTrashAmount.toFixed(2)}`,
        quantity: 1,
        unit_price: waterTrashAmount,
        total: waterTrashAmount,
      })
    }

    if (manualPumpAmount > 0) {
      invoiceItems.push({
        description: `Manual Pumping Charge - $${manualPumpAmount.toFixed(2)}`,
        quantity: 1,
        unit_price: manualPumpAmount,
        total: manualPumpAmount,
      })
    }

    if (pumpOutTotal > 0) {
      const pumpOutUnitPrice = activePumpOuts.length ? Number((pumpOutTotal / activePumpOuts.length).toFixed(2)) : 10
      invoiceItems.push({
        description: `${activePumpOuts.length} Sewer Pump-Out${activePumpOuts.length === 1 ? '' : 's'} @ $${pumpOutUnitPrice.toFixed(2)} each`,
        quantity: activePumpOuts.length,
        unit_price: pumpOutUnitPrice,
        total: pumpOutTotal,
      })
    }

    for (const charge of activeSiteServices) {
      invoiceItems.push({
        description: `${charge.service_label} - ${new Date(charge.performed_at).toLocaleDateString()}`,
        quantity: 1,
        unit_price: Number(charge.charge_amount || 0),
        total: Number(charge.charge_amount || 0),
      })
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
      })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const camperName = `${selectedCamper?.first_name || ''} ${selectedCamper?.last_name || ''}`.trim() || 'Camper'
    let invoice: any
    let creditResult = { appliedTotal: 0, remainingDue: totalDue, paidInFull: false }
    try {
      const bundle = await createInvoiceBundle({
        client: supabase,
        operationKey: `electric-invoice:${camperId}:${readingDate}`,
        invoice: {
          camper_id: camperId,
          invoice_number: invoiceNumber,
          invoice_type: [
            kwhUsed > 0 ? 'Electric' : '',
            includeSecondMeter ? 'Second Meter' : '',
            includeWaterTrash ? 'Water/Trash' : '',
            manualPumpAmount > 0 ? 'Manual Pumping Charge' : '',
            pumpOutTotal > 0 ? 'Sewer Pump-Out' : '',
            siteServiceTotal > 0 ? 'Site Services' : '',
          ].filter(Boolean).join(' + '),
          subtotal: totalDue,
          late_fee: 0,
          total_due: totalDue,
          due_date: dueDate,
        },
        items: invoiceItems,
        readings: readingRows,
        pumpOutIds: activePumpOuts.map((request) => request.id),
        siteServiceIds: activeSiteServices.map((charge) => charge.id),
        newCredit: creditAmountToAdd > 0 ? {
          amount: Number(creditAmountToAdd.toFixed(2)),
          lot_number: selectedCamper?.lot_number || null,
          camper_name: camperName,
          reason: newCreditReason.trim(),
          notes: newCreditNotes.trim() || null,
        } : null,
        appliedBy: user?.email || null,
      })
      invoice = bundle.invoice
      creditResult = bundle.credit

      if (bundle.duplicate) {
        setMessage('An electric invoice already exists for this camper and reading date. No duplicate was created.')
        setSaving(false)
        return
      }
    } catch (creditError: any) {
      setMessage(creditError.message || 'Unable to create the electric invoice safely.')
      setSaving(false)
      return
    }

    let resultMessage = kwhUsed > 0
      ? `Electric invoice created. Main meter: ${kwhUsed} kWh × $${rateNumber.toFixed(2)} = $${amountDue.toFixed(2)}`
      : 'Charge-only invoice created. The meter reading was saved with no electric usage'

    if (includeSecondMeter) {
      resultMessage += ` + ${secondMeterReason || 'Second meter'}: ${secondKwhUsed} kWh × $${secondRateNumber.toFixed(2)} = $${secondAmountDue.toFixed(2)}`
    }

    if (includeWaterTrash) {
      resultMessage += ` + Water/Trash: $${waterTrashAmount.toFixed(2)}`
    }

    if (manualPumpAmount > 0) {
      resultMessage += ` + Manual Pumping Charge: $${manualPumpAmount.toFixed(2)}`
    }

    if (pumpOutTotal > 0) {
      const pumpOutUnitPrice = activePumpOuts.length ? Number((pumpOutTotal / activePumpOuts.length).toFixed(2)) : 10
      resultMessage += ` + Sewer Pump-Outs: ${activePumpOuts.length} × $${pumpOutUnitPrice.toFixed(2)} = $${pumpOutTotal.toFixed(2)}`
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

        if (autoPay.initiated) {
          resultMessage += ` — ${autoPay.message || 'AutoPay was started and is waiting for Stripe confirmation.'}`
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

    if (meterDraft?.id) {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (token) {
          const response = await fetch('/api/meter-readings', {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: meterDraft.id, status: 'used', invoiceId: invoice.id }),
          })
          if (!response.ok) resultMessage += ' Meter photo remains in the review queue and should be cleared manually.'
          else setMeterSubmissions((current) => current.filter((item) => item.id !== meterDraft.id))
        }
      } catch {
        resultMessage += ' Meter photo remains in the review queue and should be cleared manually.'
      }
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
    setManualPumpChargeOption('none')
    setManualPumpCustomAmount('')
    setNewCreditAmount('')
    setNewCreditReason('Electric billing credit')
    setNewCreditNotes('')
    setSearchText('')
    setMeterDraft(null)
    setApprovedWaterTrashKey('')
    setApprovedAdditionalChargesKey('')
    window.history.replaceState({}, '', '/admin/electric')
    loadReadings()
    loadPumpOuts()
    loadSiteServiceCharges()
    loadAccountCredits()
    loadBillingChecklist()
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

          <div className="electric-meter-entry-link">
            <span><Gauge size={22} /></span>
            <div><small>METER PHOTOS CONNECTED</small><strong>{meterSubmissions.filter((item) => draftReading(item)).length} readings ready in the camper dropdown</strong><p>Select a camper below and the newest unused photograph, previous reading, and current reading load automatically. Open the review page only for exceptions.</p></div>
            <a href="/admin/electric/meter-readings">Review Exceptions</a>
          </div>

          <section className="electric-billing-checklist">
            <header>
              <span><ClipboardCheck size={22} /></span>
              <div>
                <small>MONTHLY BILLING CHECKLIST</small>
                <h2>{completedCount} of {billingChecklist.length} sites completed</h2>
                <p>{checklistMonth ? new Date(`${checklistMonth.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'Current month'} · Updates automatically</p>
              </div>
            </header>

            <div className={`electric-month-closeout ${remainingCount === 0 && billingChecklist.length ? 'ready' : ''}`}>
              <div>
                <small>MONTH-END CONTROL</small>
                <strong>{remainingCount === 0 && billingChecklist.length ? 'Ready to close this electric month' : `${remainingCount} site${remainingCount === 1 ? '' : 's'} still need completion`}</strong>
                <p>{remainingCount === 0 && billingChecklist.length ? 'Every site has an invoice, paid invoice, or recorded no-usage result.' : 'Finish the Not Read, Photo Ready, and Needs Retake groups before filing the month.'}</p>
              </div>
              <div>
                <a href="/admin/electric/monthly-report">Review & print month</a>
                <a href="/admin/system-health">Health check & backup</a>
              </div>
            </div>

            <div className="electric-billing-statuses" role="group" aria-label="Filter monthly billing checklist">
              {[
                ['all', 'All Sites', billingChecklist.length],
                ['not_read', 'Not Read', checklistCounts.not_read || 0],
                ['photo_ready', 'Photo Ready', checklistCounts.photo_ready || 0],
                ['needs_retake', 'Needs Retake', checklistCounts.needs_retake || 0],
                ['no_bill', 'No Usage', checklistCounts.no_bill || 0],
                ['invoice_created', 'Invoice Created', checklistCounts.invoice_created || 0],
                ['paid', 'Paid', checklistCounts.paid || 0],
              ].map(([key, label, count]) => (
                <button
                  className={checklistFilter === key ? 'active' : ''}
                  key={String(key)}
                  onClick={() => setChecklistFilter(String(key))}
                  type="button"
                >
                  <strong>{Number(count)}</strong>
                  <span>{String(label)}</span>
                </button>
              ))}
            </div>

            <div className="electric-billing-site-list">
              {filteredBillingChecklist.map((item) => (
                <article key={item.lot_number}>
                  <div>
                    <strong>Lot {item.lot_number}</strong>
                    <small>{item.camper_name}</small>
                  </div>
                  <span className={`status-${item.status}`}>{String(item.status).replaceAll('_', ' ')}</span>
                  {item.status === 'photo_ready' && item.submission_id ? (
                    <a href={`/admin/electric?meterDraft=${encodeURIComponent(item.submission_id)}`}>Open for Billing</a>
                  ) : item.status === 'needs_retake' ? (
                    <a href="/admin/electric/meter-readings">Review</a>
                  ) : item.status === 'no_bill' ? (
                    <em>Reading saved · no bill</em>
                  ) : item.invoice_id ? (
                    <a href={`/admin/invoices/${encodeURIComponent(item.invoice_id)}`}>View Invoice</a>
                  ) : <em>Waiting on maintenance</em>}
                </article>
              ))}
              {!filteredBillingChecklist.length && <p>No sites are in this group.</p>}
            </div>
          </section>

          {meterDraft && (
            <section className="electric-meter-draft">
              <div className="electric-meter-draft-photo">
                {meterDraft.photo_url ? <img src={meterDraft.photo_url} alt={`Meter photo for Lot ${meterDraft.lot_number}`} /> : <span><Camera size={28} /> Photo unavailable</span>}
              </div>
              <div>
                <span><CheckCircle2 size={16} /> OFFICE REVIEW DRAFT</span>
                <h2>Lot {meterDraft.lot_number} meter photo is attached</h2>
                <p>{meterDraft.submitted_reading !== null ? <>Maintenance confirmed <strong>{meterDraft.submitted_reading}</strong>.</> : <>Maintenance submitted the meter photo.</>}{meterDraft.detected_reading !== null ? ` Camera detected ${meterDraft.detected_reading}.` : ''} Confirm the current reading below, then add the usual charges and create the invoice.</p>
              </div>
            </section>
          )}

          <select
  value={camperId}
  onChange={async (e) => {
	    const selectedId = e.target.value
	    setCamperId(selectedId)
	    setApprovedWaterTrashKey('')
	    setApprovedAdditionalChargesKey('')
	    setPreviousReading('')
	    setCurrentReading('')
	    setMeterDraft(null)
	    window.history.replaceState({}, '', '/admin/electric')
	
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

    if (data) setPreviousReading(String(data.current_reading))

    const waitingPhoto = meterSubmissions.find((item) => String(item.camper_id) === selectedId && draftReading(item))
    if (waitingPhoto) {
      setMeterDraft(waitingPhoto)
      setCurrentReading(draftReading(waitingPhoto))
      setReadingDate(String(waitingPhoto.captured_at || '').slice(0, 10) || today)
      setMessage(`Lot ${waitingPhoto.lot_number} photo and reading loaded automatically. Verify the picture and number before creating the invoice.`)
    }

    setTimeout(() => { currentReadingRef.current?.focus() }, 100)
  }} style={{ display: 'block', width: '100%', marginBottom: '12px' }}>
            <option value="">Select Camper</option>
            {campers.map((camper) => (
              <option key={camper.id} value={camper.id}>
                Lot {camper.lot_number} - {camper.first_name} {camper.last_name}{(() => {
                  const waiting = meterSubmissions.find((item) => String(item.camper_id) === String(camper.id) && draftReading(item))
                  return waiting ? ` · Photo ready: ${Number(draftReading(waiting)).toLocaleString()}` : ''
                })()}
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

    {(liveUsageComparison.recentAverage > 0 || liveUsageComparison.status !== 'normal') && (
      <div
        style={{
          margin: '10px 0 14px',
          padding: '12px',
          borderRadius: '12px',
          background: liveUsageComparison.status === 'normal' ? '#fff' : '#fff4dc',
          border: liveUsageComparison.status === 'normal' ? '1px solid #d8ded5' : '2px solid #b97721',
        }}
      >
        <strong>
          {liveUsageComparison.recentAverage > 0
            ? `Recent campsite average: ${Math.round(liveUsageComparison.recentAverage).toLocaleString()} kWh`
            : 'No campsite average is available yet'}
        </strong>
        <p style={{ margin: '4px 0 0' }}>{liveUsageComparison.comparisonLabel}</p>
        {liveUsageComparison.previousUsage > 0 && (
          <small className="muted">
            Previous billing period: {Math.round(liveUsageComparison.previousUsage).toLocaleString()} kWh
          </small>
        )}
        {liveUsageComparison.status !== 'normal' && (
          <p style={{ margin: '8px 0 0', fontWeight: 800, color: '#8a4d00' }}>
            This usage seems unusually {liveUsageComparison.status}. You will be asked to confirm it before the invoice is created.
          </p>
        )}
      </div>
    )}

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

      {manualPumpCharge > 0 && (
        <p style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', margin: 0 }}>
          <span>Manual pumping charge</span>
          <strong>${manualPumpCharge.toFixed(2)}</strong>
        </p>
      )}

      {pumpOutChargeTotal > 0 && (
        <p style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', margin: 0 }}>
          <span>{selectedPumpOuts.length} sewer pump-out{selectedPumpOuts.length === 1 ? '' : 's'} × {`$${pumpOutUnitPreview.toFixed(2)}`}</span>
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

    {(includeSecondMeter || includeWaterTrash || manualPumpCharge > 0 || pumpOutChargeTotal > 0 || siteServiceChargeTotal > 0 || estimatedCreditTotal > 0) && (
      <>
        <h2>
          ${liveInvoiceAfterCredits.toFixed(2)}
        </h2>
        <p className="muted">
          Estimated Total After Credits
          {includeSecondMeter ? ' with second meter' : ''}
          {includeWaterTrash ? ' with Water/Trash' : ''}
          {manualPumpCharge > 0 ? ` + $${manualPumpCharge.toFixed(2)} manual pumping charge` : ''}
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

          <section
            style={{
              marginBottom: '14px',
              padding: '16px',
              border: manualPumpCharge > 0 ? '2px solid #2f5d3a' : '1px solid #d8ded5',
              borderRadius: '14px',
              background: manualPumpCharge > 0 ? '#eef6eb' : '#f8faf7',
            }}
          >
            <strong>Add a manual pumping charge</strong>
            <p className="muted" style={{ margin: '4px 0 12px' }}>
              Use this for a pumping charge that is not already listed as a camper pump-out request.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                gap: '10px',
              }}
            >
              {[
                { value: 'none', label: 'None' },
                { value: '10', label: '$10' },
                { value: '20', label: '$20' },
                { value: 'custom', label: 'Enter amount' },
              ].map((option) => (
                <label
                  key={option.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    minHeight: '48px',
                    padding: '10px',
                    border: manualPumpChargeOption === option.value ? '2px solid #2f5d3a' : '1px solid #d8ded5',
                    borderRadius: '12px',
                    background: manualPumpChargeOption === option.value ? '#ffffff' : '#f3f5f1',
                    cursor: 'pointer',
                    fontWeight: 800,
                  }}
                >
                  <input
                    checked={manualPumpChargeOption === option.value}
                    onChange={() => {
                      setManualPumpChargeOption(option.value)
                      if (option.value !== 'custom') setManualPumpCustomAmount('')
                    }}
                    type="radio"
                    name="manual-pump-charge"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>

            {manualPumpChargeOption === 'custom' && (
              <label style={{ display: 'grid', gap: '6px', marginTop: '12px' }}>
                <span style={{ fontWeight: 800 }}>Custom pumping amount</span>
                <input
                  aria-label="Custom pumping charge amount"
                  inputMode="decimal"
                  min="0.01"
                  placeholder="Enter amount, for example 35.00"
                  step="0.01"
                  type="number"
                  value={manualPumpCustomAmount}
                  onChange={(e) => setManualPumpCustomAmount(e.target.value)}
                />
              </label>
            )}

            {manualPumpCharge > 0 && (
              <p style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', margin: '12px 0 0', padding: '12px', borderRadius: '12px', background: '#fff' }}>
                <span>Added to this invoice</span>
                <strong>${manualPumpCharge.toFixed(2)}</strong>
              </p>
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

          {camperId && (
            <section
              style={{
                marginBottom: '14px',
                padding: '16px',
                border: billingReviewComplete ? '2px solid #2f5d3a' : '2px solid #b97721',
                borderRadius: '14px',
                background: billingReviewComplete ? '#eef6eb' : '#fff8e8',
              }}
            >
              <strong>Required final charge review</strong>
              <p className="muted" style={{ margin: '4px 0 12px' }}>
                The invoice stays locked until both items are approved. Changing a charge automatically removes its approval.
              </p>
              <div style={{ display: 'grid', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontWeight: 800 }}>
                  <input
                    type="checkbox"
                    checked={waterTrashReviewed}
                    onChange={(event) => setApprovedWaterTrashKey(event.target.checked ? waterTrashReviewKey : '')}
                    style={{ marginTop: '3px' }}
                  />
                  <span>
                    Water/Trash reviewed — {includeWaterTrash ? `$${selectedWaterTrashFee.toFixed(2)} will be charged` : 'no Water/Trash charge on this invoice'}
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontWeight: 800 }}>
                  <input
                    type="checkbox"
                    checked={additionalChargesReviewed}
                    onChange={(event) => setApprovedAdditionalChargesKey(event.target.checked ? additionalChargesReviewKey : '')}
                    style={{ marginTop: '3px' }}
                  />
                  <span>
                    All other charges and credits reviewed — pump-outs, site services, manual charges, second meter, and credits
                  </span>
                </label>
              </div>
            </section>
          )}

          <button onClick={saveElectricAndCreateInvoice} disabled={saving || !billingReviewComplete}>
            {saving
              ? 'Saving…'
              : !billingReviewComplete
                ? 'Review Charges Before Creating Invoice'
                : liveUsage === 0 && liveInvoiceTotal > 0
                  ? 'Save Reading + Create Charge-Only Invoice'
                : includeWaterTrash
                  ? 'Save Reading + Create Combined Invoice'
                  : 'Save Reading + Create Invoice'}
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
