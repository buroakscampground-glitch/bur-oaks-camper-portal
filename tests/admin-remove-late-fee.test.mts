import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('admins can remove a late fee from invoice detail and open balances', async () => {
  const [detail, balances] = await Promise.all([
    readFile(new URL('../app/admin/invoices/[id]/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/open-balance/[id]/page.tsx', import.meta.url), 'utf8'),
  ])
  for (const source of [detail, balances]) {
    assert.match(source, /Remove late fee/)
    assert.match(source, /removeAdminInvoiceLateFee/)
  }
})

test('late fee removal lowers the balance and records an enduring waiver', async () => {
  const route = await readFile(new URL('../app/api/admin-invoice-late-fee/route.ts', import.meta.url), 'utf8')
  assert.match(route, /Admin access is required/)
  assert.match(route, /late_fee: 0, total_due: newTotal/)
  assert.match(route, /invoice-late-fee-waived/)
  assert.match(route, /Late Fee Waived/)
})

test('invoice automation honors a manual late fee waiver', async () => {
  const cron = await readFile(new URL('../app/api/cron/invoice-text-reminders/route.ts', import.meta.url), 'utf8')
  assert.match(cron, /invoice-late-fee-waived/)
  assert.match(cron, /!lateFeeWaived && daysPastDue >= LATE_FEE_WARNING_DAY/)
  assert.match(cron, /!lateFeeWaived &&[\s\S]*?daysPastDue >= LATE_FEE_ASSESSMENT_DAY/)
})
