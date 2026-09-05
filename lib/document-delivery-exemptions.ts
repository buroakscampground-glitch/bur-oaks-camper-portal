function normalized(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function isDocumentDeliveryExcluded(camper: {
  lot_number?: unknown
  first_name?: unknown
  last_name?: unknown
}) {
  return normalized(camper?.lot_number) === '48'
    && normalized(camper?.first_name) === 'anthony'
    && normalized(camper?.last_name) === 'finley'
}
