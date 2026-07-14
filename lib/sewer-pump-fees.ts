const holdingTankPumpOutLots = new Set([
  'F1',
  '4',
  '8',
  '9',
  '11',
  '12',
  '22',
  '25',
  '26',
  '30',
  '31',
  '33',
  '35',
  '35B',
  '37',
  '39',
  '44',
  '47',
  '48',
  '48A',
  '50',
  '51',
  '54',
  '57',
])

export const holdingTankPumpOutFee = 15

export function normalizeLotNumber(lotNumber: string | null | undefined) {
  return String(lotNumber || '')
    .trim()
    .replace(/^#/, '')
    .replace(/^\$/, '')
    .toUpperCase()
}

export function isHoldingTankPumpOutLot(lotNumber: string | null | undefined) {
  return holdingTankPumpOutLots.has(normalizeLotNumber(lotNumber))
}

export function getSewerPumpOutFeeForLot(lotNumber: string | null | undefined, defaultFee: number) {
  return isHoldingTankPumpOutLot(lotNumber) ? holdingTankPumpOutFee : defaultFee
}
