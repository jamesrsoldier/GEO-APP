import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { alerts } from '@/lib/db/schema';
import { requireProjectAccess, handleAuthError } from '@/lib/auth/helpers';

const updateAlertSchema = z.object({
  isEnabled: z.boolean().optional(),
  threshold: z.number().min(0).max(1).optional(),
  channel: z.enum(['email', 'in_app']).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; alertId: string } }
) {
  try {
    const { projectId, alertId } = params;
    await requireProjectAccess(projectId);

    const body = await request.json();
    const data = updateAlertSchema.parse(body);
    const db = getDb();

    // Verify alert belongs to project
    const [existing] = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.id, alertId), eq(alerts.projectId, projectId)))
      .limit(1);

    if (!existing) {
      return Response.json({ error: 'Alert not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (data.isEnabled !== undefined) updateData.isEnabled = data.isEnabled;
    if (data.threshold !== undefined) updateData.threshold = data.threshold;
    if (data.channel !== undefined) updateData.channel = data.channel;

    if (Object.keys(updateData).length === 0) {
      return Response.json(existing);
    }

    const [updated] = await db
      .update(alerts)
      .set(updateData)
      .where(eq(alerts.id, alertId))
      .returning();

    return Response.json(updated);
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
