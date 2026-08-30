import assert from 'node:assert/strict'
import test from 'node:test'
import { safeLoginReturnPath } from '../lib/login-return-path.ts'

test('admin message alert returns to the exact conversation after login', () => {
  assert.equal(
    safeLoginReturnPath('/admin/messages?camperId=camper-123', 'admin'),
    '/admin/messages?camperId=camper-123',
  )
})

test('login return path rejects external and wrong-role destinations', () => {
  assert.equal(safeLoginReturnPath('//malicious.example/admin', 'admin'), '')
  assert.equal(safeLoginReturnPath('https://malicious.example/admin', 'admin'), '')
  assert.equal(safeLoginReturnPath('/admin/messages', 'camper'), '')
  assert.equal(safeLoginReturnPath('/messages', 'admin'), '')
})

test('camper and maintenance links return only to their own areas', () => {
  assert.equal(safeLoginReturnPath('/invoices/abc', 'camper'), '/invoices/abc')
  assert.equal(safeLoginReturnPath('/maintenance/dashboard/ticket-1', 'maintenance'), '/maintenance/dashboard/ticket-1')
})
