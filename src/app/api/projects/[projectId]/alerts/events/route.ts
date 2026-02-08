import { NextRequest } from 'next/server';
import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { alertEvents, alerts } from '@/lib/db/schema';
import { requireProjectAccess, handleAuthError } from '@/lib/auth/helpers';
import type { AlertEventResponse } from '@/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    await requireProjectAccess(projectId);

    const searchParams = request.nextUrl.searchParams;
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const db = getDb();

    const conditions = [eq(alertEvents.projectId, projectId)];
    if (unreadOnly) {
      conditions.push(eq(alertEvents.isRead, false));
    }

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(alertEvents)
      .where(and(...conditions));

    const events = await db
      .select({
        id: alertEvents.id,
        alertType: alerts.alertType,
        title: alertEvents.title,
        description: alertEvents.description,
        isRead: alertEvents.isRead,
        createdAt: alertEvents.createdAt,
      })
      .from(alertEvents)
      .innerJoin(alerts, eq(alerts.id, alertEvents.alertId))
      .where(and(...conditions))
      .orderBy(desc(alertEvents.createdAt))
      .limit(limit)
      .offset(offset);

    const data: AlertEventResponse[] = events.map((e) => ({
      id: e.id,
      alertType: e.alertType as AlertEventResponse['alertType'],
      title: e.title,
      description: e.description,
      isRead: e.isRead,
      createdAt: e.createdAt.toISOString(),
    }));

    return Response.json({
      data,
      total: countResult?.count || 0,
      limit,
      offset,
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
