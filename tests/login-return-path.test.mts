import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { safeLoginReturnPath } from '../lib/login-return-path.ts'

test('admin message alert returns to the exact conversation after login', () => {
  assert.equal(
    safeLoginReturnPath('/admin/messages?camperId=camper-123', 'admin'),
    '/admin/messages?camperId=camper-123',
  )
})

test('full admins can return directly to the separate community workspace', () => {
  assert.equal(safeLoginReturnPath('/community/feed', 'admin'), '/community/feed')
  assert.equal(safeLoginReturnPath('/community/announcements', 'admin'), '/community/announcements')
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

test('event coordinator links stay inside the community workspace', () => {
  assert.equal(safeLoginReturnPath('/community/announcements', 'event_coordinator'), '/community/announcements')
  assert.equal(safeLoginReturnPath('/admin/invoices', 'event_coordinator'), '')
  assert.equal(safeLoginReturnPath('/maintenance/dashboard', 'event_coordinator'), '')
})

test('Community has its own sign-in entrance while full admins keep the same account', async () => {
  const [layout, login] = await Promise.all([
    readFile(new URL('../app/community/layout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/community-login/page.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(layout, /loginPath="\/community-login"/)
  assert.match(login, /same email and password as her Admin account/)
  assert.match(login, /\['admin', 'event_coordinator'\]\.includes\(role\)/)
  assert.match(login, /safeLoginReturnPath\(requested, role\) \|\| '\/community'/)
})
