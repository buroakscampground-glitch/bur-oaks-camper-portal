'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  DoorOpen,
  ExternalLink,
  FileWarning,
  History,
  ListChecks,
  LoaderCircle,
  ReceiptText,
  Save,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'

type Camper = {
  id: string
  first_name?: string | null
  last_name?: string | null
  lot_number?: string | null
  role?: string | null
}

type RenewalStatus = 'Not Started' | 'Awaiting Response' | 'Renewing' | 'Camper Leaving' | 'Campground Not Renewing'

type Renewal = {
  id: string
  camper_id: string
  lot_number?: string | null
  contract_start_date?: string | null
  contract_end_date?: string | null
  renewal_sent_at?: string | null
  status: RenewalStatus
  decision_recorded_at?: string | null
  automation_error?: string | null
  auto_send_approved?: boolean
  auto_send_approved_at?: string | null
  review_notified_at?: string | null
  notes?: string | null
  updated_at?: string | null
}

type Draft = {
  annual_month: string
  annual_day: string
  renewal_sent_at: string
  status: RenewalStatus
  notes: string
}

type View = 'Action' | 'Openings' | 'All' | 'Setup'
type SiteHistoryTab = 'care' | 'payments'

type SiteCareNotice = {
  id: string
  title: string
  message?: string | null
  priority?: string | null
  status?: string | null
  due_date?: string | null
  created_at?: string | null
}

type PaymentRecord = {
  id: string
  invoice_number?: string | null
  invoice_type?: string | null
  total_due?: number | null
  late_fee?: number | null
  due_date?: string | null
  status?: string | null
  paid_at?: string | null
  payment_method?: string | null
  created_at?: string | null
  is_late?: boolean
}

type SiteHistory = {
  camper: Camper & { email?: string | null; phone?: string | null }
  notices: SiteCareNotice[]
  invoices: PaymentRecord[]
  summary: {
    totalInvoices: number
    paidInvoices: number
    lateInvoices: number
    openBalance: number
    totalNotices: number
    activeNotices: number
  }
}

