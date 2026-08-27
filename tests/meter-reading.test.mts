import assert from 'node:assert/strict'
import test from 'node:test'
import { extractMeterReading, meterLabelCode, normalizeLotKey } from '../lib/meter-reading.ts'

test('meter OCR extracts the longest likely numeric display', () => {
  assert.equal(extractMeterReading('kWh 0012345\n60 Hz').reading, 12345)
  assert.equal(extractMeterReading('DISPLAY 12,345').reading, 12345)
  assert.equal(extractMeterReading('no readable digits').reading, null)
})

test('meter labels contain stable lot and optional meter references', () => {
  assert.equal(normalizeLotKey(' ff-6 '), 'FF6')
  assert.equal(meterLabelCode('ff-6', 'm 22'), 'BO-FF6-M22')
  assert.equal(meterLabelCode('39'), 'BO-39')
})
