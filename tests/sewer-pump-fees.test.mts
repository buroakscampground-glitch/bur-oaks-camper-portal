import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSewerPumpOutFeeForLot,
  getSewerPumpOutGallonsForCharge,
  isHoldingTankPumpOutLot,
} from '../lib/sewer-pump-fees.ts'

test('Gary Johnson at F2 uses the holding-tank pump-out rate', () => {
  assert.equal(isHoldingTankPumpOutLot('F2'), true)
  assert.equal(getSewerPumpOutFeeForLot(' f2 ', 10), 15)
  assert.equal(getSewerPumpOutGallonsForCharge(15), 150)
})

test('FF2 remains a different standard-rate campsite', () => {
  assert.equal(isHoldingTankPumpOutLot('FF2'), false)
  assert.equal(getSewerPumpOutFeeForLot('FF2', 10), 10)
  assert.equal(getSewerPumpOutGallonsForCharge(10), 30)
})
