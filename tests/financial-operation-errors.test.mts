import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { financialOperationFailure } from '../lib/financial-operation-error.ts'

const options = {
  migrationMessage: 'Protected billing update is unavailable.',
  fallbackMessage: 'The billing change could not be completed.',
  allowedMessages: ['Invoice not found.'],
}

test('known office conflicts stay useful without being treated as server failures', () => {
  assert.deepEqual(financialOperationFailure({ code: 'P0001', message: 'Invoice not found.' }, options), {
    message: 'Invoice not found.',
    status: 409,
    report: false,
  })
})

test('missing protected functions produce a service error without database detail', () => {
  assert.deepEqual(financialOperationFailure({ code: 'PGRST202', message: 'function public.secret_rpc was not found' }, options), {
    message: 'Protected billing update is unavailable.',
    status: 503,
    report: true,
  })
})

test('unexpected database errors never reach an office browser', () => {
  const failure = financialOperationFailure({ code: '42703', message: 'column invoice_items.created_at does not exist' }, options)
  assert.deepEqual(failure, {
    message: 'The billing change could not be completed.',
    status: 500,
    report: true,
  })
  assert.doesNotMatch(failure.message, /invoice_items|created_at|42703/)
})

test('financial mutation routes use the safe error boundary', () => {
  for (const path of [
    'app/api/admin-manual-payments/route.ts',
    'app/api/admin-invoice-delete/route.ts',
    'app/api/admin-invoice-late-fee/route.ts',
    'app/api/admin-account-credits/route.ts',
  ]) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    assert.match(source, /reportOperationalFailure/)
    assert.doesNotMatch(source, /error:\s*error\.message/)
  }
})
