import type { CampgroundBillingSettings } from './campground-settings'

export const AUTO_SITE_CARE_PREFIX = 'auto:'

export type SiteCareEnforcement = {
  templateKey: string
  serviceType: string
  serviceLabel: string
  chargeAmount: number
  maintenanceTitle: string
}

export const enforceableSiteCareTemplates = new Set([
  'weed-eat',
  'spray-weeds',
])

export function storedSiteCareTemplateKey(templateKey: string, autoEnforce: boolean, chargeAmount?: number) {
  const cleanKey = plainSiteCareTemplateKey(templateKey)
  return autoEnforce && enforceableSiteCareTemplates.has(cleanKey)
    ? `${AUTO_SITE_CARE_PREFIX}${cleanKey}${Number.isFinite(chargeAmount) ? `:${Number(chargeAmount).toFixed(2)}` : ''}`
    : cleanKey
}

export function plainSiteCareTemplateKey(templateKey: unknown) {
  return String(templateKey || '').replace(/^auto:/, '').split(':')[0]
}

export function storedSiteCareChargeAmount(templateKey: unknown) {
  const parts = String(templateKey || '').split(':')
  const amount = parts.length >= 3 ? Number(parts[2]) : Number.NaN
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

export function isAutomaticSiteCareTemplate(templateKey: unknown) {
  const value = String(templateKey || '')
  return value.startsWith(AUTO_SITE_CARE_PREFIX)
    && enforceableSiteCareTemplates.has(plainSiteCareTemplateKey(value))
}

export function siteCareEnforcementFor(
  templateKey: unknown,
  settings: CampgroundBillingSettings
): SiteCareEnforcement | null {
  const key = plainSiteCareTemplateKey(templateKey)
  const serviceType = key === 'weed-eat'
    ? 'full_weed_eat'
    : key === 'spray-weeds'
      ? 'spray_weeds'
      : ''

  if (!serviceType) return null

  const service = settings.siteServices.find((item) => item.type === serviceType)
  if (!service || !Number.isFinite(service.amount) || service.amount <= 0) return null
  const savedAmount = storedSiteCareChargeAmount(templateKey)

  return {
    templateKey: key,
    serviceType: service.type,
    serviceLabel: service.label,
    chargeAmount: savedAmount || service.amount,
    maintenanceTitle: key === 'weed-eat'
      ? 'Site care deadline — weed eat site'
      : 'Site care deadline — spray weeds',
  }
}

export function siteCareSourceMarker(noticeId: string) {
  return `Site care notice ${noticeId}`
}
