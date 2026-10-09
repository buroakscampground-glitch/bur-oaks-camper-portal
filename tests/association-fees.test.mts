import assert from 'node:assert/strict'
import test from 'node:test'
import { associationFeeAmount, associationFeeBucket, associationFeeSiteBucket, associationFeeYear, isAssociationFeeExemptCamper, isPhysicalAssociationFeeCamper } from '../lib/association-fees.ts'

test('association fee records are separated into owes, processing, paid, and excluded', () => {
  assert.equal(associationFeeBucket({ status: 'sent', total_due: 250 }), 'owes')
  assert.equal(associationFeeBucket({ status: 'processing', total_due: 250 }), 'processing')
  assert.equal(associationFeeBucket({ status: 'paid', total_due: 250 }), 'paid')
  assert.equal(associationFeeBucket({ status: 'void', total_due: 250 }), 'excluded')
  assert.equal(associationFeeBucket({ status: 'cancelled', total_due: 250 }), 'excluded')
})

test('paid fees preserve their recorded charge and fee year', () => {
  assert.equal(associationFeeAmount({ status: 'paid', total_due: 0, subtotal: 250, late_fee: 0 }), 250)
  assert.equal(associationFeeYear({ due_date: '2027-02-01' }), '2027')
  assert.equal(associationFeeYear({ due_date: null, paid_at: '2026-10-09T12:00:00Z' }), '2026')
})

test('the campground roster includes physical camper sites without inventing a fee debt', () => {
  assert.equal(isPhysicalAssociationFeeCamper({ active: true, role: 'camper', lot_number: '41' }), true)
  assert.equal(isPhysicalAssociationFeeCamper({ active: true, role: 'camper', lot_number: 'TEMP PORTAL 1' }), false)
  assert.equal(isPhysicalAssociationFeeCamper({ active: true, role: 'admin', lot_number: '1001' }), false)
  assert.equal(isAssociationFeeExemptCamper({ first_name: ' Anthony ', last_name: 'FINLEY' }), true)
  assert.equal(isAssociationFeeExemptCamper({ first_name: 'Anthony', last_name: 'Someone Else' }), false)
  assert.equal(associationFeeSiteBucket([]), 'missing')
  assert.equal(associationFeeSiteBucket([{ status: 'void', total_due: 250 }]), 'missing')
})

test('processing stays separate so a submitted payment is never requested twice', () => {
  assert.equal(associationFeeSiteBucket([{ status: 'sent' }, { status: 'processing' }]), 'processing')
  assert.equal(associationFeeSiteBucket([{ status: 'paid' }]), 'paid')
  assert.equal(associationFeeSiteBucket([{ status: 'sent' }]), 'owes')
})
