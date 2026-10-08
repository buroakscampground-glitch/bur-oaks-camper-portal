import { invoiceRecordedTotal } from './invoice-balance.ts'

export type CloseoutCamper = {
  first_name?: string | null
  last_name?: string | null
  lot_number?: string | null
}

type SupabaseRelation<T> = T | T[] | null

function oneRelation<T>(value: SupabaseRelation<T> | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null
}

export type CloseoutInvoice = {
  id: string
  invoice_number?: string | number | null
  invoice_type?: string | null
  total_due?: number | string | null
  subtotal?: number | string | null
  late_fee?: number | string | null
  status?: string | null
  payment_method?: string | null
  paid_at?: string | null
  camper_id?: string | null
  payment_reference?: string | null
  campers?: SupabaseRelation<CloseoutCamper>
}

export type ManualPaymentRecord = {
  id: string
  camper_id?: string | null
  amount?: number | string | null
  payment_method?: string | null
  received_on?: string | null
  created_at?: string | null
  credit_id?: string | null
  result?: { appliedTotal?: number | string | null; creditAmount?: number | string | null } | null
  campers?: SupabaseRelation<CloseoutCamper>
}

export type ManualAllocationRecord = {
  payment_id?: string | null
  invoice_id?: string | null
  amount_applied?: number | string | null
  invoices?: SupabaseRelation<{ invoice_number?: string | number | null; invoice_type?: string | null }>
}

export type CloseoutCredit = {
  id?: string
  camper_id?: string | null
  original_amount?: number | string | null
  remaining_amount?: number | string | null
  applies_to?: string | null
  created_at?: string | null
  campers?: SupabaseRelation<CloseoutCamper>
}

export type CloseoutCreditApplication = {
  id?: string
  credit_id?: string | null
  amount_applied?: number | string | null
  applied_at?: string | null
  invoice_id?: string | null
  invoices?: SupabaseRelation<{ invoice_number?: string | number | null; invoice_type?: string | null }>
  campers?: SupabaseRelation<CloseoutCamper>
}

export type CloseoutPayout = {
  id?: string
  amount?: number | string | null
  status?: string | null
  arrivalDate?: string | null
  automatic?: boolean | null
}

export type CloseoutHistoryDay = {
  date: string
  readyToClose: boolean
  received: number
  bankDeposits: number
  reviewCount: number
}

function amount(value: unknown) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0
}

export function centralDayRange(dateKey: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  })
  const localMidnightUtc = (key: string) => {
    const [year, month, day] = key.split('-').map(Number)
    const target = Date.UTC(year, month - 1, day)
    let candidate = target
    for (let index = 0; index < 3; index += 1) {
      const parts = formatter.formatToParts(new Date(candidate))
      const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0)
      const represented = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'))
      candidate += target - represented
    }
    return new Date(candidate)
  }
  const [year, month, day] = dateKey.split('-').map(Number)
  const nextKey = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
  const start = localMidnightUtc(dateKey)
  const end = localMidnightUtc(nextKey)
  return { start: start.toISOString(), end: end.toISOString() }
}

export function closeoutDateKeys(endingDate: string, days = 7) {
  const [year, month, day] = endingDate.split('-').map(Number)
  return Array.from({ length: Math.max(1, Math.min(14, Math.trunc(days))) }, (_, index) =>
    new Date(Date.UTC(year, month - 1, day - (Math.max(1, Math.min(14, Math.trunc(days))) - index - 1))).toISOString().slice(0, 10)
  )
}

export function centralDateKey(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(date)
}

