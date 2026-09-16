export type CamperStanding = 'clear' | 'watch' | 'needs-review'
export type CamperPattern = 'steady' | 'one-off' | 'improving' | 'repeated'

type InvoiceRecord = {
  due_date?: unknown
  paid_at?: unknown
  late_fee?: unknown
  status?: unknown
  total_due?: unknown
}

type SiteCareRecord = {
  created_at?: unknown
  priority?: unknown
  status?: unknown
}

type DocumentRecord = {
  signature_status?: unknown
}

export type CamperStandingRow = {
  camperId: string
  lotNumber: string
  camperName: string
  standing: CamperStanding
  pattern: CamperPattern
  reasons: string[]
  pastDueBalance: number
  pastDueInvoices: number
  oldestPastDueDays: number
  late12Months: number
  late24Months: number
  lateLifetime: number
  siteCare12Months: number
  siteCare24Months: number
  siteCareLifetime: number
  activeSiteCare: number
  activeImportantSiteCare: number
  unsignedDocuments: number
}

const EXCLUDED_STANDING_STATUSES = new Set(['cancelled', 'canceled', 'void', 'refunded', 'processing'])

function calendarDate(value: unknown) {
  return String(value || '').slice(0, 10)
}

function dateMs(value: string) {
  return Date.parse(`${value}T00:00:00Z`)
}

function daysBetween(earlier: string, later: string) {
  const difference = dateMs(later) - dateMs(earlier)
  return Number.isFinite(difference) ? Math.floor(difference / 86_400_000) : 0
}

function monthsBefore(today: string, months: number) {
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() - months)
  return date.toISOString().slice(0, 10)
}

export function invoiceWasLate(invoice: InvoiceRecord, today: string) {
  const dueDate = calendarDate(invoice.due_date)
  if (!dueDate || EXCLUDED_STANDING_STATUSES.has(String(invoice.status || '').toLowerCase())) return false
  if (Number(invoice.late_fee || 0) > 0) return true

  const status = String(invoice.status || '').toLowerCase()
  const paidDate = calendarDate(invoice.paid_at)
  if (status === 'paid') return Boolean(paidDate && paidDate > dueDate)
  return dueDate < today
}

export function buildCamperStanding(input: {
  camper: Record<string, unknown>
  invoices: InvoiceRecord[]
  notices: SiteCareRecord[]
  documents: DocumentRecord[]
  today: string
}): CamperStandingRow {
  const { camper, invoices, notices, documents, today } = input
  const cutoff12 = monthsBefore(today, 12)
  const cutoff24 = monthsBefore(today, 24)
  const validInvoices = invoices.filter((invoice) => !EXCLUDED_STANDING_STATUSES.has(String(invoice.status || '').toLowerCase()))
  const lateInvoices = validInvoices.filter((invoice) => invoiceWasLate(invoice, today))
  const currentPastDue = validInvoices.filter((invoice) => {
    const status = String(invoice.status || '').toLowerCase()
    const dueDate = calendarDate(invoice.due_date)
    return status !== 'paid' && Boolean(dueDate && dueDate < today)
  })
  const late12Months = lateInvoices.filter((invoice) => calendarDate(invoice.due_date) >= cutoff12).length
  const late24Months = lateInvoices.filter((invoice) => calendarDate(invoice.due_date) >= cutoff24).length
  const siteCare12Months = notices.filter((notice) => calendarDate(notice.created_at) >= cutoff12).length
  const siteCare24Months = notices.filter((notice) => calendarDate(notice.created_at) >= cutoff24).length
  const activeNotices = notices.filter((notice) => String(notice.status || '').toLowerCase() !== 'resolved')
  const activeImportant = activeNotices.filter((notice) => String(notice.priority || '').toLowerCase() === 'important')
  const oldestPastDueDays = currentPastDue.reduce((oldest, invoice) => {
    const dueDate = calendarDate(invoice.due_date)
    return Math.max(oldest, dueDate ? daysBetween(dueDate, today) : 0)
  }, 0)

  let standing: CamperStanding = 'clear'
  const repeatedRecentPattern = late12Months >= 3 || siteCare12Months >= 3
  if (
    activeImportant.length > 0 ||
    currentPastDue.length >= 2 ||
    (currentPastDue.length === 1 && oldestPastDueDays >= 14) ||
    activeNotices.length >= 2 ||
    repeatedRecentPattern
  ) {
    standing = 'needs-review'
  } else if (
    currentPastDue.length > 0 ||
    activeNotices.length > 0 ||
    late24Months + siteCare24Months >= 2
  ) {
    standing = 'watch'
  }

  const lifetimeIssues = lateInvoices.length + notices.length
  const recentIssues = late12Months + siteCare12Months
  let pattern: CamperPattern = 'steady'
  if (standing === 'needs-review') pattern = 'repeated'
  else if (recentIssues === 1 && activeNotices.length === 0 && currentPastDue.length === 0) pattern = 'one-off'
  else if (standing === 'clear' && lifetimeIssues > 0) pattern = 'improving'

  const reasons: string[] = []
  if (currentPastDue.length) reasons.push(`${currentPastDue.length} currently past-due invoice${currentPastDue.length === 1 ? '' : 's'}`)
  if (activeNotices.length) reasons.push(`${activeNotices.length} active site-care item${activeNotices.length === 1 ? '' : 's'}`)
  if (late12Months) reasons.push(`${late12Months} late payment${late12Months === 1 ? '' : 's'} in the last 12 months`)
  if (siteCare12Months) reasons.push(`${siteCare12Months} site-care notice${siteCare12Months === 1 ? '' : 's'} in the last 12 months`)
  if (!reasons.length && lifetimeIssues > 0) reasons.push('No payment or site-care issues in the last 12 months')
  if (!reasons.length) reasons.push('Clear recent history')

  return {
    camperId: String(camper.id || ''),
    lotNumber: String(camper.lot_number || ''),
    camperName: [camper.first_name, camper.last_name].map((value) => String(value || '').trim()).filter(Boolean).join(' ') || 'Camper',
    standing,
    pattern,
    reasons,
    pastDueBalance: currentPastDue.reduce((total, invoice) => total + Number(invoice.total_due || 0), 0),
    pastDueInvoices: currentPastDue.length,
    oldestPastDueDays,
    late12Months,
    late24Months,
    lateLifetime: lateInvoices.length,
    siteCare12Months,
    siteCare24Months,
    siteCareLifetime: notices.length,
    activeSiteCare: activeNotices.length,
    activeImportantSiteCare: activeImportant.length,
    unsignedDocuments: documents.filter((document) => !['signed', 'not_required'].includes(String(document.signature_status || '').toLowerCase())).length,
  }
}
