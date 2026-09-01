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

function isDate(value: unknown): value is string {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

export function addYearsToDate(value: string, years: number) {
  if (!isDate(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  const lastDay = new Date(year + years, month, 0, 12).getDate()
  return `${year + years}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

export function isLotRentInvoice(invoice: PriorLotRentInvoice) {
  const type = String(invoice.invoice_type || '').trim().toLowerCase()
  return type.includes('rent') && (type.includes('lot') || type.includes('site'))
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
    if (String(invoice.status || '').toLowerCase() === 'cancelled') continue

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
