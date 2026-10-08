import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { summarizeCamperOnboarding } from '../lib/camper-onboarding.ts'

const now = new Date('2026-10-08T18:00:00Z')

test('onboarding becomes ready only when every financial, digital, and physical handoff is proven', () => {
  const summary = summarizeCamperOnboarding({
    camper: { id: 'camper-1', first_name: 'New', last_name: 'Camper', email: 'new@example.invalid', lot_number: '42', camper_since_date: '2026-10-01' },
    renewal: { id: 'renewal-1' },
    documents: [
      { document_name: 'Seasonal lease', document_type: 'Lease', signature_status: 'signed' },
      { document_name: 'Golf cart insurance', document_type: 'Insurance', signature_status: 'not_required' },
    ],
    invoices: [
      { invoice_type: 'Association Fee', due_date: '2026-10-01', status: 'paid' },
      { invoice_type: 'Lot Rent', due_date: '2026-10-01', status: 'paid' },
      { invoice_type: 'Lot Rent', due_date: '2027-04-01', status: 'sent' },
    ],
    gateCards: [{ status: 'active' }],
    invites: [{ delivery_status: 'sent' }],
    manualTasks: [{ task_key: 'orientation_completed', completed_at: '2026-10-05T18:00:00Z' }],
    authEmails: new Set(['new@example.invalid']),
    now,
  })
  assert.equal(summary.ready, true)
  assert.equal(summary.completed, 10)
  assert.equal(summary.percent, 100)
  assert.equal(summary.currentOnboarding, true)
})

test('onboarding reports the exact missing sources without treating open invoices as paid', () => {
  const summary = summarizeCamperOnboarding({
    camper: { id: 'camper-2', first_name: 'Still', last_name: 'Arriving', email: 'arriving@example.invalid', lot_number: 'TEMP PORTAL 2', camper_since_date: '2026-10-01' },
    invoices: [
      { invoice_type: 'Association Fee', due_date: '2026-10-01', status: 'sent' },
      { invoice_type: 'Lot Rent', due_date: '2026-10-01', status: 'processing' },
    ],
    manualTasks: [
      { task_key: 'insurance_not_required', completed_at: '2026-10-02T18:00:00Z' },
      { task_key: 'welcome_completed', completed_at: '2026-10-02T18:00:00Z' },
    ],
    authEmails: new Set(),
    now,
  })
  assert.equal(summary.ready, false)
  assert.equal(summary.tasks.find((task) => task.key === 'site')?.complete, false)
  assert.equal(summary.tasks.find((task) => task.key === 'association_fee')?.complete, false)
  assert.equal(summary.tasks.find((task) => task.key === 'first_rent')?.complete, false)
  assert.equal(summary.tasks.find((task) => task.key === 'insurance')?.detail, 'Marked not required')
  assert.equal(summary.tasks.find((task) => task.key === 'welcome')?.complete, true)
})

test('older active campers stay searchable without flooding the current-onboarding queue', () => {
  const older = summarizeCamperOnboarding({ camper: { id: 'old', first_name: 'Longtime', last_name: 'Camper', camper_since_date: '2012-04-01' }, now })
  assert.equal(older.currentOnboarding, false)
  const deliberatelyStarted = summarizeCamperOnboarding({ camper: { id: 'old', first_name: 'Longtime', last_name: 'Camper', camper_since_date: '2012-04-01' }, manualTasks: [{ task_key: 'orientation_completed' }], now })
  assert.equal(deliberatelyStarted.currentOnboarding, true)
})

test('onboarding storage is read-only in browsers and manual changes use one atomic server function', async () => {
  const migration = await readFile(new URL('../migrations/20261008231547_camper_onboarding.sql', import.meta.url), 'utf8')
  const route = await readFile(new URL('../app/api/admin-onboarding/route.ts', import.meta.url), 'utf8')
  const conversion = await readFile(new URL('../app/api/admin-waitlist-convert/route.ts', import.meta.url), 'utf8')
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/g)
  assert.match(migration, /GRANT SELECT ON TABLE public\.camper_onboarding_tasks, public\.camper_onboarding_events TO authenticated/)
  assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE|ALL).*camper_onboarding_(?:tasks|events).*authenticated/i)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.set_camper_onboarding_task_atomic[^;]+FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.set_camper_onboarding_task_atomic[^;]+TO service_role/)
  assert.match(route, /getAuthenticatedContext/)
  assert.match(route, /context\.admin\.rpc\('set_camper_onboarding_task_atomic'/)
  assert.match(conversion, /invoice_type: 'Association Fee'/)
  assert.match(conversion, /total_due: NEW_CAMPER_ASSOCIATION_FEE/)
  assert.match(conversion, /invoices\.length !== 3/)
})
