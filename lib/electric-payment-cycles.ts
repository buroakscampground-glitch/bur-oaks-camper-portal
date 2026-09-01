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

export function rollingElectricPaymentCycles({
  invoices = [],
  readings = [],
  currentMonth,
}: {
  invoices?: any[]
  readings?: any[]
  currentMonth: string
}): ElectricPaymentCycle[] {
  const months = [previousMonth(currentMonth), currentMonth]
  const readingMonthByInvoice = new Map<string, string>()

  for (const reading of readings) {
    const invoiceId = String(reading.invoice_id || '')
    const month = String(reading.reading_date || '').slice(0, 7)
    if (!invoiceId || !/^\d{4}-\d{2}$/.test(month)) continue
    const existing = readingMonthByInvoice.get(invoiceId)
    if (!existing || month > existing) readingMonthByInvoice.set(invoiceId, month)
  }

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
