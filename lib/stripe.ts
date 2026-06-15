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
  const response = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items,
      invoiceIds,
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
  console.error('FULL STRIPE ERROR:', data)
  throw new Error(JSON.stringify(data, null, 2))
}

  console.log('Stripe Response:', data);

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
