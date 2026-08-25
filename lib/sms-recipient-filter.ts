export function filterOptedInPhones(
  phones: string[],
  consentRows: Array<{ phone_number?: unknown; opted_in?: unknown }>
) {
  const optedIn = new Set(
    consentRows
      .filter((row) => row.opted_in === true)
      .map((row) => String(row.phone_number || ''))
  )
  return phones.filter((phone) => optedIn.has(phone))
}
