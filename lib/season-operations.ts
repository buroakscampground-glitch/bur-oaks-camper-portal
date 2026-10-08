export const seasonOperationManualTaskKeys = [
  'opening_site_inspection', 'opening_utilities_ready',
  'opening_insurance_not_required', 'opening_gate_not_required',
  'closing_gate_resolved', 'closing_site_secured',
  'closing_water_winterized', 'closing_property_confirmed',
  'closing_final_walkthrough',
] as const

export type SeasonOperationManualTaskKey = typeof seasonOperationManualTaskKeys[number]
export type SeasonPhase = 'opening' | 'closing'
export type SeasonOperationTask = { key: string, label: string, detail: string, complete: boolean, automatic: boolean, href?: string, manualKey?: SeasonOperationManualTaskKey, alternateManualKey?: SeasonOperationManualTaskKey }
type Row = Record<string, unknown>

function text(value: unknown) { return String(value || '').trim() }
function normalized(value: unknown) { return text(value).toLowerCase() }
function complete(tasks: Row[], key: SeasonOperationManualTaskKey) { return tasks.some((task) => task.task_key === key && Boolean(task.completed_at)) }
function settled(invoice: Row) { return ['paid', 'cancelled', 'canceled', 'void'].includes(normalized(invoice.status)) || Boolean(invoice.paid_at) || Number(invoice.total_due || 0) <= 0 }

