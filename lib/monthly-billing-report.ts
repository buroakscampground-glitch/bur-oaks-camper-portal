export type ReportInvoice = {
  id?: string
  invoice_number?: string | null
  invoice_type?: string | null
  total_due?: number | string | null
  due_date?: string | null
  status?: string | null
  paid_at?: string | null
  payment_method?: string | null
  payment_reference?: string | null
  campers?: {
    first_name?: string | null
    last_name?: string | null
    lot_number?: string | null
    email?: string | null
  } | null
  invoice_items?: Array<{
    id?: string
    description?: string | null
    quantity?: number | string | null
    unit_price?: number | string | null
    total?: number | string | null
  }> | null
}

export const billingCategoryOrder = [
  'Electric',
  'Water / Trash',
  'Lot Rent',
  'Association Fees',
  'Pump-Outs',
  'Site Services',
  'Maintenance',
  'Processing Fees',
  'Account Credits',
  'Other Charges',
]

function categoryFromText(rawText: unknown, amount: number) {
  const text = String(rawText || '').toLowerCase()
  if (amount < 0 || text.includes('credit')) return 'Account Credits'
  if (text.includes('water') || text.includes('trash')) return 'Water / Trash'
  if (text.includes('sewer') || text.includes('pump')) return 'Pump-Outs'
  if (text.includes('association')) return 'Association Fees'
  if (text.includes('weed') || text.includes('spray') || text.includes('pressure wash') || text.includes('site service')) return 'Site Services'
  if (text.includes('maintenance') || text.includes('repair')) return 'Maintenance'
  if (text.includes('rent') || text.includes('lot rent')) return 'Lot Rent'
  if (text.includes('electric') || text.includes('kwh') || text.includes('meter')) return 'Electric'
  if (text.includes('processing') || text.includes('card fee') || text.includes('ach fee')) return 'Processing Fees'
  return ''
}

export function billingCategory(item: any, invoice: any) {
  const amount = Number(item?.total || 0)
  return categoryFromText(item?.description, amount) || categoryFromText(invoice?.invoice_type, amount) || 'Other Charges'
}

export function invoiceReportLines(invoice: ReportInvoice) {
  const savedItems = Array.isArray(invoice.invoice_items) ? invoice.invoice_items : []
  const items = savedItems.length ? savedItems : [{
    id: `${invoice.id || 'invoice'}-fallback`,
    description: invoice.invoice_type || 'Invoice total',
    quantity: 1,
    unit_price: invoice.total_due,
    total: invoice.total_due,
  }]

  return items.map((item) => ({ invoice, item, category: billingCategory(item, invoice) }))
}

export function isInvoiceInDueMonth(invoice: ReportInvoice, month: string) {
  const status = String(invoice.status || '').toLowerCase()
  return !['cancelled', 'canceled', 'void', 'refunded'].includes(status) && String(invoice.due_date || '').slice(0, 7) === month
}

export function monthlyDueSummary(invoices: ReportInvoice[], month: string) {
  const monthInvoices = invoices.filter((invoice) => isInvoiceInDueMonth(invoice, month))
  const lines = monthInvoices.flatMap(invoiceReportLines)
  const categories = billingCategoryOrder.map((label) => {
    const categoryLines = lines.filter((line) => line.category === label)
    return {
      label,
      count: categoryLines.length,
      total: Number(categoryLines.reduce((sum, line) => sum + Number(line.item.total || 0), 0).toFixed(2)),
    }
  }).filter((category) => category.count > 0)
  const paidInvoices = monthInvoices.filter((invoice) => String(invoice.status || '').toLowerCase() === 'paid')
  const openInvoices = monthInvoices.filter((invoice) => String(invoice.status || '').toLowerCase() !== 'paid')

  return {
    invoices: monthInvoices,
    lines,
    categories,
    total: Number(monthInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0).toFixed(2)),
    paid: Number(paidInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0).toFixed(2)),
    open: Number(openInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0).toFixed(2)),
  }
}

export function futureOpenSchedule(invoices: ReportInvoice[], afterMonth: string) {
  const grouped = new Map<string, { month: string; count: number; total: number }>()
  for (const invoice of invoices) {
    const status = String(invoice.status || '').toLowerCase()
    const dueMonth = String(invoice.due_date || '').slice(0, 7)
    if (['paid', 'cancelled', 'canceled', 'void', 'refunded'].includes(status) || dueMonth <= afterMonth) continue
    const row = grouped.get(dueMonth) || { month: dueMonth, count: 0, total: 0 }
    row.count += 1
    row.total += Number(invoice.total_due || 0)
    grouped.set(dueMonth, row)
  }
  return [...grouped.values()]
    .map((row) => ({ ...row, total: Number(row.total.toFixed(2)) }))
    .sort((a, b) => a.month.localeCompare(b.month))
}
