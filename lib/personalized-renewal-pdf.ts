import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

export type PersonalizedRenewalTerms = {
  camperName: string
  lotNumber: string
  currentAgreementEnd: string
  renewalStart: string
  renewalEnd: string
  annualRent: number
  paymentPlan: 'semiannual' | 'quarterly'
}

const green = rgb(0.08, 0.28, 0.17)
const gold = rgb(0.69, 0.48, 0.16)
const ink = rgb(0.11, 0.12, 0.11)
const muted = rgb(0.35, 0.37, 0.35)

function money(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago',
  })
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate
    else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

function paragraph(page: PDFPage, text: string, font: PDFFont, size: number, x: number, y: number, width: number, leading = size * 1.32) {
  const lines = wrap(text, font, size, width)
  lines.forEach((line, index) => page.drawText(line, { x, y: y - (index * leading), size, font, color: ink }))
  return y - (lines.length * leading)
}

function addYear(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const maxDay = new Date(year + 1, month, 0, 12).getDate()
  return `${year + 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, maxDay)).padStart(2, '0')}`
}

export function renewalTermDates(currentAgreementEnd: string) {
  const end = new Date(`${currentAgreementEnd}T12:00:00`)
  end.setDate(end.getDate() + 1)
  const renewalStart = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
  return { renewalStart, renewalEnd: addYear(currentAgreementEnd) }
}

export async function createPersonalizedRenewalPdf(terms: PersonalizedRenewalTerms) {
  if (!terms.camperName.trim() || !terms.lotNumber.trim()) throw new Error('Camper name and lot number are required.')
  if (!Number.isFinite(terms.annualRent) || terms.annualRent <= 0) throw new Error('A valid annual lot rent is required.')

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792])
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const x = 48
  const width = 516

  page.drawRectangle({ x: 0, y: 704, width: 612, height: 88, color: green })
  page.drawText('BUR OAKS RESORT, INC.', { x, y: 752, size: 19, font: serif, color: rgb(1, 1, 1) })
  page.drawText('10303 Oaks Road  |  Alhambra, Illinois 62001  |  618-488-7927', { x, y: 730, size: 9.5, font: regular, color: rgb(0.94, 0.90, 0.78) })

  page.drawText('SEASONAL SITE RENEWAL', { x, y: 675, size: 20, font: serif, color: green })
  page.drawText('THE EXACT TERMS YOU ARE BEING ASKED TO RENEW', { x, y: 655, size: 8.5, font: bold, color: gold })

  const rows: Array<[string, string]> = [
    ['Camper', terms.camperName],
    ['Site', `Lot ${terms.lotNumber}`],
    ['Current agreement ends', dateLabel(terms.currentAgreementEnd)],
    ['Renewal term', `${dateLabel(terms.renewalStart)} through ${dateLabel(terms.renewalEnd)}`],
    ['Annual lot rent', money(terms.annualRent)],
    ['Payment schedule', terms.paymentPlan === 'quarterly'
      ? `Four payments of ${money(terms.annualRent / 4)}`
      : `Two payments of ${money(terms.annualRent / 2)}`],
  ]

  page.drawRectangle({ x, y: 490, width, height: 144, color: rgb(0.965, 0.966, 0.945), borderColor: rgb(0.77, 0.70, 0.52), borderWidth: 1 })
  rows.forEach(([label, value], index) => {
    const rowY = 611 - (index * 21)
    page.drawText(label.toUpperCase(), { x: x + 16, y: rowY, size: 7.5, font: bold, color: muted })
    page.drawText(value, { x: x + 180, y: rowY - 1, size: 11, font: index === 4 ? bold : regular, color: index === 4 ? green : ink })
  })

  let y = 458
  y = paragraph(page, 'Please review the personalized terms above before signing. Your signature renews this seasonal site for the stated 12-month term and annual lot-rent amount.', regular, 9.5, x, y, width) - 7
  y = paragraph(page, 'This renewal continues all current Lease terms, including any modifications, updates, or addenda provided with this Renewal Form. Those terms remain in effect unless this document states otherwise.', regular, 9.5, x, y, width) - 7
  y = paragraph(page, 'A completed renewal must be returned at least 90 days before the current agreement ends. If it is not returned by the required deadline, Bur Oaks may treat the site as not renewed and make it available to another camper.', regular, 9.5, x, y, width) - 7
  y = paragraph(page, 'There will be a 20% or $20 late charge, whichever is greater, on payments not received by the specified due date.', bold, 9.5, x, y, width) - 7
  y = paragraph(page, 'Camper understands that trees and natural vegetation are inherent campground conditions and assumes the associated risks, including falling trees, limbs, branches, or debris caused by wind, storms, decay, or other natural causes.', regular, 9.2, x, y, width) - 12

  page.drawRectangle({ x, y: y - 58, width, height: 58, color: rgb(0.93, 0.96, 0.93), borderColor: green, borderWidth: 1.2 })
  page.drawText('THIS IS NOT A BILL', { x: x + 16, y: y - 24, size: 10, font: bold, color: green })
  page.drawText('Choose Renew or Do Not Renew below, then type your legal name to sign securely.', { x: x + 16, y: y - 43, size: 9.2, font: regular, color: ink })

  const decisionY = y - 95
  page.drawText('[  ] YES, I am renewing this site for the terms and price shown above.', { x, y: decisionY, size: 10.5, font: bold, color: ink })
  page.drawText('[  ] NO, I am not renewing this site.', { x, y: decisionY - 28, size: 10.5, font: bold, color: ink })
  page.drawLine({ start: { x, y: decisionY - 70 }, end: { x: 390, y: decisionY - 70 }, thickness: 0.8, color: muted })
  page.drawLine({ start: { x: 420, y: decisionY - 70 }, end: { x: 564, y: decisionY - 70 }, thickness: 0.8, color: muted })
  page.drawText('Electronic signature', { x, y: decisionY - 84, size: 7.5, font: regular, color: muted })
  page.drawText('Date', { x: 420, y: decisionY - 84, size: 7.5, font: regular, color: muted })

  page.drawText('Dawn  |  Bur Oaks Resort, Inc.', { x, y: 30, size: 8.5, font: regular, color: muted })
  return pdf.save()
}
