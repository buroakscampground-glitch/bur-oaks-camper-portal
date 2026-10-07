import assert from 'node:assert/strict'
import test from 'node:test'
import { isCamperOnlyPath, isSharedDocumentViewerPath } from '../lib/portal-route-scope.ts'

test('camper routes stay inside the camper role boundary', () => {
  assert.equal(isCamperOnlyPath('/portal'), true)
  assert.equal(isCamperOnlyPath('/invoices/123'), true)
  assert.equal(isCamperOnlyPath('/maintenance'), true)
  assert.equal(isCamperOnlyPath('/maintenance/history'), true)
  assert.equal(isCamperOnlyPath('/maintenance/history/123'), true)
})

test('maintenance staff and admin workspaces are not swallowed by the camper boundary', () => {
  assert.equal(isCamperOnlyPath('/maintenance/dashboard'), false)
  assert.equal(isCamperOnlyPath('/maintenance/dashboard/pumping'), false)
  assert.equal(isCamperOnlyPath('/admin'), false)
  assert.equal(isCamperOnlyPath('/community'), false)
})

test('the signed document viewer remains explicitly shared by campers and admins', () => {
  assert.equal(isSharedDocumentViewerPath('/documents/view/123'), true)
  assert.equal(isSharedDocumentViewerPath('/documents'), false)
})
