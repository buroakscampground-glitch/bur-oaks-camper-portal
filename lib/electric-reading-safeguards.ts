type ElectricReading = {
  camper_id?: string | null
  reading_date?: string | null
  kwh_used?: number | string | null
}

export type ElectricUsageComparison = {
  status: 'normal' | 'high' | 'low'
  recentAverage: number
  previousUsage: number
  percentFromAverage: number | null
  comparisonLabel: string
}

export function groupedUsageHistory(readings: ElectricReading[], camperId?: string, limit = 6) {
  if (!camperId) return []

  const totalsByDate = new Map<string, number>()
  for (const reading of readings) {
    if (reading.camper_id !== camperId || !reading.reading_date) continue
    const usage = Number(reading.kwh_used || 0)
    if (!Number.isFinite(usage) || usage < 0) continue
    totalsByDate.set(reading.reading_date, (totalsByDate.get(reading.reading_date) || 0) + usage)
  }

  return Array.from(totalsByDate.entries())
    .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
    .slice(0, limit)
    .map(([date, usage]) => ({ date, usage }))
}

export function campgroundAverageUsage(readings: ElectricReading[]) {
  const totalsByCamperAndDate = new Map<string, number>()
  for (const reading of readings) {
    if (!reading.camper_id || !reading.reading_date) continue
    const usage = Number(reading.kwh_used || 0)
    if (!Number.isFinite(usage) || usage < 0) continue
    const key = `${reading.camper_id}:${reading.reading_date}`
    totalsByCamperAndDate.set(key, (totalsByCamperAndDate.get(key) || 0) + usage)
  }

  const totals = Array.from(totalsByCamperAndDate.values())
  if (!totals.length) return 0
  return totals.reduce((sum, usage) => sum + usage, 0) / totals.length
}

export function compareElectricUsage(
  usage: number,
  history: Array<{ date: string; usage: number }>,
  campgroundAverage = 0
): ElectricUsageComparison {
  const recentAverage = history.length
    ? history.reduce((sum, reading) => sum + reading.usage, 0) / history.length
    : campgroundAverage
  const previousUsage = history[0]?.usage || 0
  const percentFromAverage = recentAverage > 0
    ? Math.round(((usage - recentAverage) / recentAverage) * 100)
    : null

  const unusuallyHigh =
    usage >= 3000 ||
    (recentAverage > 0 && usage > Math.max(recentAverage * 2.5, recentAverage + 500)) ||
    (previousUsage > 0 && usage > Math.max(previousUsage * 3, previousUsage + 500))

  const unusuallyLow =
    usage > 0 &&
    ((recentAverage >= 200 && usage < recentAverage * 0.25) ||
      (previousUsage >= 200 && usage < previousUsage * 0.2))

  const status = unusuallyHigh ? 'high' : unusuallyLow ? 'low' : 'normal'
  const comparisonLabel = percentFromAverage === null
    ? 'No earlier average is available for comparison.'
    : percentFromAverage === 0
      ? 'This matches the recent average.'
      : `This is ${Math.abs(percentFromAverage)}% ${percentFromAverage > 0 ? 'above' : 'below'} the recent average.`

  return {
    status,
    recentAverage,
    previousUsage,
    percentFromAverage,
    comparisonLabel,
  }
}
