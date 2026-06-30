const defaultPercent = 3
const defaultFlatCents = 30

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

export function cardProcessingFeeSettings() {
  return {
    percent: configuredPercent(),
    flatCents: configuredFlatCents(),
    label: 'Card processing fee',
  }
}

export function calculateCardProcessingFeeCents(invoiceTotalCents: number) {
  const subtotal = Math.max(0, Math.round(Number(invoiceTotalCents || 0)))

  if (subtotal <= 0) return 0

  const { percent, flatCents } = cardProcessingFeeSettings()
  const rate = percent / 100

  if (rate <= 0 && flatCents <= 0) return 0
  if (rate >= 1) return flatCents

  const totalWithFee = Math.ceil((subtotal + flatCents) / (1 - rate))
  return Math.max(0, totalWithFee - subtotal)
}

export function calculateCardProcessingFee(amount: number) {
  return calculateCardProcessingFeeCents(Math.round(Number(amount || 0) * 100)) / 100
}
