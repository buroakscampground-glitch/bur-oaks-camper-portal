export type ElectricPaymentCycle = {
  month: string
  label: string
  billed: number
  paid: number
  outstanding: number
  invoiceCount: number
  paidCount: number
  openCount: number
}

export type ActiveElectricCollection = {
  billed: number
  paid: number
  outstanding: number
  invoiceCount: number
  paidCount: number
  openCount: number
  months: string[]
}

export type ElectricCycleInvoice = {
  id?: string | null
  invoice_type?: string | null
  status?: string | null
  total_due?: number | string | null
  subtotal?: number | string | null
  late_fee?: number | string | null
  created_at?: string | null
}

export type ElectricCycleReading = {
  invoice_id?: string | null
  reading_date?: string | null
}

function previousMonth(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 2, 1, 12))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(monthKey: string) {
  const date = new Date(`${monthKey}-01T12:00:00Z`)
  return date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })
}

function money(value: number) {
  return Number(value.toFixed(2))
}

function electricInvoiceOriginalTotal(invoice: ElectricCycleInvoice) {
  const currentTotal = Number(invoice.total_due || 0)
  return Math.max(currentTotal, Number(invoice.subtotal || 0) + Number(invoice.late_fee || 0))
}

function electricBillingMonthByInvoice(readings: ElectricCycleReading[]) {
  const result = new Map<string, string>()

  for (const reading of readings) {
    const invoiceId = String(reading.invoice_id || '')
    const month = String(reading.reading_date || '').slice(0, 7)
    if (!invoiceId || !/^\d{4}-\d{2}$/.test(month)) continue
    const existing = result.get(invoiceId)
    if (!existing || month > existing) result.set(invoiceId, month)
  }

  return result
}

export function activeElectricCollection({
  invoices = [],
  readings = [],
}: {
  invoices?: ElectricCycleInvoice[]
  readings?: ElectricCycleReading[]
}): ActiveElectricCollection {
  const billingMonthByInvoice = electricBillingMonthByInvoice(readings)
  const issuedStatuses = new Set(['open', 'sent', 'overdue', 'processing', 'paid'])
  const openStatuses = new Set(['open', 'sent', 'overdue', 'processing'])
  const electricInvoices = invoices
    .filter((invoice) => String(invoice.invoice_type || '').toLowerCase().includes('electric'))
    .filter((invoice) => issuedStatuses.has(String(invoice.status || '').toLowerCase()))
    .map((invoice) => ({
      invoice,
      month: billingMonthByInvoice.get(String(invoice.id)) || String(invoice.created_at || '').slice(0, 7),
    }))
    .filter(({ month }) => /^\d{4}-\d{2}$/.test(month))

  const openMonths = new Set(
    electricInvoices
      .filter(({ invoice }) => openStatuses.has(String(invoice.status || '').toLowerCase()))
      .map(({ month }) => month)
  )
  const latestMonth = electricInvoices.reduce((latest, item) => item.month > latest ? item.month : latest, '')
  const months = openMonths.size > 0 ? [...openMonths].sort() : latestMonth ? [latestMonth] : []
  const trackedInvoices = electricInvoices
    .filter(({ month }) => months.includes(month))
    .map(({ invoice }) => invoice)
  const openInvoices = trackedInvoices.filter((invoice) => openStatuses.has(String(invoice.status || '').toLowerCase()))
  const paidInvoices = trackedInvoices.filter((invoice) => String(invoice.status || '').toLowerCase() === 'paid')
  const billed = money(trackedInvoices.reduce((sum, invoice) => sum + electricInvoiceOriginalTotal(invoice), 0))
  const outstanding = money(openInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0))

  return {
    billed,
    paid: money(Math.max(0, billed - outstanding)),
    outstanding,
    invoiceCount: trackedInvoices.length,
    paidCount: paidInvoices.length,
    openCount: openInvoices.length,
    months,
  }
}

export function rollingElectricPaymentCycles({
  invoices = [],
  readings = [],
  currentMonth,
}: {
  invoices?: ElectricCycleInvoice[]
  readings?: ElectricCycleReading[]
  currentMonth: string
}): ElectricPaymentCycle[] {
  const months = [previousMonth(currentMonth), currentMonth]
  const readingMonthByInvoice = electricBillingMonthByInvoice(readings)

  return months.map((month) => {
    const cycleInvoices = invoices.filter((invoice) => {
      const type = String(invoice.invoice_type || '').toLowerCase()
      const status = String(invoice.status || '').toLowerCase()
      if (!type.includes('electric') || ['cancelled', 'canceled', 'void', 'refunded'].includes(status)) return false
      const billingMonth = readingMonthByInvoice.get(String(invoice.id)) || String(invoice.created_at || '').slice(0, 7)
      return billingMonth === month
    })
    const paidInvoices = cycleInvoices.filter((invoice) => String(invoice.status || '').toLowerCase() === 'paid')
    const openInvoices = cycleInvoices.filter((invoice) => String(invoice.status || '').toLowerCase() !== 'paid')

    return {
      month,
      label: monthLabel(month),
      billed: money(cycleInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)),
      paid: money(paidInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)),
      outstanding: money(openInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)),
      invoiceCount: cycleInvoices.length,
      paidCount: paidInvoices.length,
      openCount: openInvoices.length,
    }
  })
}
