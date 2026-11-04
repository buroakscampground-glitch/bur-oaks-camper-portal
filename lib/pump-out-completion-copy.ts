import { camperTextWithLink } from './portal-sms-links.ts'

function displayLot(value: unknown) {
  return String(value || '').trim() || 'your campsite'
}

export function pumpOutCompletionPortalMessage(lotNumber: unknown) {
  return `Your sewer pump-out for Site ${displayLot(lotNumber)} has been completed. The service charge will be added to your next electric bill.`
}

export function pumpOutCompletionSms(lotNumber: unknown) {
  return camperTextWithLink({
    message: `PUMP-OUT COMPLETE - Site ${displayLot(lotNumber)}. The service charge will be on your next electric bill.`,
    path: '/maintenance',
    linkLabel: 'View service',
    compact: true,
  })
}
