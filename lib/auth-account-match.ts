import { effectivePortalRole } from './staff-roles.ts'

export type AuthCamperRecord = {
  id: string
  active?: boolean | null
  role?: string | null
  lot_number?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  secondary_email?: string | null
  alternate_phone?: string | null
  second_profile_first_name?: string | null
  second_profile_last_name?: string | null
  second_profile_phone?: string | null
  birthday?: string | null
  second_profile_birthday?: string | null
  birthday_celebration_opt_in?: boolean | null
  celebration_messages_opt_in?: boolean | null
  celebration_messages_opt_in_at?: string | null
  event_reminders_opt_in_at?: string | null
  sms_opt_in?: boolean | null
  sms_opt_in_at?: string | null
  directory_opt_in?: boolean | null
  directory_show_phone?: boolean | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  golf_cart_color?: string | null
  golf_cart_make?: string | null
  license_plate?: string | null
  mailing_address_line1?: string | null
  mailing_address_line2?: string | null
  mailing_city?: string | null
  mailing_state?: string | null
  mailing_zip?: string | null
  vehicle_make?: string | null
  vehicle_model?: string | null
  vehicle_2_make?: string | null
  vehicle_2_model?: string | null
  vehicle_2_license_plate?: string | null
  camper_since_date?: string | null
  rent_payment_plan?: string | null
}

type MatchableAccount = {
  id?: unknown
  active?: boolean | null
  role?: unknown
  lot_number?: unknown
}

export function selectAuthenticatedCamperMatch<T extends MatchableAccount>(matches: T[] = []): T | null {
  const uniqueActiveMatches = matches
    .filter((match) => match?.active !== false)
    .filter((match, index, all) => all.findIndex((item) => item?.id === match?.id) === index)

  if (uniqueActiveMatches.length === 1) return uniqueActiveMatches[0]

  // One email can legitimately appear on a camper profile and one staff
  // profile. Select one unambiguous staff identity, but never guess between
  // multiple camper records or multiple staff roles.
  const staffMatches = uniqueActiveMatches.filter((match) =>
    ['admin', 'event_coordinator', 'maintenance'].includes(effectivePortalRole(match))
  )

  return staffMatches.length === 1 ? staffMatches[0] : null
}

export function selectAuthenticatedEmailMatch<T extends MatchableAccount>(primaryMatches: T[] = [], secondaryMatches: T[] = []): T | null {
  const activePrimaryMatches = primaryMatches.filter((match) => match?.active !== false)
  if (activePrimaryMatches.length) return selectAuthenticatedCamperMatch(activePrimaryMatches)
  return selectAuthenticatedCamperMatch(secondaryMatches)
}
