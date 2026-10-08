export type ElectricChargeReviewRow = {
  id?: string | null
  charge_amount?: number | string | null
  remaining_amount?: number | string | null
  service_label?: string | null
  reason?: string | null
}

export function electricChargeRowsSignature(rows: ElectricChargeReviewRow[] = []) {
  return [...(rows || [])]
    .map((row) => [
      String(row?.id || ''),
      Number(row?.charge_amount || row?.remaining_amount || 0).toFixed(2),
      String(row?.service_label || row?.reason || ''),
    ].join(':'))
    .sort()
    .join('|')
}

export function electricWaterReviewKey(camperId: unknown, included: boolean, amount: unknown) {
  return `${String(camperId || '')}|water:${included ? Number(amount || 0).toFixed(2) : 'none'}`
}
