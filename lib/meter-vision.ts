import sharp from 'sharp'

export type MeterVisionResult = {
  reading: number | null
  rawCandidate: string
  visibleLot: string | null
  confidence: number | null
  text: string
}

type VisionPayload = {
  reading_digits: string | null
  visible_lot_label: string | null
  confidence: 'high' | 'medium' | 'low' | 'unreadable'
  explanation: string
}

const confidenceScores = {
  high: 96,
  medium: 82,
  low: 55,
  unreadable: 0,
} as const

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reading_digits: {
      type: ['string', 'null'],
      description: 'Only the digits visible in the mechanical kilowatthour register, preserving leading zeroes, or null when unreadable.',
    },
    visible_lot_label: {
      type: ['string', 'null'],
      description: 'The campsite identifier visibly printed on the Bur Oaks label beside the QR code, such as FF18 or 39, or null when it is not visible.',
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low', 'unreadable'],
    },
    explanation: {
      type: 'string',
      description: 'A short explanation of what was visible or unclear.',
    },
  },
  required: ['reading_digits', 'visible_lot_label', 'confidence', 'explanation'],
} as const

function responseText(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text
  for (const output of payload?.output || []) {
    for (const content of output?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text
    }
  }
  return ''
}

export function parseMeterVisionPayload(value: unknown): MeterVisionResult {
  const payload = value as Partial<VisionPayload> | null
  const rawCandidate = typeof payload?.reading_digits === 'string'
    ? payload.reading_digits.replace(/\D/g, '')
    : ''
  const reading = rawCandidate.length >= 3 && rawCandidate.length <= 8
    ? Number(rawCandidate)
    : Number.NaN
  const confidenceName = payload?.confidence && payload.confidence in confidenceScores
    ? payload.confidence
    : 'unreadable'
  const visibleLot = typeof payload?.visible_lot_label === 'string'
    ? payload.visible_lot_label
      .trim()
      .replace(/^bur\s*oaks(?:\s*campground)?[\s:.-]*/i, '')
      .replace(/^bo[\s-]*/i, '')
      .replace(/^lot\s+/i, '')
      .slice(0, 30) || null
    : null

  return {
    reading: Number.isSafeInteger(reading) && reading >= 0 ? reading : null,
    rawCandidate,
    visibleLot,
    confidence: confidenceScores[confidenceName],
    text: JSON.stringify({
      provider: 'openai',
      reading_digits: rawCandidate || null,
      visible_lot_label: visibleLot,
      confidence: confidenceName,
      explanation: String(payload?.explanation || '').slice(0, 500),
    }),
  }
}

async function imageForVision(bytes: ArrayBuffer) {
  return sharp(Buffer.from(bytes), { failOn: 'none', limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer()
}

export async function recognizeMeterWithVision(
  bytes: ArrayBuffer,
  options: { lotNumber?: string; previousReading?: number | null } = {}
): Promise<MeterVisionResult> {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) throw new Error('Meter photo reading is not configured yet.')

  const image = await imageForVision(bytes)
  const model = String(process.env.METER_VISION_MODEL || 'gpt-4.1-mini').trim()
  const previous = Number.isFinite(options.previousReading) ? Number(options.previousReading) : null
  const prompt = [
    'Read the ELECTRIC METER REGISTER in this photograph.',
    'Return the digits shown in the small mechanical kilowatthour number window only.',
    'Separately read the campsite identifier visibly printed on the BUR OAKS CAMPGROUND label beside the QR code, such as LOT FF18 or LOT 39.',
    'Do not treat that lot identifier, the QR code, a serial number, or a phone status bar as the meter reading.',
    'Mechanical wheels may be between digits: choose the digit that has fully passed, which is normally the lower digit.',
    'Preserve leading zeroes. Do not calculate usage and do not invent an obscured digit.',
    previous !== null ? `The previous confirmed reading was ${previous}; use it only as a plausibility check, never to change visible digits.` : 'There is no previous confirmed reading.',
  ].filter(Boolean).join('\n')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 22_000)
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_output_tokens: 180,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: `data:image/jpeg;base64,${image.toString('base64')}`, detail: 'high' },
          ],
        }],
        text: {
          format: {
            type: 'json_schema',
            name: 'electric_meter_reading',
            strict: true,
            schema: responseSchema,
          },
        },
      }),
      signal: controller.signal,
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const providerMessage = String(payload?.error?.message || '').slice(0, 300)
      throw new Error(providerMessage || `Meter vision service returned ${response.status}.`)
    }

    const text = responseText(payload)
    if (!text) throw new Error('Meter vision service returned no reading.')
    return parseMeterVisionPayload(JSON.parse(text))
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Meter photo reading timed out. Please try again.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
