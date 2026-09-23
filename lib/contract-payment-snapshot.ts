import { todayInCentral } from './invoice-balance.ts'
import { addYearsToDate, isLotRentInvoice, normalizeRentPaymentPlan, type PriorLotRentInvoice } from './renewal-rent-schedule.ts'
import { rentPaymentBreakdown } from './rent-payment-summary.ts'

export type ContractPaymentInvoice = PriorLotRentInvoice & {
  paid_at?: unknown
  payment_method?: unknown
  is_late?: unknown
}

export type ContractPaymentEntry = {
  number: number
  invoiceId: string
  dueDate: string
  amount: number
  status: string
  paidAt: string
  paymentMethod: string
  isLate: boolean
  isPastDue: boolean
}

const closedStatuses = new Set(['cancelled', 'canceled', 'void', 'refunded'])

function validDate(value: unknown) {
  const date = String(value || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
}

function money(value: unknown) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0
}

function principalAmount(invoice: ContractPaymentInvoice) {
  const subtotal = money(invoice.subtotal)
  if (subtotal > 0) return subtotal
  return Math.max(0, money(invoice.total_due) - money(invoice.late_fee))
}

export function contractPaymentSnapshot({
  invoices,
  annualRent,
  paymentPlan,
  contractEndDate,
  today = todayInCentral(),
}: {
  invoices: ContractPaymentInvoice[]
  annualRent: unknown
  paymentPlan: unknown
  contractEndDate: unknown
  today?: string
}) {
  let contractEnd = validDate(contractEndDate)
  if (!contractEnd) return null

  // Renewal automation normally advances this date. Advancing a stale date
  // here keeps the office snapshot useful even before that daily job runs.
  for (let year = 0; year < 5 && contractEnd <= today; year += 1) {
    contractEnd = addYearsToDate(contractEnd, 1)
  }
  const contractStart = addYearsToDate(contractEnd, -1)
  const plan = normalizeRentPaymentPlan(paymentPlan)
  const expectedPayments = plan === 'quarterly' ? 4 : 2
  const configuredAnnualRent = money(annualRent)

  const invoicesByDueDate = new Map<string, ContractPaymentInvoice>()
  for (const invoice of invoices) {
    const dueDate = validDate(invoice.due_date)
    const status = String(invoice.status || '').trim().toLowerCase()
    if (!isLotRentInvoice(invoice) || !dueDate || dueDate < contractStart || dueDate >= contractEnd || closedStatuses.has(status)) continue

    const existing = invoicesByDueDate.get(dueDate)
    if (!existing || String(invoice.created_at || '') > String(existing.created_at || '')) {
      invoicesByDueDate.set(dueDate, invoice)
    }
  }

  const actualInvoices = [...invoicesByDueDate.values()].sort((left, right) =>
    String(left.due_date || '').localeCompare(String(right.due_date || '')))
  const planned = rentPaymentBreakdown(configuredAnnualRent, plan, contractStart)
  const entries: ContractPaymentEntry[] = Array.from({ length: expectedPayments }, (_, index) => {
    const planEntry = planned?.payments[index]
    const invoice = planEntry?.dueDate
      ? invoicesByDueDate.get(planEntry.dueDate)
      : actualInvoices[index]
    const status = invoice ? String(invoice.status || 'Open').trim() || 'Open' : 'Scheduled'
    const dueDate = validDate(invoice?.due_date) || planEntry?.dueDate || ''
    return {
      number: index + 1,
      invoiceId: String(invoice?.id || ''),
      dueDate,
      amount: invoice ? principalAmount(invoice) : money(planEntry?.amount),
      status,
      paidAt: String(invoice?.paid_at || ''),
      paymentMethod: String(invoice?.payment_method || ''),
      isLate: Boolean(invoice?.is_late),
      isPastDue: status.toLowerCase() !== 'paid' && Boolean(dueDate && dueDate < today),
    }
  })

  const paidEntries = entries.filter((entry) => entry.status.toLowerCase() === 'paid')
  const unpaidEntries = entries.filter((entry) => entry.status.toLowerCase() !== 'paid')
  const knownContractAmount = configuredAnnualRent > 0
    ? configuredAnnualRent
    : money(entries.reduce((sum, entry) => sum + entry.amount, 0))
  const paidAmount = money(paidEntries.reduce((sum, entry) => sum + entry.amount, 0))
  const remainingBalance = money(Math.max(0, knownContractAmount - paidAmount))
  const nextPayment = [...unpaidEntries].sort((left, right) =>
    String(left.dueDate || '9999-99-99').localeCompare(String(right.dueDate || '9999-99-99')))[0] || null

  return {
    contractStart,
    contractEnd,
    plan,
    planLabel: plan === 'quarterly' ? 'Quarterly · 4 payments' : 'Half-and-half · 2 payments',
    expectedPayments,
    paidPayments: paidEntries.length,
    remainingPayments: unpaidEntries.length,
    contractAmount: knownContractAmount,
    paidAmount,
    remainingBalance,
    nextPayment,
    entries,
    annualRentConfigured: configuredAnnualRent > 0,
  }
}
