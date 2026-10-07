export type CheckoutItem = {
  name: string;
  amount: number;
  quantity: number;
  currency?: string;
};

export type InvoicePaymentMethod = 'card' | 'ach';
export type ExtraPaymentDestination = 'lot_rent' | 'general';

export type ExtraPaymentOptions = {
  amountCents: number;
  destination: ExtraPaymentDestination;
};

export async function createCheckoutSession(
  items: CheckoutItem[],
  successUrl: string,
  cancelUrl: string,
  invoiceIds: string[] = [],
  paymentMethod: InvoicePaymentMethod = 'card',
  extraPayment?: ExtraPaymentOptions,
) {
  const { supabase } = await import('./supabase')
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token

  if (!token) {
    throw new Error('Please sign in again before paying an invoice.')
  }

  let response: Response

  try {
    response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        invoiceIds,
        paymentMethod,
        extraPayment,
      }),
    })
  } catch {
    throw new Error('Secure checkout did not open. No payment details were entered. Wait a moment and try again; repeated attempts reuse the same protected checkout.')
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Secure checkout could not be opened. Check the invoice status before trying again.')
  }

  if (!data.id || !data.url) {
    throw new Error('Stripe did not return a secure checkout link. Check the invoice status before trying again.')
  }

  return data
}

export async function checkoutItems(
  items: CheckoutItem[],
  successUrl: string,
  cancelUrl: string,
  invoiceIds: string[] = [],
  paymentMethod: InvoicePaymentMethod = 'card',
  extraPayment?: ExtraPaymentOptions,
) {
  const session = await createCheckoutSession(items, successUrl, cancelUrl, invoiceIds, paymentMethod, extraPayment);

  if (!session.url) {
    throw new Error('Stripe session URL is missing.');
  }

  window.location.href = session.url;
}
