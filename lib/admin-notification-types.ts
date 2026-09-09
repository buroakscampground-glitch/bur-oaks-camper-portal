export const informationalAdminNotificationTypes = [
  'payment_received',
  'saturday_dinner',
  'sewer_pump_out',
] as const

const informationalTypes = new Set<string>(informationalAdminNotificationTypes)

export function requiresAdminAttention(type: unknown) {
  return !informationalTypes.has(String(type || ''))
}
