import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('admin money watch keeps electric balances separate and opens their exact invoice list', () => {
  const adminHome = source('../app/admin/page.tsx')
  const invoices = source('../app/admin/invoices/page.tsx')
  const styles = source('../app/globals.css')

  assert.match(adminHome, /const electricOwedInvoices = openInvoices\.filter/)
  assert.match(adminHome, /electricOwedAmount: totalInvoiceBalance\(electricOwedInvoices\)/)
  assert.match(adminHome, /electricBilledAmount: electricCollection\.billed/)
  assert.match(adminHome, />Electric still owed</)
  assert.match(adminHome, /remaining out of \$\{stats\.electricBilledAmount\.toFixed\(2\)\} total billed/)
  assert.match(adminHome, /\/admin\/invoices\?filter=open&search=electric/)
  assert.match(adminHome, /electricLateCampers/)
  assert.match(invoices, /searchParams\.get\('search'\)/)
  assert.match(styles, /admin-money-watch-grid \.electric-owed/)
})

test('account credits wait for due dates before the billing reminder sends any remainder', () => {
  const credits = source('../app/admin/credits/page.tsx')
  const reminderCron = source('../app/api/cron/invoice-text-reminders/route.ts')
  const migration = source('../migrations/076_apply_account_credits_when_due.sql')
  const camperInvoices = source('../app/invoices/page.tsx')

  assert.match(credits, /waits for each bill’s due date/)
  assert.match(reminderCron, /isInvoiceReadyForAccountCredit/)
  assert.match(reminderCron, /apply_account_credits_to_invoice_atomic/)
  assert.match(reminderCron, /credit_held_until_due/)
  assert.match(reminderCron, /Any uncovered remainder will be sent then/)
  assert.match(reminderCron, /const openInvoices = \(invoices \|\| \[\]\)\.filter\(isInvoiceOutstanding\)/)
  assert.match(migration, /invoice_row\.due_date > campground_today/)
  assert.match(migration, /Paid by account credit/)
  assert.match(migration, /remaining_due/)
  assert.match(camperInvoices, /label: 'Paid by account credit'/)
})
