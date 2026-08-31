export type MeterOcrResult = {
  reading: number | null
  rawCandidate: string
}

export type MeterRecognitionCandidate = MeterOcrResult & {
  confidence: number | null
  text: string
}

export function normalizeLotKey(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^LOT(?:\s+|[-#]+|(?=\d))/, '')
    .replace(/[^A-Z0-9]/g, '')
}

export function displayLotNumber(value: unknown) {
  return String(value || '').trim().replace(/^lot\s+/i, '')
}

export function meterLotLabelsMatch(expected: unknown, visible: unknown, knownLots: unknown[] = []) {
  const expectedKey = normalizeLotKey(expected)
  const visibleKey = normalizeLotKey(visible)
  if (!expectedKey || !visibleKey) return false
  if (expectedKey === visibleKey) return true

  // A camera can miss one of the tightly-spaced leading F characters on labels
  // such as FF15A. Accept that only when no real campsite uses the shorter key.
  // This keeps distinct sites such as F2 and FF2 from ever being confused.
  if (!expectedKey.startsWith('F')) return false
  const expectedBase = expectedKey.replace(/^F+/, '')
  const visibleBase = visibleKey.replace(/^F+/, '')
  if (!expectedBase || expectedBase !== visibleBase) return false

  const knownKeys = new Set(knownLots.map(normalizeLotKey).filter(Boolean))
  return !knownKeys.has(visibleKey)
}

export function extractMeterReading(text: string): MeterOcrResult {
  const candidates = String(text || '')
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .match(/\d[\d,.' \t]{2,}\d|\d{3,}/g) || []

  const ranked = candidates
    .map((raw) => {
      const digits = raw.replace(/\D/g, '')
      return { raw, digits }
    })
    .filter((candidate) => candidate.digits.length >= 3 && candidate.digits.length <= 12)
    .sort((a, b) => b.digits.length - a.digits.length)

  const best = ranked[0]
  if (!best) return { reading: null, rawCandidate: '' }

  const reading = Number(best.digits)
  return Number.isSafeInteger(reading) && reading >= 0
    ? { reading, rawCandidate: best.raw.trim() }
    : { reading: null, rawCandidate: '' }
}

export function chooseBestMeterRecognition(
  candidates: MeterRecognitionCandidate[],
  previousReading: number | null = null
) {
  const usable = candidates.filter((candidate) => candidate.reading !== null)
  if (!usable.length) return null

  // The display is analyzed several ways. Agreement between those passes is
  // more reliable than OCR confidence alone for mechanical meter dials.
  const readingCounts = new Map<number, number>()
  for (const candidate of usable) {
    const reading = Number(candidate.reading)
    readingCounts.set(reading, (readingCounts.get(reading) || 0) + 1)
  }

  return [...usable].sort((a, b) => {
    const score = (candidate: MeterRecognitionCandidate) => {
      const reading = Number(candidate.reading)
      const confidence = Number.isFinite(candidate.confidence) ? Number(candidate.confidence) : 0
      const digits = String(Math.trunc(reading)).length
      const agreement = readingCounts.get(reading) || 1
      let value = confidence + (digits >= 4 && digits <= 8 ? 18 : 0) + ((agreement - 1) * 120)

      if (previousReading !== null && Number.isFinite(previousReading)) {
        const delta = reading - previousReading
        const sameLength = digits === String(Math.trunc(previousReading)).length
        if (sameLength) value += 18
        if (delta >= 0) value += 32
        else value -= 45
        if (delta >= 0 && delta <= 10_000) value += 24
        else if (delta > 100_000) value -= 35
      }

      return value
    }

    return score(b) - score(a)
  })[0]
}

export function meterLabelCode(lotNumber: unknown, meterNumber?: unknown) {
  const lot = normalizeLotKey(lotNumber) || 'UNKNOWN'
  const meter = normalizeLotKey(meterNumber)
  return meter ? `BO-${lot}-${meter}` : `BO-${lot}`
}
