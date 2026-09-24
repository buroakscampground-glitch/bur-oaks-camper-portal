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
  historicalAverageSeasonKwh: number | null
  changeFromHistoryPercent: number | null
  consecutiveLowSeasonCount: number
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

function seasonProgressEnd(selectedYear: number) {
  const today = new Date()
  if (selectedYear !== today.getFullYear()) return '11-15'
  const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  if (monthDay < '03-15') return '03-14'
  return monthDay > '11-15' ? '11-15' : monthDay
}

function groupedCamperReadings(readings: UsageReading[], camperIds: string[], year: number, progressEnd = '11-15') {
  const { start, end } = camperUsageSeasonWindow(year)
  const runningEnd = `${year}-${progressEnd}` < end ? `${year}-${progressEnd}` : end
  const byDate = new Map<string, number>()
  const camperIdSet = new Set(camperIds)
  for (const reading of readings) {
    const date = dateOnly(reading.reading_date)
    if (!camperIdSet.has(String(reading.camper_id || '')) || date < start || date > runningEnd) continue
    byDate.set(date, (byDate.get(date) || 0) + safeUsage(reading.kwh_used))
  }
  return Array.from(byDate.entries())
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, usage]) => ({ date, usage }))
}

function historicalBaseline(readings: UsageReading[], camperIds: string[], selectedYear: number, progressEnd: string) {
  const earliestYear = readings.reduce((earliest, reading) => {
    const year = Number(dateOnly(reading.reading_date).slice(0, 4))
    return Number.isFinite(year) && year > 2000 ? Math.min(earliest, year) : earliest
  }, selectedYear)
  const seasons: Array<{ year: number; totalKwh: number; readingCount: number }> = []
  for (let year = earliestYear; year < selectedYear; year += 1) {
    const season = groupedCamperReadings(readings, camperIds, year, progressEnd)
    if (!season.length) continue
    seasons.push({
      year,
      totalKwh: season.reduce((sum, item) => sum + item.usage, 0),
      readingCount: season.length,
    })
  }
  return {
    seasons,
    seasonCount: seasons.length,
    averageTotal: seasons.length
      ? seasons.reduce((sum, season) => sum + season.totalKwh, 0) / seasons.length
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
  const progressEnd = seasonProgressEnd(selectedYear)
  const preliminary = campers.map((camper) => {
    const camperId = String(camper.id || '')
    const camperIds = Array.from(new Set([camperId, ...(camper.camper_ids || []).map(String)].filter(Boolean)))
    const season = groupedCamperReadings(readings, camperIds, selectedYear, progressEnd)
    const totalKwh = season.reduce((sum, item) => sum + item.usage, 0)
    const averageKwh = season.length ? totalKwh / season.length : 0
    const latest = season.at(-1) || null
    const history = historicalBaseline(readings, camperIds, selectedYear, progressEnd)
    return {
      camper,
      season,
      totalKwh,
      averageKwh,
      latest,
      history,
    }
  })

  const positivePeerTotals = preliminary
    .filter((item) => item.season.length && item.totalKwh > 0)
    .map((item) => item.totalKwh)
    .sort((a, b) => a - b)
  const peerMedian = positivePeerTotals.length
    ? positivePeerTotals[Math.floor((positivePeerTotals.length - 1) / 2)]
    : 0

  const peerTotalsByYear = new Map<number, number[]>()
  const addPeerTotal = (year: number, totalKwh: number) => {
    if (totalKwh <= 0) return
    const totals = peerTotalsByYear.get(year) || []
    totals.push(totalKwh)
    peerTotalsByYear.set(year, totals)
  }
  for (const item of preliminary) {
    if (item.season.length) addPeerTotal(selectedYear, item.totalKwh)
    for (const season of item.history.seasons) addPeerTotal(season.year, season.totalKwh)
  }
  for (const totals of peerTotalsByYear.values()) totals.sort((a, b) => a - b)

  return preliminary.map(({ camper, season, totalKwh, averageKwh, latest, history }) => {
    const activeReadingCount = season.filter((item) => item.usage > 0).length
    const zeroReadingCount = season.length - activeReadingCount
    const recentTwoAreZero = season.length >= 2 && season.slice(-2).every((item) => item.usage === 0)
    const peerRank = percentile(totalKwh, positivePeerTotals)
    const lowAgainstPeers = season.length >= 1 && peerMedian > 0 && totalKwh <= peerMedian * 0.25
    const lowAgainstHistory = season.length >= 1 && history.averageTotal !== null && history.averageTotal >= 20 && totalKwh <= history.averageTotal * 0.25
    const seasonsNewestFirst = [
      { year: selectedYear, totalKwh, hasData: season.length > 0 },
      ...history.seasons.slice().reverse().map((item) => ({ year: item.year, totalKwh: item.totalKwh, hasData: true })),
    ]
    let consecutiveLowSeasonCount = 0
    for (const item of seasonsNewestFirst) {
      if (!item.hasData) break
      const rank = percentile(item.totalKwh, peerTotalsByYear.get(item.year) || [])
      if (item.totalKwh === 0 || (rank !== null && rank <= 25)) consecutiveLowSeasonCount += 1
      else break
    }
    const repeatedLowUse = consecutiveLowSeasonCount >= 2

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
    } else if (repeatedLowUse || lowAgainstPeers || lowAgainstHistory) {
      signal = 'low'
      signalLabel = repeatedLowUse ? 'Repeated very low seasonal use' : 'Unusually low electric activity'
      signalDetail = repeatedLowUse
        ? `This site has remained in the lowest-use group for ${consecutiveLowSeasonCount} consecutive seasons.`
        : lowAgainstHistory
        ? 'The season-to-date running total is at least 75% below this site’s earlier seasonal pattern.'
        : 'The season-to-date running total is at least 75% below the current campground midpoint.'
    }

    const evidenceScore = season.length + history.seasonCount * 2
    const historicalAverageSeasonKwh = history.averageTotal
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
      historicalAverageSeasonKwh,
      changeFromHistoryPercent: historicalAverageSeasonKwh && historicalAverageSeasonKwh > 0
        ? Math.round(((totalKwh - historicalAverageSeasonKwh) / historicalAverageSeasonKwh) * 100)
        : null,
      consecutiveLowSeasonCount,
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
