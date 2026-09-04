import Stripe from 'stripe'
import { createAdminNotification } from './admin-notifications'
import { sendAdminAlertEmail } from './admin-alert-email'

function dollars(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export async function alertStripePayoutProblem({
  admin,
  payout,
  origin,
}: {
  admin: any
  payout: Stripe.Payout
  origin?: string | null
}) {
  const { data: existing } = await admin
    .from('admin_notifications')
    .select('id')
    .eq('source_table', 'stripe_payouts')
    .eq('source_id', payout.id)
    .limit(1)

  if (existing?.length) return { skipped: true, reason: 'This payout problem was already reported.' }

  const failure = payout.failure_message || payout.failure_code || `Stripe marked this payout ${payout.status}.`
  const title = `Bank deposit ${payout.status}: ${dollars(payout.amount)}`
  const message = `${failure} Open Stripe deposits and correct the bank payout before relying on this money as deposited.`

  await createAdminNotification(admin, {
    type: 'payment_received',
    title,
    message,
    source_table: 'stripe_payouts',
    source_id: payout.id,
  })

  let emailStatus: 'sent' | 'failed' = 'sent'
  try {
    await sendAdminAlertEmail({
      subject: `Action required: ${title}`,
      heading: title,
      message,
      details: [
        { label: 'Payout ID', value: payout.id },
        { label: 'Amount', value: dollars(payout.amount) },
        { label: 'Status', value: payout.status },
        { label: 'Reason', value: failure },
      ],
      actionUrl: `${origin || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.buroakscampground.com'}/admin/stripe-deposits`,
      actionLabel: 'Review Stripe deposits',
    })
  } catch (error) {
    emailStatus = 'failed'
    console.error('Bank deposit failure email failed:', error)
  }

  return { alerted: true, emailStatus }
}
