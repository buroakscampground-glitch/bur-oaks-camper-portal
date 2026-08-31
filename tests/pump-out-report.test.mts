import assert from 'node:assert/strict'
import test from 'node:test'
import { uniquePrinterEmails } from '../lib/report-printer-emails.ts'

test('pump-out reports route to separate unique printer addresses', () => {
  assert.deepEqual(uniquePrinterEmails([
    'First@print.epsonconnect.com',
    ' second@print.epsonconnect.com ',
    'first@print.epsonconnect.com;bad-address',
  ]), [
    'first@print.epsonconnect.com',
    'second@print.epsonconnect.com',
  ])
})
