const defaultPercent = 3
const defaultFlatCents = 30
const percentKey = 'card_processing_fee_percent'
const flatCentsKey = 'card_processing_fee_flat_cents'
const achPercent = 0.8
const achFeeCapCents = 500

export type CardProcessingFeeSettings = {
  percent: number
  flatCents: number
  label: string
}

function configuredPercent() {
  const raw =
    process.env.NEXT_PUBLIC_CARD_PROCESSING_FEE_PERCENT ||
    process.env.CARD_PROCESSING_FEE_PERCENT
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultPercent
}

function configuredFlatCents() {
  const raw =
    process.env.NEXT_PUBLIC_CARD_PROCESSING_FEE_FLAT_CENTS ||
    process.env.CARD_PROCESSING_FEE_FLAT_CENTS
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : defaultFlatCents
}

export function cardProcessingFeeSettings(): CardProcessingFeeSettings {
  return {
    percent: configuredPercent(),
    flatCents: configuredFlatCents(),
    label: 'Card processing fee',
  }
}

export function normalizeCardProcessingFeeSettings(settings?: Partial<CardProcessingFeeSettings> | null): CardProcessingFeeSettings {
  const fallback = cardProcessingFeeSettings()
  const percent = Number(settings?.percent)
  const flatCents = Number(settings?.flatCents)

  return {
    percent: Number.isFinite(percent) && percent >= 0 ? percent : fallback.percent,
    flatCents: Number.isFinite(flatCents) && flatCents >= 0 ? Math.round(flatCents) : fallback.flatCents,
    label: settings?.label || fallback.label,
  }
}

export async function loadPaymentFeeSettings(client: any): Promise<CardProcessingFeeSettings> {
  const fallback = cardProcessingFeeSettings()

  if (!client?.from) return fallback

  const { data, error } = await client
    .from('app_settings')
    .select('key,value')
    .in('key', [percentKey, flatCentsKey])

  if (error?.code === '42P01' || error?.code === 'PGRST205') return fallback
  if (error) return fallback

  const values = new Map((data || []).map((row: any) => [row.key, row.value]))

  return normalizeCardProcessingFeeSettings({
    percent: values.has(percentKey) ? Number(values.get(percentKey)) : fallback.percent,
    flatCents: values.has(flatCentsKey) ? Number(values.get(flatCentsKey)) : fallback.flatCents,
  })
}

export function calculateCardProcessingFeeCents(invoiceTotalCents: number, settings?: Partial<CardProcessingFeeSettings> | null) {
  const subtotal = Math.max(0, Math.round(Number(invoiceTotalCents || 0)))

  if (subtotal <= 0) return 0

  const { percent, flatCents } = normalizeCardProcessingFeeSettings(settings)
  const rate = percent / 100

  if (rate <= 0 && flatCents <= 0) return 0
  if (rate >= 1) return flatCents

  const totalWithFee = Math.ceil((subtotal + flatCents) / (1 - rate))
  return Math.max(0, totalWithFee - subtotal)
}

export function calculateCardProcessingFee(amount: number, settings?: Partial<CardProcessingFeeSettings> | null) {
  return calculateCardProcessingFeeCents(Math.round(Number(amount || 0) * 100), settings) / 100
}

export function calculateAchProcessingFeeCents(invoiceTotalCents: number) {
  const subtotal = Math.max(0, Math.round(Number(invoiceTotalCents || 0)))
  if (subtotal <= 0) return 0
  return Math.min(achFeeCapCents, Math.ceil(subtotal * (achPercent / 100)))
}

export function calculateAchProcessingFee(amount: number) {
  return calculateAchProcessingFeeCents(Math.round(Number(amount || 0) * 100)) / 100
}

export const achProcessingFeeLabel = 'ACH processing fee (0.8%, maximum $5)'
