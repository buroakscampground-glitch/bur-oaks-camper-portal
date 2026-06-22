export type CheckoutItem = {
  name: string;
  amount: number;
  quantity: number;
  currency?: string;
};

export async function createCheckoutSession(
  items: CheckoutItem[],
  successUrl: string,
  cancelUrl: string,
  invoiceIds: string[] = []
) {
  const { supabase } = await import('./supabase')
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token

  if (!token) {
    throw new Error('Please sign in again before paying an invoice.')
  }

  const response = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      invoiceIds,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
  throw new Error(JSON.stringify(data, null, 2))
}

if (!data.id || !data.url) {
  throw new Error(JSON.stringify(data, null, 2));
}

  return data;
}

export async function checkoutItems(
  items: CheckoutItem[],
  successUrl: string,
  cancelUrl: string,
  invoiceIds: string[] = []
) {
  const session = await createCheckoutSession(items, successUrl, cancelUrl, invoiceIds);

  if (!session.url) {
    throw new Error('Stripe session URL is missing.');
  }

  window.location.href = session.url;
}
