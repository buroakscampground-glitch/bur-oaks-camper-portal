export function filterOptedInPhones(
  phones: string[],
  consentRows: Array<{ phone_number?: unknown; opted_in?: unknown }>
) {
  const consentByPhone = new Map(
    consentRows.map((row) => [String(row.phone_number || ''), row.opted_in === true])
  )

  // The household has already opted in before this helper is called. Newly
  // saved numbers inherit that household choice automatically. An explicit
  // per-number STOP row always wins and remains excluded.
  return phones.filter((phone) => consentByPhone.get(phone) !== false)
}
