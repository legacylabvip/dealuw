import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;
      if (userId) {
        await supabase
          .from('profiles')
          .update({
            subscription_tier: 'pro',
            analysis_limit: 500,
            analysis_count: 0,
            stripe_subscription_id: session.subscription as string,
          })
          .eq('id', userId);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_subscription_id', subscription.id);

      if (profiles && profiles.length > 0) {
        await supabase
          .from('profiles')
          .update({
            subscription_tier: 'free',
            analysis_limit: 10,
            stripe_subscription_id: null,
          })
          .eq('id', profiles[0].id);
      }
      break;
    }

    case 'invoice.paid': {
      // Reset monthly analysis count on successful payment
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId);

      if (profiles && profiles.length > 0) {
        await supabase
          .from('profiles')
          .update({ analysis_count: 0 })
          .eq('id', profiles[0].id);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