const statuses: RenewalStatus[] = ['Not Started', 'Awaiting Response', 'Renewing', 'Camper Leaving', 'Campground Not Renewing']
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function camperName(camper: Camper) {
  return `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Camper'
}

function todayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function shiftDate(value: string, months = 0, days = 0) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  const target = new Date(year, month - 1 + months, 1, 12)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate()
  target.setDate(Math.min(day, lastDay) + days)
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
}

function formatDate(value?: string | null) {
  if (!value) return 'Not set'
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatMoney(value?: number | null) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatAnnualDate(value?: string | null) {
  if (!value) return 'Not set'
  return new Date(`2000-${value.slice(5)}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

function monthLabel(value: string) {
  return new Date(`${value}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function nextAnnualDate(monthValue: string, dayValue: string) {
  const month = Number(monthValue)
  const day = Number(dayValue)
  if (!month || !day) return ''
  const today = todayISO()
  const year = Number(today.slice(0, 4))
  const date = new Date(year, month - 1, day, 12)
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return ''
  const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return candidate >= today ? candidate : `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function draftFrom(record?: Renewal): Draft {
  const annualDate = record?.contract_end_date || record?.contract_start_date || ''
  return {
    annual_month: annualDate ? String(Number(annualDate.slice(5, 7))) : '',
    annual_day: annualDate ? String(Number(annualDate.slice(8, 10))) : '',
    renewal_sent_at: record?.renewal_sent_at || '',
    status: record?.status || 'Not Started',
    notes: record?.notes || '',
  }
}

export default function AdminRenewalsPage() {
  const [campers, setCampers] = useState<Camper[]>([])
  const [renewals, setRenewals] = useState<Renewal[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [expanded, setExpanded] = useState('')
  const [view, setView] = useState<View>('Action')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [feedback, setFeedback] = useState('')
  const [selectedSiteId, setSelectedSiteId] = useState('')
  const [siteHistory, setSiteHistory] = useState<SiteHistory | null>(null)
  const [siteHistoryTab, setSiteHistoryTab] = useState<SiteHistoryTab>('care')
  const [siteHistoryLoading, setSiteHistoryLoading] = useState(false)
  const [siteHistoryError, setSiteHistoryError] = useState('')
  const [siteDecisionMessage, setSiteDecisionMessage] = useState('')

  useEffect(() => { loadPage() }, [])

  useEffect(() => {
    if (!selectedSiteId) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedSiteId('')
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [selectedSiteId])

  async function loadPage() {
    setLoading(true)
    const [camperResult, renewalResult] = await Promise.all([
      supabase.from('campers').select('id,first_name,last_name,lot_number,role').eq('active', true).order('lot_number', { ascending: true }),
      supabase.from('season_renewals').select('*').order('contract_end_date', { ascending: true, nullsFirst: false }),
    ])

    if (camperResult.error || renewalResult.error) {
      setFeedback(camperResult.error?.message || renewalResult.error?.message || 'Unable to load renewal records.')
      setLoading(false)
      return
    }

    const activeCampers = (camperResult.data || []).filter((camper) => !['admin', 'maintenance'].includes(String(camper.role || '').toLowerCase()))
    const records = (renewalResult.data || []) as Renewal[]
    setCampers(activeCampers)
    setRenewals(records)
    setDrafts(Object.fromEntries(activeCampers.map((camper) => [camper.id, draftFrom(records.find((record) => record.camper_id === camper.id))])))
    setLoading(false)
  }

  async function openSiteHistory(camper: Camper) {
    setSelectedSiteId(camper.id)
    setSiteHistory(null)
    setSiteHistoryTab('care')
    setSiteHistoryError('')
    setSiteDecisionMessage('')
    setSiteHistoryLoading(true)

    try {
      const sessionResult = await Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Your login check took too long. Please try again.')), 7000)),
      ])
      const token = sessionResult.data.session?.access_token
      if (!token) throw new Error('Your login has expired. Please sign in again.')

      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 12000)
      try {
        const response = await fetch(`/api/admin-site-history?camperId=${encodeURIComponent(camper.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        const result = await response.json().catch(() => null)
        if (!response.ok || !result?.camper) throw new Error(result?.error || 'Site history could not be loaded.')
        setSiteHistory(result as SiteHistory)
      } finally {
        window.clearTimeout(timer)
      }
    } catch (error) {
      setSiteHistoryError(error instanceof DOMException && error.name === 'AbortError'
        ? 'Site history took too long to load. Please try again.'
        : error instanceof Error ? error.message : 'Site history could not be loaded.')
    } finally {
      setSiteHistoryLoading(false)
    }
  }

  function openRenewalEditor(camperId: string) {
    setSelectedSiteId('')
    setView('All')
    setExpanded(camperId)
    window.setTimeout(() => document.getElementById(`renewal-${camperId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
  }

  function updateDraft(camperId: string, field: keyof Draft, value: string) {
    setDrafts((current) => ({
      ...current,
      [camperId]: { ...(current[camperId] || draftFrom()), [field]: value },
    }))
  }

  async function saveThroughAdminApi(camper: Camper, action: 'save' | 'approve' | 'decline' | 'clear' | 'mark-sent') {
    const existing = renewals.find((record) => record.camper_id === camper.id)
    const draft = drafts[camper.id] || draftFrom(existing)
    const sessionResult = await Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Your login check timed out. Please refresh and try again.')), 7000)),
    ])
    const token = sessionResult.data.session?.access_token
    if (!token) throw new Error('Your login has expired. Please sign in again.')

    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 12000)
    try {
      const response = await fetch('/api/admin-renewals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action,
          camperId: camper.id,
          annualMonth: draft.annual_month,
          annualDay: draft.annual_day,
          renewalSentAt: draft.renewal_sent_at,
          status: draft.status,
          notes: draft.notes,
        }),
        signal: controller.signal,
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.renewal) throw new Error(result?.error || 'The renewal could not be saved.')
      return result.renewal as Renewal
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Saving took too long. Nothing was changed—please try again.')
      }
      throw error
    } finally {
      window.clearTimeout(timer)
    }
  }

  async function saveRenewal(camper: Camper, markSent = false) {
    setSaving(camper.id)
    setFeedback('')
    try {
      const saved = await saveThroughAdminApi(camper, markSent ? 'mark-sent' : 'save')
      setRenewals((current) => [...current.filter((record) => record.camper_id !== camper.id), saved])
      setDrafts((current) => ({ ...current, [camper.id]: draftFrom(saved) }))
      setFeedback(markSent ? `Renewal marked sent for Lot ${camper.lot_number || '—'}.` : `Annual contract date saved for Lot ${camper.lot_number || '—'}. It will roll forward automatically each year.`)
      setExpanded('')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'The renewal could not be saved.')
    } finally {
      setSaving('')
    }
  }

  async function setSendDecision(camper: Camper, approve: boolean) {
    setSaving(camper.id)
    setFeedback('')
    setSiteDecisionMessage('')
    try {
      const saved = await saveThroughAdminApi(camper, approve ? 'approve' : 'decline')
      setRenewals((current) => [...current.filter((record) => record.camper_id !== camper.id), saved])
      setDrafts((current) => ({ ...current, [camper.id]: draftFrom(saved) }))
      const decisionMessage = approve
        ? `Lot ${camper.lot_number || '—'} is approved. The renewal will send automatically on schedule.`
        : `Lot ${camper.lot_number || '—'} is marked not renewing and will not receive an automatic renewal.`
      setFeedback(decisionMessage)
      setSiteDecisionMessage(decisionMessage)
      setExpanded('')
    } catch (error) {
      const decisionError = error instanceof Error ? error.message : 'The decision could not be saved.'
      setFeedback(decisionError)
      setSiteDecisionMessage(decisionError)
    } finally {
      setSaving('')
    }
  }

  async function clearSendDecision(camper: Camper) {
    setSaving(camper.id)
    setFeedback('')
    setSiteDecisionMessage('')
    try {
      const saved = await saveThroughAdminApi(camper, 'clear')
      setRenewals((current) => [...current.filter((record) => record.camper_id !== camper.id), saved])
      setDrafts((current) => ({ ...current, [camper.id]: draftFrom(saved) }))
      const decisionMessage = `Lot ${camper.lot_number || '—'} is back to undecided. No automatic renewal is approved.`
      setFeedback(decisionMessage)
      setSiteDecisionMessage(decisionMessage)
    } catch (error) {
      const decisionError = error instanceof Error ? error.message : 'The decision could not be cleared.'
      setFeedback(decisionError)
      setSiteDecisionMessage(decisionError)
    } finally {
      setSaving('')
    }
  }

  const rows = useMemo(() => {
    const today = todayISO()
    return campers.map((camper) => {
      const renewal = renewals.find((record) => record.camper_id === camper.id)
      const contractEnd = renewal?.contract_end_date || ''
      const sendDue = shiftDate(contractEnd, -4)
      const reviewDue = shiftDate(sendDue, 0, -14)
      const responseDue = shiftDate(contractEnd, -3)
      const openingDate = shiftDate(contractEnd, 0, 1)
      const confirmedOpening = renewal?.status === 'Camper Leaving' || renewal?.status === 'Campground Not Renewing'
      const approvedToSend = Boolean(renewal?.auto_send_approved)
      const needsReview = renewal?.status === 'Not Started' && !renewal?.renewal_sent_at && !approvedToSend && !!reviewDue && reviewDue <= today
      const safe = renewal?.status === 'Renewing' || (renewal?.status === 'Not Started' && !needsReview)
      const responseOverdue = renewal?.status === 'Awaiting Response' && !!responseDue && responseDue < today
      const sendOverdue = approvedToSend && !renewal?.renewal_sent_at && !!sendDue && sendDue <= today
      const sendSoon = approvedToSend && !renewal?.renewal_sent_at && !!sendDue && sendDue > today && sendDue <= shiftDate(today, 1)
      const needsSetup = !contractEnd
      const automationError = Boolean(renewal?.automation_error)
      const needsAction = needsSetup || needsReview || sendOverdue || sendSoon || responseOverdue || automationError
      let priority = 6
      if (automationError) priority = 0
      else if (responseOverdue) priority = 0
      else if (needsReview) priority = 1
      else if (sendOverdue) priority = 2
      else if (sendSoon) priority = 3
      else if (needsSetup) priority = 3
      else if (renewal?.status === 'Awaiting Response') priority = 4
      else if (confirmedOpening) priority = 5
      return { camper, renewal, contractEnd, sendDue, reviewDue, responseDue, openingDate, confirmedOpening, approvedToSend, needsReview, safe, responseOverdue, sendOverdue, sendSoon, needsSetup, automationError, needsAction, priority }
    }).sort((a, b) => a.priority - b.priority || (a.contractEnd || '9999').localeCompare(b.contractEnd || '9999') || String(a.camper.lot_number || '').localeCompare(String(b.camper.lot_number || ''), undefined, { numeric: true }))
  }, [campers, renewals])

  const visibleRows = rows.filter((row) => {
    if (view === 'Action' && !row.needsAction && row.renewal?.status !== 'Awaiting Response') return false
    if (view === 'Openings' && !row.confirmedOpening && !row.responseOverdue) return false
    if (view === 'Setup' && !row.needsSetup) return false
    const needle = search.trim().toLowerCase()
    return !needle || `${camperName(row.camper)} ${row.camper.lot_number || ''} ${row.renewal?.status || ''}`.toLowerCase().includes(needle)
  })

  const confirmedOpenings = rows.filter((row) => row.confirmedOpening)
  const overdueResponses = rows.filter((row) => row.responseOverdue)
  const awaiting = rows.filter((row) => row.renewal?.status === 'Awaiting Response')
  const sendSoon = rows.filter((row) => row.sendOverdue || row.sendSoon)
  const reviewNeeded = rows.filter((row) => row.needsReview)
  const safeRows = rows.filter((row) => row.safe || row.approvedToSend)
  const needsSetup = rows.filter((row) => row.needsSetup)
  const selectedRow = rows.find((row) => row.camper.id === selectedSiteId)
  const selectedRenewing = Boolean(selectedRow?.approvedToSend || selectedRow?.renewal?.status === 'Renewing')
  const selectedNotRenewing = Boolean(selectedRow?.renewal?.status === 'Camper Leaving' || selectedRow?.renewal?.status === 'Campground Not Renewing')

  const timeline = useMemo(() => {
    const events: Record<string, { send: number; response: number; opening: number }> = {}
    const currentMonth = todayISO().slice(0, 7)
    rows.forEach((row) => {
      const add = (date: string, key: 'send' | 'response' | 'opening') => {
        if (!date) return
        const month = date.slice(0, 7)
        events[month] ||= { send: 0, response: 0, opening: 0 }
        events[month][key] += 1
      }
      if (!row.renewal?.renewal_sent_at) add(row.sendDue, 'send')
      if (row.renewal?.status === 'Awaiting Response') add(row.responseDue, 'response')
      if (row.confirmedOpening) add(row.openingDate, 'opening')
    })
    return Object.entries(events).filter(([month]) => month >= currentMonth).sort(([a], [b]) => a.localeCompare(b)).slice(0, 12)
  }, [rows])

  return (
    <main className="renewal-page">
      <style>{`
        .renewal-page{display:grid;gap:18px;color:#263b2e}.renewal-hero{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end;padding:30px;border-radius:28px;background:radial-gradient(circle at 85% 12%,rgba(236,199,111,.3),transparent 28%),linear-gradient(135deg,#173722,#386747);color:#fff;box-shadow:0 22px 56px rgba(34,54,38,.16)}.renewal-eyebrow{display:inline-flex;align-items:center;gap:7px;color:#efd288;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.renewal-hero h1{margin:9px 0 0;color:#fff;font:500 clamp(36px,5vw,58px)/1.02 Georgia,serif}.renewal-hero p{max-width:760px;margin:12px 0 0;color:rgba(255,255,255,.84);line-height:1.55}.renewal-hero a{display:inline-flex;align-items:center;gap:8px;padding:12px 15px;border-radius:999px;background:#fff;color:#285237;font-size:12px;font-weight:900;text-decoration:none}
        .renewal-feedback{margin:0;padding:12px 15px;border-radius:13px;background:#eef5eb;color:#315f3d;font-size:12px;font-weight:800}.renewal-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.renewal-summary button{display:grid;gap:5px;padding:18px!important;border:1px solid #deddd4!important;border-radius:18px!important;background:#fff!important;color:#263b2e!important;text-align:left!important;box-shadow:0 10px 24px rgba(34,54,38,.05)}.renewal-summary button.selected{border-color:#315f3d!important;box-shadow:0 0 0 2px rgba(49,95,61,.12)}.renewal-summary span{color:#7b715c;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.renewal-summary strong{font:600 30px Georgia,serif}.renewal-summary small{color:#6d786f;font-size:11px}
        .renewal-forecast-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:18px}.renewal-panel{padding:21px;border:1px solid #deddd4;border-radius:22px;background:#fff;box-shadow:0 12px 30px rgba(34,54,38,.06)}.renewal-panel-head{display:flex;align-items:start;justify-content:space-between;gap:14px}.renewal-panel h2{margin:6px 0 4px;font:500 27px Georgia,serif}.renewal-panel-head p{margin:0;color:#6d786f;font-size:12px;line-height:1.45}.opening-list,.timeline-list{display:grid;gap:8px;margin-top:16px}.opening-row{display:grid;grid-template-columns:auto 1fr auto;gap:11px;align-items:center;padding:12px;border-radius:14px;background:#f6f8f4}.opening-row.possible{background:#fff6eb}.opening-row>span{display:grid;place-items:center;width:37px;height:37px;border-radius:12px;background:#dcebdd;color:#315f3d}.opening-row.possible>span{background:#f5dfba;color:#8a5d1e}.opening-row strong{display:block;font-size:13px}.opening-row small{display:block;margin-top:3px;color:#758078;font-size:10px}.opening-row em{color:#315f3d;font-size:10px;font-style:normal;font-weight:900;text-align:right}.renewal-empty{padding:22px;text-align:center;color:#718078}.renewal-empty strong{display:block;margin-top:7px;color:#315f3d}.timeline-row{display:grid;grid-template-columns:1fr repeat(3,auto);gap:9px;align-items:center;padding:10px 0;border-bottom:1px solid #ecebe5}.timeline-row:last-child{border:0}.timeline-row strong{font-size:12px}.timeline-row span{padding:5px 7px;border-radius:999px;background:#f2f5f0;color:#45634c;font-size:9px;font-weight:900}.timeline-key{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;color:#758078;font-size:10px}
        .renewal-roster{padding:22px;border:1px solid #deddd4;border-radius:24px;background:#fff;box-shadow:0 12px 30px rgba(34,54,38,.06)}.renewal-roster-head{display:flex;align-items:end;justify-content:space-between;gap:15px}.renewal-roster h2{margin:6px 0 4px;font:500 30px Georgia,serif}.renewal-roster-head p{margin:0;color:#6d786f;font-size:12px}.renewal-tools{display:flex;gap:8px}.renewal-search{display:flex;align-items:center;gap:7px;padding:0 11px;border:1px solid #d8ddd5;border-radius:12px;background:#fafbf9}.renewal-search input{min-width:190px;border:0!important;background:transparent!important;box-shadow:none!important}.renewal-tools button{background:#315f3d!important;color:#fff!important}.renewal-list{display:grid;gap:9px;margin-top:17px}.renewal-row{border:1px solid #e2e2da;border-radius:17px;overflow:hidden;background:#fbfcfa}.renewal-row.attention{border-color:#e8c888;background:#fffaf1}.renewal-row.opening{border-color:#bad5b8;background:#f5faf3}.renewal-row-main{display:grid;grid-template-columns:minmax(180px,1.2fr) repeat(3,minmax(120px,.8fr)) auto;gap:12px;align-items:center;padding:15px}.renewal-person small,.renewal-deadline small{display:block;color:#8a7449;font-size:9px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}.renewal-person strong,.renewal-deadline strong{display:block;margin-top:4px;font-size:13px}.renewal-status{justify-self:start;padding:7px 9px;border-radius:999px;background:#e9eee7;color:#46604b;font-size:9px;font-weight:900;text-transform:uppercase}.renewal-status.leaving{background:#f6dfc6;color:#875321}.renewal-row-main>button{display:inline-flex!important;align-items:center;gap:6px;background:transparent!important;color:#315f3d!important;box-shadow:none!important}.renewal-edit{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;padding:16px;border-top:1px solid #e2e2da;background:#fff}.renewal-edit label{display:grid;gap:6px;color:#526158;font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.renewal-edit input,.renewal-edit select,.renewal-edit textarea{width:100%;border:1px solid #d8ddd5!important;border-radius:11px!important;background:#fbfcfa!important;color:#263b2e!important;box-shadow:none!important}.renewal-edit .notes{grid-column:1/-1}.renewal-edit textarea{min-height:72px;resize:vertical}.renewal-edit-dates{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;padding:10px 12px;border-radius:12px;background:#f2f6ef;color:#58705e;font-size:10px}.renewal-edit-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px}.renewal-edit-actions button{display:inline-flex!important;align-items:center;gap:7px}.renewal-edit-actions .mark-sent{background:#fff!important;color:#315f3d!important}.renewal-edit-actions .save{background:#315f3d!important;color:#fff!important}.renewal-none{padding:36px;text-align:center;color:#718078}.renewal-none strong{display:block;margin-top:8px;color:#315f3d}
        @media(max-width:1050px){.renewal-summary{grid-template-columns:repeat(2,1fr)}.renewal-forecast-grid{grid-template-columns:1fr}.renewal-row-main{grid-template-columns:minmax(180px,1.2fr) repeat(2,minmax(120px,.8fr)) auto}.renewal-row-main .contract-col{display:none}.renewal-edit{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.renewal-hero{grid-template-columns:1fr;padding:24px 20px}.renewal-hero a{justify-self:start}.renewal-summary{gap:8px}.renewal-summary button{padding:14px!important}.renewal-summary strong{font-size:25px}.renewal-panel,.renewal-roster{padding:17px}.renewal-roster-head{align-items:stretch;flex-direction:column}.renewal-tools{display:grid;grid-template-columns:1fr auto}.renewal-search input{min-width:0;width:100%}.renewal-row-main{grid-template-columns:1fr auto;gap:9px}.renewal-row-main .renewal-deadline,.renewal-row-main .renewal-status{grid-column:1}.renewal-row-main>button{grid-column:2;grid-row:1/4}.renewal-edit{grid-template-columns:1fr}.renewal-edit .notes{grid-column:auto}.renewal-edit-actions{align-items:stretch;flex-direction:column}.renewal-edit-actions button{justify-content:center}.opening-row{grid-template-columns:auto 1fr}.opening-row em{grid-column:2;text-align:left}.timeline-row{grid-template-columns:1fr;gap:5px}.timeline-row span{justify-self:start}}
        .renewal-board{padding:20px;border:1px solid #deddd4;border-radius:22px;background:#fff;box-shadow:0 12px 30px rgba(34,54,38,.06)}.renewal-board-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:13px}.renewal-board-head h2{margin:5px 0 0;font:500 28px Georgia,serif}.renewal-board-head p{margin:0;color:#6d786f;font-size:11px}.renewal-board-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.renewal-bucket{min-height:115px;padding:13px;border-radius:16px}.renewal-bucket.green{background:#eaf4e8;color:#285437}.renewal-bucket.gold{background:#fff3d7;color:#7b5717}.renewal-bucket.blue{background:#eaf1f3;color:#305b67}.renewal-bucket.red{background:#fae6e2;color:#913e37}.renewal-bucket>strong{display:block;font-size:12px}.renewal-bucket>small{display:block;margin-top:3px;opacity:.76;font-size:9px}.renewal-lot-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}.renewal-lot-chips button,.renewal-lot-chips span{display:inline-flex!important;min-height:0!important;padding:5px 7px!important;border:0!important;border-radius:999px!important;background:rgba(255,255,255,.76)!important;color:inherit!important;font-size:9px!important;font-weight:900!important;box-shadow:none!important}.renewal-row{border-color:#cfe0cd;background:#f1f8ef}.renewal-row.attention{border-color:#e8c888;background:#fff7e5}.renewal-row.opening{border-color:#e4aaa3;background:#fff0ed}.renewal-row.awaiting{border-color:#b9d0d6;background:#f0f6f7}.renewal-status{background:#d9ead6;color:#315f3d}.renewal-status.leaving{background:#f4cfc9;color:#913e37}.renewal-status.review{background:#f4dfac;color:#7b5717}.renewal-approval{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;border-radius:14px;background:#fff7df}.renewal-approval strong{display:block;font-size:12px}.renewal-approval small{display:block;margin-top:3px;color:#756b55;font-size:10px}.renewal-approval div:last-child{display:flex;gap:8px}.renewal-approval .yes{background:#315f3d!important;color:#fff!important}.renewal-approval .no{background:#a8443e!important;color:#fff!important}
        @media(max-width:1050px){.renewal-board-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.renewal-board-grid{grid-template-columns:1fr 1fr}.renewal-board{padding:15px}.renewal-board-head{align-items:start;flex-direction:column}.renewal-approval{align-items:stretch;flex-direction:column}.renewal-approval div:last-child{display:grid;grid-template-columns:1fr 1fr}}
        .renewal-hero h1{color:#fff!important}
        .renewal-annual-help{grid-column:1/-1;display:flex;gap:7px;padding:12px 13px;border-radius:12px;background:#eef5ec;color:#49624f;font-size:11px}.renewal-annual-help strong{white-space:nowrap}.renewal-board{order:-1}
        .site-history-overlay{position:fixed;inset:0;z-index:1200;display:flex;justify-content:flex-end}.site-history-backdrop{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;border:0!important;border-radius:0!important;background:rgba(10,30,18,.52)!important;box-shadow:none!important;backdrop-filter:blur(4px)}.site-history-panel{position:relative;width:min(720px,calc(100vw - 40px));height:100%;overflow:auto;background:#f4f5ef;box-shadow:-24px 0 65px rgba(16,42,25,.24);animation:siteHistoryIn .2s ease-out}.site-history-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:22px 24px;border-bottom:1px solid #dce1d8;background:rgba(248,249,245,.96);backdrop-filter:blur(16px)}.site-history-header small{display:block;color:#9a762c;font-size:9px;font-weight:900;letter-spacing:.14em}.site-history-header h2{margin:5px 0 0;font:500 29px Georgia,serif}.site-history-header p{margin:4px 0 0;color:#68736b;font-size:11px}.site-history-close{display:grid!important;place-items:center!important;flex:0 0 42px!important;width:42px!important;height:42px!important;padding:0!important;border:1px solid #d6ddd3!important;border-radius:50%!important;background:#fff!important;color:#294632!important;box-shadow:none!important}.site-history-content{display:grid;gap:15px;padding:20px 24px 30px}.site-history-loading{display:grid;place-items:center;min-height:360px;text-align:center;color:#607066}.site-history-loading svg{animation:siteHistorySpin 1s linear infinite}.site-history-loading strong{display:block;margin-top:12px}.site-history-error{padding:18px;border:1px solid #edc7bd;border-radius:16px;background:#fff1ed;color:#873e35}.site-history-error button{display:block!important;margin-top:12px!important;background:#315f3d!important;color:#fff!important}.site-history-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.site-history-stat{padding:14px;border:1px solid #dde1d8;border-radius:15px;background:#fff}.site-history-stat span{display:flex;align-items:center;gap:6px;color:#7b806f;font-size:9px;font-weight:900;text-transform:uppercase}.site-history-stat strong{display:block;margin-top:7px;color:#294632;font:600 23px Georgia,serif}.site-history-stat.warning{border-color:#edd4a1;background:#fff8e8}.site-history-stat.alert{border-color:#e9bbb4;background:#fff1ee}.site-history-actions{display:flex;flex-wrap:wrap;gap:8px}.site-history-actions button,.site-history-actions a{display:inline-flex!important;align-items:center;justify-content:center;gap:7px;min-height:40px;padding:10px 13px!important;border:1px solid #d4dcd1!important;border-radius:999px!important;background:#fff!important;color:#315f3d!important;font-size:11px!important;font-weight:900!important;text-decoration:none;box-shadow:none!important}.site-history-actions button:first-child{border-color:#315f3d!important;background:#315f3d!important;color:#fff!important}.site-history-tabs{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:5px;border:1px solid #dce1d8;border-radius:14px;background:#e9ede6}.site-history-tabs button{display:flex!important;align-items:center;justify-content:center;gap:7px;padding:10px!important;border:0!important;border-radius:10px!important;background:transparent!important;color:#5e6d63!important;font-size:11px!important;box-shadow:none!important}.site-history-tabs button.active{background:#fff!important;color:#315f3d!important;box-shadow:0 5px 14px rgba(35,59,41,.08)!important}.site-history-list{display:grid;gap:9px}.site-history-list-head{display:flex;align-items:end;justify-content:space-between;gap:10px;padding:5px 2px}.site-history-list-head h3{margin:0;font:500 22px Georgia,serif}.site-history-list-head span{color:#7b806f;font-size:10px}.site-history-item{padding:15px;border:1px solid #dde1d8;border-radius:16px;background:#fff}.site-history-item-top{display:flex;align-items:start;justify-content:space-between;gap:12px}.site-history-item strong{font-size:12px}.site-history-item p{margin:8px 0 0;color:#647067;font-size:11px;line-height:1.45}.site-history-item small{display:block;margin-top:8px;color:#899088;font-size:9px}.site-history-badge{flex:0 0 auto;padding:5px 8px;border-radius:999px;background:#eaf2e8;color:#376143;font-size:8px;font-weight:900;text-transform:uppercase}.site-history-badge.open,.site-history-badge.late{background:#fae2dd;color:#933e35}.site-history-badge.review{background:#fff0cb;color:#835b16}.site-history-payment{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center}.site-history-payment-amount{text-align:right}.site-history-payment-amount strong{display:block;font:600 18px Georgia,serif}.site-history-payment-amount small{margin-top:3px}.site-history-empty{padding:34px 18px;border:1px dashed #cfd8cc;border-radius:17px;background:rgba(255,255,255,.55);color:#718078;text-align:center}.site-history-empty strong{display:block;margin-top:8px;color:#315f3d}.site-history-footnote{margin:0;color:#7e877f;font-size:9px;line-height:1.5}@keyframes siteHistoryIn{from{transform:translateX(24px);opacity:.55}to{transform:translateX(0);opacity:1}}@keyframes siteHistorySpin{to{transform:rotate(360deg)}}
        .site-renewal-decision{padding:15px;border:1px solid #d7ddd3;border-radius:17px;background:#fff}.site-renewal-decision-head strong{font-size:13px}.site-renewal-decision-head small{display:block;margin-top:4px;color:#748078;font-size:10px;line-height:1.4}.site-renewal-decision-buttons{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px}.site-renewal-decision-buttons button{display:flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;min-height:48px!important;padding:11px!important;border-radius:13px!important;font-size:11px!important;font-weight:900!important;box-shadow:none!important}.site-renewal-decision-buttons .renew{border:1px solid #315f3d!important;background:#315f3d!important;color:#fff!important}.site-renewal-decision-buttons .do-not-renew{border:1px solid #a8443e!important;background:#a8443e!important;color:#fff!important}.site-renewal-decision-buttons button.selected{box-shadow:0 0 0 3px rgba(230,191,102,.5)!important}.site-renewal-decision-buttons button:disabled{opacity:.72!important}.site-renewal-clear{display:block!important;margin:10px auto 0!important;padding:4px 7px!important;border:0!important;background:transparent!important;color:#69756d!important;font-size:9px!important;text-decoration:underline!important;box-shadow:none!important}.site-decision-message{margin:10px 0 0;padding:9px 11px;border-radius:10px;background:#eef4eb;color:#315f3d;font-size:10px;font-weight:800}
        @media(max-width:680px){.renewal-hero,.renewal-summary{display:none}.renewal-board{padding:14px}.renewal-board-grid{grid-template-columns:1fr}.renewal-bucket{min-height:0}.renewal-annual-help{align-items:flex-start;flex-direction:column}.renewal-edit-actions .mark-sent{display:none!important}}
        @media(max-width:680px){.site-history-panel{width:100vw}.site-history-header{padding:17px 16px}.site-history-header h2{font-size:25px}.site-history-content{padding:15px 14px 24px}.site-history-summary{grid-template-columns:1fr 1fr}.site-history-actions{display:grid;grid-template-columns:1fr 1fr}.site-history-actions>*{width:100%}.site-history-payment{align-items:start}.site-history-payment-amount strong{font-size:16px}}
      `}</style>

      <section className="renewal-hero">
        <div><span className="renewal-eyebrow"><CalendarClock size={17} /> SEASON PLANNING</span><h1>Know which sites may open next.</h1><p>Contract dates repeat yearly. The saved renewal form goes into the camper portal four months before the anniversary, and the camper’s answer is due one month later.</p></div>
        <a href="/admin/waitlist"><BookOpen size={16} /> Open waitlist <ArrowRight size={15} /></a>
      </section>

      {feedback && <p className="renewal-feedback">{feedback}</p>}

      <section className="renewal-summary" aria-label="Renewal overview">
        <button type="button" className={view === 'Setup' ? 'selected' : ''} onClick={() => setView('Setup')}><span>Needs contract dates</span><strong>{needsSetup.length}</strong><small>Enter these once to begin</small></button>
        <button type="button" className={view === 'Action' ? 'selected' : ''} onClick={() => setView('Action')}><span>Needs your review</span><strong>{reviewNeeded.length}</strong><small>Held until you choose yes or no</small></button>
        <button type="button" className={view === 'Action' ? 'selected' : ''} onClick={() => setView('Action')}><span>Awaiting answers</span><strong>{awaiting.length}</strong><small>{overdueResponses.length} past response deadline</small></button>
        <button type="button" className={view === 'Openings' ? 'selected' : ''} onClick={() => setView('Openings')}><span>Confirmed openings</span><strong>{confirmedOpenings.length}</strong><small>Safe to begin filling</small></button>
      </section>

      <section className="renewal-board">
        <div className="renewal-board-head"><div><span className="renewal-eyebrow"><CalendarCheck size={15} /> QUICK SITE CALENDAR</span><h2>See every renewal position at a glance.</h2></div><p>Green is safe · Gold needs you · Blue awaits camper · Red is opening</p></div>
        <div className="renewal-board-grid">
          <div className="renewal-bucket green"><strong>Green · Safe / renewing</strong><small>Not near renewal, approved, or renewing</small><div className="renewal-lot-chips">{safeRows.map((row) => <button key={row.camper.id} type="button" onClick={() => openSiteHistory(row.camper)} aria-label={`Open Lot ${row.camper.lot_number || 'unassigned'} history`}>Lot {row.camper.lot_number || '—'}</button>)}{!safeRows.length && <span>None</span>}</div></div>
          <div className="renewal-bucket gold"><strong>Gold · Review now</strong><small>Choose yes or no before anything sends</small><div className="renewal-lot-chips">{reviewNeeded.map((row) => <button key={row.camper.id} type="button" onClick={() => openSiteHistory(row.camper)} aria-label={`Open Lot ${row.camper.lot_number || 'unassigned'} history`}>Lot {row.camper.lot_number || '—'}</button>)}{!reviewNeeded.length && <span>None</span>}</div></div>
          <div className="renewal-bucket blue"><strong>Blue · Camper deciding</strong><small>Renewal sent; answer still pending</small><div className="renewal-lot-chips">{awaiting.map((row) => <button key={row.camper.id} type="button" onClick={() => openSiteHistory(row.camper)} aria-label={`Open Lot ${row.camper.lot_number || 'unassigned'} history`}>Lot {row.camper.lot_number || '—'}</button>)}{!awaiting.length && <span>None</span>}</div></div>
          <div className="renewal-bucket red"><strong>Red · Site opening</strong><small>Camper leaving or office not renewing</small><div className="renewal-lot-chips">{confirmedOpenings.map((row) => <button key={row.camper.id} type="button" onClick={() => openSiteHistory(row.camper)} aria-label={`Open Lot ${row.camper.lot_number || 'unassigned'} history`}>Lot {row.camper.lot_number || '—'}</button>)}{!confirmedOpenings.length && <span>None</span>}</div></div>
        </div>
      </section>

      <div className="renewal-forecast-grid">
        <section className="renewal-panel">
          <div className="renewal-panel-head"><div><span className="renewal-eyebrow"><DoorOpen size={15} /> OPENING FORECAST</span><h2>Sites to plan for</h2><p>Confirmed openings are kept separate from overdue answers.</p></div></div>
          <div className="opening-list">
            {confirmedOpenings.slice(0, 6).map((row) => <div className="opening-row" key={row.camper.id}><span><DoorOpen size={18} /></span><div><strong>Lot {row.camper.lot_number || '—'} · {camperName(row.camper)}</strong><small>{row.renewal?.status}</small></div><em>Opens {formatDate(row.openingDate)}</em></div>)}
            {overdueResponses.slice(0, 4).map((row) => <div className="opening-row possible" key={row.camper.id}><span><AlertTriangle size={18} /></span><div><strong>Lot {row.camper.lot_number || '—'} · {camperName(row.camper)}</strong><small>Answer is overdue—not a confirmed opening</small></div><em>Due {formatDate(row.responseDue)}</em></div>)}
            {!confirmedOpenings.length && !overdueResponses.length && <div className="renewal-empty"><Sparkles size={28} /><strong>No projected openings yet.</strong><small>Decisions and overdue replies will appear here.</small></div>}
          </div>
        </section>

        <section className="renewal-panel">
          <div className="renewal-panel-head"><div><span className="renewal-eyebrow"><CalendarCheck size={15} /> FUTURE SCHEDULE</span><h2>What is coming up</h2><p>This is a calendar preview—not an urgent list. Only gold items need your attention.</p></div></div>
          <div className="timeline-list">
            {timeline.map(([month, counts]) => <div className="timeline-row" key={month}><strong>{monthLabel(month)}</strong><span>{counts.send} scheduled</span><span>{counts.response} replies due</span><span>{counts.opening} opening</span></div>)}
            {!timeline.length && <div className="renewal-empty"><CalendarClock size={28} /><strong>Add contract dates to build the calendar.</strong></div>}
          </div>
          <div className="timeline-key"><span>Scheduled = renewal date coming later</span><span>Gold = needs your decision now</span></div>
        </section>
      </div>

      <section className="renewal-roster">
        <div className="renewal-roster-head">
          <div><span className="renewal-eyebrow"><Clock3 size={15} /> RENEWAL ROSTER</span><h2>{view === 'Setup' ? 'Campers needing dates' : view === 'Openings' ? 'Opening forecast details' : view === 'All' ? 'All seasonal campers' : 'Decisions needing attention'}</h2><p>Automatic renewals are protected against duplicates. You can still update any decision manually.</p></div>
          <div className="renewal-tools"><label className="renewal-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lot or camper" /></label><button type="button" onClick={() => setView(view === 'All' ? 'Action' : 'All')}>{view === 'All' ? 'Priority view' : 'View all'}</button></div>
        </div>

        <div className="renewal-list">
          {visibleRows.map((row) => {
            const draft = drafts[row.camper.id] || draftFrom(row.renewal)
            const annualPreview = nextAnnualDate(draft.annual_month, draft.annual_day)
            const isExpanded = expanded === row.camper.id
            const attention = row.responseOverdue || row.needsReview || row.sendOverdue || row.sendSoon || row.needsSetup || row.automationError
            return <article id={`renewal-${row.camper.id}`} className={`renewal-row${attention ? ' attention' : ''}${row.confirmedOpening ? ' opening' : ''}${row.renewal?.status === 'Awaiting Response' ? ' awaiting' : ''}`} key={row.camper.id}>
              <div className="renewal-row-main">
                <div className="renewal-person"><small>LOT {row.camper.lot_number || '—'}</small><strong>{camperName(row.camper)}</strong></div>
                <div className="renewal-deadline contract-col"><small>Annual contract date</small><strong>{formatAnnualDate(row.contractEnd)}</strong></div>
                <div className="renewal-deadline"><small>{row.renewal?.renewal_sent_at ? 'Camper answer due' : 'Renewal should be sent'}</small><strong>{formatDate(row.renewal?.renewal_sent_at ? row.responseDue : row.sendDue)}</strong></div>
                <span className={`renewal-status${row.confirmedOpening ? ' leaving' : ''}${row.needsReview ? ' review' : ''}`}>{row.automationError ? 'Send problem' : row.needsSetup ? 'Needs dates' : row.needsReview ? 'Review now' : row.responseOverdue ? 'Reply overdue' : row.approvedToSend ? 'Approved to send' : row.renewal?.status || 'Not Started'}</span>
                <button type="button" onClick={() => setExpanded(isExpanded ? '' : row.camper.id)}>{isExpanded ? 'Close' : 'Update'} <ChevronDown size={15} /></button>
              </div>
              {isExpanded && <div className="renewal-edit">
                <label>Annual contract month<select value={draft.annual_month} onChange={(event) => updateDraft(row.camper.id, 'annual_month', event.target.value)}><option value="">Choose month</option>{months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label>
                <label>Day<select value={draft.annual_day} onChange={(event) => updateDraft(row.camper.id, 'annual_day', event.target.value)}><option value="">Choose day</option>{Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}</select></label>
                <label>Decision<select value={draft.status} onChange={(event) => updateDraft(row.camper.id, 'status', event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
                <div className="renewal-annual-help"><strong>Enter this once.</strong><span>The year does not matter. Every renewal is for 12 months, so the system automatically moves this date forward each year.</span></div>
                {annualPreview && <div className="renewal-edit-dates"><span>Annual date <strong>{formatAnnualDate(annualPreview)}</strong></span><span>Next automatic send <strong>{formatDate(shiftDate(annualPreview, -4))}</strong></span><span>Camper reply due <strong>{formatDate(shiftDate(annualPreview, -3))}</strong></span><span>Possible opening <strong>{formatDate(shiftDate(annualPreview, 0, 1))}</strong></span>{row.renewal?.automation_error && <span><strong>Needs attention:</strong> {row.renewal.automation_error}</span>}</div>}
                {!draft.renewal_sent_at && annualPreview && draft.status !== 'Camper Leaving' && <div className="renewal-approval"><div><strong>Should this camper receive an automatic renewal?</strong><small>Nothing will send unless you choose Yes. Choose No to mark this site as a future opening.</small></div><div><button className="no" type="button" disabled={saving === row.camper.id} onClick={() => setSendDecision(row.camper, false)}>No, not renewing</button><button className="yes" type="button" disabled={saving === row.camper.id} onClick={() => setSendDecision(row.camper, true)}>{row.approvedToSend ? 'Yes, approved' : 'Yes, send on date'}</button></div></div>}
                <label className="notes">Private notes<textarea value={draft.notes} onChange={(event) => updateDraft(row.camper.id, 'notes', event.target.value)} placeholder="Calls, conversations, special circumstances…" /></label>
                <div className="renewal-edit-actions">{!draft.renewal_sent_at && <button className="mark-sent" type="button" disabled={saving === row.camper.id} onClick={() => saveRenewal(row.camper, true)}><Send size={15} /> Mark renewal sent today</button>}<button className="save" type="button" disabled={saving === row.camper.id} onClick={() => saveRenewal(row.camper)}>{saving === row.camper.id ? <Clock3 size={15} /> : <Save size={15} />} {saving === row.camper.id ? 'Saving…' : 'Save renewal record'}</button></div>
              </div>}
            </article>
          })}
          {!loading && !visibleRows.length && <div className="renewal-none"><CheckCircle2 size={31} /><strong>No campers match this view.</strong><small>Try View all or clear the search.</small></div>}
          {loading && <div className="renewal-none"><Clock3 size={31} /><strong>Loading renewal forecast…</strong></div>}
        </div>
      </section>

      {selectedSiteId && <div className="site-history-overlay">
        <button className="site-history-backdrop" type="button" onClick={() => setSelectedSiteId('')} aria-label="Close site history" />
        <aside className="site-history-panel" role="dialog" aria-modal="true" aria-labelledby="site-history-title">
          <header className="site-history-header">
            <div>
              <small>SITE RECORD · LOT {selectedRow?.camper.lot_number || siteHistory?.camper.lot_number || '—'}</small>
              <h2 id="site-history-title">{selectedRow ? camperName(selectedRow.camper) : siteHistory ? camperName(siteHistory.camper) : 'Loading site history…'}</h2>
              <p>{selectedRow?.renewal?.status || 'Renewal not started'} · Annual date {formatAnnualDate(selectedRow?.contractEnd)}</p>
            </div>
            <button className="site-history-close" type="button" onClick={() => setSelectedSiteId('')} aria-label="Close site history"><X size={20} /></button>
          </header>

          {siteHistoryLoading && <div className="site-history-loading"><div><LoaderCircle size={30} /><strong>Pulling the complete site record…</strong></div></div>}

          {!siteHistoryLoading && siteHistoryError && <div className="site-history-content"><div className="site-history-error"><strong>Site history did not load.</strong><p>{siteHistoryError}</p>{selectedRow && <button type="button" onClick={() => openSiteHistory(selectedRow.camper)}>Try again</button>}</div></div>}

          {!siteHistoryLoading && siteHistory && <div className="site-history-content">
            <section className="site-history-summary" aria-label="Site history summary">
              <article className={siteHistory.summary.activeNotices ? 'site-history-stat warning' : 'site-history-stat'}><span><FileWarning size={13} /> Active items</span><strong>{siteHistory.summary.activeNotices}</strong></article>
              <article className="site-history-stat"><span><ListChecks size={13} /> All site care</span><strong>{siteHistory.summary.totalNotices}</strong></article>
              <article className={siteHistory.summary.lateInvoices ? 'site-history-stat alert' : 'site-history-stat'}><span><History size={13} /> Times late</span><strong>{siteHistory.summary.lateInvoices}</strong></article>
              <article className="site-history-stat"><span><CircleDollarSign size={13} /> Balance</span><strong>{formatMoney(siteHistory.summary.openBalance)}</strong></article>
            </section>

            {selectedRow && <section className="site-renewal-decision" aria-label="Renewal decision">
              <div className="site-renewal-decision-head"><strong>Renew this camper’s site?</strong><small>Green approves the scheduled renewal. Red stops the automatic renewal and marks this as a future opening.</small></div>
              <div className="site-renewal-decision-buttons">
                <button className={`renew${selectedRenewing ? ' selected' : ''}`} type="button" disabled={saving === selectedRow.camper.id} onClick={() => setSendDecision(selectedRow.camper, true)}><CheckCircle2 size={16} /> {saving === selectedRow.camper.id ? 'Saving…' : selectedRenewing ? 'Green · Renewing' : 'Green · Renew'}</button>
                <button className={`do-not-renew${selectedNotRenewing ? ' selected' : ''}`} type="button" disabled={saving === selectedRow.camper.id} onClick={() => setSendDecision(selectedRow.camper, false)}><DoorOpen size={16} /> {saving === selectedRow.camper.id ? 'Saving…' : selectedNotRenewing ? 'Red · Do not renew' : 'Red · Do not renew'}</button>
              </div>
              {(selectedRenewing || selectedNotRenewing) && <button className="site-renewal-clear" type="button" disabled={saving === selectedRow.camper.id} onClick={() => clearSendDecision(selectedRow.camper)}>Undo this renewal decision</button>}
              {siteDecisionMessage && <p className="site-decision-message" role="status">{siteDecisionMessage}</p>}
            </section>}

            <div className="site-history-actions">
              <button type="button" onClick={() => openRenewalEditor(selectedSiteId)}><CalendarCheck size={15} /> Update renewal</button>
              <a href={`/admin/campers/${selectedSiteId}`}><ExternalLink size={14} /> Full camper profile</a>
              <a href="/admin/site-care"><FileWarning size={14} /> Full infraction list</a>
              <a href="/admin/invoices"><ReceiptText size={14} /> All invoices</a>
            </div>

            <div className="site-history-tabs" role="tablist" aria-label="Site record lists">
              <button className={siteHistoryTab === 'care' ? 'active' : ''} type="button" role="tab" aria-selected={siteHistoryTab === 'care'} onClick={() => setSiteHistoryTab('care')}><FileWarning size={15} /> Site care ({siteHistory.summary.totalNotices})</button>
              <button className={siteHistoryTab === 'payments' ? 'active' : ''} type="button" role="tab" aria-selected={siteHistoryTab === 'payments'} onClick={() => setSiteHistoryTab('payments')}><ReceiptText size={15} /> Payments ({siteHistory.summary.totalInvoices})</button>
            </div>

            {siteHistoryTab === 'care' && <section className="site-history-list">
              <div className="site-history-list-head"><h3>Infraction & site-care history</h3><span>{siteHistory.summary.activeNotices} still active</span></div>
              {siteHistory.notices.map((notice) => {
                const badgeClass = notice.status === 'Resolved' ? '' : notice.status === 'Ready for Review' ? 'review' : 'open'
                return <article className="site-history-item" key={notice.id}>
                  <div className="site-history-item-top"><strong>{notice.title}</strong><span className={`site-history-badge ${badgeClass}`}>{notice.status || 'Open'}</span></div>
                  {notice.message && <p>{notice.message}</p>}
                  <small>Added {formatDateTime(notice.created_at)}{notice.due_date ? ` · Requested by ${formatDate(notice.due_date)}` : ''}{notice.priority === 'Important' ? ' · Important' : ''}</small>
                </article>
              })}
              {!siteHistory.notices.length && <div className="site-history-empty"><CheckCircle2 size={28} /><strong>No site-care infractions recorded.</strong><span>This camper has a clear history.</span></div>}
            </section>}

            {siteHistoryTab === 'payments' && <section className="site-history-list">
              <div className="site-history-list-head"><h3>Invoice & payment history</h3><span>{siteHistory.summary.paidInvoices} paid · {siteHistory.summary.lateInvoices} late</span></div>
              {siteHistory.invoices.map((invoice) => <article className="site-history-item site-history-payment" key={invoice.id}>
                <div>
                  <div className="site-history-item-top"><strong>{invoice.invoice_number || invoice.invoice_type || 'Invoice'}</strong><span className={`site-history-badge ${invoice.is_late ? 'late' : ''}`}>{invoice.is_late ? 'Late' : invoice.status || 'Open'}</span></div>
                  <p>{invoice.invoice_type || 'Campground charge'}</p>
                  <small>{invoice.paid_at ? `Paid ${formatDateTime(invoice.paid_at)}${invoice.payment_method ? ` · ${invoice.payment_method}` : ''}` : `Due ${formatDate(invoice.due_date)}`}{Number(invoice.late_fee || 0) > 0 ? ` · ${formatMoney(invoice.late_fee)} late fee` : ''}</small>
                </div>
                <div className="site-history-payment-amount"><strong>{formatMoney(invoice.total_due)}</strong><small>{String(invoice.status || 'open').toUpperCase()}</small></div>
              </article>)}
              {!siteHistory.invoices.length && <div className="site-history-empty"><ReceiptText size={28} /><strong>No invoices recorded.</strong></div>}
              <p className="site-history-footnote">“Times late” counts invoices with a late fee, invoices paid after their due date, and invoices that are currently past due. Cancelled, void, and refunded invoices are not counted.</p>
            </section>}
          </div>}
        </aside>
      </div>}
    </main>
  )
}
