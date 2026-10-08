import assert from 'node:assert/strict'
import test from 'node:test'
import { camperMaintenanceStatus, camperPumpOutStatus, maintenanceProgress } from '../lib/camper-service-status.ts'

test('maintenance wording separates camper action from office progress', () => {
  assert.deepEqual(camperMaintenanceStatus({ status: 'Open', admin_approved: false }), {
    label: 'Submitted — office review', detail: 'The office received your request and will review it before work begins.', stage: 'review', complete: false,
  })
  assert.equal(camperMaintenanceStatus({ status: 'Open', admin_approved: true }).label, 'Approved — waiting to schedule')
  assert.equal(camperMaintenanceStatus({ status: 'Waiting Parts', admin_approved: true }).label, 'Waiting for parts')
  assert.equal(camperMaintenanceStatus({ status: ' resolved ', admin_approved: true }).complete, true)
  assert.deepEqual(maintenanceProgress({ status: 'Open', admin_approved: false }).map((step) => step.complete), [true, false, false, false])
})

test('pump-out wording distinguishes queue, service, billing, and completion', () => {
  assert.equal(camperPumpOutStatus({ status: 'Requested' }).label, 'In office queue')
  assert.equal(camperPumpOutStatus({ status: 'In Progress' }).label, 'Service in progress')
  assert.equal(camperPumpOutStatus({ status: 'Completed' }).label, 'Service complete — billing next')
  assert.equal(camperPumpOutStatus({ status: 'Completed', billed_at: '2026-10-08' }).label, 'Complete — moved to billing')
})
