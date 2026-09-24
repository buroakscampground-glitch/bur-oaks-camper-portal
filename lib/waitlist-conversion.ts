export const NEW_CAMPER_ANNUAL_RENT = 1750
export const NEW_CAMPER_ASSOCIATION_FEE = 250

export function cleanWaitlistConversionValue(value: unknown, maxLength = 160) {
  return String(value || '').trim().slice(0, maxLength)
}

export function canConvertWaitlistStatus(value: unknown) {
  const status = String(value || '').trim().toLowerCase()
  return !['converted', 'removed', 'declined'].includes(status)
}

export function waitlistWelcomeCopy(_firstName: unknown, siteNumber: unknown) {
  const site = cleanWaitlistConversionValue(siteNumber, 40)
  const siteText = site ? ` at Site ${site}` : ''

  return {
    subject: 'Welcome to the Bur Oaks family — set up your camper portal',
    heading: 'Welcome to the Bur Oaks family!',
    message: `We’re excited to officially welcome you to Bur Oaks Campground${siteText}. Your Camper Portal will be your home base for documents, bills, campground updates, events, messages, and service requests.`,
  }
}
