export function formatCreditMoney(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

export async function getCamperCreditBalance(client: any, camperId: string) {
  if (!camperId) return 0

  const { data, error } = await client
    .from('account_credits')
    .select('remaining_amount,status')
    .eq('camper_id', camperId)
    .eq('status', 'active')
    .gt('remaining_amount', 0)

  if (error?.code === '42P01' || error?.code === 'PGRST205') return 0
  if (error) throw error

  return Number((data || []).reduce((sum: number, credit: any) => sum + Number(credit.remaining_amount || 0), 0).toFixed(2))
}

export async function applyAvailableCreditsToInvoice({
  client,
  camperId,
  invoiceId,
  invoiceTotal,
  appliedBy,
}: {
  client: any
  camperId: string
  invoiceId: string
  invoiceTotal: number
  appliedBy?: string | null
}) {
  const startingTotal = Number(invoiceTotal || 0)

  if (!camperId || !invoiceId || startingTotal <= 0) {
    return { appliedTotal: 0, remainingDue: startingTotal, paidInFull: startingTotal <= 0 }
  }

  const { data: credits, error } = await client
    .from('account_credits')
    .select('*')
    .eq('camper_id', camperId)
    .eq('status', 'active')
    .gt('remaining_amount', 0)
    .order('created_at', { ascending: true })

  if (error?.code === '42P01' || error?.code === 'PGRST205') {
    return { appliedTotal: 0, remainingDue: startingTotal, paidInFull: false }
  }

  if (error) throw error

  let remainingDue = startingTotal
  let appliedTotal = 0
  const applications: any[] = []

  for (const credit of credits || []) {
    if (remainingDue <= 0) break

    const available = Number(credit.remaining_amount || 0)
    const amountApplied = Number(Math.min(available, remainingDue).toFixed(2))
    if (amountApplied <= 0) continue

    const newRemaining = Number((available - amountApplied).toFixed(2))

    const { error: creditError } = await client
      .from('account_credits')
      .update({
        remaining_amount: newRemaining,
        status: newRemaining <= 0 ? 'used' : 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', credit.id)

    if (creditError) throw creditError

    applications.push({
      credit_id: credit.id,
      camper_id: camperId,
      invoice_id: invoiceId,
      amount_applied: amountApplied,
      applied_by: appliedBy || null,
    })

    appliedTotal = Number((appliedTotal + amountApplied).toFixed(2))
    remainingDue = Number((remainingDue - amountApplied).toFixed(2))
  }

  if (applications.length > 0) {
    const { error: applicationError } = await client
      .from('account_credit_applications')
      .insert(applications)

    if (applicationError) throw applicationError

    const { error: itemError } = await client.from('invoice_items').insert({
      invoice_id: invoiceId,
      description: `Account credit applied - ${formatCreditMoney(appliedTotal)}`,
      quantity: 1,
      unit_price: -appliedTotal,
      total: -appliedTotal,
    })

    if (itemError) throw itemError

    const { error: invoiceError } = await client
      .from('invoices')
      .update({
        total_due: remainingDue,
        status: remainingDue <= 0 ? 'paid' : 'sent',
        ...(remainingDue <= 0
          ? {
              paid_at: new Date().toISOString(),
              payment_method: 'Account credit',
              payment_reference: `Credit applied: ${formatCreditMoney(appliedTotal)}`,
            }
          : {}),
      })
      .eq('id', invoiceId)

    if (invoiceError) throw invoiceError
  }

  return {
    appliedTotal,
    remainingDue,
    paidInFull: remainingDue <= 0,
  }
}

export async function restoreCreditsForDeletedInvoice(client: any, invoiceId: string) {
  if (!invoiceId) return { restoredTotal: 0 }

  const { data: applications, error } = await client
    .from('account_credit_applications')
    .select('*')
    .eq('invoice_id', invoiceId)

  if (error?.code === '42P01' || error?.code === 'PGRST205') return { restoredTotal: 0 }
  if (error) throw error

  let restoredTotal = 0

  for (const application of applications || []) {
    const amount = Number(application.amount_applied || 0)
    if (amount <= 0 || !application.credit_id) continue

    const { data: credit, error: creditLookupError } = await client
      .from('account_credits')
      .select('remaining_amount,original_amount,status')
      .eq('id', application.credit_id)
      .maybeSingle()

    if (creditLookupError) throw creditLookupError
    if (!credit || credit.status === 'voided') continue

    const restoredRemaining = Number(Math.min(
      Number(credit.original_amount || 0),
      Number(credit.remaining_amount || 0) + amount
    ).toFixed(2))

    const { error: updateError } = await client
      .from('account_credits')
      .update({
        remaining_amount: restoredRemaining,
        status: restoredRemaining > 0 ? 'active' : credit.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', application.credit_id)

    if (updateError) throw updateError
    restoredTotal = Number((restoredTotal + amount).toFixed(2))
  }

  if ((applications || []).length > 0) {
    const { error: deleteError } = await client
      .from('account_credit_applications')
      .delete()
      .eq('invoice_id', invoiceId)

    if (deleteError) throw deleteError
  }

  return { restoredTotal }
}
