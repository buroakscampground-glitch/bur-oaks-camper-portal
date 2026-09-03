import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { buildCompletedMaintenanceWorkOrderPdf } from '../lib/maintenance-work-order-report.ts'

test('completed maintenance work order creates a one-page office file copy', async () => {
  const bytes = await buildCompletedMaintenanceWorkOrderPdf({
    id: '12345678-abcd-4321-abcd-1234567890ab',
    title: 'Repair water hookup',
    description: 'Water connection is leaking.',
    category: 'Plumbing',
    priority: 'High',
    status: 'Completed',
    assigned_to: 'Maintenance Staff',
    lot_number: '42',
    reported_by: 'Office',
    created_at: '2026-09-01T14:00:00.000Z',
    completed_at: '2026-09-03T14:00:00.000Z',
    completion_notes: 'Replaced the worn fitting and verified there is no leak.',
    parts: [{ item_name: 'Water fitting', quantity: 1, unit: 'each', used_by: 'Maintenance Staff' }],
  }, '2026-09-03')

  const pdf = await PDFDocument.load(bytes)
  assert.equal(pdf.getPageCount(), 1)
  assert.equal(pdf.getTitle(), 'Bur Oaks Completed Work Order WO-12345678')
  assert.equal(pdf.getSubject(), 'Completed maintenance work order office file copy')
})
