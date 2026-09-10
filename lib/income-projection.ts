export const projectionMonths = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export type ProjectionSite = {
  lotNumber: string
  camperIds: string[]
  annualLotRent: number
  lotRentExempt?: boolean
}

export type ProjectionReading = {
  camper_id?: string | null
  reading_date?: string | null
  kwh_used?: number | string | null
  amount_due?: number | string | null
}

export type ProjectionInvoice = {
  camper_id?: string | null
  invoice_type?: string | null
  due_date?: string | null
  created_at?: string | null
  total_due?: number | string | null
  status?: string | null
  paid_at?: string | null
}

export type ProjectionRenewal = {
  camper_id?: string | null
  lot_number?: string | null
  contract_end_date?: string | null
  status?: string | null
}

export type MonthlyIncomeProjection = {
  monthIndex: number
  label: string
  lotRent: number
  association: number
  electric: number
  total: number
  grossLotRent: number
  grossAssociation: number
  grossElectric: number
  grossTotal: number
  actualLotRent: number
  actualAssociation: number
  actualElectric: number
  actualTotal: number
  variance: number
}

type ProjectionOptions = {
  sites: ProjectionSite[]
  readings: ProjectionReading[]
  invoices: ProjectionInvoice[]
  renewals?: ProjectionRenewal[]
  associationFee: number
  fallbackAssociationMonth: number
  projectionYear?: number
  lotRentTiming?: 'contract' | 'spread' | 'history'
  asOfDate?: string | Date
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

type WeightedValue = { value: number; weight: number }

function weightedAverage(values: WeightedValue[]) {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0)
  return totalWeight
    ? values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight
    : 0
}

function invoiceCategory(invoiceType: unknown): 'lotRent' | 'association' | 'electric' | null {
  const type = String(invoiceType || '').toLowerCase()
  if (type.includes('association')) return 'association'
  if (type.includes('electric')) return 'electric'
  if (type.includes('rent')) return 'lotRent'
  return null
}

