import assert from 'node:assert/strict'
import test from 'node:test'
import { loginAccountSwitchPrompt } from '../lib/login-account-switch.ts'

test('an Admin return path asks for the administrator account without echoing the path', () => {
  const prompt = loginAccountSwitchPrompt('wrong-account', '/admin/invoices/private-id?payment=check')
  assert.equal(prompt?.heading, 'Administrator sign-in required')
  assert.match(prompt?.message || '', /administrator account/)
  assert.doesNotMatch(JSON.stringify(prompt), /private-id|payment=check/)
})

test('maintenance and Community account switches name their required workspace', () => {
  assert.equal(loginAccountSwitchPrompt('wrong-account', '/maintenance/dashboard/ticket')?.heading, 'Maintenance sign-in required')
  assert.equal(loginAccountSwitchPrompt('wrong-account', '/community/talk')?.heading, 'Community staff sign-in required')
})

test('ordinary sign-in has no switch prompt and unknown destinations stay generic', () => {
  assert.equal(loginAccountSwitchPrompt(null, '/admin'), null)
  assert.equal(loginAccountSwitchPrompt('wrong-account', 'https://outside.invalid/admin')?.heading, 'A different account is required')
})
