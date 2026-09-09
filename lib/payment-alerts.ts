import { createAdminNotification } from './admin-notifications'

type PaymentAlertInput = {
  admin: any
  invoiceIds: string[]
  camperId?: string | null
  amountPaid: number
  paymentType: 'Online payment' | 'AutoPay'
  origin?: string | null
}

export async function sendPaymentReceivedAlert({
  admin,
  invoiceIds,
  camperId,
  amountPaid,
  paymentType,
}: PaymentAlertInput) {
  const { data: camper } = camperId
    ? await admin
        .from('campers')
        .select('id,first_name,last_name,lot_number')
        .eq('id', camperId)
        .single()
    : { data: null }

  const lotNumber = camper?.lot_number || 'Unknown'
  const camperName = camper
    ? `${camper.first_name || ''} ${camper.last_name || ''}`.trim()
    : 'A camper'
  const title =
    paymentType === 'AutoPay'
      ? `AutoPay received from Site ${lotNumber}`
      : `Payment received from Site ${lotNumber}`
  const message =
    paymentType === 'AutoPay'
      ? `${camperName} paid $${amountPaid.toFixed(2)} by AutoPay.`
      : `${camperName} paid $${amountPaid.toFixed(2)} online.`

  await createAdminNotification(admin, {
    type: 'payment_received',
    title,
    message,
    lot_number: lotNumber,
    camper_id: camperId || null,
    source_table: 'invoices',
    source_id: invoiceIds.join(','),
  }).catch((error) => console.error('Admin payment notification failed:', error))

  return {
    emailStatus: 'daily_summary' as const,
    emailMessage: 'Payment received activity is included in the daily office summary.',
  }
}
