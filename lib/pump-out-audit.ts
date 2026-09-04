export type PumpOutOrigin = {
  source: 'office' | 'camper' | 'unknown'
  label: string
  initiatedBy: string
}

export function pumpOutOrigin(notesValue: unknown): PumpOutOrigin {
  const notes = String(notesValue || '').trim()
  const officeMatch = notes.match(/Initiated by office admin\s+(\S+@\S+)\./i)
  if (officeMatch) {
    return { source: 'office', label: 'Office initiated', initiatedBy: officeMatch[1].trim() }
  }

  if (/^(Office entry:|Added manually by the office\.)/i.test(notes)) {
    return { source: 'office', label: 'Office initiated', initiatedBy: 'Bur Oaks office (historical)' }
  }

  const camperMatch = notes.match(/Initiated from camper portal by\s+(\S+@\S+)\./i)
  if (camperMatch) {
    return { source: 'camper', label: 'Camper portal', initiatedBy: camperMatch[1].trim() }
  }

  return { source: 'unknown', label: 'Source not recorded', initiatedBy: 'Historical request' }
}

export function pumpOutBillingLot(notesValue: unknown, serviceLot: unknown) {
  const notes = String(notesValue || '')
  const match = notes.match(/bill to Lot\s+([^.;]+)/i)
  return String(match?.[1] || serviceLot || '').trim()
}

export function pumpOutDisplayNotes(notesValue: unknown) {
  return String(notesValue || '')
    .replace(/Initiated by office admin\s+\S+@\S+\.\s*/i, '')
    .replace(/Initiated from camper portal by\s+\S+@\S+\.\s*/i, '')
    .replace(/^Service site\s+[^;]+;\s*bill to Lot\s+[^.]+\.\s*/i, '')
    .replace(/^Office entry:\s*/i, '')
    .replace(/^Added manually by the office\.\s*/i, '')
    .trim()
}
