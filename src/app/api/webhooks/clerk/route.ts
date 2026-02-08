import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

interface ClerkUserEvent {
  data: {
    id: string;
    email_addresses: { email_address: string; id: string }[];
    primary_email_address_id: string;
    first_name: string | null;
    last_name: string | null;
    image_url: string | null;
  };
  type: string;
}

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get('svix-id');
  const svixTimestamp = headerPayload.get('svix-timestamp');
  const svixSignature = headerPayload.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing svix headers' },
      { status: 400 }
    );
  }

  const body = await req.text();

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: ClerkUserEvent;

  try {
    evt = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkUserEvent;
  } catch {
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 400 }
    );
  }

  const db = getDb();
  const { type, data } = evt;

  const primaryEmail = data.email_addresses.find(
    (e) => e.id === data.primary_email_address_id
  );
  const email = primaryEmail?.email_address || data.email_addresses[0]?.email_address;

  switch (type) {
    case 'user.created': {
      if (!email) {
        return NextResponse.json(
          { error: 'No email found for user' },
          { status: 400 }
        );
      }

      // Idempotent: check if user already exists
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.clerkId, data.id))
        .limit(1);

      if (!existing) {
        await db.insert(users).values({
          clerkId: data.id,
          email,
          firstName: data.first_name,
          lastName: data.last_name,
          imageUrl: data.image_url,
        });
      }
      break;
    }

    case 'user.updated': {
      await db
        .update(users)
        .set({
          email: email || undefined,
          firstName: data.first_name,
          lastName: data.last_name,
          imageUrl: data.image_url,
          updatedAt: new Date(),
        })
        .where(eq(users.clerkId, data.id));
      break;
    }

    case 'user.deleted': {
      await db
        .delete(users)
        .where(eq(users.clerkId, data.id));
      break;
    }
  }

  return NextResponse.json({ received: true });
}
