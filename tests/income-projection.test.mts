import assert from 'node:assert/strict'
import test from 'node:test'
import { buildIncomeProjection } from '../lib/income-projection.ts'

test('projection keeps rent, association, and seasonal electric separate', () => {
  const result = buildIncomeProjection({
    sites: [
      { lotNumber: '1', camperIds: ['a'], annualLotRent: 1_200 },
      { lotNumber: '2', camperIds: ['b'], annualLotRent: 1_800 },
    ],
    readings: [
      { camper_id: 'a', reading_date: '2025-01-15', amount_due: 100 },
      { camper_id: 'a', reading_date: '2025-07-15', amount_due: 200 },
      { camper_id: 'b', reading_date: '2025-01-15', amount_due: 50 },
      { camper_id: 'b', reading_date: '2025-07-15', amount_due: 150 },
    ],
    invoices: [
      { camper_id: 'a', invoice_type: 'Lot Rent', due_date: '2026-04-01' },
      { camper_id: 'b', invoice_type: 'Association Fee', due_date: '2026-03-01' },
    ],
    associationFee: 250,
    fallbackLotRentMonth: 4,
    fallbackAssociationMonth: 1,
  })

  assert.equal(result.months[3].lotRent, 1_200)
  assert.equal(result.months[4].lotRent, 1_800)
  assert.equal(result.months[1].association, 250)
  assert.equal(result.months[2].association, 250)
  assert.equal(result.months[0].electric, 150)
  assert.equal(result.months[6].electric, 350)
  assert.equal(result.annualLotRent, 3_000)
  assert.equal(result.annualAssociation, 500)
})

test('seasonal campground electric average fills a site with missing history', () => {
  const result = buildIncomeProjection({
    sites: [
      { lotNumber: '1', camperIds: ['a'], annualLotRent: 0 },
      { lotNumber: '2', camperIds: ['b'], annualLotRent: 0 },
    ],
    readings: [{ camper_id: 'a', reading_date: '2025-08-15', amount_due: 125 }],
    invoices: [],
    associationFee: 250,
    fallbackLotRentMonth: 3,
    fallbackAssociationMonth: 3,
  })

  assert.equal(result.months[7].electric, 250)
  assert.equal(result.exactElectricSiteMonths, 1)
  assert.equal(result.totalElectricSiteMonths, 24)
})

test('latest lot-rent invoice fills a missing saved annual rent amount', () => {
  const result = buildIncomeProjection({
    sites: [{ lotNumber: '9', camperIds: ['camper-9'], annualLotRent: 0 }],
    readings: [],
    invoices: [{ camper_id: 'camper-9', invoice_type: 'Lot Rent', due_date: '2026-05-01', total_due: 2_400 }],
    associationFee: 250,
    fallbackLotRentMonth: 3,
    fallbackAssociationMonth: 2,
  })

  assert.equal(result.months[4].lotRent, 2_400)
  assert.equal(result.inferredRentSites, 1)
  assert.equal(result.missingRentSites, 0)
})
