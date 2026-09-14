import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWaitlistConfirmation } from '../lib/waitlist-confirmation-copy.ts'

test('waitlist confirmation welcomes the applicant and explains what happens next', () => {
  const copy = buildWaitlistConfirmation('Jamie')

  assert.equal(copy.subject, 'Welcome to the Bur Oaks waitlist')
  assert.match(copy.text, /Hi Jamie,/)
  assert.match(copy.text, /added to our seasonal-site waitlist/)
  assert.match(copy.text, /contact you when we have an opening/)
  assert.match(copy.text, /\(618\) 488-7927/)
  assert.match(copy.text, /buroakscampground@gmail\.com/)
})

test('waitlist confirmation escapes applicant names in the HTML email', () => {
  const copy = buildWaitlistConfirmation('<Jamie & Family>')

  assert.match(copy.html, /&lt;Jamie &amp; Family&gt;/)
  assert.doesNotMatch(copy.html, /Hi <Jamie & Family>/)
})
