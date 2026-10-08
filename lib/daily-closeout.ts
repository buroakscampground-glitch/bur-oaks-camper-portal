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

export function summarizeDailyCloseout({
  invoices: invoiceRows = [], manualPayments: manualPaymentRows = [], manualAllocations: manualAllocationRows = [],
  onlineExtraCredits: onlineExtraCreditRows = [], creditApplications: creditApplicationRows = [], payouts = [],
}: {
  invoices?: CloseoutInvoice[]
  manualPayments?: ManualPaymentRecord[]
  manualAllocations?: ManualAllocationRecord[]
  onlineExtraCredits?: CloseoutCredit[]
  creditApplications?: CloseoutCreditApplication[]
  payouts?: CloseoutPayout[]
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
    },
    onlineInvoices,
    manualPayments,
    manualAllocations,
    onlineExtraCredits,
    creditApplications: priorCreditApplications,
    payouts,
    unclassifiedInvoices,
    balanced: Math.abs(difference) < 0.005 && unclassifiedInvoices.length === 0,
  }
}

export type DailyCloseoutSummary = ReturnType<typeof summarizeDailyCloseout>
