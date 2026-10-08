export const onboardingManualTaskKeys = [
  'orientation_completed',
  'welcome_completed',
  'insurance_not_required',
  'gate_access_not_required',
] as const

export type OnboardingManualTaskKey = typeof onboardingManualTaskKeys[number]

export type OnboardingSource = {
  camper: Record<string, unknown>
  renewal?: Record<string, unknown> | null
  documents?: Record<string, unknown>[]
  invoices?: Record<string, unknown>[]
  gateCards?: Record<string, unknown>[]
  invites?: Record<string, unknown>[]
  manualTasks?: Record<string, unknown>[]
  authEmails?: Set<string>
  now?: Date
  convertedFromWaitlist?: boolean
}

export type CamperOnboardingTask = {
  key: string
  label: string
  detail: string
  complete: boolean
  automatic: boolean
  href?: string
  manualKey?: OnboardingManualTaskKey
  alternateManualKey?: OnboardingManualTaskKey
}

function text(value: unknown) {
  return String(value || '').trim()
}

function normalized(value: unknown) {
  return text(value).toLowerCase()
}

function paid(invoice: Record<string, unknown>) {
  return normalized(invoice.status) === 'paid' || Boolean(invoice.paid_at)
}

function completedManual(tasks: Record<string, unknown>[], key: OnboardingManualTaskKey) {
  return tasks.some((task) => task.task_key === key && Boolean(task.completed_at))
}

function signed(document: Record<string, unknown>) {
  return normalized(document.signature_status) === 'signed'
}

export function summarizeCamperOnboarding(source: OnboardingSource) {
  const { camper } = source
  const documents = source.documents || []
  const invoices = source.invoices || []
  const gateCards = source.gateCards || []
  const invites = source.invites || []
  const manualTasks = source.manualTasks || []
  const camperId = text(camper.id)
  const profileHref = `/admin/campers/${camperId}`
  const lotNumber = text(camper.lot_number)
  const realSite = Boolean(lotNumber && !/^TEMP\s+PORTAL\s+/i.test(lotNumber))
  const contractCreated = Boolean(source.renewal?.id)
  const contractSigned = documents.some((document) => {
    const description = `${text(document.document_name)} ${text(document.document_type)}`
    return signed(document) && /(lease|contract|agreement|renewal)/i.test(description)
  })
  const associationFee = invoices.find((invoice) => /association/i.test(text(invoice.invoice_type)))
  const rentInvoices = invoices
    .filter((invoice) => /lot rent/i.test(text(invoice.invoice_type)))
    .sort((left, right) => text(left.due_date).localeCompare(text(right.due_date)))
  const insuranceDocument = documents.some((document) => /insurance/i.test(`${text(document.document_name)} ${text(document.document_type)}`))
  const insuranceNotRequired = completedManual(manualTasks, 'insurance_not_required')
  const activeGateCard = gateCards.some((card) => normalized(card.status) === 'active')
  const gateNotRequired = completedManual(manualTasks, 'gate_access_not_required')
  const email = normalized(camper.email)
  const portalActive = Boolean(email && source.authEmails?.has(email))
  const inviteDelivered = invites.some((invite) => ['sent', 'delivered'].includes(normalized(invite.delivery_status)))
  const orientationComplete = completedManual(manualTasks, 'orientation_completed')
  const welcomeComplete = inviteDelivered || completedManual(manualTasks, 'welcome_completed')

  const tasks: CamperOnboardingTask[] = [
    { key: 'site', label: 'Permanent site assigned', detail: realSite ? `Site ${lotNumber}` : 'Permanent campsite still needed', complete: realSite, automatic: true, href: '/admin/site-availability' },
    { key: 'contract', label: '12-month contract created', detail: contractCreated ? 'Contract schedule is on file' : 'No contract schedule found', complete: contractCreated, automatic: true, href: '/admin/renewals' },
    { key: 'signature', label: 'Contract signed', detail: contractSigned ? 'Signed document is on file' : 'Signed lease, agreement, or renewal not found', complete: contractSigned, automatic: true, href: '/admin/documents' },
    { key: 'association_fee', label: '$250 association fee paid', detail: associationFee ? (paid(associationFee) ? 'Paid invoice confirmed' : 'Invoice exists but remains open') : 'Association-fee invoice not found', complete: Boolean(associationFee && paid(associationFee)), automatic: true, href: profileHref },
    { key: 'first_rent', label: 'First $875 rent payment paid', detail: rentInvoices.length ? (paid(rentInvoices[0]) ? 'First rent invoice is paid' : 'First rent invoice remains open') : 'First rent invoice not found', complete: Boolean(rentInvoices[0] && paid(rentInvoices[0])), automatic: true, href: profileHref },
    { key: 'insurance', label: 'Golf cart insurance handled', detail: insuranceDocument ? 'Insurance document is on file' : insuranceNotRequired ? 'Marked not required' : 'Upload proof or mark not required', complete: insuranceDocument || insuranceNotRequired, automatic: false, href: profileHref, alternateManualKey: 'insurance_not_required' },
    { key: 'gate', label: 'Gate access issued', detail: activeGateCard ? 'Active gate card is assigned' : gateNotRequired ? 'Marked not required yet' : 'No active gate card found', complete: activeGateCard || gateNotRequired, automatic: false, href: '/admin/gatecards', alternateManualKey: 'gate_access_not_required' },
    { key: 'portal', label: 'Camper portal activated', detail: portalActive ? 'Matching login account exists' : 'No matching active login found', complete: portalActive, automatic: true, href: profileHref },
    { key: 'orientation', label: 'Campground orientation completed', detail: orientationComplete ? 'Staff confirmation saved' : 'Walkthrough still needs confirmation', complete: orientationComplete, automatic: false, manualKey: 'orientation_completed' },
    { key: 'welcome', label: 'Welcome delivered', detail: welcomeComplete ? (inviteDelivered ? 'Portal welcome delivery is recorded' : 'Staff confirmation saved') : 'Welcome delivery still needs confirmation', complete: welcomeComplete, automatic: false, manualKey: 'welcome_completed' },
  ]

  const completed = tasks.filter((task) => task.complete).length
  const dateValue = text(camper.camper_since_date || camper.created_at)
  const started = new Date(dateValue)
  const now = source.now || new Date()
  const onboardingCutoff = new Date(now.getTime() - 548 * 86_400_000)
  const currentOnboarding = Boolean(
    source.convertedFromWaitlist ||
    manualTasks.length ||
    (!Number.isNaN(started.getTime()) && started >= onboardingCutoff)
  )

  return {
    camperId,
    name: `${text(camper.first_name)} ${text(camper.last_name)}`.trim(),
    lotNumber: lotNumber || 'Unassigned',
    email: text(camper.email),
    camperSinceDate: dateValue || null,
    currentOnboarding,
    completed,
    total: tasks.length,
    percent: Math.round((completed / tasks.length) * 100),
    ready: completed === tasks.length,
    tasks,
  }
}
