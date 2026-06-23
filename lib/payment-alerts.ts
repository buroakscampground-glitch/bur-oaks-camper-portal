import { createAdminNotification } from './admin-notifications'
import { sendAdminAlertEmail } from './admin-alert-email'

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
  origin,
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

  let emailStatus: 'sent' | 'skipped' | 'failed' = 'sent'
  let emailMessage = ''

  try {
    const emailResult = await sendAdminAlertEmail({
      subject: title,
      heading: title,
      message,
      details: [
        { label: 'Site', value: lotNumber },
        { label: 'Camper', value: camperName },
        { label: 'Amount', value: `$${amountPaid.toFixed(2)}` },
        { label: 'Invoices', value: String(invoiceIds.length) },
        { label: 'Payment type', value: paymentType },
      ],
      actionUrl: `${origin || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.buroakscampground.com'}/admin/invoices`,
      actionLabel: 'View invoices',
    })

    if ((emailResult as any)?.skipped) {
      emailStatus = 'skipped'
      emailMessage = (emailResult as any)?.reason || 'Email alert is not configured.'
    }
  } catch (error: any) {
    emailStatus = 'failed'
    emailMessage = error?.message || 'Admin payment alert email failed.'
    console.error('Admin payment alert email failed:', error)
  }

  return { emailStatus, emailMessage }
}
