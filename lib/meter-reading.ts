export type MeterOcrResult = {
  reading: number | null
  rawCandidate: string
}

export function normalizeLotKey(value: unknown) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function displayLotNumber(value: unknown) {
  return String(value || '').trim().replace(/^lot\s+/i, '')
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

export function meterLabelCode(lotNumber: unknown, meterNumber?: unknown) {
  const lot = normalizeLotKey(lotNumber) || 'UNKNOWN'
  const meter = normalizeLotKey(meterNumber)
  return meter ? `BO-${lot}-${meter}` : `BO-${lot}`
}
