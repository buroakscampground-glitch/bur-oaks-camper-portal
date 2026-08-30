'use client'

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  AlertTriangle,
  Bell,
  CakeSlice,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Droplets,
  Eye,
  FileText,
  Gauge,
  Gift,
  Home,
  Leaf,
  LogOut,
  MapPin,
  Megaphone,
  MessageCircle,
  PartyPopper,
  ReceiptText,
  ShieldCheck,
  Soup,
  Sparkles,
  TentTree,
  UserRound,
  UsersRound,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { getCurrentCamper, supabase } from '../../lib/supabase'
import { saveSmsConsentPreference } from '../../lib/sms-consent'
import PortalWeather, { PortalWeatherMini } from '../../components/PortalWeather'
import EventFlyerShowcase from '../../components/EventFlyerShowcase'
import { saturdayDinners2026 } from '../../lib/saturday-dinners'
import { getSewerPumpOutFeeForLot } from '../../lib/sewer-pump-fees'
import { getSeasonalTheme } from '../../lib/seasonal-theme'
import { isInvoiceDueNow, totalInvoiceBalance } from '../../lib/invoice-balance'

const serviceLinks = [
  {
    href: '/site',
    title: 'My Site',
    description: 'See your lot, account status, documents, and site details.',
    icon: Home,
    accent: 'green',
  },
  {
    href: '/invoices',
    title: 'Invoices & AutoPay',
    description: 'View balances, pay invoices, or manage AutoPay.',
    icon: ReceiptText,
    accent: 'gold',
  },
  {
    href: '/electric',
    title: 'Electric Usage',
    description: 'Review meter readings, usage, and billing history.',
    icon: Zap,
    accent: 'blue',
  },
  {
    href: '/maintenance',
    title: 'Maintenance',
    description: 'Submit a request and follow its progress.',
    icon: Wrench,
    accent: 'orange',
  },
  {
    href: '/calendar',
    title: 'Events Calendar',
    description: 'See what is happening around the campground.',
    icon: CalendarDays,
    accent: 'green',
  },
  {
    href: '/dinners',
    title: 'Saturday Dinners',
    description: 'See the monthly menu and tell us what you are bringing.',
    icon: Soup,
    accent: 'gold',
  },
  {
    href: '/documents',
    title: 'My Documents',
    description: 'Open forms, notices, and files shared with you.',
    icon: FileText,
    accent: 'plum',
  },
  {
    href: '/profile',
    title: 'Camper Profile',
    description: 'Update contact info, vehicles, text alerts, and optional insurance.',
    icon: UserRound,
    accent: 'slate',
  },
  {
    href: '/messages',
    title: 'Chat with the Office',
    description: 'Chat privately with Bur Oaks and see your replies.',
    icon: MessageCircle,
    accent: 'blue',
  },
  {
    href: '/directory',
    title: 'Camper Directory',
    description: 'Find campground neighbors who have chosen to be listed.',
    icon: UsersRound,
    accent: 'green',
  },
]

function formatDate(value?: string) {
  if (!value) return 'Date coming soon'

  const date = new Date(`${value}T12:00:00`)

  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getMaintenanceDisplayStatus(ticket?: any) {
  if (!ticket) return 'No active requests'
  if (!ticket.admin_approved) return 'Awaiting Approval'
  return ticket.status || 'Open'
}

function formatFriendlyToday() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function getPortalSeason() {
  const month = new Date().getMonth()

  if (month >= 2 && month <= 4) return 'spring'
  if (month >= 5 && month <= 7) return 'summer'
  if (month >= 8 && month <= 10) return 'fall'
  return 'winter'
}

type BirthdayEntry = {
  recipientCamperId: string
  profile: 'primary' | 'secondary'
  name: string
  lotNumber: string | null
  day: number
  isToday: boolean
  isMine: boolean
  wishCount: number
  sentByMe: boolean
}

type BirthdayBoard = {
  monthName: string
  birthdays: BirthdayEntry[]
  setupRequired: boolean
}

const emptyBirthdayBoard: BirthdayBoard = {
  monthName: new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date()),
  birthdays: [],
  setupRequired: false,
}

