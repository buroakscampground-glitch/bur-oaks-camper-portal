import Stripe from 'stripe'
import { sendPaymentReceivedAlert } from './payment-alerts'
import { requiredStripePaymentEvents, stripePaymentResolution } from './stripe-ach-status'

function metadataInvoiceIds(intent: Stripe.PaymentIntent) {
  try {
    const ids = JSON.parse(intent.metadata.invoice_ids || '[]')
    if (Array.isArray(ids)) return ids.map(String).filter(Boolean)
  } catch {
    // Fall through to the single-invoice AutoPay metadata.
  }
  return intent.metadata.invoice_id ? [String(intent.metadata.invoice_id)] : []
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id) => right.includes(id))
}

export async function ensureStripePaymentWebhook(stripe: Stripe, siteUrl: string) {
  const expectedUrl = `${siteUrl.replace(/\/+$/, '')}/api/stripe-webhook`
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
  const matchingEndpoints = endpoints.data.filter((item) => {
    if (item.status === 'disabled') return false
    try {
      return new URL(item.url).pathname.replace(/\/+$/, '') === '/api/stripe-webhook'
    } catch {
      return item.url.replace(/\/+$/, '') === expectedUrl
    }
  })

  if (!matchingEndpoints.length) {
    return { status: 'missing' as const, expectedUrl }
  }

  const updates = await Promise.all(matchingEndpoints.map(async (endpoint) => {
    if (endpoint.enabled_events.includes('*')) return { endpointId: endpoint.id, addedEvents: [] }
    const missingEvents = requiredStripePaymentEvents.filter(
      (event) => !endpoint.enabled_events.includes(event),
    )
    if (missingEvents.length) {
      await stripe.webhookEndpoints.update(endpoint.id, {
        enabled_events: Array.from(new Set([...endpoint.enabled_events, ...requiredStripePaymentEvents])) as Stripe.WebhookEndpointUpdateParams.EnabledEvent[],
      })
    }
    return { endpointId: endpoint.id, addedEvents: missingEvents }
  }))

  return {
    status: updates.some((update) => update.addedEvents.length) ? 'updated' as const : 'already-complete' as const,
    endpoints: updates,
  }
}

export async function reconcileProcessingAchPayments({
  stripe,
  admin,
  origin,
}: {
  stripe: Stripe
  admin: any
  origin: string
}) {
  const { data: invoices, error } = await admin
    .from('invoices')
    .select('id,camper_id,invoice_number,total_due,status,payment_method,payment_reference')
    .eq('status', 'processing')
    .ilike('payment_method', '%ACH%')
    .not('payment_reference', 'is', null)

  if (error) throw error

  const groups = new Map<string, any[]>()
  for (const invoice of invoices || []) {
    const reference = String(invoice.payment_reference || '')
    if (!reference.startsWith('pi_')) continue
    groups.set(reference, [...(groups.get(reference) || []), invoice])
  }

  const summary = {
    checkedPayments: groups.size,
    checkedInvoices: Array.from(groups.values()).reduce((sum, group) => sum + group.length, 0),
    paidInvoices: 0,
    reopenedInvoices: 0,
    pendingInvoices: 0,
    failedPayments: 0,
    results: [] as Array<Record<string, unknown>>,
  }

  for (const [paymentReference, paymentInvoices] of groups) {
    try {
      const intent = await stripe.paymentIntents.retrieve(paymentReference)
      const invoiceIds = paymentInvoices.map((invoice) => String(invoice.id)).sort()
      const intentInvoiceIds = metadataInvoiceIds(intent).sort()
      const expectedInvoiceCents = paymentInvoices.reduce(
        (sum, invoice) => sum + Math.round(Number(invoice.total_due || 0) * 100),
        0,
      )
      const feeCents = Math.max(0, Math.round(Number(intent.metadata.processing_fee_cents || 0)))

      if (
        !sameIds(invoiceIds, intentInvoiceIds) ||
        expectedInvoiceCents + feeCents !== intent.amount
      ) {
        summary.failedPayments += 1
        summary.results.push({ paymentReference, status: 'verification-failed', invoiceIds })
        continue
      }

      const resolution = stripePaymentResolution(intent.status)
      if (resolution === 'paid') {
        const settledPaymentMethod = String(paymentInvoices[0]?.payment_method || '')
          .replace(/\s+processing$/i, '') || 'Online ACH'
        const { data: updated, error: updateError } = await admin
          .from('invoices')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            payment_method: settledPaymentMethod,
          })
          .in('id', invoiceIds)
          .eq('status', 'processing')
          .eq('payment_reference', paymentReference)
          .select('id')

        if (updateError) throw updateError
        summary.paidInvoices += updated?.length || 0
        if (updated?.length) {
          await sendPaymentReceivedAlert({
            admin,
            invoiceIds: updated.map((invoice: any) => String(invoice.id)),
            camperId: paymentInvoices[0]?.camper_id,
            amountPaid: expectedInvoiceCents / 100,
            paymentType: 'Online payment',
            origin,
          })
        }
      } else if (resolution === 'reopen') {
        const { data: updated, error: updateError } = await admin
          .from('invoices')
          .update({ status: 'sent', paid_at: null, payment_method: null, payment_reference: null })
          .in('id', invoiceIds)
          .eq('status', 'processing')
          .eq('payment_reference', paymentReference)
          .select('id')

        if (updateError) throw updateError
        summary.reopenedInvoices += updated?.length || 0
      } else {
        summary.pendingInvoices += paymentInvoices.length
      }

      summary.results.push({ paymentReference, status: intent.status, resolution, invoiceIds })
    } catch (paymentError: any) {
      summary.failedPayments += 1
      summary.results.push({
        paymentReference,
        status: 'check-failed',
        error: paymentError?.message || 'Unable to check Stripe payment.',
      })
    }
  }

  return summary
}