export function summarizeDailyCloseout({
  invoices: invoiceRows = [], manualPayments: manualPaymentRows = [], manualAllocations: manualAllocationRows = [],
  onlineExtraCredits: onlineExtraCreditRows = [], creditApplications: creditApplicationRows = [], payouts = [], exceptionCount = 0,
}: {
  invoices?: CloseoutInvoice[]
  manualPayments?: ManualPaymentRecord[]
  manualAllocations?: ManualAllocationRecord[]
  onlineExtraCredits?: CloseoutCredit[]
  creditApplications?: CloseoutCreditApplication[]
  payouts?: CloseoutPayout[]
  exceptionCount?: number
}) {
  const invoices = invoiceRows.map((invoice) => ({ ...invoice, campers: oneRelation(invoice.campers) }))
  const manualPayments = manualPaymentRows.map((payment) => ({ ...payment, campers: oneRelation(payment.campers) }))
  const manualAllocations = manualAllocationRows.map((allocation) => ({ ...allocation, invoices: oneRelation(allocation.invoices) }))
  const onlineExtraCredits = onlineExtraCreditRows.map((credit) => ({ ...credit, campers: oneRelation(credit.campers) }))
  const creditApplications = creditApplicationRows.map((application) => ({
    ...application,
    invoices: oneRelation(application.invoices),
    campers: oneRelation(application.campers),
  }))
  const manualInvoiceIds = new Set(manualAllocations.map((row) => String(row.invoice_id || '')).filter(Boolean))
  const creditInvoiceIds = new Set(creditApplications.map((row) => String(row.invoice_id || '')).filter(Boolean))
  const newPaymentCreditIds = new Set(manualPayments.map((row) => String(row.credit_id || '')).filter(Boolean))
  const priorCreditApplications = creditApplications.filter((row) => !newPaymentCreditIds.has(String(row.credit_id || '')))
  const onlineInvoices = invoices.filter((invoice) =>
    !manualInvoiceIds.has(String(invoice.id)) && /^Online\b/i.test(String(invoice.payment_method || ''))
  )
  const unclassifiedInvoices = invoices.filter((invoice) =>
    !manualInvoiceIds.has(String(invoice.id)) &&
    !/^Online\b/i.test(String(invoice.payment_method || '')) &&
    (!/account credit/i.test(String(invoice.payment_method || '')) || !creditInvoiceIds.has(String(invoice.id)))
  )
  const onlineInvoiceTotal = amount(onlineInvoices.reduce((sum, invoice) => sum + invoiceRecordedTotal(invoice), 0))
  const onlineExtraCreditTotal = amount(onlineExtraCredits.reduce((sum, credit) => sum + Number(credit.original_amount || 0), 0))
  const onlineReceived = amount(onlineInvoiceTotal + onlineExtraCreditTotal)
  const manualReceived = amount(manualPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0))
  const manualApplied = amount(manualAllocations.reduce((sum, allocation) => sum + Number(allocation.amount_applied || 0), 0))
  const manualSavedCredit = amount(manualPayments.reduce((sum, payment) => sum + Number(payment.result?.creditAmount || 0), 0))
  const savedCredit = amount(onlineExtraCreditTotal + manualSavedCredit)
  const invoiceAllocations = amount(onlineInvoiceTotal + manualApplied)
  const received = amount(onlineReceived + manualReceived)
  const difference = amount(received - invoiceAllocations - savedCredit)
  const creditsApplied = amount(priorCreditApplications.reduce((sum, application) => sum + Number(application.amount_applied || 0), 0))
  const bankDeposits = amount(payouts.filter((payout) => payout.status === 'paid').reduce((sum, payout) => sum + Number(payout.amount || 0) / 100, 0))
  const checks = {
    paymentAllocation: Math.abs(difference) < 0.005,
    paidInvoicesClassified: unclassifiedInvoices.length === 0,
    depositsClear: payouts.every((payout) => !['failed', 'canceled'].includes(String(payout.status))),
    moneyExceptionsClear: exceptionCount === 0,
  }

  return {
    totals: {
      received,
      onlineReceived,
      manualReceived,
      invoiceAllocations,
      savedCredit,
      creditsApplied,
      bankDeposits,
      difference,
    },
    counts: {
      onlineInvoices: onlineInvoices.length,
      manualPayments: manualPayments.length,
      creditsCreated: onlineExtraCredits.length + manualPayments.filter((payment) => Number(payment.result?.creditAmount || 0) > 0).length,
      creditsApplied: priorCreditApplications.length,
      bankDeposits: payouts.filter((payout) => payout.status === 'paid').length,
      payoutProblems: payouts.filter((payout) => ['failed', 'canceled'].includes(String(payout.status))).length,
      unclassifiedInvoices: unclassifiedInvoices.length,
      moneyExceptions: exceptionCount,
    },
    onlineInvoices,
    manualPayments,
    manualAllocations,
    onlineExtraCredits,
    creditApplications: priorCreditApplications,
    payouts,
    unclassifiedInvoices,
    checks,
    balanced: checks.paymentAllocation && checks.paidInvoicesClassified,
    readyToClose: checks.paymentAllocation && checks.paidInvoicesClassified && checks.depositsClear && checks.moneyExceptionsClear,
  }
}

