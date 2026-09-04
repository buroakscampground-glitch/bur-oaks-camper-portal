export type PriorLotRentInvoice = {
  id?: string
  invoice_type?: unknown
  subtotal?: unknown
  total_due?: unknown
  late_fee?: unknown
  due_date?: unknown
  status?: unknown
  created_at?: unknown
  invoice_items?: Array<{
    description?: unknown
    quantity?: unknown
    unit_price?: unknown
    total?: unknown
  }> | null
}

export type ContinuedRentInstallment = {
  sourceInvoiceId: string
  dueDate: string
  amount: number
  invoiceType: string
  items: Array<{ description: string; quantity: number; unit_price: number; total: number }>
}

export type RentPaymentPlan = 'quarterly' | 'semiannual'

function isDate(value: unknown): value is string {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

export function addYearsToDate(value: string, years: number) {
  if (!isDate(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  const lastDay = new Date(year + years, month, 0, 12).getDate()
  return `${year + years}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

export function addMonthsToDate(value: string, months: number) {
  if (!isDate(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  const monthIndex = month - 1 + months
  const targetYear = year + Math.floor(monthIndex / 12)
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12
  const lastDay = new Date(targetYear, targetMonthIndex + 1, 0, 12).getDate()
  return `${targetYear}-${String(targetMonthIndex + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

export function normalizeRentPaymentPlan(value: unknown): RentPaymentPlan {
  return String(value || '').toLowerCase() === 'quarterly' ? 'quarterly' : 'semiannual'
}

export function isLotRentInvoice(invoice: PriorLotRentInvoice) {
  const type = String(invoice.invoice_type || '').trim().toLowerCase()
  return type.includes('rent') && (type.includes('lot') || type.includes('site'))
}

export function hasExistingLotRentForTargetMonth(
  invoices: PriorLotRentInvoice[],
  targetDate: string,
) {
  const targetMonth = String(targetDate || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) return false

  return invoices.some((invoice) => {
    const status = String(invoice.status || '').toLowerCase()
    if (['cancelled', 'canceled', 'void', 'refunded'].includes(status)) return false
    return isLotRentInvoice(invoice) && String(invoice.due_date || '').slice(0, 7) === targetMonth
  })
}

function money(value: unknown) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0
}

function rentItems(invoice: PriorLotRentInvoice) {
  const sourceItems = Array.isArray(invoice.invoice_items) ? invoice.invoice_items : []
  const matching = sourceItems.filter((item) => /(?:lot|site).*rent|rent.*(?:lot|site)/i.test(String(item.description || '')))
  const usable = (matching.length ? matching : sourceItems).map((item) => {
    const total = money(item.total)
    const quantity = Number(item.quantity || 1) || 1
    const unitPrice = money(item.unit_price) || money(total / quantity)
    return {
      description: String(item.description || 'Lot Rent').trim() || 'Lot Rent',
      quantity,
      unit_price: unitPrice,
      total,
    }
  }).filter((item) => item.total > 0)

  if (usable.length) return usable

  const subtotal = money(invoice.subtotal)
  const fallback = subtotal > 0
    ? subtotal
    : Math.max(0, money(invoice.total_due) - money(invoice.late_fee))
  return fallback > 0
    ? [{ description: 'Lot Rent', quantity: 1, unit_price: fallback, total: fallback }]
    : []
}

export function buildContinuedRentSchedule(
  invoices: PriorLotRentInvoice[],
  contractEndDate: string,
) {
  if (!isDate(contractEndDate)) return [] as ContinuedRentInstallment[]

  const priorTermStart = addYearsToDate(contractEndDate, -1)
  const latestByDueDate = new Map<string, PriorLotRentInvoice>()

  for (const invoice of invoices) {
    const dueDate = String(invoice.due_date || '')
    if (!isLotRentInvoice(invoice) || !isDate(dueDate)) continue
    if (dueDate < priorTermStart || dueDate >= contractEndDate) continue
    if (['cancelled', 'canceled', 'void', 'refunded'].includes(String(invoice.status || '').toLowerCase())) continue

    const current = latestByDueDate.get(dueDate)
    if (!current || String(invoice.created_at || '') > String(current.created_at || '')) {
      latestByDueDate.set(dueDate, invoice)
    }
  }

  return [...latestByDueDate.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .flatMap(([sourceDueDate, invoice]) => {
      const items = rentItems(invoice)
      const amount = money(items.reduce((sum, item) => sum + item.total, 0))
      if (amount <= 0) return []
      return [{
        sourceInvoiceId: String(invoice.id || ''),
        dueDate: addYearsToDate(sourceDueDate, 1),
        amount,
        invoiceType: String(invoice.invoice_type || 'Lot Rent').trim() || 'Lot Rent',
        items,
      }]
    })
}

function splitMoney(total: number, installments: number) {
  const totalCents = Math.round(total * 100)
  const baseCents = Math.floor(totalCents / installments)
  const remainder = totalCents - baseCents * installments
  return Array.from({ length: installments }, (_, index) =>
    Number(((baseCents + (index < remainder ? 1 : 0)) / 100).toFixed(2)))
}

export function buildRenewalRentSchedule(
  invoices: PriorLotRentInvoice[],
  contractEndDate: string,
  paymentPlan: RentPaymentPlan,
  annualRent: unknown,
) {
  if (!isDate(contractEndDate)) return [] as ContinuedRentInstallment[]

  const plan = normalizeRentPaymentPlan(paymentPlan)
  const installmentCount = plan === 'quarterly' ? 4 : 2
  const priorSchedule = buildContinuedRentSchedule(invoices, contractEndDate)
  const configuredAnnualRent = money(annualRent)

  // Without a configured annual amount, only continue a complete prior
  // schedule. Creating a full plan from partial dollars would underbill.
  if (configuredAnnualRent <= 0) {
    return priorSchedule.length === installmentCount ? priorSchedule : []
  }

  const amounts = splitMoney(configuredAnnualRent, installmentCount)
  const monthStep = plan === 'quarterly' ? 3 : 6
  const invoiceType = priorSchedule[0]?.invoiceType || (plan === 'quarterly' ? 'Quarterly Lot Rent' : 'Lot Rent')

  return amounts.map((amount, index) => ({
    sourceInvoiceId: priorSchedule[index]?.sourceInvoiceId || '',
    dueDate: addMonthsToDate(contractEndDate, index * monthStep),
    amount,
    invoiceType,
    items: [{ description: 'Lot Rent', quantity: 1, unit_price: amount, total: amount }],
  }))
}
