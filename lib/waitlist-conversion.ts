import { addMonthsToDate, addYearsToDate, normalizeLotRentDueDate } from './renewal-rent-schedule.ts'

export const NEW_CAMPER_ANNUAL_RENT = 1750
export const NEW_CAMPER_ASSOCIATION_FEE = 250
export const NEW_CAMPER_PAYMENT_COUNT = 2
export const NEW_CAMPER_INSTALLMENT = NEW_CAMPER_ANNUAL_RENT / NEW_CAMPER_PAYMENT_COUNT
export const TEMPORARY_SITE_OPTION = '__TEMPORARY_PORTAL_SPOT__'

export function cleanWaitlistConversionValue(value: unknown, maxLength = 160) {
  return String(value || '').trim().slice(0, maxLength)
}

export function canConvertWaitlistStatus(value: unknown) {
  const status = String(value || '').trim().toLowerCase()
  return !['converted', 'removed', 'declined'].includes(status)
}

export function nextTemporaryPortalSite(values: unknown[]) {
  const highest = values.reduce<number>((current, value) => {
    const match = String(value || '').trim().toUpperCase().match(/^TEMP\s+PORTAL\s+(\d+)$/)
    return match ? Math.max(current, Number(match[1])) : current
  }, 0)
  return `TEMP PORTAL ${highest + 1}`
}

export function newCamperRentSchedule(contractStartDate: string) {
  const firstDueDate = normalizeLotRentDueDate(contractStartDate)
  if (!firstDueDate) return []
  return [0, 6].map((monthOffset, index) => ({
    installment: index + 1,
    amount: NEW_CAMPER_INSTALLMENT,
    dueDate: normalizeLotRentDueDate(addMonthsToDate(contractStartDate, monthOffset)),
  }))
}

export function newCamperContractEndDate(contractStartDate: string) {
  return addYearsToDate(contractStartDate, 1)
}

export function waitlistWelcomeCopy(_firstName: unknown, siteNumber: unknown, temporarySpot = false) {
  const site = cleanWaitlistConversionValue(siteNumber, 40)
  const siteText = temporarySpot
    ? ' with temporary portal access while your permanent campsite becomes available'
    : site ? ` at Site ${site}` : ''

  return {
    subject: 'Welcome to the Bur Oaks family — set up your camper portal',
    heading: 'Welcome to the Bur Oaks family!',
    message: `We’re excited to officially welcome you to Bur Oaks Campground${siteText}. Your Camper Portal will be your home base for documents, bills, campground updates, events, messages, and service requests.`,
  }
}