export function summarizeSeasonOperations(source: {
  camper: Row, seasonYear: number, phase: SeasonPhase, now?: Date,
  renewal?: Row | null, documents?: Row[], invoices?: Row[], gateCards?: Row[],
  readings?: Row[], maintenance?: Row[], manualTasks?: Row[],
}) {
  const { camper, seasonYear, phase } = source
  const documents = source.documents || [], invoices = source.invoices || [], gateCards = source.gateCards || []
  const readings = source.readings || [], maintenance = source.maintenance || [], manual = source.manualTasks || []
  const camperId = text(camper.id), lotNumber = text(camper.lot_number), profileHref = `/admin/campers/${camperId}`
  const seasonStart = `${seasonYear}-03-15`, seasonEnd = `${seasonYear}-11-15`
  const contractCoversSeason = Boolean(source.renewal?.id && text(source.renewal.contract_start_date) <= seasonStart && text(source.renewal.contract_end_date) >= seasonEnd)
  const signedContract = documents.some((document) => normalized(document.signature_status) === 'signed' && /(lease|contract|agreement|renewal)/i.test(`${text(document.document_name)} ${text(document.document_type)}`))
  const insurance = documents.some((document) => /insurance/i.test(`${text(document.document_name)} ${text(document.document_type)}`))
  const activeGate = gateCards.some((card) => normalized(card.status) === 'active')
  const openingReading = readings.some((reading) => text(reading.reading_date) >= `${seasonYear}-01-01` && text(reading.reading_date) <= `${seasonYear}-06-30`)
  const closingReading = readings.some((reading) => text(reading.reading_date) >= `${seasonYear}-09-01` && text(reading.reading_date) <= `${seasonYear}-12-31`)
  const openMaintenance = maintenance.filter((ticket) => !['completed', 'closed', 'cancelled', 'canceled'].includes(normalized(ticket.status)))
  const campgroundToday = (source.now || new Date()).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const openingDebt = invoices.filter((invoice) => text(invoice.due_date) <= campgroundToday && !settled(invoice))
  const closingDebt = invoices.filter((invoice) => text(invoice.due_date) <= seasonEnd && !settled(invoice))
  const renewalDecision = Boolean(source.renewal?.decision_recorded_at || !['', 'not started'].includes(normalized(source.renewal?.status)))
  const siteAssigned = Boolean(lotNumber && !/^TEMP\s+PORTAL\s+/i.test(lotNumber))

  const opening: SeasonOperationTask[] = [
    { key: 'site', label: 'Campsite assignment verified', detail: siteAssigned ? `Site ${lotNumber}` : 'Permanent campsite is missing', complete: siteAssigned, automatic: true, href: '/admin/site-availability' },
    { key: 'contract', label: 'Contract covers the season', detail: contractCoversSeason ? `${seasonStart} through ${seasonEnd} is covered` : 'Season is not fully covered by the contract dates', complete: contractCoversSeason, automatic: true, href: '/admin/renewals' },
    { key: 'signature', label: 'Agreement signed', detail: signedContract ? 'Signed agreement is on file' : 'Signed agreement was not found', complete: signedContract, automatic: true, href: '/admin/documents' },
    { key: 'balance', label: 'Past-due balance cleared', detail: openingDebt.length ? `${openingDebt.length} due invoice${openingDebt.length === 1 ? '' : 's'} still open` : 'No due invoice is open', complete: openingDebt.length === 0, automatic: true, href: profileHref },
    { key: 'insurance', label: 'Insurance handled', detail: insurance ? 'Insurance document is on file' : complete(manual, 'opening_insurance_not_required') ? 'Marked not required for this season' : 'Proof or a staff exception is needed', complete: insurance || complete(manual, 'opening_insurance_not_required'), automatic: false, href: profileHref, alternateManualKey: 'opening_insurance_not_required' },
    { key: 'gate', label: 'Gate access ready', detail: activeGate ? 'Active gate card is assigned' : complete(manual, 'opening_gate_not_required') ? 'Marked not required for this season' : 'Active access or a staff exception is needed', complete: activeGate || complete(manual, 'opening_gate_not_required'), automatic: false, href: '/admin/gatecards', alternateManualKey: 'opening_gate_not_required' },
    { key: 'meter', label: 'Opening meter reading recorded', detail: openingReading ? 'January–June baseline reading is on file' : 'Opening baseline reading is missing', complete: openingReading, automatic: true, href: '/admin/electric/meter-readings' },
    { key: 'inspection', label: 'Opening site inspection complete', detail: complete(manual, 'opening_site_inspection') ? 'Staff confirmation saved' : 'Physical site inspection still needs confirmation', complete: complete(manual, 'opening_site_inspection'), automatic: false, manualKey: 'opening_site_inspection' },
    { key: 'utilities', label: 'Utilities ready', detail: complete(manual, 'opening_utilities_ready') ? 'Staff confirmation saved' : 'Water and electric readiness need confirmation', complete: complete(manual, 'opening_utilities_ready'), automatic: false, manualKey: 'opening_utilities_ready' },
  ]
  const closing: SeasonOperationTask[] = [
    { key: 'meter', label: 'Closing meter reading recorded', detail: closingReading ? 'September–December closing reading is on file' : 'Closing reading is missing', complete: closingReading, automatic: true, href: '/admin/electric/meter-readings' },
    { key: 'balance', label: 'Season charges settled', detail: closingDebt.length ? `${closingDebt.length} season invoice${closingDebt.length === 1 ? '' : 's'} still open` : 'No season invoice remains open', complete: closingDebt.length === 0, automatic: true, href: profileHref },
    { key: 'maintenance', label: 'Maintenance work cleared', detail: openMaintenance.length ? `${openMaintenance.length} ticket${openMaintenance.length === 1 ? '' : 's'} still open` : 'No open maintenance ticket', complete: openMaintenance.length === 0, automatic: true, href: '/admin/maintenance' },
    { key: 'renewal', label: 'Renewal decision recorded', detail: renewalDecision ? `Status: ${text(source.renewal?.status) || 'recorded'}` : 'Renewal decision is not recorded', complete: renewalDecision, automatic: true, href: '/admin/renewals' },
    { key: 'gate', label: 'Gate access resolved', detail: complete(manual, 'closing_gate_resolved') ? 'Return, deactivation, or approved retention is recorded' : 'Gate access needs a closing decision', complete: complete(manual, 'closing_gate_resolved'), automatic: false, manualKey: 'closing_gate_resolved', href: '/admin/gatecards' },
    { key: 'secure', label: 'Campsite secured', detail: complete(manual, 'closing_site_secured') ? 'Staff confirmation saved' : 'Site security check remains open', complete: complete(manual, 'closing_site_secured'), automatic: false, manualKey: 'closing_site_secured' },
    { key: 'water', label: 'Water system winterized', detail: complete(manual, 'closing_water_winterized') ? 'Staff confirmation saved' : 'Winterization remains open', complete: complete(manual, 'closing_water_winterized'), automatic: false, manualKey: 'closing_water_winterized' },
    { key: 'property', label: 'Personal property plan confirmed', detail: complete(manual, 'closing_property_confirmed') ? 'Staff confirmation saved' : 'Stored-property plan remains open', complete: complete(manual, 'closing_property_confirmed'), automatic: false, manualKey: 'closing_property_confirmed' },
    { key: 'walkthrough', label: 'Final walkthrough complete', detail: complete(manual, 'closing_final_walkthrough') ? 'Staff confirmation saved' : 'Final walkthrough remains open', complete: complete(manual, 'closing_final_walkthrough'), automatic: false, manualKey: 'closing_final_walkthrough' },
  ]
  const tasks = phase === 'opening' ? opening : closing
  const completed = tasks.filter((task) => task.complete).length
  return { camperId, name: `${text(camper.first_name)} ${text(camper.last_name)}`.trim(), lotNumber: lotNumber || 'Unassigned', seasonYear, phase, completed, total: tasks.length, percent: Math.round(completed / tasks.length * 100), ready: completed === tasks.length, tasks }
}
