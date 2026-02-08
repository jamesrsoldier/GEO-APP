import { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { alertEvents, alerts } from '@/lib/db/schema';
import { requireProjectAccess, handleAuthError } from '@/lib/auth/helpers';

const updateEventSchema = z.object({
  isRead: z.literal(true),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; eventId: string } }
) {
  try {
    const { projectId, eventId } = params;
    await requireProjectAccess(projectId);

    const body = await request.json();
    updateEventSchema.parse(body);

    const db = getDb();

    // Verify event belongs to project
    const [existing] = await db
      .select()
      .from(alertEvents)
      .where(
        and(eq(alertEvents.id, eventId), eq(alertEvents.projectId, projectId))
      )
      .limit(1);

    if (!existing) {
      return Response.json({ error: 'Alert event not found' }, { status: 404 });
    }

    const [updated] = await db
      .update(alertEvents)
      .set({ isRead: true })
      .where(eq(alertEvents.id, eventId))
      .returning({
        id: alertEvents.id,
        title: alertEvents.title,
        description: alertEvents.description,
        isRead: alertEvents.isRead,
        createdAt: alertEvents.createdAt,
      });

    // Get the alert type
    const [alert] = await db
      .select({ alertType: alerts.alertType })
      .from(alerts)
      .where(eq(alerts.id, existing.alertId))
      .limit(1);

    return Response.json({
      ...updated,
      alertType: alert?.alertType,
      createdAt: updated.createdAt.toISOString(),
    });
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