export function summarizeCloseoutHistory({
  dates,
  invoices = [],
  manualPayments = [],
  manualAllocations = [],
  onlineExtraCredits = [],
  creditApplications = [],
  payouts = [],
}: {
  dates: string[]
  invoices?: CloseoutInvoice[]
  manualPayments?: ManualPaymentRecord[]
  manualAllocations?: ManualAllocationRecord[]
  onlineExtraCredits?: CloseoutCredit[]
  creditApplications?: CloseoutCreditApplication[]
  payouts?: CloseoutPayout[]
}) {
  const paymentDate = new Map(manualPayments.map((payment) => [payment.id, payment.received_on || centralDateKey(payment.created_at)]))
  return dates.map((date): CloseoutHistoryDay => {
    const summary = summarizeDailyCloseout({
      invoices: invoices.filter((row) => centralDateKey(row.paid_at) === date),
      manualPayments: manualPayments.filter((row) => (row.received_on || centralDateKey(row.created_at)) === date),
      manualAllocations: manualAllocations.filter((row) => paymentDate.get(String(row.payment_id || '')) === date),
      onlineExtraCredits: onlineExtraCredits.filter((row) => centralDateKey(row.created_at) === date),
      creditApplications: creditApplications.filter((row) => centralDateKey(row.applied_at) === date),
      payouts: payouts.filter((row) => centralDateKey(row.arrivalDate) === date),
    })
    return {
      date,
      readyToClose: summary.readyToClose,
      received: summary.totals.received,
      bankDeposits: summary.totals.bankDeposits,
      reviewCount: summary.counts.unclassifiedInvoices + summary.counts.payoutProblems + Number(!summary.checks.paymentAllocation),
    }
  })
}

export type DailyCloseoutSummary = ReturnType<typeof summarizeDailyCloseout>

export type DailyCloseoutSnapshot = {
  version: 1
  date: string
  readyToClose: boolean
  balanced: boolean
  checks: DailyCloseoutSummary['checks']
  totals: DailyCloseoutSummary['totals']
  counts: DailyCloseoutSummary['counts']
  sources: {
    invoices: Array<{ id: string; amount: number; method: string; paidAt: string | null }>
    manualPayments: Array<{ id: string; amount: number; method: string; receivedOn: string | null; createdAt: string | null }>
    manualAllocations: Array<{ paymentId: string; invoiceId: string; amount: number }>
    creditsCreated: Array<{ id: string; amount: number; remaining: number }>
    creditsApplied: Array<{ id: string; creditId: string; invoiceId: string; amount: number }>
    payouts: Array<{ id: string; amountCents: number; status: string; arrivalDate: string | null }>
    unclassifiedInvoiceIds: string[]
  }
}

export type DailyCloseoutApproval = {
  id: string
  date: string
  revision: number
  approvedAt: string
  approvedBy: string
  sourceVerifiedAt: string
  snapshotSha256: string
  approvalNote?: string | null
  supersedesId?: string | null
  currentSnapshotMatches: boolean
}

/** Build the deterministic, money-source-only payload preserved by an approval receipt. */
export function buildDailyCloseoutSnapshot(date: string, summary: DailyCloseoutSummary): DailyCloseoutSnapshot {
  return {
    version: 1,
    date,
    readyToClose: summary.readyToClose,
    balanced: summary.balanced,
    checks: { ...summary.checks },
    totals: { ...summary.totals },
    counts: { ...summary.counts },
    sources: {
      invoices: summary.onlineInvoices.map((row) => ({
        id: String(row.id), amount: invoiceRecordedTotal(row), method: String(row.payment_method || ''), paidAt: row.paid_at || null,
      })),
      manualPayments: summary.manualPayments.map((row) => ({
        id: String(row.id), amount: amount(row.amount), method: String(row.payment_method || ''),
        receivedOn: row.received_on || null, createdAt: row.created_at || null,
      })),
      manualAllocations: summary.manualAllocations.map((row) => ({
        paymentId: String(row.payment_id || ''), invoiceId: String(row.invoice_id || ''), amount: amount(row.amount_applied),
      })),
      creditsCreated: summary.onlineExtraCredits.map((row) => ({
        id: String(row.id || ''), amount: amount(row.original_amount), remaining: amount(row.remaining_amount),
      })),
      creditsApplied: summary.creditApplications.map((row) => ({
        id: String(row.id || ''), creditId: String(row.credit_id || ''), invoiceId: String(row.invoice_id || ''), amount: amount(row.amount_applied),
      })),
      payouts: summary.payouts.map((row) => ({
        id: String(row.id || ''), amountCents: Math.round(Number(row.amount || 0)), status: String(row.status || ''), arrivalDate: row.arrivalDate || null,
      })),
      unclassifiedInvoiceIds: summary.unclassifiedInvoices.map((row) => String(row.id)),
    },
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function closeoutSnapshotsMatch(left: unknown, right: unknown) {
  return canonicalJson(left) === canonicalJson(right)
}
