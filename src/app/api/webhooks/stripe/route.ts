import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getDb } from '@/lib/db';
import { organizations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { stripe as stripeClient, priceIdToTier, mapStripeStatus } from '@/lib/billing/stripe';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET || !stripeClient) {
    return NextResponse.json(
      { error: 'Stripe not configured' },
      { status: 500 }
    );
  }

  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripeClient.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
  } catch {
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 400 }
    );
  }

  const db = getDb();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const organizationId = session.metadata?.organizationId;

      if (!organizationId || !session.subscription || !session.customer) {
        break;
      }

      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id;
      const customerId = typeof session.customer === 'string'
        ? session.customer
        : session.customer.id;

      // Retrieve subscription to determine tier from price
      const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price.id;
      const tier = priceId ? priceIdToTier(priceId) : 'free';

      await db
        .update(organizations)
        .set({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          subscriptionTier: tier,
          subscriptionStatus: 'active',
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, organizationId));
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const subscriptionId = subscription.id;

      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.stripeSubscriptionId, subscriptionId))
        .limit(1);

      if (!org) break;

      const priceId = subscription.items.data[0]?.price.id;
      const tier = priceId ? priceIdToTier(priceId) : 'free';
      const status = mapStripeStatus(subscription.status);

      await db
        .update(organizations)
        .set({
          subscriptionTier: tier,
          subscriptionStatus: status,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, org.id));
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const subscriptionId = subscription.id;

      await db
        .update(organizations)
        .set({
          subscriptionTier: 'free',
          subscriptionStatus: 'canceled',
          updatedAt: new Date(),
        })
        .where(eq(organizations.stripeSubscriptionId, subscriptionId));
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;

      if (!customerId) break;

      await db
        .update(organizations)
        .set({
          subscriptionStatus: 'past_due',
          updatedAt: new Date(),
        })
        .where(eq(organizations.stripeCustomerId, customerId));
      break;
    }
  }

  return NextResponse.json({ received: true });
}
