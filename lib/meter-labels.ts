import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'
import { getSiteUrl } from './site-url'
import { displayLotNumber, meterLabelCode } from './meter-reading'

export type MeterLabelSite = {
  lot_number: string
  meter_number?: string | null
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN_X = 24
const MARGIN_Y = 24
const GAP = 10
const COLUMNS = 2
const ROWS = 4
const LABEL_WIDTH = (PAGE_WIDTH - MARGIN_X * 2 - GAP) / COLUMNS
const LABEL_HEIGHT = (PAGE_HEIGHT - MARGIN_Y * 2 - GAP * (ROWS - 1)) / ROWS

export async function buildMeterLabelsPdf(sites: MeterLabelSite[]) {
  const pdf = await PDFDocument.create()
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)

  for (let index = 0; index < sites.length; index += COLUMNS * ROWS) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    const pageSites = sites.slice(index, index + COLUMNS * ROWS)

    for (let slot = 0; slot < pageSites.length; slot += 1) {
      const site = pageSites[slot]
      const displayedLot = displayLotNumber(site.lot_number)
      const column = slot % COLUMNS
      const row = Math.floor(slot / COLUMNS)
      const x = MARGIN_X + column * (LABEL_WIDTH + GAP)
      const y = PAGE_HEIGHT - MARGIN_Y - (row + 1) * LABEL_HEIGHT - row * GAP
      const code = meterLabelCode(site.lot_number, site.meter_number)
      const scanUrl = new URL('/maintenance/dashboard/meter-readings', getSiteUrl())
      scanUrl.searchParams.set('lot', String(site.lot_number))
      if (site.meter_number) scanUrl.searchParams.set('meter', String(site.meter_number))
      const qrDataUrl = await QRCode.toDataURL(scanUrl.toString(), {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 420,
        color: { dark: '#173722', light: '#FFFFFF' },
      })
      const qrBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64')
      const qrImage = await pdf.embedPng(qrBytes)

      page.drawRectangle({
        x,
        y,
        width: LABEL_WIDTH,
        height: LABEL_HEIGHT,
        borderColor: rgb(.12, .28, .18),
        borderWidth: 1.4,
        color: rgb(1, 1, 1),
      })
      page.drawText('BUR OAKS CAMPGROUND', {
        x: x + 13,
        y: y + LABEL_HEIGHT - 25,
        size: 10,
        font: bold,
        color: rgb(.12, .28, .18),
      })
      page.drawText(`LOT ${displayedLot}`, {
        x: x + 13,
        y: y + LABEL_HEIGHT - 65,
        size: displayedLot.length > 6 ? 24 : 31,
        font: bold,
        color: rgb(.55, .13, .11),
      })
      page.drawText(site.meter_number ? `Meter ${site.meter_number}` : 'Meter number not entered', {
        x: x + 13,
        y: y + LABEL_HEIGHT - 88,
        size: 10,
        font: bold,
        color: rgb(.22, .28, .23),
      })
      page.drawText('1. Scan  2. Photograph  3. Submit', {
        x: x + 13,
        y: y + 20,
        size: 8.5,
        font: regular,
        color: rgb(.35, .39, .36),
      })
      page.drawText(code, {
        x: x + 13,
        y: y + 8,
        size: 6.5,
        font: regular,
        color: rgb(.42, .45, .42),
      })
      page.drawImage(qrImage, {
        x: x + LABEL_WIDTH - 124,
        y: y + 25,
        width: 110,
        height: 110,
      })
    }
  }

  return pdf.save()
}
