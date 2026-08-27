export type NonRenewalCamper = {
  first_name?: string | null
  last_name?: string | null
  second_profile_first_name?: string | null
  second_profile_last_name?: string | null
  lot_number?: string | null
  email?: string | null
  secondary_email?: string | null
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function fullDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function nonRenewalHouseholdName(camper: NonRenewalCamper) {
  const firstNames = Array.from(new Set([
    String(camper.first_name || '').trim(),
    String(camper.second_profile_first_name || '').trim(),
  ].filter(Boolean)))
  if (firstNames.length) return firstNames.join(' and ')
  return String(camper.last_name || '').trim() || 'Camper'
}

export function buildNonRenewalLetter(camper: NonRenewalCamper, contractEndDate: string) {
  const householdName = nonRenewalHouseholdName(camper)
  const lot = String(camper.lot_number || 'your seasonal site').trim()
  const endDate = fullDate(contractEndDate)
  const subject = `Notice of non-renewal for Bur Oaks seasonal Site ${lot}`
  const paragraphs = [
    'Thank you for being part of the Bur Oaks Campground community. We have appreciated having you with us.',
    `After careful consideration, Bur Oaks Campground has decided to move in a different direction and will not offer a renewal of your seasonal site agreement for Site ${lot} when your current agreement expires on ${endDate}.`,
    `Please remove your camper and all personal belongings that are not permanently affixed to the site no later than ${endDate}. After those items are removed, the site must be left in a clean, safe, camping-ready condition.`,
    'As provided in the seasonal agreement, all permanent improvements and anything affixed to the ground are and remain the property of Bur Oaks Campground. This includes, without limitation, decks, sheds, patios, utility connections, rock or stone, landscaping, bushes, trees, and other plantings. These items must not be removed, altered, sold, or damaged without prior written authorization from Bur Oaks Campground.',
    'Any cleanup, removal, repair, storage, or disposal required after the agreement ends may be charged to your account in accordance with your seasonal agreement and campground policies.',
    'Your current agreement and campground responsibilities remain in effect through the expiration date. Please contact Anthony at 618-882-8063 to coordinate your move-out and final site inspection or if you have any questions.',
  ]
  const text = [
    `Dear ${householdName},`,
    '',
    ...paragraphs.flatMap((paragraph) => [paragraph, '']),
    'Sincerely,',
    'Bur Oaks Campground',
  ].join('\n').trim()
  const html = `
    <div style="font-family:Arial,sans-serif;background:#f4f0e7;padding:30px;color:#293a30">
      <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #ded7c9;border-radius:18px;overflow:hidden">
        <div style="padding:25px 30px;background:#214b31;color:#fff">
          <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#e3cd95;font-weight:700">Bur Oaks Campground</div>
          <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-size:28px;font-weight:500">Notice of Non-Renewal</h1>
        </div>
        <div style="padding:34px 32px;font-size:15px;line-height:1.68">
          <p style="margin-top:0">Dear ${escapeHtml(householdName)},</p>
          ${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
          <p style="margin:28px 0 0">Sincerely,<br><strong>Bur Oaks Campground</strong></p>
        </div>
      </div>
    </div>
  `

  return { subject, householdName, lot, endDate, paragraphs, text, html }
}
