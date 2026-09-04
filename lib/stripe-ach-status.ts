export const requiredStripePaymentEvents = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'payment_intent.processing',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
] as const

export function stripePaymentResolution(status: string) {
  if (status === 'succeeded') return 'paid'
  if (status === 'canceled' || status === 'requires_payment_method') return 'reopen'
  return 'pending'
}
