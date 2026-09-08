type DinnerSignupState = {
  attending_status?: unknown
  bringing?: unknown
  guest_count?: unknown
}

export function isUnchangedDinnerSignup(
  existing: DinnerSignupState | null | undefined,
  next: { status: string; bringing: string; guestCount: number }
) {
  if (!existing) return false

  return (
    String(existing.attending_status || '') === next.status &&
    String(existing.bringing || '').trim() === next.bringing.trim() &&
    Number(existing.guest_count || 1) === next.guestCount
  )
}