export default function CamperPortalPage() {
  const [camper, setCamper] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [maintenanceTickets, setMaintenanceTickets] = useState<any[]>([])
  const [pumpOutRequests, setPumpOutRequests] = useState<any[]>([])
  const [pumpOutServiceLots, setPumpOutServiceLots] = useState<string[]>([])
  const [selectedPumpLot, setSelectedPumpLot] = useState('')
  const [officePendingMessages, setOfficePendingMessages] = useState<any[]>([])
  const [latestElectric, setLatestElectric] = useState<any>(null)
  const [unreadOfficeMessages, setUnreadOfficeMessages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pumpMessage, setPumpMessage] = useState('')
  const [requestingPump, setRequestingPump] = useState(false)
  const [showPumpConfirm, setShowPumpConfirm] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [birthdayBoard, setBirthdayBoard] = useState<BirthdayBoard>(emptyBirthdayBoard)
  const [birthdaySending, setBirthdaySending] = useState('')
  const [birthdayMessage, setBirthdayMessage] = useState('')
  const [siteCareNotices, setSiteCareNotices] = useState<any[]>([])
  const [siteCareUpdating, setSiteCareUpdating] = useState('')
  const [siteCareMessage, setSiteCareMessage] = useState('')
  const [smsPromptDecision, setSmsPromptDecision] = useState('')
  const [smsPromptChecked, setSmsPromptChecked] = useState(false)
  const [smsPromptSaving, setSmsPromptSaving] = useState(false)
  const [smsPromptMessage, setSmsPromptMessage] = useState('')

  useEffect(() => {
    async function loadDashboard() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) throw userError

        if (!user) {
          window.location.href = '/login'
          return
        }

        const savedSmsPromptDecision = String(
          user.user_metadata?.bur_oaks_sms_prompt_decision || ''
        ).toLowerCase()
        setSmsPromptDecision(
          savedSmsPromptDecision === 'accepted' || savedSmsPromptDecision === 'declined'
            ? savedSmsPromptDecision
            : ''
        )

        const camperData = await getCurrentCamper()

        if (camperData?.role?.toLowerCase() === 'admin') {
          window.location.replace('/admin')
          return
        }

        if (camperData?.role?.toLowerCase() === 'maintenance') {
          window.location.replace('/maintenance/dashboard')
          return
        }

        if (!camperData) return

        setCamper(camperData)

        const today = new Date().toISOString().split('T')[0]
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const [invoiceResult, electricResult, documentResult, eventResult, announcementResult, alertResult, maintenanceResult, messageResult, pumpOutResult, pendingOfficeResult, birthdayResult, siteCareResult] =
          await Promise.all([
            supabase
              .from('invoices')
              .select('*')
              .eq('camper_id', camperData.id),
            supabase
              .from('electric_readings')
              .select('*')
              .eq('camper_id', camperData.id)
              .order('reading_date', { ascending: false })
              .limit(1)
              .maybeSingle(),
            session?.access_token
              ? fetch('/api/camper-documents', {
                  headers: { Authorization: `Bearer ${session.access_token}` },
                })
                  .then((response) => response.ok ? response.json() : null)
                  .catch(() => null)
              : Promise.resolve(null),
            supabase
              .from('events')
              .select('*')
              .gte('event_date', today)
              .order('event_date', { ascending: true })
              .limit(4),
            supabase
              .from('announcements')
              .select('*')
              .eq('is_active', true)
              .order('created_at', { ascending: false })
              .limit(3),
            supabase
              .from('text_reminders')
              .select('*')
              .order('sent_at', { ascending: false })
              .limit(4),
            supabase
              .from('maintenance_tickets')
              .select('*')
              .eq('lot_number', camperData.lot_number)
              .order('created_at', { ascending: false })
              .limit(5),
            supabase
              .from('office_messages')
              .select('id', { count: 'exact', head: true })
              .eq('camper_id', camperData.id)
              .eq('sender_role', 'admin')
              .is('camper_archived_at', null)
              .is('read_by_camper_at', null),
            session?.access_token
              ? fetch('/api/sewer-pump-out', {
                  headers: { Authorization: `Bearer ${session.access_token}` },
                })
                  .then((response) => response.ok ? response.json() : null)
                  .catch(() => null)
              : Promise.resolve(null),
            supabase
              .from('office_messages')
              .select('id,body,created_at,read_by_admin_at')
              .eq('camper_id', camperData.id)
              .eq('sender_role', 'camper')
              .is('camper_archived_at', null)
              .is('read_by_admin_at', null)
              .order('created_at', { ascending: false })
              .limit(3),
            session?.access_token
              ? fetch('/api/birthdays', {
                  headers: { Authorization: `Bearer ${session.access_token}` },
                })
                  .then((response) => response.json())
                  .catch(() => null)
              : Promise.resolve(null),
            supabase
              .from('site_care_notices')
              .select('*')
              .eq('camper_id', camperData.id)
              .neq('status', 'Resolved')
              .order('created_at', { ascending: false }),
          ])

        setInvoices(invoiceResult.data || [])
        setLatestElectric(electricResult.data || null)
        setDocuments(documentResult?.documents || [])
        setEvents(eventResult.data || [])
        setAnnouncements(announcementResult.data || [])
        let dismissedAlertIds = new Set<string>()
        try {
          const saved = window.localStorage.getItem(`bur-oaks-dismissed-alerts-${camperData.id}`)
          dismissedAlertIds = new Set((JSON.parse(saved || '[]') || []).map((id: unknown) => String(id)))
        } catch {
          dismissedAlertIds = new Set()
        }
        setAlerts((alertResult.data || []).filter((alert: any) => !dismissedAlertIds.has(String(alert.id))))
        setMaintenanceTickets(maintenanceResult.data || [])
        setUnreadOfficeMessages(messageResult.count || 0)
        setPumpOutRequests(pumpOutResult?.requests || [])
        setPumpOutServiceLots(pumpOutResult?.serviceLots || [camperData.lot_number].filter(Boolean))
        setOfficePendingMessages(pendingOfficeResult.data || [])
        setSiteCareNotices(siteCareResult.data || [])
        if (birthdayResult?.success) {
          setBirthdayBoard({
            monthName: birthdayResult.monthName || emptyBirthdayBoard.monthName,
            birthdays: birthdayResult.birthdays || [],
            setupRequired: Boolean(birthdayResult.setupRequired),
          })
        }
      } catch (error) {
        console.error('Unable to load camper portal:', error)
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()

    const refresh = () => loadDashboard()
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function updateSiteCareNotice(noticeId: string, action: 'acknowledge' | 'ready_for_review') {
    setSiteCareUpdating(noticeId)
    setSiteCareMessage('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/site-care-notices', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ id: noticeId, action }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'Unable to update this notice.')
      setSiteCareNotices((current) => current.map((notice) => notice.id === noticeId ? result.notice : notice))
      setSiteCareMessage(action === 'acknowledge' ? 'Thank you. The office can see that you received this notice.' : 'Thank you. The office has been told this is ready for review.')
    } catch (error: any) {
      setSiteCareMessage(error?.message || 'Unable to update this notice.')
    } finally {
      setSiteCareUpdating('')
    }
  }

  function dismissPortalAlert(alertId: string) {
    if (!camper?.id) return
    const key = `bur-oaks-dismissed-alerts-${camper.id}`
    let existing: string[] = []

    try {
      existing = JSON.parse(window.localStorage.getItem(key) || '[]') || []
    } catch {
      existing = []
    }

    const next = Array.from(new Set([...existing, String(alertId)])).slice(-100)
    window.localStorage.setItem(key, JSON.stringify(next))
    setAlerts((current) => current.filter((alert) => String(alert.id) !== String(alertId)))
  }

  function dismissAllPortalAlerts() {
    if (!camper?.id || alerts.length === 0) return
    const key = `bur-oaks-dismissed-alerts-${camper.id}`
    let existing: string[] = []

    try {
      existing = JSON.parse(window.localStorage.getItem(key) || '[]') || []
    } catch {
      existing = []
    }

    const next = Array.from(new Set([...existing, ...alerts.map((alert) => String(alert.id))])).slice(-100)
    window.localStorage.setItem(key, JSON.stringify(next))
    setAlerts([])
  }

  async function requestSewerPumpOut() {
    if (requestingPump) return

    setRequestingPump(true)
    setShowPumpConfirm(false)
    setPumpMessage('Sending your sewer pump-out request…')

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    if (!token) {
      window.location.href = '/login'
      return
    }

    const response = await fetch('/api/sewer-pump-out', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ serviceLot: selectedPumpLot || camper?.lot_number }),
    })
    const result = await response.json().catch(() => null)

    if (!response.ok) {
      setPumpMessage(result?.error || 'Unable to send pump-out request.')
      setRequestingPump(false)
      return
    }

    let emailNote = ''
    if (result?.duplicate) {
      setPumpMessage(`Lot ${result?.serviceLot || selectedPumpLot || camper?.lot_number || 'your site'} is already on the sewer pump-out list. No duplicate charge was added.`)
      setRequestingPump(false)
      return
    }

    if (result?.emailStatus === 'failed') emailNote = ' Office email alert failed, but the request was saved.'
    if (result?.emailStatus === 'skipped') emailNote = ' Office email alert skipped, but the request was saved.'

    const serviceLot = result?.serviceLot || selectedPumpLot || camper?.lot_number || 'your site'
    const billingLot = result?.billingLot || camper?.lot_number || 'your account'
    const chargeAmount = Number(result?.chargeAmount || getSewerPumpOutFeeForLot(serviceLot, 10))
    setPumpOutRequests((current) => result?.request
      ? [result.request, ...current.filter((request) => String(request.id) !== String(result.request.id))]
      : current)
    setPumpMessage(`Sewer pump-out requested for Lot ${serviceLot}. $${chargeAmount.toFixed(2)} will be added to the next electric bill for Lot ${billingLot}.${emailNote}`)
    setRequestingPump(false)
  }

  async function sendBirthdayWish(birthday: BirthdayEntry) {
    const key = `${birthday.recipientCamperId}:${birthday.profile}`
    if (birthdaySending || birthday.sentByMe || birthday.isMine) return

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      window.location.href = '/login'
      return
    }

    setBirthdaySending(key)
    setBirthdayMessage(`Sending birthday cheer to ${birthday.name}…`)

    try {
      const response = await fetch('/api/birthdays', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientCamperId: birthday.recipientCamperId,
          profile: birthday.profile,
        }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        setBirthdayMessage(result?.error || 'Unable to send birthday cheer right now.')
        return
      }

      if (result?.board) {
        setBirthdayBoard({
          monthName: result.board.monthName || birthdayBoard.monthName,
          birthdays: result.board.birthdays || [],
          setupRequired: Boolean(result.board.setupRequired),
        })
      }
      setBirthdayMessage(
        result?.alreadySent
          ? `You already sent ${birthday.name} birthday cheer this year.`
          : `🎉 Birthday cheer sent to ${birthday.name}!`
      )
    } catch {
      setBirthdayMessage('Unable to send birthday cheer right now.')
    } finally {
      setBirthdaySending('')
    }
  }

  async function saveSmsPromptDecision(decision: 'accepted' | 'declined') {
    if (!camper?.id || smsPromptSaving) return

    if (decision === 'accepted' && ![camper.phone, camper.alternate_phone, camper.second_profile_phone].some((phone) => String(phone || '').trim())) {
      setSmsPromptMessage('Add at least one mobile phone number to your profile before turning on text alerts.')
      return
    }

    setSmsPromptSaving(true)
    setSmsPromptMessage('')

    try {
      if (decision === 'accepted') {
        const data = await saveSmsConsentPreference(true)
        setCamper(data)
      }

      const decidedAt = new Date().toISOString()
      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          bur_oaks_sms_prompt_decision: decision,
          bur_oaks_sms_prompt_decided_at: decidedAt,
        },
      })

      if (metadataError) throw metadataError
      setSmsPromptDecision(decision)
    } catch (error: any) {
      setSmsPromptMessage(error?.message || 'Unable to save your choice. Please try again.')
    } finally {
      setSmsPromptSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="camper-portal-page">
        <div className="portal-loading">
          <TentTree size={34} />
          <p>Opening your camper portal…</p>
        </div>
      </main>
    )
  }

  const dueNowInvoices = invoices.filter((invoice) => isInvoiceDueNow(invoice))
  const openBalance = totalInvoiceBalance(dueNowInvoices)
  const nextEvent = events[0]
  const documentsNeedingSignature = documents.filter(
    (document) =>
      document.signature_status !== 'signed' &&
      document.signature_status !== 'not_required' &&
      document.signature_status !== 'declined'
  )
  const insuranceOnFile = documents.some(
    (document) => document.document_type === 'Golf Cart Insurance'
  )
  const activeMaintenance = maintenanceTickets.filter(
    (ticket) => ticket.status !== 'Completed'
  )
  const activePumpOutRequests = pumpOutRequests.filter(
    (request) => request.status !== 'cancelled' && !request.billed_at
  )
  const activeSiteCare = siteCareNotices.filter((notice) => notice.status !== 'Resolved')
  const latestMaintenance = maintenanceTickets[0]
  const latestMaintenanceStatus = getMaintenanceDisplayStatus(latestMaintenance)
  const maintenanceHeadline = activeMaintenance.length
    ? `${latestMaintenanceStatus} · ${activeMaintenance.length} active`
    : latestMaintenance?.status === 'Completed'
      ? 'Completed'
      : 'No active requests'
  const maintenanceDetail = latestMaintenance
    ? `${latestMaintenance.title || 'Latest request'} · ${latestMaintenanceStatus}`
    : 'No open maintenance requests for your lot right now.'
  const latestAnnouncement = announcements[0]
  const profileFields = [
    camper?.phone,
    camper?.emergency_contact_name,
    camper?.emergency_contact_phone,
    camper?.vehicle_make,
    camper?.vehicle_model,
    camper?.license_plate,
  ]
  const completedProfileFields = profileFields.filter(Boolean).length
  const profileCompletion = Math.round((completedProfileFields / profileFields.length) * 100)
  const contactInfoComplete = Boolean(camper?.email || camper?.secondary_email) && Boolean(camper?.phone)
  const mailingAddressComplete = Boolean(
    camper?.mailing_address_line1 &&
    camper?.mailing_city &&
    camper?.mailing_state &&
    camper?.mailing_zip
  )
  const firstLoginTasks = [
    {
      label: 'Confirm phone and email',
      detail: 'So the office can reach the right person quickly.',
      complete: contactInfoComplete,
      href: '/profile',
    },
    {
      label: 'Add mailing address',
      detail: 'Required for paper notices if we ever need to mail something.',
      complete: mailingAddressComplete,
      href: '/profile',
    },
    {
      label: 'Review documents',
      detail: documentsNeedingSignature.length ? `${documentsNeedingSignature.length} waiting for signature.` : 'Documents are caught up.',
      complete: documentsNeedingSignature.length === 0,
      href: '/documents',
    },
    {
      label: 'Check payments',
      detail: dueNowInvoices.length ? `${dueNowInvoices.length} invoice${dueNowInvoices.length === 1 ? '' : 's'} due now.` : 'No payment is due right now.',
      complete: dueNowInvoices.length === 0,
      href: '/invoices',
    },
    {
      label: 'Choose your text alert preference',
      detail: smsPromptDecision === 'declined'
        ? 'You chose not to receive text alerts. You can turn them on later in Profile.'
        : 'Get office notices, bill reminders, and urgent updates faster.',
      complete: Boolean(smsPromptDecision),
      href: smsPromptDecision ? '/profile' : '/portal#text-alert-choice',
    },
  ]
  const completedTasks = firstLoginTasks.filter((task) => task.complete).length
  const onboardingComplete = completedTasks === firstLoginTasks.length
  const weekendFocus = activeSiteCare.length
    ? {
        href: '#site-care',
        title: 'Site care notice',
        detail: `${activeSiteCare.length} site item${activeSiteCare.length === 1 ? '' : 's'} from the office to review.`,
        action: 'Review site care',
      }
    : documentsNeedingSignature.length
    ? {
        href: '/documents',
        title: 'Signature needed',
        detail: `${documentsNeedingSignature.length} document${documentsNeedingSignature.length === 1 ? '' : 's'} waiting for you.`,
        action: 'Review documents',
      }
    : dueNowInvoices.length
      ? {
          href: '/invoices',
          title: 'Balance to review',
          detail: `$${openBalance.toFixed(2)} due across ${dueNowInvoices.length} invoice${dueNowInvoices.length === 1 ? '' : 's'}.`,
          action: 'Open billing',
        }
      : nextEvent
        ? {
            href: '/calendar',
            title: 'Plan around the next event',
            detail: `${nextEvent.title} is coming up ${formatDate(nextEvent.event_date)}.`,
            action: 'View calendar',
          }
        : {
            href: '/maintenance',
            title: 'Everything looks calm',
            detail: 'No urgent portal items right now. Enjoy your time at Bur Oaks.',
            action: 'Need maintenance?',
        }
  const today = new Date().toISOString().slice(0, 10)
  const upcomingDinners = saturdayDinners2026
    .filter((dinner) => dinner.date >= today && !dinner.closed)
    .slice(0, 2)
  const siteReadiness = [
    { label: 'Profile', value: `${profileCompletion}%`, complete: profileCompletion >= 80 },
    { label: 'Documents', value: documentsNeedingSignature.length ? `${documentsNeedingSignature.length} open` : 'Clear', complete: documentsNeedingSignature.length === 0 },
    { label: 'Balance', value: dueNowInvoices.length ? `$${openBalance.toFixed(2)}` : '$0.00', complete: dueNowInvoices.length === 0 },
    { label: 'Maintenance', value: activeMaintenance.length ? latestMaintenanceStatus : latestMaintenance?.status === 'Completed' ? 'Completed' : 'None', complete: activeMaintenance.length === 0 },
  ]
  const urgentCount =
    (documentsNeedingSignature.length ? 1 : 0) +
    (dueNowInvoices.length ? 1 : 0) +
    (activeMaintenance.length ? 1 : 0) +
    (activePumpOutRequests.length ? 1 : 0) +
    (officePendingMessages.length ? 1 : 0)
    + (activeSiteCare.length ? 1 : 0)
  const nextDinner = upcomingDinners[0]
  const portalMood = urgentCount
    ? `${urgentCount} thing${urgentCount === 1 ? '' : 's'} need attention`
    : 'Your portal is all caught up'
  const portalSeason = getPortalSeason()
  const seasonalTheme = getSeasonalTheme()
  const urgentAnnouncement = announcements.find((announcement) => announcement.is_urgent)
  const campgroundPulse = [
    {
      label: 'Next dinner',
      value: nextDinner ? `${nextDinner.month} ${nextDinner.day}` : 'Menu',
      detail: nextDinner?.menu || 'View schedule',
      href: nextDinner ? `/dinners?date=${nextDinner.date}` : '/dinners',
      icon: Soup,
    },
    {
      label: 'Next event',
      value: nextEvent?.title || 'Calendar',
      detail: nextEvent ? formatDate(nextEvent.event_date) : 'See what is coming up',
      href: '/calendar',
      icon: CalendarDays,
    },
    {
      label: 'Office notes',
      value: announcements.length ? announcements.length : 'Clear',
      detail: urgentAnnouncement ? 'Urgent notice posted' : latestAnnouncement?.title || 'No new announcements',
      href: '/portal',
      icon: Megaphone,
    },
    {
      label: 'Weather plan',
      value: 'Live forecast',
      detail: 'Check the weekend before you pack',
      href: '#weather',
      icon: Sparkles,
    },
  ]
  const camperInitials = `${camper?.first_name?.[0] || ''}${camper?.last_name?.[0] || ''}`.toUpperCase() || 'BO'
  const welcomeNames = [camper?.first_name, camper?.second_profile_first_name]
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .join(' and ') || 'Camper'
  const identityBadges = [
    { label: 'Profile', value: `${profileCompletion}%`, complete: profileCompletion >= 80 },
    { label: 'Insurance', value: insuranceOnFile ? 'On file' : 'Optional', complete: true },
    { label: 'Texts', value: camper?.sms_opt_in ? 'On' : 'Off', complete: camper?.sms_opt_in === true },
  ]
  const whatIsNew = [
    ...(activeSiteCare.length
      ? [{
          href: '#site-care',
          label: 'Site care',
          title: `${activeSiteCare.length} notice${activeSiteCare.length === 1 ? '' : 's'} from the office`,
          tone: 'urgent',
          icon: ClipboardCheck,
        }]
      : []),
    ...(unreadOfficeMessages > 0
      ? [{
          href: '/messages',
          label: 'Office message',
          title: `${unreadOfficeMessages} unread message${unreadOfficeMessages === 1 ? '' : 's'}`,
          tone: 'urgent',
          icon: MessageCircle,
        }]
      : []),
    ...(urgentAnnouncement
      ? [{
          href: '/portal',
          label: 'Urgent notice',
          title: urgentAnnouncement.title,
          tone: 'urgent',
          icon: Megaphone,
        }]
      : []),
    ...(documentsNeedingSignature.length
      ? [{
          href: '/documents',
          label: 'Signature needed',
          title: `${documentsNeedingSignature.length} document${documentsNeedingSignature.length === 1 ? '' : 's'} waiting`,
          tone: 'attention',
          icon: FileText,
        }]
      : []),
    ...(dueNowInvoices.length
      ? [{
          href: '/invoices',
          label: 'Payment ready',
          title: `$${openBalance.toFixed(2)} due now`,
          tone: 'attention',
          icon: ReceiptText,
        }]
      : []),
    ...(activeMaintenance.length
      ? [{
          href: '/maintenance',
          label: 'Maintenance',
          title: maintenanceHeadline,
          tone: 'attention',
          icon: Wrench,
        }]
      : []),
    ...(nextDinner
      ? [{
          href: `/dinners?date=${nextDinner.date}`,
          label: 'Saturday dinner',
          title: `${nextDinner.month} ${nextDinner.day}: ${nextDinner.menu}`,
          tone: 'good',
          icon: Soup,
        }]
      : []),
    ...(nextEvent
      ? [{
          href: '/calendar',
          label: 'Next event',
          title: `${nextEvent.title} · ${formatDate(nextEvent.event_date)}`,
          tone: 'good',
          icon: CalendarDays,
        }]
      : []),
  ].slice(0, 5)
  const camperCockpitItems = [
    ...activeSiteCare.slice(0, 2).map((notice) => ({
      href: '#site-care',
      label: 'Site care',
      title: notice.title,
      detail: notice.message,
      status: notice.status,
      tone: notice.priority === 'Important' ? 'red' : 'gold',
      icon: ClipboardCheck,
    })),
    ...dueNowInvoices.slice(0, 2).map((invoice) => ({
      href: '/invoices',
      label: 'Billing',
      title: `$${Number(invoice.total_due || 0).toFixed(2)} open invoice`,
      detail: `Due ${formatDate(invoice.due_date)}. Open it to see the full itemized breakdown.`,
      status: 'Needs review',
      tone: 'gold',
      icon: ReceiptText,
    })),
    ...documentsNeedingSignature.slice(0, 2).map((document) => ({
      href: '/documents',
      label: 'Documents',
      title: document.title || document.name || 'Document waiting',
      detail: 'The office has a document waiting for your review or signature.',
      status: 'Action needed',
      tone: 'gold',
      icon: FileText,
    })),
    ...activePumpOutRequests.slice(0, 2).map((request) => ({
      href: '/portal#pump-out',
      label: 'Pump-out',
      title: request.status === 'completed' ? 'Pump-out completed' : 'Pump-out request received',
      detail: request.status === 'completed'
        ? `$${Number(request.charge_amount || 10).toFixed(2)} will be added to your next electric bill.`
        : 'Your site is on the office pump-out list. No duplicate request is needed.',
      status: request.status === 'completed' ? 'Completed' : 'In office queue',
      tone: request.status === 'completed' ? 'green' : 'red',
      icon: Droplets,
    })),
    ...activeMaintenance.slice(0, 2).map((ticket) => ({
      href: '/maintenance',
      label: 'Maintenance',
      title: ticket.title || 'Maintenance request',
      detail: ticket.admin_approved ? `Current status: ${ticket.status || 'Open'}` : 'Waiting for office approval before work begins.',
      status: getMaintenanceDisplayStatus(ticket),
      tone: ticket.admin_approved ? 'blue' : 'orange',
      icon: Wrench,
    })),
    ...officePendingMessages.slice(0, 2).map((message) => ({
      href: '/messages',
      label: 'Office inbox',
      title: 'Message sent to office',
      detail: message.body || 'Your message is waiting for the office to review.',
      status: 'Waiting on office',
      tone: 'blue',
      icon: MessageCircle,
    })),
    ...(unreadOfficeMessages > 0
      ? [{
          href: '/messages',
          label: 'Office reply',
          title: `${unreadOfficeMessages} unread office message${unreadOfficeMessages === 1 ? '' : 's'}`,
          detail: 'The office replied. Open your inbox when you have a minute.',
          status: 'New reply',
          tone: 'red',
          icon: MessageCircle,
        }]
      : []),
  ].slice(0, 8)
  const completedCamperSignals = [
    latestMaintenance?.status === 'Completed' ? 'Latest maintenance request completed' : '',
    pumpOutRequests.some((request) => request.status === 'completed' || request.billed_at) ? 'Recent pump-out completed or moved to billing' : '',
    !dueNowInvoices.length ? 'No payment due now' : '',
    !documentsNeedingSignature.length ? 'Documents caught up' : '',
  ].filter(Boolean)
  const mobileMoreNeedsAttention = documentsNeedingSignature.length > 0 || alerts.length > 0
  const pumpNeedsAttention = activePumpOutRequests.length > 0
  const availablePumpOutLots = pumpOutServiceLots.length
    ? pumpOutServiceLots
    : [camper?.lot_number].filter(Boolean) as string[]
  const activeSelectedPumpOutRequests = activePumpOutRequests.filter(
    (request) => String(request.lot_number || '').trim().toUpperCase() === String(selectedPumpLot || camper?.lot_number || '').trim().toUpperCase()
  )
  const displayedPumpOutFee = getSewerPumpOutFeeForLot(selectedPumpLot || camper?.lot_number, 10)

  return (
    <main className="camper-portal-page">
      <div className="portal-shell">
        <section className={`portal-hero portal-season-${portalSeason} portal-holiday-${seasonalTheme.key}`}>
          <nav className="portal-topbar" aria-label="Camper portal navigation">
            <a className="portal-brand" href="/portal">
              <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
              <span>
                <strong>Bur Oaks</strong>
                <small>Camper Portal</small>
              </span>
            </a>

            <button className="portal-logout" type="button" onClick={handleLogout}>
              <LogOut size={17} />
              Sign out
            </button>
          </nav>

          <div className="portal-hero-content">
            <div className="portal-seasonal-banner" aria-label={`${seasonalTheme.label}. ${seasonalTheme.detail}.`}>
              <span aria-hidden="true">{seasonalTheme.symbol}</span>
              <div>
                <strong>{seasonalTheme.label}</strong>
                <small>{seasonalTheme.detail}</small>
              </div>
            </div>
            <div className="portal-eyebrow">
              <TentTree size={16} /> Your campground home base
            </div>
            <div className="portal-site-badge">
              <MapPin size={18} />
              <div>
                <small>Your site</small>
                <strong>Lot {camper?.lot_number || '—'}</strong>
              </div>
            </div>
            <h1>Welcome back, {welcomeNames}.</h1>
            <p>
              Everything for your stay at Bur Oaks—from account details to
              campground happenings—is right here.
            </p>

            <PortalWeatherMini variant="hero" />

            <section className="portal-identity-card" aria-label="Camper site badge">
              <div className="portal-identity-avatar">{camperInitials}</div>
              <div>
                <small>My Bur Oaks site</small>
                <strong>Lot {camper?.lot_number || '—'}</strong>
                <span>{camper?.first_name || ''} {camper?.last_name || ''}</span>
              </div>
              <div className="portal-identity-badges">
                {identityBadges.map((badge) => (
                  <a className={badge.complete ? 'complete' : 'attention'} href={badge.label === 'Texts' ? '/invoices' : '/profile'} key={badge.label}>
                    {badge.complete ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    <span>{badge.label}: {badge.value}</span>
                  </a>
                ))}
              </div>
            </section>

            <div className="portal-hero-actions">
              <a className="portal-office-chat-action" href="/messages">
                <span><MessageCircle size={18} /><i aria-hidden="true" /></span>
                <span>
                  <small>Office chat available</small>
                  <strong>Chat with us</strong>
                </span>
                <ArrowRight size={18} />
              </a>
              <a className="portal-primary-action" href="/invoices">
                Billing & payments <ArrowRight size={18} />
              </a>
              <a className="portal-secondary-action" href="/site">
                View my site
              </a>
              <a className="portal-secondary-action" href="/maintenance">
                Request maintenance
              </a>
            </div>
          </div>

        </section>

        {!smsPromptDecision && (
          <section className="portal-sms-choice" id="text-alert-choice" aria-labelledby="portal-sms-choice-title">
            <div className="portal-sms-choice-icon" aria-hidden="true">
              <Bell size={25} />
            </div>
            <div className="portal-sms-choice-content">
              <span>IMPORTANT PORTAL SETUP</span>
              <h2 id="portal-sms-choice-title">Don’t miss important Bur Oaks updates.</h2>
              <p>
                Text alerts put <strong>new bill and invoice notifications</strong>, payment reminders,
                office messages, campground announcements, gate and utility notices, maintenance and
                pump-out updates, and urgent weather information on your phone right away. It keeps you
                informed without the back-and-forth of Facebook Messenger.
              </p>
              <p className="portal-sms-choice-each">
                <UsersRound size={17} /> Every person with their own portal login should make their own choice.
              </p>

              <label className="portal-sms-choice-consent">
                <input
                  type="checkbox"
                  checked={smsPromptChecked}
                  onChange={(event) => setSmsPromptChecked(event.target.checked)}
                />
                <span>
                  <strong>I agree to receive Bur Oaks Campground text alerts</strong>
                  <small>
                    By checking this box, I agree to receive recurring, non-marketing SMS messages from
                    Bur Oaks Campground at all mobile phone numbers saved on my household profile about invoices and
                    payment reminders for my site and any family sites I am authorized to pay, account notices, maintenance and sewer pump-out updates, gate and
                    utility notices, office notices, upcoming event reminders (including Wednesday
                    reminders for events within the next two weeks), safety and weather alerts, and other
                    campground operations notices. Message frequency varies. Message and data rates may apply. Reply
                    HELP for help or STOP to opt out. Consent is optional and is not a condition of
                    campground service. I confirm I have permission to enroll each saved household number. <a href="/sms-terms">SMS Terms</a> · <a href="/privacy">Privacy Policy</a>
                  </small>
                </span>
              </label>

              {![camper?.phone, camper?.alternate_phone, camper?.second_profile_phone].some((phone) => String(phone || '').trim()) && (
                <p className="portal-sms-choice-phone">
                  A mobile number is needed first. <a href="/profile">Add your phone number in Profile</a>.
                </p>
              )}

              <div className="portal-sms-choice-actions">
                <button
                  type="button"
                  disabled={!smsPromptChecked || ![camper?.phone, camper?.alternate_phone, camper?.second_profile_phone].some((phone) => String(phone || '').trim()) || smsPromptSaving}
                  onClick={() => saveSmsPromptDecision('accepted')}
                >
                  <Bell size={17} /> {smsPromptSaving ? 'Saving…' : 'Turn on text alerts'}
                </button>
                <button
                  className="secondary"
                  type="button"
                  disabled={smsPromptSaving}
                  onClick={() => saveSmsPromptDecision('declined')}
                >
                  No thanks
                </button>
              </div>
              <small className="portal-sms-choice-note">
                After you choose either option, this notice will leave your homepage. You can change text alerts later in Camper Profile.
              </small>
              {smsPromptMessage && <p className="portal-sms-choice-message">{smsPromptMessage}</p>}
            </div>
          </section>
        )}

        <section className="portal-arrival-card" aria-label="Today at your site">
          <div className="portal-arrival-main">
            <span><Sparkles size={16} /> {formatFriendlyToday()}</span>
            <h2>Lot {camper?.lot_number || '—'} is ready for the weekend.</h2>
            <p>{portalMood}. Weather, billing, documents, dinners, and requests are all gathered here so you do not have to hunt around.</p>
            {unreadOfficeMessages > 0 && (
              <a className="portal-office-message-alert" href="/messages">
                <span><MessageCircle size={17} /> New message from office</span>
                <strong>{unreadOfficeMessages}</strong>
              </a>
            )}
            <div className="portal-arrival-actions">
              <a href={weekendFocus.href}>{weekendFocus.action} <ArrowRight size={16} /></a>
              <a href="/dinners">Saturday dinners</a>
              <a href="/maintenance">Need help?</a>
            </div>
          </div>

          <div className="portal-arrival-status">
            <a href="/invoices" className={dueNowInvoices.length ? 'attention' : 'good'}>
              <small>Balance</small>
              <strong>{dueNowInvoices.length ? `$${openBalance.toFixed(2)}` : '$0.00'}</strong>
              <em>{dueNowInvoices.length ? `${dueNowInvoices.length} invoice${dueNowInvoices.length === 1 ? '' : 's'} due` : 'Nothing due'}</em>
            </a>
            <a href="/documents" className={documentsNeedingSignature.length ? 'attention' : 'good'}>
              <small>Documents</small>
              <strong>{documentsNeedingSignature.length || documents.length}</strong>
              <em>{documentsNeedingSignature.length ? 'Need signature' : 'Ready'}</em>
            </a>
            <a href="/maintenance" className={activeMaintenance.length ? 'attention' : 'good'}>
              <small>Requests</small>
              <strong>{activeMaintenance.length || '0'}</strong>
              <em>{activeMaintenance.length ? latestMaintenanceStatus : 'No active work'}</em>
            </a>
            <a href={nextDinner ? `/dinners?date=${nextDinner.date}` : '/dinners'} className="good">
              <small>Next dinner</small>
              <strong>{nextDinner ? `${nextDinner.month} ${nextDinner.day}` : 'Menu'}</strong>
              <em>{nextDinner?.menu || 'View schedule'}</em>
            </a>
          </div>
        </section>

        {activeSiteCare.length > 0 && (
          <section className="portal-site-care" id="site-care" aria-label="Site care notices from the office">
            <div className="portal-site-care-heading">
              <span className="portal-site-care-icon"><Leaf size={25} /></span>
              <div>
                <small>A FRIENDLY NOTE FROM THE OFFICE</small>
                <h2>Let’s keep your site looking its best.</h2>
                <p>These items stay here until they are handled, so you do not have to search through texts.</p>
              </div>
              <span className="portal-site-care-count">{activeSiteCare.length} active</span>
            </div>

            <div className="portal-site-care-list">
              {activeSiteCare.map((notice) => (
                <article className={notice.priority === 'Important' ? 'important' : ''} key={notice.id}>
                  <div className="portal-site-care-notice-top">
                    <span><ClipboardCheck size={18} /></span>
                    <div>
                      <small>{notice.priority === 'Important' ? 'IMPORTANT SITE ITEM' : 'SITE CARE ITEM'}{notice.due_date ? ` · REQUESTED BY ${formatDate(notice.due_date)}` : ''}</small>
                      <h3>{notice.title}</h3>
                    </div>
                    <em>{notice.status}</em>
                  </div>
                  <p>{notice.message}</p>
                  <div className="portal-site-care-actions">
                    {notice.status === 'Open' && (
                      <button type="button" disabled={siteCareUpdating === notice.id} onClick={() => updateSiteCareNotice(notice.id, 'acknowledge')}>
                        <Eye size={16} /> I understand
                      </button>
                    )}
                    {notice.status !== 'Ready for Review' ? (
                      <button className="complete" type="button" disabled={siteCareUpdating === notice.id} onClick={() => updateSiteCareNotice(notice.id, 'ready_for_review')}>
                        <CheckCircle2 size={16} /> This is taken care of
                      </button>
                    ) : (
                      <span><CheckCircle2 size={16} /> Office review requested</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {siteCareMessage && <p className="portal-site-care-message">{siteCareMessage}</p>}
          </section>
        )}

        <section className="portal-quick-actions portal-quick-actions-top" aria-label="Camper quick actions">
          <a className={dueNowInvoices.length ? 'attention' : ''} href="/invoices">
            <ReceiptText size={20} />
            <span>
              <small>{dueNowInvoices.length ? 'Payment ready' : 'Billing'}</small>
              <strong>{dueNowInvoices.length ? `$${openBalance.toFixed(2)} due` : 'All clear'}</strong>
            </span>
          </a>
          <a className={documentsNeedingSignature.length ? 'attention' : ''} href="/documents">
            <FileText size={20} />
            <span>
              <small>{documentsNeedingSignature.length ? 'Signature needed' : 'Documents'}</small>
              <strong>{documentsNeedingSignature.length ? `${documentsNeedingSignature.length} waiting` : `${documents.length} available`}</strong>
            </span>
          </a>
          <a href="/maintenance">
            <Wrench size={20} />
            <span>
              <small>Maintenance</small>
              <strong>{activeMaintenance.length ? `${activeMaintenance.length} active` : 'Request help'}</strong>
            </span>
          </a>
          <a className={unreadOfficeMessages > 0 ? 'attention' : ''} href="/messages">
            <MessageCircle size={20} />
            <span>
              <small>{unreadOfficeMessages > 0 ? 'New office message' : 'Chat with the Office'}</small>
              <strong>{unreadOfficeMessages > 0 ? `${unreadOfficeMessages} unread` : 'Contact office'}</strong>
            </span>
          </a>
          <a href={upcomingDinners[0] ? `/dinners?date=${upcomingDinners[0].date}` : '/dinners'}>
            <Soup size={20} />
            <span>
              <small>Saturday dinner</small>
              <strong>{upcomingDinners[0] ? `${upcomingDinners[0].month} ${upcomingDinners[0].day}` : 'View menu'}</strong>
            </span>
          </a>
        </section>

        <section className="portal-birthday-club" aria-label={`${birthdayBoard.monthName} camper birthdays`}>
          <div className="portal-birthday-confetti" aria-hidden="true">
            <i /><i /><i /><i /><i /><i />
          </div>
          <div className="portal-birthday-heading">
            <span className="portal-birthday-icon"><CakeSlice size={27} /></span>
            <div>
              <small>BUR OAKS BIRTHDAY CLUB</small>
              <h2>{birthdayBoard.monthName} birthdays</h2>
              <p>A little campground cheer for the neighbors celebrating this month.</p>
            </div>
            <PartyPopper size={32} />
          </div>

          {birthdayBoard.birthdays.length ? (
            <div className="portal-birthday-grid">
              {birthdayBoard.birthdays.map((birthday) => {
                const wishKey = `${birthday.recipientCamperId}:${birthday.profile}`
                const isSending = birthdaySending === wishKey

                return (
                  <article className={birthday.isToday ? 'today' : ''} key={wishKey}>
                    <div className="portal-birthday-date">
                      <small>{birthdayBoard.monthName.slice(0, 3)}</small>
                      <strong>{birthday.day}</strong>
                    </div>
                    <div className="portal-birthday-person">
                      <small>{birthday.isToday ? 'CELEBRATING TODAY!' : 'BIRTHDAY COMING UP'}</small>
                      <strong>{birthday.name}</strong>
                      <span>{birthday.lotNumber ? `Lot ${birthday.lotNumber}` : 'Bur Oaks camper'}</span>
                      {birthday.wishCount > 0 && (
                        <em><Gift size={13} /> {birthday.wishCount} birthday wish{birthday.wishCount === 1 ? '' : 'es'}</em>
                      )}
                    </div>
                    {birthday.isMine ? (
                      <span className="portal-birthday-own">
                        <Sparkles size={16} /> That’s you!
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={birthday.sentByMe || isSending || Boolean(birthdaySending)}
                        onClick={() => sendBirthdayWish(birthday)}
                      >
                        {birthday.sentByMe ? <CheckCircle2 size={16} /> : <Gift size={16} />}
                        {isSending ? 'Sending…' : birthday.sentByMe ? 'Wish sent' : 'Send birthday cheer'}
                      </button>
                    )}
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="portal-birthday-empty">
              <Gift size={25} />
              <div>
                <strong>No birthdays have been shared for {birthdayBoard.monthName} yet.</strong>
                <p>Add yours in your camper profile and choose to join the birthday board.</p>
              </div>
              <a href="/profile">Add my birthday <ArrowRight size={16} /></a>
            </div>
          )}

          {birthdayMessage && <p className="portal-birthday-message">{birthdayMessage}</p>}
          {!birthdayBoard.setupRequired && (
            <div className="portal-birthday-privacy">
              <ShieldCheck size={14} /> Birth years stay private. Only month, day, first name, last initial, and lot are shared.
            </div>
          )}
        </section>

        {!onboardingComplete && (
          <section className="portal-start-here" aria-label="Start here checklist">
            <div className="portal-start-copy">
              <span><Sparkles size={16} /> START HERE</span>
              <h2>Let’s get your portal fully ready.</h2>
              <p>
                Complete these quick setup items once. When everything is checked off,
                this guide disappears and your portal stays clean.
              </p>
              <div className="portal-start-meter">
                <strong>{completedTasks} of {firstLoginTasks.length}</strong>
                <span><i style={{ width: `${Math.round((completedTasks / firstLoginTasks.length) * 100)}%` }} /></span>
              </div>
            </div>

            <div className="portal-start-list">
              {firstLoginTasks.map((task) => (
                <a href={task.href} className={task.complete ? 'done' : 'todo'} key={task.label}>
                  {task.complete ? <CheckCircle2 size={18} /> : <ArrowRight size={18} />}
                  <span>
                    <strong>{task.label}</strong>
                    <small>{task.detail}</small>
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        <section className={camperCockpitItems.length ? 'portal-cockpit active' : 'portal-cockpit'} aria-label="My Bur Oaks cockpit">
          <div className="portal-cockpit-top">
            <div>
              <span><Gauge size={16} /> MY BUR OAKS COCKPIT</span>
              <h2>{camperCockpitItems.length ? 'Here is what is moving for your site.' : 'Everything looks caught up.'}</h2>
              <p>
                Pump-outs, maintenance, billing, documents, and office messages show here so you can see what is requested, waiting, or completed.
              </p>
            </div>
            <div className="portal-cockpit-orb">
              <strong>{camperCockpitItems.length || 'OK'}</strong>
              <small>{camperCockpitItems.length ? 'live items' : 'all clear'}</small>
            </div>
          </div>

          {camperCockpitItems.length ? (
            <div className="portal-cockpit-grid">
              {camperCockpitItems.map((item, index) => {
                const Icon = item.icon

                return (
                  <a className={`portal-cockpit-card ${item.tone}`} href={item.href} key={`${item.label}-${item.title}-${index}`}>
                    <span><Icon size={19} /></span>
                    <div>
                      <small>{item.label}</small>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                    <em>{item.status}</em>
                  </a>
                )
              })}
            </div>
          ) : (
            <div className="portal-cockpit-clear">
              <ShieldCheck size={24} />
              <strong>No open requests or loose ends.</strong>
              <p>If you request a pump-out, submit maintenance, send the office a message, or get a new invoice, it will appear here automatically.</p>
            </div>
          )}

          {completedCamperSignals.length > 0 && (
            <div className="portal-cockpit-completed">
              <span><CheckCircle2 size={16} /> Completed / caught up</span>
              {completedCamperSignals.slice(0, 4).map((signal) => (
                <small key={signal}>{signal}</small>
              ))}
            </div>
          )}
        </section>

        <details className="portal-dashboard-drawer">
          <summary>
            <span><Gauge size={18} /> More status details</span>
            <small>What’s new and the campground pulse</small>
            <ChevronRight size={18} />
          </summary>
          <div className="portal-dashboard-drawer-content">
        <section className="portal-command-center" aria-label="What is new at Bur Oaks">
          <div className="portal-command-heading">
            <div>
              <span><Bell size={16} /> WHAT’S NEW</span>
              <h2>Your quick check before you head out.</h2>
            </div>
            <a href="/messages">Message office <ArrowRight size={16} /></a>
          </div>

          <div className="portal-command-grid">
            {whatIsNew.length === 0 ? (
              <article className="portal-command-item good">
                <CheckCircle2 size={20} />
                <span>
                  <small>All clear</small>
                  <strong>No new action items right now</strong>
                </span>
              </article>
            ) : (
              whatIsNew.map((item) => {
                const Icon = item.icon

                return (
                  <a className={`portal-command-item ${item.tone}`} href={item.href} key={`${item.label}-${item.title}`}>
                    <Icon size={20} />
                    <span>
                      <small>{item.label}</small>
                      <strong>{item.title}</strong>
                    </span>
                    <ChevronRight size={18} />
                  </a>
                )
              })
            )}
          </div>
        </section>

        <section className="portal-pulse-card" aria-label="Campground pulse">
          <div>
            <span><Sparkles size={16} /> CAMPGROUND PULSE</span>
            <h2>What’s happening around Bur Oaks.</h2>
          </div>
          <div className="portal-pulse-grid">
            {campgroundPulse.map((item) => {
              const Icon = item.icon

              return (
                <a href={item.href} key={item.label}>
                  <Icon size={20} />
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                  <em>{item.detail}</em>
                </a>
              )
            })}
          </div>
        </section>
          </div>
        </details>

        <section className="portal-pumpout-alert">
          <div>
            <span><Droplets size={18} /> SEWER PUMP-OUT</span>
            <h2>Need your sewer pumped?</h2>
            <p>{availablePumpOutLots.length > 1
              ? `Choose the campsite that needs service. The charge will stay on your Lot ${camper?.lot_number || 'billing'} account.`
              : `Tap the red button and the office will add you to the pump-out list. A $${displayedPumpOutFee.toFixed(2)} charge is added to your next electric bill.`}</p>
            {pumpMessage && <small>{pumpMessage}</small>}
          </div>
          <div className="portal-pumpout-actions">
            {availablePumpOutLots.map((lot) => (
              <button
                type="button"
                key={lot}
                onClick={() => { setSelectedPumpLot(lot); setShowPumpConfirm(true) }}
                disabled={requestingPump}
              >
                {requestingPump ? 'Sending…' : availablePumpOutLots.length > 1 ? `Pump Lot ${lot}` : 'Request pump-out'}
              </button>
            ))}
          </div>
        </section>

        <div id="weather">
          <PortalWeather />
        </div>

        <section className="portal-weekend-planner">
          <div className="portal-planner-main">
            <span><Sparkles size={16} /> WEEKEND PLANNER</span>
            <h2>{weekendFocus.title}</h2>
            <p>{weekendFocus.detail}</p>
            <div className="portal-planner-actions">
              <a href={weekendFocus.href}>{weekendFocus.action} <ArrowRight size={16} /></a>
              <a href="/site">Open My Site</a>
            </div>

            {upcomingDinners.length > 0 && (
              <div className="portal-planner-dinners">
                <div>
                  <Soup size={16} />
                  <span>Saturday dinner</span>
                </div>
                {upcomingDinners.map((dinner) => (
                  <a href={`/dinners?date=${dinner.date}`} key={dinner.id}>
                    <small>{dinner.month} {dinner.day} · 6 PM</small>
                    <strong>{dinner.menu}</strong>
                    {dinner.theme && <em>{dinner.theme}</em>}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="portal-readiness-stack">
            {siteReadiness.map((item) => (
              <article className={item.complete ? 'complete' : 'attention'} key={item.label}>
                <span>{item.complete ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</span>
                <div>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                </div>
              </article>
            ))}
          </div>

          <aside className="portal-next-best">
            <ShieldCheck size={24} />
            <div>
              <small>Campground concierge</small>
              <strong>{nextEvent ? nextEvent.title : 'No event posted yet'}</strong>
              <p>{nextEvent ? `${formatDate(nextEvent.event_date)} · RSVP and see event details.` : 'Check back for the next Bur Oaks event.'}</p>
            </div>
            <a href="/calendar">Events</a>
          </aside>
        </section>

        <EventFlyerShowcase context="portal" limit={4} />

        <details className="portal-dashboard-drawer portal-account-drawer">
          <summary>
            <span><ClipboardCheck size={18} /> More account details</span>
            <small>Weekend brief, checklist, electric, and account snapshot</small>
            <ChevronRight size={18} />
          </summary>
          <div className="portal-dashboard-drawer-content">
        <section className="portal-weekend-brief">
          <div className="portal-section-heading">
            <div>
              <span>THIS WEEKEND AT BUR OAKS</span>
              <h2>A quick glance before you pack the cooler</h2>
            </div>
            <a href="/calendar">See all events <ArrowRight size={16} /></a>
          </div>

          <div className="portal-weekend-brief-grid">
            <article>
              <CalendarDays size={22} />
              <small>Next event</small>
              <strong>{nextEvent?.title || 'Nothing posted yet'}</strong>
              <p>{nextEvent ? `${formatDate(nextEvent.event_date)} · RSVP from the calendar.` : 'The next campground event will show here as soon as it is posted.'}</p>
            </article>

            <article>
              <Megaphone size={22} />
              <small>Latest note</small>
              <strong>{latestAnnouncement?.title || 'No new announcements'}</strong>
              <p>{latestAnnouncement?.message || 'Important campground updates will appear right here.'}</p>
            </article>

            <article>
              <Wrench size={22} />
              <small>Site check</small>
              <strong>{maintenanceHeadline}</strong>
              <p>{maintenanceDetail}</p>
            </article>
          </div>
        </section>

        <section className="portal-today-panel">
          <div className="portal-section-heading">
            <div>
              <span>TODAY AT BUR OAKS</span>
              <h2>Your quick campground check-in</h2>
            </div>
            <em>{completedTasks} of {firstLoginTasks.length} launch items complete</em>
          </div>

          <div className="portal-today-grid">
            <a className={`portal-today-card ${documentsNeedingSignature.length ? 'needs-attention' : 'complete'}`} href="/documents">
              <span>{documentsNeedingSignature.length ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}</span>
              <small>Documents</small>
              <strong>{documentsNeedingSignature.length ? `${documentsNeedingSignature.length} need signature` : 'All caught up'}</strong>
              <p>{documentsNeedingSignature.length ? 'Review and sign assigned leases or renewals.' : 'No documents need your signature right now.'}</p>
            </a>

            <a className={`portal-today-card ${dueNowInvoices.length ? 'needs-attention' : 'complete'}`} href="/invoices">
              <span>{dueNowInvoices.length ? <CircleDollarSign size={22} /> : <CheckCircle2 size={22} />}</span>
              <small>Payments</small>
              <strong>{dueNowInvoices.length ? `$${openBalance.toFixed(2)} due` : 'Balance clear'}</strong>
              <p>{dueNowInvoices.length ? `${dueNowInvoices.length} invoice${dueNowInvoices.length === 1 ? '' : 's'} due now.` : 'No invoices are due right now.'}</p>
            </a>

            <a className="portal-today-card" href="/maintenance">
              <span><Wrench size={22} /></span>
              <small>Maintenance</small>
              <strong>{maintenanceHeadline}</strong>
              <p>{latestMaintenance ? maintenanceDetail : 'Submit a request if something needs attention.'}</p>
            </a>

            <a className="portal-today-card" href="/profile">
              <span><ClipboardCheck size={22} /></span>
              <small>Profile</small>
              <strong>{profileCompletion}% complete</strong>
              <p>Keep contact, emergency, vehicle, and golf cart information current.</p>
            </a>
          </div>

          <div className="portal-launch-checklist">
            {firstLoginTasks.map((task) => (
              <a href={task.href} className={task.complete ? 'done' : ''} key={task.label}>
                {task.complete ? <CheckCircle2 size={16} /> : <span />}
                {task.label}
              </a>
            ))}
          </div>
        </section>

        <section className="portal-snapshot" aria-label="Account overview">
          <a href="/invoices" className="portal-snapshot-item">
            <span className="portal-snapshot-icon green">
              <CircleDollarSign size={22} />
            </span>
            <span>
              <small>Amount due</small>
              <strong>${openBalance.toFixed(2)}</strong>
              <em>{dueNowInvoices.length} invoice{dueNowInvoices.length === 1 ? '' : 's'} due now</em>
            </span>
          </a>

          <a href="/electric" className="portal-snapshot-item">
            <span className="portal-snapshot-icon blue">
              <Gauge size={22} />
            </span>
            <span>
              <small>Latest electric</small>
              <strong>${Number(latestElectric?.amount_due || 0).toFixed(2)}</strong>
              <em>{latestElectric?.kwh_used || 0} kWh used</em>
            </span>
          </a>

          <a href="/calendar" className="portal-snapshot-item">
            <span className="portal-snapshot-icon gold">
              <CalendarDays size={22} />
            </span>
            <span>
              <small>Next event</small>
              <strong>{nextEvent?.title || 'Nothing scheduled'}</strong>
              <em>{nextEvent ? formatDate(nextEvent.event_date) : 'Check back soon'}</em>
            </span>
          </a>

          <a href="/documents" className="portal-snapshot-item">
            <span className="portal-snapshot-icon plum">
              <FileText size={22} />
            </span>
            <span>
              <small>Documents</small>
              <strong>{documentsNeedingSignature.length || documents.length}</strong>
              <em>{documentsNeedingSignature.length ? 'Need signature' : 'Available in your portal'}</em>
            </span>
          </a>
        </section>
          </div>
        </details>

        <div className="portal-content-grid">
          <section className="portal-panel portal-services-panel" id="portal-services">
            <div className="portal-section-heading">
              <div>
                <span>YOUR STAY</span>
                <h2>What can we help with?</h2>
              </div>
            </div>

            <div className="portal-service-grid">
              {serviceLinks.map((service) => {
                const Icon = service.icon

                return (
                  <a className="portal-service-card" href={service.href} key={service.href}>
                    <span className={`portal-service-icon ${service.accent}`}>
                      <Icon size={23} />
                    </span>
                    <span className="portal-service-copy">
                      <strong>{service.title}</strong>
                      <small>{service.description}</small>
                    </span>
                    <ChevronRight className="portal-service-arrow" size={20} />
                  </a>
                )
              })}
            </div>
          </section>

          <aside className="portal-panel portal-announcements-panel">
            <div className="portal-section-heading compact">
              <div>
                <span>FROM THE OFFICE</span>
                <h2>Announcements</h2>
              </div>
              <Megaphone size={22} />
            </div>

            {announcements.length === 0 ? (
              <div className="portal-empty-state">
                <Megaphone size={26} />
                <p>No announcements right now.</p>
              </div>
            ) : (
              <div className="portal-feed">
                {[...announcements]
                  .sort((a, b) => Number(Boolean(b.is_urgent)) - Number(Boolean(a.is_urgent)))
                  .map((announcement, index) => (
                  <article className={`${index === 0 ? 'featured' : ''} ${announcement.is_urgent ? 'urgent' : ''}`} key={announcement.id}>
                    {(index === 0 || announcement.is_urgent) && <span className={`portal-new-pill ${announcement.is_urgent ? 'urgent' : ''}`}>{announcement.is_urgent ? 'URGENT' : 'LATEST'}</span>}
                    <h3>{announcement.title}</h3>
                    <p>{announcement.message}</p>
                  </article>
                ))}
              </div>
            )}
          </aside>
        </div>

        <div className="portal-bottom-grid">
          <section className="portal-panel">
            <div className="portal-section-heading compact">
              <div>
                <span>AROUND THE PARK</span>
                <h2>Upcoming events</h2>
              </div>
              <a href="/calendar">Full calendar</a>
            </div>

            {events.length === 0 ? (
              <div className="portal-empty-state horizontal portal-campfire-empty">
                <CalendarDays size={26} />
                <p>The calendar is quiet for the moment — enjoy the peace, or check Saturday dinners.</p>
              </div>
            ) : (
              <div className="portal-event-list">
                {events.map((event) => {
                  const date = new Date(`${event.event_date}T12:00:00`)

                  return (
                    <article key={event.id}>
                      <div className="portal-date-tile">
                        <span>{date.toLocaleDateString('en-US', { month: 'short' })}</span>
                        <strong>{date.getDate()}</strong>
                      </div>
                      <div>
                        <h3>{event.title}</h3>
                        <p>{event.description || 'More details will be shared soon.'}</p>
                        <a className="portal-event-action" href="/calendar">RSVP / details <ArrowRight size={13} /></a>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <section className="portal-panel">
            <div className="portal-section-heading compact">
              <div>
                <span>STAY INFORMED</span>
                <h2>Recent alerts</h2>
              </div>
              <div className="portal-alert-heading-actions">
                {alerts.length > 0 && (
                  <button type="button" onClick={dismissAllPortalAlerts}>
                    Clear all
                  </button>
                )}
                <Bell size={22} />
              </div>
            </div>

            {alerts.length === 0 ? (
              <div className="portal-empty-state horizontal portal-campfire-empty">
                <Bell size={26} />
                <p>You’re all caught up — no recent alerts, no smoke signals, no surprises.</p>
              </div>
            ) : (
              <div className="portal-alert-list">
                {alerts.map((alert) => (
                  <article key={alert.id}>
                    <span className="portal-alert-dot" />
                    <div>
                      <h3>{alert.reminder_type || 'Campground update'}</h3>
                      <p>{alert.message}</p>
                    </div>
                    <button
                      type="button"
                      className="portal-alert-dismiss"
                      onClick={() => dismissPortalAlert(alert.id)}
                    >
                      Clear
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="portal-site-command">
          <div>
            <span><Home size={16} /> MY SITE</span>
            <h2>Lot {camper?.lot_number || '—'} at a glance.</h2>
            <p>One calm place for contact info, second profile details, vehicles, documents, insurance, payments, electric history, and maintenance requests.</p>
          </div>
          <div className="portal-site-command-grid">
            <article><small>Camper</small><strong>{camper?.first_name || ''} {camper?.last_name || ''}</strong></article>
            <article><small>Latest electric</small><strong>{latestElectric ? `${latestElectric.kwh_used || 0} kWh` : 'No reading'}</strong></article>
            <article><small>Amount due</small><strong>${openBalance.toFixed(2)}</strong></article>
            <article><small>Insurance</small><strong>{insuranceOnFile ? 'On file' : 'Optional'}</strong></article>
            <article><small>Text alerts</small><strong>{camper?.sms_opt_in ? 'On' : 'Off'}</strong></article>
            <article><small>Office messages</small><strong>{unreadOfficeMessages ? `${unreadOfficeMessages} unread` : 'Clear'}</strong></article>
          </div>
          <a href="/site">Open My Site <ArrowRight size={16} /></a>
        </section>

        <footer className="portal-footer">
          <span>Bur Oaks Campground</span>
          <span>
            <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · Lot{' '}
            {camper?.lot_number || '—'} · {camper?.first_name} {camper?.last_name}
          </span>
        </footer>

        <nav className="portal-mobile-dock" aria-label="Quick portal navigation">
          <a href="/invoices" className={dueNowInvoices.length ? 'attention' : ''}>
            <ReceiptText size={18} />
            <span>Pay</span>
          </a>
          <button type="button" className={`portal-dock-pump ${pumpNeedsAttention ? 'attention' : ''}`} onClick={() => setShowPumpConfirm(true)} disabled={requestingPump}>
            <Droplets size={18} />
            <span>Pump</span>
          </button>
          <a href="/messages" className={unreadOfficeMessages > 0 ? 'attention' : ''}>
            <MessageCircle size={18} />
            <span>Chat</span>
          </a>
          <a href={upcomingDinners[0] ? `/dinners?date=${upcomingDinners[0].date}` : '/dinners'}>
            <Soup size={18} />
            <span>Dinner</span>
          </a>
          <button type="button" className={`portal-dock-more ${mobileMoreNeedsAttention ? 'attention' : ''}`} onClick={() => setShowMobileMenu(true)}>
            <Sparkles size={18} />
            <span>More</span>
          </button>
        </nav>

        {showPumpConfirm && (
          <div className="portal-mobile-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Confirm sewer pump-out request">
            <section className="portal-mobile-confirm">
              <button className="portal-mobile-sheet-close" type="button" onClick={() => setShowPumpConfirm(false)} aria-label="Close pump-out confirmation">
                <X size={18} />
              </button>
              <span><Droplets size={18} /> Sewer pump-out</span>
              <h2>Request a pump-out for Lot {selectedPumpLot || camper?.lot_number || 'your site'}?</h2>
              <p>The office will add Lot {selectedPumpLot || camper?.lot_number || 'your site'} to the pump-out list. A <strong>{`$${displayedPumpOutFee.toFixed(2)} charge`}</strong> will be added to the next electric bill for Lot {camper?.lot_number || 'your billing account'}.</p>
              {activeSelectedPumpOutRequests.length > 0 && (
                <em>Lot {selectedPumpLot || camper?.lot_number} already appears to be on the pump-out list. Sending again will not add a duplicate charge.</em>
              )}
              <div>
                <button type="button" onClick={requestSewerPumpOut} disabled={requestingPump}>
                  {requestingPump ? 'Sending…' : 'Request pump-out'}
                </button>
                <button type="button" onClick={() => setShowPumpConfirm(false)}>
                  Not now
                </button>
              </div>
            </section>
          </div>
        )}

        {showMobileMenu && (
          <div className="portal-mobile-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Camper portal menu">
            <section className="portal-mobile-more-sheet">
              <div className="portal-mobile-more-head">
                <div>
                  <span><Sparkles size={16} /> Portal menu</span>
                  <h2>Where do you want to go?</h2>
                </div>
                <button className="portal-mobile-sheet-close" type="button" onClick={() => setShowMobileMenu(false)} aria-label="Close portal menu">
                  <X size={18} />
                </button>
              </div>

              <div className="portal-mobile-more-alerts">
                <a href="/documents" className={documentsNeedingSignature.length ? 'attention' : ''}>
                  <FileText size={18} />
                  <span>
                    <small>Documents</small>
                    <strong>{documentsNeedingSignature.length ? `${documentsNeedingSignature.length} need signature` : 'All caught up'}</strong>
                  </span>
                </a>
                <a href="/maintenance" className={activeMaintenance.length ? 'attention' : ''}>
                  <Wrench size={18} />
                  <span>
                    <small>Maintenance</small>
                    <strong>{activeMaintenance.length ? `${activeMaintenance.length} active` : 'Request help'}</strong>
                  </span>
                </a>
              </div>

              <div className="portal-mobile-menu-list">
                {serviceLinks.map((service) => {
                  const Icon = service.icon

                  return (
                    <a href={service.href} key={service.href}>
                      <Icon size={18} />
                      <span>
                        <strong>{service.title}</strong>
                        <small>{service.description}</small>
                      </span>
                      <ChevronRight size={16} />
                    </a>
                  )
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
