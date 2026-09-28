import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const source = fs.readFileSync(path.join(process.cwd(), 'components/AdminQuickText.tsx'), 'utf8')

test('quick text alerts include power outage and restoration presets', () => {
  assert.match(source, /label: 'Power outage'/)
  assert.match(source, /type: 'Emergency Alert'/)
  assert.match(source, /POWER OUTAGE: Bur Oaks is currently without power/)
  assert.match(source, /label: 'Power restored'/)
  assert.match(source, /POWER RESTORED: Electrical service has been restored at Bur Oaks/)
  assert.match(source, /Please contact the office if your site is still without power/)
})
