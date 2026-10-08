import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { scheduledReportRetryDecision } from '../lib/scheduled-report-retry.ts'

test('scheduled reports retry only delivery components explicitly recorded as failed', () => {
  assert.deepEqual(scheduledReportRetryDecision({ status: 'partial', office_email_status: 'sent', printer_email_status: 'failed' }, 'done'), {
    action: 'retry', sendOffice: false, sendPrinter: true,
  })
  assert.deepEqual(scheduledReportRetryDecision({ status: 'failed', office_email_status: 'failed', printer_email_status: 'failed' }, 'done'), {
    action: 'retry', sendOffice: true, sendPrinter: true,
  })
})

test('scheduled reports never auto-repeat an uncertain result', () => {
  assert.match(scheduledReportRetryDecision({ status: 'running' }, 'done').reason || '', /awaiting verification/)
  assert.match(scheduledReportRetryDecision({ status: 'failed' }, 'done').reason || '', /result is uncertain/)
  assert.deepEqual(scheduledReportRetryDecision({ status: 'sent' }, 'already handled'), { action: 'skip', reason: 'already handled' })
})

test('every paired morning report uses the shared verify-before-retry rule', () => {
  for (const path of [
    'app/api/cron/daily-payment-report/route.ts',
    'app/api/cron/daily-morning-operations/route.ts',
    'app/api/cron/daily-maintenance-work-orders/route.ts',
    'app/api/cron/monday-pump-out-list/route.ts',
  ]) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    assert.match(source, /scheduledReportRetryDecision/)
    assert.match(source, /Check the office inbox and Epson printer before retrying/)
  }
})
