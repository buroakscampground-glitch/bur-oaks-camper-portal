export type WaitlistFollowUpInput = {
  status?: unknown
  notes?: unknown
  created_at?: unknown
}

function noteValue(notes: string, label: string) {
  const line = notes.split(/\r?\n/).find((entry) => entry.trim().toLowerCase().startsWith(`${label.toLowerCase()}:`))
  return line ? line.slice(line.indexOf(':') + 1).trim() : ''
}

function ageInDays(value: unknown, now: Date) {
  const created = new Date(String(value || ''))
  if (Number.isNaN(created.getTime())) return null
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86_400_000))
}

export function summarizeWaitlistFollowUp(person: WaitlistFollowUpInput, now = new Date()) {
  const notes = String(person.notes || '')
  const status = String(person.status || 'Waiting')
  const camperType = noteValue(notes, 'Camper type')
  const camperLength = noteValue(notes, 'Camper length')
  const tourRequested = /Campground tour requested\./i.test(notes)
  const websiteSource = /Submitted from public website availability form\./i.test(notes)
  const ageDays = ageInDays(person.created_at, now)

  const action = status === 'Waiting'
    ? { nextAction: 'Contact applicant', needsFollowUp: true, priority: 0 }
    : status === 'Contacted'
      ? { nextAction: tourRequested ? 'Confirm or complete tour' : 'Continue fit conversation', needsFollowUp: true, priority: 1 }
      : status === 'Accepted'
        ? { nextAction: 'Assign a site and convert', needsFollowUp: true, priority: 0 }
        : status === 'Converted'
          ? { nextAction: 'Camper conversion complete', needsFollowUp: false, priority: 3 }
          : { nextAction: 'No follow-up required', needsFollowUp: false, priority: 4 }

  return {
    ...action,
    source: websiteSource ? 'Website inquiry' : 'Office entry',
    camperSummary: [camperType, camperLength].filter(Boolean).join(' · ') || 'Camper details not provided',
    tourRequested,
    ageDays,
    ageLabel: ageDays === null ? 'Date unavailable' : ageDays === 0 ? 'Received today' : `${ageDays} day${ageDays === 1 ? '' : 's'} on list`,
  }
}
