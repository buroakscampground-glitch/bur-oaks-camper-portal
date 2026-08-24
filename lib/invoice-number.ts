function localDateStamp(date: Date) {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}${month}${day}`
}

export function invoiceNumberPrefix(date = new Date()) {
  return `INV-${localDateStamp(date)}-`
}

export function nextInvoiceNumber(
  invoices: Array<{ invoice_number?: unknown }> = [],
  date = new Date()
) {
  const prefix = invoiceNumberPrefix(date)
  const suffixPattern = new RegExp(`^${prefix}(\\d+)$`, 'i')
  const highestSequence = invoices.reduce((highest, invoice) => {
    const match = String(invoice.invoice_number || '').trim().match(suffixPattern)
    if (!match) return highest

    const sequence = Number(match[1])
    return Number.isSafeInteger(sequence) ? Math.max(highest, sequence) : highest
  }, 0)

  return `${prefix}${String(highestSequence + 1).padStart(3, '0')}`
}
