import { isOperationalCamper } from './camper-records.ts'

export type AvailabilityCamper = {
  id: string
  lot_number?: string | null
  first_name?: string | null
  last_name?: string | null
  role?: string | null
  active?: boolean | null
}

export type AvailabilityRenewal = {
  camper_id?: string | null
  lot_number?: string | null
  contract_end_date?: string | null
  status?: string | null
}

export type AvailabilitySite = {
  lotNumber: string
  camperId?: string | null
  camperName?: string | null
  openingDate?: string | null
  status: 'available_now' | 'confirmed' | 'possible' | 'overdue_opening'
  reason: string
}

export type AvailabilityMonth = {
  key: string
  label: string
  confirmed: AvailabilitySite[]
  possible: AvailabilitySite[]
}

function siteKey(value: unknown) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function visibleLot(value: unknown) {
  const lot = String(value || '').trim()
  const key = siteKey(lot)
  if (!key || key === 'STAFF' || ['1001', '1002', '1003'].includes(key)) return ''
  return lot
}

function camperName(camper?: AvailabilityCamper | null) {
  if (!camper) return ''
  return `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Camper'
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function monthSequence(today: string, count = 12) {
  const [year, month] = today.split('-').map(Number)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1, 12))
    const key = date.toISOString().slice(0, 7)
    return {
      key,
      label: date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }),
      confirmed: [] as AvailabilitySite[],
      possible: [] as AvailabilitySite[],
    }
  })
}

function byLot(a: AvailabilitySite, b: AvailabilitySite) {
  return a.lotNumber.localeCompare(b.lotNumber, undefined, { numeric: true })
}

export function buildSiteAvailability({
  lots,
  campers,
  renewals,
  today,
}: {
  lots: Array<{ lot_number?: unknown }>
  campers: AvailabilityCamper[]
  renewals: AvailabilityRenewal[]
  today: string
}) {
  const activeCampers = campers.filter((camper) => camper.active !== false && isOperationalCamper(camper) && visibleLot(camper.lot_number))
  const campersById = new Map(activeCampers.map((camper) => [String(camper.id), camper]))
  const occupied = new Map(activeCampers.map((camper) => [siteKey(camper.lot_number), camper]))
  const knownLots = new Map<string, string>()

  for (const lot of lots) {
    const display = visibleLot(lot.lot_number)
    if (display) knownLots.set(siteKey(display), display)
  }
  for (const camper of activeCampers) {
    const display = visibleLot(camper.lot_number)
    if (display && !knownLots.has(siteKey(display))) knownLots.set(siteKey(display), display)
  }

  const availableNow = [...knownLots.entries()]
    .filter(([key]) => !occupied.has(key))
    .map(([, lotNumber]) => ({ lotNumber, status: 'available_now' as const, reason: 'No active camper is assigned to this site.' }))
    .sort(byLot)

  const months = monthSequence(today)
  const monthMap = new Map(months.map((month) => [month.key, month]))
  const overdueOpenings: AvailabilitySite[] = []

  for (const renewal of renewals) {
    const status = String(renewal.status || '')
    const confirmed = status === 'Camper Leaving' || status === 'Campground Not Renewing'
    const possible = status === 'Awaiting Response'
    if (!confirmed && !possible) continue

    const camper = campersById.get(String(renewal.camper_id || '')) || activeCampers.find((item) => siteKey(item.lot_number) === siteKey(renewal.lot_number))
    const lotNumber = visibleLot(renewal.lot_number || camper?.lot_number)
    const contractEnd = String(renewal.contract_end_date || '')
    const openingDate = contractEnd ? addDays(contractEnd, 1) : ''
    if (!lotNumber || !openingDate) continue

    const site: AvailabilitySite = {
      lotNumber,
      camperId: camper?.id || null,
      camperName: camperName(camper),
      openingDate,
      status: confirmed ? 'confirmed' : 'possible',
      reason: status === 'Campground Not Renewing'
        ? 'Campground decision — renewal not offered.'
        : status === 'Camper Leaving'
          ? 'Camper chose not to renew.'
          : 'Waiting for the camper’s renewal answer — do not promise this site yet.',
    }

    if (confirmed && openingDate < today) {
      overdueOpenings.push({ ...site, status: 'overdue_opening', reason: `${site.reason} Confirm the site is cleared before offering it.` })
      continue
    }

    const month = monthMap.get(openingDate.slice(0, 7))
    if (!month) continue
    if (confirmed) month.confirmed.push(site)
    else month.possible.push(site)
  }

  months.forEach((month) => {
    month.confirmed.sort(byLot)
    month.possible.sort(byLot)
  })
  overdueOpenings.sort(byLot)

  return {
    availableNow,
    overdueOpenings,
    months,
    confirmedCount: overdueOpenings.length + months.reduce((sum, month) => sum + month.confirmed.length, 0),
    possibleCount: months.reduce((sum, month) => sum + month.possible.length, 0),
  }
}
