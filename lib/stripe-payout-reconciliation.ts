import Stripe from 'stripe'

export type StripePayoutInvoice = {
  id: string
  invoiceNumber: string
  invoiceType: string
  camper: string
  lot: string
  amountCents: number
}

export type StripePayoutRow = {
  id: string
  sourceId: string
  created: string
  type: string
  description: string
  grossCents: number
  feeCents: number
  netCents: number
  camperCheckoutFeeCents: number
  invoices: StripePayoutInvoice[]
}

export type StripePayoutDetail = {
  id: string
  amountCents: number
  currency: string
  status: string
  created: string
  arrivalDate: string
  automatic: boolean
  method: string
  rows: StripePayoutRow[]
  summary: {
    paymentGrossCents: number
    refundsCents: number
    adjustmentsCents: number
    stripeFeesCents: number
    calculatedNetCents: number
    payoutCents: number
    differenceCents: number
    transactionCount: number
  }
}

export function invoiceIdsFromMetadata(metadata?: Stripe.Metadata | null) {
  if (!metadata) return []
  const values: string[] = []
  const single = String(metadata.invoice_id || '').trim()
  if (single) values.push(single)
  try {
    const parsed = JSON.parse(metadata.invoice_ids || '[]')
    if (Array.isArray(parsed)) values.push(...parsed.filter((value): value is string => typeof value === 'string'))
  } catch {
    // A malformed legacy metadata value should not stop an entire bank-deposit report.
  }
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function summarizePayoutRows(rows: StripePayoutRow[], payoutCents: number) {
  const paymentGrossCents = rows
    .filter((row) => ['charge', 'payment'].includes(row.type))
    .reduce((sum, row) => sum + Math.max(0, row.grossCents), 0)
  const refundsCents = rows
    .filter((row) => row.type === 'refund' || row.grossCents < 0)
    .reduce((sum, row) => sum + (row.grossCents < 0 ? row.grossCents : 0), 0)
  const stripeFeesCents = rows.reduce((sum, row) => sum + row.feeCents, 0)
  const calculatedNetCents = rows.reduce((sum, row) => sum + row.netCents, 0)
  const knownGross = paymentGrossCents + refundsCents
  const adjustmentsCents = rows.reduce((sum, row) => sum + row.grossCents, 0) - knownGross

  return {
    paymentGrossCents,
    refundsCents,
    adjustmentsCents,
    stripeFeesCents,
    calculatedNetCents,
    payoutCents,
    differenceCents: payoutCents - calculatedNetCents,
    transactionCount: rows.length,
  }
}

export function isPayoutComponentTransaction(transaction: Pick<Stripe.BalanceTransaction, 'type'>) {
  return transaction.type !== 'payout'
}

function sourceObject(transaction: Stripe.BalanceTransaction) {
  return transaction.source && typeof transaction.source !== 'string' && !('deleted' in transaction.source)
    ? transaction.source as any
    : null
}

function sourceId(transaction: Stripe.BalanceTransaction) {
  if (typeof transaction.source === 'string') return transaction.source
  return transaction.source?.id || ''
}

function descriptionFor(transaction: Stripe.BalanceTransaction, source: any) {
  const statement = source?.statement_descriptor || source?.description
  if (statement) return String(statement)
  if (transaction.description) return transaction.description
  const labels: Record<string, string> = {
    charge: 'Camper payment',
    payment: 'Camper payment',
    refund: 'Refund',
    adjustment: 'Stripe adjustment',
    dispute: 'Payment dispute',
    'stripe_fee': 'Stripe fee',
  }
  return labels[transaction.type] || transaction.type.replaceAll('_', ' ')
}

async function allBalanceTransactions(stripe: Stripe, payoutId: string) {
  const rows: Stripe.BalanceTransaction[] = []
  let startingAfter: string | undefined
  do {
    const page = await stripe.balanceTransactions.list({
      payout: payoutId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
      expand: ['data.source'],
    })
    rows.push(...page.data)
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined
  } while (startingAfter)
  return rows
}

export async function loadStripePayoutDetail(stripe: Stripe, admin: any, payoutId: string): Promise<StripePayoutDetail> {
  const payout = await stripe.payouts.retrieve(payoutId)
  // Stripe's filtered ledger can include the negative payout transfer itself.
  // The report needs the component activity that made up the payout, not the
  // bank-transfer row again, or the deposit would be counted twice.
  const transactions = (await allBalanceTransactions(stripe, payoutId))
    .filter(isPayoutComponentTransaction)
  const metadataInvoiceIds = new Map<string, string[]>()
  const transactionMetadata = new Map<string, Stripe.Metadata>()
  const paymentReferences = new Set<string>()

  for (const transaction of transactions) {
    const source = sourceObject(transaction)
    const reference = sourceId(transaction)
    if (reference) paymentReferences.add(reference)
    let metadata = (source?.metadata || {}) as Stripe.Metadata
    let ids = invoiceIdsFromMetadata(metadata)
    const intentReference = typeof source?.payment_intent === 'string' ? source.payment_intent : source?.payment_intent?.id
    if (intentReference) paymentReferences.add(intentReference)

    if (!ids.length && intentReference) {
      try {
        const intent = await stripe.paymentIntents.retrieve(intentReference)
        metadata = intent.metadata
        ids = invoiceIdsFromMetadata(metadata)
      } catch {
        // The Supabase payment reference lookup below is the safe legacy fallback.
      }
    }
    metadataInvoiceIds.set(transaction.id, ids)
    transactionMetadata.set(transaction.id, metadata)
  }

  const allInvoiceIds = [...new Set([...metadataInvoiceIds.values()].flat())]
  const invoiceSelect = 'id,invoice_number,invoice_type,total_due,payment_reference,campers(first_name,last_name,lot_number)'
  const byId = new Map<string, any>()
  const byReference = new Map<string, any[]>()

  if (allInvoiceIds.length) {
    const { data, error } = await admin.from('invoices').select(invoiceSelect).in('id', allInvoiceIds)
    if (error) throw new Error(`Unable to match Stripe deposit invoices: ${error.message}`)
    for (const invoice of data || []) byId.set(String(invoice.id), invoice)
  }
  if (paymentReferences.size) {
    const { data, error } = await admin.from('invoices').select(invoiceSelect).in('payment_reference', [...paymentReferences])
    if (error) throw new Error(`Unable to match Stripe payment references: ${error.message}`)
    for (const invoice of data || []) {
      const key = String(invoice.payment_reference || '')
      byReference.set(key, [...(byReference.get(key) || []), invoice])
    }
  }

  const rows: StripePayoutRow[] = transactions.map((transaction) => {
    const source = sourceObject(transaction)
    const reference = sourceId(transaction)
    const intentReference = typeof source?.payment_intent === 'string' ? source.payment_intent : source?.payment_intent?.id
    const matches = [
      ...(metadataInvoiceIds.get(transaction.id) || []).map((id) => byId.get(id)).filter(Boolean),
      ...(byReference.get(reference) || []),
      ...(byReference.get(intentReference || '') || []),
    ]
    const invoices = [...new Map(matches.map((invoice) => [String(invoice.id), invoice])).values()].map((invoice: any) => ({
      id: String(invoice.id),
      invoiceNumber: String(invoice.invoice_number || 'Invoice'),
      invoiceType: String(invoice.invoice_type || 'Campground charge'),
      camper: `${invoice.campers?.first_name || ''} ${invoice.campers?.last_name || ''}`.trim() || 'Camper',
      lot: String(invoice.campers?.lot_number || '—'),
      amountCents: Math.round(Number(invoice.total_due || 0) * 100),
    }))

    return {
      id: transaction.id,
      sourceId: reference,
      created: new Date(transaction.created * 1000).toISOString(),
      type: transaction.type,
      description: descriptionFor(transaction, source),
      grossCents: transaction.amount,
      // Stripe exposes its fee as a positive integer although it is deducted.
      // Normalize deductions as negative dollars throughout the office report.
      feeCents: -transaction.fee,
      netCents: transaction.net,
      camperCheckoutFeeCents: Math.max(0, Number(transactionMetadata.get(transaction.id)?.processing_fee_cents || 0)),
      invoices,
    }
  }).sort((a, b) => a.created.localeCompare(b.created))

  return {
    id: payout.id,
    amountCents: payout.amount,
    currency: payout.currency,
    status: payout.status,
    created: new Date(payout.created * 1000).toISOString(),
    arrivalDate: new Date(payout.arrival_date * 1000).toISOString(),
    automatic: payout.automatic,
    method: payout.method,
    rows,
    summary: summarizePayoutRows(rows, payout.amount),
  }
}
