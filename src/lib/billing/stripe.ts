import Stripe from 'stripe';
import type { SubscriptionTier } from '@/types';

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

function getStripe(): Stripe {
  if (!stripe) throw new Error('Stripe not configured. Set STRIPE_SECRET_KEY env var.');
  return stripe;
}

/** Map Stripe price ID to our subscription tier */
export function priceIdToTier(priceId: string): SubscriptionTier {
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return 'starter';
  if (priceId === process.env.STRIPE_GROWTH_PRICE_ID) return 'growth';
  return 'free';
}

/** Map tier to Stripe price ID */
export function tierToPriceId(tier: SubscriptionTier): string | null {
  if (tier === 'starter') return process.env.STRIPE_STARTER_PRICE_ID || null;
  if (tier === 'growth') return process.env.STRIPE_GROWTH_PRICE_ID || null;
  return null;
}

/** Map Stripe subscription status to our enum */
export function mapStripeStatus(
  status: Stripe.Subscription.Status
): 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete' {
  switch (status) {
    case 'active': return 'active';
    case 'past_due': return 'past_due';
    case 'canceled': return 'canceled';
    case 'trialing': return 'trialing';
    case 'incomplete': return 'incomplete';
    case 'incomplete_expired': return 'incomplete';
    case 'unpaid': return 'past_due';
    default: return 'active';
  }
}

/** Create a Checkout session for upgrading */
export async function createCheckoutSession(params: {
  organizationId: string;
  priceId: string;
  customerEmail: string;
  customerId?: string;
}) {
  const s = getStripe();
  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer: params.customerId || undefined,
    customer_email: params.customerId ? undefined : params.customerEmail,
    line_items: [{ price: params.priceId, quantity: 1 }],
    metadata: { organizationId: params.organizationId },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing?canceled=true`,
  });
  return session;
}

/** Create a Customer Portal session for managing subscription */
export async function createPortalSession(customerId: string) {
  const s = getStripe();
  const session = await s.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing`,
  });
  return session;
}
