import { addMonthsToDate, normalizeRentPaymentPlan, type RentPaymentPlan } from './renewal-rent-schedule.ts'

export type RentPaymentPart = {
  number: number
  amount: number
  dueDate: string
}

function splitMoney(total: number, installments: number) {
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / installments)
  const remainder = cents - base * installments
  return Array.from({ length: installments }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100)
}

export function rentPaymentBreakdown(
  annualRent: unknown,
  paymentPlan: RentPaymentPlan | unknown,
  contractAnchor?: unknown,
) {
  const total = Number(annualRent || 0)
  if (!Number.isFinite(total) || total <= 0) return null

  const plan = normalizeRentPaymentPlan(paymentPlan)
  const count = plan === 'quarterly' ? 4 : 2
  const monthStep = plan === 'quarterly' ? 3 : 6
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(String(contractAnchor || '')) ? String(contractAnchor) : ''
  const amounts = splitMoney(total, count)
  const payments: RentPaymentPart[] = amounts.map((amount, index) => ({
    number: index + 1,
    amount,
    dueDate: anchor ? addMonthsToDate(anchor, index * monthStep) : '',
  }))

  return {
    annualRent: Number(total.toFixed(2)),
    plan,
    count,
    label: plan === 'quarterly' ? 'Grandfathered quarterly' : 'Half-and-half',
    payments,
  }
}
