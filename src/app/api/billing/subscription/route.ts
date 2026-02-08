import { NextResponse } from 'next/server';
import { getAuthUser, getOrCreateOrg, AuthError } from '@/lib/auth/helpers';
import { stripe as stripeClient } from '@/lib/billing/stripe';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const org = await getOrCreateOrg(user.id);
    if (!org) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }

    let currentPeriodEnd: string | null = null;

    if (org.stripeSubscriptionId && stripeClient) {
      try {
        const subscription = await stripeClient.subscriptions.retrieve(
          org.stripeSubscriptionId
        );
        const firstItem = subscription.items.data[0];
        if (firstItem) {
          currentPeriodEnd = new Date(
            firstItem.current_period_end * 1000
          ).toISOString();
        }
      } catch {
        // Subscription may have been deleted on Stripe's side
      }
    }

    return NextResponse.json({
      tier: org.subscriptionTier,
      status: org.subscriptionStatus,
      currentPeriodEnd,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Subscription error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