function safeDate(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function recordMonth(value?: string | null) {
  if (!value) return null
  const match = String(value).match(/^\d{4}-(\d{2})/)
  if (match) {
    const month = Number(match[1]) - 1
    return month >= 0 && month <= 11 ? month : null
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getMonth()
}

function latestBillingInvoice(invoices: ProjectionInvoice[], camperIds: Set<string>, matcher: (type: string) => boolean) {
  const matching = invoices
    .filter((invoice) => camperIds.has(String(invoice.camper_id || '')) && matcher(String(invoice.invoice_type || '').toLowerCase()))
    .filter((invoice) => recordMonth(invoice.due_date || invoice.created_at) !== null)
    .sort((a, b) => String(b.due_date || b.created_at || '').localeCompare(String(a.due_date || a.created_at || '')))

  return matching[0]
}

function normalizeLot(value: unknown) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function buildIncomeProjection(options: ProjectionOptions) {
  const {
    sites,
    readings,
    invoices,
    renewals = [],
    associationFee,
    fallbackAssociationMonth,
    projectionYear = new Date().getFullYear(),
    lotRentTiming = 'contract',
    asOfDate = new Date(),
  } = options

  const months: MonthlyIncomeProjection[] = projectionMonths.map((label, monthIndex) => ({
    monthIndex,
    label,
    lotRent: 0,
    association: 0,
    electric: 0,
    total: 0,
    grossLotRent: 0,
    grossAssociation: 0,
    grossElectric: 0,
    grossTotal: 0,
    actualLotRent: 0,
    actualAssociation: 0,
    actualElectric: 0,
    actualTotal: 0,
    variance: 0,
  }))

  const siteByCamper = new Map<string, string>()
  for (const site of sites) {
    for (const camperId of site.camperIds) siteByCamper.set(String(camperId), site.lotNumber)
  }

  const readingValues = new Map<string, WeightedValue[]>()
  const allSiteValues = new Map<string, WeightedValue[]>()
  const readingYears = new Set<string>()
  const siteReadingPeriodTotals = new Map<string, { lotNumber: string; month: number; year: number; amount: number; kwh: number }>()
  let electricReadingsLearned = 0
  let electricKwhLearned = 0
  for (const reading of readings) {
    const lotNumber = siteByCamper.get(String(reading.camper_id || ''))
    const month = recordMonth(reading.reading_date)
    const amount = Number(reading.amount_due || 0)
    const rawKwh = Number(reading.kwh_used || 0)
    const kwh = Number.isFinite(rawKwh) ? Math.max(0, rawKwh) : 0
    if (!lotNumber || month === null || !Number.isFinite(amount) || amount < 0) continue
    const readingPeriod = String(reading.reading_date || '').slice(0, 10) || `month-${month}`
    const periodKey = `${lotNumber}:${readingPeriod}`
    const current = siteReadingPeriodTotals.get(periodKey)
    siteReadingPeriodTotals.set(periodKey, {
      lotNumber,
      month,
      year: Number(String(reading.reading_date || '').slice(0, 4)),
      amount: Number(((current?.amount || 0) + amount).toFixed(2)),
      kwh: Number(((current?.kwh || 0) + kwh).toFixed(2)),
    })
    electricReadingsLearned += 1
    electricKwhLearned += kwh
    if (reading.reading_date) readingYears.add(String(reading.reading_date).slice(0, 4))
  }

  const latestElectricYear = Math.max(
    ...[...siteReadingPeriodTotals.values()].map((period) => period.year).filter(Number.isFinite),
    0,
  )
  for (const period of siteReadingPeriodTotals.values()) {
    const key = `${period.lotNumber}:${period.month}`
    // Each newer season carries twice the influence of the season before it.
    // This lets the forecast adapt to changing usage without allowing one new
    // meter reading to erase the campground's longer seasonal pattern.
    const age = Math.max(0, latestElectricYear - period.year)
    const weightedAmount = { value: period.amount, weight: 2 ** (1 - age) }
    readingValues.set(key, [...(readingValues.get(key) || []), weightedAmount])
    allSiteValues.set(period.lotNumber, [...(allSiteValues.get(period.lotNumber) || []), weightedAmount])
  }

  const learningByCategory = {
    lotRent: { paidAmount: 0, matureUnpaidAmount: 0, paidCount: 0, matureUnpaidCount: 0 },
    association: { paidAmount: 0, matureUnpaidAmount: 0, paidCount: 0, matureUnpaidCount: 0 },
    electric: { paidAmount: 0, matureUnpaidAmount: 0, paidCount: 0, matureUnpaidCount: 0 },
  }
  const asOf = safeDate(asOfDate instanceof Date ? asOfDate.toISOString() : asOfDate) || new Date()
  const matureBefore = new Date(asOf.getTime() - 45 * 24 * 60 * 60 * 1000)
  let processingIncome = 0
  let paymentsLearned = 0
  for (const invoice of invoices) {
    if (!siteByCamper.has(String(invoice.camper_id || ''))) continue
    const amount = Number(invoice.total_due || 0)
    const status = String(invoice.status || '').toLowerCase()
    const category = invoiceCategory(invoice.invoice_type)
    if (!category || !Number.isFinite(amount) || amount < 0 || ['cancelled', 'canceled', 'void', 'refunded'].includes(status)) continue

    if (status === 'processing') processingIncome += amount
    if (status === 'paid') {
      paymentsLearned += 1
      learningByCategory[category].paidAmount += amount
      learningByCategory[category].paidCount += 1
      const cashDate = invoice.paid_at || invoice.due_date || invoice.created_at
      const month = recordMonth(cashDate)
      const year = Number(String(cashDate || '').slice(0, 4))
      if (year === projectionYear && month !== null) {
        if (category === 'association') months[month].actualAssociation += amount
        else if (category === 'lotRent') months[month].actualLotRent += amount
        else months[month].actualElectric += amount
      }
      continue
    }

    const dueDate = safeDate(invoice.due_date || invoice.created_at)
    if (status !== 'processing' && dueDate && dueDate <= matureBefore) {
      learningByCategory[category].matureUnpaidAmount += amount
      learningByCategory[category].matureUnpaidCount += 1
    }
  }

  function learnedCollectionRate(category: keyof typeof learningByCategory) {
    const data = learningByCategory[category]
    const observations = data.paidCount + data.matureUnpaidCount
    if (observations < 5 || data.matureUnpaidAmount <= 0) return 1
    const averageInvoice = (data.paidAmount + data.matureUnpaidAmount) / observations
    const priorSuccessfulAmount = averageInvoice * 5
    return Math.max(.75, Math.min(1, (data.paidAmount + priorSuccessfulAmount) / (data.paidAmount + data.matureUnpaidAmount + priorSuccessfulAmount)))
  }

  const collectionRates = {
    lotRent: learnedCollectionRate('lotRent'),
    association: learnedCollectionRate('association'),
    electric: learnedCollectionRate('electric'),
  }

  const monthlySeasonalAverages = projectionMonths.map((_, monthIndex) => {
    const siteAverages = sites
      .map((site) => weightedAverage(readingValues.get(`${site.lotNumber}:${monthIndex}`) || []))
      .filter((value) => value > 0)
    return average(siteAverages)
  })
  const campgroundFallback = average(
    sites.map((site) => weightedAverage(allSiteValues.get(site.lotNumber) || [])).filter((value) => value > 0),
  )

  let exactElectricSiteMonths = 0
  let rentHistoryMatches = 0
  let associationHistoryMatches = 0
  let configuredRentSites = 0
  let savedRentSites = 0
  let inferredRentSites = 0
  let contractDateMatches = 0

  const renewalByCamper = new Map<string, ProjectionRenewal>()
  const renewalByLot = new Map<string, ProjectionRenewal>()
  for (const renewal of renewals) {
    if (!renewal.contract_end_date) continue
    if (renewal.camper_id) renewalByCamper.set(String(renewal.camper_id), renewal)
    const renewalLot = normalizeLot(renewal.lot_number)
    if (renewalLot) renewalByLot.set(renewalLot, renewal)
  }

  for (const site of sites) {
    const camperIds = new Set(site.camperIds.map(String))
    const contractRenewal = site.camperIds
      .map((camperId) => renewalByCamper.get(String(camperId)))
      .find(Boolean) || renewalByLot.get(normalizeLot(site.lotNumber))
    const contractMonth = contractRenewal
      ? recordMonth(contractRenewal.contract_end_date)
      : null
    if (contractMonth !== null) contractDateMatches += 1
    const historicRentInvoice = latestBillingInvoice(
      invoices,
      camperIds,
      (type) => type.includes('rent') && !type.includes('association'),
    )
    const historicRentAmount = Number(historicRentInvoice?.total_due || 0)
    const projectedAnnualRent = site.lotRentExempt ? 0 : site.annualLotRent > 0 ? site.annualLotRent : historicRentAmount
    if (projectedAnnualRent > 0) {
      configuredRentSites += 1
      if (site.annualLotRent > 0) savedRentSites += 1
      else inferredRentSites += 1
      const historicRentMonth = historicRentInvoice
        ? recordMonth(historicRentInvoice.due_date || historicRentInvoice.created_at)
        : null
      if (historicRentMonth !== null) rentHistoryMatches += 1
      if (lotRentTiming === 'contract' && contractMonth !== null) {
        const quarterlyRent = projectedAnnualRent / 4
        for (let quarter = 0; quarter < 4; quarter += 1) {
          months[(contractMonth + quarter * 3) % 12].lotRent += quarterlyRent
        }
      } else if (lotRentTiming === 'history' && historicRentMonth !== null) {
        months[historicRentMonth].lotRent += projectedAnnualRent
      } else {
        const monthlyRent = projectedAnnualRent / 12
        for (const month of months) month.lotRent += monthlyRent
      }
    }

    const historicAssociationInvoice = latestBillingInvoice(
      invoices,
      camperIds,
      (type) => type.includes('association'),
    )
    const historicAssociationMonth = historicAssociationInvoice
      ? recordMonth(historicAssociationInvoice.due_date || historicAssociationInvoice.created_at)
      : null
    if (historicAssociationMonth !== null) associationHistoryMatches += 1
    // The association fee is one campground-wide annual charge. Contract
    // anniversaries control quarterly rent, but never move or spread this fee.
    months[fallbackAssociationMonth].association += associationFee

    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const exactValues = readingValues.get(`${site.lotNumber}:${monthIndex}`) || []
      if (exactValues.length) exactElectricSiteMonths += 1
      const siteOverall = weightedAverage(allSiteValues.get(site.lotNumber) || [])
      const projectedElectric = exactValues.length
        ? weightedAverage(exactValues)
        : monthlySeasonalAverages[monthIndex] || siteOverall || campgroundFallback
      months[monthIndex].electric += projectedElectric
    }
  }

  for (const month of months) {
    month.grossLotRent = Number(month.lotRent.toFixed(2))
    month.grossAssociation = Number(month.association.toFixed(2))
    month.grossElectric = Number(month.electric.toFixed(2))
    month.grossTotal = Number((month.grossLotRent + month.grossAssociation + month.grossElectric).toFixed(2))
    month.lotRent = Number((month.grossLotRent * collectionRates.lotRent).toFixed(2))
    month.association = Number((month.grossAssociation * collectionRates.association).toFixed(2))
    month.electric = Number((month.grossElectric * collectionRates.electric).toFixed(2))
    month.total = Number((month.lotRent + month.association + month.electric).toFixed(2))
    month.actualLotRent = Number(month.actualLotRent.toFixed(2))
    month.actualAssociation = Number(month.actualAssociation.toFixed(2))
    month.actualElectric = Number(month.actualElectric.toFixed(2))
    month.actualTotal = Number((month.actualLotRent + month.actualAssociation + month.actualElectric).toFixed(2))
    month.variance = Number((month.actualTotal - month.total).toFixed(2))
  }

  const annualLotRent = months.reduce((sum, month) => sum + month.lotRent, 0)
  const annualAssociation = months.reduce((sum, month) => sum + month.association, 0)
  const annualElectric = months.reduce((sum, month) => sum + month.electric, 0)
  const actualLotRent = months.reduce((sum, month) => sum + month.actualLotRent, 0)
  const actualAssociation = months.reduce((sum, month) => sum + month.actualAssociation, 0)
  const actualElectric = months.reduce((sum, month) => sum + month.actualElectric, 0)
  const annualGrossPotential = months.reduce((sum, month) => sum + month.grossTotal, 0)

  return {
    months,
    annualLotRent,
    annualAssociation,
    annualElectric,
    annualTotal: annualLotRent + annualAssociation + annualElectric,
    actualLotRent,
    actualAssociation,
    actualElectric,
    actualTotal: actualLotRent + actualAssociation + actualElectric,
    annualGrossPotential,
    collectionRates,
    paymentsLearned,
    paymentObservations: Object.values(learningByCategory).reduce((sum, item) => sum + item.paidCount + item.matureUnpaidCount, 0),
    processingIncome,
    electricReadingsLearned,
    electricKwhLearned,
    configuredRentSites,
    savedRentSites,
    inferredRentSites,
    missingRentSites: Math.max(0, sites.filter((site) => !site.lotRentExempt).length - configuredRentSites),
    contractDateMatches,
    rentHistoryMatches,
    associationHistoryMatches,
    exactElectricSiteMonths,
    totalElectricSiteMonths: sites.length * 12,
    readingYears: readingYears.size,
    latestElectricYear,
  }
}
