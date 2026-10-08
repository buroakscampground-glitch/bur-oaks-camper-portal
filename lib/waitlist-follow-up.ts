export type WaitlistFollowUpInput = {
  status?: unknown
  notes?: unknown
  created_at?: unknown
  last_contact_at?: unknown
  next_follow_up_on?: unknown
  tour_scheduled_at?: unknown
  tour_completed_at?: unknown
  offer_made_at?: unknown
  converted_at?: unknown
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

function validDate(value: unknown) {
  const date = new Date(String(value || ''))
  return Number.isNaN(date.getTime()) ? null : date
}

function campgroundDateKey(value: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(value)
}

function shortDate(value: unknown) {
  const date = validDate(value)
  return date ? date.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' }) : ''
}

export function summarizeWaitlistFollowUp(person: WaitlistFollowUpInput, now = new Date()) {
  const notes = String(person.notes || '')
  const status = String(person.status || 'Waiting')
  const camperType = noteValue(notes, 'Camper type')
  const camperLength = noteValue(notes, 'Camper length')
  const tourRequested = /Campground tour requested\./i.test(notes)
  const websiteSource = /Submitted from public website availability form\./i.test(notes)
  const ageDays = ageInDays(person.created_at, now)
  const followUpOn = String(person.next_follow_up_on || '')
  const today = campgroundDateKey(now)
  const followUpOverdue = Boolean(followUpOn && followUpOn < today)
  const followUpToday = followUpOn === today
  const tourScheduled = validDate(person.tour_scheduled_at)
  const tourCompleted = validDate(person.tour_completed_at)
  const offerMade = validDate(person.offer_made_at)
  const terminal = ['Converted', 'Declined', 'Removed'].includes(status)

  const action = terminal
    ? status === 'Converted'
      ? { nextAction: 'Camper conversion complete', needsFollowUp: false, priority: 4, stage: 'Converted' }
      : { nextAction: 'No follow-up required', needsFollowUp: false, priority: 5, stage: status }
    : status === 'Accepted'
      ? { nextAction: 'Assign a site and convert', needsFollowUp: true, priority: 0, stage: 'Accepted' }
      : followUpOverdue
        ? { nextAction: `Follow-up overdue since ${shortDate(`${followUpOn}T12:00:00Z`)}`, needsFollowUp: true, priority: 0, stage: offerMade ? 'Offer' : tourCompleted ? 'Toured' : 'Contacted' }
        : followUpToday
          ? { nextAction: 'Follow up today', needsFollowUp: true, priority: 0, stage: offerMade ? 'Offer' : tourCompleted ? 'Toured' : 'Contacted' }
          : offerMade
            ? { nextAction: followUpOn ? `Follow up on offer ${shortDate(`${followUpOn}T12:00:00Z`)}` : 'Follow up on offer', needsFollowUp: true, priority: 1, stage: 'Offer' }
            : tourCompleted
              ? { nextAction: followUpOn ? `Next conversation ${shortDate(`${followUpOn}T12:00:00Z`)}` : 'Decide fit and next step', needsFollowUp: true, priority: 1, stage: 'Toured' }
              : tourScheduled
                ? tourScheduled.getTime() < now.getTime()
                  ? { nextAction: 'Complete or reschedule tour', needsFollowUp: true, priority: 0, stage: 'Tour scheduled' }
                  : { nextAction: `Prepare for tour ${shortDate(person.tour_scheduled_at)}`, needsFollowUp: false, priority: 2, stage: 'Tour scheduled' }
                : status === 'Contacted'
                  ? { nextAction: tourRequested ? 'Schedule requested tour' : followUpOn ? `Follow up ${shortDate(`${followUpOn}T12:00:00Z`)}` : 'Continue fit conversation', needsFollowUp: true, priority: 1, stage: 'Contacted' }
                  : { nextAction: 'Contact applicant', needsFollowUp: true, priority: ageDays !== null && ageDays > 1 ? 0 : 1, stage: 'New inquiry' }

  return {
    ...action,
    source: websiteSource ? 'Website inquiry' : 'Office entry',
    camperSummary: [camperType, camperLength].filter(Boolean).join(' · ') || 'Camper details not provided',
    tourRequested,
    stage: action.stage,
    followUpOn: followUpOn || null,
    followUpOverdue,
    lastContactLabel: shortDate(person.last_contact_at) || 'No contact logged',
    tourLabel: tourCompleted ? `Completed ${shortDate(person.tour_completed_at)}` : tourScheduled ? `Scheduled ${shortDate(person.tour_scheduled_at)}` : tourRequested ? 'Requested' : 'Not scheduled',
    ageDays,
    ageLabel: ageDays === null ? 'Date unavailable' : ageDays === 0 ? 'Received today' : `${ageDays} day${ageDays === 1 ? '' : 's'} on list`,
  }
}

export function summarizeProspectPipeline(people: WaitlistFollowUpInput[], now = new Date()) {
  const summaries = people.map((person) => ({ person, followUp: summarizeWaitlistFollowUp(person, now) }))
  const thirtyDaysAgo = now.getTime() - 30 * 86_400_000
  return {
    active: summaries.filter(({ person }) => !['Converted', 'Declined', 'Removed'].includes(String(person.status || ''))).length,
    needsFollowUp: summaries.filter(({ followUp }) => followUp.needsFollowUp && followUp.priority === 0).length,
    tours: summaries.filter(({ followUp }) => followUp.stage === 'Tour scheduled').length,
    offers: summaries.filter(({ followUp }) => followUp.stage === 'Offer' || followUp.stage === 'Accepted').length,
    converted30Days: people.filter((person) => {
      const converted = validDate(person.converted_at)
      return String(person.status || '') === 'Converted' && Boolean(converted && converted.getTime() >= thirtyDaysAgo)
    }).length,
  }
}
