const PHONE_LOGIN_DOMAIN = 'phone-login.buroakscampground.com'

export function phonePortalLoginEmail(value: unknown) {
  const rawDigits = String(value || '').replace(/\D/g, '')
  const digits = rawDigits.length === 10
    ? `1${rawDigits}`
    : rawDigits.length === 11 && rawDigits.startsWith('1')
      ? rawDigits
      : ''
  return digits ? `phone-${digits}@${PHONE_LOGIN_DOMAIN}` : ''
}

export function isPhonePortalLoginEmail(value: unknown) {
  return String(value || '').trim().toLowerCase().endsWith(`@${PHONE_LOGIN_DOMAIN}`)
}

export function portalLoginEmail(value: unknown) {
  const entered = String(value || '').trim().toLowerCase()
  return entered.includes('@') ? entered : phonePortalLoginEmail(entered)
}

export function deliverablePortalEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase()
  return email && !isPhonePortalLoginEmail(email) ? email : ''
}
