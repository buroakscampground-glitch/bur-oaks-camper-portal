import assert from 'node:assert/strict'
import test from 'node:test'
import { chooseBestMeterRecognition, displayLotNumber, extractMeterReading, meterLabelCode, normalizeLotKey } from '../lib/meter-reading.ts'
import { parseMeterVisionPayload } from '../lib/meter-vision.ts'

test('meter OCR extracts the longest likely numeric display', () => {
  assert.equal(extractMeterReading('kWh 0012345\n60 Hz').reading, 12345)
  assert.equal(extractMeterReading('DISPLAY 12,345').reading, 12345)
  assert.equal(extractMeterReading('no readable digits').reading, null)
})

test('meter labels contain stable lot and optional meter references', () => {
  assert.equal(normalizeLotKey(' ff-6 '), 'FF6')
  assert.equal(meterLabelCode('ff-6', 'm 22'), 'BO-FF6-M22')
  assert.equal(meterLabelCode('39'), 'BO-39')
  assert.equal(displayLotNumber('Lot 17'), '17')
})

test('meter OCR favors a plausible reading near the previous lot reading', () => {
  const best = chooseBestMeterRecognition([
    { reading: 91827364, rawCandidate: '91827364', confidence: 92, text: 'serial 91827364' },
    { reading: 12584, rawCandidate: '12584', confidence: 67, text: '12584' },
    { reading: 7258, rawCandidate: '7258', confidence: 81, text: '7258' },
  ], 12310)

  assert.equal(best?.reading, 12584)
})

test('meter OCR favors a reading repeated across several image treatments', () => {
  const best = chooseBestMeterRecognition([
    { reading: 3713, rawCandidate: '03713', confidence: 11, text: '0 37 1 3' },
    { reading: 3713, rawCandidate: '03713', confidence: 45, text: '03713' },
    { reading: 3713, rawCandidate: '03713', confidence: 29, text: '03713' },
    { reading: 37138, rawCandidate: '037138', confidence: 46, text: '037138' },
  ], 3500)

  assert.equal(best?.reading, 3713)
})

test('managed meter vision preserves leading zeroes while returning a numeric reading', () => {
  const result = parseMeterVisionPayload({
    reading_digits: '03713',
    confidence: 'high',
    explanation: 'Five mechanical register wheels are visible.',
  })

  assert.equal(result.reading, 3713)
  assert.equal(result.rawCandidate, '03713')
  assert.equal(result.confidence, 96)
})

test('managed meter vision refuses malformed or unreadable output', () => {
  assert.equal(parseMeterVisionPayload({ reading_digits: null, confidence: 'unreadable', explanation: 'Glare' }).reading, null)
  assert.equal(parseMeterVisionPayload({ reading_digits: '12', confidence: 'low', explanation: 'Partial' }).reading, null)
})
