import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: Request) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const body = await req.json();

    const items = Array.isArray(body.items) ? body.items : []
    const invoiceIds = Array.isArray(body.invoiceIds) ? body.invoiceIds : []

    const lineItems = items.map((item: any) => ({
      price_data: {
        currency: item.currency || 'usd',
        product_data: {
          name: item.name || 'Invoice Payment',
        },
        unit_amount: Math.round(Number(item.amount || 0) * 100),
      },
      quantity: item.quantity || 1,
    }))

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/success`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/cancel`,
      metadata: {
        invoice_ids: JSON.stringify(invoiceIds),
      },
    });

    return NextResponse.json({
      success: true,
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
