export type UsageCamper = {
  id: string
  camper_ids?: string[]
  first_name?: string | null
  last_name?: string | null
  lot_number?: string | null
}

export type UsageReading = {
  camper_id?: string | null
  reading_date?: string | null
  kwh_used?: number | string | null
}

export type CamperSeasonUsage = {
  camperId: string
  camperName: string
  lotNumber: string
  totalKwh: number
  readingCount: number
  activeReadingCount: number
  zeroReadingCount: number
  averageKwh: number
  latestDate: string | null
  latestKwh: number | null
  priorSeasonCount: number
  historicalAverageKwh: number | null
  changeFromHistoryPercent: number | null
  peerPercentile: number | null
  usageBand: 'No data' | 'Not at all' | 'A little' | 'Sometimes' | 'Often' | 'A lot'
  confidence: 'Early' | 'Developing' | 'Established'
  signal: 'regular' | 'low' | 'no_activity' | 'no_data'
  signalLabel: string
  signalDetail: string
}

export function camperUsageSeasonWindow(year: number) {
  return {
    start: `${year}-03-15`,
    end: `${year}-11-15`,
  }
}

function dateOnly(value: unknown) {
  return String(value || '').slice(0, 10)
}

function safeUsage(value: unknown) {
  const usage = Number(value || 0)
  return Number.isFinite(usage) && usage >= 0 ? usage : 0
}

function groupedCamperReadings(readings: UsageReading[], camperIds: string[], year: number) {
  const { start, end } = camperUsageSeasonWindow(year)
  const byDate = new Map<string, number>()
  const camperIdSet = new Set(camperIds)
  for (const reading of readings) {
    const date = dateOnly(reading.reading_date)
    if (!camperIdSet.has(String(reading.camper_id || '')) || date < start || date > end) continue
    byDate.set(date, (byDate.get(date) || 0) + safeUsage(reading.kwh_used))
  }
  return Array.from(byDate.entries())
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, usage]) => ({ date, usage }))
}

function historicalBaseline(readings: UsageReading[], camperIds: string[], selectedYear: number) {
  const earliestYear = readings.reduce((earliest, reading) => {
    const year = Number(dateOnly(reading.reading_date).slice(0, 4))
    return Number.isFinite(year) && year > 2000 ? Math.min(earliest, year) : earliest
  }, selectedYear)
  const seasonAverages: number[] = []
  for (let year = earliestYear; year < selectedYear; year += 1) {
    const season = groupedCamperReadings(readings, camperIds, year)
    if (!season.length) continue
    seasonAverages.push(season.reduce((sum, item) => sum + item.usage, 0) / season.length)
  }
  return {
    seasonCount: seasonAverages.length,
    average: seasonAverages.length
      ? seasonAverages.reduce((sum, value) => sum + value, 0) / seasonAverages.length
      : null,
  }
}

function percentile(value: number, peers: number[]) {
  if (!peers.length || value <= 0) return null
  const atOrBelow = peers.filter((peer) => peer <= value).length
  return Math.max(1, Math.min(100, Math.round((atOrBelow / peers.length) * 100)))
}

export function buildCamperSeasonUsage(
  campers: UsageCamper[],
  readings: UsageReading[],
  selectedYear: number,
): CamperSeasonUsage[] {
  const preliminary = campers.map((camper) => {
    const camperId = String(camper.id || '')
    const camperIds = Array.from(new Set([camperId, ...(camper.camper_ids || []).map(String)].filter(Boolean)))
    const season = groupedCamperReadings(readings, camperIds, selectedYear)
    const totalKwh = season.reduce((sum, item) => sum + item.usage, 0)
    const averageKwh = season.length ? totalKwh / season.length : 0
    const latest = season.at(-1) || null
    const history = historicalBaseline(readings, camperIds, selectedYear)
    return {
      camper,
      season,
      totalKwh,
      averageKwh,
      latest,
      history,
    }
  })

  const positivePeerAverages = preliminary
    .filter((item) => item.season.length && item.averageKwh > 0)
    .map((item) => item.averageKwh)
    .sort((a, b) => a - b)
  const peerMedian = positivePeerAverages.length
    ? positivePeerAverages[Math.floor((positivePeerAverages.length - 1) / 2)]
    : 0

  return preliminary.map(({ camper, season, totalKwh, averageKwh, latest, history }) => {
    const activeReadingCount = season.filter((item) => item.usage > 0).length
    const zeroReadingCount = season.length - activeReadingCount
    const recentTwoAreZero = season.length >= 2 && season.slice(-2).every((item) => item.usage === 0)
    const lowAgainstPeers = season.length >= 2 && peerMedian > 0 && averageKwh <= peerMedian * 0.25
    const lowAgainstHistory = season.length >= 2 && history.average !== null && history.average >= 20 && averageKwh <= history.average * 0.25

    let signal: CamperSeasonUsage['signal'] = 'regular'
    let signalLabel = 'Regular electric activity'
    let signalDetail = 'Electric usage is present and does not stand out as unusually low.'
    if (!season.length) {
      signal = 'no_data'
      signalLabel = 'No reading data'
      signalDetail = 'No electric reading has been recorded inside this season window.'
    } else if (totalKwh === 0 || recentTwoAreZero) {
      signal = 'no_activity'
      signalLabel = recentTwoAreZero ? 'No recent electric activity' : 'No electric activity'
      signalDetail = recentTwoAreZero
        ? 'The two most recent seasonal reading periods both recorded zero usage.'
        : 'Every recorded reading period in this season shows zero usage.'
    } else if (lowAgainstPeers || lowAgainstHistory) {
      signal = 'low'
      signalLabel = 'Unusually low electric activity'
      signalDetail = lowAgainstHistory
        ? 'Average usage is at least 75% below this site’s own earlier seasonal pattern.'
        : 'Average usage is at least 75% below the current campground midpoint.'
    }

    const evidenceScore = season.length + history.seasonCount * 2
    const historicalAverageKwh = history.average
    const peerRank = percentile(averageKwh, positivePeerAverages)
    const usageBand: CamperSeasonUsage['usageBand'] = !season.length
      ? 'No data'
      : totalKwh === 0
        ? 'Not at all'
        : peerRank !== null && peerRank <= 25
          ? 'A little'
          : peerRank !== null && peerRank <= 50
            ? 'Sometimes'
            : peerRank !== null && peerRank <= 75
              ? 'Often'
              : 'A lot'
    return {
      camperId: String(camper.id),
      camperName: `${String(camper.first_name || '').trim()} ${String(camper.last_name || '').trim()}`.trim() || 'Camper',
      lotNumber: String(camper.lot_number || '').trim() || '—',
      totalKwh,
      readingCount: season.length,
      activeReadingCount,
      zeroReadingCount,
      averageKwh,
      latestDate: latest?.date || null,
      latestKwh: latest?.usage ?? null,
      priorSeasonCount: history.seasonCount,
      historicalAverageKwh,
      changeFromHistoryPercent: historicalAverageKwh && historicalAverageKwh > 0
        ? Math.round(((averageKwh - historicalAverageKwh) / historicalAverageKwh) * 100)
        : null,
      peerPercentile: peerRank,
      usageBand,
      confidence: evidenceScore >= 8 ? 'Established' : evidenceScore >= 4 ? 'Developing' : 'Early',
      signal,
      signalLabel,
      signalDetail,
    }
  })
}

export function camperUsageRiskOrder(signal: CamperSeasonUsage['signal']) {
  return signal === 'no_activity' ? 0 : signal === 'low' ? 1 : signal === 'no_data' ? 2 : 3
}
