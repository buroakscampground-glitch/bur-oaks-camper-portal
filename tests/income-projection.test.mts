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
    fallbackAssociationMonth: 1,
    lotRentTiming: 'history',
  })

  assert.equal(result.months[3].lotRent, 1_350)
  assert.equal(result.months[4].lotRent, 150)
  assert.equal(result.months[1].association, 500)
  assert.equal(result.months[2].association, 0)
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
    fallbackAssociationMonth: 2,
    lotRentTiming: 'history',
  })

  assert.equal(result.months[4].lotRent, 2_400)
  assert.equal(result.inferredRentSites, 1)
  assert.equal(result.missingRentSites, 0)
})

test('actual monthly income updates from entered readings and campground invoices', () => {
  const result = buildIncomeProjection({
    sites: [{ lotNumber: '12', camperIds: ['camper-12'], annualLotRent: 2_000 }],
    readings: [
      { camper_id: 'camper-12', reading_date: '2026-08-20', amount_due: 85 },
      { camper_id: 'camper-12', reading_date: '2025-08-20', amount_due: 75 },
    ],
    invoices: [
      { camper_id: 'camper-12', invoice_type: 'Lot Rent', due_date: '2026-04-01', total_due: 2_000, status: 'paid' },
      { camper_id: 'camper-12', invoice_type: 'Association Fee', due_date: '2026-03-01', total_due: 250, status: 'open' },
      { camper_id: 'camper-12', invoice_type: 'Association Fee', due_date: '2026-03-01', total_due: 250, status: 'cancelled' },
    ],
    associationFee: 250,
    fallbackAssociationMonth: 2,
    projectionYear: 2026,
    lotRentTiming: 'history',
  })

  assert.equal(result.months[7].actualElectric, 85)
  assert.equal(result.months[3].actualLotRent, 2_000)
  assert.equal(result.months[2].actualAssociation, 250)
  assert.equal(result.actualTotal, 2_335)
})

test('default planning mode spreads annual lot rent instead of creating an artificial April spike', () => {
  const result = buildIncomeProjection({
    sites: [{ lotNumber: '20', camperIds: ['camper-20'], annualLotRent: 2_400 }],
    readings: [],
    invoices: [{ camper_id: 'camper-20', invoice_type: 'Lot Rent', due_date: '2026-04-01', total_due: 2_400 }],
    associationFee: 0,
    fallbackAssociationMonth: 2,
  })

  assert.deepEqual(result.months.map((month) => month.lotRent), Array(12).fill(200))
})

test('actual contract anniversary starts four quarterly payments and never uses the earlier renewal notice month', () => {
  const result = buildIncomeProjection({
    sites: [{ lotNumber: 'FF1', camperIds: ['camper-ff1'], annualLotRent: 1_500 }],
    readings: [],
    invoices: [
      { camper_id: 'camper-ff1', invoice_type: 'Association Fee', due_date: '2027-02-01', total_due: 250 },
    ],
    renewals: [
      { camper_id: 'camper-ff1', lot_number: 'FF1', contract_end_date: '2027-05-01' },
    ],
    associationFee: 250,
    fallbackAssociationMonth: 1,
  })

  assert.equal(result.months[1].lotRent, 375)
  assert.equal(result.months[4].lotRent, 375)
  assert.equal(result.months[7].lotRent, 375)
  assert.equal(result.months[10].lotRent, 375)
  assert.equal(result.months[1].association, 250)
  assert.equal(result.months[4].association, 0)
  assert.equal(result.contractDateMatches, 1)
})

test('newest electric season receives more weight as current readings are entered', () => {
  const result = buildIncomeProjection({
    sites: [{ lotNumber: '18', camperIds: ['camper-18'], annualLotRent: 0 }],
    readings: [
      { camper_id: 'camper-18', reading_date: '2025-07-15', amount_due: 60 },
      { camper_id: 'camper-18', reading_date: '2026-07-15', amount_due: 120 },
    ],
    invoices: [],
    associationFee: 0,
    fallbackAssociationMonth: 2,
  })

  assert.equal(result.latestElectricYear, 2026)
  assert.equal(result.months[6].electric, 100)
})
