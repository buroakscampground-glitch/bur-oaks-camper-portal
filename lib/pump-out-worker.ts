export type PumpOutWorkerStop = {
  id: string
  lot_number?: string | null
  camper_name?: string | null
  status?: string | null
  billed_at?: string | null
  requested_at?: string | null
  notes?: string | null
}

function requestedTime(value: unknown) {
  const time = new Date(String(value || '')).getTime()
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER
}

export function orderPumpOutWorkerStops<T extends PumpOutWorkerStop>(rows: T[]) {
  return rows
    .filter((row) => String(row.status || '').toLowerCase() === 'requested' && !row.billed_at)
    .sort((left, right) => {
      const byTime = requestedTime(left.requested_at) - requestedTime(right.requested_at)
      if (byTime) return byTime
      return String(left.lot_number || '').localeCompare(String(right.lot_number || ''), undefined, { numeric: true })
    })
}

export function movePumpOutStopToEnd<T extends PumpOutWorkerStop>(rows: T[], stopId: string) {
  const index = rows.findIndex((row) => row.id === stopId)
  if (index < 0 || rows.length < 2) return [...rows]
  return [...rows.slice(0, index), ...rows.slice(index + 1), rows[index]]
}

export function pumpOutWorkerProgress(total: number, completed: number, remaining: number) {
  const safeTotal = Math.max(0, Math.floor(total || 0))
  const safeCompleted = Math.max(0, Math.min(Math.floor(completed || 0), safeTotal))
  const safeRemaining = Math.max(0, Math.floor(remaining || 0))

  return {
    current: safeRemaining > 0 ? Math.min(safeCompleted + 1, safeTotal || 1) : safeTotal,
    total: safeTotal,
    remaining: safeRemaining,
    complete: safeRemaining === 0,
  }
}
