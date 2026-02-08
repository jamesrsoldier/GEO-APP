import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { alerts } from '@/lib/db/schema';
import { requireProjectAccess, handleAuthError } from '@/lib/auth/helpers';

const createAlertSchema = z.object({
  alertType: z.enum([
    'visibility_drop',
    'visibility_increase',
    'new_citation',
    'lost_citation',
    'competitor_change',
    'negative_sentiment',
  ]),
  channel: z.enum(['email', 'in_app']).optional().default('in_app'),
  threshold: z.number().min(0).max(1).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    await requireProjectAccess(projectId);
    const db = getDb();

    const projectAlerts = await db
      .select({
        id: alerts.id,
        alertType: alerts.alertType,
        channel: alerts.channel,
        threshold: alerts.threshold,
        isEnabled: alerts.isEnabled,
        createdAt: alerts.createdAt,
      })
      .from(alerts)
      .where(eq(alerts.projectId, projectId));

    return Response.json(projectAlerts);
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    await requireProjectAccess(projectId);

    const body = await request.json();
    const data = createAlertSchema.parse(body);
    const db = getDb();

    const [created] = await db
      .insert(alerts)
      .values({
        projectId,
        alertType: data.alertType,
        channel: data.channel,
        threshold: data.threshold ?? null,
      })
      .returning();

    return Response.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400 }
      );
    }
    return handleAuthError(error);
  }
}
