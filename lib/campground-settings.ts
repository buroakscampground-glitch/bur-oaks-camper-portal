export type SiteServiceSetting = {
  type: string
  label: string
  amount: number
}

export type CampgroundBillingSettings = {
  electricDefaultRate: number
  waterTrashFees: number[]
  sewerPumpOutFee: number
  siteServices: SiteServiceSetting[]
}

export const campgroundSettingKeys = {
  electricDefaultRate: 'electric_default_rate',
  waterTrashFees: 'water_trash_fee_options',
  sewerPumpOutFee: 'sewer_pump_out_fee',
  siteServiceFullWeedEat: 'site_service_full_weed_eat',
  siteServiceHalfWeedEat: 'site_service_half_weed_eat',
  siteServiceSprayWeeds: 'site_service_spray_weeds',
  siteServiceHalfSprayWeeds: 'site_service_half_spray_weeds',
  siteServicePressureWash: 'site_service_pressure_wash',
  siteServiceTrashPickup: 'site_service_trash_pickup',
}

export const defaultCampgroundBillingSettings: CampgroundBillingSettings = {
  electricDefaultRate: 0.23,
  waterTrashFees: [20, 25],
  sewerPumpOutFee: 10,
  siteServices: [
    { type: 'full_weed_eat', label: 'Full weed eat', amount: 45 },
    { type: 'half_weed_eat', label: 'Half weed eat', amount: 20 },
    { type: 'spray_weeds', label: 'Spray weeds', amount: 45 },
    { type: 'half_spray_weeds', label: 'Half spray weeds', amount: 20 },
    { type: 'pressure_wash', label: 'Pressure wash', amount: 20 },
    { type: 'trash_pickup', label: 'Trash pickup', amount: 30 },
  ],
}

function positiveMoney(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function parseWaterTrashOptions(value: unknown) {
  if (typeof value !== 'string') return defaultCampgroundBillingSettings.waterTrashFees

  const options = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((amount) => Number.isFinite(amount) && amount >= 0)

  return options.length ? Array.from(new Set(options)) : defaultCampgroundBillingSettings.waterTrashFees
}

export function normalizeCampgroundBillingSettings(rows?: Array<{ key: string; value: string }> | null): CampgroundBillingSettings {
  const values = new Map((rows || []).map((row) => [row.key, row.value]))
  const defaults = defaultCampgroundBillingSettings

  const amountFor = (key: string, fallback: number) => positiveMoney(values.get(key), fallback)

  return {
    electricDefaultRate: amountFor(campgroundSettingKeys.electricDefaultRate, defaults.electricDefaultRate),
    waterTrashFees: parseWaterTrashOptions(values.get(campgroundSettingKeys.waterTrashFees)),
    sewerPumpOutFee: amountFor(campgroundSettingKeys.sewerPumpOutFee, defaults.sewerPumpOutFee),
    siteServices: defaults.siteServices.map((service) => {
      const key =
        service.type === 'full_weed_eat'
          ? campgroundSettingKeys.siteServiceFullWeedEat
          : service.type === 'half_weed_eat'
            ? campgroundSettingKeys.siteServiceHalfWeedEat
            : service.type === 'spray_weeds'
              ? campgroundSettingKeys.siteServiceSprayWeeds
              : service.type === 'half_spray_weeds'
                ? campgroundSettingKeys.siteServiceHalfSprayWeeds
                : service.type === 'trash_pickup'
                  ? campgroundSettingKeys.siteServiceTrashPickup
                  : campgroundSettingKeys.siteServicePressureWash

      return { ...service, amount: amountFor(key, service.amount) }
    }),
  }
}

export async function loadCampgroundBillingSettings(client: any): Promise<CampgroundBillingSettings> {
  if (!client?.from) return defaultCampgroundBillingSettings

  const keys = Object.values(campgroundSettingKeys)
  const { data, error } = await client
    .from('app_settings')
    .select('key,value')
    .in('key', keys)

  if (error) return defaultCampgroundBillingSettings

  return normalizeCampgroundBillingSettings(data || [])
}
