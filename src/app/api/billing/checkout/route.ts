import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUser, getOrCreateOrg, AuthError } from '@/lib/auth/helpers';
import { createCheckoutSession, tierToPriceId } from '@/lib/billing/stripe';

const checkoutSchema = z.object({
  tier: z.enum(['starter', 'growth']),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const org = await getOrCreateOrg(user.id);
    if (!org) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const priceId = tierToPriceId(parsed.data.tier);
    if (!priceId) {
      return NextResponse.json(
        { error: 'Price not configured for this tier' },
        { status: 400 }
      );
    }

    const session = await createCheckoutSession({
      organizationId: org.id,
      priceId,
      customerEmail: user.email,
      customerId: org.stripeCustomerId || undefined,
    });

    return NextResponse.json({ checkoutUrl: session.url });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Checkout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
