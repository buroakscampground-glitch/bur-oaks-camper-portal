type WaitlistOrderRow = {
  id?: unknown
  status?: unknown
  created_at?: unknown
}

const terminalStatuses = new Set(['converted', 'declined', 'removed'])

function terminalRank(status: unknown) {
  return terminalStatuses.has(String(status || '').trim().toLowerCase()) ? 1 : 0
}

function enteredAt(value: unknown) {
  const timestamp = Date.parse(String(value || ''))
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER
}

export function sortWaitlistLongestFirst<T extends WaitlistOrderRow>(rows: T[]) {
  return [...rows].sort((left, right) =>
    terminalRank(left.status) - terminalRank(right.status)
    || enteredAt(left.created_at) - enteredAt(right.created_at)
    || String(left.id || '').localeCompare(String(right.id || ''))
  )
}
