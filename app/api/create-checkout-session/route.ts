import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Checkout route is ready.',
  })
}

export async function POST(req: Request) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const body = await req.json();
const successUrl = body.success_url
const cancelUrl = body.cancel_url
    const items = Array.isArray(body.items) ? body.items : []
    const invoiceIds = Array.isArray(body.invoiceIds) ? body.invoiceIds : []

    const lineItems = items.map((item: any) => ({
      price_data: {
        currency: item.currency || 'usd',
        product_data: {
          name: item.name || 'Invoice Payment',
        },
  unit_amount: Number(item.amount || 0),
      },
      quantity: item.quantity || 1,
    }))

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: successUrl,
cancel_url: cancelUrl,
      metadata: {
        invoice_ids: JSON.stringify(invoiceIds),
      },
    });

    return NextResponse.json({
  success: true,
  id: session.id,
  url: session.url,
});
  } catch (error: any) {
    console.error('STRIPE ERROR:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
