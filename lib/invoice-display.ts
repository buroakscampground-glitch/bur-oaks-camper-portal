export function formatInvoiceMoney(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

export function invoiceLineDetails(item: any) {
  const rawDescription = String(item?.description || 'Campground charge').trim()
  const description = rawDescription || 'Campground charge'
  const lower = description.toLowerCase()
  const quantity = Number(item?.quantity || 1)
  const unitPrice = Number(item?.unit_price || 0)
  const total = Number(item?.total ?? quantity * unitPrice)
  const countLabel = quantity.toLocaleString('en-US')

  if (lower.includes('electric') || lower.includes('kwh')) {
    return {
      title: 'Electric usage',
      explanation: `You used ${countLabel} kWh. Rate: ${formatInvoiceMoney(unitPrice)} per kWh.`,
      amount: total,
    }
  }

  if (lower.includes('water') || lower.includes('trash')) {
    return {
      title: 'Water & trash service',
      explanation: 'Monthly water/trash fee for your site.',
      amount: total,
    }
  }

  if (lower.includes('sewer') || lower.includes('pump')) {
    return {
      title: 'Sewer pump-out service',
      explanation: `${countLabel} pump-out${quantity === 1 ? '' : 's'} at ${formatInvoiceMoney(unitPrice)} each.`,
      amount: total,
    }
  }

  if (lower.includes('rent') || lower.includes('lot')) {
    return {
      title: 'Lot rent',
      explanation: 'Seasonal/site rent charge for your camper account.',
      amount: total,
    }
  }

  if (lower.includes('late')) {
    return {
      title: 'Late fee',
      explanation: 'Added because payment was not received by the due date.',
      amount: total,
    }
  }

  return {
    title: description,
    explanation: quantity > 1
      ? `${countLabel} × ${formatInvoiceMoney(unitPrice)} each.`
      : 'Campground charge for your account.',
    amount: total,
  }
}

export function fallbackInvoiceLine(invoice: any) {
  return {
    title: invoice?.invoice_type || 'Campground charge',
    explanation: 'This older invoice was created before detailed line items were saved.',
    amount: Number(invoice?.total_due || 0),
  }
}
