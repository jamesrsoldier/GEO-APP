import { NextResponse } from 'next/server';
import { getAuthUser, getOrCreateOrg, AuthError } from '@/lib/auth/helpers';
import { createPortalSession } from '@/lib/billing/stripe';

export async function POST() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const org = await getOrCreateOrg(user.id);
    if (!org) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }

    if (!org.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No active subscription' },
        { status: 400 }
      );
    }

    const session = await createPortalSession(org.stripeCustomerId);
    return NextResponse.json({ portalUrl: session.url });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Portal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
